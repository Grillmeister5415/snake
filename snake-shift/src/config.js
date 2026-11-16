// Shared constants and URL options. Pure: no DOM access here.

export const GRID = Object.freeze({ cols: 16, rows: 16 });

// Starting values only (plan section 1). Same curve in every timeline.
export const SPEED = Object.freeze({ startMs: 150, rampMs: 1.5, capMs: 95 });

// Modules core tries to load. Missing ones are skipped.
export const FLAT_IDS = Object.freeze(['lcd', 'arcade', 'acid', 'kombat', 'desktop', 'timewarp', 'wrong']);

// Rare timelines: low weight, never in the opening, held for only one or two bites.
export const RARE = Object.freeze(['timewarp', 'wrong']);

// Scripted opening: the first shifts are a clear demonstration (section 4.2).
export const OPENING = Object.freeze(['arcade', 'court', 'court-pov', 'lcd', 'court', 'arcade', 'court-pov']);

// Fallback brightness per timeline when a module's meta has none (section 4.1).
export const LUMA = Object.freeze({
  lcd: 0.6, arcade: 0.08, court: 0.25, acid: 0.7, disco: 0.35, kombat: 0.2,
  plastic: 0.65, bunker: 0.06, timewarp: 0.45, wrong: 0.4, desktop: 0.45,
});

export const PHRASES = Object.freeze([
  'TIME BREAK!', 'REALITY ERROR', 'WRONG DECADE', 'NO EXIT', 'INSERT COIN',
]);

export const DIRECTOR = Object.freeze({
  chaosScore: 25,          // chaos = clamp(score / 25, 0, 1)
  reducedCutGapMs: 3500,   // reduced flash: at most one cut per 3.5 s
  swingLuma: 0.3,          // a luma difference above this is a brightness swing
  swingGapMs: 5000,        // reduced flash: at most one swing per 5 s
  veilMs: 450,             // reduced flash: veil over a big swing
  veilFrom: 0.5,
  invertMinMs: 60,         // wild: bite impact inversion
  invertMaxMs: 90,
  strobeWindowMs: 400,     // wild: bursts, not drones
  strobeMin: 3,
  strobeMax: 6,
  povTimeoutMs: 12000,
  povClearCells: 4,
  phraseMs: 1000,
  povWeightFactor: 0.45,   // pov scene weight relative to its room
  rareWeight: 0.7,         // timewarp / wrong pick weight, times (0.5 + chaos)
  rareMinScore: 4,         // no rare scene before this score
  rareHoldMax: 2,          // a rare scene is held for 1..2 bites (wild); 1 under reduced flash
  recentLen: 3,            // timelines shown in the last N cuts are picked less often
  recentFactor: 0.4,
  freshFactor: 1.6,        // timelines not yet seen this run are picked more often
  resetBase: 0.07,         // Total Reset: silent snap to LCD after a room, timewarp or wrong
  resetChaos: 0.23,        //   chance = resetBase + resetChaos * chaos
});

export const FX = Object.freeze({
  reducedMotionTime: 0.15, // animation time runs at 15% under reduced motion
  reducedFlashBeat: 0.15,  // beat pulse capped to 15% under reduced flash
  punchMs: 300,
});

export const STORAGE_KEY = 'snake-shift/v1';

function num(params, key, fallback) {
  if (!params.has(key)) return fallback;
  const v = Number(params.get(key));
  return Number.isFinite(v) ? v : fallback;
}

/** Parse the debug switches of section 9 from a location.search string. */
export function parseOptions(search = '') {
  const p = new URLSearchParams(search);
  const seedRaw = p.get('seed');
  return {
    debug: p.has('debug'),
    auto: p.has('auto'),
    scene: p.get('scene') || null,
    lock: p.has('lock'),
    seed: seedRaw !== null && seedRaw !== '' ? seedRaw : null,
    nogl: p.has('nogl'),
    speed: {
      startMs: num(p, 'start', SPEED.startMs),
      rampMs: num(p, 'ramp', SPEED.rampMs),
      capMs: num(p, 'cap', SPEED.capMs),
    },
  };
}
