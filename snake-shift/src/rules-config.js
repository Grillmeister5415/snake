// Constants for the rules layer (LEVELS_PLAN section 3). Pure, no DOM.
// The speed curve stays in config.js (SPEED); everything new lives here.

export const BOARD = 16; // every space shows one 16x16 board

export const LIVES = Object.freeze({
  start: 3,
  max: 5,
  respawnLength: 3,  // a respawned snake is this long
  respawnAhead: 5,   // free cells straight ahead of the respawn spot
  respawnItemGap: 3, // Manhattan distance from the dot and the mushroom
});

export const MUSHROOM = Object.freeze({
  lifetimeTicks: 80, // each mushroom expires after this many ticks
  every: 2,          // another one after every second food event in Mushroom Land
  minHeadDist: 4,    // spawns at least this many cells from the head
});

export const LANE = Object.freeze({
  bandTop: 5,     // the window keeps the head's local row within bandTop..bandBottom
  bandBottom: 10,
  maxScroll: 2,   // rows per tick the window may move while catching up after arrival
  dotMin: 2,      // dots spawn 2..8 rows beyond the window's top edge
  dotMax: 8,
  graphRowsAbove: 24, // search window for spawns and the autopilot, in rows around the board
  graphRows: 64,
});

export const CUBE = Object.freeze({
  neighbourFaceChance: 0.7, // a dot spawns on a face next to the head's this often
});

// Special universes (lane, mushroom, castle): held, rare, never two in a row.
export const SPECIAL = Object.freeze({
  weight: 0.85, // started at 0.9; tuned: ~10.8% of shifts in 30-60 food runs, ~9.8% over 2,000
  holdMin: 4,   // a special universe lasts 4..6 food events
  holdMax: 6,
  minScore: 4,  // none arrives before the fourth food
});

// Universe selection, ported from config.js DIRECTOR (the director no longer picks universes).
export const FLOW = Object.freeze({
  home: 'lcd',
  opening: Object.freeze(['arcade', 'court']), // the first two shifts are scripted
  chaosScore: 25,      // chaos = clamp(score / 25, 0, 1)
  rareWeight: 0.7,     // timewarp / wrong pick weight, times (0.5 + chaos)
  rareMinScore: 4,     // no rare universe before this score
  rareHoldMax: 2,      // a rare universe lasts one or two food events
  recentLen: 3,        // universes shown in the last N shifts are picked less often
  recentFactor: 0.4,
  freshFactor: 1.6,    // universes not yet visited this run are picked more often
  resetBase: 0.07,     // Total Reset: after a room or a rare universe, snap back to lcd
  resetChaos: 0.23,    //   chance = resetBase + resetChaos * chaos
  flatWeight: 1,       // default weights when a universe gives none
  roomWeight: 2,
});

const u = (id, more = {}) => Object.freeze({
  id, rules: 'box', mushrooms: false, rare: false, room: false, weight: 1, ...more,
});

// The sixteen universes of LEVELS_PLAN 2.1. Used when createSim gets no table.
export const UNIVERSES = Object.freeze([
  u('lcd'), u('arcade'), u('acid'), u('kombat'), u('desktop'),
  u('timewarp', { rare: true }), u('wrong', { rare: true }),
  u('court', { room: true, weight: 2 }), u('bunker', { room: true, weight: 2 }),
  u('disco', { room: true, weight: 2 }), u('plastic', { room: true, weight: 2 }),
  u('lane', { rules: 'lane', room: true }),
  u('hangar', { room: true, weight: 2 }),
  u('mushroom', { mushrooms: true, room: true }),
  u('castle', { rules: 'cube', room: true }),
  u('abyss', { room: true, weight: 2 }),
]);
