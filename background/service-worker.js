// Sonavia — background brain.
// The Spotify tab reports the song + a playback anchor; we find lyrics, keep
// track of the active line, and push updates to any open overlay.
import { artId, findLyrics, fromSpotifyLyrics } from '../lib/lyrics.js';
import { LineClock } from '../lib/clock.js';
import { DEFAULT_SONG_PREFS, LyricsMemo, SongPrefs } from '../lib/store.js';
import { DEFAULTS, loadSettings, onSettingsChanged } from '../lib/settings.js';

const CLIENT = `Sonavia/${chrome.runtime.getManifest().version}`;
const SPOTIFY_URL = 'https://open.spotify.com/';
const RETRY_AFTER_MS = [5000, 15000, 45000, 120000];
const MAX_NUDGE_MS = 10000;

const memo = new LyricsMemo();
const songPrefs = new SongPrefs();
let cfg = { ...DEFAULTS };

// ---- current song state -----------------------------------------------------
let song = null; // { key, title, artist, album, durationMs, artUrl }
let generation = 0; // bumps on every song change; stale async work checks it
let found = null; // LRCLIB options; null while looking up
let fromSpotify = null; // Spotify's own lyrics option (opt-in)
let failed = false;
let attempts = 0;
let retryTimer = null;
let prefs = { ...DEFAULT_SONG_PREFS };
let shown; // the option currently on screen
let anchor = null;
let lineIndex = -1;

const overlays = new Set();
const clock = new LineClock((index) => {
  lineIndex = index;
  emit({ type: 'line', index });
});

function emit(msg) {
  for (const p of overlays) {
    try {
      p.postMessage(msg);
    } catch {
      overlays.delete(p);
    }
  }
}

const options = () => [fromSpotify, ...(found || [])].filter(Boolean);

function choose() {
  if (prefs.hidden) return null;
  const all = options();
  return all.find((o) => o.id === prefs.pick) || all[0] || null;
}

function describe() {
  const all = options();
  const c = shown ?? null;
  return {
    type: 'track',
    key: song.key,
    title: song.title,
    artist: song.artist,
    durationMs: song.durationMs,
    loading: found === null && !fromSpotify && !failed,
    error: failed ? 'network' : null,
    source: c?.source ?? null,
    synced: c?.synced ?? false,
    instrumental: Boolean(c?.instrumental),
    lines: c?.lines ?? [],
    offsetMs: prefs.offsetMs,
    globalOffsetMs: cfg.offsetMs,
    hidden: prefs.hidden,
    match: { index: c ? all.indexOf(c) : -1, count: all.length },
  };
}

/** Re-pick the lyrics to show and tell the overlays (track first, then line). */
function refresh() {
  if (!song) return;
  const next = choose();
  const changed = next !== shown;
  shown = next;
  emit(describe());
  clock.shiftMs = cfg.offsetMs + prefs.offsetMs;
  if (changed) {
    lineIndex = -1;
    clock.load(next?.lines ?? []);
  } else {
    clock.update();
  }
}

async function lookup(gen) {
  const s = song;
  if (cfg.spotifyProvider) {
    const cached = await memo.get(`spotify:${s.key}`);
    if (gen !== generation) return;
    if (cached) {
      fromSpotify = cached;
      refresh();
    }
  }
  let result = await memo.get(`lrclib:${s.key}`);
  if (gen !== generation) return;
  if (result === undefined) {
    try {
      result = await findLyrics(s, CLIENT);
    } catch (err) {
      if (gen !== generation) return;
      console.warn('[Sonavia] lyrics lookup failed:', err);
      failed = true;
      refresh();
      const wait = RETRY_AFTER_MS[Math.min(attempts++, RETRY_AFTER_MS.length - 1)];
      retryTimer = setTimeout(() => gen === generation && lookup(gen), wait);
      return;
    }
    if (gen !== generation) return;
    await memo.set(`lrclib:${s.key}`, result);
  }
  failed = false;
  attempts = 0;
  found = result;
  refresh();
}

function startSong(next) {
  song = next;
  const gen = ++generation;
  clearTimeout(retryTimer);
  found = null;
  fromSpotify = null;
  failed = false;
  attempts = 0;
  prefs = { ...DEFAULT_SONG_PREFS };
  shown = undefined;
  refresh();
  songPrefs.get(next.key).then((saved) => {
    if (gen !== generation) return;
    prefs = saved;
    refresh();
    lookup(gen);
  });
}

function stopSong() {
  song = null;
  generation++;
  clearTimeout(retryTimer);
  found = fromSpotify = null;
  shown = undefined;
  anchor = null;
  lineIndex = -1;
  clock.reset();
  emit({ type: 'clear' });
}

function onPlayback(msg) {
  if (!msg.track) return stopSong();
  if (msg.track.key !== song?.key) startSong(msg.track);
  anchor = msg.anchor;
  clock.setAnchor(anchor);
}

async function onSpotifyLyrics(msg) {
  if (!cfg.spotifyProvider || !song) return;
  // The payload names the cover art it belongs to; only accept it for ours.
  const id = artId(msg.image);
  if (!id || id !== artId(song.artUrl)) return;
  const option = fromSpotifyLyrics(msg.body, song.durationMs);
  if (!option) return;
  await memo.set(`spotify:${song.key}`, option);
  fromSpotify = option;
  refresh();
}

async function onCommand(cmd) {
  if (!song) return;
  const s = song;
  switch (cmd.action) {
    case 'offset':
      prefs.offsetMs = Math.max(-MAX_NUDGE_MS, Math.min(MAX_NUDGE_MS, prefs.offsetMs + (Number(cmd.deltaMs) || 0)));
      break;
    case 'offset-reset':
      prefs.offsetMs = 0;
      break;
    case 'next-match': {
      const all = options();
      prefs.hidden = false;
      if (all.length) prefs.pick = all[(all.indexOf(shown) + 1) % all.length].id;
      break;
    }
    case 'toggle-hidden':
      prefs.hidden = !prefs.hidden;
      break;
    case 'retry':
      await memo.drop(`lrclib:${s.key}`);
      await memo.drop(`spotify:${s.key}`);
      if (s !== song) return;
      clearTimeout(retryTimer);
      found = fromSpotify = null;
      failed = false;
      attempts = 0;
      refresh();
      lookup(generation);
      return;
    default:
      return;
  }
  await songPrefs.set(s.key, prefs);
  if (s === song) refresh();
}

// ---- connections --------------------------------------------------------------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'display') {
    overlays.add(port);
    if (song) {
      port.postMessage(describe());
      port.postMessage({ type: 'line', index: lineIndex });
    }
    port.onMessage.addListener((msg) => msg?.type === 'command' && onCommand(msg));
    port.onDisconnect.addListener(() => overlays.delete(port));
    return;
  }
  if (port.name !== 'spotify-tab') return;
  port.onMessage.addListener((msg) => {
    // With Spotify open in two places (a tab and the installed app, say), both
    // report the same song. Follow one: the one you used last, or the one
    // that is actually playing. Otherwise they'd fight over the lyrics state
    // and overlay clicks could land in the wrong tab.
    const startsPlaying = msg.type === 'playback' && msg.anchor?.playing && !tabPlaying;
    if (port !== tabPort && (!tabPort || startsPlaying || msg.type === 'desktop-open' || msg.type === 'mirror-model')) {
      tabPort = port;
      reportMirrorCount();
    }
    if (port !== tabPort) return;
    if (msg.type === 'playback') tabPlaying = Boolean(msg.anchor?.playing);
    if (msg.type === 'playback') onPlayback(msg);
    else if (msg.type === 'spotify-lyrics') onSpotifyLyrics(msg);
    else if (msg.type === 'desktop-open') openDesktop(port);
    else if (msg.type === 'desktop-model') appPort?.postMessage({ type: 'model', model: msg.model });
    else if (msg.type === 'desktop-close') closeDesktop();
    else if (msg.type === 'mirror-model') onMirrorModel(msg.model);
    else if (msg.type === 'mirror-hide') hideMirrors();
  });
  port.onDisconnect.addListener(() => {
    if (port === tabPort) {
      stopSong();
      tabPort = null;
      tabPlaying = false;
      closeDesktop(); // Spotify tab closed: the desktop overlay goes too
      hideMirrors();
    }
  });
});

// ---- overlay on every browser tab ("All tabs") ----------------------------------
// The Spotify tab streams its overlay model here; visible tabs connect as
// "mirror" ports (only while `mirrorLive` is set) and render it.
const mirrors = new Map(); // port -> lyrics object last sent to it
let mirrorModel = null; // latest model without lyrics
let mirrorLyrics = null;
let mirrorLive = false;

function setMirrorLive(on) {
  if (mirrorLive === on) return;
  mirrorLive = on;
  chrome.storage.local.set({ mirrorLive: on }).catch(() => {});
}
// A fresh background has no overlay to show until the Spotify tab says so.
chrome.storage.local.set({ mirrorLive: false }).catch(() => {});

function pushMirror(port) {
  if (!mirrorModel) return;
  const model = { ...mirrorModel };
  if (mirrors.get(port) !== mirrorLyrics) {
    model.lyrics = mirrorLyrics;
    mirrors.set(port, mirrorLyrics);
  }
  try {
    port.postMessage({ type: 'model', model });
  } catch {
    mirrors.delete(port);
  }
}

function onMirrorModel(model) {
  if ('lyrics' in model) mirrorLyrics = model.lyrics ?? null;
  mirrorModel = { ...model };
  delete mirrorModel.lyrics;
  setMirrorLive(true);
  for (const p of mirrors.keys()) pushMirror(p);
}

function hideMirrors() {
  mirrorModel = null;
  setMirrorLive(false);
  for (const p of mirrors.keys()) {
    try {
      p.postMessage({ type: 'hide' });
    } catch {
      mirrors.delete(p);
    }
  }
}

const reportMirrorCount = () => tabPort?.postMessage({ type: 'mirrors', count: mirrors.size });

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mirror') return;
  mirrors.set(port, undefined);
  reportMirrorCount();
  pushMirror(port);
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'action') tabPort?.postMessage({ type: 'mirror-action', name: msg.name, arg: msg.arg });
  });
  port.onDisconnect.addListener(() => {
    mirrors.delete(port);
    reportMirrorCount();
  });
});

// ---- the toolbar popup ------------------------------------------------------------
// With "Sonavia opens as: this popup", the toolbar icon opens popup/popup.html:
// the overlay in the popup. It gets the overlay's model like a tab does; while
// one is open, the Spotify tab runs the overlay for it ("popup-open").
const POPUP_PAGE = 'popup/popup.html';
const popups = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return;
  popups.add(port);
  mirrors.set(port, undefined);
  reportMirrorCount();
  if (tabPort) tabPort.postMessage({ type: 'popup-open' });
  else port.postMessage({ type: 'no-spotify' });
  pushMirror(port);
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'action') tabPort?.postMessage({ type: 'mirror-action', name: msg.name, arg: msg.arg });
  });
  port.onDisconnect.addListener(() => {
    popups.delete(port);
    mirrors.delete(port);
    reportMirrorCount();
    if (!popups.size) tabPort?.postMessage({ type: 'popup-closed' });
  });
});

/** The toolbar icon: the popup, or (no popup) a click that toggles the overlay. */
const applyOpenMode = (mode) => chrome.action.setPopup({ popup: mode === 'popup' ? POPUP_PAGE : '' }).catch(() => {});
chrome.storage.local.get('openMode').then((s) => applyOpenMode(s.openMode));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.openMode) return;
  const mode = changes.openMode.newValue;
  applyOpenMode(mode);
  // Switched away from the popup (in the popup): show it the new way now.
  if (changes.openMode.oldValue === 'popup' && mode && mode !== 'popup') tabPort?.postMessage({ type: 'show-overlay' });
});
// New installs open as the popup. An update keeps the overlay its user knows.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const s = await chrome.storage.local.get(['openMode', 'openInPip']);
  if (s.openMode) return;
  const openMode = reason === 'install' ? 'popup' : s.openInPip ? 'pip' : 'page';
  await chrome.storage.local.set({ openMode });
});

// ---- desktop overlay app (native messaging) ----------------------------------------
// Brave launches the app only when asked; it exits when this port closes.
const DESKTOP_HOST = 'com.sonavia.desktop';
let tabPort = null;
let tabPlaying = false; // whether the followed Spotify tab is playing
let appPort = null;

function openDesktop(port) {
  if (appPort) return;
  try {
    appPort = chrome.runtime.connectNative(DESKTOP_HOST);
  } catch (err) {
    port.postMessage({ type: 'desktop-closed', error: String(err?.message || err) });
    return;
  }
  const self = appPort;
  self.onMessage.addListener((msg) => {
    if (msg?.type === 'action') tabPort?.postMessage({ type: 'desktop-action', name: msg.name, arg: msg.arg });
  });
  self.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || null;
    if (appPort === self) appPort = null;
    tabPort?.postMessage({ type: 'desktop-closed', error });
  });
}

function closeDesktop() {
  const p = appPort;
  appPort = null;
  p?.disconnect();
}

// Toolbar icon: toggle the overlay in the Spotify tab (open Spotify if needed).
chrome.action.onClicked.addListener(async (tab) => {
  let target = tab?.url?.startsWith(SPOTIFY_URL) ? tab : null;
  if (!target) [target] = await chrome.tabs.query({ url: `${SPOTIFY_URL}*` });
  if (!target) {
    await chrome.tabs.create({ url: SPOTIFY_URL });
    return;
  }
  const prefs = await chrome.storage.local.get(['openMode', 'allTabs']);
  const showsHere = (prefs.openMode || 'page') === 'page' && prefs.allTabs !== false;
  if (!showsHere || target.id === tab?.id) {
    await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
  }
  // Fails only if the tab was opened before the extension loaded (refresh it).
  chrome.tabs.sendMessage(target.id, { type: 'toggle-overlay' }).catch(() => {});
});

// ---- settings ---------------------------------------------------------------------
function applySettings(next) {
  const spotifyJustEnabled = next.spotifyProvider && !cfg.spotifyProvider;
  cfg = next;
  if (!cfg.spotifyProvider) fromSpotify = null;
  refresh();
  if (spotifyJustEnabled && song) lookup(generation);
}

loadSettings().then(applySettings);
onSettingsChanged(applySettings);
