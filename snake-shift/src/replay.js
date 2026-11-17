// Ranked replays (LEADERBOARD_PLAN C1). Pure: no DOM, no Node built-ins; the browser records with
// it and the server verifies with it.
//
// A replay is the run's turns as the simulation accepted them (after steerFor), each with the tick
// count at the moment it was queued, plus the tick on which the run ended. The browser moves the
// simulation with advance(dt) per frame; the server calls step() once per tick and queues each
// tick's turns, in order, right before that tick's step. Both give the same run because a turn
// queued at tick t is always used by step t + 1 or later, whatever the frame timing was.
//
// Format (JSON, ASCII only):
//   { "v": 1, "turns": [tick, dir, tick, dir, ...], "endTick": n }
//   dir: 0 up, 1 right, 2 down, 3 left. Ticks never decrease and are all below endTick.

import { createSim, stepMsFor } from './sim.js';
import { DIR_ORDER } from './space.js';
import { RANKED_UNIVERSES, RANKED_SPEED } from './ruleset.js';

export const REPLAY_VERSION = 1;

/**
 * Hard limits for a ranked replay. A run past them stays local (the recorder says `overflow`).
 *   maxTicks: about 2.6 hours at the fastest speed (95 ms a tick); verifying it costs about a second.
 *   maxTurns: far more than a person can press in maxTicks.
 *   maxBytes: the encoded JSON; maxTurns turns of at most 8 bytes each fit.
 */
export const REPLAY_LIMITS = Object.freeze({ maxTicks: 100000, maxTurns: 60000, maxBytes: 524288 });

const DIR_INDEX = Object.freeze({ up: 0, right: 1, down: 2, left: 3 });

/**
 * Records a ranked run. Create it right after sim.reset(seed), before the first direction key.
 * It listens to the simulation's `turn` and `died` events and lets go of the simulation when the
 * run ends or the simulation is reset (an abandoned run).
 * Returns:
 *   snapshot()  { v, turns, endTick } frozen; endTick is null until the run is over. Safe to call
 *               from another `died` listener: the end tick is then read from the simulation.
 *   overflow    true when the run went past `limits` in ticks or turns (it can no longer be ranked);
 *               the size in bytes is checked by replayError(snapshot()) once the run is over
 *   ended       true once the run is over
 *   dispose()   stop listening
 * @param {ReturnType<typeof createSim>} sim
 * @param {{ limits?: typeof REPLAY_LIMITS }} [opts]
 */
export function createRecorder(sim, { limits = REPLAY_LIMITS } = {}) {
  const turns = [];
  let endTick = null;
  let overflow = false;
  let attached = true;
  const offs = [];
  function dispose() {
    if (!attached) return;
    attached = false;
    for (const off of offs) off();
  }
  offs.push(sim.on('turn', (e) => {
    if (overflow) return;
    if (turns.length / 2 >= limits.maxTurns || e.tick >= limits.maxTicks) { overflow = true; turns.length = 0; return; }
    turns.push(e.tick, DIR_INDEX[e.dir]);
  }));
  offs.push(sim.on('died', (e) => {
    endTick = e.tick;
    if (e.tick > limits.maxTicks) { overflow = true; turns.length = 0; }
    dispose();
  }));
  offs.push(sim.on('reset', dispose));

  function currentEnd() {
    if (endTick !== null || !attached) return endTick;
    const s = sim.snapshot();
    return s.alive ? null : s.tick;
  }

  return {
    snapshot() {
      return Object.freeze({ v: REPLAY_VERSION, turns: Object.freeze(turns.slice()), endTick: currentEnd() });
    },
    get overflow() {
      if (overflow) return true;
      const end = currentEnd();
      if (end !== null) return end > limits.maxTicks;
      // Still going at maxTicks: it can only end past the limit.
      return attached && sim.snapshot().tick >= limits.maxTicks;
    },
    get ended() { return currentEnd() !== null; },
    dispose,
  };
}

/** The canonical JSON text of a replay: only v, turns and endTick, in that order. */
export function encodeReplay(replay) {
  return JSON.stringify({ v: replay.v, turns: replay.turns, endTick: replay.endTick });
}

const isTick = (n) => Number.isInteger(n) && n >= 0;

/**
 * Shape and limit check, cheap and without running the simulation.
 * Returns null when the replay may be verified, otherwise a reason:
 *   'malformed' | 'version' | 'too_long' | 'too_many_turns' | 'too_large' | 'turn_order' | 'turn_after_end'
 * @param {unknown} replay
 * @param {typeof REPLAY_LIMITS} [limits]
 */
export function replayError(replay, limits = REPLAY_LIMITS) {
  if (!replay || typeof replay !== 'object' || Array.isArray(replay)) return 'malformed';
  if (replay.v !== REPLAY_VERSION) return 'version';
  const { turns, endTick } = replay;
  if (!Array.isArray(turns) || turns.length % 2 !== 0) return 'malformed';
  if (!Number.isInteger(endTick) || endTick < 1) return 'malformed';
  if (endTick > limits.maxTicks) return 'too_long';
  if (turns.length / 2 > limits.maxTurns) return 'too_many_turns';
  let last = 0;
  for (let i = 0; i < turns.length; i += 2) {
    const t = turns[i], d = turns[i + 1];
    if (!isTick(t) || !Number.isInteger(d) || d < 0 || d > 3) return 'malformed';
    if (t < last) return 'turn_order';
    if (t >= endTick) return 'turn_after_end';
    last = t;
  }
  if (encodeReplay(replay).length > limits.maxBytes) return 'too_large';
  return null;
}

/**
 * Replays a run on the ranked rules, in slices. `run(budget)` advances at most `budget` ticks and
 * returns null while unfinished, then the result (the same object on every later call):
 *   { ok: true, score, tick, reason, universe, lives, turns, activeMs }
 *   { ok: false, error, tick }  error: a replayError reason, 'bad_seed', 'turn_refused' (the
 *     simulation would not take a turn), 'ended_early' (the run ended before endTick) or
 *     'not_over' (the run was still going at endTick)
 * activeMs is the time the snake was moving: the sum of each tick's step time. The browser can
 * never show a run faster than that.
 * @param {{ seed: number, replay: unknown, limits?: typeof REPLAY_LIMITS, simFactory?: (seed: number) => ReturnType<typeof createSim> }} args
 *   simFactory is for tests only (a run from a prepared start); the server never passes it.
 */
export function createVerifier({ seed, replay, limits = REPLAY_LIMITS, simFactory = null }) {
  let result = null;
  const done = (r) => { result = Object.freeze(r); return result; };
  const shape = replayError(replay, limits);
  if (shape) done({ ok: false, error: shape, tick: 0 });
  else if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) done({ ok: false, error: 'bad_seed', tick: 0 });
  if (result) return { run: () => result };

  const sim = simFactory ? simFactory(seed) : createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed });
  const speed = sim.speed;
  const { turns, endTick } = replay;
  const n = turns.length;
  let score = sim.snapshot().score;
  let died = null;
  sim.on('ate', (e) => { score = e.score; });
  sim.on('died', (e) => { died = e; });
  let t = 0, i = 0, activeMs = 0;

  function run(budget = Infinity) {
    if (result) return result;
    for (let left = budget; left > 0; left--) {
      while (i < n && turns[i] === t) {
        if (!sim.queueTurn(DIR_ORDER[turns[i + 1]])) return done({ ok: false, error: 'turn_refused', tick: t });
        i += 2;
      }
      activeMs += stepMsFor(score, speed); // the step time is taken before the tick, as advance() does
      sim.step();
      t += 1;
      if (died) {
        if (t !== endTick) return done({ ok: false, error: 'ended_early', tick: t });
        if (i < n) return done({ ok: false, error: 'turn_after_end', tick: t });
        const s = sim.snapshot();
        return done({
          ok: true, score: died.score, tick: died.tick, reason: died.death.reason,
          universe: s.universe.id, lives: s.lives, turns: n / 2, activeMs,
        });
      }
      if (t >= endTick) return done({ ok: false, error: 'not_over', tick: t });
    }
    return null;
  }
  return { run };
}

/**
 * Verifies a whole replay at once. Same arguments and result as createVerifier().run().
 * @param {Parameters<typeof createVerifier>[0]} args
 */
export function verifyReplay(args) {
  return createVerifier(args).run(Infinity);
}
