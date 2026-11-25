// The toolbar icon's popup: the same overlay as in the pages, shown in the
// popup. It gets its model from the Spotify tab through the background (like
// the overlay in other tabs does) and sends clicks back. Below it, how
// Sonavia opens.
(() => {
  const V = globalThis.SOView;
  const SPOTIFY_URL = 'https://open.spotify.com/';
  const $ = (id) => document.getElementById(id);

  const style = document.createElement('style');
  style.textContent = V.STYLE;
  document.head.prepend(style); // popup.css (loaded after) adjusts it

  let port = null;
  let view = null;
  let model = null;
  let lyrics = null;
  let lyricsWasOpen = false;

  // ---- link to the background ---------------------------------------------------
  function connect() {
    port = chrome.runtime.connect({ name: 'popup' });
    port.onMessage.addListener((msg) => {
      if (msg?.type === 'model') {
        const m = msg.model;
        if ('lyrics' in m) lyrics = m.lyrics ?? null;
        m.lyrics = lyrics;
        m.receivedAt = Date.now();
        model = m;
        show();
      } else if (msg?.type === 'hide') {
        model = null;
        waiting();
      } else if (msg?.type === 'no-spotify') {
        noSpotify();
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
    });
  }

  function forward(name, arg) {
    try {
      port?.postMessage({ type: 'action', name, arg: arg ?? null });
    } catch {
      port = null;
    }
  }

  function onAction(name, arg) {
    if (name === 'close') return window.close();
    if (name === 'popout' || name === 'popin') return; // not from the popup
    // Instant feedback for purely visual toggles; Spotify's tab confirms them.
    if (model?.ui) {
      const ui = { ...model.ui };
      if (name === 'lyrics') ui.lyricsOpen = !ui.lyricsOpen;
      else if (name === 'study') ui.study = true;
      else if (name === 'unstudy') ui.study = false;
      else if (name === 'focus-enter') Object.assign(ui, { focus: true, study: false });
      else if (name === 'focus-exit') Object.assign(ui, { focus: false, tasksOpen: false, timerOpen: false });
      else if (name === 'focus-tasks') Object.assign(ui, { tasksOpen: !ui.tasksOpen, timerOpen: false });
      else if (name === 'focus-timer') Object.assign(ui, { timerOpen: !ui.timerOpen, tasksOpen: false });
      model = { ...model, ui };
    }
    forward(name, arg);
    if (name === 'desktop') setTimeout(() => window.close(), 150);
  }

  // ---- what the popup shows -------------------------------------------------------
  function show() {
    $('empty').hidden = true;
    if (!view) view = V.mount(document, $('app'), { popup: true, mirror: true, onAction });
    frame();
  }

  function message(title, sub, button, onClick) {
    view?.destroy();
    view = null;
    const e = $('empty');
    e.hidden = false;
    e.querySelector('.e-title').textContent = title;
    e.querySelector('.e-sub').textContent = sub;
    const b = e.querySelector('.e-btn');
    b.hidden = !button;
    b.textContent = button || '';
    b.onclick = onClick || null;
  }

  function waiting() {
    message('Connecting to Spotify…', '');
  }

  /** No Spotify tab is talking to Sonavia: open one, or refresh the one there is. */
  async function noSpotify() {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: `${SPOTIFY_URL}*` });
    } catch {
      // no access: treat as none
    }
    if (model) return; // it answered meanwhile
    if (!tabs.length) {
      message('Spotify isn’t open', 'Sonavia plays through Spotify’s web player.', 'OPEN SPOTIFY', () => {
        chrome.tabs.create({ url: SPOTIFY_URL });
        window.close();
      });
    } else {
      const t = tabs[0];
      message('Refresh your Spotify tab', 'It was open before Sonavia was installed or updated.', 'REFRESH IT', () => {
        chrome.tabs.reload(t.id);
        window.close();
      });
    }
  }

  // ---- rendering (the same clock interpolation as the other tabs) ------------------
  function lineAt(m, at) {
    const L = m.lyrics;
    if (!L || !m.track || L.key !== m.track.key || !L.synced || !L.lines?.length) return m.lineIndex;
    const t = at + (L.globalOffsetMs || 0) + (L.offsetMs || 0);
    let lo = 0;
    let hi = L.lines.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (L.lines[mid].t <= t) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  function frame() {
    if (!model || !view) return;
    let p = model.positionMs + (model.isPlaying ? (Date.now() - model.receivedAt) * (model.rate || 1) : 0);
    if (model.durationMs) p = Math.min(p, model.durationMs);
    view.render({ ...model, positionMs: p, lineIndex: lineAt(model, p) });
    const open = Boolean(model.ui?.lyricsOpen && !model.ui?.study && !model.ui?.focus);
    if (open && !lyricsWasOpen) view.resetScroll();
    lyricsWasOpen = open;
  }
  setInterval(frame, 100);

  // ---- settings ---------------------------------------------------------------------
  async function loadSettings() {
    const s = await chrome.storage.local.get(['openMode', 'hoverOpen', 'allTabs']);
    $('mode').value = s.openMode || 'popup';
    $('hover').checked = Boolean(s.hoverOpen);
    $('alltabs').checked = s.allTabs !== false;
    $('set').querySelector('.page-only').hidden = $('mode').value !== 'page';
  }
  $('mode').addEventListener('change', () => {
    const openMode = $('mode').value;
    $('set').querySelector('.page-only').hidden = openMode !== 'page';
    chrome.storage.local.set({ openMode }).catch(() => {});
    // The background opens it that way in the Spotify tab; this popup has done its job.
    if (openMode !== 'popup') setTimeout(() => window.close(), 250);
  });
  $('hover').addEventListener('change', () => chrome.storage.local.set({ hoverOpen: $('hover').checked }).catch(() => {}));
  $('alltabs').addEventListener('change', () => chrome.storage.local.set({ allTabs: $('alltabs').checked }).catch(() => {}));

  loadSettings();
  waiting();
  connect();
})();
