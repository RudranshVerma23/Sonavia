// Runs inside Spotify's own page context. When the user turns on "Spotify
// lyrics", it passes along the lyrics JSON that the web player already
// downloads for its own lyrics view. It also moves Spotify's own page router
// for song search from the overlay. It makes no requests of its own and never
// reads or forwards tokens or cookies.
(() => {
  if (window.__sonaviaPage) return;
  window.__sonaviaPage = true;

  const LYRICS_PATH = /\/color-lyrics\/v2\/track\/(\w+)(?:\/image\/([^?/]+))?/;
  let active = false;

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'sonavia-content') return;
    if (e.data.type === 'config') active = Boolean(e.data.spotifyProvider);
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
