// Shared constants and URL options. Pure: no DOM access here.

export const GRID = Object.freeze({ cols: 16, rows: 16 });

// Starting values only (plan section 1). Same curve in every timeline.
export const SPEED = Object.freeze({ startMs: 150, rampMs: 1.5, capMs: 95 });

// Flat timelines (2D looks) the registry tries to load. Missing ones are skipped.
export const FLAT_IDS = Object.freeze([
  'lcd', 'arcade', 'acid', 'kombat', 'desktop', 'timewarp', 'wrong',
  'lane', 'hangar', 'mushroom', 'castle', 'abyss',
]);

// Room modules (3D looks). The engine has its own ROOM_IDS; this list is for metas and life() icons,
// which load without WebGL.
export const ROOM_IDS = Object.freeze(['court', 'disco', 'plastic', 'bunker', 'lane', 'hangar', 'mushroom', 'castle', 'abyss']);

// The four rooms built before LEVELS_PLAN: board view by default, the 2D perspective stand-in without WebGL.
export const OLD_ROOMS = Object.freeze(['court', 'disco', 'plastic', 'bunker']);

// Rare timelines: low weight, never in the opening, held for only one or two bites (rules: flow.js).
export const RARE = Object.freeze(['timewarp', 'wrong']);

// Calm universes (LEVELS_PLAN 4.1): no inversion, strobe, glitch or colour split; beat pulse capped.
export const CALM = Object.freeze(['lcd', 'abyss']);

// Universes without a first-person look.
export const NO_POV = Object.freeze(['castle']);

// Fallback brightness per timeline when a module's meta has none (section 4.1).
export const LUMA = Object.freeze({
  lcd: 0.6, arcade: 0.08, court: 0.25, acid: 0.7, disco: 0.35, kombat: 0.2,
  plastic: 0.65, bunker: 0.06, timewarp: 0.45, wrong: 0.4, desktop: 0.45,
  lane: 0.7, hangar: 0.5, mushroom: 0.22, castle: 0.6, abyss: 0.12,
});

export const PHRASES = Object.freeze([
  'TIME BREAK!', 'REALITY ERROR', 'WRONG DECADE', 'NO EXIT', 'INSERT COIN',
]);

// Presentation only. Universe selection moved to the rules (rules-config.js FLOW).
export const DIRECTOR = Object.freeze({
  chaosScore: 25,          // chaos = clamp(score / 25, 0, 1)
  swingLuma: 0.3,          // a luma difference above this is a brightness swing
  veilMs: 450,             // reduced flash: every shift is a veiled fade this long
  veilFrom: 0.55,
  veilGapMs: 3500,         // reduced flash: shifts closer than this keep the veil partly up
  veilHold: 0.35,          //   extra veil carried into the next shift at most
  flatChance: 0.4,         // new universes (2D and room) pick the 2D look this often
  povMinScore: 4,          // no first person before the fourth food
  lifeLostInvertMs: 90,
  invertMinMs: 60,         // wild: bite impact inversion
  invertMaxMs: 90,
  strobeWindowMs: 400,     // wild: bursts, not drones
  strobeMin: 3,
  strobeMax: 6,
  povTimeoutMs: 12000,
  povClearCells: 4,
  phraseMs: 1000,
  povWeightFactor: 0.45,   // first person is picked this often relative to the board view
  strobeBase: 0.08,        // strobe burst chance on a shift: base + chaos * strobeChaos
  strobeChaos: 0.5,
});

export const FX = Object.freeze({
  reducedMotionTime: 0.15, // animation time runs at 15% under reduced motion
  reducedFlashBeat: 0.15,  // beat pulse capped to 15% under reduced flash
  calmBeat: 0.15,          // and in calm universes (lcd, abyss)
  punchMs: 300,
});

export const STORAGE_KEY = 'snake-shift/v1';

// URL parameters that make a run practice (LEADERBOARD_PLAN A9): never ranked, own local best.
// Checked by raw presence, not by parsed value: `?seed=` or `?start=abc` change nothing in play,
// but any attempted override counts. `nogl` is not here: it changes the rendering only.
export const PRACTICE_PARAMS = Object.freeze([
  'auto', 'debug', 'seed', 'start', 'ramp', 'cap',
  'universe', 'scene', 'lock', 'look', 'score', 'lives',
]);

/** The practice parameters present in a location.search string, in PRACTICE_PARAMS order. */
export function practiceParams(search = '') {
  let p;
  try { p = new URLSearchParams(search); } catch { return []; }
  return PRACTICE_PARAMS.filter((k) => p.has(k));
}

function num(params, key, fallback) {
  if (!params.has(key)) return fallback;
  const v = Number(params.get(key));
  return Number.isFinite(v) ? v : fallback;
}

const LOOKS = ['2d', '3d', 'pov'];

/**
 * Parse the debug switches (BUILD_PLAN 9, LEVELS_PLAN 4.6) from a location.search string.
 * The new switches (universe, lock, look, score, lives) work only together with `?debug`,
 * so a player can never use them to choose a universe or a look.
 */
export function parseOptions(search = '') {
  const p = new URLSearchParams(search);
  const seedRaw = p.get('seed');
  const debug = p.has('debug');
  const universe = debug ? (p.get('universe') || p.get('scene') || '').replace(/-(pov|3d|2d)$/, '') || null : null;
  const look = debug && LOOKS.includes(p.get('look')) ? p.get('look') : null;
  const int = (key, lo, hi) => {
    if (!debug || !p.has(key)) return null;
    const v = Math.floor(Number(p.get(key)));
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;
  };
  return {
    debug,
    auto: p.has('auto'),
    universe,
    lock: debug && p.has('lock') && !!universe,
    look,
    score: int('score', 0, 9999),
    lives: int('lives', 1, 5),
    seed: seedRaw !== null && seedRaw !== '' ? seedRaw : null,
    nogl: p.has('nogl'),
    speed: {
      startMs: num(p, 'start', SPEED.startMs),
      rampMs: num(p, 'ramp', SPEED.rampMs),
      capMs: num(p, 'cap', SPEED.capMs),
    },
  };
}
