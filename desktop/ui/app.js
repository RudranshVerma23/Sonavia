// Desktop overlay page: renders the same view as the browser overlay from the
// model the extension streams in, and sends button presses back.
(() => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const V = globalThis.SOView;

  const style = document.createElement('style');
  style.textContent = V.STYLE;
  document.head.append(style);

  const send = (name, arg) => invoke('send_action', { name, arg: arg ?? null }).catch(() => {});

  // The window grows with the overlay (see resize_to in main.rs).
  let windowWidth = 400;
  function onResize(e) {
    if (e.phase === 'start') invoke('resize_begin').catch(() => {});
    windowWidth = e.width;
    invoke('resize_to', { width: e.width, left: e.side === 'l', startWidth: e.startWidth }).catch(() => {});
    if (e.phase === 'end') invoke('resize_end').catch(() => {});
  }

  const view = V.mount(document, document.getElementById('stage'), {
    desktop: true,
    collapsible: true,
    externalHover: true, // the app reports hover (clicks pass through elsewhere)
    onAction: send,
    onResize,
  });

  let model = null;
  let lyrics = null; // only sent when it changes, so keep the last one
  let lyricsWasOpen = false;

  listen('ext', ({ payload: msg }) => {
    if (msg?.type !== 'model') return;
    const m = msg.model;
    if ('lyrics' in m) lyrics = m.lyrics ?? null;
    m.lyrics = lyrics;
    m.receivedAt = Date.now();
    model = m;
  });
  listen('hover', ({ payload: inside }) => view.hover(Boolean(inside)));

  /** Active lyric line computed here, so it changes exactly on time. */
  function lineAt(m, pos) {
    const L = m.lyrics;
    if (!L || !m.track || L.key !== m.track.key || !L.synced || !L.lines?.length) return m.lineIndex;
    const t = pos + (L.globalOffsetMs || 0) + (L.offsetMs || 0);
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
    if (model) {
      // keep the clock moving between updates from the browser
      let pos = model.positionMs + (model.isPlaying ? Date.now() - model.receivedAt : 0);
      if (model.durationMs) pos = Math.min(pos, model.durationMs);
      const m = { ...model, positionMs: pos, lineIndex: lineAt(model, pos) };
      const w = Math.max(400, Math.round(m.ui?.width || 400));
      if (!view.isResizing() && w !== windowWidth) {
        windowWidth = w;
        invoke('resize_to', { width: w, left: false, startWidth: w }).catch(() => {});
      }
      view.render(m);
      const open = Boolean(m.ui?.lyricsOpen && !m.ui?.study);
      if (open && !lyricsWasOpen) view.resetScroll();
      lyricsWasOpen = open;
    }
    reportHitArea();
  }
  setInterval(frame, 100);

  // ---- where the overlay is drawn (everything else is click-through) ----------
  let lastRect = '';
  function reportHitArea() {
    const parts = view.isCollapsed()
      ? [view.root.querySelector('.pill')]
      : [view.root.querySelector('.cardwrap'), view.root.querySelector('.panel')];
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of parts) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      x1 = Math.min(x1, r.left);
      y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right);
      y2 = Math.max(y2, r.bottom);
    }
    if (x1 === Infinity) return;
    const rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    const key = `${rect.x}|${rect.y}|${rect.w}|${rect.h}`;
    if (key === lastRect) return;
    lastRect = key;
    invoke('set_hit_rect', rect).catch(() => {});
  }

  // ---- drag the window by the card's empty space or the pill ------------------
  view.root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, .bar, .vbar, .list, input, a')) return;
    if (!e.target.closest('.card, .pill')) return;
    e.preventDefault();
    // The app moves the window itself (so the card can reach the top of the
    // screen); keep the mouse captured here so we always hear the release.
    const el = e.target;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // capture is optional
    }
    const end = () => {
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.removeEventListener('lostpointercapture', end);
      invoke('drag_end').catch(() => {});
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    invoke('drag_start').catch(() => {});
  });

  send('resync'); // ask for the lyrics again (this window may have just opened)
})();
