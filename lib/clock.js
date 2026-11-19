// Works out which lyric line is active from a playback "anchor"
// ({ pos, at, playing, rate }: position `pos` ms at wall-clock time `at`,
// moving `rate` song-ms per real ms; rate is 1 unless the speed was changed), and
// wakes exactly at the next line boundary instead of polling.

export class LineClock {
  /** @param {(index: number) => void} onLine */
  constructor(onLine) {
    this.onLine = onLine;
    this.lines = [];
    this.anchor = null;
    this.shiftMs = 0; // + = show lyrics earlier
    this.index = null;
    this.timer = null;
  }

  load(lines) {
    this.lines = lines || [];
    this.index = null;
    this.update();
  }

  setAnchor(anchor) {
    this.anchor = anchor;
    this.update();
  }

  setShift(ms) {
    this.shiftMs = Number(ms) || 0;
    this.update();
  }

  position() {
    const a = this.anchor;
    if (!a) return 0;
    return a.pos + (a.playing ? (Date.now() - a.at) * (a.rate || 1) : 0) + this.shiftMs;
  }

  /** Index of the last line starting at or before `ms` (-1 before the first). */
  indexAt(ms) {
    let lo = 0;
    let hi = this.lines.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.lines[mid].t <= ms) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  update() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.lines.length || !this.anchor) return;
    const pos = this.position();
    const index = this.indexAt(pos);
    if (index !== this.index) {
      this.index = index;
      this.onLine(index);
    }
    const upcoming = this.lines[index + 1];
    if (this.anchor.playing && upcoming) {
      const rate = this.anchor.rate || 1;
      this.timer = setTimeout(() => this.update(), Math.max(15, (upcoming.t - pos) / rate + 8));
    }
  }

  reset() {
    clearTimeout(this.timer);
    this.timer = null;
    this.lines = [];
    this.anchor = null;
    this.index = null;
  }
}
