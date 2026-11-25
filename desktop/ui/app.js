// Desktop overlay page: renders the same view as the browser overlay from the
// model the extension streams in, and sends button presses back. The window
// covers the screen; the view draws the circle and the player in it exactly
// as in a web page, and everything else lets clicks through (see main.rs).
(() => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const V = globalThis.SOView;

  const style = document.createElement('style');
  style.textContent = V.STYLE;
  document.head.append(style);

  const send = (name, arg) => invoke('send_action', { name, arg: arg ?? null }).catch(() => {});

  // Where the circle is kept on this screen (pages keep their own, in the browser).
  const POS_KEY = 'sonavia.dotPos';
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
  } catch {
    saved = null;
  }

  const view = V.mount(document, document.getElementById('stage'), {
    desktop: true,
    collapsible: true,
    dot: true,
    startOpen: true, // sent to the desktop just now: show it
    externalHover: true, // the app reports the mouse (clicks pass through elsewhere)
    onAction: send,
    onDotMove: (p) => {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(p));
      } catch {
        // not kept; it still works
      }
    },
  });
  if (saved) view.setDot(saved);

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
  // Mouse position from the app (clicks pass through this window, so the page
  // can't see the mouse itself): shows the song name while it's on the circle.
  listen('cursor', ({ payload }) => {
    if (Array.isArray(payload)) view.pointer(payload[0], payload[1]);
  });

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
      let pos = model.positionMs + (model.isPlaying ? (Date.now() - model.receivedAt) * (model.rate || 1) : 0);
      if (model.durationMs) pos = Math.min(pos, model.durationMs);
      view.render({ ...model, positionMs: pos, lineIndex: lineAt(model, pos) });
      const open = Boolean(model.ui?.lyricsOpen && !model.ui?.study && !model.ui?.focus);
      if (open && !lyricsWasOpen) view.resetScroll();
      lyricsWasOpen = open;
    }
    reportHitAreas();
  }
  setInterval(frame, 100);

  // ---- where the overlay is drawn (everything else is click-through) ----------
  // The circle and the player (with its panels) each count; the gap between them doesn't.
  let lastRects = '';
  function reportHitAreas() {
    const rects = [];
    for (const sel of ['.pill', '.stk']) {
      const el = view.root.querySelector(sel);
      const r = el?.getBoundingClientRect();
      if (r && r.width && r.height) rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    const key = JSON.stringify(rects);
    if (key === lastRects) return;
    lastRects = key;
    invoke('set_hit_rects', { rects }).catch(() => {});
  }

  // ---- drags keep the mouse ------------------------------------------------------
  // Dragging the circle, a slider or a knob can leave the overlay's parts; the
  // app keeps the mouse here until the button is released.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 0 && e.composedPath().includes(view.root)) invoke('hold', { on: true }).catch(() => {});
    },
    true,
  );
  const release = () => invoke('hold', { on: false }).catch(() => {});
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', release);

  send('resync'); // ask for the lyrics again (this window may have just opened)
})();
