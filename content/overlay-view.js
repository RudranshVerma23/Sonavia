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
    back: SVG(14, '<path d="M15 5l-7 7 7 7"/>'),
    gear: SVG(14, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    tasks: SVG(17, '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    stop: SVG(13, '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>'),
    flame: SVG(30, '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
    cup: SVG(30, '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>'),
    bigPause: SVG(30, '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/>'),
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
    sliders: SVG(17, '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
    queue: SVG(16, '<path d="M3 6h13M3 12h13M3 18h8"/><path d="M18 14v8M14 18h8"/>'),
    expand: SVG(14, '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'),
  };

  const STYLE = `
  .so, .so * { box-sizing: border-box; }
  .so {
    --ac: #1db954; --ac-soft: rgba(29,185,84,.16);
    /* dim dark-green light behind the tiles, evenly around their edges */
    --edge-glow: 0 0 14px 1px rgba(20,110,52,.26), 0 0 32px 4px rgba(10,66,30,.16);
    --t1: #fff; --t2: #b3b3b3; --t3: #7a7a7a;
    --card: #000; --line: rgba(255,255,255,.08); --btn: rgba(255,255,255,.07); --btnh: rgba(255,255,255,.14);
    width: var(--so-w, 400px); display: flex; flex-direction: column; gap: 6px;
    font-family: "SpotifyMixUI", "Circular", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--t1); user-select: none; -webkit-font-smoothing: antialiased; line-height: 1.25;
    animation: so-in .22s cubic-bezier(.3,1.4,.6,1);
  }
  @keyframes so-in { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
  .so button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; }

  /* ---------- card ---------- */
  .cardwrap { position: relative; }
  /* edge handles: drag to make the overlay wider (lyrics get more room) */
  .rz { position: absolute; top: 14px; bottom: 14px; width: 10px; z-index: 6; cursor: ew-resize; touch-action: none; }
  .rz.l { left: 0; }
  .rz.r { right: 0; }
  .rz::after { content: ''; position: absolute; top: 50%; left: 50%; width: 3px; height: 30px; margin: -15px 0 0 -1.5px;
               border-radius: 3px; background: rgba(255,255,255,.28); opacity: 0; transition: opacity .15s; }
  .cardwrap:hover .rz::after { opacity: .5; }
  .rz:hover::after, .rz.on::after { opacity: 1; }
  .so.pip .rz { display: none; }
  /* corner handles: drag outward / inward to make the whole overlay bigger / smaller */
  .rzc { position: absolute; bottom: -5px; width: 20px; height: 20px; z-index: 7; touch-action: none; }
  .rzc.bl { left: -5px; cursor: nesw-resize; }
  .rzc.br { right: -5px; cursor: nwse-resize; }
  .rzc::after { content: ''; position: absolute; width: 10px; height: 10px; bottom: 6px; opacity: 0; transition: opacity .15s;
                border: 0 solid rgba(255,255,255,.45); border-bottom-width: 2.5px; }
  .rzc.bl::after { left: 6px; border-left-width: 2.5px; border-bottom-left-radius: 8px; }
  .rzc.br::after { right: 6px; border-right-width: 2.5px; border-bottom-right-radius: 8px; }
  .cardwrap:hover .rzc::after { opacity: .6; }
  .rzc:hover::after, .rzc.on::after { opacity: 1; border-color: var(--ac); }
  .so.pip .rzc { display: none; }
  /* A dim dark-green light behind the card: the same box as the card, so its
     shadow shows only just outside the edges, evenly on every side. */
  .halo { position: absolute; inset: 0; border-radius: 22px; pointer-events: none;
          box-shadow: var(--edge-glow); transition: opacity .8s; }
  .so.paused .halo { opacity: .55; }
  .so.study .halo { border-radius: 18px; }
  .so.pip .halo { display: none; }
  .card {
    position: relative; overflow: hidden; border-radius: 22px; background: var(--card);
    border: 1px solid var(--line);
    padding: 16px 16px 8px; cursor: grab;
  }
  .so.pip .card { cursor: default; }
  .card:active { cursor: grabbing; }
  .glow { display: none; }
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
  /* Only as wide as the song name (it is the click target for search); stops short of the corner buttons. */
  .ttl { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: fit-content; max-width: calc(100% - 58px); }
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

  .ctl { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  /* volume: sits under the album art */
  .vol { flex: 1 1 80px; min-width: 56px; max-width: 120px; display: flex; align-items: center; gap: 4px; margin-right: 0; }
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
  .ctl .note[data-a="lyrics"] { margin-left: auto; }
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
  .foot > * { flex: none; }
  .foot .modes { flex: 0 1 auto; min-width: 0; overflow: hidden; }
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
  .modes { display: flex; align-items: center; gap: 2px; }
  .studybtn { font-size: 9px !important; font-weight: 800; letter-spacing: .07em; color: var(--t3) !important; padding: 2px 6px !important; white-space: nowrap; }
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
    background: linear-gradient(180deg, rgba(0,0,0,.86) 0%, rgba(0,0,0,.95) 100%);
    backdrop-filter: blur(22px) saturate(130%); -webkit-backdrop-filter: blur(22px) saturate(130%);
    box-shadow: var(--edge-glow);
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
  .msg[hidden] { display: none; }
  .badge { position: absolute !important; right: 14px; bottom: 10px; z-index: 3; font-size: 10px; color: var(--t3);
           pointer-events: none; letter-spacing: .04em; }

  /* ---------- collapsed: a small circle with the equalizer (mouse away) ---------- */
  .pill { display: none; }
  .so.collapsed { pointer-events: none; }
  .so.collapsed > :not(.pill) { display: none !important; }
  .so.collapsed .pill {
    display: flex; align-items: center; justify-content: center; align-self: center; pointer-events: auto; cursor: pointer;
    width: 44px; height: 44px; padding: 0; border-radius: 50%;
    background: #000; border: 1px solid var(--line); box-shadow: var(--edge-glow);
    backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%);
    animation: so-pill .22s ease;
  }
  @keyframes so-pill { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: none; } }
  .eq { display: flex; align-items: center; gap: 4px; height: 18px; flex: none; }
  .eq i { width: 4px; height: 6px; border-radius: 2px; background: var(--ac); animation: so-eq 1s ease-in-out infinite; }
  .eq i:nth-child(1) { animation-delay: -.2s; }
  .eq i:nth-child(2) { animation-delay: -.65s; animation-duration: .85s; }
  .eq i:nth-child(3) { animation-delay: -.4s; animation-duration: 1.15s; }
  @keyframes so-eq { 0%, 100% { height: 5px; } 50% { height: 17px; } }
  /* Paused: no animation at all (not frozen mid-bounce), just three still dots.
     Playing again starts the bounce fresh. */
  .so.paused .eq i { animation: none; height: 4px; border-radius: 50%; }
  .pill-t { display: none; }
  /* mouse nearby: the circle grows into a pill with the song title */
  .so.collapsed.near .pill { width: auto; max-width: 280px; padding: 0 22px 0 20px; border-radius: 99px; gap: 14px;
                             justify-content: flex-start; animation: so-grow .2s ease; }
  .so.collapsed.near .pill-t { display: block; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @keyframes so-grow { from { opacity: .6; transform: scaleX(.6); } to { opacity: 1; transform: none; } }

  /* ---------- focus mode ---------- */
  .fx { display: none; }
  .so.focusing { --fc: var(--ac); --fc-soft: var(--ac-soft); }
  .so.focusing.on-break { --fc: #5cc8ff; --fc-soft: rgba(92,200,255,.14); }
  .so.focusing .pages, .so.focusing .foot, .so.focusing .strip, .so.focusing .panel { display: none !important; }
  .so.focusing .fx { display: block; }
  .fx-left { position: absolute !important; top: -6px; left: -6px; display: flex; gap: 6px; z-index: 3; }
  .fx-top { height: 30px; display: flex; align-items: center; justify-content: center; }
  .fx-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; }
  .fx-tbtn { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
             background: var(--btn) !important; color: var(--fc) !important; transition: background .15s; }
  .fx-tbtn:hover { background: var(--btnh) !important; }
  .fx-tbtn.on { background: var(--fc-soft) !important; }
  .fx-body { display: flex; align-items: center; gap: 18px; padding: 6px 2px 4px; }
  .fx-ring { position: relative; width: 104px; height: 104px; flex: none; }
  .fx-ring > svg { width: 100%; height: 100%; transform: rotate(-90deg); display: block; }
  .fx-ring > svg circle { fill: none; stroke-width: 8; }
  .fx-ring .bg { stroke: rgba(255,255,255,.08); }
  .fx-ring .fg { stroke: var(--fc); stroke-linecap: round; transition: stroke-dashoffset .35s linear, stroke .3s; }
  .fx-icon { position: absolute; inset: 0; display: grid; place-items: center; color: var(--fc); opacity: .6; }
  .fx-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .fx-goal { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--fc);
             max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 15px; }
  .fx-goal.muted { color: var(--t3); font-weight: 700; }
  .fx-time { font-size: 34px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.12; }
  .fx-ctl { display: flex; align-items: center; gap: 14px; margin-top: 2px; }
  .fb { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: var(--t2) !important; transition: background .15s, color .15s; }
  .fb:hover { background: var(--btn) !important; color: var(--t1) !important; }
  .fb.hl { background: rgba(255,255,255,.1) !important; color: var(--fc) !important; }
  .fb.stop, .fb.stop:hover { color: #ff4d5e !important; }

  /* panels under the focus tile */
  .fpanel { display: none; position: relative; height: 360px; border-radius: 22px; overflow: hidden; border: 1px solid var(--line);
            background: linear-gradient(180deg, rgba(0,0,0,.86) 0%, rgba(0,0,0,.95) 100%);
            backdrop-filter: blur(22px) saturate(130%); -webkit-backdrop-filter: blur(22px) saturate(130%);
            box-shadow: var(--edge-glow); padding: 18px 20px 14px; flex-direction: column; gap: 12px; }
  .so.focusing.tasks-open .ftasks, .so.focusing.timer-open .ftimer { display: flex; animation: so-drop .28s cubic-bezier(.2,.9,.3,1.1); }
  .so.study .fpanel { display: none !important; }
  .fp-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 800; letter-spacing: .1em; }
  .fp-add { display: flex; gap: 8px; margin: 0; }
  .fp-in { flex: 1; min-width: 0; background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 10px; color: var(--t1);
           font: inherit; font-size: 13px; padding: 9px 12px; outline: none; user-select: text; }
  .fp-in:focus { border-color: var(--fc); }
  .fp-addbtn { background: var(--fc) !important; color: #000 !important; font-weight: 800; font-size: 13px !important; border-radius: 10px; padding: 0 16px !important; }
  .fp-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; }
  .fp-list::-webkit-scrollbar { width: 5px; }
  .fp-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 5px; }
  .fp-empty { color: var(--t3); font-size: 12px; text-align: center; padding: 28px 0; }
  .tk { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; flex: none;
        background: rgba(255,255,255,.03); border: 1px solid var(--line); transition: border-color .15s; }
  .tk.active { border-color: var(--fc); }
  .tk-cb { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--t3) !important; display: grid; place-items: center;
           color: #000 !important; flex: none; font-size: 12px !important; font-weight: 900; line-height: 1; }
  .tk.done .tk-cb { background: var(--fc) !important; border-color: var(--fc) !important; }
  .tk-t { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tk.done .tk-t { text-decoration: line-through; color: var(--t3); }
  .tk-p { font-size: 9px; font-weight: 800; letter-spacing: .06em; padding: 3px 7px; border-radius: 5px; flex: none; }
  .prio-low { color: #1db954; background: rgba(29,185,84,.14); }
  .prio-medium { color: #f0a030; background: rgba(240,160,48,.14); }
  .prio-high { color: #ff5a6a; background: rgba(255,90,106,.14); }
  .tk-x { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 5px; color: var(--t3) !important; font-size: 15px !important; flex: none; }
  .tk-x:hover { color: var(--t1) !important; background: var(--btn) !important; }
  .fp-hint { font-size: 10px; color: var(--t3); text-align: center; }
  .fp-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--t2);
            padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .stp { display: flex; align-items: center; gap: 8px; }
  .stv { min-width: 58px; text-align: center; color: var(--t1); font-variant-numeric: tabular-nums; }
  .fp-sp { flex: 1; }

  /* collapsed circle in focus mode: a countdown ring with the minutes left */
  .cring, .cmin { display: none; }
  .so.collapsed .pill { position: relative; }
  .so.focusing .pill .eq { display: none; }
  .so.focusing .cring { display: block; position: absolute; inset: 2px; transform: rotate(-90deg); }
  .so.focusing .cmin { display: block; font-size: 13px; font-weight: 800; color: var(--fc); font-variant-numeric: tabular-nums; }
  .so.focusing.near .cring, .so.focusing.near .cmin { display: none; }
  .cring circle { fill: none; stroke-width: 3; }
  .cring .bg { stroke: rgba(255,255,255,.08); }
  .cring .fg { stroke: var(--fc); stroke-linecap: round; transition: stroke-dashoffset .35s linear; }

  /* ---------- sound (DJ) panel ---------- */
  .dj { display: none; position: relative; height: 360px; border-radius: 22px; overflow: hidden; border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(0,0,0,.86) 0%, rgba(0,0,0,.95) 100%);
        backdrop-filter: blur(22px) saturate(130%); -webkit-backdrop-filter: blur(22px) saturate(130%);
        box-shadow: var(--edge-glow); padding: 14px 16px 12px; flex-direction: column; gap: 10px; }
  .so.sound-open .dj { display: flex; animation: so-drop .28s cubic-bezier(.2,.9,.3,1.1); }
  .so.study .dj, .so.focusing .dj { display: none !important; }
  .dj-head { display: flex; align-items: center; gap: 10px; flex: none; }
  .dj-title { font-size: 13px; font-weight: 800; letter-spacing: .1em; }
  .dj-stat { display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--t3); white-space: nowrap; }
  .dj-stat::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--t3); flex: none; }
  .dj-stat.live { color: var(--ac); }
  .dj-stat.live::before { background: var(--ac); box-shadow: 0 0 8px var(--ac); animation: so-blink 1.6s ease-in-out infinite; }
  .dj-stat.warn { color: #f0a030; }
  .dj-stat.warn::before { background: #f0a030; }
  @keyframes so-blink { 50% { opacity: .3; } }
  .dj-reset { font-size: 9px !important; font-weight: 800; letter-spacing: .07em; color: var(--t3) !important; padding: 4px 7px !important; border-radius: 6px; }
  .dj-reset:hover { color: var(--t1) !important; background: var(--btn) !important; }
  .dj-presets { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; flex: none; margin: 0 -16px; padding: 0 16px;
                -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 28px), transparent);
                mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 28px), transparent); }
  .dj-presets::-webkit-scrollbar { display: none; }
  .dj-chip { flex: none; font-size: 11px !important; font-weight: 600; padding: 5px 11px !important; border-radius: 99px;
             background: var(--btn) !important; color: var(--t2) !important; border: 1px solid transparent !important;
             transition: background .15s, color .15s, border-color .15s; }
  .dj-chip:hover { color: var(--t1) !important; background: var(--btnh) !important; }
  .dj-chip.on { color: var(--t1) !important; border-color: var(--ac) !important; background: var(--ac-soft) !important; }
  .dj-knobs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; flex: none; }
  .knob { display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: ns-resize; touch-action: none; outline: none;
          border-radius: 12px; padding: 2px 0 3px; }
  .knob:hover { background: rgba(255,255,255,.03); }
  .knob:focus-visible { box-shadow: 0 0 0 2px var(--ac); }
  .knob svg { width: 46px; height: 46px; display: block; overflow: visible; }
  .k-bg, .k-val { fill: none; stroke-width: 4; stroke-linecap: round; }
  .k-bg { stroke: rgba(255,255,255,.1); }
  .k-val { stroke: var(--ac); filter: drop-shadow(0 0 3px rgba(29,185,84,.55)); }
  .k-cap { fill: #151515; stroke: rgba(255,255,255,.09); }
  .k-dot { stroke: #fff; stroke-width: 2.5; stroke-linecap: round; }
  .k-v { font-size: 10px; font-weight: 700; color: var(--t1); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .k-n { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--t3); }
  .k-ghost { fill: none; stroke-width: 4; stroke-linecap: round; stroke: rgba(29,185,84,.45); stroke-dasharray: 2 4; }
  .knob.idle .k-val { stroke: rgba(255,255,255,.3); filter: none; }
  .knob.pulse svg { animation: so-kpulse .5s ease; }
  @keyframes so-kpulse { 40% { transform: scale(1.12); filter: drop-shadow(0 0 8px rgba(29,185,84,.8)); } }
  .knob.idle .k-v { color: var(--t3); }
  .dj-row { display: flex; align-items: center; gap: 8px; flex: none; }
  .dj-lbl { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--t3); }
  .rv-tail { font-size: 9px; font-weight: 700; color: var(--t2); font-variant-numeric: tabular-nums; min-width: 34px; text-align: right; }
  .cyc { display: flex; align-items: center; gap: 2px; background: var(--btn); border-radius: 99px; padding: 2px; }
  .cyc button { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; color: var(--t2) !important; font-size: 14px !important; line-height: 1; }
  .cyc button:hover { background: var(--btnh) !important; color: var(--t1) !important; }
  .cyc span { min-width: 84px; text-align: center; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .dj-eq { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,.06); padding-top: 9px; }
  .faders { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; }
  .fader { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 0; cursor: ns-resize; touch-action: none; outline: none; }
  .f-v { font-size: 9px; color: var(--t2); font-variant-numeric: tabular-nums; height: 11px; }
  .f-tr { position: relative; flex: 1; width: 4px; border-radius: 4px; background: rgba(255,255,255,.1); min-height: 40px; }
  .f-tr::before { content: ''; position: absolute; left: -5px; right: -5px; top: 50%; height: 1px; background: rgba(255,255,255,.2); }
  .fader:focus-visible .f-tr { box-shadow: 0 0 0 2px var(--ac); }
  .f-fill { position: absolute; left: 0; right: 0; border-radius: 4px; background: var(--ac); }
  .f-th { position: absolute; left: 50%; width: 16px; height: 8px; margin: -4px 0 0 -8px; border-radius: 3px; background: #e6e6e6;
          box-shadow: 0 1px 5px rgba(0,0,0,.7); transition: background .15s; }
  .fader:hover .f-th { background: #fff; }
  .f-n { font-size: 9px; color: var(--t3); }
  .so.dj-off .dj-knobs, .so.dj-off .dj-row.mid, .so.dj-off .dj-eq { opacity: .45; }
  .so.pip .dj { flex: 1; height: auto; border-radius: 0; border: 0; border-top: 1px solid var(--line); box-shadow: none; background: #000; }
  .so.desktop .dj { background: linear-gradient(180deg, rgba(0,0,0,.94) 0%, rgba(0,0,0,.98) 100%); }

  /* ---------- song search: the title becomes a search box ---------- */
  .ttl.can-search { cursor: text; transition: color .15s; }
  .ttl.can-search:hover { color: var(--ac); }
  .sq { display: none; width: calc(100% - 88px); margin: -3px 0 -1px -7px; padding: 3px 8px; border-radius: 8px;
        border: 1px solid var(--ac); background: rgba(255,255,255,.06); color: var(--t1); font: inherit; font-size: 14px;
        font-weight: 700; outline: none; user-select: text; -webkit-user-select: text; }
  .sq::placeholder { color: var(--t3); font-weight: 600; }
  .sq::-webkit-search-cancel-button { display: none; }
  .so.searching .ttl { display: none; }
  .so.searching .sq { display: block; }
  .srch { display: none; position: relative; height: 360px; border-radius: 22px; overflow: hidden; border: 1px solid var(--line);
          background: linear-gradient(180deg, rgba(0,0,0,.86) 0%, rgba(0,0,0,.95) 100%);
          backdrop-filter: blur(22px) saturate(130%); -webkit-backdrop-filter: blur(22px) saturate(130%);
          box-shadow: var(--edge-glow); padding: 12px 8px 8px; flex-direction: column; gap: 6px; }
  .so.search-open .srch { display: flex; animation: so-drop .28s cubic-bezier(.2,.9,.3,1.1); }
  .so.search-open .panel, .so.search-open .dj { display: none !important; }
  .so.study .srch, .so.focusing .srch { display: none !important; }
  .sr-head { display: flex; align-items: center; gap: 10px; padding: 0 8px 0 10px; flex: none; }
  .sr-tabs { display: flex; gap: 4px; flex: none; }
  .sr-tabs button { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--t3); padding: 4px 8px; border-radius: 999px;
                    transition: color .12s, background .12s; }
  .sr-tabs button:hover { color: var(--t1); background: var(--btn); }
  .sr-tabs button.on { color: #000; background: var(--ac); }
  .sr-sec { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--t3); padding: 6px 10px 4px; flex: none; }
  .sr-stat { font-size: 10px; font-weight: 700; color: var(--t3); white-space: nowrap; }
  .sr-stat.ok { color: var(--ac); }
  .sr-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; transition: opacity .2s; }
  .srch.loading .sr-list { opacity: .55; }
  .sr-list::-webkit-scrollbar { width: 5px; }
  .sr-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 5px; }
  .sr { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 6px 8px 6px 10px;
        border-radius: 10px; cursor: pointer; flex: none; transition: background .12s; }
  .sr:hover, .sr.hl { background: rgba(255,255,255,.07); }
  .sr img { width: 40px; height: 40px; border-radius: 5px; object-fit: cover; background: #282828; display: block; }
  .sr-n { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sr.now .sr-n { color: var(--ac); }
  .sr-a { font-size: 11px; color: var(--t2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sr-q { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--t2) !important;
          opacity: 0; transition: opacity .12s, background .12s, color .12s; }
  .sr:hover .sr-q, .sr.hl .sr-q { opacity: 1; }
  .sr-q:hover { background: var(--btnh) !important; color: var(--t1) !important; }
  .sr-p svg { width: 14px; height: 14px; }
  .sr-num { width: 40px; height: 40px; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--t3);
            font-variant-numeric: tabular-nums; }
  .sr-more { color: var(--t3); font-size: 11px; text-align: center; padding: 8px; flex: none; border-radius: 8px; }
  .sr-more.tap { cursor: pointer; }
  .sr-more.tap:hover { color: var(--t1); background: rgba(255,255,255,.07); }
  .sr-item { display: none; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .srch.in-item .sr-item { display: flex; }
  .srch.in-item .sr-tabs, .srch.in-item .fp-sp { display: none; }
  .sr-back { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none; color: var(--t2) !important; }
  .sr-back:hover { background: var(--btn) !important; color: var(--t1) !important; }
  .sr-it { font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .sr-playall { flex: none; font-size: 9px !important; font-weight: 800; letter-spacing: .08em; color: #000 !important;
                background: var(--ac) !important; padding: 5px 11px !important; border-radius: 999px; }
  .sr-playall:hover { filter: brightness(1.12); }
  .sr-empty { margin: auto; color: var(--t3); font-size: 13px; text-align: center; padding: 20px; }
  .so.pip .srch { flex: 1; height: auto; border-radius: 0; border: 0; border-top: 1px solid var(--line); box-shadow: none; background: #000; }
  .so.desktop .srch { background: linear-gradient(180deg, rgba(0,0,0,.94) 0%, rgba(0,0,0,.98) 100%); }

  /* ---------- Picture-in-Picture window ---------- */
  .so.pip { width: 100%; height: 100%; gap: 0; animation: none; }
  .so.pip .card { border-radius: 0; border: 0; box-shadow: none; flex: none; background: #000; }
  .so.pip .panel { flex: 1; height: auto; border-radius: 0; border: 0; border-top: 1px solid var(--line); box-shadow: none;
                   background: #000; }
  .so.pip.study .card { height: 100%; display: flex; align-items: center; }
  .so.pip.study .strip { width: 100%; }

  /* ---------- desktop app (transparent window over every app) ---------- */
  /* Nothing behind that window gets blurred, so the surfaces are denser. */
  .so.desktop { animation: none; }
  .so.desktop .card { background: #000; cursor: default; }
  .so.desktop .panel { background: linear-gradient(180deg, rgba(0,0,0,.94) 0%, rgba(0,0,0,.98) 100%); }
  .so.desktop.collapsed .pill { background: #000; }

  /* ---------- circle layout (in web pages) ----------
     The circle stays put; the song name shows beside it when the mouse is near,
     and a click opens the tiles below it (or above, with no room below), on the
     same side as the name. Compact mode's strip takes the circle's place. */
  .so.dotm { width: auto; display: block; gap: 0; animation: none; }
  .so.dotm .stk { position: fixed; left: 0; top: 0; z-index: 1; }
  .so.dotm .stz { width: var(--so-w, 400px); display: flex; flex-direction: column; gap: 6px;
                  animation: so-in .22s cubic-bezier(.3,1.4,.6,1); }
  .so.dotm.up .stz { flex-direction: column-reverse; }
  .so.dotm .pill { display: flex; position: fixed; z-index: 2; align-items: center; justify-content: center; pointer-events: auto;
                   cursor: pointer; width: 44px; height: 44px; padding: 0; border-radius: 50%; background: #000;
                   border: 1px solid var(--line); box-shadow: var(--edge-glow); touch-action: none; }
  .so.dotm.dragging .pill { cursor: grabbing; }
  .so.dotm.collapsed.near .pill { width: 44px; padding: 0; border-radius: 50%; justify-content: center; animation: none; }
  .so.dotm .pill-t { display: none !important; }
  .so.dotm.focusing.near .cring, .so.dotm.focusing.near .cmin { display: block; }
  .so.dotm.study .pill, .so.dotm.study .nm { display: none !important; }
  .so.dotm .nm { position: fixed; z-index: 2; display: none; height: 36px; line-height: 34px; padding: 0 18px; max-width: 280px;
                 border-radius: 99px; background: #000; border: 1px solid var(--line); box-shadow: var(--edge-glow); color: var(--t1);
                 font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
  .so.dotm.collapsed.near:not(.dragging) > .nm { display: block !important; animation: so-pill .18s ease; }
  `;

  // ---------- sound (DJ) panel data ----------
  // EQ curves and preset ideas adapted from Chorus (MIT, (c) 2023 cdrani).
  const EQ_BANDS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  const EQ_PRESETS = [
    ['Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['Bass boost', [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]],
    ['Heavy bass', [9, 8, 6, 3, 0, -1, 0, 0, 0, 0]],
    ['Treble', [0, 0, 0, 0, 0, 1, 2, 4, 5, 6]],
    ['Vocals', [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1]],
    ['Rock', [4, 3, 2, 0, -1, -1, 1, 2, 3, 4]],
    ['Pop', [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2]],
    ['Hip-hop', [5, 4, 2, 3, -1, -1, 1, 0, 1, 2]],
    ['Electronic', [5, 4, 1, 0, -2, 2, 1, 2, 4, 5]],
    ['Jazz', [3, 2, 1, 2, -1, -1, 0, 1, 2, 3]],
    ['Classical', [4, 3, 2, 1, -1, -1, 0, 2, 3, 4]],
    ['Acoustic', [3, 3, 2, 1, 1, 1, 2, 2, 2, 1]],
    ['Loudness', [5, 3, 0, 0, -1, 0, 0, 1, 3, 4]],
    ['Lo-fi', [2, 2, 1, 0, 0, -1, -3, -6, -9, -12]],
    ['Telephone', [-12, -12, -9, -3, 3, 5, 3, -3, -9, -12]],
  ];
  // [id, name, tail in seconds] (the tails match REVERBS in audio-engine.js)
  const SPACES = [
    ['none', 'Dry', 0], ['room', 'Room', 0.6], ['studio', 'Studio', 0.9], ['plate', 'Plate', 1.7], ['hall', 'Concert hall', 2.4],
    ['church', 'Church', 3.6], ['cathedral', 'Cathedral', 5.5], ['cave', 'Cave', 3], ['space', 'Space', 8],
  ];
  const SOUND_DEFAULTS = {
    enabled: false, speed: 1, keepPitch: true, pitch: 0, eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    reverb: 'none', reverbMix: 0.3, width: 1, vocal: 0, preamp: 0,
  };
  const SOUND_PRESETS = [
    ['Normal', {}],
    ['Slowed + reverb', { speed: 0.85, keepPitch: false, reverb: 'hall', reverbMix: 0.35 }],
    ['Nightcore', { speed: 1.25, keepPitch: false }],
    ['Bass boost', { eq: EQ_PRESETS[1][1] }],
    ['Lo-fi', { eq: EQ_PRESETS[13][1], reverb: 'room', reverbMix: 0.25, width: 0.8 }],
    ['Concert', { reverb: 'hall', reverbMix: 0.3, width: 1.3, eq: EQ_PRESETS[12][1] }],
    ['Vaporwave', { speed: 0.8, keepPitch: false, reverb: 'plate', reverbMix: 0.3 }],
    ['Karaoke', { vocal: 0.9 }],
    ['Wide', { width: 1.6 }],
    ['Cathedral', { reverb: 'cathedral', reverbMix: 0.45 }],
  ];
  const signed = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const halfStep = (v) => (v % 1 ? 1 : 0);
  // from: where the coloured arc starts (the "no effect" point)
  const KNOBS = [
    { k: 'speed', n: 'SPEED', min: 0.5, max: 2, def: 1, from: 1, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
    { k: 'pitch', n: 'PITCH', min: -12, max: 12, def: 0, from: 0, step: 0.5, fmt: (v) => `${signed(v, halfStep(v))} st` },
    { k: 'reverbMix', n: 'REVERB', min: 0, max: 1, def: 0.3, from: 0, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { k: 'width', n: 'WIDTH', min: 0, max: 2, def: 1, from: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { k: 'vocal', n: 'VOCALS', min: 0, max: 1, def: 0, from: 0, step: 0.01, fmt: (v) => (v ? `−${Math.round(v * 100)}%` : '0%') },
    { k: 'preamp', n: 'BOOST', min: -12, max: 12, def: 0, from: 0, step: 0.5, fmt: (v) => `${signed(v, halfStep(v))} dB` },
  ];
  function soundState(o) {
    const s = { ...SOUND_DEFAULTS, ...(o || {}) };
    s.eq = SOUND_DEFAULTS.eq.map((_, i) => Number(s.eq?.[i]) || 0);
    delete s.status;
    return s;
  }
  // Knob arcs: 270° sweep, from bottom-left (135°) round to bottom-right (405°).
  const KA0 = 135;
  const KSWEEP = 270;
  const kPoint = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return [23 + r * Math.cos(a), 23 + r * Math.sin(a)];
  };
  function kArc(d0, d1, r = 18) {
    if (Math.abs(d1 - d0) < 0.5) return '';
    const [a, b] = d0 < d1 ? [d0, d1] : [d1, d0];
    const [x0, y0] = kPoint(a, r);
    const [x1, y1] = kPoint(b, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  const PIP_DOC_STYLE = `
    :root { color-scheme: dark; }
    html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
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
   * @param {{pip?: boolean, desktop?: boolean, collapsible?: boolean, onLayout?: () => void,
   *   onResize?: (e: {phase: 'start'|'move'|'end', side: 'l'|'r', width: number, startWidth: number, scale: number}) => void,
   *     (widths are on-screen pixels, i.e. after scaling)
   *   maxWidth?: () => number, onAction: (name: string, arg?: any) => void}} opts
   */
  function mount(doc, container, opts) {
    const act = opts.onAction;
    const root = doc.createElement('div');
    root.className = 'so' + (opts.pip ? ' pip' : '') + (opts.desktop ? ' desktop' : '');
    root.innerHTML = `
      <div class="pill" title="Hover to expand"><span class="eq"><i></i><i></i><i></i></span><span class="pill-t"></span>
        <svg class="cring" viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19"/></svg><span class="cmin"></span></div>
      <div class="cardwrap"><div class="halo"></div>
      <div class="rz l" title="Drag to resize"></div><div class="rz r" title="Drag to resize"></div>
      <div class="rzc bl" title="Drag to resize the whole overlay · double-click to reset"></div><div class="rzc br" title="Drag to resize the whole overlay · double-click to reset"></div>
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
              <input class="sq" type="search" placeholder="Search songs…" maxlength="120" autocomplete="off" spellcheck="false" aria-label="Search Spotify">
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
              <button class="note" data-a="lyrics" title="Lyrics">${ICON.note}</button>
              <button class="note djb" data-a="sound" title="Sound: speed, pitch, equalizer, reverb">${ICON.sliders}</button>
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
          <div class="modes">
            <button class="studybtn" data-a="study" title="Slim strip with the current lyric line. Stays put until you exit it.">COMPACT MODE</button>
            <button class="studybtn" data-a="focus-enter" title="Focus timer with breaks, tasks and goals">FOCUS MODE</button>
          </div>
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
        <div class="fx">
          <div class="fx-left">
            <button class="ib" data-a="focus-timer" title="Timer lengths">${ICON.gear}</button>
            <button class="ib" data-a="focus-exit" title="Back to the player">${ICON.note}</button>
          </div>
          <div class="fx-top"><div class="fx-title"><span class="fx-name">Focus Mode</span>
            <button class="fx-tbtn" data-a="focus-tasks" title="Tasks &amp; goals">${ICON.tasks}</button></div></div>
          <div class="fx-body">
            <div class="fx-ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44"/></svg><div class="fx-icon"></div></div>
            <div class="fx-main">
              <div class="fx-goal"></div>
              <div class="fx-time">25:00</div>
              <div class="fx-ctl">
                <button class="fb fplay" data-a="focus-play" title="Start / pause">${ICON.play}</button>
                <button class="fb fnext" data-a="focus-next" title="Next">${ICON.next}</button>
                <button class="fb stop" data-a="focus-stop" title="Stop (back to a fresh focus timer)">${ICON.stop}</button>
              </div>
            </div>
          </div>
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
      </div>
      <div class="dj">
        <div class="dj-head"><span class="dj-title">SOUND</span><span class="dj-stat"></span><span class="fp-sp"></span>
          <button class="dj-reset" data-dj="reset" title="Put every effect back to normal">RESET</button>
          <button class="sw dj-on" data-dj="power" title="Sound effects on / off"><i></i></button></div>
        <div class="dj-presets"></div>
        <div class="dj-knobs"></div>
        <div class="dj-row mid">
          <button class="sw dj-vinyl" data-dj="vinyl" title="Vinyl: speed also changes the pitch, like a record played faster or slower (how nightcore and slowed + reverb sound). Off: speed changes only the tempo. The pitch it adds shows on the Pitch knob as a dotted arc."><i></i>Vinyl</button>
          <span class="fp-sp"></span><span class="dj-lbl">SPACE</span><span class="rv-tail"></span>
          <div class="cyc rv"><button data-dj="rv-" title="Previous reverb space">‹</button><span></span><button data-dj="rv+" title="Next reverb space">›</button></div>
        </div>
        <div class="dj-eq">
          <div class="dj-row"><span class="dj-lbl">EQUALIZER</span><span class="fp-sp"></span>
            <div class="cyc eqp"><button data-dj="eq-" title="Previous EQ preset">‹</button><span></span><button data-dj="eq+" title="Next EQ preset">›</button></div></div>
          <div class="faders"></div>
        </div>
      </div>
      <div class="srch">
        <div class="sr-head"><div class="sr-tabs"><button data-kind="songs">SONGS</button><button data-kind="albums">ALBUMS</button><button data-kind="playlists">PLAYLISTS</button></div>
          <div class="sr-item"><button class="sr-back" title="Back (Esc)">${ICON.back}</button><span class="sr-it"></span><button class="sr-playall" title="Play all of it">PLAY</button></div><span class="sr-stat"></span><span class="fp-sp"></span>
          <button class="dj-reset" data-sr="close" title="Back to the player (Esc)">CANCEL</button></div>
        <div class="sr-list"></div>
      </div>
      <div class="fpanel ftasks">
        <div class="fp-head"><span>TASKS &amp; GOALS</span><button class="ib" data-a="focus-tasks" title="Close">${ICON.close}</button></div>
        <form class="fp-add"><input class="fp-in" placeholder="New task…" maxlength="120" autocomplete="off" spellcheck="false"><button class="fp-addbtn" type="submit">Add</button></form>
        <div class="fp-list"></div>
        <div class="fp-hint">Right-click to change priority · Middle-click to set active goal</div>
      </div>
      <div class="fpanel ftimer">
        <div class="fp-head"><span>TIMER</span><button class="ib" data-a="focus-timer" title="Close">${ICON.close}</button></div>
        <div class="fp-row"><span>Focus length</span><div class="stp">
          <button class="sb" data-a="flen" data-w="focus" data-d="-1">−</button><span class="stv fmin"></span><button class="sb" data-a="flen" data-w="focus" data-d="1">+</button></div></div>
        <div class="fp-row"><span>Break length</span><div class="stp">
          <button class="sb" data-a="flen" data-w="break" data-d="-1">−</button><span class="stv bmin"></span><button class="sb" data-a="flen" data-w="break" data-d="1">+</button></div></div>
        <div class="fp-row"><span>Chime when a period ends</span><button class="sw chime" data-a="focus-chime"><i></i></button></div>
        <div class="fp-sp"></div>
        <div class="fp-hint">An unstarted timer updates right away; a running one keeps its length until the next period.</div>
      </div>`;
    container.appendChild(root);

    const q = (s) => root.querySelector(s);
    const qa = (s) => [...root.querySelectorAll(s)];
    // Circle layout (opts.dot, in web pages): the circle, the song name beside it
    // and the tiles (.stk) are each placed on the page by placeDot().
    const dotMode = Boolean(opts.dot);
    let stk = null;
    let stz = null; // inside .stk: the tiles, at the overlay's size (zoom)
    let nm = null;
    if (dotMode) {
      root.classList.add('dotm');
      stk = doc.createElement('div');
      stk.className = 'stk';
      stz = doc.createElement('div');
      stz.className = 'stz';
      for (const ch of [...root.children]) if (!ch.classList.contains('pill')) stz.append(ch);
      stk.append(stz);
      nm = doc.createElement('div');
      nm.className = 'nm';
      root.append(stk, nm);
      root.querySelector('.pill').title = 'Click to open · drag to move';
    }
    const fixedSize = Boolean(opts.pip || opts.popup); // the window's own size
    const el = {
      card: q('.card'), glow: q('.glow'), halo: q('.halo'),
      pin: q('.pin'),
      art: q('.art img'), sArt: q('.s-art img'),
      ttl: q('.ttl'), sub: q('.sub'), cur: q('.cur'), dur: q('.dur'),
      bar: q('.main-bar'), fills: qa('.prog .fill, .s-bar .fill'),
      vol: q('.vol'), vbar: q('.vbar'), vfill: q('.vbar .fill'), vi: q('.vol .vi'),
      plays: qa('.cb.play'), shuf: q('.shuf'), rep: q('.rep'), one: q('.rep .one'), note: q('.note'), djb: q('.djb'),
      offVal: q('.off-val'), later: q('[data-a="later"]'), earlier: q('[data-a="earlier"]'),
      match: q('.match'), unhide: q('.unhide'),
      sMain: q('.s-main'), sSub: q('.s-sub'),
      pillT: q('.pill-t'), pill: q('.pill'),
      list: q('.list'), msg: q('.msg'), resume: q('.resume'), badge: q('.badge'),
    };

    const raf = (fn) => (doc.defaultView || window).requestAnimationFrame(fn);
    const setText = (node, value) => {
      if (node.textContent !== value) node.textContent = value;
    };

    // ---- width (drag either edge of the card) ------------------------------
    const MIN_W = 400;
    const MAX_W = 1600;
    let resizing = null; // { side, startX, startW, w, handle }
    let pendingW = null; // width just set here, until the model confirms it
    let pendingUntil = 0;
    let shownW = null;
    // Widths here are the overlay's own (unscaled) pixels; the onResize
    // callback gets on-screen pixels (width × scale).
    const maxScreenW = () => Math.max(MIN_W, Math.min(MAX_W * MAX_S, opts.maxWidth ? opts.maxWidth() : MAX_W * MAX_S));
    const maxW = () => Math.max(MIN_W, Math.min(MAX_W, Math.floor(maxScreenW() / curScale())));
    function applyWidth(w) {
      if (fixedSize || w === shownW) return;
      shownW = w;
      root.style.setProperty('--so-w', `${w}px`);
    }
    const curW = () => shownW ?? MIN_W;

    // ---- size of the whole overlay (drag a bottom corner) ----------------------
    const MIN_S = 0.7;
    const MAX_S = 1.6;
    let shownS = 1;
    let pendingS = null; // scale just set here, until the model confirms it
    let pendingSUntil = 0;
    const curScale = () => (fixedSize ? 1 : shownS);
    function applyScale(s) {
      if (fixedSize || s === shownS) return;
      shownS = s;
      (stz || root).style.zoom = s === 1 ? '' : String(s);
      layout();
    }
    /** The overlay's size or contents changed: tell the host, re-place the circle layout. */
    function layout() {
      opts.onLayout?.();
      if (dotMode) raf(placeDot);
    }

    /** Shared pointer plumbing for the edge and corner handles. */
    function dragHandle(handle, { start, move, end }) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        resizing = { handle, startX: e.screenX, startY: e.screenY, ...start() };
        handle.classList.add('on');
        try {
          handle.setPointerCapture(e.pointerId);
        } catch {
          // capture is optional
        }
      });
      handle.addEventListener('pointermove', (e) => {
        if (resizing?.handle !== handle) return;
        move(e.screenX - resizing.startX, e.screenY - resizing.startY);
      });
      const stop = () => {
        if (resizing?.handle !== handle) return;
        const r = resizing;
        resizing = null;
        handle.classList.remove('on');
        end(r);
      };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
      handle.addEventListener('lostpointercapture', stop);
    }
    const resizeEvent = (phase, side, w, startW, s = curScale()) =>
      opts.onResize?.({ phase, side, width: Math.round(w * s), startWidth: Math.round(startW * s), scale: s });

    for (const handle of root.querySelectorAll('.rz')) {
      const side = handle.classList.contains('l') ? 'l' : 'r';
      dragHandle(handle, {
        start() {
          const startW = curW();
          resizeEvent('start', side, startW, startW);
          return { startW, w: startW };
        },
        move(dx) {
          const s = curScale();
          const w = Math.round(Math.max(MIN_W, Math.min(maxW(), resizing.startW + (side === 'r' ? dx : -dx) / s)));
          if (w === resizing.w) return;
          resizing.w = w;
          applyWidth(w);
          resizeEvent('move', side, w, resizing.startW);
        },
        end({ w, startW }) {
          pendingW = w;
          pendingUntil = Date.now() + 2000;
          resizeEvent('end', side, w, startW);
          act('width', w);
        },
      });
    }

    for (const handle of root.querySelectorAll('.rzc')) {
      // Bottom-right grows right and down; bottom-left grows left and down
      // (its right edge stays put).
      const side = handle.classList.contains('bl') ? 'l' : 'r';
      const sizeFor = (startS, startScreenW, dx, dy) => {
        const outward = ((side === 'r' ? dx : -dx) + dy) / 2;
        const s = startS * (startScreenW + outward) / startScreenW;
        const fits = maxScreenW() / curW();
        return Math.round(Math.max(MIN_S, Math.min(MAX_S, fits, s)) * 100) / 100;
      };
      dragHandle(handle, {
        start() {
          const startS = curScale();
          const w = curW();
          resizeEvent('start', side, w, w, startS);
          return { startS, s: startS, startScreenW: w * startS };
        },
        move(dx, dy) {
          const s = sizeFor(resizing.startS, resizing.startScreenW, dx, dy);
          if (s === resizing.s) return;
          resizing.s = s;
          applyScale(s);
          // report as a width change in screen pixels, so hosts keep the far edge still
          resizeEvent('move', side, curW(), resizing.startScreenW / s, s);
        },
        end({ s, startScreenW }) {
          pendingS = s;
          pendingSUntil = Date.now() + 2000;
          resizeEvent('end', side, curW(), startScreenW / s, s);
          act('scale', s);
        },
      });
      handle.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const w = curW();
        const before = curScale();
        resizeEvent('start', side, w, w, before);
        applyScale(1);
        resizeEvent('end', side, w, (w * before), 1);
        pendingS = 1;
        pendingSUntil = Date.now() + 2000;
        act('scale', 1);
      });
    }

    // ---- collapse to a pill when the mouse is away --------------------------
    // In the page, hover comes from DOM events. The desktop app passes clicks
    // through its transparent window, so it reports hover itself via hover().
    // The circle layout (opts.dot) opens on a click instead; see below.
    let hoverTimer = null;
    let dwellTimer = null;
    let collapsed = false;
    let hovering = false;
    let openedBy = 'click'; // circle layout: how the tiles were opened ('click' | 'hover')
    const isHovered = () => (opts.externalHover ? hovering : root.matches(':hover'));
    const setCollapsed = (v) => {
      if (v === collapsed) return;
      collapsed = v;
      root.classList.toggle('collapsed', v);
      // Shrunk: the search box lets go of the keyboard (typing goes to the page again).
      if (v && searching && sq.matches(':focus')) sq.blur();
      if (!v) setNear(false);
      if (!v && lastModel?.ui.lyricsOpen) resetScrollSoon();
      layout();
    };
    /**
     * Compact mode and the pin keep the overlay as it is. An open search doesn't:
     * like lyrics, it shrinks when the mouse leaves and is still open when it grows.
     */
    const locked = () => Boolean(lastModel?.ui?.study || lastModel?.ui?.keepExpanded);
    const scheduleCollapse = (ms) => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (locked()) return;
        if (scrubbing || resizing || isHovered()) return scheduleCollapse(600);
        setCollapsed(true);
      }, ms);
    };
    let wasLocked = false;
    function syncCollapseLock(m) {
      const now = Boolean(m.ui?.study || m.ui?.keepExpanded);
      // Compact mode is always shown. The pin keeps it open, except that in the
      // circle layout the circle itself can still close it.
      const force = dotMode ? Boolean(m.ui?.study) : now;
      if (force && collapsed) setCollapsed(false);
      // The circle layout stays open until it's closed (the circle, Esc, a click elsewhere).
      if (!now && wasLocked && opts.collapsible && !dotMode && !isHovered()) scheduleCollapse(1500);
      wasLocked = now;
    }
    // Mouse nearby (but not on it) while collapsed: show the title pill.
    // Distances are measured from the pill's full size, so the pill appears
    // before the mouse reaches it and opening the overlay stays deliberate.
    const NEAR_PX = 70;
    let near = false;
    let pillW = 240;
    function setNear(v) {
      if (v === near) return;
      near = v;
      root.classList.toggle('near', v);
      layout();
    }
    /** @param {number} x @param {number} y pointer in viewport (client) coordinates */
    function pointer(x, y) {
      if (!collapsed || dotMode) return; // the circle layout: only on the circle itself (below)
      const r = el.pill.getBoundingClientRect();
      if (!r.width) return;
      if (near && !dotMode) pillW = r.width;
      const pw = dotMode ? r.width : pillW; // the circle layout's circle doesn't grow
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = Math.max(0, Math.abs(x - cx) - pw / 2);
      const dy = Math.max(0, Math.abs(y - cy) - r.height / 2);
      const d = Math.hypot(dx, dy);
      if (!near && d <= NEAR_PX) setNear(true);
      else if (near && d > NEAR_PX + 25) setNear(false);
    }
    let pointerFrame = 0;
    const onDocMove = (e) => {
      if (!collapsed || pointerFrame) return;
      const { clientX, clientY } = e;
      pointerFrame = (doc.defaultView || window).requestAnimationFrame(() => {
        pointerFrame = 0;
        pointer(clientX, clientY);
      });
    };
    const onDocLeave = () => setNear(false);

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

    // ---- circle layout: placing, opening, moving ---------------------------------
    // Where the circle is kept: its distance from the nearest edges, so it stays
    // in its corner in a window of another size.
    const DOT = 44;
    const GAP = 8;
    const EDGE = 4;
    const win = () => doc.defaultView || window;
    /** The page's visible area, without its scrollbars (min: some pages' root is taller than the window). */
    const viewSize = () => {
      const w = win();
      const e = doc.documentElement;
      return { vw: Math.min(e.clientWidth || Infinity, w.innerWidth), vh: Math.min(e.clientHeight || Infinity, w.innerHeight) };
    };
    const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let dotAt = { h: 'r', x: 24, v: 't', y: 72 };
    const dot = { left: 0, top: 0 };
    function fromAnchor() {
      const { vw, vh } = viewSize();
      dot.left = dotAt.h === 'r' ? vw - DOT - dotAt.x : dotAt.x;
      dot.top = dotAt.v === 'b' ? vh - DOT - dotAt.y : dotAt.y;
    }
    function toAnchor() {
      const { vw, vh } = viewSize();
      const h = dot.left + DOT / 2 > vw / 2 ? 'r' : 'l';
      const v = dot.top + DOT / 2 > vh / 2 ? 'b' : 't';
      return {
        h,
        x: Math.round(h === 'r' ? vw - DOT - dot.left : dot.left),
        v,
        y: Math.round(v === 'b' ? vh - DOT - dot.top : dot.top),
      };
    }
    /**
     * Put the circle where it is kept, and the tiles below it (above if there's
     * no room below) and the name beside it, both on the right of it if the tiles
     * fit there, else on its left. Compact mode's strip sits in the circle's place.
     */
    function placeDot() {
      if (!dotMode) return;
      const { vw, vh } = viewSize();
      dot.left = clampN(dot.left, EDGE, vw - DOT - EDGE);
      dot.top = clampN(dot.top, EDGE, vh - DOT - EDGE);
      el.pill.style.left = `${dot.left}px`;
      el.pill.style.top = `${dot.top}px`;
      const study = root.classList.contains('study');
      const box = stk.getBoundingClientRect();
      const sw = box.width || curW() * curScale();
      const sh = box.height || 180 * curScale();
      const fitsR = dot.left + sw <= vw - EDGE;
      const fitsL = dot.left + DOT - sw >= EDGE;
      const downTop = study ? dot.top : dot.top + DOT + GAP;
      const upBottom = study ? dot.top + DOT : dot.top - GAP;
      const fitsD = downTop + sh <= vh - EDGE;
      const fitsU = upBottom - sh >= EDGE;
      // The strip keeps the circle's corner nearest the screen's edges; the tiles
      // go right and below when they fit there.
      const preferR = study ? dot.left + DOT / 2 < vw / 2 : true;
      const preferD = study ? dot.top + DOT / 2 < vh / 2 : true;
      const right = (preferR ? fitsR : !fitsL) || (fitsR === fitsL ? vw - dot.left >= dot.left + DOT : fitsR);
      const below = (preferD ? fitsD : !fitsU) || (fitsD === fitsU ? vh - downTop >= upBottom : fitsD);
      root.classList.toggle('up', !below);
      const left = clampN(right ? dot.left : dot.left + DOT - sw, EDGE, Math.max(EDGE, vw - sw - EDGE));
      const top = clampN(below ? downTop : upBottom - sh, EDGE, Math.max(EDGE, vh - sh - EDGE));
      stk.style.left = `${left}px`;
      stk.style.top = `${top}px`;
      if (nm.offsetWidth) {
        nm.style.top = `${dot.top + (DOT - nm.offsetHeight) / 2}px`;
        nm.style.left = `${right ? dot.left + DOT + GAP : dot.left - GAP - nm.offsetWidth}px`;
      }
    }
    let dragDot = null; // { id, sx, sy, l, t, moved, circle }
    /** Where it's kept changed (another tab moved it). */
    function setDot(anchor) {
      if (!dotMode || !anchor || dragDot) return;
      dotAt = { ...dotAt, ...anchor };
      fromAnchor();
      placeDot();
    }
    const openTiles = (how) => {
      openedBy = how;
      clearTimeout(hoverTimer);
      setCollapsed(false);
    };
    const closeTiles = () => {
      clearTimeout(dwellTimer);
      clearTimeout(hoverTimer);
      setCollapsed(true);
    };
    function startDrag(e, circle) {
      dragDot = { id: e.pointerId, sx: e.clientX, sy: e.clientY, l: dot.left, t: dot.top, moved: false, circle };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // capture is optional
      }
    }
    function moveDrag(e) {
      const d = dragDot;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 5) return; // a click, so far
      if (!d.moved) {
        d.moved = true;
        root.classList.add('dragging');
        clearTimeout(dwellTimer);
      }
      dot.left = d.l + dx;
      dot.top = d.t + dy;
      placeDot();
    }
    function endDrag(e) {
      const d = dragDot;
      if (!d || e.pointerId !== d.id) return;
      dragDot = null;
      root.classList.remove('dragging');
      if (d.moved) {
        dotAt = toAnchor();
        opts.onDotMove?.(dotAt);
      } else if (d.circle) {
        if (collapsed) openTiles('click');
        else closeTiles();
      }
    }
    // Elsewhere on the page, a click or Esc closes the tiles (unless pinned, or in compact mode).
    const onDocDown = (e) => {
      if (collapsed || locked() || e.composedPath().includes(root)) return;
      closeTiles();
    };
    const onDocKey = (e) => {
      if (e.key !== 'Escape' || collapsed || locked()) return;
      closeTiles();
    };
    const onWinResize = () => {
      fromAnchor();
      placeDot();
    };
    if (dotMode) {
      el.pill.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        startDrag(e, true);
      });
      // The tiles move with it: drag them by any spot that isn't a control.
      el.card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button, .bar, .vbar, input, a, .ttl, .sr-list, .rz, .rzc')) return;
        e.preventDefault();
        startDrag(e, false);
      });
      for (const t of [el.pill, el.card]) {
        t.addEventListener('pointermove', moveDrag);
        t.addEventListener('pointerup', endDrag);
        t.addEventListener('pointercancel', (e) => {
          if (dragDot?.id !== e.pointerId) return;
          dragDot = null;
          root.classList.remove('dragging');
        });
      }
      // "Open on hover" (a setting): rest the mouse on the circle for a moment.
      el.pill.addEventListener('mouseenter', () => {
        if (!lastModel?.settings?.hoverOpen || !collapsed) return;
        clearTimeout(dwellTimer);
        dwellTimer = setTimeout(() => {
          if (collapsed && !dragDot) openTiles('hover');
        }, 450);
      });
      el.pill.addEventListener('mouseleave', () => clearTimeout(dwellTimer));
      // The song name shows while the mouse is on the circle (not just near it).
      el.pill.addEventListener('mouseenter', () => collapsed && setNear(true));
      el.pill.addEventListener('mouseleave', () => setNear(false));
      // Opened by hover: closes again a moment after the mouse leaves it.
      for (const t of [el.pill, stk]) {
        t.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
        t.addEventListener('mouseleave', () => {
          if (!collapsed && openedBy === 'hover') scheduleCollapse(1000);
        });
      }
    }
    if (opts.collapsible) {
      if (!opts.externalHover) {
        if (!dotMode) {
          root.addEventListener('mouseenter', () => hover(true));
          root.addEventListener('mouseleave', () => hover(false));
        }
        doc.addEventListener('mousemove', onDocMove, { passive: true });
        doc.documentElement.addEventListener('mouseleave', onDocLeave);
      }
      if (dotMode) {
        doc.addEventListener('pointerdown', onDocDown, true);
        doc.addEventListener('keydown', onDocKey);
        win().addEventListener('resize', onWinResize);
        fromAnchor();
        if (!opts.startOpen) {
          collapsed = true; // (setCollapsed needs the search box, made further down)
          root.classList.add('collapsed');
        }
        raf(placeDot);
      } else {
        scheduleCollapse(2500); // show it first, then tuck away
      }
    }

    // ---- clicks -------------------------------------------------------
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || !root.contains(b)) return;
      const a = b.dataset.a;
      if (a === 'page') return act('page', Number(b.dataset.v));
      if (a === 'resume') return resumeAutoscroll();
      if (a === 'flen') return act('focus-len', { which: b.dataset.w, delta: Number(b.dataset.d) });
      act(a);
    });

    // ---- focus mode: tasks & goals ------------------------------------------------
    const fx = {
      name: q('.fx-name'), tbtn: q('.fx-tbtn'), fg: q('.fx-ring .fg'), icon: q('.fx-icon'),
      goal: q('.fx-goal'), time: q('.fx-time'), play: q('.fplay'), next: q('.fnext'),
      form: q('.fp-add'), input: q('.fp-in'), list: q('.fp-list'),
      fmin: q('.fmin'), bmin: q('.bmin'), chime: q('.sw.chime'),
      cfg: q('.cring .fg'), cmin: q('.cmin'),
    };
    const RING_C = 2 * Math.PI * 44;
    const CRING_C = 2 * Math.PI * 19;
    fx.fg.style.strokeDasharray = `${RING_C}`;
    fx.cfg.style.strokeDasharray = `${CRING_C}`;

    fx.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = fx.input.value.trim();
      if (text) act('task-add', text);
      fx.input.value = '';
    });
    // Typing here must not trigger the page's own keyboard shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) fx.input.addEventListener(type, (e) => e.stopPropagation());

    const taskId = (e) => e.target.closest('.tk')?.dataset.id;
    fx.list.addEventListener('click', (e) => {
      const id = taskId(e);
      if (!id) return;
      if (e.target.closest('.tk-cb')) act('task-toggle', id);
      else if (e.target.closest('.tk-x')) act('task-del', id);
    });
    fx.list.addEventListener('contextmenu', (e) => {
      const id = taskId(e);
      if (!id) return;
      e.preventDefault();
      act('task-prio', id);
    });
    fx.list.addEventListener('mousedown', (e) => {
      if (e.button === 1 && taskId(e)) e.preventDefault(); // no autoscroll cursor
    });
    fx.list.addEventListener('auxclick', (e) => {
      const id = taskId(e);
      if (e.button === 1 && id) {
        e.preventDefault();
        act('task-active', id);
      }
    });
    fx.list.addEventListener('dblclick', (e) => {
      const id = taskId(e);
      if (id && !e.target.closest('button')) act('task-active', id);
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
    // ---- sound (DJ) panel --------------------------------------------------------
    // Knobs: drag up / down (Shift = fine), scroll, arrow keys; double-click resets.
    // Faders: click or drag to a level; double-click resets.
    const dj = {
      stat: q('.dj-stat'), power: q('.dj-on'), vinyl: q('.dj-vinyl'), tail: q('.rv-tail'), presets: q('.dj-presets'),
      knobs: q('.dj-knobs'), faders: q('.faders'), rv: q('.cyc.rv span'), eqp: q('.cyc.eqp span'),
    };
    dj.presets.innerHTML = SOUND_PRESETS.map(([name], i) => `<button class="dj-chip" data-dj="preset" data-i="${i}">${name}</button>`).join('');
    dj.knobs.innerHTML = KNOBS.map(
      (k) => `<div class="knob" data-k="${k.k}" role="slider" tabindex="0" aria-label="${k.n}" title="${k.n}: drag, scroll or use the arrow keys · double-click to reset">
        <svg viewBox="0 0 46 46"><path class="k-bg" d="${kArc(KA0, KA0 + KSWEEP)}"/><path class="k-ghost"/><path class="k-val"/>
        <circle class="k-cap" cx="23" cy="23" r="12.5"/><line class="k-dot"/></svg>
        <span class="k-v"></span><span class="k-n">${k.n}</span></div>`,
    ).join('');
    dj.faders.innerHTML = EQ_BANDS.map(
      (b, i) => `<div class="fader" data-b="${i}" role="slider" tabindex="0" aria-label="${b}Hz" aria-valuemin="-12" aria-valuemax="12" title="${b}Hz · double-click for 0 dB">
        <span class="f-v"></span><div class="f-tr"><div class="f-fill"></div><div class="f-th"></div></div><span class="f-n">${b}</span></div>`,
    ).join('');
    const knobEls = new Map(KNOBS.map((k) => [k.k, dj.knobs.querySelector(`[data-k="${k.k}"]`)]));
    const faderEls = [...dj.faders.querySelectorAll('.fader')];

    let snd = soundState({});
    let sndSig = '';
    let holdUntil = 0; // the model lags behind a change made here; don't let it undo the change
    let djDrag = false;
    let pendingSound = null;
    let soundTimer = 0;
    let soundSentAt = 0;
    let lastSpace = 'hall';

    function flushSound() {
      clearTimeout(soundTimer);
      soundTimer = 0;
      const p = pendingSound;
      pendingSound = null;
      soundSentAt = Date.now();
      if (p) act('sound-set', p);
    }
    /** Change the sound: shown at once, sent to the Spotify tab at most ~16×/s. */
    function setSound(patch, final = true) {
      if (!('enabled' in patch) && !snd.enabled) patch = { ...patch, enabled: true };
      snd = { ...snd, ...patch };
      if (snd.reverb !== 'none') lastSpace = snd.reverb;
      paintDj();
      pendingSound = { ...(pendingSound || {}), ...patch };
      holdUntil = Date.now() + 900;
      if (final || Date.now() - soundSentAt > 60) flushSound();
      else if (!soundTimer) soundTimer = setTimeout(flushSound, 60);
    }

    const clampTo = (k, v) => {
      v = Math.min(k.max, Math.max(k.min, v));
      v = Math.round(v / k.step) * k.step;
      return Number(v.toFixed(3));
    };
    function setKnob(k, v, final) {
      const patch = { [k.k]: clampTo(k, v) };
      if (k.k === 'reverbMix' && snd.reverb === 'none' && patch.reverbMix > 0) patch.reverb = lastSpace;
      setSound(patch, final);
    }

    /** Semitones the speed adds in vinyl mode (0 when speed only changes the tempo). */
    const vinylSemis = () => (snd.keepPitch || snd.speed === 1 ? 0 : 12 * Math.log2(snd.speed));

    function paintKnob(k) {
      const box = knobEls.get(k.k);
      const v = snd[k.k];
      const deg = (x) => KA0 + (KSWEEP * (Math.min(k.max, Math.max(k.min, x)) - k.min)) / (k.max - k.min);
      box.querySelector('.k-val').setAttribute('d', kArc(deg(k.from), deg(v)));
      // Pitch: what you hear is the knob plus what vinyl speed adds (dotted arc).
      const extra = k.k === 'pitch' ? vinylSemis() : 0;
      const total = v + extra;
      box.querySelector('.k-ghost').setAttribute('d', extra ? kArc(deg(v), deg(total)) : '');
      const [x1, y1] = kPoint(deg(v), 5);
      const [x2, y2] = kPoint(deg(v), 10.5);
      const dot = box.querySelector('.k-dot');
      dot.setAttribute('x1', x1.toFixed(2));
      dot.setAttribute('y1', y1.toFixed(2));
      dot.setAttribute('x2', x2.toFixed(2));
      dot.setAttribute('y2', y2.toFixed(2));
      const off = k.k === 'reverbMix' ? snd.reverb === 'none' : total === k.from;
      box.classList.toggle('idle', off);
      let text = k.fmt(v);
      if (k.k === 'reverbMix' && snd.reverb === 'none') text = 'off';
      if (extra) text = `${signed(Math.round(total * 10) / 10, Number.isInteger(Math.round(total * 10) / 10) ? 0 : 1)} st`;
      box.querySelector('.k-v').textContent = text;
      box.title = extra
        ? `Pitch you hear: ${text} (knob ${k.fmt(v)}, ${signed(Math.round(extra * 10) / 10, 1)} st from vinyl speed). Drag, scroll or use the arrow keys · double-click to reset`
        : `${k.n}: drag, scroll or use the arrow keys · double-click to reset`;
      box.setAttribute('aria-valuenow', String(v));
    }

    function paintDj() {
      root.classList.toggle('dj-off', !snd.enabled);
      dj.power.classList.toggle('on', snd.enabled);
      dj.vinyl.classList.toggle('on', !snd.keepPitch);
      KNOBS.forEach(paintKnob);
      snd.eq.forEach((g, i) => {
        const f = faderEls[i];
        const pct = (g + 12) / 24; // 0 bottom .. 1 top
        const th = f.querySelector('.f-th');
        th.style.top = `${(1 - pct) * 100}%`;
        const fill = f.querySelector('.f-fill');
        fill.style.top = `${Math.min(50, (1 - pct) * 100)}%`;
        fill.style.bottom = `${Math.min(50, pct * 100)}%`;
        f.querySelector('.f-v').textContent = g ? signed(g, halfStep(g)) : '0';
        f.setAttribute('aria-valuenow', String(g));
      });
      const eqIdx = EQ_PRESETS.findIndex(([, g]) => g.every((x, i) => x === snd.eq[i]));
      dj.eqp.textContent = eqIdx >= 0 ? EQ_PRESETS[eqIdx][0] : 'Custom';
      const space = SPACES.find(([id]) => id === snd.reverb) || SPACES[0];
      dj.rv.textContent = space[1];
      dj.tail.textContent = space[2] ? `${space[2]} s` : '';
      dj.tail.title = space[2] ? `Echo dies away over about ${space[2]} seconds` : '';
      const same = (a, b) => JSON.stringify({ ...a, enabled: 0 }) === JSON.stringify({ ...b, enabled: 0 });
      dj.presets.querySelectorAll('.dj-chip').forEach((b, i) => {
        b.classList.toggle('on', same(soundState({ ...SOUND_PRESETS[i][1] }), snd));
      });
    }

    function paintStatus(status) {
      let text = 'OFF';
      let cls = '';
      let tip = 'Sound effects are off';
      if (snd.enabled) {
        if (!status) [text, cls, tip] = ['REFRESH SPOTIFY', 'warn', 'The Spotify tab was open before Sonavia was updated: refresh it once'];
        else if (status.waitingForClick) [text, cls, tip] = ['CLICK SPOTIFY ONCE', 'warn', 'The browser only starts audio effects after a click on the Spotify tab'];
        else if (status.routed > 0 || status.elements > 0) [text, cls, tip] = ['LIVE', 'live', 'Effects are running'];
        else [text, tip] = ['PRESS PLAY', 'Effects start with the next song'];
      }
      if (dj.stat.textContent !== text) dj.stat.textContent = text;
      dj.stat.className = `dj-stat ${cls}`;
      dj.stat.title = tip;
    }

    /** New state from the model (unless a change made here is still on its way). */
    function syncDj(ms) {
      if (!djDrag && Date.now() > holdUntil) {
        const next = soundState(ms);
        const sig = JSON.stringify(next);
        if (sig !== sndSig) {
          sndSig = sig;
          snd = next;
          if (snd.reverb !== 'none') lastSpace = snd.reverb;
          paintDj();
        }
      }
      paintStatus(ms?.status || null);
    }

    // knobs
    dj.knobs.addEventListener('pointerdown', (e) => {
      const box = e.target.closest('.knob');
      if (!box || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const k = KNOBS.find((x) => x.k === box.dataset.k);
      const y0 = e.clientY;
      const v0 = snd[k.k];
      djDrag = true;
      try {
        box.setPointerCapture(e.pointerId);
      } catch {}
      const move = (ev) => {
        const range = k.max - k.min;
        let v = v0 + ((y0 - ev.clientY) / (ev.shiftKey ? 600 : 150)) * range;
        if (Math.abs(v - k.from) < range * 0.025) v = k.from; // a little pull towards "no effect"
        setKnob(k, v, false);
      };
      const up = () => {
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', up);
        box.removeEventListener('pointercancel', up);
        djDrag = false;
        flushSound();
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
    const stepOf = (k) => Math.max(k.step, (k.max - k.min) / 48);
    dj.knobs.addEventListener(
      'wheel',
      (e) => {
        const box = e.target.closest('.knob');
        if (!box) return;
        e.preventDefault();
        const k = KNOBS.find((x) => x.k === box.dataset.k);
        setKnob(k, snd[k.k] + (e.deltaY < 0 ? 1 : -1) * stepOf(k), true);
      },
      { passive: false },
    );
    dj.knobs.addEventListener('dblclick', (e) => {
      const box = e.target.closest('.knob');
      if (!box) return;
      const k = KNOBS.find((x) => x.k === box.dataset.k);
      setKnob(k, k.k === 'reverbMix' ? k.def : k.from, true);
    });

    // EQ faders
    function faderValue(f, clientY) {
      const r = f.querySelector('.f-tr').getBoundingClientRect();
      const pct = 1 - (clientY - r.top) / r.height;
      let g = Math.round((pct * 24 - 12) * 2) / 2;
      if (Math.abs(g) < 0.75) g = 0;
      return Math.max(-12, Math.min(12, g));
    }
    function setBand(i, g, final) {
      const eq = snd.eq.slice();
      eq[i] = g;
      setSound({ eq }, final);
    }
    dj.faders.addEventListener('pointerdown', (e) => {
      const f = e.target.closest('.fader');
      if (!f || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const i = Number(f.dataset.b);
      djDrag = true;
      try {
        f.setPointerCapture(e.pointerId);
      } catch {}
      setBand(i, faderValue(f, e.clientY), false);
      const move = (ev) => setBand(i, faderValue(f, ev.clientY), false);
      const up = () => {
        f.removeEventListener('pointermove', move);
        f.removeEventListener('pointerup', up);
        f.removeEventListener('pointercancel', up);
        djDrag = false;
        flushSound();
      };
      f.addEventListener('pointermove', move);
      f.addEventListener('pointerup', up);
      f.addEventListener('pointercancel', up);
    });
    dj.faders.addEventListener(
      'wheel',
      (e) => {
        const f = e.target.closest('.fader');
        if (!f) return;
        e.preventDefault();
        const i = Number(f.dataset.b);
        setBand(i, Math.max(-12, Math.min(12, snd.eq[i] + (e.deltaY < 0 ? 1 : -1))), true);
      },
      { passive: false },
    );
    dj.faders.addEventListener('dblclick', (e) => {
      const f = e.target.closest('.fader');
      if (f) setBand(Number(f.dataset.b), 0, true);
    });

    // keyboard: arrows move the focused knob / fader (and never reach Spotify's shortcuts)
    q('.dj').addEventListener('keydown', (e) => {
      const box = e.target.closest('.knob, .fader');
      if (!box) return;
      const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (!dir && e.key !== 'Home') return;
      e.preventDefault();
      e.stopPropagation();
      if (box.classList.contains('fader')) {
        const i = Number(box.dataset.b);
        setBand(i, e.key === 'Home' ? 0 : Math.max(-12, Math.min(12, snd.eq[i] + dir * 0.5)), true);
      } else {
        const k = KNOBS.find((x) => x.k === box.dataset.k);
        setKnob(k, e.key === 'Home' ? k.from : snd[k.k] + dir * stepOf(k), true);
      }
    });

    // buttons
    const cycle = (list, i, d) => list[(i + d + list.length) % list.length];
    q('.dj').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dj]');
      if (!b) return;
      e.stopPropagation();
      const what = b.dataset.dj;
      if (what === 'power') setSound({ enabled: !snd.enabled });
      else if (what === 'vinyl') setSound({ keepPitch: !snd.keepPitch });
      else if (what === 'reset') setSound({ ...soundState({}), enabled: snd.enabled });
      else if (what === 'preset') setSound({ ...soundState({}), ...SOUND_PRESETS[Number(b.dataset.i)][1], enabled: true });
      else if (what === 'rv-' || what === 'rv+') {
        const i = SPACES.findIndex(([id]) => id === snd.reverb);
        const next = cycle(SPACES, Math.max(0, i), what === 'rv+' ? 1 : -1)[0];
        const patch = { reverb: next };
        if (next !== 'none' && !snd.reverbMix) patch.reverbMix = 0.3;
        setSound(patch);
        const kb = knobEls.get('reverbMix');
        kb.classList.remove('pulse');
        void kb.offsetWidth; // restart the animation
        kb.classList.add('pulse');
      } else if (what === 'eq-' || what === 'eq+') {
        const i = EQ_PRESETS.findIndex(([, g]) => g.every((x, j) => x === snd.eq[j]));
        setSound({ eq: cycle(EQ_PRESETS, i < 0 ? 0 : i, what === 'eq+' ? 1 : (i < 0 ? 0 : -1))[1].slice() });
      }
    });
    // the preset strip scrolls sideways with the mouse wheel
    dj.presets.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        dj.presets.scrollLeft += e.deltaY;
      },
      { passive: false },
    );
    paintDj();

    // ---- song search: click the title, type, pick a song ---------------------------
    const sq = q('.sq');
    const sr = { list: q('.sr-list'), stat: q('.sr-stat'), panel: q('.srch'), it: q('.sr-it') };
    let searching = false;
    let searchOpenedAt = 0;
    let hl = 0; // highlighted result (arrow keys)
    let srSig = '';
    let srResults = [];
    let typeTimer = 0;
    let curItem = null; // the album / playlist / artist open in the panel (from the model)
    let srItemKey = '';
    let itemScroll = null; // { key, top }: where an item's list was when search closed
    let moreAt = 0;
    let moreTimer = 0;
    let kind = 'songs'; // what the search looks for (follows the model)
    let kindAt = 0; // when it was last changed here (the model catches up)
    const KIND_NAME = { songs: 'songs', albums: 'albums', playlists: 'playlists' };
    const tabs = [...sr.panel.querySelectorAll('.sr-tabs button')];
    function setKind(k) {
      kind = KIND_NAME[k] ? k : 'songs';
      tabs.forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
      sq.placeholder = `Search ${KIND_NAME[kind]}…`;
    }
    setKind('songs');
    el.ttl.classList.add('can-search');
    el.ttl.title = 'Click to search for another song';

    function enterSearch(send) {
      if (searching) return;
      searching = true;
      searchOpenedAt = Date.now();
      // A fixed-size box: half the card's width (layout pixels, so the overlay's
      // scale doesn't matter), never reaching the corner buttons.
      const half = Math.round((el.card.offsetWidth || 400) / 2);
      sq.style.width = `min(calc(100% - 88px), ${half}px)`;
      root.classList.add('searching', 'search-open');
      sq.value = '';
      hl = 0;
      srSig = '';
      srResults = [];
      paintResults({ query: '', results: [] });
      if (send) {
        act('search-open');
        setTimeout(() => sq.focus(), 0);
      }
    }
    function leaveSearch(send) {
      if (!searching) return;
      searching = false;
      // Search may open back on this item: at the same place in its list.
      if (curItem) itemScroll = { key: curItem.key, top: sr.list.scrollTop };
      clearTimeout(typeTimer);
      root.classList.remove('searching', 'search-open');
      if (send) act('search-close');
    }
    function pick(i) {
      const r = srResults[i];
      if (!r) return;
      if (r.pos) {
        // A song in the open album / playlist: played from there (search opens
        // back on it next time).
        leaveSearch(false);
        act('item-play', r.pos);
      } else if (!isSong(r.id)) {
        hl = 0;
        act('item-open', r.id); // look inside it first
      } else {
        leaveSearch(false);
        act('search-play', r.id);
      }
    }
    function moveHl(d) {
      if (!srResults.length) return;
      hl = (hl + d + srResults.length) % srResults.length;
      const rows = [...sr.list.querySelectorAll('.sr')];
      rows.forEach((row, i) => row.classList.toggle('hl', i === hl));
      rows[hl]?.scrollIntoView({ block: 'nearest' });
    }

    /** Songs have bare ids; albums, playlists and library items are "type:id" keys. */
    const isSong = (id) => /^[A-Za-z0-9]{10,40}$/.test(id || '') && id !== 'collection' && id !== 'episodes';

    function resultRow(r, i) {
      const row = doc.createElement('div');
      row.className = 'sr' + (i === hl ? ' hl' : '');
      row.dataset.i = String(i);
      // Covers only from Spotify's own image hosts (i.scdn.co, mosaic.scdn.co, *.spotifycdn.com).
      // An album's songs have no covers of their own: the album's.
      const art = r.art || (r.pos && curItem?.art) || '';
      const cover = /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com)\//.test(art);
      let img;
      if (r.pos && !cover) {
        img = doc.createElement('div'); // an album's songs: their number
        img.className = 'sr-num';
        img.textContent = String(r.pos);
      } else {
        img = doc.createElement('img');
        img.alt = '';
        img.draggable = false;
        if (cover) img.src = art;
      }
      const txt = doc.createElement('div');
      txt.className = 'sr-t';
      const n = doc.createElement('div');
      n.className = 'sr-n';
      n.textContent = r.title;
      const a = doc.createElement('div');
      a.className = 'sr-a';
      a.textContent = [r.artists, r.duration].filter(Boolean).join(' · ');
      txt.append(n, a);
      const song = Boolean(r.pos) || isSong(r.id);
      row.title = song ? `Play ${r.title}` : `Open ${r.title}`;
      row.append(img, txt);
      const b = doc.createElement('button');
      if (song) {
        b.className = 'sr-q';
        b.title = 'Add to queue';
        b.innerHTML = ICON.queue;
      } else {
        b.className = 'sr-q sr-p';
        b.title = `Play ${r.title}`;
        b.innerHTML = ICON.play;
      }
      row.append(b);
      return row;
    }

    function section(text) {
      const sec = doc.createElement('div');
      sec.className = 'sr-sec';
      sec.textContent = text;
      sr.list.append(sec);
    }

    /** An open album / playlist / artist: its songs (and an artist's albums). */
    function paintItem(s, it) {
      curItem = it;
      const songs = Array.isArray(it.songs) ? it.songs : [];
      const albums = Array.isArray(it.albums) ? it.albums : [];
      setText(sr.it, it.title || '');
      sr.panel.classList.remove('loading');
      const count = it.total ? `${it.total} song${it.total === 1 ? '' : 's'}` : '';
      setText(sr.stat, s.note || (it.loading && !songs.length ? 'Loading…' : count));
      sr.stat.classList.toggle('ok', Boolean(s.note));
      const results = [...songs, ...albums];
      const sig = JSON.stringify(['item', it.key, results.map((r) => r.pos || r.id), Boolean(it.loading), Boolean(it.failed)]);
      if (sig === srSig) return;
      const keep = srItemKey === it.key ? sr.list.scrollTop : itemScroll?.key === it.key ? itemScroll.top : 0;
      srSig = sig;
      srItemKey = it.key;
      srResults = results;
      if (hl >= results.length) hl = 0;
      sr.list.replaceChildren();
      if (songs.length) {
        if (it.key.startsWith('artist:')) section('POPULAR');
        songs.forEach((r, i) => sr.list.append(resultRow(r, i)));
        if (it.loading || it.more) {
          const more = doc.createElement('div');
          more.className = 'sr-more' + (it.loading ? '' : ' tap');
          more.textContent = it.loading ? 'Loading more…' : 'More songs';
          if (!it.loading) more.title = 'Load more songs';
          sr.list.append(more);
        }
      }
      if (albums.length) {
        section('ALBUMS');
        albums.forEach((r, j) => sr.list.append(resultRow(r, songs.length + j)));
      }
      if (!results.length) {
        const empty = doc.createElement('div');
        empty.className = 'sr-empty';
        empty.textContent = it.loading ? 'Loading…' : it.failed ? "Couldn't open it" : 'No songs here';
        sr.list.append(empty);
      }
      sr.list.scrollTop = keep;
      maybeMore();
      // Spotify may still be loading them: ask again in a moment if still at the end.
      clearTimeout(moreTimer);
      if (it.more && !it.loading) moreTimer = setTimeout(maybeMore, 1500);
    }
    /** Near the bottom of an open item's songs: ask for more of them. */
    function maybeMore(force) {
      if (!curItem?.more || curItem.loading || Date.now() - moreAt < 800) return;
      const l = sr.list;
      if (force !== true && l.scrollTop + l.clientHeight < l.scrollHeight - 240) return;
      moreAt = Date.now();
      act('item-more');
    }
    sr.list.addEventListener('scroll', maybeMore, { passive: true });
    sr.list.addEventListener('wheel', maybeMore, { passive: true }); // at the end, scrolling doesn't move

    function paintResults(s) {
      const it = s.item && typeof s.item === 'object' ? s.item : null;
      sr.panel.classList.toggle('in-item', Boolean(it));
      if (it) return paintItem(s, it);
      curItem = null;
      srItemKey = '';
      const typed = sq.value.trim();
      // Nothing typed: your library (playlists, Liked Songs, albums...) instead.
      const lib = !typed && !s.query;
      const results = lib ? (Array.isArray(s.library) ? s.library : []) : Array.isArray(s.results) ? s.results : [];
      sr.panel.classList.toggle('loading', Boolean(s.loading));
      setText(sr.stat, s.note || (s.loading ? 'Searching…' : ''));
      sr.stat.classList.toggle('ok', Boolean(s.note));
      const sig = JSON.stringify([lib, kind, s.query || '', results.map((r) => r.id), Boolean(typed), Boolean(s.loading)]);
      if (sig === srSig) return;
      srSig = sig;
      srResults = results;
      if (hl >= results.length) hl = 0;
      sr.list.replaceChildren();
      if (results.length) {
        if (lib) section('YOUR LIBRARY');
        results.forEach((r, i) => sr.list.append(resultRow(r, i)));
        return;
      }
      const empty = doc.createElement('div');
      empty.className = 'sr-empty';
      empty.textContent = !typed ? `Type to search ${KIND_NAME[kind]}` : s.loading ? '' : s.query ? `No ${KIND_NAME[kind]} found` : '';
      sr.list.append(empty);
    }

    /** Called from render(): follow the model (another tab may have started or ended it). */
    function syncSearch(s, track) {
      if (s?.open && !searching) enterSearch(false);
      if (!s?.open && searching && Date.now() - searchOpenedAt > 1500) leaveSearch(false);
      if (s?.kind && s.kind !== kind && Date.now() - kindAt > 1500) setKind(s.kind);
      if (searching && s) paintResults(s);
      if (searching) markPlaying(track);
    }

    // The song playing now, in the list: by its title, and an artist or its
    // length to tell songs of the same name apart (the player bar has no song id).
    const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const secs = (d) => String(d || '').split(':').reduce((a, n) => a * 60 + Number(n), 0);
    function isPlaying(r, track) {
      if (!track || !r?.title || !(r.pos || isSong(r.id)) || norm(r.title) !== norm(track.title)) return false;
      const theirs = norm(track.artist).split(/\s*,\s*/);
      const ours = norm(r.artists).split(/\s*,\s*/);
      if (ours.some((a) => a && theirs.includes(a))) return true;
      const len = secs(r.duration);
      return Boolean(len && track.durationMs && Math.abs(len - track.durationMs / 1000) <= 2);
    }
    function markPlaying(track) {
      const rows = sr.list.querySelectorAll('.sr');
      rows.forEach((row, i) => row.classList.toggle('now', isPlaying(srResults[i], track)));
    }

    el.ttl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lastModel?.ui?.study || lastModel?.ui?.focus) return;
      enterSearch(true);
    });
    sq.addEventListener('input', () => {
      clearTimeout(typeTimer);
      hl = 0;
      userLeft = false; // typing here: you're back in the box
      typeTimer = setTimeout(() => {
        act('search-query', sq.value);
        watchFocus();
      }, 300);
    });
    // Spotify moves the focus to its own page on every page change, and the search
    // runs on its search page: while typing here, take the focus back. Not when
    // you clicked outside the overlay, pressed Tab, or switched to another window.
    let userLeft = false;
    let focusWatch = 0;
    doc.addEventListener('pointerdown', (e) => {
      if (!e.composedPath().includes(root)) userLeft = true;
    }, true);
    sq.addEventListener('focus', () => (userLeft = false));
    sq.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') userLeft = true;
    });
    function reclaim() {
      if (!searching || collapsed || userLeft || !doc.hasFocus() || sq.matches(':focus')) return;
      sq.focus({ preventScroll: true });
    }
    sq.addEventListener('blur', () => setTimeout(reclaim, 0));
    /** For a few seconds after a search starts (Spotify changes page a moment later). */
    function watchFocus() {
      clearInterval(focusWatch);
      let n = 0;
      focusWatch = setInterval(() => {
        reclaim();
        if (++n >= 20 || !searching) clearInterval(focusWatch);
      }, 150);
    }
    // Typing here must not trigger the page's own keyboard shortcuts.
    for (const type of ['keyup', 'keypress']) sq.addEventListener(type, (e) => e.stopPropagation());
    sq.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveHl(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(typeTimer);
        if (srResults.length) pick(hl);
        else {
          act('search-query', sq.value);
          watchFocus();
        }
      } else if (e.key === 'Escape') {
        // Out of the search altogether, like Cancel (the < button goes back a step).
        e.preventDefault();
        leaveSearch(true);
      }
    });
    sr.panel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-sr="close"]')) return leaveSearch(true);
      if (e.target.closest('.sr-more.tap')) {
        moreAt = 0;
        maybeMore(true);
        return;
      }
      if (e.target.closest('.sr-back')) {
        hl = 0;
        act('item-back');
        return;
      }
      if (e.target.closest('.sr-playall')) {
        const key = curItem?.key;
        if (key) {
          leaveSearch(false);
          act('search-play', key);
        }
        return;
      }
      const tab = e.target.closest('.sr-tabs button');
      if (tab) {
        if (tab.dataset.kind !== kind) {
          setKind(tab.dataset.kind);
          kindAt = Date.now();
          hl = 0;
          srSig = '';
          act('search-kind', kind);
          watchFocus();
        }
        sq.focus();
        return;
      }
      const row = e.target.closest('.sr');
      if (!row) return;
      const i = Number(row.dataset.i);
      const r = srResults[i];
      if (r && e.target.closest('.sr-p')) {
        leaveSearch(false);
        act('search-play', r.id); // the whole album / playlist, without opening it
        return;
      }
      if (r && e.target.closest('.sr-q')) {
        if (r.pos) act('item-queue', r.pos);
        else act('search-queue', r.id);
        return;
      }
      pick(i);
    });

    function render(m) {
      lastModel = m;
      if (!resizing) {
        const savedS = Math.max(MIN_S, Math.min(MAX_S, Number(m.ui?.scale) || 1));
        if (pendingS !== null && (savedS === pendingS || Date.now() > pendingSUntil)) pendingS = null;
        applyScale(pendingS ?? savedS);
        const saved = Math.max(MIN_W, Math.round(m.ui?.width || MIN_W));
        if (pendingW !== null && (saved === pendingW || Date.now() > pendingUntil)) pendingW = null;
        applyWidth(pendingW ?? Math.min(saved, maxW()));
      }
      const t = m.track;
      root.classList.toggle('study', m.ui.study);
      root.classList.toggle('paused', !m.isPlaying);
      root.classList.toggle('lyrics-open', m.ui.lyricsOpen && !m.ui.study && !m.ui.focus);
      root.classList.toggle('focusing', Boolean(m.ui.focus && m.focus));
      if (m.ui.focus && m.focus) renderFocus(m);
      el.pin.classList.toggle('on', Boolean(m.ui.keepExpanded));
      syncCollapseLock(m);
      el.note.classList.toggle('on', m.ui.lyricsOpen);
      const soundOpen = Boolean(m.ui.soundOpen) && !m.ui.study && !m.ui.focus;
      root.classList.toggle('sound-open', soundOpen);
      el.djb.classList.toggle('on', Boolean(m.ui.soundOpen));
      if (soundOpen) syncDj(m.sound);
      syncSearch(m.search, t);

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
      setText(el.pillT, m.ui.focus && m.focus ? fx.pillText : t ? t.title : 'Nothing playing');
      if (nm) {
        setText(nm, m.ui.focus && m.focus ? fx.pillText : t ? t.title : 'Nothing playing');
        placeDot();
      }
      const tip = t ? `${t.title} — ${t.artist}` : 'Nothing playing';
      if (el.pill.title !== tip) el.pill.title = tip;

      if (m.ui.lyricsOpen && !m.ui.study && !m.ui.focus && !collapsed) renderLyrics(m);
    }

    function fmtTimer(ms) {
      const sec = Math.max(0, Math.ceil(ms / 1000));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const ss = String(sec % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
    }

    let tasksSig = null;
    function renderTasks(F) {
      const sig = JSON.stringify([F.tasks, F.activeTask]);
      if (sig === tasksSig) return;
      tasksSig = sig;
      fx.list.textContent = '';
      if (!F.tasks.length) {
        fx.list.append(Object.assign(doc.createElement('div'), { className: 'fp-empty', textContent: 'No tasks yet. Add one above.' }));
        return;
      }
      for (const t of F.tasks) {
        const row = doc.createElement('div');
        row.className = 'tk' + (t.done ? ' done' : '') + (t.id === F.activeTask ? ' active' : '');
        row.dataset.id = t.id;
        row.title = t.id === F.activeTask ? 'Active goal (middle-click to unset)' : 'Middle-click to make this the active goal';
        const cb = Object.assign(doc.createElement('button'), { className: 'tk-cb', textContent: t.done ? '✓' : '', title: 'Done' });
        const txt = Object.assign(doc.createElement('span'), { className: 'tk-t', textContent: t.text });
        const pr = Object.assign(doc.createElement('span'), { className: `tk-p prio-${t.prio}`, textContent: t.prio.toUpperCase() });
        const x = Object.assign(doc.createElement('button'), { className: 'tk-x', textContent: '×', title: 'Delete' });
        row.append(cb, txt, pr, x);
        fx.list.append(row);
      }
    }

    function renderFocus(m) {
      const F = m.focus;
      const now = Date.now();
      const onBreak = F.phase === 'break';
      root.classList.toggle('on-break', onBreak);
      root.classList.toggle('tasks-open', Boolean(m.ui.tasksOpen));
      root.classList.toggle('timer-open', Boolean(m.ui.timerOpen));
      fx.tbtn.classList.toggle('on', Boolean(m.ui.tasksOpen));
      setText(fx.name, onBreak ? 'Break Mode' : 'Focus Mode');

      const rem = F.status === 'running' ? Math.max(0, F.endsAt - now) : F.remainingMs;
      const total = (onBreak ? F.breakMin : F.focusMin) * 60000;
      const frac = total ? Math.max(0, Math.min(1, rem / total)) : 0;
      const prompt = F.status === 'prompt';
      if (prompt) {
        setText(fx.goal, 'Continue session?');
        fx.goal.classList.remove('muted');
        setText(fx.time, `${Math.max(0, Math.ceil((F.promptUntil - now) / 1000))}s`);
      } else {
        const goal = onBreak ? 'Break' : F.tasks.find((t) => t.id === F.activeTask)?.text || '';
        setText(fx.goal, goal || 'No goal set');
        fx.goal.classList.toggle('muted', !goal);
        setText(fx.time, fmtTimer(rem));
      }
      const off = `${(RING_C * (1 - frac)).toFixed(1)}`;
      if (fx.fg.style.strokeDashoffset !== off) fx.fg.style.strokeDashoffset = off;

      const running = F.status === 'running';
      const icon = running ? (onBreak ? 'cup' : 'flame') : F.status === 'idle' ? (onBreak ? 'cup' : 'flame') : 'bigPause';
      if (fx.icon.dataset.icon !== icon) {
        fx.icon.dataset.icon = icon;
        fx.icon.innerHTML = ICON[icon];
      }
      const playIcon = running ? 'pause' : 'play';
      if (fx.play.dataset.icon !== playIcon) {
        fx.play.dataset.icon = playIcon;
        fx.play.innerHTML = ICON[playIcon];
        fx.play.title = running ? 'Pause' : prompt ? 'Yes, continue where I left off' : 'Start';
      }
      fx.next.classList.toggle('hl', prompt);
      fx.next.title = onBreak ? 'Back to focus' : prompt ? 'Take a break now' : 'Next (asks to continue, or take a break)';

      setText(fx.fmin, `${F.focusMin} min`);
      setText(fx.bmin, `${F.breakMin} min`);
      fx.chime.classList.toggle('on', Boolean(F.chime));
      renderTasks(F);

      fx.pillText = `${onBreak ? 'Break' : 'Focus'} · ${prompt ? 'continue?' : fmtTimer(rem)}`;
      // collapsed circle: countdown ring + minutes left
      const coff = `${(CRING_C * (1 - frac)).toFixed(1)}`;
      if (fx.cfg.style.strokeDashoffset !== coff) fx.cfg.style.strokeDashoffset = coff;
      setText(fx.cmin, prompt ? '?' : rem < 60000 ? `${Math.ceil(rem / 1000)}s` : `${Math.ceil(rem / 60000)}`);
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
      /** Pointer position (client coords) for the near-by title pill; desktop app only. */
      pointer,
      isCollapsed: () => collapsed,
      isResizing: () => Boolean(resizing),
      /** Re-centre the active line (e.g. after the panel was re-opened). */
      resetScroll() {
        builtSig = null;
        if (lastModel) render(lastModel);
      },
      /** Circle layout: where the circle is kept ({ h, x, v, y }, from the nearest edges). */
      setDot,
      destroy() {
        clearTimeout(hoverTimer);
        clearTimeout(dwellTimer);
        doc.removeEventListener('mousemove', onDocMove);
        doc.documentElement.removeEventListener('mouseleave', onDocLeave);
        doc.removeEventListener('pointerdown', onDocDown, true);
        doc.removeEventListener('keydown', onDocKey);
        win().removeEventListener('resize', onWinResize);
        root.remove();
      },
    };
  }

  globalThis.SOView = Object.freeze({ STYLE, PIP_DOC_STYLE, mount, fmt });
})();
