// SNAKE//SHIFT — pure music decisions (SOUND_PLAN 2). No Web Audio here; audio.js plays the answers.
//
// Three signals: pace (long-term, from the step interval), danger (short-term, from the board) and
// world (the universe). Pace sets tempo and level; the world sets instruments, mode, gesture and a
// level cap; danger speaks through at most four roles (pulse subdivision, thinning, tone, rub).
//
// One motif runs through every world: hits on sixteenths 0 3 6 | 8 11 14, contour in mode steps
// 0 2 1 | 4 2 0 (degrees 1 3 2 | 5 3 1). Half a bar carries it, so a world entered mid-bar is known.

export const TIMELINE_IDS = ['lcd', 'acid', 'disco', 'arcade', 'kombat', 'plastic', 'bunker', 'court', 'timewarp', 'wrong', 'desktop', 'lane', 'hangar', 'mushroom', 'castle', 'abyss'];
export const UNIVERSE_IDS = TIMELINE_IDS;
export const NEW_IDS = ['lane', 'hangar', 'mushroom', 'castle', 'abyss'];
export const LOOKS = ['2d', '3d', 'pov'];

export const ROOT = 45; // A2
export const PROG = [0, 0, -4, -2]; // bar roots: A A F G
export const TEMPO = Object.freeze({ min: 118, span: 20 }); // 118 → 138 BPM
export const LEVEL_EDGES = Object.freeze([0.15, 0.45, 0.8]); // pace → level 0..3
export const MUSIC_GAIN = Object.freeze({ base: 0.5, rangeDb: 1.5 });
export const MOTIF = Object.freeze({ steps: Object.freeze([0, 3, 6, 8, 11, 14]), degrees: Object.freeze([0, 2, 1, 4, 2, 0]) });
export const DANGER = Object.freeze({ attack: 0.07, release: 0.5, tenseOn: 0.4, tenseOff: 0.25, critOn: 0.75, critOff: 0.55, reducedDepth: 0.33, levelDb: 0.75 });
// At most one major per four-bar phrase (the plan said 8 beats; at a human bite rate that made
// most changes majors), and none within 2 beats of the last bite.
export const COOLDOWN = Object.freeze({ majorBeats: 16, biteBeats: 2 });
export const ANTIC = Object.freeze({ quiet: 4, peak: 12, settle: 16, rest: 0.35, swell: 0.6, swellBeats: 8 });

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const num = (x, d) => (x != null && Number.isFinite(Number(x)) ? Number(x) : d);

/** Normalise a universe id: '-pov'/'-3d'/'-2d' suffix stripped, unknown → 'arcade'. */
export function universeId(id) {
  const s = String(id ?? '').replace(/-(pov|3d|2d)$/, '');
  return TIMELINE_IDS.includes(s) ? s : 'arcade';
}

// ---- pace, tempo, level -----------------------------------------------------------------

/**
 * Pace 0..1 from the step interval within the configured speed range (debug overrides included),
 * with score and length as support. Score only matters when the speed curve is flat.
 */
export function paceOf({ stepMs, startMs = 150, capMs = 95, score = 0, length = 3 } = {}) {
  const st = num(startMs, 150), cap = num(capMs, 95), ms = num(stepMs, st);
  const speed = st <= cap ? 1 : clamp01((st - ms) / (st - cap));
  return clamp01(0.9 * Math.max(speed, 0.6 * clamp01(num(score, 0) / 50)) + 0.1 * clamp01(num(length, 3) / 40));
}
export const tempoOf = (pace) => TEMPO.min + TEMPO.span * clamp01(pace);
export function levelOf(pace) {
  const p = clamp01(pace);
  return p < LEVEL_EDGES[0] ? 0 : p < LEVEL_EDGES[1] ? 1 : p < LEVEL_EDGES[2] ? 2 : 3;
}
/** Music bus level: at most +1.5 dB from pace 0 to 1. Intensity comes from the arrangement. */
export const musicGainOf = (pace) => MUSIC_GAIN.base * Math.pow(10, (MUSIC_GAIN.rangeDb * clamp01(pace)) / 20);

// ---- worlds -------------------------------------------------------------------------------

const _ = null;
const K4 = [0, 4, 8, 12];
const OFF8 = [2, 6, 10, 14];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
// Motif hit → motif index, on a 16-step bar.
const G = [0, _, _, 1, _, _, 2, _, 3, _, _, 4, _, _, 5, _];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];

/**
 * World table. Steps are sixteenths of a 16-step bar unless a cycle says otherwise.
 * policy: parallel (moves with the bar root) | diatonic (bass follows the root, melody snaps to the
 * bar's chord) | pedal (everything on A). third: 3 or 4, the third of the A chord.
 * bass: [level 0, level 1+] patterns of semitones above the root (null = rest); length = cycle.
 * gesture: { map: motif index per step (length = cycle), l0: steps allowed at level 0, l1: at level 1 }.
 * danger: which roles speak (sub16, bass16, bassUp, gestureUp, perc16, rub, ostinato, offbeat, grace, wide, tone).
 */
export const WORLDS = Object.freeze({
  lcd: { policy: 'pedal', mode: [0, 2, 4, 7, 9], third: 4, cap: 0, calm: true, clicks: true },
  arcade: {
    policy: 'parallel', mode: MAJOR, third: 4, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 0, snare: [4, 12],
    bass: [[0, _, _, 12, _, _, 7, _, 0, _, _, 12, _, _, 7, _], [0, _, 0, 12, _, 0, 7, _, 0, _, 0, 12, _, 0, 7, 5]],
    bass16: [0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7],
    gesture: { map: G }, orn: [1, 4, 7, 9, 12, 15], perc: { steps: [5, 13] },
    danger: { sub16: true, bass16: true, gestureUp: 12, rub: true, tone: 'gesture' },
  },
  mushroom: {
    policy: 'parallel', mode: [0, 2, 4, 7, 9], third: 4, cap: 3, swing: 0.3,
    kick: K4, hat: OFF8, hatFrom: 1, snare: [4, 12],
    bass: [[0, _, _, _, 7, _, 12, _, 0, _, _, _, 7, _, 4, _], [0, _, 12, _, 7, _, 12, _, 0, _, 12, _, 7, _, 4, _]],
    bass16: [0, 12, 0, 12, 7, 12, 7, 12, 0, 12, 0, 12, 7, 12, 4, 12],
    gesture: { map: G, l0: [8, 11, 14], l1: [8, 11, 14] }, orn: [15], perc: { steps: [2, 10] },
    danger: { sub16: true, bass16: true, grace: true, tone: 'gesture' },
  },
  bunker: {
    policy: 'pedal', mode: [0, 1, 3, 5, 6, 8, 10], third: 3, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 1, snare: [4, 12], snareFrom: 2,
    bass: [[_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _], [_, _, 0, 0, _, _, 0, 0, _, _, 0, 0, _, _, 0, 1]],
    gesture: { map: G }, orn: [5, 13], perc: { steps: [10] },
    danger: { sub16: true, rub: true, tone: 'bass', thin: true },
  },
  acid: {
    policy: 'parallel', mode: [0, 2, 3, 5, 7, 9, 10], third: 3, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 1, snare: [4, 12],
    bass: [[0, _, _, 3, _, _, 2, _, 7, _, _, 3, _, _, 0, _], [0, 0, 12, 3, _, 0, 2, 12, 7, _, 0, 3, 12, _, 0, 10]],
    gesture: { map: G, l0: [3, 11], l1: [3, 11] }, perc: { steps: [7, 10, 15] },
    danger: { sub16: true, tone: 'bass' },
  },
  lane: {
    policy: 'pedal', mode: [0, 1, 4, 5, 7, 8, 10], third: 4, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 1, snare: [12], drone: true,
    bass: [[], [0, _, 12, _, 1, _, _, 13, 0, _, 7, _, 0, _, _, 10]],
    gesture: { map: G },
    // A seven-step tabla cycle against the sixteen-step bar: hypnotic phasing. Part of the pulse.
    perc: { steps: [0, 3, 5], cycle: 7, from: 0, dense: [0, 2, 3, 5, 6] },
    danger: { perc16: true, wide: true, tone: 'gesture' },
  },
  disco: {
    policy: 'diatonic', mode: AEOLIAN, third: 3, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 0, snare: [4, 12],
    bass: [[0, _, 12, _, 0, _, 12, _, 0, _, _, 12, _, _, 12, _], [0, _, 12, _, 0, _, 12, _, 0, _, 12, 12, _, 7, 12, _]],
    gesture: { map: G, l0: [3, 11], l1: [3, 6, 11, 14] }, perc: { steps: [7, 10, 15] },
    danger: { sub16: true, bassUp: true, tone: 'gesture' },
  },
  kombat: {
    policy: 'diatonic', mode: [0, 1, 3, 5, 7, 8, 10], third: 3, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 1, snare: [4, 12], snareFrom: 0, fillFrom: 1,
    bass: [[0, _, _, 0, _, _, 0, _, _, _, _, _, _, _, _, _], [0, _, _, 0, _, _, 0, _, _, _, 3, _, 5, _, 3, _]],
    gesture: { map: [0, _, _, _, _, _, 2, _, _, _, _, 4, _, _, _, _] }, perc: { steps: [7, 15], dense: [3, 7, 11, 15] },
    danger: { perc16: true, rub: true, tone: 'gesture' },
  },
  court: {
    policy: 'diatonic', mode: [0, 2, 4, 7, 9], third: 4, cap: 3,
    kick: [0, 8], kickL1: [4, 12], hat: OFF8, hatFrom: 1, snare: [12],
    bass: [[0, _, _, _, _, _, 7, _, _, _, _, _, 4, _, _, _], [0, _, _, _, _, _, 7, _, _, _, _, _, 4, _, 12, _]],
    // The motif at half speed over two bars: call in the first, answer in the second.
    gesture: { map: [0, _, _, _, _, _, 1, _, _, _, _, _, 2, _, _, _, 3, _, _, _, _, _, 4, _, _, _, _, _, 5, _, _, _] },
    perc: { steps: [10] },
    danger: { ostinato: true, tone: 'gesture' },
  },
  plastic: {
    policy: 'parallel', mode: [0, 2, 4, 6, 7, 9, 11], third: 4, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 0, snare: [4, 12],
    bass: [[0, _, _, _, _, _, 7, _, 0, _, _, _, _, _, _, _], [0, _, _, 7, _, _, 12, _, 0, _, _, 7, _, 11, _, _]],
    gesture: { map: G }, perc: { steps: [5, 13] },
    danger: { offbeat: true, sub16: true, tone: 'gesture' },
  },
  desktop: {
    policy: 'parallel', mode: MAJOR, third: 4, cap: 3,
    kick: K4, hat: EIGHTHS, hatFrom: 0, snare: [4, 12],
    bass: [[0, _, _, _, _, _, _, _, 0, _, _, _, _, _, _, _], [0, _, _, _, 7, _, _, _, 0, _, _, _, 4, _, 7, _]],
    // A two-note system chime, the motif's falling tail, once a bar.
    gesture: { map: [_, _, _, _, _, _, _, _, _, _, _, 4, _, _, 5, _] }, perc: { steps: [7, 15] },
    danger: { sub16: true, rub: true, tone: 'gesture' },
  },
  hangar: {
    policy: 'diatonic', mode: AEOLIAN, third: 3, cap: 3,
    kick: [0, 8], hat: OFF8, hatFrom: 1, snare: [4, 12], snareFrom: 0,
    bass: [[0, _, _, _, 7, _, _, _, 0, _, _, _, 7, _, _, _], [0, _, _, _, 7, _, _, _, 0, _, _, 0, 7, _, 5, _]],
    gesture: { map: [0, _, _, _, _, _, 2, _, _, _, _, 4, _, _, _, _] }, orn: [0], perc: { steps: [14], everyOther: true, from: 1 },
    danger: { sub16: true, gestureStep: 2, tone: 'gesture' },
  },
  abyss: {
    policy: 'diatonic', mode: [0, 2, 3, 7, 8], third: 3, cap: 2, halfTime: true, soft: true, no16: true, noFill: true,
    kick: [0, 8], hat: [], snare: [4, 12], pad: true,
    bass: [[], [0, _, _, _, _, _, _, _, -5, _, _, _, _, _, _, _]],
    gesture: { map: G }, orn: [10], perc: { steps: [6, 13] },
    danger: { padRub: true },
  },
  castle: {
    policy: 'parallel', mode: MAJOR, third: 4, cap: 3, swing: 0.12,
    kick: K4, hat: OFF8, hatFrom: 1, snare: [4, 12],
    bass: [[0, _, _, _, 7, _, _, _, 7, _, _, _], [0, _, _, _, 7, _, _, _, 12, _, 7, _]],
    // Music box: the contour in three, one note per eighth of a 12-step (three-four) cycle.
    gesture: { map: [0, _, 1, _, 2, _, 3, _, 4, _, 5, _] }, orn: [0], perc: { steps: [3, 9], cycle: 12 },
    danger: { grace: true, tone: 'gesture' },
  },
  timewarp: {
    policy: 'pedal', mode: [0, 2, 4, 6, 8, 10], third: 4, cap: 3,
    kick: K4, hat: OFF8, hatFrom: 1, snare: [4, 12],
    bass: [[0, _, _, _, 6, _, _, _, 0, _, _, _, 10, _, _, _], [0, _, 6, _, 0, _, 10, _, 0, _, 6, _, 12, _, 8, _]],
    // The motif backwards: mirrored in time, contour reversed.
    gesture: { map: [_, 5, _, _, 4, _, _, 3, _, 2, _, _, 1, _, _, 0] }, perc: { steps: [7] },
    danger: { glideWide: true, sub16: true, tone: 'bass' },
  },
  wrong: { policy: 'parallel', mode: [0, 1, 4, 6, 7, 10, 11], third: 4, cap: 3, mix: true },
});

/** Worlds that 'wrong' borrows from (half-time and silence do not mix into a four-four bar). */
export const WRONG_POOL = TIMELINE_IDS.filter((k) => !['wrong', 'lcd', 'abyss'].includes(k));

/**
 * What plays in a world at a level: { id, level, halfTime, calm, soft, roles, world }.
 * Level is capped per world. roles lists what level 0.. adds, for the harness and tests.
 */
export function arrangement(id, level = 0, { reduced = false } = {}) {
  const u = universeId(id);
  const w = WORLDS[u];
  const lv = Math.min(w.cap, Math.max(0, Math.floor(num(level, 0))));
  if (w.clicks) return { id: u, level: 0, halfTime: false, calm: true, soft: true, reduced, roles: ['clicks'], world: w };
  const roles = ['pulse', 'anchor', 'gesture'];
  if (lv >= 1) roles.push('backbeat', 'bassFull');
  if (lv >= 2) roles.push(w.no16 ? 'calls' : 'sixteenths', 'perc');
  if (lv >= 3) roles.push('open', 'pump', ...(w.noFill ? [] : ['fills']), 'sections');
  return { id: u, level: lv, halfTime: !!w.halfTime, calm: u === 'abyss', soft: !!w.soft, reduced, mix: !!w.mix, roles, world: w };
}

/** Eight-bar section cycle once the level is 3: full, stripped (bass exposed), full, percussion forward. */
export function sectionOf(bar, level) {
  if (level < 3) return 'full';
  const b = ((Math.floor(num(bar, 0)) % 8) + 8) % 8;
  return b < 2 ? 'full' : b < 4 ? 'strip' : b < 6 ? 'full' : 'perc';
}

/** Motif index at grid position v (on the world's gesture cycle), or -1. */
export function gestureIndex(plan, v, level = plan.level) {
  const g = plan.world.gesture;
  if (!g) return -1;
  const c = v % g.map.length;
  const i = g.map[c];
  if (i == null) return -1;
  const s = v % 16;
  const allow = level >= 2 ? null : level === 1 ? g.l1 || g.l0 : g.l0;
  if (allow && !allow.includes(g.map.length === 16 ? s : c)) return -1;
  return i;
}

/** Bass pattern entry at grid position v (semitones above the bar root), or null. */
export function bassAt(plan, v, { tense = false } = {}) {
  const w = plan.world;
  if (!w.bass) return null;
  const pat = tense && w.danger && w.danger.bass16 && w.bass16 ? w.bass16 : w.bass[plan.level >= 1 ? 1 : 0];
  if (!pat || !pat.length) return null;
  return pat[v % pat.length] ?? null;
}

/**
 * Hits on one sixteenth step (global index) for a plan.
 * o: { state 0|1|2 (danger: calm, tense, critical), antic 0..1, waiting, heart, nerve, accent, resolve }.
 * Half-time plans play on a virtual grid of half the speed (heart and nerve stay on the real grid).
 */
export function stepHits(step, plan, o = {}) {
  const hits = [];
  let v = Math.floor(Number(step));
  if (!plan || !plan.world || !(v >= 0)) return hits;
  const real = v % 16;
  const realBar = Math.floor(v / 16);
  if (o.heart && real === 14) hits.push('heart');
  if (o.nerve && real === 0 && realBar % 2 === 1 && !o.waiting) hits.push('nerve');
  const w = plan.world;
  if (w.mix) return hits; // 'wrong' borrows another world's plan per bar (audio.js)
  if (w.clicks) {
    if (real % 4 === 0) hits.push('click');
    return hits;
  }
  if (plan.halfTime) {
    if (v % 2) return hits;
    v /= 2;
  }
  const s = v % 16;
  const bar = Math.floor(v / 16);
  const L = plan.level;
  const d = w.danger || {};
  const state = o.waiting ? 0 : Math.max(0, Math.min(2, Math.floor(num(o.state, 0))));
  const tense = state >= 1, critical = state >= 2;
  const antic = o.waiting ? 0 : clamp01(o.antic);
  const section = sectionOf(bar, L);
  const phraseEnd = bar % 4 === 3;

  // Pulse. Subtraction: at a phrase end with high anticipation, one kick drops out and the next downbeat lands harder.
  const kicks = L >= 1 && w.kickL1 ? [...w.kick, ...w.kickL1] : w.kick;
  if (kicks.includes(s)) {
    const drop = !o.waiting && phraseEnd && s === 12 && antic >= 0.6;
    const accent = !!o.accent || (s === 0 && bar % 4 === 0 && antic >= 0.6); // o.accent: the first kick after a respawn
    if (!drop) hits.push(accent ? 'kickAcc' : 'kick');
  }
  if (w.drone && s === 0) hits.push('drone');
  if (w.pad && s === 0) hits.push('pad');
  const b = bassAt(plan, v, { tense });
  if (b != null) hits.push('bass');
  if (o.waiting) return hits;

  if (w.hat.includes(s) && L >= (w.hatFrom ?? 1)) hits.push('hat');
  const sixteenths = !w.no16 && s % 2 === 1 && ((L >= 2 && section !== 'strip') || (tense && d.sub16));
  if (sixteenths) hits.push('hat16');
  if (w.snare.includes(s) && L >= (w.snareFrom ?? 1) && section !== 'strip') hits.push('snare');
  if (tense && d.ostinato && s % 2 === 0 && !kicks.includes(s)) hits.push('ost');

  // Gesture: thins when tense (no ornaments), drops when critical so pulse and bass stand exposed.
  // A stripped bar keeps it (the world stays known) and loses snare, sixteenths, ornaments and perc.
  if (!critical) {
    let gv = v;
    if (tense && d.offbeat) gv = v - 1;
    if (gv >= 0 && gestureIndex(plan, gv) >= 0) hits.push('gesture');
    if (!tense && L >= 2 && section === 'full' && w.orn && w.orn.includes(s)) hits.push('orn');
  }

  // Second percussion (part of the pulse where the world says so).
  const p = w.perc;
  if (p && L >= (p.from ?? 2) && section !== 'strip') {
    const cyc = p.cycle || 16;
    const steps = (tense && d.perc16 && p.dense) || (section === 'perc' && p.dense) || p.steps;
    const pos = v % cyc;
    if (steps.includes(pos) && (!p.everyOther || bar % 2 === 1)) hits.push('perc');
  }
  if (L >= (w.fillFrom ?? 3) && !w.noFill && !plan.reduced && phraseEnd && s >= 12) hits.push('fill');

  // Danger, critical: a short dissonant ghost that resolves to the root on release.
  if (critical && d.rub && (s === 2 || s === 10)) hits.push('rub');
  if (o.resolve && s % 4 === 0) hits.push('resolve');
  // Anticipation: a short lift in the last beat of the bar, 20 dB under the mix.
  if (!plan.reduced && antic >= 0.5 && s === 12 && !plan.calm) hits.push('lift');
  return hits;
}

// ---- harmony -------------------------------------------------------------------------------

/** Bar root shift (semitones from A) for a world's policy. */
export function barRoot(bar, policy) {
  if (policy === 'pedal') return 0;
  const b = ((Math.floor(num(bar, 0)) % 4) + 4) % 4;
  return PROG[b];
}

/** Pitch classes (0 = A) of the bar's chord: A minor or major (the world's third), F major, G major. */
export function chordOf(bar, third = 3) {
  const b = ((Math.floor(num(bar, 0)) % 4) + 4) % 4;
  if (b === 2) return [8, 0, 3]; // F A C
  if (b === 3) return [10, 2, 5]; // G B D
  return [0, third, 7];
}
const pc = (n) => ((n % 12) + 12) % 12;
/** A note one semitone above a chord tone (minor ninth, eleventh over major) moves down to it. */
export function avoidSnap(note, chord) {
  for (const c of chord) if (pc(note - c) === 1) return note - 1;
  return note;
}
/** Nearest chord tone, preferring the one below. */
export function chordSnap(note, chord) {
  let best = note, bd = 99;
  for (let dn = 0; dn <= 6; dn++) {
    for (const cand of [note - dn, note + dn]) if (chord.includes(pc(cand)) && dn < bd) { best = cand; bd = dn; }
    if (bd < 99) break;
  }
  return best;
}

/** Bars over a borrowed chord (F, G): there the mode's own colour can clash with the bass. */
const borrowedBar = (bar) => {
  const b = ((Math.floor(num(bar, 0)) % 4) + 4) % 4;
  return b >= 2;
};

/**
 * Gesture note for motif index idx in bar `bar` (semitones above A2, before the voice's octave).
 * parallel: the mode planes with the bar root. diatonic: strong hits (idx 0, 3) land on chord tones;
 * over F and G the others avoid minor-ninth clashes (over A the mode is the harmony, so a Phrygian
 * flat second stays). pedal: the mode on A. `up`: mode steps to raise (danger).
 */
export function motifNote(id, idx, bar, { up = 0 } = {}) {
  const w = WORLDS[universeId(id)];
  const m = w.mode;
  const deg = MOTIF.degrees[((idx % 6) + 6) % 6] + up;
  let n = m[deg % m.length] + 12 * Math.floor(deg / m.length);
  if (w.policy === 'parallel') return n + barRoot(bar, 'parallel');
  if (w.policy === 'diatonic') {
    const ch = chordOf(bar, w.third);
    return idx % 3 === 0 ? chordSnap(n, ch) : borrowedBar(bar) ? avoidSnap(n, ch) : n;
  }
  return n;
}

/** Bass note (semitones above A) for a pattern entry x in a bar, by policy. */
export function bassNote(id, x, bar) {
  const w = WORLDS[universeId(id)];
  if (w.policy === 'pedal') return x;
  const r = barRoot(bar, w.policy);
  if (w.policy === 'parallel') return r + x;
  // diatonic: the chord's own third over F and G, then no minor-ninth clashes.
  let y = x;
  const xp = pc(x);
  if (xp === 3 || xp === 4) y = x - xp + (pc(r) === 0 ? w.third : 4);
  return avoidSnap(r + y, chordOf(bar, w.third));
}

// Bite note: walks up the universe's scale with the score (two octaves, then wraps).
const SCALE = {
  lcd: [0, 2, 4, 7, 9], acid: [0, 2, 3, 5, 7, 9, 10], disco: [0, 3, 5, 7, 10], arcade: [0, 2, 4, 5, 7, 9, 11],
  kombat: [0, 1, 3, 5, 7, 8, 10], plastic: [0, 2, 4, 6, 7, 9, 11], bunker: [0, 1, 3, 5, 6, 8, 10], court: [0, 2, 4, 7, 9],
  timewarp: [0, 2, 4, 6, 8, 10], wrong: [0, 1, 4, 6, 7, 10, 11], desktop: [0, 4, 7], lane: [0, 1, 4, 5, 7, 8, 10],
  hangar: [0, 2, 3, 5, 7, 8, 10], mushroom: [0, 2, 4, 7, 9], castle: [0, 2, 4, 5, 7, 9, 11], abyss: [0, 2, 3, 7, 8],
};
const BITE_OCT = { lcd: 36, acid: 24, disco: 12, arcade: 24, kombat: 24, plastic: 36, bunker: 12, court: 24, timewarp: 24, wrong: 24, desktop: 24, lane: 24, hangar: 12, mushroom: 24, castle: 24, abyss: 12 };

/**
 * Bite note (MIDI). The rising walk with the score stays; the bar decides the rest by policy:
 * parallel worlds move it with the bass, diatonic worlds keep it unless it clashes with F or G
 * (then it falls a semitone to the chord tone), pedal worlds stay on A. bar omitted = bar 0.
 */
export function biteMidi(id, score, bar = 0) {
  const u = TIMELINE_IDS.includes(id) ? id : 'arcade';
  const s = SCALE[u];
  const deg = Math.max(0, Math.floor(Number(score) || 0) - 1) % (s.length * 2);
  const base = ROOT + BITE_OCT[u] + s[deg % s.length] + 12 * Math.floor(deg / s.length);
  const w = WORLDS[u];
  if (w.policy === 'parallel') return base + barRoot(bar, 'parallel');
  if (w.policy === 'diatonic') return borrowedBar(bar) ? ROOT + avoidSnap(base - ROOT, chordOf(bar, w.third)) : base;
  return base;
}

// ---- events --------------------------------------------------------------------------------

/**
 * Classify one food event (SOUND_PLAN 2.6). Reads explicit fields, not only from === to.
 * e: { score, from, to, look, prevLook, held, reset, swing, lifeGained }
 * ctx: { beat (beats now), lastBite, lastMajor (beats), reduced, level, rapidCount }
 * → { kind: held|change|major|lcd|abyss, rapid, weight, answer, thump, gap: null|vacuum|stutter, wanted }
 */
export function classifyBite(e = {}, c = {}) {
  const ev = e || {};
  const ctx = c || {};
  const from = universeId(ev.from ?? ev.to);
  const to = universeId(ev.to ?? ev.from);
  const beat = num(ctx.beat, 0);
  const since = beat - num(ctx.lastBite, -Infinity);
  const sinceMajor = beat - num(ctx.lastMajor, -Infinity);
  const rapid = since < COOLDOWN.biteBeats;
  const score = Math.floor(num(ev.score, 0));
  const pov = ev.look === 'pov' && ev.prevLook !== 'pov';
  const wanted = !!ev.swing || pov || (score > 0 && score % 10 === 0);
  let kind;
  if (ev.held || (from === to && !ev.reset)) kind = 'held';
  else if (to === 'lcd') kind = 'lcd';
  else if (to === 'abyss') kind = 'abyss';
  else kind = wanted && !ctx.reduced && sinceMajor >= COOLDOWN.majorBeats && since >= COOLDOWN.biteBeats ? 'major' : 'change';
  const n = Math.max(0, Math.floor(num(ctx.rapidCount, 0)));
  const weight = rapid ? Math.max(0.55, Math.pow(0.85, n + 1)) : 1;
  const changes = kind === 'change' || kind === 'major';
  return {
    kind, from, to, rapid, weight, wanted,
    answer: changes && !rapid,
    thump: kind === 'change' && !rapid,
    gap: kind === 'major' ? (num(ctx.level, 0) >= 3 ? 'stutter' : 'vacuum') : null,
  };
}

/**
 * Anticipation 0..1 by beats since the last bite: zero for 4 beats, up to 1 by beat 12, down to 0.35
 * by beat 16, then a gentle swell to at most 0.6 every 8 beats. LCD none, Abyss half.
 */
export function anticipationAt(beats, id = 'arcade') {
  const b = Number(beats);
  if (!(b >= ANTIC.quiet)) return 0;
  let a;
  if (b < ANTIC.peak) a = (b - ANTIC.quiet) / (ANTIC.peak - ANTIC.quiet);
  else if (b < ANTIC.settle) a = 1 - (1 - ANTIC.rest) * ((b - ANTIC.peak) / (ANTIC.settle - ANTIC.peak));
  else a = ANTIC.rest + (ANTIC.swell - ANTIC.rest) * 0.5 * (1 - Math.cos((2 * Math.PI * (b - ANTIC.settle)) / ANTIC.swellBeats));
  const u = universeId(id);
  return clamp01(a) * (u === 'lcd' ? 0 : u === 'abyss' ? 0.5 : 1);
}

/** Danger envelope step: fast attack, slower release (time constants in seconds). */
export function smoothDanger(prev, raw, dt) {
  const p = clamp01(prev), r = clamp01(raw), t = Math.max(0, num(dt, 0));
  const tau = r > p ? DANGER.attack : DANGER.release;
  return r + (p - r) * Math.exp(-t / tau);
}
/** Danger state with hysteresis: 0 calm, 1 tense (on 0.40, off 0.25), 2 critical (on 0.75, off 0.55). */
export function dangerState(prev, v) {
  const x = clamp01(v);
  const p = Math.floor(num(prev, 0));
  if (x >= DANGER.critOn) return 2;
  if (p >= 2 && x >= DANGER.critOff) return 2;
  if (x >= DANGER.tenseOn) return 1;
  if (p >= 1 && x >= DANGER.tenseOff) return 1;
  return 0;
}

// ---- look and lives ------------------------------------------------------------------------

/** Look on arrival: 3D and first person get a whoosh and a wider echo send; first person a drone. */
export function lookPlan(look) {
  const l = LOOKS.includes(look) ? look : '2d';
  return { look: l, send: l === 'pov' ? 0.22 : l === '3d' ? 0.12 : 0, drone: l === 'pov' ? 0.035 : 0, whoosh: l !== '2d' };
}

// Life gained: an original rising maj9 figure (no borrowed jingle).
export const LIFE_FIGURE = [0, 4, 7, 11, 14, 19];
export function lifeFigure(step = 0.055) {
  const n = LIFE_FIGURE.length;
  return LIFE_FIGURE.map((semi, i) => ({ at: i * step, semi, dur: i === n - 1 ? 0.32 : step * 1.4 }));
}
