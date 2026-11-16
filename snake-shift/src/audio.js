// SNAKE//SHIFT — procedural sound (BUILD_PLAN 7, 15.3; LEVELS_PLAN 7). Web Audio only, no files.
//
// createAudio(getPrefs, { context }?)
// → { unlock(), setMuted(bool), setTimeline(id), setChaos(x), eat(score),
//     cut({ swing }), die(), start(), stop(), beat, muted, debug(),
//     setScore(score), shift({ from, to, look, swing }), setLook(look),
//     setLives(n), lifeLost(), lifeGained(), respawned() }
//
// - Every method is safe before unlock(), when muted, and without Web Audio.
// - Sound never drives game state: nothing here reads or writes the simulation.
// - `beat` is a createBeat() instance. It runs on the frame clock until unlock(),
//   then follows the audio output clock (latency-corrected), so the kick and the
//   visual pulse line up. Do not call beat.setTimeSource() from outside. Its tempo
//   follows the stage (beat.setBpm, phase-continuous).
// - One continuous track (LEVELS_PLAN 7): the stage (score) sets layers and tempo,
//   the universe sets the kit, hunger (time since the last bite) builds a riser,
//   every shift() is a drop. The bar position carries across every change.
// - The scheduling decisions are the pure functions exported below; the engine
//   only turns their answers into sound.
// - getPrefs() may return { reducedFlash, reducedMotion, muted }; either reduced
//   switch drops the rolls/stabs/wild layers and lightens the heavy drop.
// - The optional second argument lets a harness pass an (Offline)AudioContext.

import { createBeat } from './beat.js';

export const TIMELINE_IDS = ['lcd', 'acid', 'disco', 'arcade', 'kombat', 'plastic', 'bunker', 'court', 'timewarp', 'wrong', 'desktop', 'lane', 'hangar', 'mushroom', 'castle', 'abyss'];
export const UNIVERSE_IDS = TIMELINE_IDS;
export const NEW_IDS = ['lane', 'hangar', 'mushroom', 'castle', 'abyss'];

const MASTER = 0.8;
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;
const ROOT = 45; // A2
const PROG = [0, 0, -4, -2]; // bar roots: A A F G
const MAX_ACTIVE = 320; // safety valve for runaway layering
const OPEN_LP = 18000; // music low-pass, open
const WAIT_LP = 420; // muffled while waiting to respawn
const WAIT_GAIN = 0.38; // and quiet
const TAPE = 0.6; // tape-stop length, seconds
const LAST_LIFE_DETUNE = -12; // cents, music only

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ==== pure music plan (LEVELS_PLAN 7) — unit-tested in tests/music.test.js ====

export const STAGE_MAX = 10;
// Cumulative layer order; stage n plays the first n + 2 (7.2).
export const LAYER_ORDER = ['kick', 'sub', 'hat', 'bass', 'snare', 'hats16', 'lead', 'perc2', 'fills', 'pump', 'rolls', 'wild'];
export const HUNGER = { delay: 1, full: 6 }; // seconds without a bite: riser starts, riser full
export const ABYSS_CAP = 4; // abyss plays at most the layers of stage 4
export const LOOKS = ['2d', '3d', 'pov'];
const PERC_STEPS = [3, 7, 10, 14];

function clampStage(s) {
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? Math.min(STAGE_MAX, Math.max(0, n)) : 0;
}

/** Normalise a universe id: '-pov'/'-3d'/'-2d' suffix stripped, unknown → 'arcade'. */
export function universeId(id) {
  const s = String(id ?? '').replace(/-(pov|3d|2d)$/, '');
  return TIMELINE_IDS.includes(s) ? s : 'arcade';
}

/** Stage 0..10 = min(10, floor(score / 5)). */
export function stageOf(score) {
  const n = Math.floor(Number(score));
  return Number.isFinite(n) && n > 0 ? Math.min(STAGE_MAX, Math.floor(n / 5)) : 0;
}

/** Tempo of a stage: 112 at stage 0, +4 per stage, 152 at stage 10. */
export function stageBpm(stage) {
  return 112 + 4 * clampStage(stage);
}

/** Music bus level: rises 6 dB from stage 0 to stage 10. */
export function musicGain(stage) {
  return 0.4 * Math.pow(10, (0.6 * clampStage(stage)) / 20);
}

/**
 * What plays for a stage in a universe.
 * lcd: clicks and silence at every stage. abyss: half-time, soft, capped at stage 4.
 * reduced (Reduced flash / motion): no rolls, stabs or wild layer.
 */
export function musicPlan(stage, id, { reduced = false } = {}) {
  const u = universeId(id);
  const st = clampStage(stage);
  if (u === 'lcd') return { id: u, stage: st, layers: ['clicks'], halfTime: false, soft: true, calm: true };
  const abyss = u === 'abyss';
  let layers = LAYER_ORDER.slice(0, (abyss ? Math.min(st, ABYSS_CAP) : st) + 2);
  if (reduced) layers = layers.filter((l) => l !== 'rolls' && l !== 'wild');
  return { id: u, stage: st, layers, halfTime: abyss, soft: abyss, calm: abyss };
}

/** Hunger 0..1 from seconds since the last bite: 0 for the first second, 1 at six. */
export function hungerAt(sec) {
  const x = Number(sec);
  if (!(x > HUNGER.delay)) return 0;
  return Math.min(1, (x - HUNGER.delay) / (HUNGER.full - HUNGER.delay));
}

/** Riser while hungry: noise swell, band rising, master low-pass closing a little, hats tighter. */
export function riserPlan(hunger, id) {
  const u = universeId(id);
  const amt = u === 'lcd' ? 0 : u === 'abyss' ? 0.5 : 1;
  const e = clamp01(Number(hunger)) * amt;
  return {
    gain: 0.16 * e * e,
    freq: 350 * Math.pow(20, e), // 350 Hz → 7 kHz
    lp: OPEN_LP * Math.pow(3200 / OPEN_LP, e), // 18 kHz → 3.2 kHz
    hatDecay: 1 - 0.55 * e,
  };
}

/**
 * The gap before the impact, in sixteenth notes. A full sixteenth up to stage 7;
 * from stage 8 it shrinks to a stutter (chopped, not silent), and shrinks again
 * when bites come faster than a bar (sinceBeats < 4).
 */
export function dropPlan(stage, sinceBeats = Infinity) {
  const st = clampStage(stage);
  let gap = st < 8 ? 1 : st === 8 ? 0.75 : st === 9 ? 0.5 : 0.375;
  const stutter = st >= 8;
  const since = Number(sinceBeats);
  if (stutter && since >= 0 && since < 4) gap /= 2;
  return { gap, stutter, floor: stutter ? 0.3 : 0.03, chops: stutter ? 2 : 0 };
}

/** The impact after the gap. Calm universes get no crash (lcd: nothing at all). */
export function impactPlan(id, stage, { swing = false, reduced = false } = {}) {
  const u = universeId(id);
  const st = clampStage(stage);
  if (u === 'lcd') return { sub: 0, crash: 0, heavy: false, soft: true };
  if (u === 'abyss') return { sub: 0.45, crash: 0, heavy: false, soft: true };
  const heavy = !!swing && !reduced;
  return {
    sub: heavy ? 0.95 : Math.min(0.85, 0.62 + 0.02 * st),
    crash: heavy ? 0.4 : 0.2 + 0.01 * st,
    heavy,
    soft: false,
  };
}

/** Sidechain pump depth on each kick: gentle, stronger from the 'pump' layer (stage 8). */
export function pumpDepth(plan) {
  const l = (plan && plan.layers) || [];
  return l.includes('pump') ? 0.55 : l.includes('kick') ? 0.12 : 0;
}

/** Tonal filter multiplier: filters fully open from the 'pump' layer (stage 8). */
export function filterScale(plan) {
  return plan && plan.layers && plan.layers.includes('pump') ? 2.5 : 1;
}

/** Look on arrival: 3D and first person get a whoosh and a wider delay send; first person a drone. */
export function lookPlan(look) {
  const l = LOOKS.includes(look) ? look : '2d';
  return { look: l, send: l === 'pov' ? 0.24 : l === '3d' ? 0.14 : 0, drone: l === 'pov' ? 0.07 : 0, whoosh: l !== '2d' };
}

// Life gained: an original rising maj9 figure (no borrowed jingle).
export const LIFE_FIGURE = [0, 4, 7, 11, 14, 19];
export function lifeFigure(step = 0.055) {
  const n = LIFE_FIGURE.length;
  return LIFE_FIGURE.map((semi, i) => ({ at: i * step, semi, dur: i === n - 1 ? 0.32 : step * 1.4 }));
}

/**
 * Hits on one sixteenth step (global index) for a plan.
 * o: { bassPat, percSteps, percCycle, heart, rnd }.
 * Half-time plans play only even steps, on a virtual grid of half the speed.
 * The heartbeat (last life) is on the real grid, every half bar.
 */
export function stepHits(step, plan, o = {}) {
  const hits = [];
  let v = Math.floor(Number(step));
  if (!plan || !Array.isArray(plan.layers) || !(v >= 0)) return hits;
  const rnd = typeof o.rnd === 'function' ? o.rnd : Math.random;
  if (o.heart && v % 8 === 0) hits.push('heart');
  if (plan.halfTime) {
    if (v % 2) return hits;
    v /= 2;
  }
  const s = v % 16;
  const bar = Math.floor(v / 16);
  const has = (l) => plan.layers.includes(l);
  if (has('clicks')) {
    if (s % 4 === 0) hits.push('click');
    return hits;
  }
  if (has('kick') && s % 4 === 0) hits.push('kick');
  if (has('sub') && s % 4 === 2) hits.push('sub');
  if (has('hat') && s % 4 === 2) hits.push('hat');
  const bp = o.bassPat;
  if (has('bass') && bp && bp.length && bp[v % bp.length] != null) hits.push('bass');
  if (has('snare') && (s === 4 || s === 12)) hits.push('snare');
  if (has('hats16') && s % 2 === 1) hits.push('hat16');
  if (has('lead')) hits.push('lead');
  const pc = o.percCycle || 16;
  if (has('perc2') && (o.percSteps || PERC_STEPS).includes(v % pc)) hits.push('perc');
  if (has('fills') && bar % 4 === 3 && s >= 12) hits.push('fill');
  if (has('rolls')) {
    if (bar % 2 === 1 && s >= 13) hits.push('roll');
    if (s % 2 === 1 && rnd() < 0.08) hits.push('stab');
  }
  if (has('wild')) {
    if (s === 0 && bar % 4 === 0) hits.push('crash');
    if (rnd() < 0.1) hits.push('wildstab');
    if (s === 15 && rnd() < 0.5) hits.push('ratchet');
  }
  return hits;
}

// ==== voices and kits ===========================================================

// Bite note: walks up the universe's scale with the score (two octaves, then wraps).
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
  lane: [0, 1, 4, 5, 7, 8, 10],
  hangar: [0, 2, 3, 5, 7, 8, 10],
  mushroom: [0, 2, 4, 7, 9],
  castle: [0, 2, 4, 5, 7, 9, 11],
  abyss: [0, 2, 3, 7, 8],
};
const BITE_OCT = { lcd: 36, acid: 24, disco: 12, arcade: 24, kombat: 24, plastic: 36, bunker: 12, court: 24, timewarp: 24, wrong: 24, desktop: 24, lane: 24, hangar: 12, mushroom: 24, castle: 24, abyss: 12 };

export function biteMidi(id, score) {
  const s = SCALE[id] || SCALE.arcade;
  const deg = Math.max(0, Math.floor(Number(score) || 0) - 1) % (s.length * 2);
  return ROOT + (BITE_OCT[id] ?? 24) + s[deg % s.length] + 12 * Math.floor(deg / s.length);
}

// Rhythm kits. Bass patterns are semitones above the bar root, or null; their
// length is their cycle (castle's 12 steps = three-four over the four-four grid).
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
  lane: [0, 0, 12, _, 1, 0, _, 13, 0, _, 7, 8, 0, 12, _, 10],
  march: [0, _, _, _, 7, _, _, _, 0, _, _, 0, 7, _, 5, _],
  bounce: [0, _, 12, _, 7, _, 12, _, 0, _, 12, _, 7, _, 4, _],
  waltz: [0, _, _, _, 7, _, _, _, 12, _, 7, _],
  deep: [0, _, _, _, _, _, _, _, -5, _, _, _, _, _, _, _],
};
const KIT = {
  acid: { kick: { f0: 130, f1: 48, dec: 0.32, g: 0.85 }, hat: { k: 'noise', f: 8000, dec: 0.05, g: 0.14 }, snare: { k: 'snare', f: 1800, dec: 0.18, g: 0.3 }, bass: { type: 'sawtooth', lp: 300, env: 2400, q: 15, dec: 0.14, g: 0.22, pat: PAT.acid, oct: -12 }, extra: 'acid', perc: { k: 'rim' } },
  disco: { kick: { f0: 110, f1: 50, dec: 0.26, g: 0.95 }, hat: { k: 'open', f: 8500, dec: 0.16, g: 0.15 }, snare: { k: 'clap', f: 1500, dec: 0.14, g: 0.36 }, bass: { type: 'sawtooth', lp: 900, env: 900, q: 4, dec: 0.12, g: 0.26, pat: PAT.oct, oct: -12 }, extra: 'disco', perc: { k: 'conga' } },
  arcade: { kick: { f0: 220, f1: 55, dec: 0.14, g: 0.7, type: 'square', lp: 900 }, hat: { k: 'tick', f: 6000, dec: 0.025, g: 0.1 }, snare: { k: 'noise8', f: 3000, dec: 0.1, g: 0.25 }, bass: { type: 'square', lp: 1400, q: 1, dec: 0.1, g: 0.14, pat: PAT.arp, oct: -12 }, extra: 'arcade', perc: { k: 'blip' } },
  kombat: { kick: { f0: 160, f1: 45, dec: 0.22, g: 0.9, crush: true }, hat: { k: 'noise', f: 7000, dec: 0.04, g: 0.13, crush: true }, snare: { k: 'snare', f: 1200, dec: 0.2, g: 0.4, crush: true }, bass: { type: 'square', lp: 700, q: 3, dec: 0.16, g: 0.18, pat: PAT.kombat, oct: -12, crush: true }, extra: 'kombat', perc: { k: 'tom', crush: true } },
  plastic: { kick: { f0: 90, f1: 45, dec: 0.3, g: 0.75 }, hat: { k: 'glass', f: 7400, dec: 0.04, g: 0.05 }, snare: { k: 'clap', f: 2500, dec: 0.12, g: 0.22, send: 'echo' }, bass: { type: 'sine', lp: 2000, q: 0.5, dec: 0.25, g: 0.3, pat: PAT.plastic, oct: -12 }, extra: 'plastic', perc: { k: 'bell' } },
  bunker: { kick: { f0: 170, f1: 38, dec: 0.42, g: 1, drive: true }, hat: { k: 'metal', f: 420, dec: 0.07, g: 0.13 }, snare: { k: 'snare', f: 900, dec: 0.25, g: 0.4, drive: true }, bass: { type: 'sawtooth', lp: 180, q: 6, dec: 0.2, g: 0.3, pat: PAT.rumble, oct: -24, drive: true }, extra: 'bunker', perc: { k: 'clank' } },
  court: { kick: { f0: 75, f1: 38, dec: 0.5, g: 0.8, send: 'reverb' }, hat: { k: 'air', f: 9000, dec: 0.09, g: 0.08 }, snare: { k: 'clap', f: 1800, dec: 0.3, g: 0.18, send: 'reverb' }, bass: { type: 'triangle', lp: 900, q: 0.5, dec: 0.45, g: 0.26, pat: PAT.court, oct: -12 }, extra: 'court', perc: { k: 'rim' } },
  timewarp: { kick: { f0: 240, f1: 30, dec: 0.4, g: 0.9 }, hat: { k: 'sweep', f: 4000, dec: 0.07, g: 0.14 }, snare: { k: 'snare', f: 2200, dec: 0.22, g: 0.3 }, bass: { type: 'sawtooth', lp: 600, env: 1800, q: 8, dec: 0.2, g: 0.2, pat: PAT.warp, oct: -12, glide: true }, extra: 'timewarp', perc: { k: 'zap' } },
  desktop: { kick: { f0: 120, f1: 60, dec: 0.12, g: 0.7, type: 'triangle' }, hat: { k: 'tick', f: 3000, dec: 0.015, g: 0.12 }, snare: { k: 'noise8', f: 2000, dec: 0.06, g: 0.2 }, bass: { type: 'square', lp: 800, q: 2, dec: 0.09, g: 0.12, pat: PAT.desk, oct: -12 }, extra: 'desktop', perc: { k: 'click' } },
  // New universes (LEVELS_PLAN 7.4).
  lane: { kick: { f0: 140, f1: 48, dec: 0.3, g: 0.85 }, hat: { k: 'shaker', f: 6500, dec: 0.06, g: 0.11 }, snare: { k: 'clap', f: 1700, dec: 0.13, g: 0.3, send: 'echo' }, bass: { type: 'sawtooth', lp: 260, env: 2600, q: 16, dec: 0.15, g: 0.22, pat: PAT.lane, oct: -12 }, extra: 'lane', perc: { k: 'tabla', steps: [2, 3, 7, 10, 11, 14] } },
  hangar: { kick: { f0: 120, f1: 34, dec: 0.5, g: 1, send: 'reverb' }, hat: { k: 'metal', f: 520, dec: 0.05, g: 0.1 }, snare: { k: 'march', f: 1400, dec: 0.15, g: 0.36 }, bass: { type: 'sawtooth', lp: 320, q: 2, dec: 0.3, g: 0.24, pat: PAT.march, oct: -12, a: 0.02 }, extra: 'hangar', perc: { k: 'anvil', steps: [6, 14] } },
  mushroom: { kick: { f0: 200, f1: 50, dec: 0.12, g: 0.72, type: 'square', lp: 1000 }, hat: { k: 'noise', f: 9000, dec: 0.03, g: 0.08, crush: true }, snare: { k: 'noise8', f: 2500, dec: 0.09, g: 0.24 }, bass: { type: 'triangle', lp: 3000, q: 0.5, dec: 0.12, g: 0.3, pat: PAT.bounce, oct: -12 }, extra: 'mushroom', perc: { k: 'blip' } },
  castle: { kick: { f0: 90, f1: 48, dec: 0.25, g: 0.6, send: 'reverb' }, hat: { k: 'glass', f: 9200, dec: 0.05, g: 0.045 }, snare: { k: 'clap', f: 2200, dec: 0.2, g: 0.18, send: 'reverb' }, bass: { type: 'triangle', lp: 1200, q: 0.5, dec: 0.35, g: 0.26, pat: PAT.waltz, oct: -12 }, extra: 'castle', perc: { k: 'bell', steps: [3, 9], cycle: 12 } },
  abyss: { kick: { f0: 70, f1: 40, dec: 0.6, g: 0.55, a: 0.012, send: 'reverb' }, hat: { k: 'pluck', dec: 1.1, g: 0.08 }, hat16: 'call', snare: { k: 'soft', f: 900, dec: 0.4, g: 0.12, send: 'reverb' }, bass: { type: 'sine', lp: 400, q: 0.5, dec: 0.9, g: 0.28, pat: PAT.deep, oct: -12, a: 0.03 }, sub: 'pad', extra: 'abyss', perc: { k: 'drip' } },
};
const KIT_IDS = Object.keys(KIT);
const WRONG_POOL = KIT_IDS.filter((k) => k !== 'abyss'); // half-time kit does not mix into a four-four bar
const EXTRA_IDS = KIT_IDS.map((k) => KIT[k].extra);
const METAL = [1, 1.483, 1.8, 2.546, 2.63, 3.897]; // inharmonic square stack

function perfNow() {
  const p = globalThis.performance;
  return (p && typeof p.now === 'function' ? p.now() : Date.now()) / 1000;
}

export function createAudio(getPrefs, opts = {}) {
  const beat = createBeat({ bpm: stageBpm(0) });
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
  // LEVELS_PLAN 7 state.
  let score = 0;
  let stage = 0;
  let look = '2d';
  let lives = 3;
  let waiting = false; // respawn wait: muffled
  let lastBite = -Infinity; // context seconds; hunger clock
  let lastShift = -Infinity;
  let gap = { start: -1, end: -1, chops: 0 };
  let tapeUntil = -1;
  let dialsHold = -1;
  let hunger = 0;
  let planCache = null;
  let lastDrop = null;
  let dialTargets = {};
  const voices = []; // { t, end, srcs, music, done, cancelled }
  const stats = { created: 0, voices: 0, steps: 0, errors: 0, hearts: 0, cancelled: 0, drops: 0, lastEvent: null };

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

  function plan() {
    const r = calm();
    if (!planCache || planCache.stage !== stage || planCache.id !== timeline || planCache.reduced !== r) {
      planCache = { ...musicPlan(stage, timeline, { reduced: r }), reduced: r };
    }
    return planCache;
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
  // voices → pump (sidechain, tonal layers) → music (level by stage)
  //   drums → music
  // music → lpf (hunger / waiting) → wait (respawn level) → duck (drop gap, cut) → fade → master
  // wait → widen → echo (3D / first person)      riser, heart → fade      sfx → master
  // master → compressor → trim → soft clip → out

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
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 20;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    const trim = gainNode(0.85);
    const clip = c.createWaveShaper();
    clip.curve = curve(SOFTCLIP); // hard ceiling: nothing reaches 1.0
    clip.oversample = '2x';
    master.connect(comp);
    comp.connect(trim);
    trim.connect(clip);
    clip.connect(c.destination);

    const sfx = gainNode(0.9, master);
    const fade = gainNode(1, master); // stop()/die() fade
    const duck = gainNode(1, fade); // drop gap and cut() ducking
    const wait = gainNode(1, duck); // respawn wait
    const lpf = filter('lowpass', OPEN_LP, 0.9);
    lpf.connect(wait);
    const music = gainNode(musicGain(stage), lpf);
    const pump = gainNode(1, music);
    const heart = gainNode(1, fade);

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

    // Echo: dotted-eighth, filtered feedback; follows the tempo.
    const delay = c.createDelay(2);
    delay.delayTime.value = beat.period * 0.75;
    const fbf = filter('lowpass', 2600);
    const fb = gainNode(0.38);
    const echoIn = gainNode(1);
    echoIn.connect(delay);
    delay.connect(fbf);
    fbf.connect(fb);
    fb.connect(delay);
    delay.connect(gainNode(0.4, master));
    const widen = gainNode(0, echoIn);
    wait.connect(widen);

    const noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Hunger riser: looping noise → band-pass → gain (0 until hungry).
    const riserBp = filter('bandpass', 350, 2.5);
    const riserGain = gainNode(0, fade);
    const rs = c.createBufferSource();
    rs.buffer = noiseBuf;
    rs.loop = true;
    rs.connect(riserBp);
    riserBp.connect(riserGain);
    rs.start();

    // First-person drone: two detuned saws, low-passed, into the music low-pass.
    const droneGain = gainNode(0, lpf);
    const dlp = filter('lowpass', 220);
    dlp.connect(droneGain);
    const droneOscs = [-7, 7].map((det) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(ROOT - 12);
      o.detune.value = det;
      o._det = det;
      o.connect(dlp);
      o.start();
      return o;
    });

    bus = { master, comp, sfx, music, pump, lpf, wait, duck, fade, heart, reverbIn, echoIn, delay, widen, riserBp, riserGain, droneGain, droneOscs, noise: noiseBuf, shapers: new Map() };
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

  const isMusic = (d) => !!bus && (d === bus.music || d === bus.pump);

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
    return n;
  }

  // Cancel music voices that have not started by time t (kit swap, tape stop).
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
    if (bus) bus.pump.gain.cancelScheduledValues(t);
    stats.cancelled += n;
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
    for (const n of extra)
      if (n.start) {
        n.start(t);
        n.stop(end);
      }
    prune();
    const v = { t, end, srcs, music: isMusic(dest), done: false, cancelled: false };
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
    let det = o.detune || 0;
    if (lives === 1 && isMusic(o.dest)) det += LAST_LIFE_DETUNE + rand(-5, 5); // last life: slightly sour
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

  function metal(t, f, dec, g, dest, pan) {
    const srcs = METAL.map((r) => {
      const s = ctx.createOscillator();
      s.type = 'square';
      s.frequency.value = Math.min(20000, f * r);
      return s;
    });
    chain(srcs, { t, a: 0.001, dur: dec, g: g / 3, bp: 8000, q: 1.2, dest, pan });
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

  // ---- rhythm instruments --------------------------------------------------

  function kick(t, p, dest, gm = 1) {
    tone({ t, type: p.type || 'sine', f: p.f0, f2: p.f1, glide: p.dec * 0.5, a: p.a ?? 0.002, dur: p.dec, g: p.g * gm, lp: p.lp, drive: p.drive, crush: p.crush, dest, send: p.send, sendAmt: 0.25 });
    noise({ t, a: 0.001, dur: 0.012, g: p.g * gm * (p.a ? 0.08 : 0.25), hp: 3000, dest });
  }

  function hat(t, p, acc, dest, dm = 1) {
    const g = p.g * acc;
    const dec = p.dec * dm;
    switch (p.k) {
      case 'metal': return metal(t, p.f, dec, g, dest, rand(-0.4, 0.4));
      case 'tick': return tone({ t, type: 'square', f: p.f, a: 0.001, dur: dec, g: g * 0.6, hp: 1500, dest });
      case 'glass': return tone({ t, type: 'sine', f: p.f * rand(1, 1.03), a: 0.001, dur: dec * 2, g, dest, send: 'echo', sendAmt: 0.3 });
      case 'air': return noise({ t, a: 0.01, dur: dec, g, bp: p.f, q: 1.5, dest, send: 'reverb', sendAmt: 0.5 });
      case 'sweep': return noise({ t, a: 0.002, dur: dec, g, bp: p.f, f2f: p.f * 2.5, q: 6, dest });
      case 'shaker': return noise({ t, a: 0.012, dur: dec, g, hp: p.f, pan: rand(-0.3, 0.3), dest });
      case 'pluck': return undefined; // abyss: its hat layer is pluck() (wrong-universe mixes skip it)
      default: return noise({ t, a: 0.001, dur: dec, g, hp: p.f, crush: p.crush, dest });
    }
  }

  function snare(t, p, dest) {
    if (p.k === 'clap') {
      for (let i = 0; i < 3; i++) noise({ t: t + i * 0.011, a: 0.001, dur: i === 2 ? p.dec : 0.01, g: p.g, bp: p.f, q: 2, dest, send: p.send, sendAmt: 0.4 });
    } else if (p.k === 'noise8') {
      noise({ t, a: 0.001, dur: p.dec, g: p.g, bp: p.f, q: 0.8, crush: true, dest });
    } else if (p.k === 'march') {
      // Field snare: a flam, a tight body and a wire rattle.
      noise({ t, a: 0.001, dur: 0.02, g: p.g * 0.5, bp: p.f, q: 1, dest });
      noise({ t: t + 0.018, a: 0.001, dur: p.dec, g: p.g, bp: p.f, q: 0.9, dest });
      tone({ t: t + 0.018, type: 'triangle', f: 220, f2: 160, a: 0.001, dur: 0.07, g: p.g * 0.6, dest });
      noise({ t: t + 0.02, a: 0.003, dur: p.dec * 1.6, g: p.g * 0.25, hp: 3500, dest });
    } else if (p.k === 'soft') {
      noise({ t, a: 0.02, dur: p.dec, g: p.g, bp: p.f, q: 1.2, dest, send: p.send, sendAmt: 0.7 });
      tone({ t, type: 'sine', f: 180, f2: 150, a: 0.01, dur: 0.2, g: p.g * 0.6, dest });
    } else {
      noise({ t, a: 0.001, dur: p.dec, g: p.g, bp: p.f, q: 0.9, drive: p.drive, crush: p.crush, dest });
      tone({ t, type: 'triangle', f: 190, f2: 140, a: 0.001, dur: 0.09, g: p.g * 0.7, drive: p.drive, crush: p.crush, dest });
    }
  }

  function bass(t, p, semi, shift, dest, fs = 1) {
    const f = mtof(ROOT + p.oct + semi + shift);
    const acc = p.env && Math.random() < 0.3 ? 1.6 : 1;
    tone({
      t, type: p.type, f, f2: p.glide ? f * pick([0.5, 2, 1.5]) : undefined, glide: p.dec,
      a: p.a ?? 0.004, dur: p.dec, g: p.g, lp: (p.lp + (p.env || 0) * acc) * fs, f2f: p.env ? p.lp * fs : undefined, fdur: p.dec, q: p.q,
      drive: p.drive, crush: p.crush, dest, detune: p.type === 'sawtooth' ? rand(-6, 6) : 0,
    });
  }

  function sub(t, kit, shift, dest, s) {
    if (kit.sub === 'pad') {
      if (s === 2) pad(t, shift, dest);
      return;
    }
    tone({ t, type: 'sine', f: mtof(ROOT - 12 + shift), a: 0.004, dur: 0.16, g: 0.2, dest });
  }

  // Abyss: deep pads, slow plucks, distant calls.
  function pad(t, shift, dest) {
    const P = beat.period;
    [0, 7, 12, 15].forEach((st, i) => tone({ t, type: 'sawtooth', f: mtof(ROOT - 12 + shift + st), a: 1.2, hold: P * 3, dur: P * 3, g: 0.03, lp: 600, dest, detune: rand(-9, 9), pan: i % 2 ? 0.5 : -0.5, send: 'reverb', sendAmt: 0.6 }));
  }
  function pluck(t, shift, s, bar, dest) {
    const n = ROOT + 12 + shift + [0, 7, 3, 10, 12, 7][(bar * 4 + (s >> 2)) % 6];
    tone({ t, type: 'triangle', f: mtof(n), a: 0.015, dur: 1.1, g: 0.08, lp: 2400, dest, send: 'reverb', sendAmt: 0.7 });
    tone({ t, type: 'sine', f: mtof(n + 12), a: 0.02, dur: 0.8, g: 0.025, dest });
  }
  function call(t, shift, dest) {
    const f = mtof(ROOT + 24 + shift + pick([0, 3, 7]));
    tone({ t, type: 'sine', f, f2: f * 0.75, glide: 1.6, a: 0.4, dur: 1.6, g: 0.035, vib: 0.01, vibRate: 3, pan: rand(-0.8, 0.8), dest, send: 'reverb', sendAmt: 1 });
  }

  function perc(t, p, i, dest, shift) {
    switch (p.k) {
      case 'tabla':
        if (i % 2) {
          tone({ t, type: 'sine', f: 540, f2: 560, glide: 0.05, a: 0.001, dur: 0.22, g: 0.13, dest }); // na
          tone({ t, type: 'sine', f: 1090, a: 0.001, dur: 0.08, g: 0.05, dest });
        } else {
          tone({ t, type: 'sine', f: 95, f2: 150, glide: 0.12, a: 0.002, dur: 0.3, g: 0.3, dest }); // ghe, bending up
        }
        noise({ t, a: 0.001, dur: 0.015, g: 0.08, hp: 3000, dest });
        break;
      case 'anvil':
        for (const [r, gm, d] of [[1, 1, 0.5], [2.76, 0.5, 0.35], [5.4, 0.3, 0.22], [8.93, 0.15, 0.12]]) tone({ t, type: 'sine', f: 820 * r, a: 0.001, dur: d, g: 0.08 * gm, dest, send: 'reverb', sendAmt: 0.3 });
        noise({ t, a: 0.001, dur: 0.02, g: 0.12, hp: 4000, dest });
        break;
      case 'blip':
        tone({ t, type: 'square', f: mtof(ROOT + 36 + shift + (i % 2 ? 7 : 12)), a: 0.001, dur: 0.04, g: 0.04, lp: 6000, dest });
        break;
      case 'bell':
        tone({ t, type: 'triangle', f: 2600, a: 0.001, dur: 0.5, g: 0.04, dest, send: 'reverb', sendAmt: 0.4 });
        tone({ t, type: 'sine', f: 2600 * 2.76, a: 0.001, dur: 0.2, g: 0.015, dest });
        break;
      case 'conga': {
        const f = i % 2 ? 330 : 240;
        tone({ t, type: 'sine', f, f2: f * 0.9, a: 0.001, dur: 0.18, g: 0.2, dest });
        break;
      }
      case 'rim':
        tone({ t, type: 'triangle', f: 1700, a: 0.001, dur: 0.03, g: 0.12, hp: 800, dest });
        noise({ t, a: 0.001, dur: 0.02, g: 0.1, bp: 3500, q: 3, dest });
        break;
      case 'tom':
        tone({ t, type: 'sine', f: 180 - (i % 3) * 30, f2: 70, glide: 0.18, a: 0.001, dur: 0.22, g: 0.3, crush: p.crush, dest });
        break;
      case 'clank':
        metal(t, rand(900, 1400), 0.06, 0.12, dest, rand(-0.6, 0.6));
        break;
      case 'zap':
        tone({ t, type: 'sawtooth', f: 3000, f2: 200, glide: 0.08, a: 0.001, dur: 0.09, g: 0.05, lp: 5000, dest });
        break;
      case 'click':
        tone({ t, type: 'square', f: 4200, a: 0.001, dur: 0.012, g: 0.06, dest });
        break;
      case 'drip': {
        const f = rand(900, 1600);
        tone({ t, type: 'sine', f, f2: f * 2.2, glide: 0.06, a: 0.002, dur: 0.12, g: 0.05, dest, send: 'reverb', sendAmt: 0.8 });
        break;
      }
    }
  }

  function fill(t, kit, s, dest) {
    const k = s - 12;
    snare(t, { ...kit.snare, g: kit.snare.g * (0.45 + 0.18 * k) }, dest);
    tone({ t, type: 'sine', f: 110 + 45 * k, f2: 70 + 30 * k, glide: 0.12, a: 0.001, dur: 0.14, g: 0.22, dest });
  }
  function stab(t, shift, kit, dest) {
    const crush = !!kit.kick.crush;
    for (const st of [0, 3, 7]) tone({ t, type: 'sawtooth', f: mtof(ROOT + 12 + shift + st), a: 0.002, dur: 0.11, g: 0.045, lp: 2600, f2f: 700, crush, dest, detune: rand(-8, 8) });
  }
  function crash(t, dest) {
    noise({ t, a: 0.001, dur: 1.3, g: 0.12, hp: 5000, dest, send: 'reverb', sendAmt: 0.3 });
  }
  function zap(t, dest) {
    tone({ t, type: 'sawtooth', f: rand(200, 1600), f2: rand(40, 4000), a: 0.002, dur: 0.12, g: 0.06, crush: true, pan: rand(-1, 1), dest });
  }
  function ratchet(t, kit, dest) {
    for (let i = 0; i < 4; i++) hat(t + (i * beat.period) / 16, kit.hat, 0.35 + i * 0.12, dest, 0.6);
  }
  function click(t, s) {
    tone({ t, type: 'square', f: s === 0 ? 2600 : 2000, a: 0.001, dur: 0.012, g: s === 0 ? 0.07 : 0.045, hp: 1000, dest: bus.music });
  }
  function heart(t) {
    tone({ t, type: 'sine', f: 64, f2: 42, glide: 0.12, a: 0.004, dur: 0.15, g: 0.45, dest: bus.heart });
    tone({ t: t + 0.17, type: 'sine', f: 56, f2: 40, glide: 0.1, a: 0.004, dur: 0.13, g: 0.3, dest: bus.heart });
    stats.hearts++;
  }
  function pumpAt(t, depth) {
    if (!(depth > 0)) return;
    const g = bus.pump.gain;
    g.setValueAtTime(1 - depth, t);
    g.setTargetAtTime(1, t + 0.012, beat.period * (depth > 0.3 ? 0.28 : 0.15));
  }

  function extra(kind, s, t, shift, dest, step = s) {
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
      case 'lane':
        // Drone on the bar, buzzing plucks walking a raga-like scale.
        if (s === 0) for (const st of [0, 7, 12]) tone({ t, type: 'sawtooth', f: mtof(r + st), a: 0.08, dur: beat.period * 3.5, g: 0.022, lp: 900, dest, detune: rand(-8, 8) });
        if (s === 0 || s === 3 || s === 6 || s === 10 || s === 13) {
          const f = mtof(r + 24 + [0, 1, 4, 5, 7, 8, 10][(step * 3) % 7]);
          tone({ t, type: 'sawtooth', f, f2: f * 1.01, a: 0.001, dur: 0.22, g: 0.06, bp: 2600, f2f: 700, q: 7, pan: rand(-0.5, 0.5), dest, send: 'echo', sendAmt: 0.35 });
        }
        break;
      case 'hangar':
        // Low brass drone swelling on the bar, a short brass stab, ghost snare taps.
        if (s === 0) for (const st of [0, 7, 12]) tone({ t, type: 'sawtooth', f: mtof(r - 12 + st), a: 0.25, dur: beat.period * 3, g: 0.045, lp: 450, f2f: 900, fdur: beat.period * 2, dest, detune: rand(-6, 6) });
        if (s === 10) for (const st of [0, 7]) tone({ t, type: 'sawtooth', f: mtof(r + st), a: 0.01, dur: 0.16, g: 0.06, lp: 1400, f2f: 500, dest });
        if (s === 7 || s === 15) noise({ t, a: 0.001, dur: 0.05, g: 0.08, bp: 1500, q: 1, dest });
        break;
      case 'mushroom': {
        // Bright chip arpeggio, an octave up every other half bar.
        const ARP = [0, 4, 7, 12, 16, 12, 7, 4];
        tone({ t, type: 'square', f: mtof(r + 24 + ARP[s % 8] + (Math.floor(step / 8) % 2 ? 12 : 0)), a: 0.001, dur: 0.05, g: 0.04, lp: 7000, dest });
        if (s % 4 === 0) tone({ t: t + beat.period / 8, type: 'square', f: mtof(r + 36 + ARP[(s + 2) % 8]), a: 0.001, dur: 0.03, g: 0.02, lp: 8000, dest });
        break;
      }
      case 'castle': {
        // Music box in three-four (12-step cycle) over the four-four grid; celesta on the one.
        const c = step % 12;
        if (c % 2 === 0) {
          const MB = [0, 4, 7, 12, 11, 7, 9, 7, 4, 5, 4, 2];
          chime(t, mtof(r + 36 + MB[c / 2 + 6 * (Math.floor(step / 12) % 2)]), 0.06, dest, 'reverb');
        }
        if (c === 0) {
          tone({ t, type: 'sine', f: mtof(r + 24), a: 0.002, dur: 0.6, g: 0.06, dest, send: 'reverb', sendAmt: 0.5 });
          tone({ t, type: 'triangle', f: mtof(r + 48), a: 0.001, dur: 0.4, g: 0.025, dest });
        }
        break;
      }
      case 'abyss':
        if (s === 0 || s === 8) pluck(t, shift, s, Math.floor(step / 16), dest);
        break;
    }
  }

  function wrongKit(bar) {
    if (wrong.bar !== bar) {
      const k = () => KIT[pick(WRONG_POOL)];
      wrong = { bar, kit: { kick: k().kick, hat: k().hat, snare: k().snare, bass: k().bass, extra: k().extra, perc: k().perc } };
    }
    return wrong.kit;
  }

  function playStep(step, t) {
    const p = plan();
    const kit = p.id === 'wrong' ? wrongKit(Math.floor(step / 16)) : KIT[p.id] || KIT.arcade;
    const hits = stepHits(step, p, { bassPat: kit.bass && kit.bass.pat, percSteps: kit.perc && kit.perc.steps, percCycle: kit.perc && kit.perc.cycle, heart: lives === 1 });
    stats.steps++;
    if (!hits.length) return;
    const v = p.halfTime ? step / 2 : step;
    const s = v % 16;
    const bar = Math.floor(v / 16);
    const shift = PROG[bar % PROG.length];
    const quiet = t < tapeUntil || (t >= gap.start && t < gap.end - 0.002 && !gap.chops);
    const room = concurrent(t) < MAX_ACTIVE;
    const d = bus.music;
    const dp = bus.pump;
    const dm = riserPlan(hunger, p.id).hatDecay; // hats tighten while hungry
    for (const h of hits) {
      if (h === 'heart') {
        heart(t);
        continue;
      }
      if (quiet) continue;
      if (!room && h !== 'kick' && h !== 'click') continue;
      switch (h) {
        case 'click': click(t, s); break;
        case 'kick': kick(t, kit.kick, d); pumpAt(t, pumpDepth(p)); break;
        case 'sub': sub(t, kit, shift, dp, s); break;
        case 'hat': if (kit.hat.k === 'pluck') pluck(t, shift, s, bar, dp); else hat(t, kit.hat, 1, d, dm); break;
        case 'bass': bass(t, kit.bass, kit.bass.pat[v % kit.bass.pat.length], shift, dp, filterScale(p)); break;
        case 'snare': snare(t, kit.snare, d); break;
        case 'hat16': if (kit.hat16 === 'call') { if (s === 10 && bar % 2 === 1) call(t, shift, dp); } else hat(t, kit.hat, 0.55, d, dm); break;
        case 'lead': extra(kit.extra, s, t, shift, dp, v); break;
        case 'perc': perc(t, kit.perc, v, d, shift); break;
        case 'fill': fill(t, kit, s, d); break;
        case 'roll': kick(t, { ...kit.kick, dec: 0.08 }, d, 0.6); break;
        case 'stab': stab(t, shift, kit, dp); break;
        case 'crash': crash(t, d); break;
        case 'wildstab': extra(pick(EXTRA_IDS), s, t, shift, dp, v); if (Math.random() < 0.5) zap(t, dp); break;
        case 'ratchet': ratchet(t, kit, d); break;
      }
    }
  }

  // Continuous dials: hunger → riser, master low-pass; respawn wait → muffled.
  function setDial(key, param, value, now, tc) {
    const prev = dialTargets[key];
    if (prev != null && Math.abs(prev - value) <= Math.abs(value) * 0.01 + 1e-4) return;
    dialTargets[key] = value;
    param.setTargetAtTime(value, now, tc);
  }
  function dials(now, force) {
    if (!bus || now < dialsHold) return;
    hunger = force != null ? clamp01(Number(force)) : rhythm && !waiting && lastBite > -Infinity ? hungerAt(now - lastBite) : 0;
    const r = riserPlan(hunger, timeline);
    setDial('lp', bus.lpf.frequency, waiting ? WAIT_LP : r.lp, now, 0.08);
    setDial('wait', bus.wait.gain, waiting ? WAIT_GAIN : 1, now, 0.1);
    setDial('riser', bus.riserGain.gain, rhythm && !waiting ? r.gain : 0, now, 0.1);
    setDial('riserF', bus.riserBp.frequency, r.freq, now, 0.1);
  }

  function tick() {
    if (!ctx || !bus || ctx.state !== 'running') return;
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
    if (ip.sub > 0) tone({ t, type: 'sine', f: ip.heavy ? 92 : 110, f2: 28, glide: 0.4, a: ip.soft ? 0.025 : 0.002, dur: 0.5, g: ip.sub, drive: ip.heavy });
    if (ip.crash > 0) noise({ t, a: 0.001, dur: 1.2, g: ip.crash, hp: 4200, pan: rand(-0.2, 0.2), send: 'reverb', sendAmt: 0.35 });
    if (ip.heavy) noise({ t, a: 0.001, dur: 0.08, g: 0.4, hp: 2000, drive: true });
    if (ip.soft && ip.sub > 0) noise({ t, a: 0.12, dur: 0.6, g: 0.05, lp: 700, send: 'reverb', sendAmt: 0.8 });
  }

  function whoosh(t, soft) {
    noise({ t, a: soft ? 0.35 : 0.22, dur: 0.2, g: soft ? 0.05 : 0.11, bp: 280, f2f: 4200, fdur: 0.45, q: 1.4, pan: rand(-0.4, 0.4), send: 'reverb', sendAmt: 0.5 });
  }

  function applyLook(next, t, arriving) {
    const lp = lookPlan(next);
    const changed = lp.look !== look;
    look = lp.look;
    if (!bus) return;
    bus.widen.gain.setTargetAtTime(lp.send, t, 0.2);
    bus.droneGain.gain.setTargetAtTime(rhythm ? lp.drone : 0, t, 0.4);
    if (lp.whoosh && (arriving || changed) && live()) whoosh(t, timeline === 'abyss');
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

  function setScoreInner(sc) {
    const f = Math.floor(Number(sc));
    if (!Number.isFinite(f)) return; // junk is ignored
    const n = Math.max(0, f);
    score = n;
    const st = stageOf(n);
    if (st === stage) return;
    stage = st;
    planCache = null;
    beat.setBpm(stageBpm(stage));
    if (bus) {
      const now = ctx.currentTime;
      bus.music.gain.setTargetAtTime(musicGain(stage), now, 0.15);
      bus.delay.delayTime.setTargetAtTime(beat.period * 0.75, now, 0.05);
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
    lane(t, f) {
      // Acid squelch, a tabla 'na', a wobbling high note.
      tone({ t, type: 'sawtooth', f: f / 2, f2: (f / 2) * 1.06, glide: 0.1, a: 0.002, dur: 0.2, g: 0.14, lp: 4200, f2f: 280, q: 16, send: 'echo', sendAmt: 0.45 });
      tone({ t, type: 'sine', f: 560, f2: 590, glide: 0.04, a: 0.001, dur: 0.24, g: 0.13 });
      tone({ t: t + 0.05, type: 'sine', f: f * 2, a: 0.002, dur: 0.14, g: 0.07, vib: 0.05, vibRate: 11, pan: 0.5 });
    },
    hangar(t, f) {
      // Anvil strike over a low brass blat.
      for (const [r, gm, d] of [[1, 1, 0.6], [2.76, 0.55, 0.42], [5.4, 0.3, 0.26], [8.93, 0.16, 0.14]]) tone({ t, type: 'sine', f: f * 2 * r, a: 0.001, dur: d, g: 0.16 * gm, send: 'reverb', sendAmt: 0.35 });
      noise({ t, a: 0.001, dur: 0.025, g: 0.25, hp: 3500 });
      tone({ t, type: 'sawtooth', f: f / 4, a: 0.01, dur: 0.3, g: 0.14, lp: 700, f2f: 300 });
    },
    mushroom(t, f) {
      // Four-note chip arpeggio up the chord.
      [0, 4, 7, 12].forEach((st, i) => tone({ t: t + i * 0.03, type: 'square', f: f * Math.pow(2, st / 12), a: 0.001, dur: i === 3 ? 0.13 : 0.03, g: 0.09, lp: 7000 }));
    },
    castle(t, f) {
      // Music box note with a celesta shimmer.
      chime(t, f, 0.15, undefined, 'reverb');
      tone({ t, type: 'sine', f: f / 2, a: 0.002, dur: 0.9, g: 0.1, send: 'reverb', sendAmt: 0.6 });
      tone({ t: t + 0.12, type: 'triangle', f: f * 1.5, a: 0.001, dur: 0.5, g: 0.035, send: 'echo', sendAmt: 0.5 });
    },
    abyss(t, f) {
      // Slow pluck in a cathedral, one bubble.
      tone({ t, type: 'triangle', f, a: 0.012, dur: 1.1, g: 0.16, lp: 2600, send: 'reverb', sendAmt: 0.9 });
      tone({ t: t + 0.02, type: 'sine', f: f * 2, f2: f * 4, glide: 0.14, a: 0.004, dur: 0.16, g: 0.05, send: 'reverb', sendAmt: 0.8 });
    },
  };
  const BITE_IDS = Object.keys(BITE);

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

    // Kit change without a drop (legacy; shift() is the new path).
    setTimeline: safe(function (id) {
      timeline = universeId(id);
    }),

    // Kept for the current shell. Chaos no longer sets layers (the stage does);
    // it still colours cut() and the wild layer.
    setChaos: safe(function (x) {
      chaos = clamp01(Number(x));
    }),

    // Score drives the stage: layers, tempo (phase-continuous), loudness.
    setScore: safe(function (sc) {
      setScoreInner(sc);
    }),

    // Every bite: the drop. Kit swaps on the same bar position. Held bite: from === to.
    shift: safe(function (o) {
      const { from, to, look: nextLook, swing = false } = o || {};
      timeline = universeId(to ?? from ?? timeline);
      if (!live()) {
        applyLook(nextLook ?? look, 0, false);
        return;
      }
      const now = ctx.currentTime + 0.003;
      const since = (now - lastShift) / beat.period;
      lastShift = now;
      lastBite = now;
      const dp = dropPlan(stage, since);
      const gapSec = (dp.gap * beat.period) / 4;
      const end = now + gapSec;
      gap = { start: now, end, chops: dp.chops };
      const ip = impactPlan(timeline, stage, { swing, reduced: calm() });
      lastDrop = { at: +now.toFixed(3), stage, id: timeline, gapSteps: dp.gap, gapMs: Math.round(gapSec * 1000), stutter: dp.stutter, chops: dp.chops, impact: ip };
      stats.drops++;

      // Riser released into the gap; the low-pass snaps open on the impact.
      const rg = bus.riserGain.gain;
      anchor(rg, now);
      rg.linearRampToValueAtTime(0, now + 0.02);
      if (!waiting) {
        const f = bus.lpf.frequency;
        const cur = Math.max(60, anchor(f, now) || OPEN_LP);
        f.setValueAtTime(cur, end);
        f.exponentialRampToValueAtTime(OPEN_LP, end + 0.04);
      }
      dialTargets = {};
      dialsHold = end + 0.05;

      // The gap: silence up to stage 7, a chopped stutter from stage 8.
      const g = bus.duck.gain;
      anchor(g, now);
      if (!dp.chops) {
        g.linearRampToValueAtTime(dp.floor, now + 0.005);
        g.setValueAtTime(dp.floor, Math.max(now + 0.006, end - 0.004));
      } else {
        const n = dp.chops * 2;
        const sl = gapSec / n;
        const edge = Math.min(0.003, sl / 2);
        let prev = Number(g.value) || 1;
        for (let i = 0; i < n; i++) {
          const val = i % 2 ? 0.9 : dp.floor;
          g.setValueAtTime(prev, now + i * sl);
          g.linearRampToValueAtTime(val, now + i * sl + edge);
          prev = val;
        }
      }
      g.linearRampToValueAtTime(1, end + 0.004);

      // New kit from the next grid step; nothing old left in the queue.
      cancelQueued(now);
      rewind(now);
      if (ip.heavy) tone({ t: now, type: 'sawtooth', f: 2400, f2: 60, glide: gapSec + 0.3, a: 0.002, dur: gapSec + 0.35, g: 0.1, lp: 3000, f2f: 200, crush: true });
      impact(end, ip);
      applyLook(nextLook ?? look, now, true);
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

    // Tape stop, then muffled and quiet until respawned().
    lifeLost: safe(function () {
      waiting = true;
      stats.lastEvent = 'lifeLost';
      if (!live()) return;
      const now = ctx.currentTime + 0.003;
      tapeBend(now, TAPE);
      cancelQueued(now);
      rewind(now);
      tapeUntil = now + TAPE;
      dialTargets = {};
      dialsHold = now + TAPE;
      anchor(bus.riserGain.gain, now);
      bus.riserGain.gain.linearRampToValueAtTime(0, now + 0.03);
      const f = bus.lpf.frequency;
      const cur = Math.max(60, anchor(f, now) || OPEN_LP);
      f.setValueAtTime(cur, now + TAPE * 0.3);
      f.exponentialRampToValueAtTime(WAIT_LP, now + TAPE);
      const w = bus.wait.gain;
      anchor(w, now);
      w.linearRampToValueAtTime(WAIT_GAIN, now + TAPE);
      const root = mtof(ROOT + PROG[Math.floor(beat.position(now) / 4) % PROG.length]);
      tone({ t: now, type: 'sawtooth', f: root * 2, f2: root / 4, glide: TAPE, a: 0.003, dur: TAPE, g: 0.16, lp: 3000, f2f: 150, q: 2 });
      tone({ t: now, type: 'sine', f: root, f2: root / 8, glide: TAPE, a: 0.003, dur: TAPE + 0.1, g: 0.35 });
      noise({ t: now, a: 0.002, dur: 0.25, g: 0.12, lp: 4000, f2f: 200 });
    }),

    // First move after a respawn: snap back to full.
    respawned: safe(function () {
      const was = waiting;
      waiting = false;
      tapeUntil = -1;
      stats.lastEvent = 'respawned';
      if (ctx) lastBite = ctx.currentTime;
      if (!live()) return;
      const now = ctx.currentTime + 0.003;
      const f = bus.lpf.frequency;
      const cur = Math.max(60, anchor(f, now) || OPEN_LP);
      f.exponentialRampToValueAtTime(Math.max(cur, OPEN_LP), now + 0.05);
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
        noise({ t: now, a: 0.04, dur: 0.02, g: 0.1, bp: 700, f2f: 9000, fdur: 0.06, q: 1.2 });
        tone({ t: now + 0.05, type: 'sine', f: 150, f2: 42, glide: 0.12, a: 0.002, dur: 0.2, g: 0.55 });
      }
      cancelQueued(now);
      rewind(now);
      if (rhythm) tick();
    }),

    // Original rising figure (LIFE_FIGURE), bright and short.
    lifeGained: safe(function () {
      stats.lastEvent = 'lifeGained';
      if (!live()) return;
      const t = ctx.currentTime + 0.004;
      const fig = lifeFigure();
      fig.forEach((n, i) => {
        const f = mtof(ROOT + 24 + n.semi);
        const last = i === fig.length - 1;
        tone({ t: t + n.at, type: 'square', f, a: 0.002, dur: n.dur, g: 0.06, lp: 5000, vib: last ? 0.012 : 0, vibRate: 7 });
        tone({ t: t + n.at, type: 'triangle', f: f * 2, a: 0.002, dur: n.dur * 1.4, g: 0.04, send: 'echo', sendAmt: 0.4 });
      });
    }),

    eat: safe(function (sc) {
      if (sc != null && Number.isFinite(Number(sc))) setScoreInner(sc); // the current shell drives the stage this way
      if (ctx) lastBite = ctx.currentTime;
      if (!live()) return;
      const t = ctx.currentTime + 0.004;
      if (timeline === 'wrong') {
        // Wrong Universe: one or two voices from other eras, slightly out of tune.
        const n = calm() ? 1 : 1 + (Math.random() < 0.5 + chaos * 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const id = pick(BITE_IDS);
          BITE[id](t + i * 0.03, mtof(biteMidi('wrong', sc) + rand(-0.4, 0.4)) * (id === 'lcd' ? 2 : 1));
        }
        return;
      }
      (BITE[timeline] || BITE.arcade)(t, mtof(biteMidi(timeline, sc)));
    }),

    cut: safe(function ({ swing = false } = {}) {
      if (!live()) return;
      const heavy = !!swing && !calm();
      const c = calm() ? chaos * 0.6 : chaos;
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
      waiting = false;
      tapeUntil = -1;
      if (!live()) return;
      const t = ctx.currentTime + 0.005;
      tone({ t, type: 'sawtooth', f: 520, f2: 38, glide: 1.1, a: 0.004, dur: 1.2, g: 0.3, lp: 5000, f2f: 180, q: 4, pan: -0.4 });
      tone({ t, type: 'sawtooth', f: 526, f2: 36, glide: 1.15, a: 0.004, dur: 1.2, g: 0.24, lp: 4000, f2f: 150, detune: 18, pan: 0.4 });
      noise({ t, a: 0.002, dur: 0.7, g: 0.3, lp: 6000, f2f: 200, send: 'reverb', sendAmt: 0.5 });
      tone({ t, type: 'sine', f: 90, f2: 28, glide: 0.6, a: 0.002, dur: 0.8, g: 0.7, drive: true });
    }),

    start: safe(function () {
      if (!beat.running) {
        beat.setBpm(stageBpm(stage));
        beat.start();
      }
      rhythm = true;
      nextStep = null;
      if (bus) {
        const now = ctx.currentTime;
        lastBite = now;
        const g = bus.fade.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(1, now);
        if (!waiting) {
          for (const p of [bus.lpf.frequency, bus.wait.gain]) p.cancelScheduledValues(now);
          bus.lpf.frequency.setValueAtTime(OPEN_LP, now);
          bus.wait.gain.setValueAtTime(1, now);
        }
        dialTargets = {};
        bus.droneGain.gain.setTargetAtTime(lookPlan(look).drone, now, 0.4);
        if (!offline && ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
      if (!timer && typeof setInterval === 'function') timer = setInterval(api._tick, TICK_MS);
      tick();
    }),

    stop: safe(function () {
      rhythm = false;
      hunger = 0;
      nextStep = null;
      if (timer) clearInterval(timer);
      timer = null;
      beat.stop();
      if (bus) {
        const t = ctx.currentTime;
        const g = bus.fade.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.setTargetAtTime(0, t, 0.05); // silence what the lookahead already queued
        bus.riserGain.gain.cancelScheduledValues(t);
        bus.riserGain.gain.setTargetAtTime(0, t, 0.03);
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
        score,
        stage,
        bpm: beat.bpm,
        layers: p.layers.join(' '),
        layerCount: p.layers.length,
        halfTime: p.halfTime,
        hunger: +hunger.toFixed(2),
        lives,
        waiting,
        look,
        lastDrop,
        active: ctx ? concurrent(ctx.currentTime) : 0,
        ...stats,
      };
    },
  };
  api._tick = safe(tick);
  // Harness hooks (offline renders, tests): play one rhythm step at context time t;
  // update the dials as if the clock read t (optionally forcing hunger); read the current plan.
  api._step = safe((step, t) => {
    if (live()) playStep(step, t);
  });
  api._dials = safe((t, hunger) => dials(t, hunger)); // hunger: optional override 0..1
  api._plan = () => plan();
  const unlockInner = api.unlock;
  api.unlock = () => {
    const r = unlockInner();
    return r && typeof r.then === 'function' ? r : Promise.resolve(false);
  };
  return api;
}
