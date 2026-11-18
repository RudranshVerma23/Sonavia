// Runs in the open.spotify.com tab (isolated world).
//  1. Reads what is playing from the Web Player and streams it to the service
//     worker, which resolves and times the lyrics.
//  2. Adds a launch button to Spotify's player bar (next to the Lyrics button).
//  3. Shows the overlay — in the page, or popped out into an always-on-top
//     Picture-in-Picture window. It never opens by itself.
(() => {
  if (window.__sonaviaLoaded) return;
  window.__sonaviaLoaded = true;

  const D = globalThis.SO_DOM;
  const V = globalThis.SOView;

  const POLL_MS = 250;
  const RESYNC_MS = 10000; // also keeps the service worker alive
  const SEEK_TOLERANCE_MS = 1200;
  const MOVING_WINDOW_MS = 1600;
  const BUTTON_ID = 'sonavia-launch';
  const HOST_ID = 'sonavia-host';
  const CARD_W = 400;
  const PANEL_H = 360 + 6; // lyrics panel + gap

  let dead = false;
  let timer = null;

  // ======================================================================
  // 1. Playback position
  // Spotify's elapsed-time label ("1:23") changes exactly when a new second
  // starts. We watch it and anchor on that moment, which gives sub-second
  // precision without touching Spotify's internals.
  // ======================================================================
  let port = null;
  let clockEl = null;
  let clockObserver = null;
  /** Last second boundary seen: position `ms` at wall time `at`. */
  let tick = null;
  let lastTickAt = 0;
  let wasPlaying = null;
  let pausedAt = null; // frozen position while paused
  let pendingKey = null;
  let sentKey = null;
  let sentAnchor = null;
  let sentAt = 0;
  let missingSince = 0;

  function onClockChange() {
    const ms = D.readClockPositionMs();
    if (ms === null || (tick && tick.ms === ms)) return;
    const now = Date.now();
    // The very first reading is somewhere inside a second, not on its edge.
    tick = { ms, at: now, onEdge: clockObserver !== null && tick !== null };
    lastTickAt = now;
    if (wasPlaying === false) pausedAt = ms; // seeked while paused
  }

  function watchClock() {
    const el = D.$(D.SEL.position);
    if (el === clockEl) return;
    clockObserver?.disconnect();
    clockObserver = null;
    clockEl = el;
    tick = null;
    if (!el) return;
    onClockChange();
    clockObserver = new MutationObserver(onClockChange);
    clockObserver.observe(el, { characterData: true, childList: true, subtree: true });
  }

  function isPlayingNow(now) {
    const fromButton = D.readIsPlaying();
    return fromButton === null ? now - lastTickAt < 1600 : fromButton;
  }

  function livePosition(now) {
    if (!tick) {
      const ms = D.readClockPositionMs();
      return ms === null ? null : ms + 500;
    }
    return tick.ms + (tick.onEdge ? 0 : 500) + (now - tick.at);
  }

  /** Best estimate of { pos, playing } right now. */
  function estimate(now) {
    const playing = isPlayingNow(now);
    if (playing !== wasPlaying) {
      if (wasPlaying === true && !playing) pausedAt = livePosition(now);
      if (wasPlaying === false && playing && pausedAt !== null) tick = { ms: pausedAt, at: now, onEdge: true };
      if (playing) pausedAt = null;
      wasPlaying = playing;
    }
    let pos = playing ? livePosition(now) : pausedAt ?? D.readClockPositionMs();
    if (pos === null) return null;
    const dur = D.readDurationMs();
    if (dur) pos = Math.min(pos, dur);
    return { pos: Math.max(0, pos), playing };
  }

  const projected = (a, now) => a.pos + (a.playing ? now - a.at : 0);

  function send(msg) {
    if (dead) return;
    if (!port) connect();
    try {
      port?.postMessage(msg);
    } catch {
      port = null;
    }
  }

  function connect() {
    try {
      port = chrome.runtime.connect({ name: 'spotify-tab' });
    } catch {
      return shutdown();
    }
    port.onMessage.addListener(onBackgroundMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      sentKey = null; // background restarted: resend everything
      sentAnchor = null;
      mirrorSentLyrics = undefined;
      mirrorCount = 0;
      if (ov?.where === 'desktop') desktopGone(null); // the app's link went with it
    });
  }

  function report() {
    const now = Date.now();
    watchClock();
    const track = D.readTrack();
    if (!track) {
      if (sentKey && !missingSince) missingSince = now;
      if (sentKey && now - missingSince > 2000) {
        send({ type: 'playback', track: null });
        sentKey = null;
        sentAnchor = null;
      }
      return;
    }
    missingSince = 0;
    if (track.key !== sentKey && pendingKey !== track.key) {
      pendingKey = track.key; // see a new song twice before announcing it
      return;
    }
    pendingKey = null;
    const est = estimate(now);
    if (!est) return;
    const anchor = { pos: est.pos, at: now, playing: est.playing };
    const changed =
      track.key !== sentKey ||
      !sentAnchor ||
      anchor.playing !== sentAnchor.playing ||
      Math.abs(projected(sentAnchor, now) - anchor.pos) > 350 ||
      now - sentAt > 10000; // heartbeat keeps the background awake
    if (!changed) return;
    send({ type: 'playback', track, anchor });
    sentKey = track.key;
    sentAnchor = anchor;
    sentAt = now;
  }

  // ======================================================================
  // Settings & persisted UI state
  // ======================================================================
  const settings = { spotifyProvider: false };
  const prefs = { openMode: 'page', pos: null, allTabs: true }; // openMode: 'page' | 'pip' | 'desktop'
  const ui = {
    page: 0,
    study: false,
    lyricsOpen: false,
    keepExpanded: false,
    width: 400,
    scale: 1, // size of the whole overlay (corner handles)
    focus: false, // focus mode tile instead of the player card
    tasksOpen: false, // Tasks & Goals panel (focus mode)
    timerOpen: false, // timer lengths panel (focus mode)
  };

  chrome.storage.sync.get('spotifyProvider').then((s) => {
    settings.spotifyProvider = Boolean(s.spotifyProvider);
    pushConfigToPage();
  });
  chrome.storage.local.get(['openMode', 'openInPip', 'overlayPos', 'overlayUi', 'allTabs']).then((s) => {
    prefs.openMode = s.openMode || (s.openInPip ? 'pip' : 'page');
    prefs.allTabs = s.allTabs !== false;
    prefs.pos = s.overlayPos || null;
    if (s.overlayUi) {
      Object.assign(ui, {
        study: Boolean(s.overlayUi.study),
        lyricsOpen: Boolean(s.overlayUi.lyricsOpen),
        keepExpanded: Boolean(s.overlayUi.keepExpanded),
        width: Math.max(400, Number(s.overlayUi.width) || 400),
        scale: Math.max(0.7, Math.min(1.6, Number(s.overlayUi.scale) || 1)),
        focus: Boolean(s.overlayUi.focus),
        tasksOpen: Boolean(s.overlayUi.tasksOpen),
      });
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    // The overlay was dragged in another tab: follow it.
    if (area === 'local' && changes.overlayPos && ov?.where === 'page' && !dragging) {
      prefs.pos = changes.overlayPos.newValue || null;
      if (prefs.pos) {
        ov.host.style.left = `${prefs.pos.left}px`;
        ov.host.style.top = `${prefs.pos.top}px`;
        clampHost();
      }
    }
    if (area === 'sync' && 'spotifyProvider' in changes) {
      settings.spotifyProvider = Boolean(changes.spotifyProvider.newValue);
      pushConfigToPage();
      renderNow();
    }
  });
  const saveUi = () =>
    chrome.storage.local
      .set({
        overlayUi: {
          study: ui.study,
          lyricsOpen: ui.lyricsOpen,
          keepExpanded: ui.keepExpanded,
          width: ui.width,
          scale: ui.scale,
          focus: ui.focus,
          tasksOpen: ui.tasksOpen,
        },
      })
      .catch(() => {});

  // ======================================================================
  // Focus mode: a focus / break timer plus a small task list.
  // The timer is stored as wall-clock times (endsAt), so every tab, the popup
  // and the desktop app show the same countdown without extra messages.
  // ======================================================================
  const FOCUS_DEFAULT = {
    phase: 'focus', // 'focus' | 'break'
    status: 'idle', // 'idle' | 'running' | 'paused' | 'prompt' (asking "continue session?")
    endsAt: 0, // while running
    remainingMs: 25 * 60000, // while idle / paused / prompt
    promptUntil: 0,
    focusMin: 25,
    breakMin: 5,
    chime: true,
  };
  const PROMPT_MS = 5000;
  let focus = { ...FOCUS_DEFAULT };
  let tasks = []; // { id, text, done, prio: 'low' | 'medium' | 'high' }
  let activeTask = null;

  chrome.storage.local.get(['focus', 'focusTasks', 'focusActive']).then((s) => {
    focus = { ...FOCUS_DEFAULT, ...s.focus };
    tasks = Array.isArray(s.focusTasks) ? s.focusTasks : [];
    activeTask = s.focusActive ?? null;
  });
  const saveFocus = () => chrome.storage.local.set({ focus }).catch(() => {});
  const saveTasks = () => chrome.storage.local.set({ focusTasks: tasks, focusActive: activeTask }).catch(() => {});

  const phaseMs = (phase) => (phase === 'break' ? focus.breakMin : focus.focusMin) * 60000;
  const remainingNow = () => (focus.status === 'running' ? Math.max(0, focus.endsAt - Date.now()) : focus.remainingMs);

  function setPhase(phase, status) {
    focus.phase = phase;
    focus.status = status;
    focus.remainingMs = phaseMs(phase);
    focus.endsAt = status === 'running' ? Date.now() + focus.remainingMs : 0;
    focus.promptUntil = 0;
  }

  /** Soft two-note chime when a focus or break period ends. */
  function chime() {
    if (!focus.chime) return;
    try {
      const ctx = new AudioContext();
      const notes = focus.phase === 'break' ? [660, 880] : [880, 660];
      notes.forEach((hz, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.22;
        osc.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1500);
    } catch {
      // no audio available; the switch is still visible
    }
  }

  /** Runs with the main poll: ends periods and unanswered prompts on time. */
  function focusTick() {
    const now = Date.now();
    if (focus.status === 'prompt' && now >= focus.promptUntil) {
      setPhase('break', 'running'); // no answer: take the break
      saveFocus();
      renderNow();
    } else if (focus.status === 'running' && now >= focus.endsAt) {
      if (focus.phase === 'focus') setPhase('break', 'running');
      else setPhase('focus', 'idle');
      chime();
      saveFocus();
      renderNow();
    }
  }

  function focusModel() {
    return { ...focus, tasks, activeTask };
  }

  /** @returns {boolean} whether the action was a focus-mode action */
  function focusAction(action, arg) {
    const now = Date.now();
    switch (action) {
      case 'focus-enter':
        ui.focus = true;
        ui.study = false;
        saveUi();
        return true;
      case 'focus-exit':
        ui.focus = false;
        ui.tasksOpen = ui.timerOpen = false;
        saveUi();
        return true;
      case 'focus-tasks':
        ui.tasksOpen = !ui.tasksOpen;
        if (ui.tasksOpen) ui.timerOpen = false;
        saveUi();
        return true;
      case 'focus-timer':
        ui.timerOpen = !ui.timerOpen;
        if (ui.timerOpen) ui.tasksOpen = false;
        return true;
      case 'focus-play': // start / pause / resume / "yes, continue"
        if (focus.status === 'running') {
          focus.remainingMs = remainingNow();
          focus.status = 'paused';
        } else {
          focus.status = 'running';
          focus.endsAt = now + focus.remainingMs;
          focus.promptUntil = 0;
        }
        break;
      case 'focus-next':
        if (focus.phase === 'break') setPhase('focus', 'idle');
        else if (focus.status === 'prompt') setPhase('break', 'running');
        else {
          focus.remainingMs = remainingNow();
          focus.status = 'prompt';
          focus.promptUntil = now + PROMPT_MS;
        }
        break;
      case 'focus-stop':
        setPhase('focus', 'idle');
        break;
      case 'focus-len': {
        const key = arg?.which === 'break' ? 'breakMin' : 'focusMin';
        const step = key === 'breakMin' ? 1 : 5;
        const [min, max] = key === 'breakMin' ? [1, 60] : [5, 180];
        focus[key] = Math.max(min, Math.min(max, focus[key] + (arg?.delta > 0 ? step : -step)));
        // an unstarted timer follows the new length right away
        if (focus.status === 'idle' && (key === 'breakMin') === (focus.phase === 'break')) focus.remainingMs = phaseMs(focus.phase);
        break;
      }
      case 'focus-chime':
        focus.chime = !focus.chime;
        break;
      case 'task-add': {
        const text = String(arg || '').trim().slice(0, 120);
        if (!text) return true;
        tasks.push({ id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, done: false, prio: 'medium' });
        if (!activeTask) activeTask = tasks[tasks.length - 1].id;
        saveTasks();
        return true;
      }
      case 'task-toggle': {
        const t = tasks.find((x) => x.id === arg);
        if (t) t.done = !t.done;
        saveTasks();
        return true;
      }
      case 'task-del':
        tasks = tasks.filter((x) => x.id !== arg);
        if (activeTask === arg) activeTask = null;
        saveTasks();
        return true;
      case 'task-prio': {
        const t = tasks.find((x) => x.id === arg);
        const order = ['low', 'medium', 'high'];
        if (t) t.prio = order[(order.indexOf(t.prio) + 1) % order.length];
        saveTasks();
        return true;
      }
      case 'task-active':
        activeTask = activeTask === arg ? null : arg;
        saveTasks();
        return true;
      default:
        return false;
    }
    saveFocus();
    return true;
  }

  // Spotify lyrics bridge (opt-in): the MAIN-world script forwards the lyrics
  // response Spotify's own player downloads.
  function pushConfigToPage() {
    window.postMessage({ source: 'sonavia-content', type: 'config', spotifyProvider: settings.spotifyProvider }, location.origin);
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source !== 'sonavia-main' || data.type !== 'spotify-lyrics' || !settings.spotifyProvider) return;
    send({ type: 'spotify-lyrics', trackId: data.trackId, image: data.image, body: data.body });
  });

  // ======================================================================
  // 2. Launch button in Spotify's player bar
  // ======================================================================
  function ensureButton() {
    const anchor = D.SEL.buttonAnchor.map((sel) => D.$(sel)).find(Boolean);
    let button = document.getElementById(BUTTON_ID);
    if (button && anchor && button.nextElementSibling === anchor) return;
    if (!anchor?.parentElement) return;
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.title = 'Sonavia — floating player & lyrics for Spotify';
      button.setAttribute('aria-label', 'Open Sonavia');
      button.style.cssText =
        'all:unset;position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;' +
        'flex:none;border-radius:50%;cursor:pointer;color:#b3b3b3;transition:color .15s, transform .1s;';
      button.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<path d="M19.09 6.46A9 9 0 1 1 11.69 3"/><circle cx="15.66" cy="3.78" r="1.5" fill="currentColor" stroke="none"/>' +
        '<path d="M8.6 10v4.6M12 8.4v7.8M15.4 9.2v6.2"/></svg>' +
        '<span style="position:absolute;bottom:0;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:#1ed760;display:none"></span>';
      button.addEventListener('mouseenter', () => (button.style.color = '#fff'));
      button.addEventListener('mouseleave', paintButton);
      button.addEventListener('mousedown', () => (button.style.transform = 'scale(.92)'));
      button.addEventListener('mouseup', () => (button.style.transform = ''));
      button.addEventListener('click', () => toggleOverlay(true));
    }
    anchor.parentElement.insertBefore(button, anchor);
    paintButton();
  }

  function paintButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    button.style.color = ov ? '#1ed760' : '#b3b3b3';
    button.lastElementChild.style.display = ov ? 'block' : 'none';
  }

  // ======================================================================
  // 3. Overlay
  // ======================================================================
  /** @type {null | {where:'page'|'pip', view:any, host?:HTMLElement, win?:Window, ticker?:number}} */
  let ov = null;
  let displayPort = null;
  const lyr = { track: null, line: null };

  function connectDisplay() {
    if (displayPort || dead || !ov) return;
    try {
      displayPort = chrome.runtime.connect({ name: 'display' });
    } catch {
      return shutdown();
    }
    displayPort.onMessage.addListener(onDisplayMessage);
    displayPort.onDisconnect.addListener(() => {
      displayPort = null;
      setTimeout(connectDisplay, 500); // service worker restarted
    });
  }

  function disconnectDisplay() {
    const p = displayPort;
    displayPort = null;
    p?.disconnect();
  }

  function onDisplayMessage(msg) {
    switch (msg?.type) {
      case 'track':
        if (lyr.track?.key !== msg.key || lyr.track?.match?.index !== msg.match?.index) lyr.line = null;
        lyr.track = msg;
        break;
      case 'line':
        lyr.line = msg;
        break;
      case 'clear':
        lyr.track = lyr.line = null;
        break;
      default:
        return;
    }
    renderNow();
  }

  function sendCommand(cmd) {
    displayPort?.postMessage({ type: 'command', ...cmd });
  }

  function buildModel() {
    const now = Date.now();
    const track = D.readTrack();
    const durationMs = track?.durationMs || D.readDurationMs();
    const est = estimate(now);
    return {
      track,
      isPlaying: est ? est.playing : isPlayingNow(now),
      shuffle: D.readShuffle(),
      repeat: D.readRepeat(),
      volume: D.readVolume(),
      muted: D.readMuted(),
      positionMs: est ? est.pos : 0,
      durationMs,
      lyrics: lyr.track,
      lineIndex: lyr.line?.index ?? -1,
      ui,
      focus: focusModel(),
      settings: { spotifyProvider: settings.spotifyProvider, openMode: prefs.openMode, allTabs: prefs.allTabs },
    };
  }

  function renderNow() {
    if (!ov) return;
    try {
      if (ov.where === 'desktop') return sendDesktopModel();
      const model = buildModel();
      if (ov.where === 'relay') return publishToTabs(model, true);
      ov.view.render(model);
      if (ov.where === 'page') publishToTabs(model, false);
    } catch (err) {
      console.warn('[Sonavia] render failed', err);
    }
  }

  function startTicker(win) {
    // Tick from the window the overlay lives in: a PiP window stays visible
    // (and unthrottled) even when the Spotify tab is in the background.
    ov.ticker = win.setInterval(renderNow, POLL_MS);
    ov.tickerWin = win;
  }

  function stopTicker() {
    if (ov?.ticker) ov.tickerWin.clearInterval(ov.ticker);
  }

  function toggleOverlay(fromUserGesture) {
    if (ov) return closeOverlay();
    if (prefs.openMode === 'desktop') openDesktop();
    else if (fromUserGesture && prefs.openMode === 'pip' && 'documentPictureInPicture' in window) openPip();
    else openPage();
  }

  /** @param {{keepTabs?: boolean}} [opts] keepTabs: other tabs keep showing it (switching to relay) */
  function closeOverlay(opts = {}) {
    if (!ov) return;
    const old = ov;
    stopTicker();
    ov = null;
    if (old.where === 'desktop') send({ type: 'desktop-close' });
    if ((old.where === 'page' || old.where === 'relay') && !opts.keepTabs) send({ type: 'mirror-hide' });
    old.view?.destroy();
    old.host?.remove();
    old.win?.close();
    window.removeEventListener('resize', clampHost);
    disconnectDisplay();
    paintButton();
  }

  // ---- in-page overlay ------------------------------------------------------
  function openPage() {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = V.STYLE;
    shadow.append(style);
    document.documentElement.append(host);
    const view = V.mount(document, shadow, {
      pip: false,
      collapsible: true,
      onAction,
      onLayout: () => requestAnimationFrame(clampHost),
      onResize: (e) => resizeHost(host, e),
      maxWidth: () => window.innerWidth - 16,
    });
    ov = { where: 'page', view, host };
    const pos = prefs.pos || { left: window.innerWidth - CARD_W - 24, top: 72 };
    host.style.left = `${pos.left}px`;
    host.style.top = `${pos.top}px`;
    clampHost();
    window.addEventListener('resize', clampHost);
    enableDrag(view.card, host);
    startTicker(window);
    connectDisplay();
    renderNow();
    paintButton();
  }

  function clampHost() {
    const host = ov?.host;
    if (!host) return;
    const w = host.offsetWidth || CARD_W;
    const h = ov.view.card.offsetHeight || 180;
    const left = Math.max(0, Math.min(parseFloat(host.style.left) || 0, window.innerWidth - w));
    const top = Math.max(0, Math.min(parseFloat(host.style.top) || 0, window.innerHeight - h));
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  /** Keep the opposite edge still while the overlay is being widened. */
  let resizeLeft0 = 0;
  function resizeHost(host, e) {
    if (e.phase === 'start') {
      resizeLeft0 = parseFloat(host.style.left) || 0;
      dragging = true; // don't let another tab's saved position move us meanwhile
      return;
    }
    if (e.side === 'l') host.style.left = `${resizeLeft0 - (e.width - e.startWidth)}px`;
    clampHost();
    if (e.phase === 'end') {
      dragging = false;
      prefs.pos = { left: parseFloat(host.style.left), top: parseFloat(host.style.top) };
      chrome.storage.local.set({ overlayPos: prefs.pos }).catch(() => {});
    }
  }

  let dragging = false;
  function enableDrag(handle, host) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, .bar, .vbar, input, a')) return;
      e.preventDefault();
      dragging = true;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = parseFloat(host.style.left) || 0;
      const oy = parseFloat(host.style.top) || 0;
      const move = (ev) => {
        host.style.left = `${ox + ev.clientX - sx}px`;
        host.style.top = `${oy + ev.clientY - sy}px`;
        clampHost();
      };
      const up = () => {
        dragging = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        prefs.pos = { left: parseFloat(host.style.left), top: parseFloat(host.style.top) };
        chrome.storage.local.set({ overlayPos: prefs.pos }).catch(() => {});
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  // ---- Picture-in-Picture overlay (always on top) ----------------------------
  function pipHeightFor(cardH) {
    if (ui.study) return cardH;
    const panel = ui.focus ? ui.tasksOpen || ui.timerOpen : ui.lyricsOpen;
    return cardH + (panel ? PANEL_H : 0);
  }

  async function openPip() {
    if (!('documentPictureInPicture' in window)) {
      if (!ov) openPage();
      return;
    }
    let win;
    try {
      win = await documentPictureInPicture.requestWindow({ width: ui.width || CARD_W, height: pipHeightFor(ui.study ? 64 : 176) });
    } catch (err) {
      console.warn('[Sonavia] Picture-in-Picture unavailable:', err);
      if (!ov) openPage();
      return;
    }
    if (ov) closeOverlay(); // move out of the page
    const doc = win.document;
    doc.title = 'Sonavia';
    const style = doc.createElement('style');
    style.textContent = V.PIP_DOC_STYLE + V.STYLE;
    doc.head.append(style);
    const view = V.mount(doc, doc.body, { pip: true, onAction });
    ov = { where: 'pip', view, win };
    win.addEventListener('pagehide', () => {
      if (ov?.win === win) closeOverlay();
    });
    startTicker(win);
    connectDisplay();
    renderNow();
    paintButton();
    win.requestAnimationFrame(fitPip);
  }

  /** Size the PiP window to the card (+ lyrics panel). Needs a user gesture. */
  function fitPip() {
    if (ov?.where !== 'pip') return;
    const { win, view } = ov;
    const cardH = view.card.offsetHeight;
    if (!cardH) return;
    const want = pipHeightFor(cardH);
    const delta = want - win.innerHeight;
    if (Math.abs(delta) > 2) {
      try {
        win.resizeBy(0, delta); // height only: keep any width the user dragged
      } catch {
        // resizing needs a fresh user gesture; the layout still adapts
      }
    }
  }

  // ---- overlay on every browser tab ("All tabs") ---------------------------
  // The background relays this model to whichever tab is visible. Full rate
  // only while some tab shows it; otherwise a once-a-second heartbeat.
  let mirrorCount = 0;
  let mirrorSentLyrics;
  let mirrorSentAt = 0;

  function publishToTabs(model, relay) {
    if (!prefs.allTabs && !relay) return;
    const now = Date.now();
    if (!mirrorCount && now - mirrorSentAt < 1000) return;
    mirrorSentAt = now;
    const m = { ...model, at: now, relay };
    if (m.lyrics === mirrorSentLyrics) delete m.lyrics;
    else mirrorSentLyrics = m.lyrics;
    send({ type: 'mirror-model', model: m });
  }

  /**
   * Another tab opened the Picture-in-Picture popup (↗ there). This tab stops
   * drawing its own overlay and just keeps the popup fed through the background.
   */
  function openRelay() {
    if (ov?.where === 'relay') return;
    if (ov) closeOverlay({ keepTabs: true });
    ov = { where: 'relay', view: null };
    startTicker(window);
    connectDisplay();
    renderNow();
    paintButton();
  }

  // ---- desktop overlay app (floats over every app) ---------------------------
  // Only started when chosen: the background asks Brave to launch the app
  // through native messaging, and it quits as soon as the overlay closes.
  let sentLyrics; // the lyrics object last shipped to the app (sent only on change)

  function openDesktop() {
    if (ov) closeOverlay();
    ov = { where: 'desktop', view: null, openedAt: Date.now() };
    sentLyrics = undefined;
    send({ type: 'desktop-open' });
    startTicker(window);
    connectDisplay();
    renderNow();
    paintButton();
  }

  function sendDesktopModel() {
    const model = buildModel();
    model.at = Date.now(); // the app keeps the clock moving between updates
    if (model.lyrics === sentLyrics) delete model.lyrics;
    else sentLyrics = model.lyrics;
    send({ type: 'desktop-model', model });
  }

  /** The app closed (✕ in the app, crashed, or could not be started). */
  function desktopGone(error) {
    if (ov?.where !== 'desktop') return;
    const failedToStart = error && Date.now() - ov.openedAt < 4000;
    stopTicker();
    ov = null;
    disconnectDisplay();
    paintButton();
    if (failedToStart) {
      console.warn('[Sonavia] desktop overlay app unavailable:', error);
      openPage();
      const notInstalled = /not found|forbidden/i.test(error);
      showToast(
        notInstalled
          ? 'Desktop overlay add-on isn’t set up yet — run desktop\\install.cmd (see README).'
          : `Desktop overlay add-on couldn’t start: ${error}`,
      );
    }
  }

  function onBackgroundMessage(msg) {
    if (msg?.type === 'mirrors') mirrorCount = msg.count || 0;
    else if (msg?.type === 'mirror-action' && (ov?.where === 'page' || ov?.where === 'relay')) onAction(msg.name, msg.arg);
    else if (msg?.type === 'desktop-action' && ov?.where === 'desktop') onAction(msg.name, msg.arg);
    else if (msg?.type === 'desktop-closed') desktopGone(msg.error);
  }

  function showToast(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText =
      'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:2147483647;max-width:420px;' +
      'background:#2a2a2a;color:#fff;font:600 13px system-ui,sans-serif;padding:10px 16px;border-radius:10px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.5);text-align:center;';
    document.documentElement.append(t);
    setTimeout(() => t.remove(), 6000);
  }

  // ---- actions from the overlay ------------------------------------------------
  function onAction(action, arg) {
    switch (action) {
      case 'play':
        D.click('playPause');
        break;
      case 'prev':
      case 'next':
      case 'shuffle':
      case 'repeat':
        D.click(action);
        break;
      case 'seek':
        D.seek(arg);
        break;
      case 'volume':
        if (D.readMuted() && arg > 0) D.click('mute'); // dragging up unmutes
        D.setVolume(arg);
        break;
      case 'mute':
        D.click('mute');
        break;
      case 'seek-line': {
        const total = (lyr.track?.globalOffsetMs || 0) + (lyr.track?.offsetMs || 0);
        const dur = D.readDurationMs();
        if (dur) D.seek(Math.max(0, arg - total + 30) / dur);
        break;
      }
      case 'page':
        ui.page = arg;
        break;
      case 'lyrics':
        ui.lyricsOpen = !ui.lyricsOpen;
        if (ui.lyricsOpen) ov?.view?.resetScroll();
        saveUi();
        break;
      case 'study':
        ui.study = true;
        saveUi();
        break;
      case 'pin':
        ui.keepExpanded = !ui.keepExpanded;
        saveUi();
        break;
      case 'width':
        ui.width = Math.max(400, Math.round(Number(arg) || 400));
        saveUi();
        break;
      case 'scale':
        ui.scale = Math.max(0.7, Math.min(1.6, Number(arg) || 1));
        saveUi();
        break;
      case 'unstudy':
        ui.study = false;
        saveUi();
        if (ui.lyricsOpen) ov?.view?.resetScroll();
        break;
      case 'popout':
        openPip();
        return;
      case 'popin':
        closeOverlay();
        openPage();
        return;
      case 'remote-pip-open':
        openRelay();
        return;
      case 'remote-pip-closed':
        if (ov?.where === 'relay') closeOverlay();
        return;
      case 'desktop':
        openDesktop();
        return;
      case 'resync': // the desktop app (re)loaded: resend lyrics with the next update
        sentLyrics = undefined;
        break;
      case 'close':
        closeOverlay();
        return;
      case 'later':
        sendCommand({ action: 'offset', deltaMs: -500 });
        break;
      case 'earlier':
        sendCommand({ action: 'offset', deltaMs: 500 });
        break;
      case 'next-match':
      case 'toggle-hidden':
      case 'retry':
        sendCommand({ action });
        break;
      case 'toggle-spotify-provider':
        chrome.storage.sync.set({ spotifyProvider: !settings.spotifyProvider }).catch(() => {});
        break;
      case 'toggle-all-tabs':
        prefs.allTabs = !prefs.allTabs;
        chrome.storage.local.set({ allTabs: prefs.allTabs }).catch(() => {});
        if (!prefs.allTabs) send({ type: 'mirror-hide' });
        mirrorSentAt = 0;
        break;
      case 'cycle-open-mode': {
        const order = ['page', 'pip', 'desktop'];
        prefs.openMode = order[(order.indexOf(prefs.openMode) + 1) % order.length];
        chrome.storage.local.set({ openMode: prefs.openMode }).catch(() => {});
        break;
      }
      default:
        if (!focusAction(action, arg)) return;
    }
    renderNow();
    setTimeout(renderNow, 150); // Spotify updates its buttons a beat later
    if (ov?.where === 'pip') ov.win.requestAnimationFrame(fitPip);
    else if (ov?.where === 'page') requestAnimationFrame(clampHost);
  }

  // Toolbar icon → toggle (in the page; PiP needs a click inside the tab).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'toggle-overlay') toggleOverlay(false);
  });

  // ======================================================================
  function shutdown() {
    if (dead) return;
    dead = true;
    clockObserver?.disconnect();
    clearInterval(timer);
    closeOverlay();
    document.getElementById(BUTTON_ID)?.remove();
  }

  connect();
  timer = setInterval(() => {
    if (dead) return;
    if (!chrome.runtime?.id) return shutdown(); // extension reloaded/removed
    report();
    ensureButton();
    focusTick();
  }, POLL_MS);
})();
