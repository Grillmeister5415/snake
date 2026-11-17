// The ranked ruleset (LEADERBOARD_PLAN C1). Pure: no DOM, no Node built-ins; the browser and the
// server both import it. A ranked run is comparable with another only when both ran these exact
// rules, so the table and the speed are written out here instead of read from the loaded modules.
//
// When a rule, a weight or the speed changes on purpose, the tests fail until RULESET is raised and
// the values below are updated. The server verifies only the current RULESET (see server/tickets.js).

/** Version of the ranked rules. Raise it whenever a ranked run would play differently. */
export const RULESET = '1';

const u = (id, rules, mushrooms, rare, room, weight) => Object.freeze({ id, rules, mushrooms, rare, room, weight });

/**
 * The universe table createSim takes, in order: the weighted pick walks this list, so the order is
 * part of the rules. Built the way main.js builds it (director.buildUniverses from the real module
 * metas, then simUniverses). Lane and mushroom carry their metas' weights (3 and 0.9), which differ
 * from rules-config.js UNIVERSES; flow.js gives special universes SPECIAL.weight, so those two weights
 * do not change play today, but they are compared all the same.
 */
export const RANKED_UNIVERSES = Object.freeze([
  u('lcd', 'box', false, false, false, 1),
  u('arcade', 'box', false, false, false, 3),
  u('acid', 'box', false, false, false, 2),
  u('kombat', 'box', false, false, false, 3),
  u('desktop', 'box', false, false, false, 2),
  u('timewarp', 'box', false, true, false, 1),
  u('wrong', 'box', false, true, false, 1),
  u('court', 'box', false, false, true, 3),
  u('bunker', 'box', false, false, true, 3),
  u('disco', 'box', false, false, true, 3),
  u('plastic', 'box', false, false, true, 3),
  u('lane', 'lane', false, false, true, 3),
  u('hangar', 'box', false, false, true, 3),
  u('mushroom', 'box', true, false, true, 0.9),
  u('castle', 'cube', false, false, true, 1),
  u('abyss', 'box', false, false, true, 2),
]);

/** The speed curve of a ranked run (config.js SPEED without URL overrides). */
export const RANKED_SPEED = Object.freeze({ startMs: 150, rampMs: 1.5, capMs: 95 });

const FIELDS = ['id', 'rules', 'mushrooms', 'rare', 'room', 'weight'];

/**
 * True when a simulation built with `simTable` (the createSim table, e.g. simUniverses(...)) and
 * `speed` plays the ranked rules: the same universes in the same order with the same fields, and
 * the same speed curve. Anything else (a module that failed to load, a speed override) is a local run.
 */
export function sameRules(simTable, speed) {
  if (!Array.isArray(simTable) || simTable.length !== RANKED_UNIVERSES.length) return false;
  for (let i = 0; i < RANKED_UNIVERSES.length; i++) {
    const a = simTable[i], b = RANKED_UNIVERSES[i];
    if (!a || typeof a !== 'object') return false;
    for (const k of FIELDS) {
      // The sim reads missing booleans as false; weights and ids must match exactly.
      const av = typeof b[k] === 'boolean' ? !!a[k] : a[k];
      if (av !== b[k]) return false;
    }
  }
  if (!speed || typeof speed !== 'object') return false;
  return speed.startMs === RANKED_SPEED.startMs && speed.rampMs === RANKED_SPEED.rampMs && speed.capMs === RANKED_SPEED.capMs;
}
