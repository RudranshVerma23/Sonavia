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
  const rowFor = (id) => found().find((f) => f.id === id)?.row || null;

  // ---- albums and playlists: Spotify's search cards -------------------------------
  // Each card names what it is in aria-labelledby ("card-title-spotify:album:<id>-0")
  // and has its own play button, so nothing depends on the card's links.
  const TYPE_OF = { albums: 'album', playlists: 'playlist' };
  const PATHS = { songs: 'tracks', albums: 'albums', playlists: 'playlists' };

  function cards(kind) {
    const want = TYPE_OF[kind];
    const seen = new Set();
    const out = [];
    for (const card of document.querySelectorAll('[data-encore-id="card"]')) {
      if (card.closest(OUTSIDE)) continue;
      const m = (card.getAttribute('aria-labelledby') || '').match(/spotify:([a-z]+):([A-Za-z0-9]{10,40})/);
      if (!m || m[1] !== want) continue;
      const id = `${m[1]}:${m[2]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const title = clean(card.querySelector('[data-encore-id="cardTitle"]')?.textContent);
      if (!title) continue;
      out.push({
        id,
        title,
        artists: clean(card.querySelector('[data-encore-id="cardSubtitle"]')?.textContent),
        duration: '',
        art: card.querySelector('img')?.getAttribute('src') || '',
        row: card,
      });
      if (out.length >= MAX) break;
    }
    return out;
  }

  /** The page an item key opens (keys: "playlist:<id>", "album:<id>", "collection", ...). */
  function pathOf(key) {
    if (key === 'collection') return '/collection/tracks';
    if (key === 'episodes') return '/collection/your-episodes';
    const m = String(key).match(/^(playlist|album|artist|show):([A-Za-z0-9]{10,40})$/);
    return m ? `/${m[1]}/${m[2]}` : null;
  }
  /** The item key for a URI from Spotify's library list (null for folders and others). */
  function keyOfUri(uri) {
    const m = uri.match(/^spotify:(playlist|album|artist|show):([A-Za-z0-9]{10,40})$/);
    if (m) return `${m[1]}:${m[2]}`;
    if (/:collection(:tracks)?$/.test(uri)) return 'collection';
    if (/:collection:your-episodes$/.test(uri)) return 'episodes';
    return null;
  }

  /**
   * Your library, read from Spotify's left sidebar (no page change). Only the
   * rows Spotify has drawn are there, which is the top of the list.
   */
  function library() {
    const seen = new Set();
    const out = [];
    for (const row of document.querySelectorAll('[aria-labelledby^="listrow-title-spotify:"]')) {
      const uri = (row.getAttribute('aria-labelledby') || '').split(/\s+/)[0].replace(/^listrow-title-/, '');
      const key = keyOfUri(uri);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const title = clean(document.getElementById(`listrow-title-${uri}`)?.textContent);
      if (!title) continue;
      const sub = clean(document.getElementById(`listrow-subtitle-${uri}`)?.textContent).replace(/^Pinned\s*/, '');
      out.push({ id: key, title, artists: sub, duration: '', art: row.querySelector('img')?.getAttribute('src') || '' });
      if (out.length >= 60) break;
    }
    return out;
  }

  /**
   * Search Spotify for songs. Resolves with up to 8 results, or null when a
   * newer search took over (isCurrent() turned false).
   */
  async function search(query, isCurrent, kind = 'songs') {
    if (!PATHS[kind]) kind = 'songs';
    const list = () => (kind === 'songs' ? found() : cards(kind));
    const sigOf = () => list().map((f) => f.id).join('|');
    const read = () => list().map(({ row, ...r }) => r);
    if (home === null && !location.pathname.startsWith('/search')) home = here();
    const before = sigOf();
    navigate(`/search/${encodeURIComponent(query)}/${PATHS[kind]}`);
    const t0 = Date.now();
    let last = '';
    let stableSince = 0;
    // Wait until the list shows this search's results and has stopped changing.
    while (Date.now() - t0 < 7000) {
      await sleep(120);
      if (!isCurrent()) return null;
      if (!location.pathname.startsWith('/search/')) continue;
      const sig = sigOf();
      if (!sig) continue;
      if (sig !== last) {
        last = sig;
        stableSince = Date.now();
        continue;
      }
      if (sig === before && Date.now() - t0 < 1500) continue; // still the previous list
      if (Date.now() - stableSince >= 250) return read();
    }
    if (!isCurrent()) return null;
    const rows = read();
    if (!rows.length) {
      // For bug reports: what the page had when nothing could be read.
      console.warn('[Sonavia] search found nothing', {
        kind,
        path: location.pathname,
        rows: document.querySelectorAll(ROW).length,
        cards: document.querySelectorAll('[data-encore-id="card"]').length,
        sample: document.querySelector(kind === 'songs' ? ROW : '[data-encore-id="card"]')?.outerHTML.slice(0, 3000),
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

  const isPause = (btn) => /^pause\b/i.test(btn?.getAttribute('aria-label') || '');
  let opened = null; // an item page this file navigated to

  /**
   * Play an album, playlist, artist or your Liked Songs: its card's play button
   * if it's on the page, else the big play button on its own page. Never pauses
   * it if it's already playing.
   */
  async function playItem(key) {
    const path = pathOf(key);
    if (!path) return false;
    const uri = `spotify:${key}`;
    const card = [...document.querySelectorAll('[data-encore-id="card"]')].find((c) => {
      const l = c.getAttribute('aria-labelledby') || '';
      return l.includes(`${uri}-`) || l.endsWith(uri);
    });
    const cardBtn = card?.querySelector('[data-testid="play-button"]');
    let ok = true;
    if (cardBtn) {
      if (!isPause(cardBtn)) cardBtn.click();
    } else {
      const BIG = '[data-testid="action-bar-row"] [data-testid="play-button"]';
      const already = location.pathname === path;
      // The page you were on keeps its play button for a moment after the address
      // changes; that one must not be pressed (it's gone a moment later, or it's
      // the playing item's "Pause" and would be skipped).
      const old = already ? null : document.querySelector(BIG);
      if (!already) {
        if (home === null) home = here();
        opened = path;
        navigate(path);
      }
      let big = await waitFor(() => {
        const b = location.pathname === path && document.querySelector(BIG);
        return b && b !== old && b.isConnected ? b : null;
      }, 8000);
      if (big && !already) {
        await sleep(300); // let the new page settle, then take its button as it is now
        const now = document.querySelector(BIG);
        if (now && now !== old) big = now;
      }
      if (big && !isPause(big)) big.click();
      ok = Boolean(big);
    }
    await sleep(700);
    restore();
    return ok;
  }

  /** Put the tab back where it was before the search. */
  function restore() {
    const to = home;
    home = null;
    const page = opened;
    opened = null;
    // Only if the tab is still on our search or the page we opened.
    if (to !== null && (location.pathname.startsWith('/search') || location.pathname === page)) navigate(to);
  }

  globalThis.SO_SEARCH = Object.freeze({ search, play, playItem, queue, library, restore });
})();
