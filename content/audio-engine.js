// Sonavia sound engine. Runs inside Spotify's own page context from
// document_start, so it sees every audio element Spotify ever plays.
//
// Design rules (each one fixes a problem seen in other Spotify effect add-ons):
//  - Only native Web Audio nodes (filters, delays, convolver, gains). No
//    JavaScript runs on the audio thread, so the sound stays clean when the
//    Spotify tab is in the background and Windows throttles it.
//  - Nothing is inserted until an effect is actually on; each effect joins the
//    chain only while it changes the sound.
//  - Never touches element.volume / muted: Spotify's own volume bar stays the
//    one volume, for every song.
//  - Follows every element Spotify plays (it swaps them), not just the first.
//  - Settings are kept here and re-applied whenever the chain is built, so a
//    setting that arrives before playback starts is never lost.
//
// Ideas and presets adapted from Chorus (MIT, (c) 2023 cdrani):
// https://github.com/chorus-studio/spotify
(() => {
  if (window.__sonaviaFx) return;

  const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const DEFAULTS = {
    enabled: false,
    speed: 1, // 0.5..2
    keepPitch: true, // false = speed also changes pitch (vinyl / nightcore)
    pitch: 0, // semitones, -12..12
    eq: EQ_FREQS.map(() => 0), // dB per band, -12..12
    reverb: 'none',
    reverbMix: 0.3, // 0..1
    width: 1, // stereo width, 0 (mono) .. 2
    vocal: 0, // vocal reduction, 0..1
    preamp: 0, // dB, -12..12
  };
  const REVERBS = {
    room: { decay: 0.6, pre: 0.004, damp: 0.55 },
    studio: { decay: 0.9, pre: 0.01, damp: 0.6 },
    plate: { decay: 1.7, pre: 0, damp: 0.2 },
    hall: { decay: 2.4, pre: 0.02, damp: 0.55 },
    church: { decay: 3.6, pre: 0.03, damp: 0.6 },
    cathedral: { decay: 5.5, pre: 0.04, damp: 0.65 },
    cave: { decay: 3, pre: 0.05, damp: 0.3, echoes: true },
    space: { decay: 8, pre: 0.06, damp: 0.4 },
  };

  let cfg = clean({});
  let ctx = null;
  let graph = null;
  let waitingForClick = false;
  const tracked = new Set(); // media elements Spotify plays music through
  const routed = new WeakMap(); // element -> MediaElementAudioSourceNode
  let routedCount = 0;

  function clean(c) {
    const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
    const eq = Array.isArray(c.eq) ? EQ_FREQS.map((_, i) => num(c.eq[i], -12, 12, 0)) : DEFAULTS.eq.slice();
    return {
      enabled: Boolean(c.enabled),
      speed: num(c.speed, 0.5, 2, 1),
      keepPitch: c.keepPitch !== false,
      pitch: num(c.pitch, -12, 12, 0),
      eq,
      reverb: REVERBS[c.reverb] ? c.reverb : 'none',
      reverbMix: num(c.reverbMix, 0, 1, 0.3),
      width: num(c.width, 0, 2, 1),
      vocal: num(c.vocal, 0, 1, 0),
      preamp: num(c.preamp, -12, 12, 0),
    };
  }

  const wantsGraph = () =>
    cfg.enabled &&
    (cfg.pitch !== 0 || cfg.eq.some((g) => g !== 0) || cfg.reverb !== 'none' || cfg.width !== 1 || cfg.vocal > 0 || cfg.preamp !== 0);

  // ---------------------------------------------------------------------------
  // Speed: the element's own rate (native time-stretch, no audio-thread JS).
  // Spotify's own writes are remembered and read back unchanged, so it never
  // notices; the real rate is Spotify's rate times ours.
  // ---------------------------------------------------------------------------
  const RATE = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
  const KEEP = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'preservesPitch');

  function hookRate(el) {
    if ('__soRate' in el) return;
    el.__soRate = RATE.get.call(el);
    el.__soKeep = KEEP.get.call(el);
    Object.defineProperty(el, 'playbackRate', {
      configurable: true,
      get: () => el.__soRate,
      set: (v) => {
        el.__soRate = Number(v) || 1;
        applyRate(el);
      },
    });
    Object.defineProperty(el, 'preservesPitch', {
      configurable: true,
      get: () => el.__soKeep,
      set: (v) => {
        el.__soKeep = Boolean(v);
        applyRate(el);
      },
    });
  }

  function applyRate(el) {
    const on = cfg.enabled && cfg.speed !== 1;
    try {
      RATE.set.call(el, on ? Math.min(16, el.__soRate * cfg.speed) : el.__soRate);
      KEEP.set.call(el, on ? cfg.keepPitch : el.__soKeep);
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Finding Spotify's audio. play() is wrapped so elements that never join the
  // DOM are seen too; the capturing 'play' listener catches the rest.
  // ---------------------------------------------------------------------------
  const isBackdrop = (el) => el.loop && el.muted; // Canvas loops, not music

  function track(el) {
    if (!(el instanceof HTMLMediaElement) || tracked.has(el) || isBackdrop(el)) return;
    tracked.add(el);
    hookRate(el);
    applyRate(el);
    el.addEventListener('playing', () => maybeRoute(el));
    if (!el.paused) maybeRoute(el);
  }

  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      track(this);
    } catch {}
    return nativePlay.apply(this, arguments);
  };
  document.addEventListener('play', (e) => track(e.target), true);

  // Routing a cross-origin stream without CORS would turn it silent: leave
  // those (and anything we can't judge) playing natively.
  function routable(el) {
    const src = el.currentSrc || el.src;
    if (!src) return false;
    if (src.startsWith('data:') || el.crossOrigin) return true;
    try {
      return new URL(src, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  async function startContext() {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'playback' });
      graph = buildGraph(ctx);
      ctx.addEventListener('statechange', () => {
        if (ctx.state !== 'running' && routedCount) ctx.resume().catch(() => {});
        report();
      });
    }
    if (ctx.state !== 'running') {
      // Without a recent click, resume() can stay pending; don't wait on it.
      await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
    }
    return ctx.state === 'running';
  }

  async function maybeRoute(el) {
    if (routed.has(el) || !wantsGraph() || !routable(el)) return;
    if (!(await startContext())) {
      // An element routed into a stopped context goes silent, so wait for the
      // next click or key press on the page instead.
      waitingForClick = true;
      report();
      return;
    }
    if (routed.has(el)) return;
    try {
      const node = ctx.createMediaElementSource(el);
      node.connect(graph.input);
      routed.set(el, node);
      routedCount++;
      waitingForClick = false;
      applyAll();
    } catch (err) {
      console.warn('[Sonavia] could not route audio', err);
    }
    report();
  }

  const retryAfterGesture = () => {
    if (!waitingForClick) return;
    waitingForClick = false;
    for (const el of tracked) if (!el.paused) maybeRoute(el);
  };
  window.addEventListener('pointerdown', retryAfterGesture, true);
  window.addEventListener('keydown', retryAfterGesture, true);

  // ---------------------------------------------------------------------------
  // The chain: input → eq → stereo → pitch → reverb → preamp → limiter → out.
  // ---------------------------------------------------------------------------
  function buildGraph(ac) {
    const input = ac.createGain();
    const out = ac.createGain();
    out.connect(ac.destination);

    // 10-band EQ
    const bands = EQ_FREQS.map((f, i) => {
      const b = ac.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.4;
      return b;
    });
    bands.reduce((a, b) => (a.connect(b), b));
    const eq = { in: bands[0], out: bands[bands.length - 1], on: () => cfg.eq.some((g) => g !== 0) };

    // Stereo width and vocal reduction (mid/side):
    //   L' = L - k·HP(M) + (w-1)·S,  R' = R - k·HP(M) - (w-1)·S,  M=(L+R)/2, S=(L-R)/2
    const st = (() => {
      const inp = ac.createGain();
      inp.channelCount = 2;
      inp.channelCountMode = 'explicit';
      const split = ac.createChannelSplitter(2);
      const merge = ac.createChannelMerger(2);
      inp.connect(split);
      const g = (v) => {
        const n = ac.createGain();
        n.gain.value = v;
        return n;
      };
      const lToM = g(0.5), rToM = g(0.5), lToS = g(0.5), rToS = g(-0.5);
      const mid = ac.createGain(), side = ac.createGain();
      split.connect(lToM, 0); split.connect(rToM, 1);
      split.connect(lToS, 0); split.connect(rToS, 1);
      lToM.connect(mid); rToM.connect(mid);
      lToS.connect(side); rToS.connect(side);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 220;
      mid.connect(hp);
      const vocal = g(0), sideL = g(0), sideR = g(0);
      hp.connect(vocal);
      side.connect(sideL); side.connect(sideR);
      const outL = ac.createGain(), outR = ac.createGain();
      split.connect(outL, 0); split.connect(outR, 1);
      vocal.connect(outL); vocal.connect(outR);
      sideL.connect(outL); sideR.connect(outR);
      outL.connect(merge, 0, 0); outR.connect(merge, 0, 1);
      return { in: inp, out: merge, vocal, sideL, sideR, on: () => cfg.width !== 1 || cfg.vocal > 0 };
    })();

    const pitch = makePitchShifter(ac);
    pitch.on = () => cfg.pitch !== 0;

    // Reverb: dry + convolver (generated impulse responses)
    const rv = (() => {
      const inp = ac.createGain(), outp = ac.createGain();
      const dry = ac.createGain(), wet = ac.createGain();
      const conv = ac.createConvolver();
      inp.connect(dry).connect(outp);
      inp.connect(conv).connect(wet).connect(outp);
      return { in: inp, out: outp, dry, wet, conv, preset: null, on: () => cfg.reverb !== 'none' && cfg.reverbMix > 0 };
    })();

    const pre = ac.createGain();
    const preamp = { in: pre, out: pre, on: () => cfg.preamp !== 0 };

    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -1.5;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.15;
    const limiter = { in: lim, out: lim, on: () => cfg.preamp > 0 || cfg.eq.some((g) => g > 0) };

    return { input, out, bands, eq, st, pitch, rv, preamp, pre, limiter, stages: [eq, st, pitch, rv, preamp, limiter], wired: null };
  }

  // Pitch without changing speed, from native delay lines: two taps whose delay
  // ramps linearly (a sawtooth) shift the pitch, crossfaded so each is silent
  // when its ramp jumps back. The four control signals (two ramps, two fades)
  // are one looping 4-channel buffer, so they can never drift out of step; its
  // playback rate is the sawtooth frequency.
  function makePitchShifter(ac) {
    const W = 0.08; // window, seconds
    const inp = ac.createGain();
    const outp = ac.createGain();
    const len = Math.round(ac.sampleRate); // one cycle = 1 s at rate 1
    const ctl = ac.createBuffer(4, len, ac.sampleRate);
    const [rampA, rampB, fadeA, fadeB] = [0, 1, 2, 3].map((c) => ctl.getChannelData(c));
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const q = (p + 0.5) % 1;
      rampA[i] = 2 * p - 1;
      rampB[i] = 2 * q - 1;
      fadeA[i] = Math.sin(Math.PI * p) ** 2;
      fadeB[i] = Math.sin(Math.PI * q) ** 2;
    }
    const lfo = ac.createBufferSource();
    lfo.buffer = ctl;
    lfo.loop = true;
    lfo.playbackRate.value = 0;
    const split = ac.createChannelSplitter(4);
    lfo.connect(split);

    const depths = [0, 1].map((i) => {
      const d = ac.createDelay(1);
      d.delayTime.value = W / 2;
      const depth = ac.createGain();
      split.connect(depth, i);
      depth.connect(d.delayTime);
      const fade = ac.createGain();
      fade.gain.value = 0;
      split.connect(fade.gain, 2 + i);
      inp.connect(d).connect(fade).connect(outp);
      return depth;
    });
    lfo.start();

    return {
      in: inp,
      out: outp,
      set(semitones) {
        const r = Math.pow(2, semitones / 12);
        const now = ac.currentTime;
        lfo.playbackRate.setValueAtTime(Math.abs(1 - r) / W, now);
        // rising delay lowers the pitch, falling delay raises it
        for (const g of depths) g.gain.setValueAtTime((r < 1 ? 1 : -1) * (W / 2), now);
      },
    };
  }

  const irCache = new Map();
  function impulse(ac, name) {
    if (irCache.has(name)) return irCache.get(name);
    const p = REVERBS[name];
    const rate = ac.sampleRate;
    const preN = Math.round(p.pre * rate);
    const len = preN + Math.ceil(p.decay * rate);
    const buf = ac.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = preN; i < len; i++) {
        const tt = (i - preN) / rate;
        const a = Math.min(0.95, (p.damp * tt) / p.decay + 0.05); // darker as it fades
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] = lp * Math.exp((-6.91 * tt) / p.decay);
      }
      // a few early reflections, different per side
      const taps = p.echoes ? [0.09, 0.18, 0.31, 0.45] : [0.007, 0.013, 0.021, 0.034];
      taps.forEach((s, j) => {
        const i = preN + Math.round(s * rate * (ch ? 1.07 : 1));
        if (i < len) d[i] += (p.echoes ? 0.5 : 0.3) * Math.pow(0.7, j) * (ch ^ (j & 1) ? -1 : 1);
      });
    }
    irCache.set(name, buf);
    return buf;
  }

  // Parameters move smoothly; the wiring only changes when an effect turns on or off.
  function applyAll() {
    if (!graph) return;
    const now = ctx.currentTime;
    const glide = (param, v) => param.setTargetAtTime(v, now, 0.02);
    graph.bands.forEach((b, i) => glide(b.gain, cfg.eq[i]));
    glide(graph.st.vocal.gain, -cfg.vocal);
    glide(graph.st.sideL.gain, cfg.width - 1);
    glide(graph.st.sideR.gain, 1 - cfg.width);
    graph.pitch.set(cfg.pitch);
    if (cfg.reverb !== 'none' && graph.rv.preset !== cfg.reverb) {
      graph.rv.conv.buffer = impulse(ctx, cfg.reverb);
      graph.rv.preset = cfg.reverb;
    }
    glide(graph.rv.dry.gain, Math.cos((cfg.reverbMix * Math.PI) / 2));
    glide(graph.rv.wet.gain, Math.sin((cfg.reverbMix * Math.PI) / 2) * 1.2);
    glide(graph.pre.gain, Math.pow(10, cfg.preamp / 20));
    rewire();
  }

  let rewireTimer = 0;
  function rewire() {
    const active = cfg.enabled ? graph.stages.filter((s) => s.on()) : [];
    const key = active.map((s) => graph.stages.indexOf(s)).join(',');
    if (key === graph.wired) return;
    const first = graph.wired === null;
    graph.wired = key;
    const swap = () => {
      graph.input.disconnect();
      for (const s of graph.stages) s.out.disconnect();
      let node = graph.input;
      for (const s of active) {
        node.connect(s.in);
        node = s.out;
      }
      node.connect(graph.out);
    };
    if (first) return swap();
    // Short fade around the rewire so it doesn't click. (Timers aren't slowed
    // in a tab that's playing audio.)
    clearTimeout(rewireTimer);
    const t = ctx.currentTime;
    graph.out.gain.cancelScheduledValues(t);
    graph.out.gain.setTargetAtTime(0, t, 0.006);
    rewireTimer = setTimeout(() => {
      swap();
      graph.out.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
    }, 35);
  }

  // ---------------------------------------------------------------------------
  // Talking to the content script
  // ---------------------------------------------------------------------------
  let lastStatus = '';
  function report() {
    const status = {
      enabled: cfg.enabled,
      elements: tracked.size,
      routed: routedCount,
      context: ctx ? ctx.state : 'none',
      waitingForClick,
      effects: graph ? graph.wired : '',
    };
    const s = JSON.stringify(status);
    if (s === lastStatus) return;
    lastStatus = s;
    window.postMessage({ source: 'sonavia-main', type: 'audio-status', status }, location.origin);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'sonavia-content' || e.data.type !== 'audio-config') return;
    cfg = clean(e.data.cfg || {});
    for (const el of tracked) applyRate(el);
    if (graph) applyAll();
    for (const el of tracked) if (!el.paused) maybeRoute(el);
    report();
  });

  // For debugging from the page console.
  window.__sonaviaFx = { status: () => JSON.parse(lastStatus || '{}'), config: () => cfg, graph: () => graph, makePitchShifter };
  window.postMessage({ source: 'sonavia-main', type: 'audio-hello' }, location.origin);
})();
