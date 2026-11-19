// Sound effects panel. Writes chrome.storage.local.sound; the Spotify tab's
// content script forwards it to the engine (content/audio-engine.js).
// EQ curves and preset ideas adapted from Chorus (MIT, (c) 2023 cdrani).
const FREQS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const DEFAULTS = {
  enabled: false,
  speed: 1,
  keepPitch: true,
  pitch: 0,
  eq: FREQS.map(() => 0),
  reverb: 'none',
  reverbMix: 0.3,
  width: 1,
  vocal: 0,
  preamp: 0,
};
const EQ = {
  flat: { name: 'Flat', g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { name: 'Bass boost', g: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  bassplus: { name: 'Heavy bass', g: [9, 8, 6, 3, 0, -1, 0, 0, 0, 0] },
  treble: { name: 'Treble boost', g: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  vocal: { name: 'Vocals', g: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  rock: { name: 'Rock', g: [4, 3, 2, 0, -1, -1, 1, 2, 3, 4] },
  pop: { name: 'Pop', g: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2] },
  jazz: { name: 'Jazz', g: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  classical: { name: 'Classical', g: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  electronic: { name: 'Electronic', g: [5, 4, 1, 0, -2, 2, 1, 2, 4, 5] },
  hiphop: { name: 'Hip-hop', g: [5, 4, 2, 3, -1, -1, 1, 0, 1, 2] },
  acoustic: { name: 'Acoustic', g: [3, 3, 2, 1, 1, 1, 2, 2, 2, 1] },
  loudness: { name: 'Loudness', g: [5, 3, 0, 0, -1, 0, 0, 1, 3, 4] },
  lofi: { name: 'Lo-fi', g: [2, 2, 1, 0, 0, -1, -3, -6, -9, -12] },
  phone: { name: 'Telephone', g: [-12, -12, -9, -3, 3, 5, 3, -3, -9, -12] },
};
const REVERBS = { none: 'None', room: 'Room', studio: 'Studio', plate: 'Plate', hall: 'Concert hall', church: 'Church', cathedral: 'Cathedral', cave: 'Cave', space: 'Space' };
const PRESETS = [
  { name: 'Normal', set: {} },
  { name: 'Slowed + reverb', set: { speed: 0.85, keepPitch: false, reverb: 'hall', reverbMix: 0.35 } },
  { name: 'Nightcore', set: { speed: 1.25, keepPitch: false } },
  { name: 'Bass boost', set: { eq: EQ.bass.g } },
  { name: 'Lo-fi', set: { eq: EQ.lofi.g, reverb: 'room', reverbMix: 0.25, width: 0.8 } },
  { name: 'Concert', set: { reverb: 'hall', reverbMix: 0.3, width: 1.3, eq: EQ.loudness.g } },
  { name: 'Karaoke', set: { vocal: 0.9 } },
  { name: 'Wide', set: { width: 1.6 } },
];

const store = globalThis.chrome?.storage?.local;
let state = structuredClone(DEFAULTS);
let status = null; // last report from the Spotify tab
const $ = (id) => document.getElementById(id);

// ---- building the controls ----------------------------------------------------
for (const [key, label] of Object.entries(REVERBS)) $('reverb').add(new Option(label, key));
$('eqPreset').add(new Option('Custom', 'custom'));
for (const [key, p] of Object.entries(EQ)) $('eqPreset').add(new Option(p.name, key));
$('eq').innerHTML = FREQS.map(
  (f, i) => `<label><output id="eqOut${i}"></output><input type="range" min="-12" max="12" step="0.5" data-band="${i}" aria-label="${f}Hz"><span>${f}</span></label>`,
).join('');
$('presets').innerHTML = PRESETS.map((p, i) => `<button data-preset="${i}">${p.name}</button>`).join('');

// ---- showing the state ----------------------------------------------------------
const sign = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
function render() {
  document.body.classList.toggle('off', !state.enabled);
  $('enabled').checked = state.enabled;
  $('speed').value = state.speed;
  $('speedOut').textContent = `${state.speed.toFixed(2)}×`;
  $('keepPitch').checked = state.keepPitch;
  $('pitch').value = state.pitch;
  $('pitchOut').textContent = state.pitch ? `${sign(state.pitch, state.pitch % 1 ? 1 : 0)} st` : '0 st';
  state.eq.forEach((g, i) => {
    document.querySelector(`[data-band="${i}"]`).value = g;
    $(`eqOut${i}`).textContent = g ? sign(g, g % 1 ? 1 : 0) : '0';
  });
  const match = Object.entries(EQ).find(([, p]) => p.g.every((g, i) => g === state.eq[i]));
  $('eqPreset').value = match ? match[0] : 'custom';
  $('reverb').value = state.reverb;
  $('reverbMix').value = state.reverbMix;
  $('reverbMix').disabled = state.reverb === 'none';
  $('reverbMixOut').textContent = `${Math.round(state.reverbMix * 100)}%`;
  $('width').value = state.width;
  $('widthOut').textContent = `${Math.round(state.width * 100)}%`;
  $('vocal').value = state.vocal;
  $('vocalOut').textContent = `${Math.round(state.vocal * 100)}%`;
  $('preamp').value = state.preamp;
  $('preampOut').textContent = `${sign(state.preamp, state.preamp % 1 ? 1 : 0)} dB`;
  const on = PRESETS.findIndex((p) => same({ ...DEFAULTS, ...p.set, enabled: state.enabled }, state));
  document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', Number(b.dataset.preset) === on));
}
const same = (a, b) => JSON.stringify({ ...a, enabled: 0 }) === JSON.stringify({ ...b, enabled: 0 });

function renderStatus(s) {
  const el = $('status');
  let text = 'Open Spotify Web Player. If it was already open, refresh that tab once.';
  let cls = 'warn';
  const fresh = s && Date.now() - (s.at || 0) < 1000 * 60 * 60 * 12;
  if (!state.enabled) [text, cls] = ['Effects are off.', ''];
  else if (fresh && s.waitingForClick) text = 'Click anywhere on the Spotify tab once to start the effects.';
  else if (fresh && s.routed > 0 && s.context === 'running') [text, cls] = ['Active on Spotify.', 'ok'];
  else if (fresh && s.elements > 0 && !s.effects && s.context === 'none') [text, cls] = ['Active on Spotify.', 'ok'];
  else if (fresh) text = 'Ready. Press play on Spotify.';
  el.textContent = text;
  el.className = `status ${cls}`;
}

// ---- saving ------------------------------------------------------------------------
let saveTimer = 0;
function update(patch) {
  state = { ...state, ...patch };
  render();
  renderStatus(status);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store?.set({ sound: state }), 40);
}

$('enabled').addEventListener('change', (e) => update({ enabled: e.target.checked }));
for (const id of ['speed', 'pitch', 'reverbMix', 'width', 'vocal', 'preamp']) {
  $(id).addEventListener('input', (e) => update({ enabled: true, [id]: Number(e.target.value) }));
}
$('keepPitch').addEventListener('change', (e) => update({ keepPitch: e.target.checked }));
$('reverb').addEventListener('change', (e) => update({ enabled: true, reverb: e.target.value }));
$('eqPreset').addEventListener('change', (e) => EQ[e.target.value] && update({ enabled: true, eq: EQ[e.target.value].g.slice() }));
$('eq').addEventListener('input', (e) => {
  const i = Number(e.target.dataset.band);
  if (Number.isNaN(i)) return;
  const eq = state.eq.slice();
  eq[i] = Number(e.target.value);
  update({ enabled: true, eq });
});
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (b) update({ ...structuredClone(DEFAULTS), ...structuredClone(PRESETS[b.dataset.preset].set), enabled: true });
});
document.addEventListener('click', (e) => {
  const what = e.target.closest('[data-reset]')?.dataset.reset;
  if (what === 'speed') update({ speed: 1, keepPitch: true });
  if (what === 'pitch') update({ pitch: 0 });
  if (what === 'eq') update({ eq: DEFAULTS.eq.slice() });
  if (what === 'stereo') update({ width: 1, vocal: 0 });
  if (what === 'preamp') update({ preamp: 0 });
});
// Double-click any slider to put it back to normal.
document.addEventListener('dblclick', (e) => {
  const t = e.target;
  if (t.type !== 'range') return;
  if (t.dataset.band) {
    const eq = state.eq.slice();
    eq[Number(t.dataset.band)] = 0;
    update({ eq });
  } else if (t.id in DEFAULTS) update({ [t.id]: DEFAULTS[t.id] });
});
$('resetAll').addEventListener('click', () => update({ ...structuredClone(DEFAULTS), enabled: state.enabled }));

// ---- loading ------------------------------------------------------------------------
if (store) {
  store.get(['sound', 'soundStatus']).then((s) => {
    state = { ...structuredClone(DEFAULTS), ...(s.sound || {}) };
    status = s.soundStatus || null;
    render();
    renderStatus(status);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.soundStatus) status = changes.soundStatus.newValue || null;
    renderStatus(status);
  });
} else {
  render();
  renderStatus(null);
}
render();
