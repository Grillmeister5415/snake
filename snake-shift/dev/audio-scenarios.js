// SNAKE//SHIFT — scripted audio scenarios, one runner, offline metrics (SOUND_PLAN 4).
//
// A scenario is data: { id, name, dur, prefs?, events: [[t, call, args], ...], marks }.
// Calls use the new audio interface (setGameplay, bite, shift, setLives, lifeLost, ...).
// adapter('legacy', audio) maps them onto the engine of commit 184b3c8 for the comparison page.
//
// render(sc, { createAudio, kind }) drives the real scheduler through an OfflineAudioContext:
// it suspends the render every TICK frames, runs the due events, calls audio._tick() and resumes.
// Audio randomness comes from the engine's own seed (new) or a seeded Math.random (legacy).
// Nothing here touches the game.

import { LUMA, SPEED } from '../src/config.js';
import { arrangement, levelOf, paceOf } from '../src/arrange.js';

export const SR = 48000;
const TICK_FRAMES = 9 * 128; // 24 ms at 48 kHz, a whole number of render quanta

// ---- helpers for writing scenarios ------------------------------------------------

export const stepMsFor = (score) => Math.max(SPEED.capMs, SPEED.startMs - SPEED.rampMs * score);
const swingOf = (a, b) => Math.abs((LUMA[a] ?? 0.4) - (LUMA[b] ?? 0.4)) > 0.3;
const ROOMS = new Set(['court', 'bunker', 'disco', 'plastic', 'lane', 'hangar', 'mushroom', 'castle', 'abyss']);
const lookOf = (id) => (ROOMS.has(id) ? '3d' : '2d');
/** New-engine bpm at a score, with the length the scenarios use (3 + score). */
export const bpmAt = (score, length = 3 + score) => 118 + 20 * paceOf({ stepMs: stepMsFor(score), startMs: SPEED.startMs, capMs: SPEED.capMs, score, length });

/** A run opening: gameplay state, lives, start. */
function opening(score, { lives = 3, length = 3 + score, world = null, look = '2d' } = {}) {
  const ev = [
    [0, 'setGameplay', { stepMs: stepMsFor(score), startMs: SPEED.startMs, capMs: SPEED.capMs, score, length, clear: true }],
    [0, 'setLives', lives],
    [0, 'start'],
  ];
  if (world && world !== 'lcd') ev.push([0, 'shift', { from: 'lcd', to: world, look }]);
  return ev;
}

/** One bite event (with its gameplay update first, as main.js does). */
function biteAt(t, score, from, to, o = {}) {
  const look = o.look ?? lookOf(to);
  const ev = [[t, 'setGameplay', { stepMs: stepMsFor(score), score, length: 3 + score }]];
  if (o.lifeGained) ev.push([t, 'setLives', o.lives ?? 4], [t, 'lifeGained']);
  ev.push([t, 'bite', {
    score, kind: o.lifeGained ? 'mushroom' : 'dot', from, to, look, prevLook: o.prevLook ?? lookOf(from),
    held: !!o.held, reset: !!o.reset, swing: o.swing ?? (!o.held && swingOf(from, to)), lifeGained: !!o.lifeGained,
  }]);
  return ev;
}

/** Pressure held at `level` from t0 to t1 (one update per 100 ms, as ticks would), then cleared to 0. */
function pressure(t0, t1, level, wobble = 0.08) {
  const ev = [];
  let k = 0;
  for (let t = t0; t < t1; t += 0.1, k++) ev.push([+t.toFixed(3), 'setGameplay', { pressure: Math.min(1, level + wobble * Math.sin(k * 1.7)) }]);
  ev.push([t1, 'setGameplay', { pressure: 0 }]);
  return ev;
}

// ---- the scenarios (SOUND_PLAN 4.1) -------------------------------------------------

function sc1() {
  return {
    id: '1', name: 'Opening: LCD → Arcade → Reality.exe at low score', dur: 18,
    events: [...opening(0), ...biteAt(3, 1, 'lcd', 'arcade'), ...biteAt(10.5, 2, 'arcade', 'court', { look: '3d' })],
    marks: { arcade: [3, 10.5], court: [10.5, 18] },
  };
}

function sc2(prefs) {
  const bar = (4 * 60) / bpmAt(15);
  const t0 = 0.5 + 4 * bar, t1 = t0 + 4 * bar, end = t1 + 4 * bar + 0.5;
  return {
    id: prefs ? '10a' : '2', name: `Same score and speed: 4 bars safe, 4 constrained, 4 safe${prefs ? ' (calmer sound)' : ''}`, dur: end, prefs,
    events: [...opening(15, { world: 'disco', look: '3d' }), ...pressure(t0, t1, 0.68)],
    marks: { safeA: [0.5, t0], tight: [t0, t1], safeB: [t1, end - 0.5], t0, t1, bar },
  };
}

function sc3() {
  const worlds = ['arcade', 'kombat', 'disco', 'acid', 'plastic', 'bunker', 'desktop', 'hangar', 'court', 'acid', 'kombat', 'arcade', 'disco', 'bunker'];
  const ev = [...opening(20, { world: 'hangar', look: '3d' })];
  let from = 'hangar', t = 2;
  worlds.forEach((to, i) => { ev.push(...biteAt(t, 21 + i, from, to, { swing: false })); from = to; t += 0.62; });
  return { id: '3', name: 'Rapid bites across worlds (0.62 s apart)', dur: t + 3, events: ev, marks: { rapid: [2, t] } };
}

function sc4() {
  const ev = [...opening(18, { world: 'arcade' })];
  let t = 1.5, score = 18, world = 'arcade';
  const hold = (id, n, flip) => {
    ev.push(...biteAt(t, ++score, world, id, { swing: false }));
    world = id;
    t += 1.6;
    for (let i = 0; i < n; i++) {
      const look = flip ? (i % 2 ? '3d' : '2d') : '3d';
      ev.push(...biteAt(t, ++score, id, id, { held: true, look, prevLook: flip ? (i % 2 ? '2d' : '3d') : '3d', lifeGained: id === 'mushroom' && i === 1, lives: 4 }));
      t += 1.25;
    }
  };
  hold('lane', 4, false);
  hold('mushroom', 4, false);
  hold('castle', 4, true);
  return { id: '4', name: 'Held bites in Lane, Mushroom and Castle', dur: t + 2, events: ev, marks: { held: [1.5, t] } };
}

function sc5(prefs) {
  // Majors entered at four bar positions (steps 0, 4, 9, 13), ordinary changes between them,
  // and one major attempt inside the cooldown that must come out as an ordinary change.
  const score0 = 30;
  const beat = 60 / bpmAt(score0);
  const sixteenth = beat / 4;
  const ev = [...opening(score0, { world: 'kombat' })];
  const at = (bar, step) => 0.0 + bar * 4 * beat + step * sixteenth;
  const plan = [
    [at(2, 0), 'kombat', 'plastic', true],
    [at(4, 6), 'plastic', 'arcade', false],
    [at(6, 4), 'arcade', 'acid', true],
    [at(6, 14), 'acid', 'bunker', true], // inside the cooldown: an ordinary change
    [at(9, 2), 'bunker', 'desktop', false],
    [at(11, 9), 'desktop', 'kombat', true],
    [at(13, 8), 'kombat', 'disco', false],
    [at(15, 13), 'disco', 'acid', true],
  ];
  let score = score0;
  for (const [t, from, to, swing] of plan) ev.push(...biteAt(+t.toFixed(4), ++score, from, to, { swing }));
  return { id: prefs ? '10b' : '5', name: `Major transitions at four bar positions${prefs ? ' (calmer sound)' : ''}`, dur: at(18, 0), prefs, events: ev, marks: { bites: plan.map((p) => +p[0].toFixed(4)), swings: plan.map((p) => p[3]) } };
}

function sc6() {
  // 90 s at full speed: bites every 2.2–3.6 s, a held Lane stretch, one Total Reset, Abyss, pressure spikes.
  const seq = ['disco', 'kombat', 'bunker', 'acid', 'plastic', 'hangar', 'arcade', 'court', 'lane', 'lane', 'lane', 'lane', 'lane', 'desktop', 'bunker', 'disco', 'lcd', 'arcade', 'kombat', 'abyss', 'plastic', 'timewarp', 'hangar', 'disco', 'wrong', 'acid', 'bunker', 'court', 'kombat', 'arcade', 'disco', 'hangar', 'plastic'];
  const gaps = [2.6, 3.1, 2.2, 3.6, 2.8, 2.4, 3.3, 2.9, 2.5, 3.0];
  const ev = [...opening(40, { world: 'hangar', look: '3d' })];
  let t = 1.8, from = 'hangar', score = 40;
  seq.forEach((to, i) => {
    if (t > 88) return;
    const held = to === from && to === 'lane';
    ev.push(...biteAt(+t.toFixed(3), ++score, from, to, { held, reset: to === 'lcd' }));
    from = to;
    t += gaps[i % gaps.length];
  });
  for (const [a, b, lv] of [[12, 13.6, 0.6], [31, 32, 0.85], [47, 49.5, 0.5], [70, 71.2, 0.8], [83, 84, 0.6]]) ev.push(...pressure(a, b, lv));
  ev.sort((x, y) => x[0] - y[0]);
  return { id: '6', name: 'Sustained fast run, 90 s', dur: 90, events: ev, marks: { first: [0, 30], last: [60, 90] } };
}

function sc7() {
  const ev = [...opening(45, { world: 'bunker', look: '3d' })];
  ev.push(...biteAt(4, 46, 'bunker', 'lcd', { reset: true, look: '2d' }));
  ev.push(...biteAt(9, 47, 'lcd', 'disco'));
  ev.push(...biteAt(12, 48, 'disco', 'abyss'));
  ev.push(...pressure(16, 18, 0.8));
  ev.push(...biteAt(22, 49, 'abyss', 'arcade'));
  return { id: '7', name: 'Calm worlds: LCD return from Bunker, Abyss entry', dur: 26, events: ev, marks: { lcd: [4, 9], abyss: [12, 22] } };
}

function sc8() {
  const ev = [...opening(20, { world: 'arcade', lives: 2 })];
  ev.push([4, 'setGameplay', { clear: true }], [4, 'setLives', 1], [4, 'lifeLost']);
  ev.push([6.5, 'setGameplay', { stepMs: stepMsFor(20), score: 20, length: 3 }], [6.5, 'respawned']);
  ev.push(...biteAt(9, 21, 'arcade', 'mushroom'));
  ev.push(...biteAt(11.5, 22, 'mushroom', 'mushroom', { held: true, lifeGained: true, lives: 2 }));
  ev.push([16, 'setGameplay', { clear: true }], [16, 'setLives', 1], [16, 'lifeLost']);
  ev.push([18.5, 'respawned']);
  ev.push(...pressure(20, 21.5, 0.9));
  ev.push([21.5, 'setGameplay', { clear: true }], [21.5, 'setLives', 0], [21.5, 'die']);
  return { id: '8', name: 'Last life, life gained, life lost, respawn, game over', dur: 25, events: ev, marks: { lastLife: [6.5, 9] } };
}

function sc9() {
  const ev = [...opening(10, { world: 'acid' })];
  ev.push([4, 'setGameplay', { clear: true }], [4, 'stop']);
  ev.push([6, 'start']);
  ev.push(...biteAt(7.5, 11, 'acid', 'plastic'));
  ev.push([9, 'setMuted', true], ...biteAt(10, 12, 'plastic', 'arcade'), [11, 'setMuted', false]);
  ev.push([13, 'setGameplay', { clear: true }], [13, 'setLives', 0], [13, 'die']);
  ev.push([15.5, 'setGameplay', { stepMs: stepMsFor(0), startMs: SPEED.startMs, capMs: SPEED.capMs, score: 0, length: 3, clear: true }], [15.5, 'setLives', 3], [16, 'start']);
  ev.push(...biteAt(18, 1, 'lcd', 'arcade'));
  return { id: '9', name: 'Pause, resume, mute, game over, restart', dur: 21, events: ev, marks: { paused: [4.2, 6], muted: [9.1, 11] } };
}

export const SCENARIOS = [sc1(), sc2(), sc3(), sc4(), sc5(), sc6(), sc7(), sc8(), sc9(), sc2({ reducedAudio: true }), sc5({ reducedAudio: true })];
export const byId = (id) => SCENARIOS.find((s) => s.id === String(id));

/**
 * Scenario 11: geometry from a real createSim with scripted turns; pressure from pressureOf().
 * Built in the browser (it needs the sim). Each part plays in its own world.
 */
export async function geometryScenario() {
  const { createSim } = await import('../src/sim.js');
  const { pressureOf } = await import('../src/pressure.js');
  const { UNIVERSES } = await import('../src/rules-config.js');
  const parts = [
    // name, universe, start, turns by tick, ticks
    ['wall approach (box)', 'arcade', { snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 2, y: 2 } }, {}, 9],
    ['wall-parallel (box)', 'arcade', { snake: [{ x: 2, y: 15 }, { x: 1, y: 15 }, { x: 0, y: 15 }], dir: 'right', food: { x: 2, y: 2 } }, {}, 9],
    // A one-cell corridor between the top wall and the snake's own body, then open space.
    ['corridor (box)', 'arcade', { snake: [[3, 0], [2, 0], [1, 0], [0, 0], ...Array.from({ length: 14 }, (_, x) => [x, 1])].map(([x, y]) => ({ x, y })), dir: 'right', food: { x: 8, y: 10 } }, {}, 8],
    ['lane travel', 'lane', { snake: [{ x: 8, y: 9 }, { x: 8, y: 10 }, { x: 8, y: 11 }], dir: 'up', food: { x: 3, y: 0 } }, {}, 24],
    ['cube seam', 'castle', { snake: [{ x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 }], dir: 'up', food: { x: 0, y: 15 } }, {}, 10],
  ];
  const ev = [];
  const curves = [];
  let t = 0.5;
  const score = 12;
  const stepMs = stepMsFor(score);
  ev.push(...opening(score, { world: 'arcade' }));
  let world = 'arcade';
  for (const [name, uid, start, turns, ticks] of parts) {
    if (uid !== world) { ev.push([t, 'shift', { from: world, to: uid, look: '2d' }], [t, 'setGameplay', { clear: true }]); world = uid; }
    const sim = createSim({ universes: UNIVERSES, seed: 3, start: { ...start, universe: uid, score } });
    sim.setPaused(false);
    const curve = { name, t0: t, points: [] };
    for (let k = 0; k <= ticks; k++) {
      if (turns[k]) sim.queueTurn(turns[k]);
      const s = sim.snapshot();
      const r = pressureOf(s);
      curve.points.push({ t: +t.toFixed(3), danger: r.danger, exits: r.exits, ahead: r.ahead, room: r.room, alive: s.alive });
      ev.push([+t.toFixed(3), 'setGameplay', { pressure: r.danger }]);
      if (!s.alive) break;
      sim.step();
      t += stepMs / 1000;
    }
    t += 0.3;
    ev.push([+t.toFixed(3), 'setGameplay', { clear: true }]);
    t += 1.2;
    curves.push(curve);
  }
  return { id: '11', name: 'Geometry from the real sim: wall approach, wall-parallel, corridor, lane, cube seam', dur: t + 0.5, events: ev, curves, marks: {} };
}

// ---- adapters --------------------------------------------------------------------

const PASS = ['start', 'stop', 'setLook', 'setLives', 'lifeLost', 'lifeGained', 'respawned', 'die', 'setMuted'];

/** The calls of a scenario mapped onto one engine. prefs is the live object the engine reads. */
export function adapter(kind, audio, prefs) {
  const out = {};
  for (const k of PASS) out[k] = (...a) => audio[k](...a);
  out.prefs = (p) => Object.assign(prefs, p);
  if (kind === 'legacy') {
    out.setGameplay = (o = {}) => { if (o.score != null) audio.setScore(o.score); };
    out.bite = (o = {}) => { audio.setScore(o.score); audio.shift({ from: o.from, to: o.to, look: o.look, swing: !!o.swing }); audio.eat(o.score); };
    out.shift = (o = {}) => audio.shift({ from: o.from, to: o.to, look: o.look, swing: false });
  } else {
    out.setGameplay = (o) => audio.setGameplay(o);
    out.bite = (o) => audio.bite(o);
    out.shift = (o) => audio.shift(o);
  }
  return out;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Render a scenario offline. Returns { buffer, samples, trace, debug }.
 * samples: one per tick { t, active, danger, raw, state, antic, bpm }. trace: the engine's record
 * of scheduled steps ({ t, step, id, hits }) and bites ({ t, bite, from, to, rapid, beat }).
 */
export async function render(sc, { createAudio, kind = 'new', seed = 7, sr = SR, mute = null } = {}) {
  const dur = sc.dur;
  const off = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const prefs = { reducedFlash: false, reducedMotion: false, reducedAudio: false, ...(sc.prefs || {}) };
  const trace = [];
  const origRandom = Math.random;
  if (kind === 'legacy') Math.random = mulberry(seed);
  try {
    const audio = createAudio(() => prefs, { context: off, seed, trace, mute });
    await audio.unlock();
    const ad = adapter(kind, audio, prefs);
    const events = sc.events.slice().sort((a, b) => a[0] - b[0]);
    let ei = 0;
    const samples = [];
    const runDue = (now) => {
      while (ei < events.length && events[ei][0] <= now + 1e-6) {
        const [, call, arg] = events[ei++];
        ad[call](arg);
      }
    };
    const sample = () => {
      const d = audio.debug();
      samples.push({ t: off.currentTime, active: d.active, danger: d.danger, raw: d.dangerRaw, state: d.dangerState, antic: d.antic, bpm: d.bpm });
    };
    runDue(0);
    audio._tick();
    const total = Math.ceil(sr * dur);
    for (let f = TICK_FRAMES; f < total - 128; f += TICK_FRAMES) {
      off.suspend(f / sr).then(() => {
        runDue(off.currentTime);
        audio._tick();
        sample();
        off.resume();
      });
    }
    const buffer = await off.startRendering();
    return { buffer, samples, trace, debug: audio.debug() };
  } finally {
    Math.random = origRandom;
  }
}

// ---- metrics ----------------------------------------------------------------------

// ITU-R BS.1770 K-weighting at 48 kHz.
const K1 = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
const K2 = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };
function biquad(x, { b, a }) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

const kCache = new WeakMap();
function kWeighted(buffer) {
  let k = kCache.get(buffer);
  if (!k) {
    k = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) k.push(biquad(biquad(buffer.getChannelData(ch), K1), K2));
    kCache.set(buffer, k);
  }
  return k;
}

/** Integrated loudness (LUFS, gated) of [t0, t1). */
export function loudness(buffer, t0 = 0, t1 = buffer.duration) {
  const sr = buffer.sampleRate;
  const k = kWeighted(buffer);
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
  const s0 = Math.max(0, Math.round(t0 * sr)), s1 = Math.min(buffer.length, Math.round(t1 * sr));
  const zs = [];
  for (let i = s0; i + blk <= s1; i += hop) {
    let z = 0;
    for (const ch of k) { let s = 0; for (let j = i; j < i + blk; j++) s += ch[j] * ch[j]; z += s / blk; }
    zs.push(z);
  }
  const L = (z) => -0.691 + 10 * Math.log10(z);
  const abs = zs.filter((z) => z > 0 && L(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((z) => L(z) > rel);
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}

/** RMS level in dBFS of [t0, t1) (both channels). */
export function rmsDb(buffer, t0, t1) {
  const sr = buffer.sampleRate;
  const s0 = Math.max(0, Math.round(t0 * sr)), s1 = Math.min(buffer.length, Math.round(t1 * sr));
  let s = 0, n = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = s0; i < s1; i++) { s += d[i] * d[i]; n++; }
  }
  return n ? 10 * Math.log10(s / n + 1e-12) : -120;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

export const BANDS = [[0, 80], [80, 250], [250, 2000], [2000, 6000], [6000, 24000]];
/** Share of energy per band (sums to 1) over [t0, t1), mono sum. */
export function bands(buffer, t0 = 0, t1 = buffer.duration) {
  const sr = buffer.sampleRate, N = 4096;
  const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const s0 = Math.max(0, Math.round(t0 * sr)), s1 = Math.min(buffer.length, Math.round(t1 * sr));
  const acc = new Float64Array(BANDS.length);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = s0; i + N <= s1; i += N / 2) {
    for (let j = 0; j < N; j++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (N - 1)); re[j] = ((L[i + j] + R[i + j]) / 2) * w; im[j] = 0; }
    fft(re, im);
    for (let b = 1; b < N / 2; b++) {
      const f = (b * sr) / N, p = re[b] * re[b] + im[b] * im[b];
      for (let k = 0; k < BANDS.length; k++) if (f >= BANDS[k][0] && f < BANDS[k][1]) { acc[k] += p; break; }
    }
  }
  const tot = acc.reduce((a, b) => a + b, 0) || 1;
  return Array.from(acc, (v) => v / tot);
}

/** The metrics table of SOUND_PLAN 4.1 for [t0, t1). */
export function metrics(buffer, { t0 = 0, t1 = buffer.duration, samples = null, debug = null } = {}) {
  const sr = buffer.sampleRate;
  const s0 = Math.max(0, Math.round(t0 * sr)), s1 = Math.min(buffer.length, Math.round(t1 * sr));
  let peak = 0, sum = 0, n = 0, hot = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = s0; i < s1; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (v > 0.7) hot++; sum += v * v; n++; }
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const inRange = (samples || []).filter((s) => s.t >= t0 && s.t < t1);
  return {
    lufs: +loudness(buffer, t0, t1).toFixed(2),
    peak: +peak.toFixed(4),
    crestDb: +(20 * Math.log10(peak / (rms || 1e-9))).toFixed(2),
    hotPct: +((100 * hot) / Math.max(1, n)).toFixed(3),
    bands: bands(buffer, t0, t1).map((x) => +(100 * x).toFixed(1)),
    maxVoices: inRange.length ? Math.max(...inRange.map((s) => s.active || 0)) : null,
    errors: debug ? debug.errors : null,
  };
}

/** A 16-bit stereo WAV of a buffer, scaled by `gain`. */
export function wav(buffer, gain = 1) {
  const ch = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i] * gain)); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * Play a scenario live on an engine that is already unlocked. Returns { stop() }.
 * Uses wall-clock timers; good enough for listening, not for measuring.
 */
export function playLive(sc, ad) {
  const t0 = performance.now();
  const timers = sc.events.map(([t, call, arg]) => setTimeout(() => ad[call](arg), Math.max(0, t * 1000)));
  const end = setTimeout(() => ad.stop(), sc.dur * 1000);
  return { t0, stop() { timers.forEach(clearTimeout); clearTimeout(end); ad.stop(); } };
}

// ---- the checks of SOUND_PLAN 4.3 ---------------------------------------------------------

/** The last scheduling of each step wins (a kit swap cancels and re-schedules). */
export function finalSteps(trace) {
  const by = new Map();
  for (const e of trace) if (e.hits) by.set(e.step, e);
  return [...by.values()].sort((a, b) => a.step - b.step);
}
const bitesOf = (trace) => trace.filter((e) => e.bite && !e.silent);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const r2 = (x) => (Number.isFinite(x) ? +x.toFixed(2) : x);

/**
 * Render every scenario with the new engine and run the checks. Returns { rows, checks, renders }.
 * Each check: { id, name, pass, value }. createAudio: the new engine's factory.
 */
export async function runChecks(createAudio, { log = () => {} } = {}) {
  const checks = [];
  const add = (id, name, pass, value) => { checks.push({ id, name, pass: !!pass, value }); log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}: ${JSON.stringify(value)}`); };
  const renders = {};
  const scs = [...SCENARIOS, await geometryScenario()];
  for (const sc of scs) {
    const r = await render(sc, { createAudio, kind: 'new' });
    renders[sc.id] = { sc, ...r, metrics: metrics(r.buffer, { samples: r.samples, debug: r.debug }) };
    add(`render ${sc.id}`, sc.name, r.debug.errors === 0, { errors: r.debug.errors, maxVoices: renders[sc.id].metrics.maxVoices });
  }

  // Scenario 2 (and 10a): the danger curve, the hit pattern and the spectrum.
  for (const id of ['2', '10a']) {
    const { sc, samples, trace, buffer } = renders[id];
    const m = sc.marks;
    const tense = samples.find((s) => s.t >= m.t0 && s.state >= 1);
    const rise = tense ? tense.t - m.t0 : Infinity;
    const back = samples.find((s) => s.t >= m.t1 && s.danger < 0.25);
    const release = back ? back.t - m.t1 : Infinity;
    const steps = finalSteps(trace);
    const per = (a, b) => { const e = steps.filter((x) => x.t >= a && x.t < b); const n = (h) => e.filter((x) => x.hits.split(' ').includes(h)).length; return { hat16: n('hat16'), rub: n('rub'), gesture: n('gesture'), kick: n('kick') + n('kickAcc') }; };
    const safe = per(m.safeA[0] + m.bar, m.safeA[1]), tight = per(m.tight[0] + m.bar, m.tight[1]);
    const bs = bands(buffer, m.safeA[0] + m.bar, m.safeA[1]), bt = bands(buffer, m.tight[0] + m.bar, m.tight[1]);
    const ls = loudness(buffer, m.safeA[0] + m.bar, m.safeA[1]), lt = loudness(buffer, m.tight[0] + m.bar, m.tight[1]);
    const lb = loudness(buffer, m.safeB[0] + m.bar, m.safeB[1]);
    if (id === '2') {
      add('4.3 s2 rise', 'smoothed danger tense within 250 ms of the constraint', rise <= 0.25, { seconds: r2(rise) });
      add('4.3 s2 release', 'back under 0.25 within 1.5 s after it clears', release <= 1.5, { seconds: r2(release) });
      add('4.3 s2 pattern', 'constrained bars differ in hit pattern', tight.hat16 > safe.hat16 || tight.rub > safe.rub, { safe, tight });
      add('4.3 s2 spectrum', 'constrained bars differ in spectrum (band shares, points)', Math.max(...bs.map((x, i) => Math.abs(x - bt[i]))) * 100 >= 1, { safe: bs.map((x) => r2(100 * x)), tight: bt.map((x) => r2(100 * x)) });
      add('4.3 s2 loudness', 'at nearly the same loudness (within 1.5 dB)', Math.abs(lt - ls) <= 1.5, { safe: r2(ls), tight: r2(lt), safeAfter: r2(lb) });
    } else {
      add('4.3 s10a', 'calmer sound: the same constraint stays calm in pattern', tight.hat16 <= safe.hat16 + 2 && tight.rub === 0, { safe, tight, loudSafe: r2(ls), loudTight: r2(lt) });
    }
  }

  // Scenario 1: by the second bar in Arcade the plan holds pulse, anchor and gesture.
  {
    const { sc, trace } = renders['1'];
    const t0 = sc.marks.arcade[0];
    const bar = (4 * 60) / bpmAt(1);
    const e = finalSteps(trace).filter((x) => x.id === 'arcade' && x.t >= t0 + bar && x.t < t0 + 2 * bar);
    const all = e.flatMap((x) => x.hits.split(' '));
    add('4.3 s1', 'second bar in Arcade holds pulse, anchor and gesture', all.includes('kick') && all.includes('bass') && all.includes('gesture'), { hits: [...new Set(all)].sort() });
  }

  // Scenarios 3 and 4: no gap, no sub drop, the kick grid unbroken.
  for (const id of ['3', '4']) {
    const { trace, debug, sc } = renders[id];
    const kinds = bitesOf(trace).map((b) => b.bite);
    // Every step where the world's own pattern has a kick (Hangar and Court: 1 and 3 at level 0).
    const steps = finalSteps(trace).filter((x) => {
      if (x.t < 1.5 || x.t >= sc.dur - 0.5 || x.id === 'lcd') return false;
      const p = arrangement(x.id, levelOf(paceOf({ stepMs: stepMsFor(25), score: 25, length: 28 })));
      const w = p.world, v = p.halfTime ? x.step / 2 : x.step;
      const kicks = p.level >= 1 && w.kickL1 ? [...w.kick, ...w.kickL1] : w.kick;
      return Number.isInteger(v) && kicks.includes(v % 16);
    });
    const missing = steps.filter((x) => !/kick/.test(x.hits)).map((x) => `${x.id}:${x.step}`);
    add(`4.3 s${id} gaps`, id === '3' ? 'rapid bites: no vacuum, no impact' : 'held bites: no vacuum, no impact', debug.gaps === 0 && !kinds.includes('major'), { gaps: debug.gaps, kinds: [...new Set(kinds)] });
    add(`4.3 s${id} grid`, 'kick on every beat', missing.length === 0, { beats: steps.length, missing });
  }

  // Scenario 5: majors are audibly different from changes, and never closer than the cooldown.
  // The gap is measured twice: in the full render, and with the bite voices left out (the music gap).
  {
    const { trace, buffer, sc } = renders['5'];
    const dry = await render(sc, { createAudio, kind: 'new', mute: new Set(['bite']) });
    const bs = bitesOf(trace);
    // Windows: inside the shortest gap (a level-3 stutter is three quarters of a sixteenth), and after it.
    const six = 60 / bpmAt(30) / 4;
    const row = (buf, b) => ({ kind: b.bite, beat: b.beat, gap: rmsDb(buf, b.t + 0.01, b.t + 0.75 * six - 0.008), before: rmsDb(buf, b.t - 0.25, b.t - 0.01), impact: rmsDb(buf, b.t + six, b.t + six + 0.3) });
    const diff = (buf) => {
      const rows = bs.map((b) => row(buf, b));
      const maj = rows.filter((r) => r.kind === 'major'), chg = rows.filter((r) => r.kind === 'change');
      return { maj, chg, gap: mean(maj.map((r) => r.gap - r.before)) - mean(chg.map((r) => r.gap - r.before)), impact: mean(maj.map((r) => r.impact)) - mean(chg.map((r) => r.impact)) };
    };
    const full = diff(buffer), music = diff(dry.buffer);
    const maj = full.maj;
    let minBeats = Infinity;
    for (let i = 1; i < maj.length; i++) minBeats = Math.min(minBeats, maj[i].beat - maj[i - 1].beat);
    add('4.3 s5 gap', 'a major leaves a gap in the music an ordinary change does not (dB, major minus change, bite voices left out)', music.gap <= -6, { musicGapDb: r2(music.gap), fullRenderGapDb: r2(full.gap), majors: maj.length, changes: full.chg.length });
    add('4.3 s5 impact', 'impact energy after a major is higher (dB, full render)', full.impact >= 1, { impactDb: r2(full.impact) });
    add('4.3 s5 cooldown', 'two majors never closer than the cooldown (beats)', minBeats >= 16 - 1e-6, { minBeats: r2(minBeats) });
    const r10 = renders['10b'];
    add('4.3 s10b', 'calmer sound: no majors', !bitesOf(r10.trace).some((b) => b.bite === 'major'), { kinds: [...new Set(bitesOf(r10.trace).map((b) => b.bite))] });
  }

  // Scenario 7: the return to LCD cuts music and wet returns within 40 ms (bite voices left out).
  {
    const { sc, trace } = renders['7'];
    const dry = await render(sc, { createAudio, kind: 'new', mute: new Set(['bite']) });
    const b = bitesOf(trace).find((x) => x.bite === 'lcd');
    const before = rmsDb(dry.buffer, b.t - 0.3, b.t - 0.01), after = rmsDb(dry.buffer, b.t + 0.045, b.t + 0.1);
    add('extra s7 lcd', 'return to LCD: music and wet down by at least 30 dB within 45 ms', after - before <= -30, { beforeDb: r2(before), afterDb: r2(after) });
    const ab = bitesOf(trace).find((x) => x.bite === 'abyss');
    add('extra s7 abyss', 'Abyss entry is a soft bloom (no vacuum)', !!ab && renders['7'].debug.gaps === 0, { kind: ab && ab.bite, gaps: renders['7'].debug.gaps });
  }
  // Scenario 9: pause and mute are silent.
  {
    const { sc, buffer } = renders['9'];
    const p = rmsDb(buffer, sc.marks.paused[0] + 0.3, sc.marks.paused[1]), m = rmsDb(buffer, sc.marks.muted[0] + 0.1, sc.marks.muted[1]);
    add('extra s9', 'paused and muted stretches are silent (dBFS)', p < -50 && m < -60, { pausedDb: r2(p), mutedDb: r2(m) });
  }

  // Scenario 11: pressure from real sim geometry, through the engine's envelope.
  {
    const { sc, samples } = renders['11'];
    const res = {};
    for (const c of sc.curves) {
      const t1 = c.points.at(-1).t;
      const sm = samples.filter((x) => x.t >= c.t0 && x.t <= t1 + 0.25);
      res[c.name] = { rawMax: r2(Math.max(...c.points.map((p) => p.danger))), smoothedMax: r2(Math.max(...sm.map((x) => x.danger))), state: Math.max(...sm.map((x) => x.state)) };
    }
    const g = (k) => res[k] || { rawMax: NaN, state: NaN };
    add('4.3 s11 wall-parallel', 'safe movement along a wall stays calm', g('wall-parallel (box)').state === 0 && g('wall-parallel (box)').rawMax <= 0.15, g('wall-parallel (box)'));
    add('4.3 s11 wall approach', 'heading at a wall in the open stays at or below 0.4, not tense', g('wall approach (box)').rawMax <= 0.4 && g('wall approach (box)').state === 0, g('wall approach (box)'));
    add('4.3 s11 corridor', 'a one-cell corridor turns tense', g('corridor (box)').state >= 1, g('corridor (box)'));
    add('4.3 s11 lane', 'lane travel: no wall ahead, ever', g('lane travel').rawMax === 0, g('lane travel'));
    add('4.3 s11 cube', 'a cube seam is not a wall', g('cube seam').rawMax === 0, g('cube seam'));
  }

  // Scenario 6: stable loudness over a long fast run; the clipper is protection only.
  {
    const { buffer } = renders['6'];
    const a = loudness(buffer, 0, 30), b = loudness(buffer, 60, 90);
    const m = renders['6'].metrics;
    add('4.3 s6 loudness', 'last 30 s within 1.5 dB of the first 30 s', Math.abs(b - a) <= 1.5, { first: r2(a), last: r2(b) });
    add('4.3 s6 clipper', 'under 1% of samples above the knee (0.7), peak under 0.98', m.hotPct < 1 && m.peak < 0.98, { hotPct: m.hotPct, peak: m.peak });
  }
  let hot = 0, peak = 0;
  for (const r of Object.values(renders)) { hot = Math.max(hot, r.metrics.hotPct); peak = Math.max(peak, r.metrics.peak); }
  add('4.3 all clipper', 'every scenario: under 1% above the knee, peak under 0.98', hot < 1 && peak < 0.98, { worstHotPct: hot, worstPeak: peak });

  const rows = Object.values(renders).map((r) => ({ id: r.sc.id, name: r.sc.name, ...r.metrics }));
  return { rows, checks, renders };
}
