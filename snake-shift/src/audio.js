// SNAKE//SHIFT — procedural sound (BUILD_PLAN 7, 15.3). Web Audio only, no files.
//
// createAudio(getPrefs, { context }?)
// → { unlock(), setMuted(bool), setTimeline(id), setChaos(x), eat(score),
//     cut({ swing }), die(), start(), stop(), beat, muted, debug() }
//
// - Every method is safe before unlock(), when muted, and without Web Audio.
// - Sound never drives game state: nothing here reads or writes the simulation.
// - `beat` is a createBeat() instance. It runs on the frame clock until unlock(),
//   then follows the audio output clock (latency-corrected), so the kick and the
//   visual pulse line up. Do not call beat.setTimeSource() from outside.
// - start() starts the beat (if idle) and the rhythm; stop() and die() stop both.
// - getPrefs() may return { reducedFlash, reducedMotion, muted }; any of the two
//   reduced switches makes the rhythm thinner and the cut lighter.
// - The optional second argument lets a harness pass an OfflineAudioContext.

import { createBeat } from './beat.js';

export const TIMELINE_IDS = ['lcd', 'acid', 'disco', 'arcade', 'kombat', 'plastic', 'bunker', 'court', 'timewarp', 'wrong', 'desktop'];

const MASTER = 0.8;
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;
const ROOT = 45; // A2
const PROG = [0, 0, -4, -2]; // bar roots: A A F G
const MAX_ACTIVE = 320; // safety valve for runaway layering

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Bite note: walks up the timeline's scale with the score (two octaves, then wraps).
const SCALE = {
  lcd: [0, 2, 4, 7, 9],
  acid: [0, 2, 3, 5, 7, 9, 10],
  disco: [0, 3, 5, 7, 10],
  arcade: [0, 2, 4, 5, 7, 9, 11],
  kombat: [0, 1, 3, 5, 7, 8, 10],
  plastic: [0, 2, 4, 6, 7, 9, 11],
  bunker: [0, 1, 3, 5, 6, 8, 10],
  court: [0, 2, 4, 7, 9],
  timewarp: [0, 2, 4, 6, 8, 10],
  wrong: [0, 1, 4, 6, 7, 10, 11],
  desktop: [0, 4, 7],
};
const BITE_OCT = { lcd: 36, acid: 24, disco: 12, arcade: 24, kombat: 24, plastic: 36, bunker: 12, court: 24, timewarp: 24, wrong: 24, desktop: 24 };

export function biteMidi(id, score) {
  const s = SCALE[id] || SCALE.arcade;
  const deg = Math.max(0, Math.floor(Number(score) || 0) - 1) % (s.length * 2);
  return ROOT + (BITE_OCT[id] ?? 24) + s[deg % s.length] + 12 * Math.floor(deg / s.length);
}

// Rhythm kits. Bass patterns are 16 steps of semitones above the bar root, or null.
const _ = null;
const PAT = {
  acid: [0, 0, 12, 0, 3, _, 15, 0, 0, 12, _, 10, 0, 3, 12, 7],
  oct: [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, _, 12, _],
  arp: [0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7],
  kombat: [0, _, _, 0, _, _, 0, _, _, _, 3, _, 5, _, 3, _],
  plastic: [0, _, _, 7, _, _, 12, _, 0, _, _, 7, _, 11, _, _],
  rumble: [_, _, 0, 0, _, _, 0, 0, _, _, 0, 0, _, _, 0, 1],
  court: [0, _, _, _, _, _, 7, _, _, _, _, _, 4, _, _, _],
  warp: [0, _, 6, _, 0, _, 10, _, 0, _, 6, _, 12, _, 8, _],
  desk: [0, _, _, _, 7, _, _, _, 0, _, _, _, 4, _, 7, _],
};
const KIT = {
  acid: { kick: { f0: 130, f1: 48, dec: 0.32, g: 0.85 }, hat: { k: 'noise', f: 8000, dec: 0.05, g: 0.14 }, snare: { k: 'snare', f: 1800, dec: 0.18, g: 0.3 }, bass: { type: 'sawtooth', lp: 300, env: 2400, q: 15, dec: 0.14, g: 0.22, pat: PAT.acid, oct: -12 }, extra: 'acid' },
  disco: { kick: { f0: 110, f1: 50, dec: 0.26, g: 0.95 }, hat: { k: 'open', f: 8500, dec: 0.16, g: 0.15 }, snare: { k: 'clap', f: 1500, dec: 0.14, g: 0.36 }, bass: { type: 'sawtooth', lp: 900, env: 900, q: 4, dec: 0.12, g: 0.26, pat: PAT.oct, oct: -12 }, extra: 'disco' },
  arcade: { kick: { f0: 220, f1: 55, dec: 0.14, g: 0.7, type: 'square', lp: 900 }, hat: { k: 'tick', f: 6000, dec: 0.025, g: 0.1 }, snare: { k: 'noise8', f: 3000, dec: 0.1, g: 0.25 }, bass: { type: 'square', lp: 1400, q: 1, dec: 0.1, g: 0.14, pat: PAT.arp, oct: -12 }, extra: 'arcade' },
  kombat: { kick: { f0: 160, f1: 45, dec: 0.22, g: 0.9, crush: true }, hat: { k: 'noise', f: 7000, dec: 0.04, g: 0.13, crush: true }, snare: { k: 'snare', f: 1200, dec: 0.2, g: 0.4, crush: true }, bass: { type: 'square', lp: 700, q: 3, dec: 0.16, g: 0.18, pat: PAT.kombat, oct: -12, crush: true }, extra: 'kombat' },
  plastic: { kick: { f0: 90, f1: 45, dec: 0.3, g: 0.75 }, hat: { k: 'glass', f: 7400, dec: 0.04, g: 0.05 }, snare: { k: 'clap', f: 2500, dec: 0.12, g: 0.22, send: 'echo' }, bass: { type: 'sine', lp: 2000, q: 0.5, dec: 0.25, g: 0.3, pat: PAT.plastic, oct: -12 }, extra: 'plastic' },
  bunker: { kick: { f0: 170, f1: 38, dec: 0.42, g: 1, drive: true }, hat: { k: 'metal', f: 420, dec: 0.07, g: 0.13 }, snare: { k: 'snare', f: 900, dec: 0.25, g: 0.4, drive: true }, bass: { type: 'sawtooth', lp: 180, q: 6, dec: 0.2, g: 0.3, pat: PAT.rumble, oct: -24, drive: true }, extra: 'bunker' },
  court: { kick: { f0: 75, f1: 38, dec: 0.5, g: 0.8, send: 'reverb' }, hat: { k: 'air', f: 9000, dec: 0.09, g: 0.08 }, snare: { k: 'clap', f: 1800, dec: 0.3, g: 0.18, send: 'reverb' }, bass: { type: 'triangle', lp: 900, q: 0.5, dec: 0.45, g: 0.26, pat: PAT.court, oct: -12 }, extra: 'court' },
  timewarp: { kick: { f0: 240, f1: 30, dec: 0.4, g: 0.9 }, hat: { k: 'sweep', f: 4000, dec: 0.07, g: 0.14 }, snare: { k: 'snare', f: 2200, dec: 0.22, g: 0.3 }, bass: { type: 'sawtooth', lp: 600, env: 1800, q: 8, dec: 0.2, g: 0.2, pat: PAT.warp, oct: -12, glide: true }, extra: 'timewarp' },
  desktop: { kick: { f0: 120, f1: 60, dec: 0.12, g: 0.7, type: 'triangle' }, hat: { k: 'tick', f: 3000, dec: 0.015, g: 0.12 }, snare: { k: 'noise8', f: 2000, dec: 0.06, g: 0.2 }, bass: { type: 'square', lp: 800, q: 2, dec: 0.09, g: 0.12, pat: PAT.desk, oct: -12 }, extra: 'desktop' },
};
const KIT_IDS = Object.keys(KIT);
const METAL = [1, 1.483, 1.8, 2.546, 2.63, 3.897]; // inharmonic square stack

function perfNow() {
  const p = globalThis.performance;
  return (p && typeof p.now === 'function' ? p.now() : Date.now()) / 1000;
}

export function createAudio(getPrefs, opts = {}) {
  const beat = createBeat({ bpm: 132 });
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  const prefs = () => {
    try {
      return (typeof getPrefs === 'function' && getPrefs()) || {};
    } catch {
      return {};
    }
  };
  const calm = () => {
    const p = prefs();
    return !!(p.reducedFlash || p.reducedMotion);
  };

  let ctx = null;
  let bus = null; // graph, built on unlock
  let offline = false;
  let muted = !!prefs().muted;
  let timeline = 'lcd';
  let chaos = 0;
  let rhythm = false;
  let timer = null;
  let nextStep = null;
  let wrong = { bar: -1, kit: null };
  let clockOffset = 0;
  let warned = false;
  const stats = { created: 0, active: 0, voices: 0, steps: 0, errors: 0 };

  const safe = (fn) =>
    function (...args) {
      try {
        return fn.apply(this, args);
      } catch (e) {
        stats.errors++;
        if (!warned) {
          warned = true;
          console.warn('[audio] ignored error:', e);
        }
        return undefined;
      }
    };

  const live = () => !!(ctx && bus && !muted && (offline || ctx.state === 'running'));
  const effChaos = () => (calm() ? chaos * 0.6 : chaos);

  // Audio output clock in context seconds, latency-corrected and smooth; falls
  // back to the frame clock (kept continuous by an offset) while not running.
  function audioClock() {
    const p = perfNow();
    if (ctx && !offline && ctx.state === 'running') {
      let t = NaN;
      if (typeof ctx.getOutputTimestamp === 'function') {
        const ts = ctx.getOutputTimestamp();
        if (ts && ts.contextTime > 0 && ts.performanceTime > 0) t = ts.contextTime + (p * 1000 - ts.performanceTime) / 1000;
      }
      if (!(t > 0)) t = ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
      t = Math.min(t, ctx.currentTime);
      clockOffset = t - p;
      return t;
    }
    return p + clockOffset;
  }

  // ---- graph -------------------------------------------------------------

  function curve(fn, n = 2048) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
    return c;
  }
  const SOFTCLIP = (x) => {
    const a = Math.abs(x);
    const y = a <= 0.7 ? a : 0.7 + 0.27 * Math.tanh((a - 0.7) / 0.27);
    return Math.sign(x) * y;
  };

  function gainNode(v, to) {
    const g = ctx.createGain();
    g.gain.value = v;
    if (to) g.connect(to);
    return g;
  }

  function build() {
    const c = ctx;
    const master = gainNode(muted ? 0 : MASTER);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 20;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    const trim = gainNode(0.85);
    const clip = c.createWaveShaper();
    clip.curve = curve(SOFTCLIP); // hard ceiling 0.97: nothing reaches 1.0
    clip.oversample = '2x';
    master.connect(comp);
    comp.connect(trim);
    trim.connect(clip);
    clip.connect(c.destination);

    const sfx = gainNode(0.9, master);
    const fade = gainNode(1, master); // stop()/die() fade
    const duck = gainNode(1, fade); // cut() ducking
    const music = gainNode(0.45, duck); // rhythm level, rises with chaos

    // Reverb: generated impulse.
    const len = Math.floor(c.sampleRate * 2.2);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    const reverbIn = gainNode(1);
    reverbIn.connect(conv);
    conv.connect(gainNode(0.35, master));

    // Echo: dotted-eighth, filtered feedback.
    const delay = c.createDelay(2);
    delay.delayTime.value = beat.period * 0.75;
    const fbf = c.createBiquadFilter();
    fbf.type = 'lowpass';
    fbf.frequency.value = 2600;
    const fb = gainNode(0.38);
    const echoIn = gainNode(1);
    echoIn.connect(delay);
    delay.connect(fbf);
    fbf.connect(fb);
    fb.connect(delay);
    delay.connect(gainNode(0.4, master));

    const noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    bus = { master, comp, sfx, music, duck, fade, reverbIn, echoIn, noise, shapers: new Map() };
  }

  // Shared nonlinear stages per destination: 'drive' (tanh) and 'crush' (16-bit-ish steps).
  function shaper(dest, kind) {
    const key = dest;
    let m = bus.shapers.get(key);
    if (!m) bus.shapers.set(key, (m = {}));
    if (!m[kind]) {
      const ws = ctx.createWaveShaper();
      ws.curve = kind === 'drive' ? curve((x) => Math.tanh(6 * x) / Math.tanh(6)) : curve((x) => Math.round(x * 7) / 7, 4096);
      const g = gainNode(kind === 'drive' ? 0.5 : 0.8, dest);
      ws.connect(g);
      m[kind] = ws;
    }
    return m[kind];
  }

  // ---- voice helpers ------------------------------------------------------

  // Envelope + filter + pan + routing for one or more sources; schedules and cleans up.
  function chain(srcs, o, extra = []) {
    const t = o.t;
    const a = o.a ?? 0.004;
    const dur = o.dur ?? 0.2;
    const nodes = [...srcs, ...extra];
    let head = null;
    let tail = null;
    const add = (n) => {
      nodes.push(n);
      if (tail) tail.connect(n);
      else head = n;
      tail = n;
    };
    const f0 = o.lp || o.hp || o.bp;
    if (f0) {
      const fl = ctx.createBiquadFilter();
      fl.type = o.lp ? 'lowpass' : o.hp ? 'highpass' : 'bandpass';
      fl.frequency.setValueAtTime(f0, t);
      if (o.f2f) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2f), t + (o.fdur ?? a + dur));
      fl.Q.value = o.q ?? (o.bp ? 4 : 0.7);
      add(fl);
    }
    const g = ctx.createGain();
    const peak = Math.max(0.0002, o.g ?? 0.2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (o.hold) g.gain.setValueAtTime(peak, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + (o.hold || 0) + dur);
    add(g);
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      add(p);
    }
    for (const s of srcs) s.connect(head);
    const dest = o.dest || bus.sfx;
    tail.connect(o.drive ? shaper(dest, 'drive') : o.crush ? shaper(dest, 'crush') : dest);
    if (o.send) {
      const s = gainNode(o.sendAmt ?? 0.4, o.send === 'reverb' ? bus.reverbIn : bus.echoIn);
      tail.connect(s);
      nodes.push(s);
    }
    const end = t + a + (o.hold || 0) + dur + 0.03;
    for (const s of srcs) {
      if (s.loop) s.start(t, Math.random() * 0.9);
      else s.start(t);
      s.stop(end);
    }
    for (const n of extra) if (n.start) {
      n.start(t);
      n.stop(end);
    }
    stats.created += nodes.length;
    stats.active++;
    stats.voices++;
    srcs[0].onended = () => {
      stats.active--;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {}
      }
    };
  }

  function tone(o) {
    const s = ctx.createOscillator();
    s.type = o.type || 'sine';
    s.frequency.setValueAtTime(Math.min(20000, o.f), o.t); // finish: clamp, Web Audio warns above 24 kHz
    if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(1, o.f2)), o.t + (o.glide ?? (o.a ?? 0.004) + (o.dur ?? 0.2)));
    if (o.detune) s.detune.setValueAtTime(o.detune, o.t);
    const extra = [];
    if (o.vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibRate || 6;
      const lg = gainNode(o.f * o.vib);
      lfo.connect(lg);
      lg.connect(s.frequency);
      extra.push(lfo, lg);
    }
    chain([s], o, extra);
  }

  function noise(o) {
    const s = ctx.createBufferSource();
    s.buffer = bus.noise;
    s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    chain([s], o);
  }

  function metal(t, f, dec, g, dest, pan) {
    const srcs = METAL.map((r) => {
      const s = ctx.createOscillator();
      s.type = 'square';
      s.frequency.value = Math.min(20000, f * r);
      return s;
    });
    chain(srcs, { t, a: 0.001, dur: dec, g: g / 3, bp: 8000, q: 1.2, dest, pan });
  }

  // ---- rhythm instruments --------------------------------------------------

  function kick(t, p, dest, gm = 1) {
    tone({ t, type: p.type || 'sine', f: p.f0, f2: p.f1, glide: p.dec * 0.5, a: 0.002, dur: p.dec, g: p.g * gm, lp: p.lp, drive: p.drive, crush: p.crush, dest, send: p.send, sendAmt: 0.25 });
    noise({ t, a: 0.001, dur: 0.012, g: p.g * gm * 0.25, hp: 3000, dest });
  }

  function hat(t, p, acc, dest) {
    const g = p.g * acc;
    switch (p.k) {
      case 'metal': return metal(t, p.f, p.dec, g, dest, rand(-0.4, 0.4));
      case 'tick': return tone({ t, type: 'square', f: p.f, a: 0.001, dur: p.dec, g: g * 0.6, hp: 1500, dest });
      case 'glass': return tone({ t, type: 'sine', f: p.f * rand(1, 1.03), a: 0.001, dur: p.dec * 2, g, dest, send: 'echo', sendAmt: 0.3 });
      case 'air': return noise({ t, a: 0.01, dur: p.dec, g, bp: p.f, q: 1.5, dest, send: 'reverb', sendAmt: 0.5 });
      case 'sweep': return noise({ t, a: 0.002, dur: p.dec, g, bp: p.f, f2f: p.f * 2.5, q: 6, dest });
      default: return noise({ t, a: 0.001, dur: p.dec, g, hp: p.f, crush: p.crush, dest });
    }
  }

  function snare(t, p, dest) {
    if (p.k === 'clap') {
      for (let i = 0; i < 3; i++) noise({ t: t + i * 0.011, a: 0.001, dur: i === 2 ? p.dec : 0.01, g: p.g, bp: p.f, q: 2, dest, send: p.send, sendAmt: 0.4 });
    } else if (p.k === 'noise8') {
      noise({ t, a: 0.001, dur: p.dec, g: p.g, bp: p.f, q: 0.8, crush: true, dest });
    } else {
      noise({ t, a: 0.001, dur: p.dec, g: p.g, bp: p.f, q: 0.9, drive: p.drive, crush: p.crush, dest });
      tone({ t, type: 'triangle', f: 190, f2: 140, a: 0.001, dur: 0.09, g: p.g * 0.7, drive: p.drive, crush: p.crush, dest });
    }
  }

  function bass(t, p, semi, shift, dest) {
    const f = mtof(ROOT + p.oct + semi + shift);
    const acc = p.env && Math.random() < 0.3 ? 1.6 : 1;
    tone({
      t, type: p.type, f, f2: p.glide ? f * pick([0.5, 2, 1.5]) : undefined, glide: p.dec,
      a: 0.004, dur: p.dec, g: p.g, lp: p.lp + (p.env || 0) * acc, f2f: p.env ? p.lp : undefined, fdur: p.dec, q: p.q,
      drive: p.drive, crush: p.crush, dest, detune: p.type === 'sawtooth' ? rand(-6, 6) : 0,
    });
  }

  function extra(kind, s, t, shift, dest) {
    const r = ROOT + shift;
    switch (kind) {
      case 'acid':
        if (s % 4 === 3) {
          const f = mtof(r + 24 + pick([0, 3, 7, 10, 12, 15]));
          tone({ t, type: 'sine', f, f2: f * 1.5, a: 0.002, dur: 0.12, g: 0.1, vib: 0.08, vibRate: rand(8, 14), pan: rand(-0.9, 0.9), dest, send: 'echo', sendAmt: 0.6 });
        }
        break;
      case 'disco':
        if (s === 3 || s === 7 || s === 10 || s === 14) tone({ t, type: 'sine', f: pick([196, 220, 262]), f2: 150, a: 0.002, dur: 0.18, g: 0.28, pan: rand(-0.6, 0.6), dest });
        if (s === 0) noise({ t, a: 0.01, dur: 0.6, g: 0.07, hp: 6000, f2f: 12000, dest, send: 'reverb', sendAmt: 0.4 });
        break;
      case 'arcade':
        tone({ t, type: 'square', f: mtof(r + 24 + [0, 4, 7, 12][s % 4]), a: 0.001, dur: 0.06, g: 0.045, lp: 4000, dest });
        break;
      case 'kombat':
        if (s === 0 || s === 6 || s === 11) {
          for (const st of [0, 3, 7]) tone({ t, type: 'square', f: mtof(r + 12 + st), a: 0.002, dur: 0.22, g: 0.06, crush: true, dest });
          noise({ t, a: 0.001, dur: 0.15, g: 0.18, bp: 1400, q: 1, crush: true, dest });
        }
        break;
      case 'plastic':
        if (s === 0 || s === 6 || s === 10) chime(t, mtof(r + 36 + pick([0, 4, 6, 7, 11])), 0.08, dest);
        break;
      case 'bunker':
        metal(t, rand(300, 700), s % 4 === 2 ? 0.12 : 0.04, s % 4 === 2 ? 0.2 : 0.09, dest, rand(-0.9, 0.9));
        break;
      case 'court':
        if (s === 0) noise({ t, a: 0.3, dur: 0.7, g: 0.1, bp: mtof(r + 36), q: 12, dest, send: 'reverb', sendAmt: 0.9 });
        if (s === 10) tone({ t, type: 'sine', f: mtof(r + 31), a: 0.01, dur: 0.6, g: 0.07, dest, send: 'reverb', sendAmt: 0.9 });
        break;
      case 'timewarp':
        if (s === 8) {
          const f = mtof(r + 12);
          tone({ t, type: 'sawtooth', f, f2: f * 4, glide: beat.period * 2, a: 0.05, dur: beat.period * 2, g: 0.07, lp: 600, f2f: 6000, fdur: beat.period * 2, pan: rand(-0.7, 0.7), dest });
        }
        break;
      case 'desktop':
        if (s === 6 || s === 14) {
          const f = mtof(r + 36);
          tone({ t, type: 'square', f, a: 0.002, dur: 0.07, g: 0.05, lp: 2500, dest });
          tone({ t: t + 0.09, type: 'square', f: f * 0.75, a: 0.002, dur: 0.09, g: 0.05, lp: 2500, dest });
        }
        break;
    }
  }

  function chime(t, f, g, dest, send = 'echo') {
    const parts = [
      [1, 1, 0.9],
      [2.76, 0.45, 0.5],
      [5.4, 0.22, 0.3],
      [8.93, 0.12, 0.18],
    ];
    for (const [r, gm, d] of parts) tone({ t, type: 'sine', f: f * r, a: 0.001, dur: d, g: g * gm, dest, send, sendAmt: 0.35 });
  }

  function wrongKit(bar) {
    if (wrong.bar !== bar) {
      const k = () => KIT[pick(KIT_IDS)];
      wrong = { bar, kit: { kick: k().kick, hat: k().hat, snare: k().snare, bass: k().bass, extra: k().extra } };
    }
    return wrong.kit;
  }

  function playStep(step, t) {
    if (timeline === 'lcd') return; // the calm opening stays silent
    const kit = timeline === 'wrong' ? wrongKit(Math.floor(step / 16)) : KIT[timeline] || KIT.arcade;
    const s = step % 16;
    const shift = PROG[Math.floor(step / 16) % PROG.length];
    const c = effChaos();
    const d = bus.music;
    const full = stats.active < MAX_ACTIVE;
    stats.steps++;
    if (s % 4 === 0) kick(t, kit.kick, d);
    if (!full) return;
    if (c >= 0.12 && s % 4 === 2) hat(t, kit.hat, 1, d);
    if (c >= 0.28 && kit.bass.pat[s] != null) bass(t, kit.bass, kit.bass.pat[s], shift, d);
    if (c >= 0.45 && (s === 4 || s === 12)) snare(t, kit.snare, d);
    if (c >= 0.62 && s % 2 === 1) hat(t, kit.hat, 0.55, d);
    if (c >= 0.75) extra(kit.extra, s, t, shift, d);
    if (c >= 0.9 && !calm()) {
      // Wild: rolls into every other bar line, random stabs from any kit.
      if (s >= 13 && Math.floor(step / 16) % 2 === 1) kick(t, { ...kit.kick, dec: 0.08 }, d, 0.6);
      if (Math.random() < 0.12) extra(pick(KIT_IDS), s, t, shift, d);
      if (Math.random() < 0.06) tone({ t, type: 'sawtooth', f: rand(200, 1600), f2: rand(40, 4000), a: 0.002, dur: 0.12, g: 0.06, crush: true, pan: rand(-1, 1), dest: d });
    }
  }

  function tick() {
    if (!rhythm || !beat.running || !ctx || !bus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const pos = beat.position(now) * 4;
    if (nextStep == null || nextStep < pos - 1) nextStep = Math.max(0, Math.ceil(pos - 0.2)); // start or catch up
    const horizon = now + LOOKAHEAD;
    for (let guard = 0; guard < 32; guard++) {
      const t = beat.timeAt(nextStep / 4);
      if (t > horizon) break;
      if (!muted) playStep(nextStep, Math.max(t, now + 0.002));
      nextStep++;
    }
  }

  // ---- bite voices (t, f = note frequency) ---------------------------------

  const BITE = {
    lcd(t, f) {
      // Mechanical piezo click: two dry square ticks and a contact click.
      tone({ t, type: 'square', f, a: 0.001, dur: 0.045, g: 0.14, lp: 5000 });
      tone({ t: t + 0.055, type: 'square', f: f * 2, a: 0.001, dur: 0.03, g: 0.08, lp: 6000 });
      noise({ t, a: 0.001, dur: 0.01, g: 0.25, hp: 4500 });
    },
    acid(t, f) {
      [0, 7, 12].forEach((st, i) => {
        const ff = f * Math.pow(2, st / 12);
        tone({ t: t + i * 0.045, type: 'sine', f: ff, f2: ff * 1.5, a: 0.003, dur: 0.16, g: 0.2, vib: 0.06, vibRate: 9 + i * 3, pan: i % 2 ? 0.7 : -0.7, send: 'echo', sendAmt: 0.5 });
      });
      tone({ t, type: 'sawtooth', f: f / 2, a: 0.003, dur: 0.2, g: 0.12, lp: 3500, f2f: 300, q: 14 });
    },
    disco(t, f) {
      tone({ t, type: 'sawtooth', f: f / 2, a: 0.003, dur: 0.12, g: 0.24, lp: 2400, f2f: 500, q: 5 });
      tone({ t: t + 0.07, type: 'sawtooth', f, a: 0.003, dur: 0.14, g: 0.22, lp: 2800, f2f: 600, q: 5 });
      for (let i = 0; i < 3; i++) noise({ t: t + i * 0.011, a: 0.001, dur: i === 2 ? 0.12 : 0.01, g: 0.22, bp: 1500, q: 2, send: 'reverb', sendAmt: 0.3 });
    },
    arcade(t, f) {
      tone({ t, type: 'square', f, a: 0.002, dur: 0.06, g: 0.13 });
      tone({ t: t + 0.06, type: 'square', f: f * 2, f2: f * 2.02, a: 0.002, dur: 0.12, g: 0.12 });
    },
    kombat(t, f) {
      tone({ t, type: 'square', f: f * 1.5, f2: f, glide: 0.04, a: 0.001, dur: 0.16, g: 0.14, crush: true });
      noise({ t, a: 0.001, dur: 0.09, g: 0.35, bp: 1200, q: 1, crush: true });
      tone({ t, type: 'sine', f: 150, f2: 45, a: 0.001, dur: 0.18, g: 0.6, crush: true });
    },
    plastic(t, f) {
      chime(t, f, 0.2, undefined, 'reverb');
      tone({ t: t + 0.05, type: 'triangle', f: f * 4, a: 0.001, dur: 0.25, g: 0.05, send: 'echo', sendAmt: 0.6 });
    },
    bunker(t, f) {
      tone({ t, type: 'sine', f: 170, f2: 38, glide: 0.18, a: 0.002, dur: 0.38, g: 0.9, drive: true });
      metal(t, f, 0.18, 0.35, undefined, rand(-0.5, 0.5));
      noise({ t, a: 0.001, dur: 0.05, g: 0.3, hp: 2500, drive: true });
    },
    court(t, f) {
      tone({ t, type: 'triangle', f, a: 0.006, dur: 0.7, g: 0.2, send: 'reverb', sendAmt: 0.8 });
      tone({ t, type: 'sine', f: f * 2, a: 0.006, dur: 0.9, g: 0.1, send: 'reverb', sendAmt: 0.8 });
      noise({ t, a: 0.02, dur: 0.5, g: 0.12, bp: f * 2, q: 18, send: 'reverb', sendAmt: 0.9 });
    },
    timewarp(t, f) {
      tone({ t, type: 'sawtooth', f: f / 2, f2: f * 2, glide: 0.25, a: 0.004, dur: 0.3, g: 0.13, lp: 800, f2f: 7000, pan: -0.6 });
      tone({ t, type: 'sawtooth', f: f * 2, f2: f / 2, glide: 0.25, a: 0.004, dur: 0.3, g: 0.11, lp: 7000, f2f: 600, pan: 0.6, detune: 30 });
      tone({ t, type: 'sine', f, a: 0.004, dur: 0.35, g: 0.12, vib: 0.12, vibRate: 5, send: 'echo', sendAmt: 0.5 });
    },
    desktop(t, f) {
      tone({ t, type: 'square', f, a: 0.002, dur: 0.08, g: 0.1, lp: 3000 });
      tone({ t: t + 0.1, type: 'sine', f: f * 1.5, a: 0.002, dur: 0.18, g: 0.16 });
    },
  };
  const BITE_IDS = Object.keys(BITE);

  // ---- public API -----------------------------------------------------------

  function normId(id) {
    const s = String(id ?? '').replace(/-pov$/, '');
    return TIMELINE_IDS.includes(s) ? s : 'arcade';
  }

  const api = {
    beat,
    get muted() {
      return muted;
    },

    unlock: safe(function () {
      if (opts.context) {
        if (!ctx) {
          ctx = opts.context;
          offline = typeof globalThis.OfflineAudioContext === 'function' && ctx instanceof globalThis.OfflineAudioContext;
          clockOffset = ctx.currentTime - perfNow();
          build();
        }
        return Promise.resolve(true);
      }
      if (!AC) return Promise.resolve(false);
      if (!ctx) {
        ctx = new AC({ latencyHint: 'interactive' });
        clockOffset = ctx.currentTime - perfNow();
        build();
        beat.setTimeSource(audioClock);
        // A silent one-sample buffer, played inside the gesture, wakes iOS.
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(ctx.destination);
        s.start(0);
      }
      if (ctx.state === 'running') return Promise.resolve(true);
      return ctx.resume().then(
        () => {
          tick();
          return ctx.state === 'running';
        },
        () => false,
      );
    }) ,

    setMuted: safe(function (m) {
      muted = !!m;
      if (!bus) return;
      const g = bus.master.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(muted ? 0 : MASTER, t + 0.03);
    }),

    setTimeline: safe(function (id) {
      timeline = normId(id);
    }),

    setChaos: safe(function (x) {
      chaos = clamp01(Number(x));
      if (bus) bus.music.gain.setTargetAtTime(0.45 + 0.25 * effChaos(), ctx.currentTime, 0.2);
    }),

    eat: safe(function (score) {
      if (!live()) return;
      const t = ctx.currentTime + 0.004;
      if (timeline === 'wrong') {
        // Wrong Universe: one or two voices from other eras, slightly out of tune.
        const n = calm() ? 1 : 1 + (Math.random() < 0.5 + chaos * 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const id = pick(BITE_IDS);
          BITE[id](t + i * 0.03, mtof(biteMidi('wrong', score) + rand(-0.4, 0.4)) * (id === 'lcd' ? 2 : 1));
        }
        return;
      }
      BITE[timeline](t, mtof(biteMidi(timeline, score)));
    }),

    cut: safe(function ({ swing = false } = {}) {
      if (!live()) return;
      const heavy = !!swing && !calm();
      const c = effChaos();
      const t = ctx.currentTime + 0.003;
      const dur = heavy ? 0.55 : 0.3;
      noise({ t, a: 0.004, dur, g: heavy ? 0.5 : 0.3, bp: heavy ? 7000 : 5000, f2f: heavy ? 120 : 300, q: heavy ? 3 : 2, pan: rand(-0.3, 0.3), send: 'echo', sendAmt: 0.15 + c * 0.3 });
      tone({ t, type: 'sine', f: heavy ? 95 : 120, f2: heavy ? 24 : 38, glide: dur, a: 0.002, dur: dur + 0.1, g: heavy ? 0.95 : 0.6, drive: heavy });
      if (heavy) {
        noise({ t, a: 0.001, dur: 0.08, g: 0.45, hp: 2000, drive: true });
        tone({ t, type: 'sawtooth', f: 2400, f2: 60, glide: 0.45, a: 0.002, dur: 0.45, g: 0.1, lp: 3000, f2f: 200, crush: true });
      }
      const g = bus.duck.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(heavy ? 0.2 : 0.45, t, 0.01);
      g.setTargetAtTime(1, t + dur * 0.6, 0.12);
    }),

    die: safe(function () {
      api.stop();
      if (!live()) return;
      const t = ctx.currentTime + 0.005;
      tone({ t, type: 'sawtooth', f: 520, f2: 38, glide: 1.1, a: 0.004, dur: 1.2, g: 0.3, lp: 5000, f2f: 180, q: 4, pan: -0.4 });
      tone({ t, type: 'sawtooth', f: 526, f2: 36, glide: 1.15, a: 0.004, dur: 1.2, g: 0.24, lp: 4000, f2f: 150, detune: 18, pan: 0.4 });
      noise({ t, a: 0.002, dur: 0.7, g: 0.3, lp: 6000, f2f: 200, send: 'reverb', sendAmt: 0.5 });
      tone({ t, type: 'sine', f: 90, f2: 28, glide: 0.6, a: 0.002, dur: 0.8, g: 0.7, drive: true });
    }),

    start: safe(function () {
      if (!beat.running) beat.start();
      rhythm = true;
      nextStep = null;
      if (bus) {
        const g = bus.fade.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setValueAtTime(1, ctx.currentTime);
        if (!offline && ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
      if (!timer && typeof setInterval === 'function') timer = setInterval(api._tick, TICK_MS);
      tick();
    }),

    stop: safe(function () {
      rhythm = false;
      nextStep = null;
      if (timer) clearInterval(timer);
      timer = null;
      beat.stop();
      if (bus) {
        const g = bus.fade.gain;
        const t = ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.setTargetAtTime(0, t, 0.05); // silence what the lookahead already queued
      }
    }),

    // Diagnostics for the harness; never needed by the game.
    debug() {
      return {
        state: ctx ? ctx.state : AC ? 'locked' : 'unsupported',
        offline,
        muted,
        timeline,
        chaos,
        rhythm,
        masterGain: bus ? bus.master.gain.value : null,
        clock: beat.running ? (ctx && !offline && ctx.state === 'running' ? 'audio' : 'frame') : 'idle',
        nextStep,
        ...stats,
      };
    },
  };
  api._tick = safe(tick);
  // Harness hook: play one rhythm step at context time t (offline peak test).
  api._step = safe((step, t) => {
    if (live()) playStep(step, t);
  });
  const unlockInner = api.unlock;
  api.unlock = () => {
    const r = unlockInner();
    return r && typeof r.then === 'function' ? r : Promise.resolve(false);
  };
  return api;
}
