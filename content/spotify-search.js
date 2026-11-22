// Song search for the overlay, done through Spotify's own search page in this
// tab: go to /search/<query>/tracks, read the top songs from the page, and
// play one or add it to the queue with Spotify's own buttons. No API key and no
// account access. The tab goes back to where it was when the search is done.
// Classic script: defines globalThis.SO_SEARCH.
(() => {
  const ROW = '[data-testid="tracklist-row"]';
  const MAX = 8;
  let home = null; // where the tab was before searching

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Spotify's router only answers in the page itself (content/main-world.js). */
  const navigate = (path) => window.postMessage({ source: 'sonavia-content', type: 'navigate', path }, location.origin);
  const here = () => location.pathname + location.search;

  // Song rows in the page's results (not the player bar or the side panels).
  // Spotify doesn't always draw the title as a /track/ link, so a row is read
  // from whatever it has: the link, its "Play X by Y" button, or its text.
  const OUTSIDE = 'footer, aside, nav, [data-testid="now-playing-bar"], [data-testid="now-playing-widget"]';
  const idOf = (href) => (href || '').split('/track/')[1]?.split(/[?#/]/)[0] || '';
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

  /** The row's own play button. */
  const playButton = (row) =>
    row?.querySelector('[aria-colindex="1"] button') ||
    [...(row?.querySelectorAll('button') || [])].find((b) => /^play\b/i.test(b.getAttribute('aria-label') || '')) ||
    null;

  /** A stable key for a row with no song link (letters and digits, 12+ long). */
  function keyOf(text) {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    }
    return `x${h1.toString(36).padStart(7, '0')}${h2.toString(36).padStart(7, '0')}`;
  }

  function readRow(row) {
    const link = row.querySelector('a[href*="/track/"]');
    const label = clean(playButton(row)?.getAttribute('aria-label'));
    const m = label.match(/^play\s+(.+?)\s+by\s+(.+)$/i);
    const cell = row.querySelector('[aria-colindex="2"]') || row;
    const texts = [...cell.querySelectorAll('[data-encore-id="text"]')].map((e) => clean(e.textContent)).filter(Boolean);
    const title = clean(link?.textContent) || m?.[1] || texts[0] || '';
    const artistLinks = [...new Set([...cell.querySelectorAll('a[href*="/artist/"]')].map((x) => clean(x.textContent)))].filter(Boolean);
    const artists = artistLinks.join(', ') || m?.[2] || texts.find((t) => t !== title) || '';
    const duration = (row.textContent || '').match(/\d{1,2}:\d{2}(?::\d{2})?/g)?.pop() || '';
    const linkId = idOf(link?.getAttribute('href'));
    const art = row.querySelector('img')?.getAttribute('src') || '';
    const id = /^[A-Za-z0-9]{10,40}$/.test(linkId) ? linkId : keyOf(`${title}|${artists}|${duration}|${art}`);
    return { id, title, artists, duration, art, row };
  }

  function found() {
    let rows = [...document.querySelectorAll(ROW)].filter((r) => !r.closest(OUTSIDE));
    if (!rows.length) {
      // No tracklist rows: fall back to song links and the block around each.
      rows = [...document.querySelectorAll('a[href*="/track/"]')]
        .filter((a) => !a.closest(OUTSIDE))
        .map((a) => a.closest('[role="row"]') || a.parentElement?.parentElement || a);
    }
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const r = readRow(row);
      if (!r.title || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      if (out.length >= MAX) break;
    }
    return out;
  }
  const listSig = () => found().map((f) => f.id).join('|');
  const rowFor = (id) => found().find((f) => f.id === id)?.row || null;
  const readRows = () => found().map(({ row, ...r }) => r);

  /**
   * Search Spotify for songs. Resolves with up to 8 results, or null when a
   * newer search took over (isCurrent() turned false).
   */
  async function search(query, isCurrent) {
    if (home === null && !location.pathname.startsWith('/search')) home = here();
    const before = listSig();
    const path = `/search/${encodeURIComponent(query)}/tracks`;
    navigate(path);
    const t0 = Date.now();
    let last = '';
    let stableSince = 0;
    // Wait until the list shows this search's songs and has stopped changing.
    while (Date.now() - t0 < 7000) {
      await sleep(120);
      if (!isCurrent()) return null;
      if (!location.pathname.startsWith('/search/')) continue;
      const sig = listSig();
      if (!sig) continue;
      if (sig !== last) {
        last = sig;
        stableSince = Date.now();
        continue;
      }
      if (sig === before && Date.now() - t0 < 1500) continue; // still the previous list
      if (Date.now() - stableSince >= 250) return readRows();
    }
    if (!isCurrent()) return null;
    const rows = readRows();
    if (!rows.length) {
      // For bug reports: what the page had when nothing could be read.
      console.warn('[Sonavia] search found no songs', {
        path: location.pathname,
        trackLinks: document.querySelectorAll('a[href*="/track/"]').length,
        sample: document.querySelector(ROW)?.outerHTML.slice(0, 3000),
        rows: document.querySelectorAll(ROW).length,
        gridRows: document.querySelectorAll('[role="row"]').length,
      });
    }
    return rows;
  }

  async function waitFor(fn, ms) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v || Date.now() - t0 > ms) return v;
      await sleep(100);
    }
  }

  /** Play a song from the results (its own row, or else its song page). */
  async function play(id) {
    const btn = playButton(rowFor(id));
    if (btn) {
      btn.click();
    } else {
      if (id.length !== 22) return false; // no real song id to open
      navigate(`/track/${id}`);
      const big = await waitFor(() => document.querySelector('[data-testid="action-bar-row"] [data-testid="play-button"]'), 5000);
      if (!big) return false;
      big.click();
    }
    await sleep(700);
    restore();
    return true;
  }

  /** Add a song to the queue through its "…" menu. False if that didn't work. */
  async function queue(id) {
    const row = rowFor(id);
    if (!row) return false;
    const more = row.querySelector('[data-testid="more-button"], button[aria-haspopup="menu"]');
    if (more) more.click();
    else row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    const menu = await waitFor(() => document.querySelector('#context-menu, [data-testid="context-menu"]'), 2000);
    const item = menu && [...menu.querySelectorAll('[role="menuitem"], button')].find((b) => /queue/i.test(b.textContent));
    if (!item) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      return false;
    }
    item.click();
    return true;
  }

  /** Put the tab back where it was before the search. */
  function restore() {
    const to = home;
    home = null;
    if (to !== null && location.pathname.startsWith('/search')) navigate(to);
  }

  globalThis.SO_SEARCH = Object.freeze({ search, play, queue, restore });
})();
