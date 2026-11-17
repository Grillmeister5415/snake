// Plays a ranked run the way the browser does (main.js): the simulation moves by advance(dt) once
// per animation frame with uneven frame times, and every input lands between two frames through
// queueTurn. The autopilot steers; on top of it come two-turn jogs inside one tick, pauses, the
// first direction key and respawn keys, and in the end the snake is steered into a wall. The
// recorder sees only what the simulation accepted. Used by the replay and server tests.

import { createSim } from '../../src/sim.js';
import { createRng } from '../../src/rng.js';
import { createAutopilot } from '../../src/autopilot.js';
import { steerFor } from '../../src/input.js';
import { createRecorder } from '../../src/replay.js';
import { RANKED_UNIVERSES, RANKED_SPEED } from '../../src/ruleset.js';
import { OPPOSITE } from '../../src/space.js';

const PERP = { up: ['left', 'right'], down: ['left', 'right'], left: ['up', 'down'], right: ['up', 'down'] };

/**
 * @param {{ seed: number, crashAfter?: number, jog?: number, pauseChance?: number, povChance?: number,
 *   start?: object|null, maxFrames?: number }} opts
 *   crashAfter: ticks of good play before steering into walls
 *   jog: chance per steering turn to queue a second turn in the same tick
 *   povChance: chance per frame of a relative key press through steerFor (first person)
 * Returns { replay, played: { score, tick, reason, universe, lives }, stats }.
 */
export function playLikeBrowser({
  seed, crashAfter = 1500, jog = 0.15, pauseChance = 0.003, povChance = 0.004, start = null, maxFrames = 3e6,
} = {}) {
  const rnd = createRng((seed ^ 0x51ed27) >>> 0);
  // main.js builds the simulation once at load with some seed, then startRun() resets it with the ticket's.
  const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 1, start });
  sim.reset(seed);
  const recorder = createRecorder(sim);
  const ap = createAutopilot(sim);
  const stats = {
    accepted: 0, doubleTicks: 0, respawnTurns: 0, lifeLost: 0, lifeGained: 0, pauses: 0, povTurns: 0,
    firstTurn: null, kinds: new Set(), frames: 0,
  };
  let mode = 'ready', played = null, respawnWait = 0, pausedFor = 0;
  const perTick = new Map();
  sim.on('turn', (e) => {
    stats.accepted++;
    const n = (perTick.get(e.tick) || 0) + 1;
    perTick.set(e.tick, n);
    if (n === 2) stats.doubleTicks++;
  });
  sim.on('lifeLost', () => { stats.lifeLost++; mode = 'respawn'; respawnWait = 1 + rnd.int(20); });
  sim.on('ate', (e) => { if (e.lifeGained) stats.lifeGained++; });
  sim.on('died', (e) => {
    mode = 'over';
    const s = sim.snapshot();
    // What the browser would show and keep: the recorder's snapshot from inside a `died` listener.
    played = { score: e.score, tick: e.tick, reason: e.death.reason, universe: s.universe.id, lives: s.lives, replay: recorder.snapshot() };
  });

  // The first direction key (begin()): any of the four, so a refused one (the current heading or its
  // opposite) happens too.
  const first = ['up', 'down', 'left', 'right'][rnd.int(4)];
  stats.firstTurn = sim.queueTurn(first) ? first : null;
  sim.setPaused(false);
  mode = 'playing';

  while (mode !== 'over') {
    if (++stats.frames > maxFrames) throw new Error(`run for seed ${seed} did not end`);
    const s = sim.snapshot();
    stats.kinds.add(s.space.kind);
    if (mode === 'respawn') {
      if (--respawnWait <= 0) { // respawn(): the first key after a lost life
        const key = ['up', 'down', 'left', 'right'][rnd.int(4)];
        const turn = steerFor(key, 'board', s.heading || s.dir);
        if (turn && sim.queueTurn(turn)) stats.respawnTurns++;
        sim.setPaused(false);
        mode = 'playing';
      }
    } else if (pausedFor > 0) {
      if (--pausedFor === 0) sim.setPaused(false);
    } else if (rnd.next() < pauseChance) {
      sim.setPaused(true);
      pausedFor = 1 + rnd.int(30);
      stats.pauses++;
    } else if (s.tick >= crashAfter && s.space.kind !== 'cube') {
      // Into a wall: straight on in a box, sideways in the lane. (The cube has no walls; the
      // autopilot keeps going there until the run moves on.)
      if (s.space.kind === 'lane' && (s.heading || s.dir) === 'up') sim.queueTurn('left');
    } else if (rnd.next() < povChance) {
      // A first-person key: left or right relative to the heading, turned into a grid direction.
      const turn = steerFor(rnd.next() < 0.5 ? 'left' : 'right', 'pov', s.heading || s.dir);
      if (turn && sim.queueTurn(turn)) stats.povTurns++;
    } else {
      const before = sim.snapshot().turns.length;
      const d = ap.update();
      const after = sim.snapshot();
      // A quick jog: a second turn queued before the next tick, back to the old heading.
      if (d && after.turns.length === before + 1 && rnd.next() < jog) {
        const back = PERP[d].includes(s.dir) ? s.dir : PERP[d][rnd.int(2)];
        if (back !== OPPOSITE[d]) sim.queueTurn(back);
      }
    }
    // One animation frame: mostly ~16.7 ms, sometimes very short, sometimes the 100 ms clamp.
    const r = rnd.next();
    const dt = r < 0.05 ? 100 : r < 0.15 ? rnd.next() * 4 : 12 + rnd.next() * 10;
    sim.advance(dt);
  }
  const { replay, ...rest } = played;
  return { replay, played: rest, stats, recorder };
}
