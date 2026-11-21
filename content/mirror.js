// Runs on every site except Spotify. While the overlay is open in the
// Spotify tab, shows the same overlay here: it renders what the Spotify tab
// streams in (via the background) and sends clicks back to it.
// Only the visible tab is connected, so background tabs cost nothing.
//
// ↗ on this tab opens the always-on-top Picture-in-Picture popup from here
// (Brave only lets the page that was clicked open it). While a tab owns the
// popup, the Spotify tab runs in "relay" mode and the in-tab overlays hide.
(() => {
  if (window.top !== window || window.__sonaviaMirror) return;
  window.__sonaviaMirror = true;

  const V = globalThis.SOView;
  const HOST_ID = 'sonavia-host';
  const CARD_W = 400;
  const PANEL_H = 360 + 6;

  let port = null;
  let dead = false;
  let live = false; // set by the background while the overlay is open in Spotify
  let model = null;
  let lyrics = null;
  let pos = null;
  let ticker = null;
  let tickerHost = null;

  /** In-tab overlay */
  let tab = null; // { view, host, lyricsWasOpen }
  /** Picture-in-Picture popup owned by this tab */
  let pip = null; // { win, view, lyricsWasOpen }

  chrome.storage.local.get(['overlayPos', 'mirrorLive']).then((s) => {
    pos = s.overlayPos || null;
    live = Boolean(s.mirrorLive);
    placeHost();
    connect();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.overlayPos) {
      pos = changes.overlayPos.newValue || null;
      placeHost();
    }
    if (changes.mirrorLive) {
      live = Boolean(changes.mirrorLive.newValue);
      if (live) connect();
      else disconnect();
    }
  });

  // ---- link to the background -------------------------------------------------
  // Connected while this tab is visible, or while it owns the popup (then it
  // must keep feeding the popup even when you switch to another tab or app).
  function connect() {
    if (port || dead || !live) return;
    if (document.visibilityState !== 'visible' && !pip) return;
    if (!chrome.runtime?.id) return shutdown(); // extension reloaded
    try {
      port = chrome.runtime.connect({ name: 'mirror' });
    } catch {
      return shutdown();
    }
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      hideTab();
      // Background restarted: come back if the overlay is still live.
      setTimeout(connect, 800);
    });
  }

  function disconnect() {
    const p = port;
    port = null;
    p?.disconnect();
    hideTab();
    if (!live) closePip();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') connect();
    else if (!pip) disconnect();
    else hideTab();
  });

  function onMessage(msg) {
    if (msg?.type === 'model') {
      const m = msg.model;
      if ('lyrics' in m) lyrics = m.lyrics ?? null;
      m.lyrics = lyrics;
      m.receivedAt = Date.now();
      model = m;
      if (pip && !m.relay) closePip(); // the overlay went back into the tabs
      if (m.relay || pip) hideTab(); // the popup is showing it
      else if (document.visibilityState === 'visible') showTab();
      ensureTicker();
    } else if (msg?.type === 'hide') {
      model = null;
      hideTab();
      closePip();
    }
  }

  // ---- actions --------------------------------------------------------------------
  function forward(name, arg) {
    try {
      port?.postMessage({ type: 'action', name, arg: arg ?? null });
    } catch {
      port = null;
    }
  }

  function onAction(name, arg) {
    if (name === 'popout') return openPip(); // this click is the gesture PiP needs
    if (name === 'popin') {
      closePip();
      return forward('popin'); // Spotify shows the overlay in the tabs again
    }
    // Instant feedback for purely visual toggles; Spotify's tab confirms them.
    if (model?.ui) {
      const ui = { ...model.ui };
      if (name === 'lyrics') ui.lyricsOpen = !ui.lyricsOpen;
      else if (name === 'study') ui.study = true;
      else if (name === 'unstudy') ui.study = false;
      else if (name === 'pin') ui.keepExpanded = !ui.keepExpanded;
      else if (name === 'width') ui.width = arg;
      else if (name === 'scale') ui.scale = arg;
      else if (name === 'focus-enter') Object.assign(ui, { focus: true, study: false });
      else if (name === 'focus-exit') Object.assign(ui, { focus: false, tasksOpen: false, timerOpen: false });
      else if (name === 'focus-tasks') Object.assign(ui, { tasksOpen: !ui.tasksOpen, timerOpen: false });
      else if (name === 'focus-timer') Object.assign(ui, { timerOpen: !ui.timerOpen, tasksOpen: false });
      model = { ...model, ui };
    }
    forward(name, arg);
    if (name === 'close' || name === 'desktop') {
      hideTab();
      closePip();
    }
    if (pip && /^(lyrics|study|unstudy|focus-(enter|exit|tasks|timer))$/.test(name)) setTimeout(fitPip, 60);
  }

  // ---- in-tab overlay ------------------------------------------------------------
  function showTab() {
    if (tab) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = V.STYLE;
    shadow.append(style);
    document.documentElement.append(host);
    let left0 = 0;
    const view = V.mount(document, shadow, {
      onResize: (e) => {
        if (e.phase === 'start') left0 = parseFloat(host.style.left) || 0;
        else if (e.side === 'l') host.style.left = `${left0 - (e.width - e.startWidth)}px`;
        clamp();
        if (e.phase === 'end') {
          pos = { left: parseFloat(host.style.left), top: parseFloat(host.style.top) };
          chrome.storage.local.set({ overlayPos: pos }).catch(() => {});
        }
      },
      maxWidth: () => window.innerWidth - 16,
      collapsible: true,
      onAction,
      onLayout: () => requestAnimationFrame(clamp),
    });
    tab = { view, host, lyricsWasOpen: false };
    placeHost();
    enableDrag(view.card, host);
    window.addEventListener('resize', clamp);
    ensureTicker();
    frame();
  }

  function hideTab() {
    if (!tab) return;
    tab.view.destroy();
    tab.host.remove();
    tab = null;
    window.removeEventListener('resize', clamp);
    ensureTicker();
  }

  // ---- Picture-in-Picture popup -------------------------------------------------
  async function openPip() {
    if (pip) return pip.win.focus();
    if (!('documentPictureInPicture' in window)) return;
    const ui = model?.ui || {};
    const height = ui.study ? 64 : 176 + (hasPanel(ui) ? PANEL_H : 0);
    let win;
    try {
      win = await documentPictureInPicture.requestWindow({ width: ui.width || CARD_W, height });
    } catch (err) {
      console.warn('[Sonavia] Picture-in-Picture unavailable:', err);
      return;
    }
    const doc = win.document;
    doc.title = 'Sonavia';
    const style = doc.createElement('style');
    style.textContent = V.PIP_DOC_STYLE + V.STYLE;
    doc.head.append(style);
    const view = V.mount(doc, doc.body, { pip: true, onAction });
    pip = { win, view, lyricsWasOpen: false };
    win.addEventListener('pagehide', () => {
      if (pip?.win !== win) return; // we closed it ourselves
      pip = null;
      ensureTicker();
      forward('remote-pip-closed'); // closed with the window's own ✕
      if (document.visibilityState !== 'visible') disconnect();
    });
    hideTab();
    forward('remote-pip-open');
    ensureTicker();
    frame();
    win.requestAnimationFrame(fitPip);
  }

  /** Is a panel showing under the tile (lyrics, or tasks / timer in focus mode)? */
  const hasPanel = (ui) => (ui.focus ? ui.tasksOpen || ui.timerOpen : ui.lyricsOpen);

  /** Close the popup without telling Spotify (it already knows, or will). */
  function closePip() {
    if (!pip) return;
    const { win } = pip;
    pip = null;
    ensureTicker();
    win.close();
  }

  /** Size the popup to the card (+ lyrics panel). Needs a click in the popup. */
  function fitPip() {
    if (!pip) return;
    const { win, view } = pip;
    const cardH = view.card.offsetHeight;
    if (!cardH) return;
    const ui = model?.ui || {};
    const want = ui.study ? cardH : cardH + (hasPanel(ui) ? PANEL_H : 0);
    const delta = want - win.innerHeight;
    if (Math.abs(delta) > 2) {
      try {
        win.resizeBy(0, delta); // height only: keep any width the user dragged
      } catch {
        // resizing needs a fresh click inside the popup; the layout still adapts
      }
    }
  }

  // ---- rendering ---------------------------------------------------------------
  function ensureTicker() {
    // Tick from the popup when there is one: it stays visible (and
    // unthrottled) while this tab is in the background.
    const want = pip ? pip.win : tab ? window : null;
    if (want === tickerHost) return;
    try {
      tickerHost?.clearInterval(ticker);
    } catch {
      // that window is already gone
    }
    tickerHost = want;
    ticker = want ? want.setInterval(frame, 100) : null;
  }

  /** Same clock interpolation and line timing as the desktop app. */
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
    if (!model) return;
    let p = model.positionMs + (model.isPlaying ? (Date.now() - model.receivedAt) * (model.rate || 1) : 0);
    if (model.durationMs) p = Math.min(p, model.durationMs);
    const m = { ...model, positionMs: p, lineIndex: lineAt(model, p) };
    const open = Boolean(model.ui?.lyricsOpen && !model.ui?.study && !model.ui?.focus);
    for (const target of [tab, pip]) {
      if (!target) continue;
      target.view.render(m);
      if (open && !target.lyricsWasOpen) target.view.resetScroll();
      target.lyricsWasOpen = open;
    }
  }

  // ---- position & dragging (in-tab overlay) -------------------------------------
  function placeHost() {
    if (!tab) return;
    const p = pos || { left: window.innerWidth - CARD_W - 24, top: 72 };
    tab.host.style.left = `${p.left}px`;
    tab.host.style.top = `${p.top}px`;
    clamp();
  }

  function clamp() {
    if (!tab) return;
    const { host, view } = tab;
    const w = host.offsetWidth || CARD_W;
    const h = view.card.offsetHeight || 180;
    host.style.left = `${Math.max(0, Math.min(parseFloat(host.style.left) || 0, window.innerWidth - w))}px`;
    host.style.top = `${Math.max(0, Math.min(parseFloat(host.style.top) || 0, window.innerHeight - h))}px`;
  }

  function enableDrag(handle, host) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, .bar, .vbar, input, a, .ttl, .sr-list')) return;
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = parseFloat(host.style.left) || 0;
      const oy = parseFloat(host.style.top) || 0;
      const move = (ev) => {
        host.style.left = `${ox + ev.clientX - sx}px`;
        host.style.top = `${oy + ev.clientY - sy}px`;
        clamp();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        pos = { left: parseFloat(host.style.left), top: parseFloat(host.style.top) };
        chrome.storage.local.set({ overlayPos: pos }).catch(() => {});
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  function shutdown() {
    dead = true;
    hideTab();
    closePip();
  }
})();
