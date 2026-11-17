// SNAKE//SHIFT — procedural sound (BUILD_PLAN 7, 15.3; SOUND_PLAN). Web Audio only, no files.
//
// createAudio(getPrefs, { context, seed, trace }?)
// → { unlock(), setMuted(bool), setGameplay(o), bite(o), shift(o), setLook(look), setLives(n),
//     lifeLost(), lifeGained(), respawned(), die(), start(), stop(), beat, muted, debug(),
//     setScore(n), setTimeline(id), setChaos(x), eat(score), cut() }
//
// - Every method is safe before unlock(), when muted, without Web Audio and after an interrupted context.
// - Sound never drives game state: nothing here reads or writes the simulation.
// - Three signals (SOUND_PLAN 2.1): pace (setGameplay stepMs/score/length) sets tempo and level;
//   danger (setGameplay pressure, smoothed here) speaks through a few roles per world; the world
//   (bite/shift `to`) picks kit, mode, gesture and level cap. Anticipation (beats since the last
//   bite) is a bounded fourth input. The decisions are the pure functions of arrange.js.
// - bite(): one call per food event; the bite voice plays at once, then the treatment that
//   classifyBite() picks (held, change, major, lcd, abyss). shift(): a universe change without a
//   bite (debug lock): kit swap, no bite voice, no impact.
// - `beat` is a createBeat() instance. It runs on the frame clock until unlock(), then follows the
//   audio output clock (or the context clock when a context is passed in). The bar position
//   carries across every change; only pace moves the tempo, never danger.
// - getPrefs() may return { reducedFlash, reducedMotion, reducedAudio, muted }; any reduced switch
//   gives the calmer sound (no major transitions, a third of the danger depth, no anticipation
//   noise, no nerve voice, no fills). Music, bites and a soft heartbeat stay.
// - opts.context lets a harness pass an (Offline)AudioContext; opts.seed fixes all audio
//   randomness (its own generator, never the simulation's); opts.trace (an array) records hits and bites;
//   opts.mute (a Set of hit names, or 'bite') leaves roles out, for level checks in the harness.

import { createBeat } from './beat.js';
import {
  ROOT, MOTIF, DANGER, WRONG_POOL, universeId, paceOf, tempoOf, levelOf, musicGainOf, arrangement,
  stepHits, gestureIndex, bassAt, bassNote, motifNote, barRoot, chordOf, biteMidi, classifyBite,
  anticipationAt, smoothDanger, dangerState, lookPlan, lifeFigure,
} from './arrange.js';

export * from './arrange.js';

const MASTER = 0.8;
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;
const MAX_ACTIVE = 96; // voice budget; beyond it only kick, click, bass and heart play
const OPEN_LP = 18000; // music low-pass, open
const WAIT_LP = 420; // muffled while waiting to respawn
const WAIT_GAIN = 0.38; // and quiet
const TAPE = 0.6; // tape-stop length, seconds
const PACE_TAU = 2; // seconds: pace smoothing
const PUMP = [0.1, 0.14, 0.2, 0.32]; // tonal sidechain depth by level
const OPEN = [1, 1, 1.15, 1.6]; // tonal filter scale by level
const LONG = 0.15; // music voices longer than this get a release handle
const ESSENTIAL = new Set(['kick', 'kickAcc', 'click', 'bass', 'heart']);
// Role levels per world in dB (bass, gesture, hats, snare, perc), set from solo loudness measured
// against each world's kick (targets: bass −5, gesture −9, snare −8, perc −13, hats −15 dB).
const MIX_DB = {
  arcade: [5, 8.8, 3.9, 5.2, 9], mushroom: [1.7, 9.9, 8, 5.8, 9], bunker: [2.4, 12, 6, 2, 6], acid: [4.1, 11.4, 3.4, 3.2, 8],
  lane: [4.8, 9, 3.5, 6.9, -4.3], disco: [5.5, 15, 0, 6.6, -0.7], kombat: [3.9, 5.3, 6.2, 0.6, -5.3], court: [2.7, 4.3, 6, 6.2, 8],
  plastic: [1.6, -0.9, 1.5, 6.1, 5.8], desktop: [4.5, 5.7, -3, -2.3, 7], hangar: [6, 14.5, 8, 4.9, 3.7], abyss: [-4, 5.1, 0, 6.6, 6.6],
  castle: [0.3, -0.9, -1.3, 3.6, 3.4], timewarp: [6, 13.8, 8, 4.1, 8],
};
const ROLE_IX = { bass: 0, gesture: 1, hats: 2, snare: 3, perc: 4 };
const roleG = (id, role) => Math.pow(10, ((MIX_DB[id] || [0, 0, 0, 0, 0])[ROLE_IX[role]] || 0) / 20);
// Music level trim per world, in dB, so a shift changes colour more than loudness.
const TRIM_DB = { lcd: 6, arcade: 2.3, mushroom: 3.2, bunker: -5.8, acid: 0, lane: 0.5, disco: 0.5, kombat: 2.8, court: 1.3, plastic: 1.6, desktop: 7, hangar: -0.4, abyss: 3.2, castle: 2.7, timewarp: -1, wrong: 2 };
const HAT_G = 1.35;
const KICK_G = 0.7; // the kick leads the low end without burying the motif

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ==== kits ======================================================================================

// Rhythm instruments per world. Notes come from arrange.js (patterns, motif, harmony).
const KIT = {
  acid: { kick: { f0: 130, f1: 48, dec: 0.3, g: 0.85 }, hat: { k: 'noise', f: 8000, dec: 0.045, g: 0.11 }, snare: { k: 'snare', f: 1800, dec: 0.16, g: 0.26 }, bass: { type: 'sawtooth', lp: 300, env: 2200, q: 13, dec: 0.14, g: 0.2, oct: -12, slide: true }, perc: { k: 'rim' } },
  disco: { kick: { f0: 110, f1: 50, dec: 0.26, g: 0.92 }, hat: { k: 'open', f: 8500, dec: 0.13, g: 0.1 }, snare: { k: 'clap', f: 1500, dec: 0.13, g: 0.3 }, bass: { type: 'sawtooth', lp: 900, env: 700, q: 4, dec: 0.11, g: 0.22, oct: -12 }, perc: { k: 'conga' } },
  arcade: { kick: { f0: 220, f1: 55, dec: 0.13, g: 0.72, type: 'square', lp: 900 }, hat: { k: 'tick', f: 6000, dec: 0.022, g: 0.09 }, snare: { k: 'noise8', f: 3000, dec: 0.09, g: 0.22 }, bass: { type: 'square', lp: 1400, q: 1, dec: 0.1, g: 0.12, oct: -12 }, perc: { k: 'blip' } },
  kombat: { kick: { f0: 160, f1: 45, dec: 0.2, g: 0.9, crush: true }, hat: { k: 'noise', f: 7000, dec: 0.035, g: 0.1, crush: true }, snare: { k: 'snare', f: 1200, dec: 0.18, g: 0.34, crush: true }, bass: { type: 'square', lp: 700, q: 3, dec: 0.15, g: 0.16, oct: -12, crush: true }, perc: { k: 'tom', crush: true } },
  plastic: { kick: { f0: 90, f1: 45, dec: 0.28, g: 0.75 }, hat: { k: 'glass', f: 7400, dec: 0.04, g: 0.045 }, snare: { k: 'clap', f: 2500, dec: 0.11, g: 0.2, send: 'echo' }, bass: { type: 'sine', lp: 2000, q: 0.5, dec: 0.24, g: 0.2, oct: 0 }, perc: { k: 'bell' } },
  bunker: { kick: { f0: 170, f1: 40, dec: 0.4, g: 1, drive: true }, hat: { k: 'metal', f: 420, dec: 0.06, g: 0.11 }, snare: { k: 'snare', f: 900, dec: 0.22, g: 0.32, drive: true }, bass: { type: 'sawtooth', lp: 170, q: 5, dec: 0.17, g: 0.26, oct: -12, drive: true }, perc: { k: 'clank' }, lowDuck: 0.85 },
  court: { kick: { f0: 80, f1: 46, dec: 0.4, g: 0.72, send: 'reverb' }, hat: { k: 'air', f: 9000, dec: 0.08, g: 0.07 }, snare: { k: 'clap', f: 1800, dec: 0.28, g: 0.16, send: 'reverb' }, bass: { type: 'triangle', lp: 900, q: 0.5, dec: 0.45, g: 0.18, oct: 0 }, perc: { k: 'rim' } },
  timewarp: { kick: { f0: 240, f1: 32, dec: 0.36, g: 0.88 }, hat: { k: 'sweep', f: 4000, dec: 0.06, g: 0.1 }, snare: { k: 'snare', f: 2200, dec: 0.2, g: 0.26 }, bass: { type: 'sawtooth', lp: 600, env: 1500, q: 7, dec: 0.2, g: 0.18, oct: -12, glide: true }, perc: { k: 'zap' } },
  desktop: { kick: { f0: 120, f1: 60, dec: 0.12, g: 0.7, type: 'triangle' }, hat: { k: 'tick', f: 3000, dec: 0.014, g: 0.1 }, snare: { k: 'noise8', f: 2000, dec: 0.06, g: 0.18 }, bass: { type: 'square', lp: 800, q: 2, dec: 0.09, g: 0.11, oct: -12 }, perc: { k: 'click' } },
  lane: { kick: { f0: 140, f1: 48, dec: 0.28, g: 0.8 }, hat: { k: 'shaker', f: 6500, dec: 0.05, g: 0.09 }, snare: { k: 'clap', f: 1700, dec: 0.12, g: 0.24, send: 'echo' }, bass: { type: 'sawtooth', lp: 260, env: 2200, q: 14, dec: 0.15, g: 0.18, oct: -12 }, perc: { k: 'tabla' } },
  hangar: { kick: { f0: 120, f1: 36, dec: 0.48, g: 1, send: 'reverb' }, hat: { k: 'metal', f: 520, dec: 0.045, g: 0.09 }, snare: { k: 'march', f: 1400, dec: 0.14, g: 0.32 }, bass: { type: 'sawtooth', lp: 320, q: 2, dec: 0.3, g: 0.22, oct: -12, a: 0.02 }, perc: { k: 'anvil' } },
  mushroom: { kick: { f0: 200, f1: 52, dec: 0.11, g: 0.72, type: 'square', lp: 1000 }, hat: { k: 'noise', f: 9000, dec: 0.026, g: 0.07, crush: true }, snare: { k: 'noise8', f: 2500, dec: 0.08, g: 0.21 }, bass: { type: 'triangle', lp: 3000, q: 0.5, dec: 0.12, g: 0.26, oct: -12 }, perc: { k: 'blip' } },
  castle: { kick: { f0: 90, f1: 48, dec: 0.24, g: 0.58, send: 'reverb' }, hat: { k: 'glass', f: 9200, dec: 0.05, g: 0.04 }, snare: { k: 'clap', f: 2200, dec: 0.18, g: 0.15, send: 'reverb' }, bass: { type: 'triangle', lp: 1200, q: 0.5, dec: 0.33, g: 0.18, oct: 0 }, perc: { k: 'bell' } },
  abyss: { kick: { f0: 70, f1: 40, dec: 0.6, g: 0.55, a: 0.012, send: 'reverb' }, hat: { k: 'noise', f: 9000, dec: 0.03, g: 0.03 }, snare: { k: 'soft', f: 900, dec: 0.4, g: 0.12, send: 'reverb' }, bass: { type: 'sine', lp: 400, q: 0.5, dec: 0.9, g: 0.26, oct: -12, a: 0.03 }, perc: { k: 'drip' } },
};
const METAL = [1, 1.483, 1.8, 2.546, 2.63, 3.897]; // inharmonic square stack

function perfNow() {
  const p = globalThis.performance;
  return (p && typeof p.now === 'function' ? p.now() : Date.now()) / 1000;
}

export function createAudio(getPrefs, opts = {}) {
  const beat = createBeat({ bpm: tempoOf(0) });
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  const rng = mulberry32(Number.isFinite(opts.seed) ? opts.seed : Math.floor(Math.random() * 4294967296));
  const rand = (a, b) => a + rng() * (b - a);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const trace = Array.isArray(opts.trace) ? opts.trace : null;
  const mute = opts.mute instanceof Set ? opts.mute : null; // harness only: hit names left out (role levels)
  const prefs = () => {
    try {
      return (typeof getPrefs === 'function' && getPrefs()) || {};
    } catch {
      return {};
    }
  };
  const calm = () => {
    const p = prefs();
    return !!(p.reducedAudio || p.reducedFlash || p.reducedMotion);
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
  let clockOffset = 0;
  let warned = false;
  // Pace.
  const game = { stepMs: 150, startMs: 150, capMs: 95, score: 0, length: 3 };
  let paceT = paceOf(game);
  let paceS = paceT;
  let level = levelOf(paceS);
  // Danger.
  let dangerRaw = 0;
  let dangerS = 0;
  let dangerSt = 0;
  let resolvePending = false;
  let lastDial = null;
  // Events and anticipation (beat positions).
  let lastBiteBeat = 0;
  let lastMajorBeat = -Infinity;
  let rapidCount = 0;
  let antic = 0;
  let answerUntil = -1; // regular gesture hits before this step are covered by the answer
  let accentNext = false;
  let lastBite = null;
  // Look and lives.
  let look = '2d';
  let lives = 3;
  let waiting = false;
  let tapeUntil = -1;
  let gap = { start: -1, end: -1, chops: 0 };
  let dialsHold = -1;
  let dialTargets = {};
  let wetCut = false;
  let wrongBar = { key: -1, id: 'arcade' };
  let glideBar = { bar: -1, ratio: 1.5 };
  let lastBass = { step: -9, f: 0 };
  let planCache = null;
  let sfxDest = null;
  let sendScale = 1;
  const voices = []; // { t, end, srcs, music, kill, done, cancelled }
  const stats = { created: 0, voices: 0, steps: 0, errors: 0, hearts: 0, cancelled: 0, released: 0, bites: 0, majors: 0, gaps: 0, answers: 0, maxActive: 0, lastEvent: null };

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
  const record = (e) => {
    if (trace && trace.length < 60000) trace.push(e);
  };

  function plan() {
    const r = calm();
    if (!planCache || planCache.id !== timeline || planCache.lv !== level || planCache.reduced !== r) {
      planCache = { ...arrangement(timeline, level, { reduced: r }), lv: level };
    }
    return planCache;
  }

  /** Wrong Universe: another world's plan per bar, per half bar while tense. */
  function borrowed(step) {
    const bar = Math.floor(step / 16);
    const key = bar * 2 + (dangerSt >= 1 && step % 16 >= 8 ? 1 : 0);
    if (wrongBar.key !== key) wrongBar = { key, id: pick(WRONG_POOL) };
    return arrangement(wrongBar.id, level, { reduced: calm() });
  }

  function beatPos() {
    if (!beat.running) return 0;
    return beat.position(ctx && bus ? ctx.currentTime : undefined);
  }

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
  //
  // drums → music; bass → low (kick-ducked) → music; tonal → pump (sidechain) → dip (event dips) → music
  // music (level by pace) → lpf (respawn muffle) → wait → duck (vacuum, LCD stop) → fade (stop) → master
  // reverb, echo returns → wet (LCD cut, stop fade) → wetLp (follows the muffle) → master
  // wait → widen → echo (3D / first person)      heart → fade      sfx (bites, events) → master
  // master → compressor (gentle) → trim → soft clip (protection only) → out

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
  function filter(type, f, q = 0.7) {
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    return fl;
  }

  function build() {
    const c = ctx;
    const master = gainNode(muted ? 0 : MASTER);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.18;
    const trim = gainNode(1);
    const clip = c.createWaveShaper();
    clip.curve = curve(SOFTCLIP); // protection only: nothing reaches 1.0
    clip.oversample = '2x';
    master.connect(comp);
    comp.connect(trim);
    trim.connect(clip);
    clip.connect(c.destination);

    const sfx = gainNode(0.85, master);
    const fade = gainNode(1, master); // stop()/die() fade
    const duck = gainNode(1, fade); // vacuum gap, LCD stop
    const wait = gainNode(1, duck); // respawn wait
    const lpf = filter('lowpass', OPEN_LP, 0.7);
    lpf.connect(wait);
    const music = gainNode(musicGainOf(paceS), lpf);
    const low = gainNode(1, music); // bass, ducked by the kick
    const dip = gainNode(1, music); // tonal event dips (held bite, life figure)
    const pump = gainNode(1, dip); // tonal sidechain
    const heart = gainNode(1, fade);

    // One wet return for reverb and echo.
    const wetLp = filter('lowpass', OPEN_LP, 0.7);
    wetLp.connect(master);
    const wet = gainNode(1, wetLp);
    const len = Math.floor(c.sampleRate * 2.2);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    const reverbIn = gainNode(1);
    const revHp = filter('highpass', 200, 0.7); // the low end stays dry and tight
    reverbIn.connect(revHp);
    revHp.connect(conv);
    conv.connect(gainNode(0.3, wet));
    // Echo: dotted-eighth, filtered feedback; follows the tempo.
    const delay = c.createDelay(2);
    delay.delayTime.value = beat.period * 0.75;
    const fbf = filter('lowpass', 2600);
    const fb = gainNode(0.34);
    const echoIn = gainNode(1);
    const echoHp = filter('highpass', 150, 0.7);
    echoIn.connect(echoHp);
    echoHp.connect(delay);
    delay.connect(fbf);
    fbf.connect(fb);
    fb.connect(delay);
    delay.connect(gainNode(0.32, wet));
    const widen = gainNode(0, echoIn);
    wait.connect(widen);

    const noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;

    // First-person drone: two detuned saws on the bar root, 110–220 Hz, into the music low-pass.
    const droneGain = gainNode(0, lpf);
    const dlp = filter('lowpass', 700);
    dlp.connect(droneGain);
    const droneOscs = [-7, 7].map((det) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(ROOT);
      o.detune.value = det;
      o._det = det;
      o.connect(dlp);
      o.start();
      return o;
    });

    bus = { master, comp, sfx, music, low, dip, pump, lpf, wait, duck, fade, heart, wet, wetLp, reverbIn, echoIn, delay, widen, droneGain, droneOscs, noise: noiseBuf, shapers: new Map() };
    sfxDest = sfx;
  }

  // Shared nonlinear stages per destination: 'drive' (tanh) and 'crush' (16-bit-ish steps).
  function shaper(dest, kind) {
    let m = bus.shapers.get(dest);
    if (!m) bus.shapers.set(dest, (m = {}));
    if (!m[kind]) {
      const ws = ctx.createWaveShaper();
      ws.curve = kind === 'drive' ? curve((x) => Math.tanh(6 * x) / Math.tanh(6)) : curve((x) => Math.round(x * 7) / 7, 4096);
      const g = gainNode(kind === 'drive' ? 0.5 : 0.8, dest);
      ws.connect(g);
      m[kind] = ws;
    }
    return m[kind];
  }

  const isMusic = (d) => !!bus && (d === bus.music || d === bus.pump || d === bus.low || d === bus.dip);

  // Param helper: start a new automation segment from the current value.
  function anchor(param, t) {
    param.cancelScheduledValues(t);
    const v = Number(param.value);
    param.setValueAtTime(Number.isFinite(v) ? v : 0, t);
    return Number.isFinite(v) ? v : 0;
  }

  // ---- voice bookkeeping ---------------------------------------------------

  function prune() {
    if (voices.length < 512) return;
    const now = ctx.currentTime;
    let w = 0;
    for (const v of voices) if (!v.done && !v.cancelled && v.end > now - 0.05) voices[w++] = v;
    voices.length = w;
  }

  function concurrent(t) {
    let n = 0;
    for (const v of voices) if (!v.done && !v.cancelled && v.t <= t && v.end > t) n++;
    if (n > stats.maxActive) stats.maxActive = n;
    return n;
  }

  // Cancel music voices that have not started by time t (kit swap, tape stop). The pump and low
  // automation goes too (it belongs to the cancelled kicks); a held bite never calls this.
  function cancelQueued(t) {
    let n = 0;
    for (const v of voices) {
      if (!v.music || v.cancelled || v.done || v.t < t) continue;
      v.cancelled = true;
      n++;
      for (const s of v.srcs) {
        try {
          s.stop(t);
        } catch {}
      }
    }
    if (bus) {
      for (const g of [bus.pump.gain, bus.low.gain]) {
        g.cancelScheduledValues(t);
        g.setTargetAtTime(1, t, 0.02);
      }
    }
    stats.cancelled += n;
    return n;
  }

  // Release sounding music voices with more than `left` seconds to go, within about `within` seconds.
  function releaseTails(t, within = 0.07, left = 0.25) {
    let n = 0;
    for (const v of voices) {
      if (!v.music || !v.kill || v.cancelled || v.done || v.t > t || v.end <= t + left) continue;
      v.kill.gain.setTargetAtTime(0, t, within / 3);
      v.end = t + within * 2;
      n++;
    }
    stats.released += n;
    return n;
  }

  // Next unscheduled step = first grid step at or after t (bar position carries on).
  function rewind(t) {
    if (beat.running) nextStep = Math.max(0, Math.ceil(beat.position(t) * 4 - 1e-6));
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
      fl.frequency.setValueAtTime(Math.min(20000, f0), t);
      if (o.f2f) fl.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(20, o.f2f)), t + (o.fdur ?? a + dur));
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
    const dest = o.dest || sfxDest || bus.sfx;
    const music = isMusic(dest);
    let kill = null;
    if (music && a + (o.hold || 0) + dur > LONG) {
      kill = ctx.createGain(); // release handle for kit changes
      add(kill);
    }
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      add(p);
    }
    for (const s of srcs) s.connect(head);
    tail.connect(o.drive ? shaper(dest, 'drive') : o.crush ? shaper(dest, 'crush') : dest);
    if (o.send) {
      const s = gainNode((o.sendAmt ?? 0.4) * sendScale, o.send === 'reverb' ? bus.reverbIn : bus.echoIn);
      tail.connect(s);
      nodes.push(s);
    }
    const end = t + a + (o.hold || 0) + dur + 0.03;
    for (const s of srcs) {
      if (s.loop) s.start(t, rng() * 0.9);
      else s.start(t);
      s.stop(end);
    }
    for (const n of extra)
      if (n.start) {
        n.start(t);
        n.stop(end);
      }
    prune();
    const v = { t, end, srcs, music, kill, done: false, cancelled: false };
    voices.push(v);
    stats.created += nodes.length;
    stats.voices++;
    srcs[0].onended = () => {
      v.done = true;
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
    s.frequency.setValueAtTime(Math.min(20000, o.f), o.t); // Web Audio warns above 24 kHz
    if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(1, o.f2)), o.t + (o.glide ?? (o.a ?? 0.004) + (o.dur ?? 0.2)));
    const det = o.detune || 0;
    if (det) s.detune.setValueAtTime(det, o.t);
    s._det = det;
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

  const toneG = (o, gm) => tone({ ...o, g: (o.g ?? 0.2) * gm });
  const noiseG = (o, gm) => noise({ ...o, g: (o.g ?? 0.2) * gm });
  const metalG = (...a) => metal(...a);
  function metal(t, f, dec, g, dest, pan) {
    const srcs = METAL.map((r) => {
      const s = ctx.createOscillator();
      s.type = 'square';
      s.frequency.value = Math.min(20000, f * r);
      return s;
    });
    chain(srcs, { t, a: 0.001, dur: dec, g: g / 3, bp: 8000, q: 1.2, dest, pan });
  }

  function chime(t, f, g, dest, send = 'echo', sendAmt = 0.35) {
    const parts = [
      [1, 1, 0.9],
      [2.76, 0.45, 0.5],
      [5.4, 0.22, 0.3],
      [8.93, 0.12, 0.18],
    ];
    for (const [r, gm, d] of parts) if (f * r < 18000) tone({ t, type: 'sine', f: f * r, a: 0.001, dur: d, g: g * gm, dest, send, sendAmt });
  }

  // ---- rhythm instruments --------------------------------------------------

  function kick(t, p, dest, gm = 1) {
    gm *= KICK_G;
    tone({ t, type: p.type || 'sine', f: p.f0, f2: p.f1, glide: p.dec * 0.5, a: p.a ?? 0.002, dur: p.dec, g: p.g * gm, lp: p.lp, drive: p.drive, crush: p.crush, dest, send: p.send, sendAmt: 0.22 });
    noise({ t, a: 0.001, dur: 0.012, g: p.g * gm * (p.a ? 0.08 : 0.25), hp: 3000, dest });
  }

  function hat(t, p, acc, dest, dm = 1) {
    const g = p.g * acc * HAT_G;
    const dec = p.dec * dm;
    switch (p.k) {
      case 'metal': return metal(t, p.f, dec, g, dest, rand(-0.3, 0.3));
      case 'tick': return tone({ t, type: 'square', f: p.f, a: 0.001, dur: dec, g: g * 0.6, hp: 1500, dest });
      case 'glass': return tone({ t, type: 'sine', f: p.f * rand(1, 1.03), a: 0.001, dur: dec * 2, g, dest, send: 'echo', sendAmt: 0.25 });
      case 'air': return noise({ t, a: 0.01, dur: dec, g, bp: p.f, q: 1.5, dest, send: 'reverb', sendAmt: 0.4 });
      case 'sweep': return noise({ t, a: 0.002, dur: dec, g, bp: p.f, f2f: p.f * 2.5, q: 6, dest });
      case 'shaker': return noise({ t, a: 0.012, dur: dec, g, hp: p.f, pan: rand(-0.3, 0.3), dest });
      default: return noise({ t, a: 0.001, dur: dec, g, hp: p.f, crush: p.crush, dest });
    }
  }

  function snare(t, p, dest, gm = 1) {
    const g = p.g * gm;
    if (p.k === 'clap') {
      for (let i = 0; i < 3; i++) noise({ t: t + i * 0.011, a: 0.001, dur: i === 2 ? p.dec : 0.01, g, bp: p.f, q: 2, dest, send: p.send, sendAmt: 0.35 });
    } else if (p.k === 'noise8') {
      noise({ t, a: 0.001, dur: p.dec, g, bp: p.f, q: 0.8, crush: true, dest });
    } else if (p.k === 'march') {
      // Field snare: a flam, a tight body and a wire rattle.
      noise({ t, a: 0.001, dur: 0.02, g: g * 0.5, bp: p.f, q: 1, dest });
      noise({ t: t + 0.018, a: 0.001, dur: p.dec, g, bp: p.f, q: 0.9, dest });
      tone({ t: t + 0.018, type: 'triangle', f: 220, f2: 160, a: 0.001, dur: 0.07, g: g * 0.6, dest });
      noise({ t: t + 0.02, a: 0.003, dur: p.dec * 1.6, g: g * 0.25, hp: 3500, dest });
    } else if (p.k === 'soft') {
      noise({ t, a: 0.02, dur: p.dec, g, bp: p.f, q: 1.2, dest, send: p.send, sendAmt: 0.6 });
      tone({ t, type: 'sine', f: 180, f2: 150, a: 0.01, dur: 0.2, g: g * 0.6, dest });
    } else {
      noise({ t, a: 0.001, dur: p.dec, g, bp: p.f, q: 0.9, drive: p.drive, crush: p.crush, dest });
      tone({ t, type: 'triangle', f: 190, f2: 140, a: 0.001, dur: 0.09, g: g * 0.7, drive: p.drive, crush: p.crush, dest });
    }
  }

  // Bass: the anchor. tone 0..1 opens the filter (danger), acc accents a motif hit,
  // slideFrom glides in from the last note (acid), glideRatio bends to a per-bar target (time warp).
  function bass(t, p, midi, dest, o = {}) {
    const f = mtof(midi);
    const fs = (o.fs || 1) * (1 + (o.tone || 0));
    const acc = p.env && o.acc ? 1.6 : 1;
    const from = o.slideFrom;
    tone({
      t, type: p.type, f: from || f, f2: from ? f : p.glide ? f * (o.glideRatio || 1.5) : undefined, glide: from ? 0.045 : p.dec,
      a: p.a ?? 0.004, dur: p.dec, g: p.g * (o.gm || 1), lp: (p.lp + (p.env || 0) * acc) * fs, f2f: p.env ? p.lp * fs : undefined, fdur: p.dec,
      q: (p.q || 1) + (o.tone || 0) * 5, drive: p.drive, crush: p.crush, dest, detune: p.type === 'sawtooth' ? rand(-5, 5) : 0,
    });
    // Sine and triangle basses get a quiet octave so small speakers keep the line.
    if (p.type === 'sine' || p.type === 'triangle') tone({ t, type: 'sine', f: f * 2, a: p.a ?? 0.004, dur: p.dec * 0.7, g: p.g * 0.45 * (o.gm || 1), dest });
  }

  // Abyss: deep pad (the anchor), slow plucks, distant calls.
  function pad(t, shift, dest, rub, gm = 1) {
    const P = beat.period;
    [0, 7, 12, 15].forEach((st, i) => tone({ t, type: 'sawtooth', f: mtof(ROOT + shift + st), a: 1.2, hold: P * 3, dur: P * 3, g: 0.024 * gm, lp: 900, dest, detune: rand(-9, 9), pan: i % 2 ? 0.5 : -0.5, send: 'reverb', sendAmt: 0.6 }));
    tone({ t, type: 'sine', f: mtof(ROOT - 12 + shift), a: 0.8, hold: P * 4, dur: P * 2, g: 0.045 * gm, dest }); // long sine under it
    if (rub) tone({ t, type: 'sine', f: mtof(ROOT + shift + 1), a: 1.5, hold: P * 2, dur: P * 2, g: 0.014, dest, send: 'reverb', sendAmt: 0.6 });
  }
  function pluck(t, midi, dest) {
    tone({ t, type: 'triangle', f: mtof(midi), a: 0.015, dur: 1.1, g: 0.075, lp: 2400, dest, send: 'reverb', sendAmt: 0.6 });
    tone({ t, type: 'sine', f: mtof(midi + 12), a: 0.02, dur: 0.8, g: 0.022, dest });
  }
  function call(t, shift, dest) {
    const f = mtof(ROOT + 24 + shift + pick([0, 3, 7]));
    tone({ t, type: 'sine', f, f2: f * 0.75, glide: 1.6, a: 0.4, dur: 1.6, g: 0.03, vib: 0.01, vibRate: 3, pan: rand(-0.6, 0.6), dest, send: 'reverb', sendAmt: 0.9 });
  }

  function perc(t, p, i, dest, shift, gm = 1) {
    const tone = (o) => toneG(o, gm);
    const noise = (o) => noiseG(o, gm);
    const metal = (t1, f, dec, g, d, pan) => metalG(t1, f, dec, g * gm, d, pan);
    switch (p.k) {
      case 'tabla':
        if (i % 7 !== 0) {
          tone({ t, type: 'sine', f: 540, f2: 560, glide: 0.05, a: 0.001, dur: 0.2, g: 0.1, dest }); // na
          tone({ t, type: 'sine', f: 1090, a: 0.001, dur: 0.07, g: 0.04, dest });
        } else {
          tone({ t, type: 'sine', f: 95, f2: 150, glide: 0.12, a: 0.002, dur: 0.28, g: 0.22, dest }); // ghe, bending up
        }
        noise({ t, a: 0.001, dur: 0.015, g: 0.06, hp: 3000, dest });
        break;
      case 'anvil':
        for (const [r, gm, d] of [[1, 1, 0.5], [2.76, 0.5, 0.35], [5.4, 0.3, 0.22], [8.93, 0.15, 0.12]]) tone({ t, type: 'sine', f: 820 * r, a: 0.001, dur: d, g: 0.07 * gm, dest, send: 'reverb', sendAmt: 0.3 });
        noise({ t, a: 0.001, dur: 0.02, g: 0.1, hp: 4000, dest });
        break;
      case 'blip':
        tone({ t, type: 'square', f: mtof(ROOT + 36 + shift + (i % 2 ? 7 : 12)), a: 0.001, dur: 0.04, g: 0.03, lp: 6000, dest });
        break;
      case 'bell':
        tone({ t, type: 'triangle', f: 2600, a: 0.001, dur: 0.45, g: 0.03, dest, send: 'reverb', sendAmt: 0.4 });
        tone({ t, type: 'sine', f: 2600 * 2.76, a: 0.001, dur: 0.18, g: 0.012, dest });
        break;
      case 'conga': {
        const f = i % 2 ? 330 : 240;
        tone({ t, type: 'sine', f, f2: f * 0.9, a: 0.001, dur: 0.16, g: 0.16, dest });
        break;
      }
      case 'rim':
        tone({ t, type: 'triangle', f: 1700, a: 0.001, dur: 0.03, g: 0.1, hp: 800, dest });
        noise({ t, a: 0.001, dur: 0.02, g: 0.08, bp: 3500, q: 3, dest });
        break;
      case 'tom':
        tone({ t, type: 'sine', f: 180 - (i % 3) * 30, f2: 70, glide: 0.18, a: 0.001, dur: 0.2, g: 0.24, crush: p.crush, dest });
        break;
      case 'clank':
        metal(t, rand(900, 1400), 0.05, 0.1, dest, rand(-0.5, 0.5));
        break;
      case 'zap':
        tone({ t, type: 'sawtooth', f: 3000, f2: 200, glide: 0.08, a: 0.001, dur: 0.08, g: 0.04, lp: 5000, dest });
        break;
      case 'click':
        tone({ t, type: 'square', f: 4200, a: 0.001, dur: 0.012, g: 0.05, dest });
        break;
      case 'drip': {
        const f = rand(900, 1600);
        tone({ t, type: 'sine', f, f2: f * 2.2, glide: 0.06, a: 0.002, dur: 0.12, g: 0.04, dest, send: 'reverb', sendAmt: 0.8 });
        break;
      }
    }
  }

  function fill(t, kit, s, dest, gm = 1) {
    const k = s - 12;
    snare(t, kit.snare, dest, (0.4 + 0.15 * k) * gm);
    tone({ t, type: 'sine', f: 110 + 45 * k, f2: 70 + 30 * k, glide: 0.12, a: 0.001, dur: 0.13, g: 0.18 * Math.min(1.5, gm), crush: kit.kick.crush, dest });
  }
  function click(t, s) {
    tone({ t, type: 'square', f: s === 0 ? 2600 : 2000, a: 0.001, dur: 0.014, g: s === 0 ? 0.14 : 0.09, hp: 1000, dest: bus.music });
  }
  // Last life: once a bar between kicks, with body around 150–200 Hz for small speakers.
  function heart(t) {
    const g = calm() ? 0.06 : 0.09; // about 13 dB under the kick
    tone({ t, type: 'sine', f: 180, f2: 70, glide: 0.09, a: 0.004, dur: 0.12, g, dest: bus.heart });
    tone({ t: t + 0.16, type: 'sine', f: 160, f2: 62, glide: 0.08, a: 0.004, dur: 0.11, g: g * 0.7, dest: bus.heart });
    stats.hearts++;
  }
  // Last life: the nerve, two quiet beating sines in the mid register, one bar in two.
  function nerve(t, shift) {
    const f = mtof(ROOT + 31 + shift);
    const P = beat.period;
    tone({ t, type: 'sine', f, a: P * 1.2, hold: P * 1.6, dur: P * 1.2, g: 0.011, dest: bus.pump, pan: -0.3 });
    tone({ t, type: 'sine', f: f + 2.3, a: P * 1.2, hold: P * 1.6, dur: P * 1.2, g: 0.011, dest: bus.pump, pan: 0.3 });
  }
  function lift(t) {
    const P = beat.period;
    noise({ t, a: P * 0.85, dur: 0.05, g: 0.075, bp: 1200, f2f: 6500, fdur: P, q: 1.5, dest: bus.music }); // about 20 dB under the mix
  }
  function pumpAt(t, depth) {
    if (!(depth > 0)) return;
    const g = bus.pump.gain;
    g.setValueAtTime(1 - depth, t);
    g.setTargetAtTime(1, t + 0.012, beat.period * (depth > 0.25 ? 0.25 : 0.14));
  }
  // The kick owns the low end: the bass ducks under it and comes back fast.
  function duckLow(t, depth) {
    const g = bus.low.gain;
    g.setValueAtTime(1 - depth, t);
    g.setTargetAtTime(1, t + 0.01, 0.045);
  }

  // ---- the gesture: each world's voice for the motif --------------------------------

  function gesture(id, t, idx, bar, o = {}) {
    const d = bus.pump;
    const w = arrangement(id).world;
    const dz = w.danger || {};
    const tense = !!o.tense;
    const up = tense && dz.gestureStep ? dz.gestureStep : 0;
    const n = motifNote(id, idx, bar, { up });
    const r = ROOT + n;
    const open = (o.open || 1) * (1 + 0.8 * antic);
    const gm = (o.gm || 1) * roleG(id, 'gesture');
    switch (id) {
      case 'arcade': {
        const m = r + 24 + (tense && dz.gestureUp ? dz.gestureUp : 0);
        tone({ t, type: 'square', f: mtof(m), a: 0.002, dur: 0.09, g: 0.05 * gm, lp: 3800 * open, dest: d });
        break;
      }
      case 'mushroom': {
        const m = r + 24;
        if (idx >= 3 || tense) tone({ t, type: 'square', f: mtof(m - 2), a: 0.001, dur: 0.022, g: 0.022 * gm, lp: 7000, dest: d }); // grace
        tone({ t: t + 0.028, type: 'square', f: mtof(m), a: 0.001, dur: 0.07, g: 0.045 * gm, lp: 6500 * open, dest: d });
        break;
      }
      case 'bunker':
        metal(t, [380, 455, 420, 560, 455, 380][idx], 0.07, 0.15 * gm, d, idx % 2 ? 0.2 : -0.2);
        break;
      case 'acid': {
        const f = mtof(r + 24);
        tone({ t, type: 'sine', f, f2: f * 1.5, a: 0.002, dur: 0.12, g: 0.08 * gm, vib: 0.07, vibRate: 9 + idx, pan: idx % 2 ? 0.5 : -0.5, dest: d, send: 'echo', sendAmt: 0.5 });
        break;
      }
      case 'lane': {
        const f = mtof(r + 24);
        tone({ t, type: 'sawtooth', f, f2: f * 1.01, a: 0.001, dur: 0.22, g: 0.1 * gm, bp: 1500 * Math.min(1.6, open), f2f: 600, q: 1.8, pan: idx % 2 ? 0.35 : -0.35, dest: d, send: 'echo', sendAmt: 0.3 });
        break;
      }
      case 'disco': {
        // Chopped stab: the bar's chord voiced under the motif note.
        const top = r + 12;
        const notes = [top];
        for (const c of chordOf(bar, w.third)) {
          let x = top - ((((top - ROOT - c) % 12) + 12) % 12);
          if (x === top) x -= 12;
          notes.push(x);
        }
        notes.sort((a, b) => b - a);
        for (const m of notes.slice(0, 3)) tone({ t, type: 'sawtooth', f: mtof(m), a: 0.003, dur: 0.08, g: 0.028 * gm, lp: 2600 * open, f2f: 900, q: 2, dest: d, detune: rand(-6, 6) });
        break;
      }
      case 'kombat': {
        const ch = chordOf(bar, w.third);
        const root = ROOT + 12 + barRoot(bar, 'diatonic');
        const notes = [r + 12, root + ((ch[1] - ch[0] + 12) % 12), root + 7];
        if (tense && dz.rub) notes.push(r + 13); // the stab rubs
        for (const m of notes) tone({ t, type: 'square', f: mtof(m), a: 0.002, dur: 0.18, g: 0.04 * gm, crush: true, dest: d });
        noise({ t, a: 0.001, dur: 0.12, g: 0.12 * gm, bp: 1400, q: 1, crush: true, dest: bus.music });
        break;
      }
      case 'court': {
        const f = mtof(r + 24);
        tone({ t, type: 'sine', f, a: 0.05, dur: 0.55, g: 0.06 * gm, dest: d, send: 'reverb', sendAmt: 0.8 });
        if (idx === 0 || idx === 3) noise({ t, a: 0.2, dur: 0.5, g: 0.06 * gm, bp: f * 2, q: 14, dest: d, send: 'reverb', sendAmt: 0.8 }); // whistle swell
        break;
      }
      case 'plastic':
        chime(t, mtof(r + 36), 0.065 * gm, d, 'echo', 0.3);
        break;
      case 'desktop': {
        const f = mtof(r + 24);
        tone({ t, type: 'square', f, a: 0.002, dur: 0.08, g: 0.045 * gm, lp: 2600 * open, dest: d });
        tone({ t, type: 'sine', f: f * 2, a: 0.002, dur: 0.12, g: 0.02 * gm, dest: d });
        break;
      }
      case 'hangar':
        for (const st of [0, 7]) tone({ t, type: 'sawtooth', f: mtof(r + st), a: 0.008, dur: 0.17, g: 0.05 * gm, lp: 1500 * open, f2f: 500, dest: d });
        tone({ t, type: 'sawtooth', f: mtof(r + 12), a: 0.008, dur: 0.12, g: 0.025 * gm, lp: 2200, f2f: 700, dest: d });
        break;
      case 'abyss':
        pluck(t, r + 12, d);
        break;
      case 'castle': {
        const f = mtof(r + 36);
        if (tense) chime(t, f * Math.pow(2, 2 / 12), 0.025 * gm, d, 'reverb', 0.4); // grace
        chime(tense ? t + 0.035 : t, f, 0.055 * gm, d, 'reverb', 0.45);
        break;
      }
      case 'timewarp': {
        // Reversed: slow swell, sudden stop.
        const f = mtof(r + 12);
        tone({ t, type: 'sawtooth', f: f * 0.98, f2: f, a: 0.11, dur: 0.012, g: 0.05 * gm, lp: 2400 * open, dest: d, pan: idx % 2 ? 0.4 : -0.4 });
        break;
      }
    }
  }

  function ornament(id, t, s, v, p, shift, gm = 1) {
    const d = bus.pump;
    switch (id) {
      case 'arcade': {
        const idx = gestureIndex(p, v - 1);
        if (idx >= 0) tone({ t, type: 'square', f: mtof(ROOT + 36 + motifNote(id, idx, Math.floor(v / 16))), a: 0.001, dur: 0.05, g: 0.016 * gm, lp: 5000, dest: d });
        break;
      }
      case 'mushroom':
        tone({ t, type: 'square', f: mtof(ROOT + 48 + shift + 7), a: 0.001, dur: 0.03, g: 0.016 * gm, lp: 8000, dest: d });
        break;
      case 'bunker':
        metal(t, 610, 0.03, 0.05 * gm, d, s < 8 ? -0.4 : 0.4);
        break;
      case 'hangar': // low brass swell on the bar
        for (const st of [0, 7, 12]) tone({ t, type: 'sawtooth', f: mtof(ROOT - 12 + shift + st), a: 0.25, dur: beat.period * 3, g: 0.028 * Math.min(2, gm), lp: 450, f2f: 900, fdur: beat.period * 2, dest: d, detune: rand(-6, 6) });
        break;
      case 'abyss':
        call(t, shift, d);
        break;
      case 'castle':
        tone({ t, type: 'triangle', f: mtof(ROOT + 48 + shift), a: 0.001, dur: 0.4, g: 0.02 * gm, dest: d, send: 'reverb', sendAmt: 0.5 });
        break;
    }
  }

  // Critical danger: a short dissonant ghost (flat second, or tritone in Bunker and Desktop);
  // resolve: the same voice on the root once the danger lets go.
  function rubVoice(id, t, shift, resolve) {
    const d = bus.pump;
    const n = ROOT + shift + (resolve ? 0 : id === 'bunker' || id === 'desktop' ? 6 : 1);
    switch (id) {
      case 'bunker': return metal(t, mtof(n + 24), 0.05, 0.07, d, 0);
      case 'desktop': return tone({ t, type: 'square', f: mtof(n), a: 0.002, dur: 0.06, g: 0.035, lp: 1200, dest: d }); // error buzz
      case 'kombat': return tone({ t, type: 'square', f: mtof(n + 12), a: 0.002, dur: 0.08, g: 0.03, crush: true, dest: d });
      default: return tone({ t, type: 'square', f: mtof(n + 24), a: 0.002, dur: 0.06, g: 0.025, lp: 3000, dest: d });
    }
  }

  function laneDrone(t, wide, gm = 1) {
    const P = beat.period;
    const det = wide ? 22 : 7;
    [0, 7, 12].forEach((st, i) => tone({ t, type: 'sawtooth', f: mtof(ROOT + st), a: 0.25, hold: P * 2.6, dur: P * 1.2, g: 0.017 * gm, lp: 900, dest: bus.pump, detune: (i % 2 ? 1 : -1) * det, pan: (i - 1) * 0.3 }));
  }

  // ---- the scheduler -----------------------------------------------------------------

  function playStep(step, t0) {
    const base = plan();
    const p = base.mix ? borrowed(step) : base;
    const o = { state: dangerSt, antic, waiting, heart: lives === 1, nerve: lives === 1 && !calm(), accent: accentNext, resolve: resolvePending };
    const hits = stepHits(step, p, o);
    stats.steps++;
    if (!hits.length) return;
    if (accentNext && (hits.includes('kickAcc') || hits.includes('kick'))) accentNext = false;
    if (resolvePending && hits.includes('resolve')) resolvePending = false;
    record({ t: +t0.toFixed(4), step, id: p.id, hits: hits.join(' ') });
    const v = p.halfTime ? step / 2 : step;
    const s = v % 16;
    const bar = Math.floor(v / 16);
    const w = p.world;
    const id = p.id;
    const kit = KIT[id] || KIT.arcade;
    const shift = barRoot(bar, w.policy || 'pedal');
    const quiet = t0 < tapeUntil || (t0 >= gap.start && t0 < gap.end - 0.002 && !gap.chops);
    const room = concurrent(t0) < MAX_ACTIVE;
    const tense = dangerSt >= 1;
    const swung = w.swing && v % 2 === 1 ? t0 + (w.swing * beat.period) / 4 : t0;
    const fs = OPEN[p.level] || 1;
    const dz = w.danger || {};
    const toneAmt = (who) => (dz.tone === who ? dangerS * (who === 'bass' ? 1.4 : 0.8) : 0);
    if (s === 0) droneTo(t0, shift);
    for (const h of hits) {
      if (h === 'heart') {
        heart(t0);
        continue;
      }
      if (quiet || (mute && mute.has(h))) continue;
      if (!room && !ESSENTIAL.has(h)) continue;
      switch (h) {
        case 'click': click(t0, step % 16); break;
        case 'kick':
        case 'kickAcc':
          kick(t0, kit.kick, bus.music, h === 'kickAcc' ? 1.18 : 1);
          if (h === 'kickAcc') noise({ t: t0, a: 0.001, dur: 0.03, g: 0.12, hp: 2500, dest: bus.music });
          pumpAt(t0, PUMP[p.level] * (p.soft ? 0.5 : 1));
          duckLow(t0, kit.lowDuck || 0.55);
          break;
        case 'hat': hat(swung, kit.hat, roleG(id, 'hats'), bus.music, 1 - 0.4 * antic); break;
        case 'hat16':
          if (id === 'hangar') snare(swung, kit.snare, bus.music, 0.16 * roleG(id, 'snare')); // snare ruffs
          else hat(swung, kit.hat, 0.5 * roleG(id, 'hats'), bus.music, 1 - 0.4 * antic);
          break;
        case 'snare': snare(t0, kit.snare, bus.music, roleG(id, 'snare')); break;
        case 'bass': {
          const x = bassAt(p, v, { tense });
          if (x == null) break;
          let midi = ROOT + kit.bass.oct + bassNote(id, x, bar);
          if (tense && dz.bassUp && s >= 10) midi += 12; // disco: the answer pops an octave
          const slideFrom = kit.bass.slide && lastBass.step === step - 1 ? lastBass.f : 0;
          if (kit.bass.glide && glideBar.bar !== bar) glideBar = { bar, ratio: pick(dangerSt >= 1 && dz.glideWide ? [0.25, 3, 4] : [0.5, 1.5, 2]) };
          bass(swung, kit.bass, midi, bus.low, { fs, tone: toneAmt('bass'), acc: MOTIF.steps.includes(s), slideFrom, glideRatio: glideBar.ratio, gm: roleG(id, 'bass') });
          lastBass = { step, f: mtof(midi) };
          break;
        }
        case 'drone': laneDrone(t0, tense && dz.wide, roleG(id, 'bass')); break;
        case 'pad': pad(t0, shift, bus.pump, tense && dz.padRub, roleG(id, 'bass')); break;
        case 'gesture': {
          if (step < answerUntil) break;
          const gv = tense && dz.offbeat ? v - 1 : v;
          const idx = gestureIndex(p, gv);
          if (idx >= 0) gesture(id, swung, idx, bar, { tense, open: fs * (1 + toneAmt('gesture')) });
          break;
        }
        case 'orn': ornament(id, swung, s, v, p, shift, roleG(id, 'gesture')); break;
        case 'perc': perc(swung, kit.perc, v % ((w.perc && w.perc.cycle) || 16), bus.music, shift, roleG(id, 'perc')); break;
        case 'fill': fill(t0, kit, s, bus.music, roleG(id, 'snare')); break;
        case 'ost': tone({ t: t0, type: 'triangle', f: mtof(ROOT - 12 + bassNote(id, 0, bar)), a: 0.003, dur: 0.11, g: 0.14 * roleG(id, 'bass'), dest: bus.low }); break;
        case 'rub': rubVoice(id, swung, shift, false); break;
        case 'resolve': rubVoice(id, t0, shift, true); break;
        case 'lift': lift(t0); break;
        case 'nerve': nerve(t0, shift); break;
      }
    }
  }

  // First-person drone follows the bar root with a short glide.
  function droneTo(t, shift) {
    if (!bus || look !== 'pov') return;
    const f = mtof(ROOT + shift);
    for (const o of bus.droneOscs) o.frequency.setTargetAtTime(f, t, 0.06);
  }

  // Continuous dials: pace → tempo and level; danger envelope and state; anticipation;
  // respawn wait → muffled; music level.
  function setDial(key, param, value, now, tc) {
    const prev = dialTargets[key];
    if (prev != null && Math.abs(prev - value) <= Math.abs(value) * 0.01 + 1e-4) return;
    dialTargets[key] = value;
    param.setTargetAtTime(value, now, tc);
  }
  function applyPace(snap = false, dt = 0) {
    paceS = snap ? paceT : paceT + (paceS - paceT) * Math.exp(-dt / PACE_TAU);
    level = levelOf(paceS);
    const bpm = tempoOf(paceS);
    if (Math.abs(bpm - beat.bpm) >= 0.25 || (snap && bpm !== beat.bpm)) {
      beat.setBpm(bpm);
      if (bus) bus.delay.delayTime.setTargetAtTime(beat.period * 0.75, ctx.currentTime, 0.05);
    }
  }
  function dials(now) {
    const dt = lastDial == null ? 0 : Math.min(0.5, Math.max(0, now - lastDial));
    lastDial = now;
    if (rhythm) applyPace(false, dt);
    const raw = dangerRaw * (calm() ? DANGER.reducedDepth : 1);
    dangerS = smoothDanger(dangerS, rhythm && !waiting ? raw : 0, dt);
    const st = dangerState(dangerSt, dangerS);
    if (dangerSt >= 2 && st < 2) resolvePending = true;
    dangerSt = st;
    antic = rhythm && !waiting && beat.running ? anticipationAt(beatPos() - lastBiteBeat, timeline) : 0;
    if (!bus || now < dialsHold) return;
    setDial('lp', bus.lpf.frequency, waiting ? WAIT_LP : OPEN_LP, now, 0.08);
    setDial('wetLp', bus.wetLp.frequency, waiting ? WAIT_LP * 2 : OPEN_LP, now, 0.08);
    setDial('wait', bus.wait.gain, waiting ? WAIT_GAIN : 1, now, 0.1);
    setDial('music', bus.music.gain, musicGainOf(paceS) * Math.pow(10, ((TRIM_DB[timeline] || 0) + DANGER.levelDb * dangerS) / 20), now, 0.12);
  }

  function tick() {
    if (!ctx || !bus || (!offline && ctx.state !== 'running')) return;
    const now = ctx.currentTime;
    dials(now);
    if (!rhythm || !beat.running) return;
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

  // ---- one-shot events -----------------------------------------------------

  function impact(t, ip) {
    if (ip.sub > 0) tone({ t, type: 'sine', f: ip.heavy ? 96 : 110, f2: 32, glide: 0.35, a: ip.soft ? 0.025 : 0.002, dur: 0.42, g: ip.sub, drive: ip.heavy });
    if (ip.crash > 0) noise({ t, a: 0.001, dur: 1, g: ip.crash, hp: 4500, pan: rand(-0.2, 0.2), send: 'reverb', sendAmt: 0.3 });
    if (ip.heavy) noise({ t, a: 0.001, dur: 0.07, g: 0.26, hp: 2000, drive: true });
    if (ip.soft && ip.sub > 0) noise({ t, a: 0.12, dur: 0.6, g: 0.045, lp: 700, send: 'reverb', sendAmt: 0.8 });
  }

  function whoosh(t, soft) {
    noise({ t, a: soft ? 0.3 : 0.2, dur: 0.2, g: soft ? 0.035 : 0.07, bp: 280, f2f: 4200, fdur: 0.45, q: 1.4, pan: rand(-0.3, 0.3), send: 'reverb', sendAmt: 0.4 });
  }

  function applyLook(next, t, arriving, soft = false) {
    const lp = lookPlan(next);
    const changed = lp.look !== look;
    look = lp.look;
    if (!bus) return;
    bus.widen.gain.setTargetAtTime(lp.send, t, 0.2);
    bus.droneGain.gain.setTargetAtTime(rhythm ? lp.drone : 0, t, 0.4);
    if (lp.whoosh && (arriving || changed) && live()) whoosh(t, soft || timeline === 'abyss');
  }

  // Tape stop: bend everything sounding down two octaves.
  function tapeBend(t, dur) {
    const bendSrc = (s) => {
      if (s.detune) {
        s.detune.cancelScheduledValues(t);
        s.detune.setValueAtTime(s._det || 0, t);
        s.detune.linearRampToValueAtTime((s._det || 0) - 2400, t + dur);
      } else if (s.playbackRate) {
        s.playbackRate.cancelScheduledValues(t);
        s.playbackRate.setValueAtTime(1, t);
        s.playbackRate.linearRampToValueAtTime(0.15, t + dur);
      }
    };
    for (const v of voices) if (v.music && !v.cancelled && !v.done && v.t <= t && v.end > t) v.srcs.forEach(bendSrc);
    bus.droneOscs.forEach(bendSrc);
  }

  function setGame(o) {
    for (const k of ['stepMs', 'startMs', 'capMs', 'score', 'length']) {
      const x = o[k];
      if (x != null && x !== '' && Number.isFinite(Number(x))) game[k] = Math.max(0, Number(x));
    }
    paceT = paceOf(game);
    if (!rhythm || !bus) applyPace(true);
  }

  // Event dips on the tonal bus only (never the pump: its automation belongs to the kicks).
  function dipTonal(t, to, hold, back = 0.03) {
    const g = bus.dip.gain;
    anchor(g, t);
    g.linearRampToValueAtTime(to, t + 0.008);
    g.setValueAtTime(to, t + hold);
    g.linearRampToValueAtTime(1, t + hold + back);
  }

  function wetTo(t, v, time) {
    const g = bus.wet.gain;
    anchor(g, t);
    g.linearRampToValueAtTime(v, t + time);
  }

  // New kit from the next grid step: nothing old left in the queue, long tails released.
  function swapKit(t, within) {
    cancelQueued(t);
    releaseTails(t, within);
    rewind(t);
  }

  // The answer: the head of the motif in the new world's voice from the next useful eighth.
  function answer(id, from, weight = 1) {
    if (!beat.running || id === 'lcd') return;
    const pos = beat.position(from) * 4;
    let e0 = Math.ceil(pos / 2) * 2;
    if (e0 - pos < 0.25) e0 += 2;
    const p = id === 'wrong' ? borrowed(e0) : arrangement(id, level, { reduced: calm() });
    if (p.halfTime || p.world.clicks) return;
    for (let k = 0; k < 3; k++) {
      const st = e0 + MOTIF.steps[k];
      gesture(p.id, beat.timeAt(st / 4), k, Math.floor(st / 16), { gm: 0.9 * weight, open: OPEN[p.level] || 1 });
    }
    answerUntil = e0 + 7;
    stats.answers++;
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
        tone({ t: t + i * 0.045, type: 'sine', f: ff, f2: ff * 1.5, a: 0.003, dur: 0.16, g: 0.18, vib: 0.06, vibRate: 9 + i * 3, pan: i % 2 ? 0.5 : -0.5, send: 'echo', sendAmt: 0.45 });
      });
      tone({ t, type: 'sawtooth', f: f / 2, a: 0.003, dur: 0.2, g: 0.11, lp: 3500, f2f: 300, q: 14 });
    },
    disco(t, f) {
      tone({ t, type: 'sawtooth', f: f / 2, a: 0.003, dur: 0.12, g: 0.22, lp: 2400, f2f: 500, q: 5 });
      tone({ t: t + 0.07, type: 'sawtooth', f, a: 0.003, dur: 0.14, g: 0.2, lp: 2800, f2f: 600, q: 5 });
      for (let i = 0; i < 3; i++) noise({ t: t + i * 0.011, a: 0.001, dur: i === 2 ? 0.12 : 0.01, g: 0.2, bp: 1500, q: 2, send: 'reverb', sendAmt: 0.3 });
    },
    arcade(t, f) {
      tone({ t, type: 'square', f, a: 0.002, dur: 0.06, g: 0.13 });
      tone({ t: t + 0.06, type: 'square', f: f * 2, f2: f * 2.02, a: 0.002, dur: 0.12, g: 0.12 });
    },
    kombat(t, f) {
      tone({ t, type: 'square', f: f * 1.5, f2: f, glide: 0.04, a: 0.001, dur: 0.16, g: 0.14, crush: true });
      noise({ t, a: 0.001, dur: 0.09, g: 0.32, bp: 1200, q: 1, crush: true });
      tone({ t, type: 'sine', f: 150, f2: 60, a: 0.001, dur: 0.16, g: 0.45, crush: true });
    },
    plastic(t, f) {
      chime(t, f, 0.2, undefined, 'reverb');
      tone({ t: t + 0.05, type: 'triangle', f: f * 4, a: 0.001, dur: 0.25, g: 0.05, send: 'echo', sendAmt: 0.5 });
    },
    bunker(t, f) {
      tone({ t, type: 'sine', f: 170, f2: 48, glide: 0.16, a: 0.002, dur: 0.3, g: 0.6, drive: true });
      metal(t, f, 0.18, 0.32, undefined, rand(-0.3, 0.3));
      noise({ t, a: 0.001, dur: 0.05, g: 0.26, hp: 2500, drive: true });
    },
    court(t, f) {
      tone({ t, type: 'triangle', f, a: 0.006, dur: 0.7, g: 0.2, send: 'reverb', sendAmt: 0.7 });
      tone({ t, type: 'sine', f: f * 2, a: 0.006, dur: 0.9, g: 0.1, send: 'reverb', sendAmt: 0.7 });
      noise({ t, a: 0.02, dur: 0.5, g: 0.1, bp: f * 2, q: 18, send: 'reverb', sendAmt: 0.8 });
    },
    timewarp(t, f) {
      tone({ t, type: 'sawtooth', f: f / 2, f2: f * 2, glide: 0.25, a: 0.004, dur: 0.3, g: 0.12, lp: 800, f2f: 7000, pan: -0.5 });
      tone({ t, type: 'sawtooth', f: f * 2, f2: f / 2, glide: 0.25, a: 0.004, dur: 0.3, g: 0.1, lp: 7000, f2f: 600, pan: 0.5, detune: 30 });
      tone({ t, type: 'sine', f, a: 0.004, dur: 0.35, g: 0.12, vib: 0.12, vibRate: 5, send: 'echo', sendAmt: 0.45 });
    },
    desktop(t, f) {
      tone({ t, type: 'square', f, a: 0.002, dur: 0.08, g: 0.1, lp: 3000 });
      tone({ t: t + 0.1, type: 'sine', f: f * 1.5, a: 0.002, dur: 0.18, g: 0.16 });
    },
    lane(t, f) {
      // Acid squelch, a tabla 'na', a wobbling high note.
      tone({ t, type: 'sawtooth', f: f / 2, f2: (f / 2) * 1.06, glide: 0.1, a: 0.002, dur: 0.2, g: 0.13, lp: 4200, f2f: 280, q: 16, send: 'echo', sendAmt: 0.4 });
      tone({ t, type: 'sine', f: 560, f2: 590, glide: 0.04, a: 0.001, dur: 0.24, g: 0.12 });
      tone({ t: t + 0.05, type: 'sine', f: f * 2, a: 0.002, dur: 0.14, g: 0.07, vib: 0.05, vibRate: 11, pan: 0.4 });
    },
    hangar(t, f) {
      // Anvil strike over a low brass blat.
      for (const [r, gm, d] of [[1, 1, 0.6], [2.76, 0.55, 0.42], [5.4, 0.3, 0.26], [8.93, 0.16, 0.14]]) tone({ t, type: 'sine', f: f * 2 * r, a: 0.001, dur: d, g: 0.15 * gm, send: 'reverb', sendAmt: 0.3 });
      noise({ t, a: 0.001, dur: 0.025, g: 0.22, hp: 3500 });
      tone({ t, type: 'sawtooth', f: f / 4, a: 0.01, dur: 0.3, g: 0.13, lp: 700, f2f: 300 });
    },
    mushroom(t, f) {
      // Four-note chip arpeggio up the chord.
      [0, 4, 7, 12].forEach((st, i) => tone({ t: t + i * 0.03, type: 'square', f: f * Math.pow(2, st / 12), a: 0.001, dur: i === 3 ? 0.13 : 0.03, g: 0.09, lp: 7000 }));
    },
    castle(t, f) {
      // Music box note with a celesta shimmer.
      chime(t, f, 0.15, undefined, 'reverb');
      tone({ t, type: 'sine', f: f / 2, a: 0.002, dur: 0.9, g: 0.1, send: 'reverb', sendAmt: 0.5 });
      tone({ t: t + 0.12, type: 'triangle', f: f * 1.5, a: 0.001, dur: 0.5, g: 0.035, send: 'echo', sendAmt: 0.45 });
    },
    abyss(t, f) {
      // Slow pluck in a cathedral, one bubble.
      tone({ t, type: 'triangle', f, a: 0.012, dur: 1.1, g: 0.16, lp: 2600, send: 'reverb', sendAmt: 0.8 });
      tone({ t: t + 0.02, type: 'sine', f: f * 2, f2: f * 4, glide: 0.14, a: 0.004, dur: 0.16, g: 0.05, send: 'reverb', sendAmt: 0.7 });
    },
  };
  const BITE_IDS = Object.keys(BITE);

  // A bite voice through its own gain: lighter for rapid bites, short tails, under a life figure.
  function playBite(id, t, midi, { weight = 1, short = false } = {}) {
    if (mute && mute.has('bite')) return;
    const g = gainNode(weight, bus.sfx);
    if (short) {
      g.gain.setValueAtTime(weight, t + 0.16);
      g.gain.setTargetAtTime(0, t + 0.16, 0.04);
    }
    sfxDest = g;
    sendScale = short ? 0.4 : 1;
    try {
      if (id === 'wrong') {
        // Wrong Universe: one or two voices from other eras, slightly out of tune.
        const n = calm() ? 1 : 1 + (rng() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const k = pick(BITE_IDS);
          BITE[k](t + i * 0.03, mtof(midi + rand(-0.4, 0.4)) * (k === 'lcd' ? 2 : 1));
        }
      } else (BITE[id] || BITE.arcade)(t, mtof(midi));
    } finally {
      sfxDest = bus.sfx;
      sendScale = 1;
    }
  }

  function barNow(id) {
    return Math.floor(beatPos() / (arrangement(id).halfTime ? 8 : 4));
  }

  // ---- public API -----------------------------------------------------------

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
          beat.setTimeSource(() => ctx.currentTime); // a passed-in context drives the beat (harness, offline renders)
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
    }),

    setMuted: safe(function (m) {
      muted = !!m;
      if (!bus) return;
      const g = bus.master.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(muted ? 0 : MASTER, t + 0.03);
    }),

    /**
     * Gameplay state, partial objects allowed: { stepMs, startMs, capMs, score, length, pressure, clear }.
     * pressure is the raw 0..1 estimate (smoothed here); clear drops danger to zero at once.
     */
    setGameplay: safe(function (o) {
      if (!o || typeof o !== 'object') return;
      setGame(o);
      if (o.pressure != null && Number.isFinite(Number(o.pressure))) dangerRaw = clamp01(Number(o.pressure));
      if (o.clear) {
        dangerRaw = 0;
        dangerS = 0;
        dangerSt = 0;
        resolvePending = false;
      }
    }),

    /** One food event: { score, kind, from, to, look, prevLook, held, reset, swing, lifeGained }. */
    bite: safe(function (o) {
      const e = o && typeof o === 'object' ? o : {};
      const to = universeId(e.to ?? e.from ?? timeline);
      const bp = beatPos();
      const cls = classifyBite({ ...e, from: e.from ?? timeline, to }, { beat: bp, lastBite: lastBiteBeat, lastMajor: lastMajorBeat, reduced: calm(), level, rapidCount });
      rapidCount = cls.rapid ? rapidCount + 1 : 0;
      lastBiteBeat = bp;
      if (cls.kind === 'major') lastMajorBeat = bp;
      stats.bites++;
      if (cls.kind === 'major') stats.majors++;
      timeline = to;
      const score = Number.isFinite(Number(e.score)) ? Number(e.score) : game.score;
      lastBite = { kind: cls.kind, rapid: cls.rapid, weight: +cls.weight.toFixed(2), from: cls.from, to, beat: +bp.toFixed(3) };
      stats.lastEvent = 'bite';
      if (!live()) {
        applyLook(e.look ?? look, 0, false);
        record({ t: 0, bite: cls.kind, from: cls.from, to, silent: true });
        return;
      }
      const now = ctx.currentTime + 0.004;
      lastBite.at = +now.toFixed(4);
      record({ t: +now.toFixed(4), bite: cls.kind, from: cls.from, to, rapid: cls.rapid, beat: +bp.toFixed(3) });
      const midi = biteMidi(to, score, barNow(to));
      playBite(to, now, midi, { weight: cls.weight * (e.lifeGained ? 0.7 : 1), short: cls.rapid || !!e.lifeGained });
      if (wetCut && cls.kind !== 'lcd') {
        wetTo(now, 1, 0.03);
        wetCut = false;
      }
      const lookArrive = e.look !== e.prevLook;
      switch (cls.kind) {
        case 'held':
          // A tiny release: the tonal bus dips under the bite, the groove carries on untouched.
          dipTonal(now, 0.72, 0.035, 0.025);
          applyLook(e.look ?? look, now, lookArrive, true);
          break;
        case 'change':
          swapKit(now, 0.07);
          if (cls.thump) tone({ t: now, type: 'sine', f: 140, f2: 55, glide: 0.08, a: 0.002, dur: 0.11, g: 0.26 });
          if (cls.answer) answer(to, now);
          applyLook(e.look ?? look, now, true);
          break;
        case 'major': {
          // The vacuum: a sixteenth of silence (a chopped stutter from level 3), then the impact.
          swapKit(now, 0.05);
          const stutter = cls.gap === 'stutter';
          const gapSec = ((stutter ? 0.75 : 1) * beat.period) / 4;
          const end = now + gapSec;
          gap = { start: now, end, chops: stutter ? 2 : 0 };
          stats.gaps++;
          const g = bus.duck.gain;
          anchor(g, now);
          if (!stutter) {
            g.linearRampToValueAtTime(0.03, now + 0.005);
            g.setValueAtTime(0.03, Math.max(now + 0.006, end - 0.004));
          } else {
            const n = 4;
            const sl = gapSec / n;
            let prev = Number(g.value) || 1;
            for (let i = 0; i < n; i++) {
              const val = i % 2 ? 0.85 : 0.25;
              g.setValueAtTime(prev, now + i * sl);
              g.linearRampToValueAtTime(val, now + i * sl + Math.min(0.003, sl / 2));
              prev = val;
            }
          }
          g.linearRampToValueAtTime(1, end + 0.004);
          if (e.swing) tone({ t: now, type: 'sawtooth', f: 2400, f2: 70, glide: gapSec + 0.25, a: 0.002, dur: gapSec + 0.28, g: 0.06, lp: 3000, f2f: 200, crush: true });
          impact(end, { sub: 0.55, crash: 0.13, heavy: !!e.swing, soft: false });
          answer(to, end);
          applyLook(e.look ?? look, now, true);
          break;
        }
        case 'lcd': {
          // Hard stop: music and the wet returns cut within 40 ms; clicks carry on at the same bar position.
          cancelQueued(now);
          releaseTails(now, 0.03, 0);
          rewind(now);
          const tNext = Math.max(now + 0.045, beat.timeAt((nextStep ?? 0) / 4) - 0.003);
          const g = bus.duck.gain;
          anchor(g, now);
          g.linearRampToValueAtTime(0, now + 0.03);
          g.setValueAtTime(0, tNext);
          g.linearRampToValueAtTime(1, tNext + 0.002);
          wetTo(now, 0, 0.04);
          wetCut = true;
          applyLook(e.look ?? look, now, false);
          break;
        }
        case 'abyss':
          // Soft bloom: earlier tails may ring into it; half-time from the next grid step; no crash.
          cancelQueued(now);
          rewind(now);
          impact(now + 0.02, { sub: 0.35, crash: 0, heavy: false, soft: true });
          applyLook(e.look ?? look, now, true, true);
          break;
      }
      if (rhythm) tick();
    }),

    /** A universe change without a bite (debug lock): kit swap on the next grid step, no bite voice, no impact. */
    shift: safe(function (o) {
      const { from, to, look: nextLook } = o || {};
      timeline = universeId(to ?? from ?? timeline);
      if (!live()) {
        applyLook(nextLook ?? look, 0, false);
        return;
      }
      const now = ctx.currentTime + 0.003;
      swapKit(now, 0.07);
      if (wetCut && timeline !== 'lcd') {
        wetTo(now, 1, 0.03);
        wetCut = false;
      }
      applyLook(nextLook ?? look, now, false);
      stats.lastEvent = 'shift';
      if (rhythm) tick();
    }),

    // Look change without a bite (e.g. the first-person fallback to 3D).
    setLook: safe(function (l) {
      applyLook(l, ctx ? ctx.currentTime : 0, false);
    }),

    setLives: safe(function (n) {
      const v = Math.floor(Number(n));
      if (!Number.isFinite(v)) return;
      lives = Math.min(5, Math.max(0, v));
    }),

    // Tape stop, then muffled, quiet and reduced to pulse and anchor until respawned().
    lifeLost: safe(function () {
      waiting = true;
      dangerRaw = 0;
      dangerS = 0;
      dangerSt = 0;
      stats.lastEvent = 'lifeLost';
      if (!live()) return;
      const now = ctx.currentTime + 0.003;
      tapeBend(now, TAPE);
      cancelQueued(now);
      rewind(now);
      tapeUntil = now + TAPE;
      dialTargets = {};
      dialsHold = now + TAPE;
      const f = bus.lpf.frequency;
      const cur = Math.max(60, anchor(f, now) || OPEN_LP);
      f.setValueAtTime(cur, now + TAPE * 0.3);
      f.exponentialRampToValueAtTime(WAIT_LP, now + TAPE);
      const wf = bus.wetLp.frequency;
      const wcur = Math.max(60, anchor(wf, now) || OPEN_LP);
      wf.setValueAtTime(wcur, now + TAPE * 0.3);
      wf.exponentialRampToValueAtTime(WAIT_LP * 2, now + TAPE);
      const w = bus.wait.gain;
      anchor(w, now);
      w.linearRampToValueAtTime(WAIT_GAIN, now + TAPE);
      const root = mtof(ROOT + barRoot(Math.floor(beat.position(now) / 4), 'parallel'));
      tone({ t: now, type: 'sawtooth', f: root * 2, f2: root / 4, glide: TAPE, a: 0.003, dur: TAPE, g: 0.15, lp: 3000, f2f: 150, q: 2 });
      tone({ t: now, type: 'sine', f: root, f2: root / 8, glide: TAPE, a: 0.003, dur: TAPE + 0.1, g: 0.32 });
      noise({ t: now, a: 0.002, dur: 0.25, g: 0.11, lp: 4000, f2f: 200 });
    }),

    // First move after a respawn: snap back to full, decisively, with an accented kick next.
    respawned: safe(function () {
      const was = waiting;
      waiting = false;
      tapeUntil = -1;
      stats.lastEvent = 'respawned';
      lastBiteBeat = beatPos();
      if (was) accentNext = true;
      if (!live()) return;
      const now = ctx.currentTime + 0.003;
      for (const p of [bus.lpf.frequency, bus.wetLp.frequency]) {
        const cur = Math.max(60, anchor(p, now) || OPEN_LP);
        p.exponentialRampToValueAtTime(Math.max(cur, OPEN_LP), now + 0.05);
      }
      const w = bus.wait.gain;
      anchor(w, now);
      w.linearRampToValueAtTime(1, now + 0.04);
      for (const o of bus.droneOscs) {
        anchor(o.detune, now);
        o.detune.linearRampToValueAtTime(o._det || 0, now + 0.05);
      }
      dialTargets = {};
      dialsHold = now + 0.06;
      if (was) {
        noise({ t: now, a: 0.04, dur: 0.02, g: 0.09, bp: 700, f2f: 9000, fdur: 0.06, q: 1.2 });
        tone({ t: now + 0.05, type: 'sine', f: 150, f2: 45, glide: 0.12, a: 0.002, dur: 0.2, g: 0.5 });
      }
      cancelQueued(now);
      rewind(now);
      if (rhythm) tick();
    }),

    // Original rising figure (LIFE_FIGURE), bright and short; the tonal bus dips about 4 dB under it.
    lifeGained: safe(function () {
      stats.lastEvent = 'lifeGained';
      if (!live()) return;
      const t = ctx.currentTime + 0.004;
      dipTonal(t, 0.63, 0.45, 0.15);
      const fig = lifeFigure();
      fig.forEach((n, i) => {
        const f = mtof(ROOT + 24 + n.semi);
        const last = i === fig.length - 1;
        tone({ t: t + n.at, type: 'square', f, a: 0.002, dur: n.dur, g: 0.06, lp: 5000, vib: last ? 0.012 : 0, vibRate: 7 });
        tone({ t: t + n.at, type: 'triangle', f: f * 2, a: 0.002, dur: n.dur * 1.4, g: 0.04, send: 'echo', sendAmt: 0.35 });
      });
    }),

    // ---- kept for old callers and tests: callable and harmless ----
    setTimeline: safe(function (id) {
      timeline = universeId(id);
    }),
    setChaos: safe(function (x) {
      chaos = clamp01(Number(x));
    }),
    setScore: safe(function (sc) {
      if (sc != null && Number.isFinite(Number(sc))) setGame({ score: Math.floor(Number(sc)) });
    }),
    // A bite voice of the current universe, no transition.
    eat: safe(function (sc) {
      if (sc != null && Number.isFinite(Number(sc))) setGame({ score: Math.floor(Number(sc)) });
      lastBiteBeat = beatPos();
      if (!live()) return;
      playBite(timeline, ctx.currentTime + 0.004, biteMidi(timeline, game.score, barNow(timeline)));
    }),
    cut: safe(function () {}),

    die: safe(function () {
      api.stop();
      waiting = false;
      tapeUntil = -1;
      if (!live()) return;
      const t = ctx.currentTime + 0.005;
      tone({ t, type: 'sawtooth', f: 520, f2: 38, glide: 1.1, a: 0.004, dur: 1.2, g: 0.28, lp: 5000, f2f: 180, q: 4, pan: -0.3 });
      tone({ t, type: 'sawtooth', f: 526, f2: 36, glide: 1.15, a: 0.004, dur: 1.2, g: 0.22, lp: 4000, f2f: 150, detune: 18, pan: 0.3 });
      noise({ t, a: 0.002, dur: 0.7, g: 0.26, lp: 6000, f2f: 200, send: 'reverb', sendAmt: 0.4 });
      tone({ t, type: 'sine', f: 90, f2: 30, glide: 0.6, a: 0.002, dur: 0.8, g: 0.6, drive: true });
    }),

    start: safe(function () {
      const fresh = !beat.running;
      applyPace(true);
      if (fresh) {
        // The beat restarts at 0: positions kept from the last run would mean nothing.
        beat.start();
        answerUntil = -1;
        lastMajorBeat = -Infinity;
        rapidCount = 0;
        lastBass = { step: -9, f: 0 };
        wrongBar = { key: -1, id: wrongBar.id };
        glideBar = { bar: -1, ratio: glideBar.ratio };
      }
      rhythm = true;
      nextStep = null;
      lastBiteBeat = beatPos();
      lastDial = null;
      if (bus) {
        const now = ctx.currentTime;
        for (const g of [bus.fade.gain, bus.wet.gain]) {
          g.cancelScheduledValues(now);
          g.setValueAtTime(1, now);
        }
        wetCut = false;
        if (!waiting) {
          for (const p of [bus.lpf.frequency, bus.wetLp.frequency, bus.wait.gain]) p.cancelScheduledValues(now);
          bus.lpf.frequency.setValueAtTime(OPEN_LP, now);
          bus.wetLp.frequency.setValueAtTime(OPEN_LP, now);
          bus.wait.gain.setValueAtTime(1, now);
        }
        dialTargets = {};
        bus.droneGain.gain.setTargetAtTime(lookPlan(look).drone, now, 0.4);
        // 'interrupted' is iOS after a call or an app switch; it needs the same resume as 'suspended'.
        if (!offline && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
      }
      if (!timer && !offline && typeof setInterval === 'function') timer = setInterval(api._tick, TICK_MS);
      tick();
    }),

    stop: safe(function () {
      rhythm = false;
      nextStep = null;
      antic = 0;
      dangerS = 0;
      dangerSt = 0;
      resolvePending = false;
      if (timer) clearInterval(timer);
      timer = null;
      beat.stop();
      if (bus) {
        const t = ctx.currentTime;
        const g = bus.fade.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.setTargetAtTime(0, t, 0.05); // silence what the lookahead already queued
        const w = bus.wet.gain;
        w.cancelScheduledValues(t);
        w.setValueAtTime(w.value, t);
        w.setTargetAtTime(0, t, 0.13); // tails fade in about 0.4 s
        bus.droneGain.gain.setTargetAtTime(0, t, 0.1);
        dialTargets = {};
      }
    }),

    // Diagnostics for the harness; never needed by the game.
    debug() {
      const p = plan();
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
        score: game.score,
        stepMs: game.stepMs,
        pace: +paceS.toFixed(3),
        paceTarget: +paceT.toFixed(3),
        level: p.level,
        bpm: +beat.bpm.toFixed(2),
        layers: p.roles.join(' '),
        layerCount: p.roles.length,
        halfTime: p.halfTime,
        danger: +dangerS.toFixed(3),
        dangerRaw: +dangerRaw.toFixed(3),
        dangerState: dangerSt,
        antic: +antic.toFixed(3),
        reduced: calm(),
        lives,
        waiting,
        look,
        lastBite,
        active: ctx ? concurrent(ctx.currentTime) : 0,
        ...stats,
      };
    },
  };
  api._tick = safe(tick);
  // Harness hooks (offline renders, tests): play one rhythm step at context time t; run the dials
  // as if the clock read t; read the current plan.
  api._step = safe((step, t) => {
    if (live()) playStep(step, t);
  });
  api._dials = safe((t) => dials(t));
  api._plan = () => plan();
  const unlockInner = api.unlock;
  api.unlock = () => {
    const r = unlockInner();
    return r && typeof r.then === 'function' ? r : Promise.resolve(false);
  };
  return api;
}
