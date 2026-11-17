// The overlay UI: a player card plus an optional lyrics panel that drops down
// beneath it. Pure view — it renders a model and reports user actions. The
// same view is mounted either in the Spotify page (inside a shadow root) or in
// an always-on-top Document Picture-in-Picture window.
// Classic script: defines globalThis.SOView.
(() => {
  const SVG = (w, body, extra = '') =>
    `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
  const FILL = 'fill="currentColor" stroke="none"';
  const ICON = {
    popout: SVG(13, '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'),
    popin: SVG(13, '<path d="M17 7 7 17"/><path d="M16 17H7V8"/>'),
    close: SVG(13, '<path d="M18 6 6 18M6 6l12 12"/>'),
    desktop: SVG(13, '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    shuffle: SVG(17, '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>'),
    prev: SVG(15, '<path d="M6 5h2.2v14H6zM19.5 5.6v12.8a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l8.65-6.4a.8.8 0 0 1 1.25.66z"/>', FILL),
    next: SVG(15, '<path d="M15.8 5H18v14h-2.2zM4.5 5.6v12.8a.8.8 0 0 0 1.25.66l8.65-6.4a.8.8 0 0 0 0-1.32L5.75 4.94a.8.8 0 0 0-1.25.66z"/>', FILL),
    play: SVG(20, '<path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10.2-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6z"/>', FILL),
    pause: SVG(20, '<rect x="6.5" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2"/>', FILL),
    repeat: SVG(17, '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    note: SVG(17, '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    volHigh: SVG(16, '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
    volLow: SVG(16, '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'),
    volMute: SVG(16, '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="m16 9 5 6M21 9l-5 6"/>'),
    pin: SVG(13, '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'),
    expand: SVG(14, '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'),
  };

  const STYLE = `
  .so, .so * { box-sizing: border-box; }
  .so {
    --ac: #f5c542; --ac-soft: rgba(245,197,66,.16);
    --t1: #fff; --t2: #b3b3b3; --t3: #7a7a7a;
    --card: rgba(16,16,16,.9); --line: rgba(255,255,255,.08); --btn: rgba(255,255,255,.07); --btnh: rgba(255,255,255,.14);
    width: 400px; display: flex; flex-direction: column; gap: 6px;
    font-family: "SpotifyMixUI", "Circular", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--t1); user-select: none; -webkit-font-smoothing: antialiased; line-height: 1.25;
    animation: so-in .22s cubic-bezier(.3,1.4,.6,1);
  }
  @keyframes so-in { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
  .so button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; }

  /* ---------- card ---------- */
  .cardwrap { position: relative; }
  /* ambient glow around the card, tinted by the album art */
  /* The mask fades the glow to nothing inside its own box, so it never ends
     in a hard edge (e.g. at the border of the desktop overlay's window). */
  .halo { position: absolute; inset: -34px -40px; background-size: cover; background-position: center;
          filter: blur(26px) saturate(1.9) brightness(1.15); opacity: 0; pointer-events: none; transition: opacity .8s;
          mask-image: linear-gradient(to right, transparent, #000 17%, #000 83%, transparent),
                      linear-gradient(to bottom, transparent, #000 24%, #000 76%, transparent);
          mask-composite: intersect; }
  .halo.on { opacity: .75; animation: so-breathe 6s ease-in-out infinite; }
  .so.paused .halo.on { opacity: .4; animation: none; }
  @keyframes so-breathe { 0%, 100% { opacity: .75; } 50% { opacity: .55; } }
  .so.pip .halo { display: none; }
  .card {
    position: relative; overflow: hidden; border-radius: 22px; background: var(--card);
    border: 1px solid var(--line); box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 3px 10px rgba(0,0,0,.35);
    backdrop-filter: blur(24px) saturate(140%); -webkit-backdrop-filter: blur(24px) saturate(140%);
    padding: 16px 16px 8px; cursor: grab;
  }
  .so.pip .card { cursor: default; }
  .card:active { cursor: grabbing; }
  .glow { position: absolute; inset: -30%; background-size: cover; background-position: center;
          filter: blur(50px) saturate(1.5); opacity: .22; pointer-events: none; transition: opacity .6s; }
  .card > *:not(.glow) { position: relative; }
  .so .card > .strip { position: static; }

  .corner { position: absolute !important; top: 10px; right: 10px; display: flex; gap: 6px; z-index: 3; }
  .ib { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
        background: var(--btn) !important; color: var(--t2) !important; transition: background .15s, color .15s; }
  .ib[hidden] { display: none; }
  .ib:hover { background: var(--btnh) !important; color: var(--t1) !important; }
  .ib.x:hover { background: rgba(255,80,80,.18) !important; color: #ff8a8a !important; }

  .pages { height: 118px; position: relative; }
  .pg { position: absolute; inset: 0; transition: opacity .25s, transform .25s; }
  .pg.off { opacity: 0; pointer-events: none; }
  .pg.p0.off { transform: translateX(-14px); }
  .pg.p1.off { transform: translateX(14px); }

  .p0 { display: grid; grid-template-columns: 74px 1fr; column-gap: 16px; }
  .art { width: 74px; height: 74px; border-radius: 9px; overflow: hidden; background: #282828;
         box-shadow: 0 6px 18px rgba(0,0,0,.5); }
  .art img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .3s; }
  .art img.ok { opacity: 1; }
  .info { min-width: 0; padding-top: 2px; }
  .ttl { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 58px; }
  .sub { font-size: 12px; color: var(--t2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 30px; }
  .prog { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .tm { font-size: 10px; color: var(--t2); font-variant-numeric: tabular-nums; min-width: 26px; }
  .tm.r { text-align: right; }
  .bar { flex: 1; height: 14px; display: flex; align-items: center; cursor: pointer; }
  .track { position: relative; width: 100%; height: 3px; border-radius: 3px; background: rgba(255,255,255,.16); transition: height .15s; }
  .bar:hover .track { height: 5px; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--ac); }
  .fill::after { content: ''; position: absolute; right: -5px; top: 50%; width: 10px; height: 10px; border-radius: 50%;
                 background: #fff; transform: translateY(-50%) scale(0); transition: transform .15s; }
  .bar:hover .fill::after, .bar.drag .fill::after { transform: translateY(-50%) scale(1); }

  .ctl { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  /* volume: sits under the album art */
  .vol { width: 80px; flex: none; display: flex; align-items: center; gap: 4px; margin-right: 0; }
  .vol[hidden] { display: flex; visibility: hidden; }
  .vol .vi { width: 22px; height: 22px; flex: none; display: grid; place-items: center; color: var(--t2) !important; border-radius: 6px; }
  .vol .vi:hover { color: var(--t1) !important; }
  .vbar { flex: 1; height: 16px; display: flex; align-items: center; cursor: pointer; }
  .vbar .track { height: 3px; }
  .vbar:hover .track, .vbar.drag .track { height: 4px; }
  .vbar .fill { background: var(--t2); }
  .vbar:hover .fill, .vbar.drag .fill { background: var(--ac); }
  .vbar:hover .fill::after, .vbar.drag .fill::after { transform: translateY(-50%) scale(.85); }
  .cb { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: var(--t2) !important;
        transition: color .15s, background .15s, transform .12s; position: relative; }
  .cb:hover { color: var(--t1) !important; background: var(--btn) !important; }
  .cb:active { transform: scale(.92); }
  .cb.on { color: var(--ac) !important; }
  .cb.on::after { content: ''; position: absolute; bottom: 3px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: var(--ac); }
  .cb .one { position: absolute; top: 5px; right: 5px; font-size: 8px; font-weight: 800; color: var(--ac); }
  .cb.play { width: 46px; height: 46px; background: rgba(255,255,255,.1) !important; color: var(--t1) !important; }
  .cb.play:hover { background: rgba(255,255,255,.17) !important; transform: scale(1.04); }
  .spacer { flex: 1; }
  .note { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--t2) !important;
          border: 1.5px solid transparent !important; background: var(--btn) !important; transition: all .15s; }
  .note:hover { color: var(--t1) !important; }
  .note.on { color: var(--ac) !important; border-color: var(--ac) !important; background: var(--ac-soft) !important; }

  /* tools page */
  .p1 { display: flex; flex-direction: column; justify-content: center; gap: 5px; padding-right: 60px; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
  .lbl { font-size: 11px; color: var(--t3); text-transform: uppercase; letter-spacing: .08em; font-weight: 700; min-width: 58px; }
  .chip { font-size: 11px !important; font-weight: 600; padding: 5px 10px !important; border-radius: 99px; background: var(--btn) !important;
          color: var(--t1) !important; white-space: nowrap; transition: background .15s; }
  .chip:hover:not(:disabled) { background: var(--btnh) !important; }
  .chip:disabled { opacity: .35; cursor: default; }
  .val { font-size: 11px; color: var(--t2); font-variant-numeric: tabular-nums; min-width: 46px; text-align: center; }
  .sw { display: flex; align-items: center; gap: 7px; font-size: 11px !important; color: var(--t2) !important; padding: 2px 0 !important; }
  .sw i { width: 26px; height: 15px; border-radius: 99px; background: rgba(255,255,255,.18); position: relative; transition: background .15s; flex: none; }
  .sw i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: #fff; transition: transform .15s; }
  .sw.on i { background: var(--ac); }
  .sw.on i::after { transform: translateX(11px); }

  .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 6px; min-height: 26px; }
  .sync { justify-self: start; display: flex; align-items: center; gap: 4px; }
  .sl { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--t3); margin-right: 2px; white-space: nowrap; }
  .sb { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 13px !important; line-height: 1;
        background: var(--btn) !important; color: var(--t2) !important; transition: background .15s, color .15s; }
  .sb:hover:not(:disabled) { background: var(--btnh) !important; color: var(--t1) !important; }
  .sb:disabled { opacity: .35; cursor: default; }
  .sv { font-size: 10px; color: var(--t2); font-variant-numeric: tabular-nums; min-width: 36px; text-align: center; }
  .pin { justify-self: end; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
         color: var(--t3) !important; transition: color .15s, background .15s; }
  .pin:hover { color: var(--t1) !important; background: var(--btn) !important; }
  .pin.on { color: var(--ac) !important; background: var(--ac-soft) !important; }
  .ltools { position: absolute !important; left: 14px; bottom: 8px; z-index: 3; display: flex; gap: 6px; opacity: 0; transition: opacity .2s; }
  .panel:hover .ltools { opacity: 1; }
  .lt { font-size: 11px !important; font-weight: 600; padding: 4px 10px !important; border-radius: 99px;
        background: rgba(50,50,50,.85) !important; color: #eee !important; }
  .lt:hover:not(:disabled) { background: rgba(80,80,80,.95) !important; }
  .lt:disabled { display: none; }
  .dots { display: flex; gap: 5px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.25) !important; transition: background .2s, transform .2s; }
  .dot.on { background: var(--ac) !important; }
  .dot:hover { transform: scale(1.3); }
  .studybtn { font-size: 9px !important; font-weight: 800; letter-spacing: .12em; color: var(--t3) !important; padding: 2px 6px !important; }
  .studybtn:hover { color: var(--t2) !important; }

  /* ---------- study mode (slim strip) ---------- */
  .strip { display: none; align-items: center; gap: 12px; }
  .so.study .card { padding: 9px 10px 9px 9px; border-radius: 18px; }
  .so.study .strip { display: flex; }
  .so.study .pages, .so.study .foot, .so.study .corner, .so.study .panel { display: none !important; }
  .s-art { width: 44px; height: 44px; border-radius: 9px; overflow: hidden; background: #282828; flex: none; }
  .s-art img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .3s; }
  .s-art img.ok { opacity: 1; }
  .s-txt { flex: 1; min-width: 0; }
  .s-main { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity .2s; }
  .s-sub { font-size: 11px; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .s-bar { position: absolute !important; left: 0; right: 0; bottom: 0; height: 2px; }
  .s-bar .fill { border-radius: 0; }
  .so.study .cb.play { width: 38px; height: 38px; }

  /* ---------- lyrics panel ---------- */
  .panel {
    position: relative; height: 360px; border-radius: 22px; overflow: hidden; border: 1px solid var(--line);
    background: linear-gradient(180deg, rgba(22,22,22,.45) 0%, rgba(8,8,8,.82) 100%);
    backdrop-filter: blur(22px) saturate(130%); -webkit-backdrop-filter: blur(22px) saturate(130%);
    box-shadow: 0 18px 50px rgba(0,0,0,.5);
    transform-origin: top center; transition: opacity .25s, transform .25s;
  }
  .so:not(.lyrics-open) .panel { display: none; }
  .so.lyrics-open .panel { animation: so-drop .28s cubic-bezier(.2,.9,.3,1.1); }
  @keyframes so-drop { from { opacity: 0; transform: translateY(-10px) scaleY(.96); } to { opacity: 1; transform: none; } }
  .list { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; padding: 0 22px 0 26px; scroll-behavior: auto;
          -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 14%, #000 82%, transparent 100%);
          mask-image: linear-gradient(180deg, transparent 0, #000 14%, #000 82%, transparent 100%); }
  .list::-webkit-scrollbar { width: 5px; }
  .list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.28); border-radius: 5px; }
  .list::-webkit-scrollbar-track { background: transparent; }
  .pad { height: 42%; }
  .ln { font-size: 19px; font-weight: 800; line-height: 1.3; padding: 9px 0; color: rgba(255,255,255,.42);
        cursor: pointer; transition: color .35s, filter .35s, opacity .35s, transform .35s; transform-origin: left center;
        filter: blur(2.4px); opacity: .55; }
  .ln.d1 { filter: blur(.7px); opacity: .8; }
  .ln.d2 { filter: blur(1.5px); opacity: .65; }
  .ln.act { color: #fff; filter: none; opacity: 1; transform: scale(1.06); text-shadow: 0 0 24px rgba(255,255,255,.18); }
  .ln.past { color: rgba(255,255,255,.5); }
  .ln:hover { filter: none !important; opacity: 1 !important; color: rgba(255,255,255,.85); }
  .ln.act:hover { color: #fff; }
  .list.unsynced .ln { filter: none; opacity: .85; transform: none; color: rgba(255,255,255,.75); cursor: default; }
  .msg { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
         font-size: 15px; font-weight: 700; color: var(--t2); text-align: center; padding: 20px; pointer-events: none; }
  .msg small { font-size: 12px; font-weight: 500; color: var(--t3); }
  .resume { position: absolute !important; top: 14px; left: 50%; transform: translateX(-50%); z-index: 4;
            font-size: 12px !important; font-weight: 700; padding: 7px 14px !important; border-radius: 99px;
            background: rgba(60,60,60,.85) !important; color: #eee !important; box-shadow: 0 4px 14px rgba(0,0,0,.45);
            backdrop-filter: blur(10px); transition: background .15s, opacity .2s; }
  .resume:hover { background: rgba(85,85,85,.95) !important; }
  .resume[hidden] { display: none; }
  .badge { position: absolute !important; right: 14px; bottom: 10px; z-index: 3; font-size: 10px; color: var(--t3);
           pointer-events: none; letter-spacing: .04em; }

  /* ---------- collapsed pill (in-page, when not hovered) ---------- */
  .pill { display: none; }
  .so.collapsed { pointer-events: none; }
  .so.collapsed > :not(.pill) { display: none !important; }
  .so.collapsed .pill {
    display: flex; align-items: center; gap: 16px; align-self: center; pointer-events: auto; cursor: pointer;
    height: 44px; max-width: 270px; padding: 0 24px 0 22px; border-radius: 99px;
    background: rgba(30,30,26,.88); border: 1px solid var(--line); box-shadow: 0 8px 24px rgba(0,0,0,.45);
    backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%);
    animation: so-pill .22s ease;
  }
  @keyframes so-pill { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
  .eq { display: flex; align-items: center; gap: 3px; height: 16px; flex: none; }
  .eq i { width: 3px; height: 6px; border-radius: 2px; background: var(--ac); animation: so-eq 1s ease-in-out infinite; }
  .eq i:nth-child(1) { animation-delay: -.2s; }
  .eq i:nth-child(2) { animation-delay: -.65s; animation-duration: .85s; }
  .eq i:nth-child(3) { animation-delay: -.4s; animation-duration: 1.15s; }
  @keyframes so-eq { 0%, 100% { height: 5px; } 50% { height: 15px; } }
  .so.paused .eq i { animation-play-state: paused; height: 5px; opacity: .7; }
  .pill-t { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ---------- Picture-in-Picture window ---------- */
  .so.pip { width: 100%; height: 100%; gap: 0; animation: none; }
  .so.pip .card { border-radius: 0; border: 0; box-shadow: none; flex: none; background: #121212; }
  .so.pip .panel { flex: 1; height: auto; border-radius: 0; border: 0; border-top: 1px solid var(--line); box-shadow: none;
                   background: linear-gradient(180deg, #141414 0%, #050505 100%); }
  .so.pip.study .card { height: 100%; display: flex; align-items: center; }
  .so.pip.study .strip { width: 100%; }

  /* ---------- desktop app (transparent window over every app) ---------- */
  /* Nothing behind that window gets blurred, so the surfaces are denser. */
  .so.desktop { animation: none; }
  .so.desktop .card { background: rgba(20,20,19,.95); cursor: default; }
  .so.desktop .panel { background: linear-gradient(180deg, rgba(22,22,21,.93) 0%, rgba(6,6,6,.97) 100%); }
  .so.desktop.collapsed .pill { background: rgba(30,30,26,.96); }
  `;

  const PIP_DOC_STYLE = `
    :root { color-scheme: dark; }
    html, body { margin: 0; height: 100%; background: #121212; overflow: hidden; }
  `;

  function fmt(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  function fmtOffset(ms) {
    const s = (ms || 0) / 1000;
    return `${s > 0 ? '+' : s < 0 ? '−' : '±'}${Math.abs(s).toFixed(1)} s`;
  }

  /** Message for the lyrics panel when there is no line to highlight. */
  function lyricsInfo(m) {
    const L = m.lyrics;
    if (!m.track) return ['Play something on Spotify', ''];
    if (!L || L.key !== m.track.key) return ['Looking up lyrics…', ''];
    if (L.hidden) return ['Lyrics hidden for this song', 'Hover here and click “Show lyrics”'];
    if (L.lines?.length) return null;
    if (L.loading) return ['Looking up lyrics…', ''];
    if (L.error === 'network') return ["Can't reach the lyrics service", 'Retrying…'];
    if (L.instrumental) return ['♪ Instrumental ♪', ''];
    return ['No lyrics found', 'Hover here and click “Retry” to search again'];
  }

  /**
   * @param {Document} doc
   * @param {Node} container  where the overlay is appended
   * @param {{pip?: boolean, desktop?: boolean, collapsible?: boolean, onLayout?: () => void, onAction: (name: string, arg?: any) => void}} opts
   */
  function mount(doc, container, opts) {
    const act = opts.onAction;
    const root = doc.createElement('div');
    root.className = 'so' + (opts.pip ? ' pip' : '') + (opts.desktop ? ' desktop' : '');
    root.innerHTML = `
      <div class="pill" title="Hover to expand"><span class="eq"><i></i><i></i><i></i></span><span class="pill-t"></span></div>
      <div class="cardwrap"><div class="halo"></div>
      <div class="card">
        <div class="glow"></div>
        <div class="corner">
          <button class="ib dsk" data-a="desktop" title="Float over every app (desktop overlay app)"${opts.desktop ? ' hidden' : ''}>${ICON.desktop}</button>
          <button class="ib pop"${opts.mirror ? ' hidden' : ''} data-a="${opts.pip || opts.desktop ? 'popin' : 'popout'}" title="${opts.pip || opts.desktop ? 'Back into the Spotify tab' : 'Pop out into a floating window'}">${opts.pip || opts.desktop ? ICON.popin : ICON.popout}</button>
          <button class="ib x" data-a="close" title="Close">${ICON.close}</button>
        </div>
        <div class="pages">
          <div class="pg p0">
            <div class="art"><img alt="" draggable="false"></div>
            <div class="info">
              <div class="ttl">Nothing playing</div>
              <div class="sub">Play something on Spotify</div>
              <div class="prog"><span class="tm cur">0:00</span><div class="bar main-bar"><div class="track"><div class="fill"></div></div></div><span class="tm r dur">0:00</span></div>
            </div>
            <div class="ctl">
              <div class="vol" title="Volume (scroll to adjust)">
                <button class="vi" data-a="mute" title="Mute / unmute">${ICON.volHigh}</button>
                <div class="vbar"><div class="track"><div class="fill"></div></div></div>
              </div>
              <button class="cb shuf" data-a="shuffle" title="Shuffle">${ICON.shuffle}</button>
              <button class="cb" data-a="prev" title="Previous">${ICON.prev}</button>
              <button class="cb play" data-a="play" title="Play / Pause">${ICON.play}</button>
              <button class="cb" data-a="next" title="Next">${ICON.next}</button>
              <button class="cb rep" data-a="repeat" title="Repeat">${ICON.repeat}<span class="one"></span></button>
              <span class="spacer"></span>
              <button class="note" data-a="lyrics" title="Lyrics">${ICON.note}</button>
            </div>
          </div>
        </div>
        <div class="foot">
          <div class="sync" title="Lyrics timing for this song">
            <span class="sl">LYRICS SYNC</span>
            <button class="sb" data-a="later" title="Lyrics too early? Show them 0.5 s later">−</button>
            <span class="sv off-val">±0.0 s</span>
            <button class="sb" data-a="earlier" title="Lyrics too late? Show them 0.5 s earlier">+</button>
          </div>
          <button class="studybtn" data-a="study" title="Slim strip with the current lyric line. Stays put until you exit it.">COMPACT MODE →</button>
          <button class="pin" data-a="pin" title="Keep expanded (don't shrink to the pill)">${ICON.pin}</button>
        </div>
        <div class="strip">
          <div class="s-art"><img alt="" draggable="false"></div>
          <div class="s-txt"><div class="s-main"></div><div class="s-sub"></div></div>
          <button class="cb play" data-a="play" title="Play / Pause">${ICON.play}</button>
          <button class="cb" data-a="next" title="Next">${ICON.next}</button>
          <button class="ib" data-a="unstudy" title="Exit compact mode">${ICON.expand}</button>
          <div class="bar s-bar"><div class="track"><div class="fill"></div></div></div>
        </div>
      </div></div>
      <div class="panel">
        <button class="resume" data-a="resume" hidden>Resume Autoscroll</button>
        <div class="list"></div>
        <div class="msg" hidden></div>
        <div class="ltools">
          <button class="lt match" data-a="next-match" title="Try the next lyrics match">Wrong lyrics?</button>
          <button class="lt" data-a="retry" title="Look the lyrics up again">Retry</button>
          <button class="lt unhide" data-a="toggle-hidden" title="Show lyrics for this song again">Show lyrics</button>
        </div>
        <div class="badge"></div>
      </div>`;
    container.appendChild(root);

    const q = (s) => root.querySelector(s);
    const qa = (s) => [...root.querySelectorAll(s)];
    const el = {
      card: q('.card'), glow: q('.glow'), halo: q('.halo'),
      pin: q('.pin'),
      art: q('.art img'), sArt: q('.s-art img'),
      ttl: q('.ttl'), sub: q('.sub'), cur: q('.cur'), dur: q('.dur'),
      bar: q('.main-bar'), fills: qa('.prog .fill, .s-bar .fill'),
      vol: q('.vol'), vbar: q('.vbar'), vfill: q('.vbar .fill'), vi: q('.vol .vi'),
      plays: qa('.cb.play'), shuf: q('.shuf'), rep: q('.rep'), one: q('.rep .one'), note: q('.note'),
      offVal: q('.off-val'), later: q('[data-a="later"]'), earlier: q('[data-a="earlier"]'),
      match: q('.match'), unhide: q('.unhide'),
      sMain: q('.s-main'), sSub: q('.s-sub'),
      pillT: q('.pill-t'),
      list: q('.list'), msg: q('.msg'), resume: q('.resume'), badge: q('.badge'),
    };

    const raf = (fn) => (doc.defaultView || window).requestAnimationFrame(fn);
    const setText = (node, value) => {
      if (node.textContent !== value) node.textContent = value;
    };

    // ---- collapse to a pill when the mouse is away --------------------------
    // In the page, hover comes from DOM events. The desktop app passes clicks
    // through its transparent window, so it reports hover itself via hover().
    let hoverTimer = null;
    let collapsed = false;
    let hovering = false;
    const isHovered = () => (opts.externalHover ? hovering : root.matches(':hover'));
    const setCollapsed = (v) => {
      if (v === collapsed) return;
      collapsed = v;
      root.classList.toggle('collapsed', v);
      if (!v && lastModel?.ui.lyricsOpen) resetScrollSoon();
      opts.onLayout?.();
    };
    /** Compact mode and the pin both keep the overlay as it is. */
    const locked = () => Boolean(lastModel?.ui?.study || lastModel?.ui?.keepExpanded);
    const scheduleCollapse = (ms) => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (locked()) return;
        if (scrubbing || isHovered()) return scheduleCollapse(600);
        setCollapsed(true);
      }, ms);
    };
    let wasLocked = false;
    function syncCollapseLock(m) {
      const now = Boolean(m.ui?.study || m.ui?.keepExpanded);
      if (now && collapsed) setCollapsed(false);
      if (!now && wasLocked && opts.collapsible && !isHovered()) scheduleCollapse(1500);
      wasLocked = now;
    }
    function hover(inside) {
      hovering = inside;
      if (!opts.collapsible) return;
      if (inside) {
        clearTimeout(hoverTimer);
        setCollapsed(false);
      } else {
        scheduleCollapse(500);
      }
    }
    if (opts.collapsible) {
      if (!opts.externalHover) {
        root.addEventListener('mouseenter', () => hover(true));
        root.addEventListener('mouseleave', () => hover(false));
      }
      scheduleCollapse(2500); // show it first, then tuck away
    }

    // ---- clicks -------------------------------------------------------
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || !root.contains(b)) return;
      const a = b.dataset.a;
      if (a === 'page') return act('page', Number(b.dataset.v));
      if (a === 'resume') return resumeAutoscroll();
      act(a);
    });

    // ---- seek bar (click or drag) ----------------------------------------
    let scrubbing = false;
    let scrubPct = 0;
    const pctFor = (e) => {
      const r = el.bar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    el.bar.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      scrubbing = true;
      scrubPct = pctFor(e);
      el.bar.classList.add('drag');
      el.bar.setPointerCapture(e.pointerId);
      paintProgress(scrubPct);
    });
    el.bar.addEventListener('pointermove', (e) => {
      if (!scrubbing) return;
      scrubPct = pctFor(e);
      paintProgress(scrubPct);
    });
    const endScrub = (e) => {
      if (!scrubbing) return;
      scrubbing = false;
      el.bar.classList.remove('drag');
      act('seek', e.type === 'pointerup' ? pctFor(e) : scrubPct);
    };
    el.bar.addEventListener('pointerup', endScrub);
    el.bar.addEventListener('pointercancel', endScrub);

    // ---- volume (click / drag / scroll) ------------------------------------
    let volDrag = false;
    let volLocal = null; // what the user just set, until Spotify catches up
    let volLocalUntil = 0;
    let volSentAt = 0;
    const volFor = (e) => {
      const r = el.vbar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    function setVol(v, final) {
      volLocal = v;
      volLocalUntil = Date.now() + 900;
      paintVolume(v, false);
      const now = Date.now();
      if (final || now - volSentAt > 70) {
        volSentAt = now;
        act('volume', v);
      }
    }
    el.vbar.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      volDrag = true;
      el.vbar.classList.add('drag');
      el.vbar.setPointerCapture(e.pointerId);
      setVol(volFor(e), false);
    });
    el.vbar.addEventListener('pointermove', (e) => volDrag && setVol(volFor(e), false));
    const endVol = (e) => {
      if (!volDrag) return;
      volDrag = false;
      el.vbar.classList.remove('drag');
      setVol(volFor(e), true);
    };
    el.vbar.addEventListener('pointerup', endVol);
    el.vbar.addEventListener('pointercancel', endVol);
    el.vol.addEventListener('wheel', (e) => {
      e.preventDefault();
      const base = volLocal ?? lastModel?.volume ?? 0.5;
      setVol(Math.max(0, Math.min(1, base + (e.deltaY < 0 ? 0.05 : -0.05))), true);
    }, { passive: false });

    function paintVolume(v, muted) {
      const shown = muted ? 0 : v;
      const w = `${(shown * 100).toFixed(1)}%`;
      if (el.vfill.style.width !== w) el.vfill.style.width = w;
      const icon = muted || shown === 0 ? 'mute' : shown < 0.5 ? 'low' : 'high';
      if (el.vi.dataset.icon !== icon) {
        el.vi.dataset.icon = icon;
        el.vi.innerHTML = icon === 'mute' ? ICON.volMute : icon === 'low' ? ICON.volLow : ICON.volHigh;
      }
    }

    function paintProgress(pct) {
      const w = `${(pct * 100).toFixed(2)}%`;
      for (const f of el.fills) if (f.style.width !== w) f.style.width = w;
    }

    // ---- lyrics list + autoscroll -------------------------------------
    let autoscroll = true;
    let builtSig = null;
    let lineEls = [];
    let activeIdx = null;
    let lastModel = null;

    const stopAutoscroll = () => {
      if (!autoscroll || !lineEls.length) return;
      autoscroll = false;
      el.resume.hidden = false;
    };
    function resumeAutoscroll() {
      autoscroll = true;
      el.resume.hidden = true;
      scrollToActive(true);
    }
    // Only real user input pauses autoscroll (not our own smooth scrolling).
    el.list.addEventListener('wheel', stopAutoscroll, { passive: true });
    el.list.addEventListener('touchmove', stopAutoscroll, { passive: true });
    el.list.addEventListener('pointerdown', (e) => {
      if (e.target === el.list) stopAutoscroll(); // grabbed the scrollbar
    });
    el.list.addEventListener('keydown', stopAutoscroll);
    el.list.addEventListener('click', (e) => {
      const ln = e.target.closest('.ln');
      if (!ln || el.list.classList.contains('unsynced')) return;
      act('seek-line', Number(ln.dataset.t));
    });

    function scrollToActive(smooth) {
      if (!autoscroll || !lineEls.length) return;
      const target = activeIdx >= 0 ? lineEls[activeIdx] : lineEls[0];
      if (!target) return;
      const top = target.offsetTop - el.list.clientHeight * 0.38 + target.offsetHeight / 2;
      el.list.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }

    function buildList(lines, synced) {
      el.list.textContent = '';
      el.list.classList.toggle('unsynced', !synced);
      const frag = doc.createDocumentFragment();
      frag.append(Object.assign(doc.createElement('div'), { className: 'pad' }));
      lineEls = lines.map((l) => {
        const d = doc.createElement('div');
        d.className = 'ln';
        d.dataset.t = String(l.t);
        d.textContent = l.text;
        frag.append(d);
        return d;
      });
      frag.append(Object.assign(doc.createElement('div'), { className: 'pad' }));
      el.list.append(frag);
      activeIdx = null;
      autoscroll = true;
      el.resume.hidden = true;
    }

    function markActive(idx) {
      if (idx === activeIdx) return;
      activeIdx = idx;
      lineEls.forEach((node, i) => {
        const d = Math.abs(i - idx);
        node.className = 'ln' + (i === idx ? ' act' : d === 1 ? ' d1' : d === 2 ? ' d2' : '') + (i < idx ? ' past' : '');
      });
      scrollToActive(true);
    }

    function renderLyrics(m) {
      const L = m.lyrics;
      const info = lyricsInfo(m);
      const lines = info ? [] : L.lines;
      const sig = info ? `info:${info[0]}` : `${L.key}|${L.source}|${L.match?.index}|${lines.length}`;
      if (sig !== builtSig) {
        builtSig = sig;
        buildList(lines, info ? true : L.synced);
        if (info) {
          el.msg.innerHTML = '';
          el.msg.append(info[0]);
          if (info[1]) el.msg.append(Object.assign(doc.createElement('small'), { textContent: info[1] }));
        }
        el.msg.hidden = !info;
        // Lay out first, then jump straight to the current line.
        raf(() => {
          markActive(m.lineIndex ?? -1);
          scrollToActive(false);
        });
      }
      if (!info) markActive(L.synced ? m.lineIndex ?? -1 : -1);
      const badge = info ? '' : `${L.source === 'spotify' ? 'Spotify' : 'LRCLIB'}${L.synced ? '' : ' · unsynced'}`;
      setText(el.badge, badge);
    }

    // ---- art -------------------------------------------------------------
    let artShown = null;
    function setArt(url) {
      if (url === artShown) return;
      artShown = url;
      for (const img of [el.art, el.sArt]) img.classList.remove('ok');
      el.glow.style.backgroundImage = el.halo.style.backgroundImage = url ? `url("${url}")` : 'none';
      el.halo.classList.toggle('on', Boolean(url));
      if (!url) return;
      const probe = new Image();
      probe.onload = () => {
        if (artShown !== url) return;
        for (const img of [el.art, el.sArt]) {
          img.src = url;
          img.classList.add('ok');
        }
      };
      probe.src = url;
    }

    // ---- render -----------------------------------------------------------
    function render(m) {
      lastModel = m;
      const t = m.track;
      root.classList.toggle('study', m.ui.study);
      root.classList.toggle('paused', !m.isPlaying);
      root.classList.toggle('lyrics-open', m.ui.lyricsOpen && !m.ui.study);
      el.pin.classList.toggle('on', Boolean(m.ui.keepExpanded));
      syncCollapseLock(m);
      el.note.classList.toggle('on', m.ui.lyricsOpen);

      setText(el.ttl, t ? t.title : 'Nothing playing');
      setText(el.sub, t ? t.artist : 'Play something on Spotify');
      setArt(t?.artUrl || '');

      const dur = m.durationMs || 0;
      const pos = Math.min(m.positionMs || 0, dur || Infinity);
      setText(el.cur, fmt(scrubbing ? scrubPct * dur : pos));
      setText(el.dur, fmt(dur));
      if (!scrubbing) paintProgress(dur ? pos / dur : 0);

      const playIcon = m.isPlaying ? ICON.pause : ICON.play;
      for (const b of el.plays) {
        if (b.dataset.icon !== String(m.isPlaying)) {
          b.dataset.icon = String(m.isPlaying);
          b.innerHTML = playIcon;
        }
      }
      el.shuf.classList.toggle('on', m.shuffle);
      el.vol.hidden = m.volume == null;
      if (!volDrag) {
        if (volLocal !== null && Date.now() < volLocalUntil) paintVolume(volLocal, false);
        else {
          volLocal = null;
          if (m.volume != null) paintVolume(m.volume, m.muted);
        }
      }
      el.rep.classList.toggle('on', m.repeat > 0);
      setText(el.one, m.repeat === 2 ? '1' : '');

      // tools page
      const L = m.lyrics && t && m.lyrics.key === t.key ? m.lyrics : null;
      setText(el.offVal, fmtOffset(L?.offsetMs));
      el.later.disabled = el.earlier.disabled = !(L && !L.hidden && L.lines?.length);
      const count = L?.match?.count ?? 0;
      el.match.disabled = count < 2;
      el.unhide.disabled = !L?.hidden; // only for a song whose lyrics were hidden
      setText(el.match, count > 1 ? `Wrong lyrics? (${L.match.index + 1}/${count})` : 'Wrong lyrics?');

      // study strip: current lyric line if there is one, else the title
      const line = L && !L.hidden && L.synced && m.lineIndex >= 0 ? L.lines[m.lineIndex]?.text : null;
      setText(el.sMain, line || (t ? t.title : 'Nothing playing'));
      setText(el.sSub, t ? (line ? `${t.title} · ${t.artist}` : t.artist) : '');

      // collapsed pill: equalizer + song title
      setText(el.pillT, t ? t.title : 'Nothing playing');

      if (m.ui.lyricsOpen && !m.ui.study && !collapsed) renderLyrics(m);
    }

    function resetScrollSoon() {
      builtSig = null;
      if (lastModel) raf(() => render(lastModel));
    }

    return {
      root,
      card: el.card,
      render,
      hover,
      isCollapsed: () => collapsed,
      /** Re-centre the active line (e.g. after the panel was re-opened). */
      resetScroll() {
        builtSig = null;
        if (lastModel) render(lastModel);
      },
      destroy() {
        clearTimeout(hoverTimer);
        root.remove();
      },
    };
  }

  globalThis.SOView = Object.freeze({ STYLE, PIP_DOC_STYLE, mount, fmt });
})();
