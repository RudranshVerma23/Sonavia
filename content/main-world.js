// Runs inside Spotify's own page context. When the user turns on "Spotify
// lyrics", it passes along the lyrics JSON that the web player already
// downloads for its own lyrics view. It also moves Spotify's own page router
// for song search from the overlay, and has an album or playlist it opens draw
// all its rows. It makes no requests of its own and never
// reads or forwards tokens or cookies.
(() => {
  if (window.__sonaviaPage) return;
  window.__sonaviaPage = true;

  const LYRICS_PATH = /\/color-lyrics\/v2\/track\/(\w+)(?:\/image\/([^?/]+))?/;
  let active = false;

  // An album or playlist the overlay opens: Spotify's song list only draws the
  // rows that fit in its box (plus a margin), from where it's scrolled to, both
  // worked out from the page's layout, and a minimized or long-idle tab doesn't
  // lay out or draw. So the list is told in its own state which row is first and
  // how many fit: it then draws those, and loads their songs, shown or not. (The
  // overlay scrolls there too, so a visible list agrees.) A window of rows, not
  // all of them: Spotify redraws every drawn row as songs load, so a long list
  // drawn whole stalls the page.
  const LIST_OUTSIDE = 'footer, aside, nav, [data-testid="now-playing-bar"], [data-testid="now-playing-widget"]';
  function showRows(from, n) {
    const row = [...document.querySelectorAll('[data-testid="tracklist-row"]')].find((r) => !r.closest(LIST_OUTSIDE));
    const key = row && Object.keys(row).find((k) => k.startsWith('__reactFiber$'));
    let list = null;
    for (let f = key ? row[key] : null, i = 0; f && i < 80; f = f.return, i++) {
      const p = f.memoizedProps;
      if (p && typeof p === 'object' && 'renderRows' in p && 'nrRows' in p && 'rowHeight' in p) {
        list = f;
        break;
      }
    }
    if (!list) return;
    // Its state, in order: extra rows drawn around the visible ones, the first
    // visible row (0 = the first song), how many rows fit. Left alone if that
    // isn't what's there.
    const states = [];
    for (let h = list.memoizedState; h; h = h.next) if (typeof h.queue?.dispatch === 'function') states.push(h);
    const [margin, first, fit] = states;
    if (states.length < 3) return;
    if (typeof margin.memoizedState !== 'number' || typeof fit.memoizedState !== 'number') return;
    if (first.memoizedState !== null && typeof first.memoizedState !== 'number') return;
    const rows = Number(list.memoizedProps.nrRows) || 0;
    const start = Math.min(Math.max(Math.floor(Number(from) || 0), 0), Math.max(rows - 1, 0));
    const count = Math.min(Math.max(Math.floor(Number(n) || 0), 1), 100) + 2;
    if (first.memoizedState !== start) first.queue.dispatch(start);
    if (fit.memoizedState !== count) fit.queue.dispatch(count);
    const extra = Number(list.memoizedProps.nrRowsOverscan) || 10;
    if (margin.memoizedState < extra) margin.queue.dispatch(extra);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'sonavia-content') return;
    if (e.data.type === 'config') active = Boolean(e.data.spotifyProvider);
    if (e.data.type === 'show-rows') {
      try {
        showRows(e.data.from, e.data.n);
      } catch {}
    }
    // Song search from the overlay: move Spotify's own router to a page (its
    // search results, or back to where you were). Same-site paths only.
    if (e.data.type === 'navigate') {
      const path = String(e.data.path || '');
      if (!path.startsWith('/') || path.startsWith('//') || location.pathname + location.search === path) return;
      history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  const share = (url, res) => {
    const hit = active && res.ok && LYRICS_PATH.exec(url);
    if (!hit) return;
    res
      .clone()
      .json()
      .then((body) =>
        window.postMessage(
          { source: 'sonavia-main', type: 'spotify-lyrics', trackId: hit[1], image: hit[2] ? decodeURIComponent(hit[2]) : null, body },
          location.origin,
        ),
      )
      .catch(() => {});
  };

  const nativeFetch = window.fetch;
  window.fetch = function (resource, options) {
    const url = typeof resource === 'string' ? resource : resource?.url ?? String(resource);
    const result = nativeFetch.apply(this, arguments);
    result.then((res) => share(url, res), () => {});
    return result;
  };
})();
