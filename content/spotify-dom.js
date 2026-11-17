// Every Spotify Web Player DOM hook lives here, so a Spotify UI change is a
// one-file fix. Classic script: defines globalThis.SO_DOM.
(() => {
  const SEL = {
    widget: '[data-testid="now-playing-widget"]',
    title: [
      '[data-testid="now-playing-widget"] [data-testid="context-item-info-title"]',
      '[data-testid="now-playing-widget"] [data-testid="context-item-link"]',
    ],
    artist: '[data-testid="now-playing-widget"] [data-testid="context-item-info-artist"]',
    art: [
      '[data-testid="now-playing-widget"] [data-testid="cover-art-image"]',
      '[data-testid="now-playing-widget"] img',
    ],
    position: '[data-testid="playback-position"]',
    duration: '[data-testid="playback-duration"]',
    // <input type=range> whose `max` is the exact track duration in ms.
    progressInput: '[data-testid="playback-progressbar"] input[type="range"]',
    // Carries `--progress-bar-transform: <percent>%`.
    progressBar: '[data-testid="playback-progressbar"] [data-testid="progress-bar"]',
    playPause: '[data-testid="control-button-playpause"]',
    next: '[data-testid="control-button-skip-forward"]',
    prev: '[data-testid="control-button-skip-back"]',
    // Spotify dropped this button's data-testid (only the label remains), so
    // fall back to the shuffle-labelled button inside the player controls.
    shuffle: [
      '[data-testid="control-button-shuffle"]',
      '[data-testid="player-controls"] button[aria-label*="shuffle" i]',
      '[data-testid="now-playing-bar"] button[aria-label*="shuffle" i]',
    ],
    repeat: '[data-testid="control-button-repeat"]',
    // <input type=range min=0 max=1>; the bar's --progress-bar-transform is exact.
    volumeInput: '[data-testid="volume-bar"] input[type="range"]',
    volumeBar: '[data-testid="volume-bar"] [data-testid="progress-bar"]',
    mute: '[data-testid="volume-bar-toggle-mute-button"]',
    // Our launch button goes right before the first of these that exists
    // (the "Lyrics" mic button, else the queue button).
    buttonAnchor: ['[data-testid="lyrics-button"]', '[data-testid="control-button-queue"]'],
  };

  const PLAYING_LABEL = /pause|jeda|pausa|一時停止|暂停|暫停|일시정지|пауза/i;
  const PAUSED_LABEL = /play|putar|reproduc|lecture|abspielen|wiedergabe|riproduci|再生|播放|재생|воспроизв/i;

  const $ = (sel) => {
    if (Array.isArray(sel)) {
      for (const s of sel) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
    }
    return document.querySelector(sel);
  };
  const text = (el) => (el?.textContent || '').trim();

  function parseClock(str) {
    const parts = (str || '').trim().split(':').map(Number);
    if (!parts.length || parts.some(Number.isNaN)) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
  }

  /** Spotify image ids start with a size prefix; ask for the 640px one. */
  function largeArt(url) {
    return (url || '').replace(/ab67616d0000(4851|1e02)/, 'ab67616d0000b273');
  }

  function mediaSessionArt(md) {
    let best = '';
    let bestSize = -1;
    for (const a of md?.artwork ? [...md.artwork] : []) {
      const size = parseInt(String(a.sizes || '').split('x')[0], 10) || 0;
      if (a.src && size > bestSize) {
        best = a.src;
        bestSize = size;
      }
    }
    return best;
  }

  /**
   * What is playing. Title/artist come from the player bar; artwork from the
   * Media Session metadata Spotify publishes (the reliable source), falling
   * back to the small cover image in the player bar.
   */
  function readTrack() {
    let md = null;
    try {
      md = navigator.mediaSession?.metadata ?? null;
    } catch {
      md = null;
    }
    const title = text($(SEL.title)) || (md?.title || '').trim();
    if (!title) return null;
    const domArtists = [...new Set([...document.querySelectorAll(SEL.artist)].map(text))].filter(Boolean);
    const artist = ((md?.artist || '').trim() || domArtists.join(', ')).trim();
    const durationMs = Number($(SEL.progressInput)?.max) || parseClock(text($(SEL.duration))) || 0;
    // Media Session can lag a moment behind on track change: only trust its
    // art when its title matches what the player bar shows.
    const mdMatches = md && (md.title || '').trim() === title;
    const img = $(SEL.art);
    const artUrl = largeArt((mdMatches && mediaSessionArt(md)) || img?.currentSrc || img?.src || '');
    return {
      key: `${title}␟${artist}␟${Math.round(durationMs / 1000)}`,
      title,
      artist,
      primaryArtist: domArtists[0] || artist.split(',')[0].trim(),
      album: mdMatches ? (md.album || '').trim() : '',
      durationMs,
      artUrl,
    };
  }

  /** @returns {boolean|null} null when the label is not recognised. */
  function readIsPlaying() {
    const label = $(SEL.playPause)?.getAttribute('aria-label') || '';
    if (PLAYING_LABEL.test(label)) return true;
    if (PAUSED_LABEL.test(label)) return false;
    return null;
  }

  function readShuffle() {
    const b = $(SEL.shuffle);
    if (!b) return false;
    const checked = b.getAttribute('aria-checked');
    if (checked === 'true') return true;
    if (checked === 'false') return false;
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    return label.includes('disable') || label.includes('smart');
  }

  /** 0 = off, 1 = repeat all, 2 = repeat one. */
  function readRepeat() {
    const b = $(SEL.repeat);
    if (!b) return 0;
    const checked = b.getAttribute('aria-checked');
    if (checked === 'mixed') return 2;
    if (checked === 'true') return 1;
    if (checked === 'false') return 0;
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('disable repeat')) return 2;
    if (label.includes('repeat one')) return 1;
    return 0;
  }

  /** Volume 0..1 (0 when muted). */
  function readVolume() {
    const style = $(SEL.volumeBar)?.getAttribute('style') || '';
    const pct = /--progress-bar-transform:\s*([\d.]+)%/.exec(style);
    if (pct) return Math.max(0, Math.min(1, parseFloat(pct[1]) / 100));
    const input = $(SEL.volumeInput);
    if (!input) return null;
    const max = parseFloat(input.max) || 1;
    return Math.max(0, Math.min(1, (parseFloat(input.value) || 0) / max));
  }

  function readMuted() {
    const label = ($(SEL.mute)?.getAttribute('aria-label') || '').toLowerCase();
    return label.includes('unmute');
  }

  /** Set volume to a fraction (0..1). */
  function setVolume(frac) {
    const input = $(SEL.volumeInput);
    if (!input) return false;
    const max = parseFloat(input.max) || 1;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(Math.max(0, Math.min(1, frac)) * max));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function readDurationMs() {
    return Number($(SEL.progressInput)?.max) || parseClock(text($(SEL.duration))) || 0;
  }

  function readClockPositionMs() {
    return parseClock(text($(SEL.position)));
  }

  function click(key) {
    const el = $(SEL[key]);
    if (!el) return false;
    el.click();
    return true;
  }

  /** Seek to a fraction (0..1) of the track. */
  function seek(pct) {
    pct = Math.max(0, Math.min(1, pct));
    const input = $(SEL.progressInput);
    if (input) {
      const max = parseFloat(input.max) || 0;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(Math.round(pct * max)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const bar = $(SEL.progressBar);
    if (!bar) return false;
    const r = bar.getBoundingClientRect();
    const opts = { bubbles: true, clientX: r.left + r.width * pct, clientY: r.top + r.height / 2, button: 0 };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      bar.dispatchEvent(new Ctor(type, opts));
    }
    return true;
  }

  globalThis.SO_DOM = Object.freeze({
    SEL,
    $,
    parseClock,
    readTrack,
    readIsPlaying,
    readShuffle,
    readRepeat,
    readDurationMs,
    readVolume,
    readMuted,
    setVolume,
    readClockPositionMs,
    click,
    seek,
  });
})();
