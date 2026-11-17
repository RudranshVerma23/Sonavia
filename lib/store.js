// Small persistence helpers on top of chrome.storage.

/** Recently looked-up lyrics, kept for the browser session (LRU). */
export class LyricsMemo {
  constructor(key = 'so.lyricsMemo', limit = 60) {
    this.key = key;
    this.limit = limit;
    this.entries = new Map();
    this.ready = chrome.storage.session
      .get(key)
      .then((d) => (d[key] || []).forEach(([k, v]) => this.entries.set(k, v)))
      .catch(() => {});
  }

  async get(k) {
    await this.ready;
    if (!this.entries.has(k)) return undefined;
    const v = this.entries.get(k);
    this.entries.delete(k); // refresh recency
    this.entries.set(k, v);
    return v;
  }

  async set(k, v) {
    await this.ready;
    this.entries.delete(k);
    this.entries.set(k, v);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    chrome.storage.session.set({ [this.key]: [...this.entries] }).catch(() => {});
  }

  async drop(k) {
    await this.ready;
    if (this.entries.delete(k)) chrome.storage.session.set({ [this.key]: [...this.entries] }).catch(() => {});
  }
}

export const DEFAULT_SONG_PREFS = Object.freeze({ offsetMs: 0, pick: null, hidden: false });

/** Per-song choices (timing nudge, chosen lyrics, hidden), kept across restarts. */
export class SongPrefs {
  constructor(key = 'so.songPrefs', limit = 400) {
    this.key = key;
    this.limit = limit;
    this.entries = new Map();
    this.ready = chrome.storage.local
      .get(key)
      .then((d) => (d[key] || []).forEach(([k, v]) => this.entries.set(k, v)))
      .catch(() => {});
  }

  async get(song) {
    await this.ready;
    return { ...DEFAULT_SONG_PREFS, ...this.entries.get(song) };
  }

  async set(song, prefs) {
    await this.ready;
    this.entries.delete(song);
    const isDefault = !prefs.offsetMs && !prefs.pick && !prefs.hidden;
    if (!isDefault) this.entries.set(song, { ...prefs });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    await chrome.storage.local.set({ [this.key]: [...this.entries] }).catch(() => {});
  }
}
