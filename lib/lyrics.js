// Lyrics: fetching from LRCLIB (free, no account), parsing LRC timestamps,
// matching results against the playing song, and reading Spotify's own
// lyrics payload. A lyric line is always { t: startMs, text }.

const LRCLIB = 'https://lrclib.net/api';
const MAX_OPTIONS = 5;
const MAX_DURATION_GAP_S = 5;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Turn "[01:02.34]words" style text into sorted timed lines. */
export function parseLrc(text) {
  const lines = [];
  let shiftMs = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    let rest = raw.trim();
    const offsetTag = /^\[offset:\s*([+-]?\d+)\s*\]$/i.exec(rest);
    if (offsetTag) {
      shiftMs = Number(offsetTag[1]);
      continue;
    }
    const stamps = [];
    let m;
    while ((m = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(rest))) {
      const fraction = m[3] ? Math.round(Number(`0.${m[3]}`) * 1000) : 0;
      stamps.push(Number(m[1]) * 60000 + Number(m[2]) * 1000 + fraction);
      rest = rest.slice(m[0].length);
    }
    const words = rest.trim() || '♪';
    for (const t of stamps) lines.push({ t: Math.max(0, t - shiftMs), text: words });
  }
  return tidy(lines);
}

/** Untimed lyrics: space the lines evenly over the song so the view still moves. */
export function spreadPlain(text, durationMs) {
  const rows = String(text || '')
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (!rows.length) return [];
  const step = Math.max(durationMs || 0, rows.length * 2500) / rows.length;
  return rows.map((text, i) => ({ t: Math.round(i * step), text }));
}

/** Sort by time and squash runs of empty (♪) lines into one. */
function tidy(lines) {
  lines.sort((a, b) => a.t - b.t);
  return lines.filter((line, i) => !(line.text === '♪' && lines[i - 1]?.text === '♪'));
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** "Little Lies - 2017 Remaster" → "little lies"; drops feat./version noise. */
export function simplify(s) {
  return String(s || '')
    .replace(/\s+-\s+.*\b(remaster(ed)?|version|edit|live|mix|mono|stereo|demo|acoustic)\b.*$/i, '')
    .replace(/[([]\s*(feat|ft|with|prod|from)\b[^)\]]*[)\]]/gi, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wordOverlap(a, b) {
  const A = new Set(simplify(a).split(' ').filter(Boolean));
  const B = new Set(simplify(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

function closeness(a, b) {
  const x = simplify(a);
  const y = simplify(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  return wordOverlap(x, y) * 0.8;
}

/** How well an LRCLIB record fits the song; null = reject. */
function fit(song, rec) {
  const title = closeness(song.title, rec.trackName);
  const artist = Math.max(
    closeness(song.artist, rec.artistName),
    ...song.artist.split(/,|&/).map((a) => closeness(a, rec.artistName)),
  );
  const gap = song.durationMs && rec.duration ? Math.abs(rec.duration - song.durationMs / 1000) : null;
  if (title < 0.6 || artist < 0.5 || (gap !== null && gap > MAX_DURATION_GAP_S)) return null;
  return title * 2 + artist + (rec.syncedLyrics ? 1 : 0) - (gap ?? 3) * 0.1;
}

// ---------------------------------------------------------------------------
// LRCLIB
// ---------------------------------------------------------------------------

function toOption(rec, durationMs) {
  const base = {
    id: `lrclib:${rec.id}`,
    source: 'lrclib',
    label: `${rec.trackName} — ${rec.artistName}`,
  };
  if (rec.instrumental) return { ...base, synced: true, instrumental: true, lines: [] };
  const timed = parseLrc(rec.syncedLyrics);
  if (timed.length) return { ...base, synced: true, lines: timed };
  const plain = spreadPlain(rec.plainLyrics, durationMs);
  return plain.length ? { ...base, synced: false, lines: plain } : null;
}

async function lrclib(path, params, clientName) {
  const res = await fetch(`${LRCLIB}/${path}?${new URLSearchParams(params)}`, {
    headers: { 'Lrclib-Client': clientName },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

/**
 * All plausible lyrics for a song, best first (throws on network failure).
 * @param {{title:string, artist:string, album?:string, durationMs:number}} song
 */
export async function findLyrics(song, clientName = 'Sonavia') {
  const firstArtist = song.artist.split(/,|&/)[0].trim();
  const seen = new Map();
  const consider = (records) => {
    for (const rec of records || []) {
      if (!rec || seen.has(rec.id)) continue;
      const score = fit(song, rec);
      if (score !== null) seen.set(rec.id, { rec, score });
    }
  };
  const haveSynced = () => [...seen.values()].some(({ rec }) => rec.syncedLyrics || rec.instrumental);

  if (song.album && song.durationMs) {
    // Exact match first. If it fails for any reason, the searches below still
    // run (and throw if the network is really down).
    try {
      consider([
        await lrclib('get', {
          track_name: song.title,
          artist_name: firstArtist,
          album_name: song.album,
          duration: Math.round(song.durationMs / 1000),
        }, clientName),
      ]);
    } catch {
      // fall through to search
    }
  }
  if (!haveSynced()) consider(await lrclib('search', { track_name: song.title, artist_name: firstArtist }, clientName));
  const plainTitle = simplify(song.title);
  if (!haveSynced()) consider(await lrclib('search', { q: `${plainTitle} ${firstArtist}` }, clientName));

  return [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ rec }) => toOption(rec, song.durationMs))
    .filter(Boolean)
    .sort((a, b) => Number(b.synced) - Number(a.synced))
    .slice(0, MAX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Spotify's own lyrics (opt-in; the payload the web player itself downloads)
// ---------------------------------------------------------------------------

/** Spotify image ids are a 16-char size code + a hash shared by all sizes. */
export function artId(url) {
  const id = /\/image\/([0-9a-f]{30,})/i.exec(url || '')?.[1];
  return id ? id.slice(16).toLowerCase() : null;
}

export function fromSpotifyLyrics(body, durationMs) {
  const rows = body?.lyrics?.lines;
  if (!Array.isArray(rows) || !rows.length) return null;
  const timed = body.lyrics.syncType && body.lyrics.syncType !== 'UNSYNCED';
  const lines = timed
    ? tidy(rows.map((r) => ({ t: Number(r.startTimeMs) || 0, text: (r.words || '').trim() || '♪' })))
    : spreadPlain(rows.map((r) => r.words).join('\n'), durationMs);
  return lines.length ? { id: 'spotify', source: 'spotify', label: 'Spotify', synced: Boolean(timed), lines } : null;
}
