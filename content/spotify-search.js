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

  const trackLinks = () => [...document.querySelectorAll(`${ROW} a[href^="/track/"]`)];
  const listSig = () => trackLinks().slice(0, MAX).map((a) => a.getAttribute('href')).join('|');
  const idOf = (href) => (href || '').split('/track/')[1]?.split(/[?#/]/)[0] || '';
  const rowFor = (id) => document.querySelector(`${ROW} a[href^="/track/${CSS.escape(id)}"]`)?.closest(ROW) || null;

  function readRows() {
    const seen = new Set();
    const out = [];
    for (const row of document.querySelectorAll(ROW)) {
      const link = row.querySelector('a[href^="/track/"]');
      const id = idOf(link?.getAttribute('href'));
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const titleCell = row.querySelector('[aria-colindex="2"]') || row;
      const cells = row.querySelectorAll('[role="gridcell"]');
      out.push({
        id,
        title: link.textContent.trim(),
        artists: [...titleCell.querySelectorAll('a[href^="/artist/"]')].map((a) => a.textContent.trim()).join(', '),
        duration: (cells[cells.length - 1]?.textContent || '').match(/\d+:\d{2}(?::\d{2})?/)?.[0] || '',
        art: row.querySelector('img')?.getAttribute('src') || '',
      });
      if (out.length >= MAX) break;
    }
    return out;
  }

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
    return isCurrent() ? readRows() : null;
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
    const btn = rowFor(id)?.querySelector('[aria-colindex="1"] button');
    if (btn) {
      btn.click();
    } else {
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
    const more = rowFor(id)?.querySelector('[data-testid="more-button"]');
    if (!more) return false;
    more.click();
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
