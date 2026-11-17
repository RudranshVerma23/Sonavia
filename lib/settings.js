// User settings (chrome.storage.sync) with defaults.

export const DEFAULTS = Object.freeze({
  spotifyProvider: false, // also use the lyrics Spotify's own player downloads
  offsetMs: 0, // global lyrics timing nudge (+ = earlier)
});

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

/** Calls `fn(settings)` whenever settings change. */
export function onSettingsChanged(fn) {
  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area === 'sync') fn(await loadSettings());
  });
}
