// Runs inside Spotify's own page context. Only active when the user turns on
// "Spotify lyrics": it then passes along the lyrics JSON that the web player
// already downloads for its own lyrics view. It makes no requests of its own
// and never reads or forwards tokens or cookies.
(() => {
  if (window.__spotifyOverlayPage) return;
  window.__spotifyOverlayPage = true;

  const LYRICS_PATH = /\/color-lyrics\/v2\/track\/(\w+)(?:\/image\/([^?/]+))?/;
  let active = false;

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.source === 'spotify-overlay-content' && e.data.type === 'config') {
      active = Boolean(e.data.spotifyProvider);
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
          { source: 'spotify-overlay-main', type: 'spotify-lyrics', trackId: hit[1], image: hit[2] ? decodeURIComponent(hit[2]) : null, body },
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
