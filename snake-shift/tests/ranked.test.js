// Ranked runs (LEADERBOARD_PLAN C1, A11): the canonical rules, the recorder and the verifier.
// The browser moves the simulation with advance(dt) per frame; the server replays with step().
// These tests record real browser-like runs and check that the server's replay gives the same
// score, end tick, reason, universe and lives every time, and that a changed replay is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUniverses, simUniverses } from '../src/director.js';
import { loadTimelines, loadRoomModules } from '../src/render/registry.js';
import { createSim } from '../src/sim.js';
import { createAutopilot } from '../src/autopilot.js';
import { SPEED } from '../src/config.js';
import { RULESET, RANKED_UNIVERSES, RANKED_SPEED, sameRules } from '../src/ruleset.js';
import {
  createRecorder, createVerifier, verifyReplay, replayError, encodeReplay, REPLAY_LIMITS, REPLAY_VERSION,
} from '../src/replay.js';
import { playLikeBrowser } from './helpers/browser-run.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

// The real module metas, joined the way main.js joins them (as in replay.test.js).
const metas = (mods) => Object.fromEntries(Object.entries(mods).map(([id, m]) => [id, m.meta]));
const FL = metas(await loadTimelines());
const RM = metas(await loadRoomModules());
const OLD = ['court', 'bunker', 'disco', 'plastic'];
const GL = Object.fromEntries(Object.entries(RM).map(([id, m]) => [id, { ...m, kind: '3d', views: id === 'castle' ? ['board'] : ['board', 'pov'] }]));
const PERSP = Object.fromEntries(OLD.filter((id) => RM[id]).map((id) => [id, { ...RM[id], kind: '3d', views: ['board'] }]));
const REAL = simUniverses(buildUniverses({ flats: FL, rooms: RM, glRooms: GL }));
const REAL_NOGL = simUniverses(buildUniverses({ flats: FL, rooms: RM, glRooms: null, perspRooms: PERSP }));

const BUMP = 'the ranked rules changed: if that is intended, raise RULESET in src/ruleset.js and update its table, speed and tests/fixtures/ranked-golden.json';

// ---------------------------------------------------------------- the canonical rules

test('ruleset: the table the game builds from its modules is the canonical one, in order, with and without WebGL', () => {
  assert.equal(RULESET, '1');
  assert.deepEqual(plain(REAL), plain(RANKED_UNIVERSES), BUMP);
  assert.deepEqual(plain(REAL_NOGL), plain(RANKED_UNIVERSES), BUMP);
  assert.ok(sameRules(REAL, SPEED));
  assert.ok(sameRules(REAL_NOGL, SPEED));
  assert.deepEqual(plain(SPEED), plain(RANKED_SPEED), BUMP);
});

test('ruleset: a changed weight, order, flag, missing universe or speed is not the ranked rules', () => {
  for (let i = 0; i < REAL.length; i++) {
    const t = REAL.map((u) => ({ ...u }));
    t[i].weight += 0.5;
    assert.equal(sameRules(t, SPEED), false, `weight of ${t[i].id}`);
    const f = REAL.map((u) => ({ ...u }));
    f[i].rare = !f[i].rare;
    assert.equal(sameRules(f, SPEED), false, `rare flag of ${f[i].id}`);
  }
  const swapped = REAL.slice();
  [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.equal(sameRules(swapped, SPEED), false, 'order matters: the weighted pick walks the list');
  assert.equal(sameRules(REAL.filter((u) => u.id !== 'hangar'), SPEED), false, 'a module that failed to load');
  assert.equal(sameRules([...REAL, { id: 'extra', rules: 'box', weight: 1 }], SPEED), false);
  assert.equal(sameRules(REAL, { ...SPEED, startMs: 120 }), false, '?start');
  assert.equal(sameRules(REAL, { ...SPEED, rampMs: 2 }), false, '?ramp');
  assert.equal(sameRules(REAL, { ...SPEED, capMs: 60 }), false, '?cap');
  assert.equal(sameRules(null, SPEED), false);
  assert.equal(sameRules(REAL, null), false);
});

test('ruleset: fixed replays still give their recorded results (any rule change shows here)', () => {
  const golden = JSON.parse(readFileSync(new URL('./fixtures/ranked-golden.json', import.meta.url), 'utf8'));
  assert.equal(golden.ruleset, RULESET, BUMP);
  assert.ok(golden.runs.length >= 3);
  for (const g of golden.runs) {
    const r = verifyReplay({ seed: g.seed, replay: g.replay });
    assert.deepEqual(plain(r), g.result, `seed ${g.seed}: ${BUMP}`);
  }
});

// ---------------------------------------------------------------- recording

test('turn events carry the tick at which the turn was queued', () => {
  const sim = createSim({ seed: 3 });
  const seen = [];
  sim.on('turn', (e) => seen.push(plain(e)));
  sim.queueTurn('up');
  sim.setPaused(false);
  sim.step();
  sim.step();
  sim.queueTurn('left');
  sim.queueTurn('down');
  assert.deepEqual(seen, [
    { dir: 'up', queued: 1, tick: 0 },
    { dir: 'left', queued: 1, tick: 2 },
    { dir: 'down', queued: 2, tick: 2 },
  ]);
});

test('recorder: first direction, two turns between ticks, a lost life and the respawn key, with uneven frames', () => {
  const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 1 });
  sim.reset(4242);
  const rec = createRecorder(sim);
  let lost = null, died = null;
  sim.on('lifeLost', () => { lost = sim.snapshot(); });
  sim.on('died', (e) => { died = e; });
  const frames = [3, 17, 16.6, 41, 0.5, 100, 8, 16.7, 25];
  let f = 0;
  const frame = () => sim.advance(frames[f++ % frames.length]);
  // The run waits for the first key; heading right, 'up' is taken at tick 0.
  assert.equal(sim.snapshot().waiting, 'start');
  assert.ok(sim.queueTurn('up'));
  sim.setPaused(false);
  while (sim.snapshot().tick < 3) frame();
  // Two turns queued between the same two ticks.
  const t2 = sim.snapshot().tick;
  assert.ok(sim.queueTurn('right'));
  assert.ok(sim.queueTurn('down'));
  assert.equal(sim.queueTurn('left'), false, 'a third is refused and not recorded');
  // Nothing more: the snake goes down into the bottom wall and loses a life.
  while (!lost) frame();
  assert.equal(lost.waiting, 'respawn');
  // The respawn key, queued while the simulation waits, at the tick of the collision.
  const respawnTick = lost.tick;
  const turn = lost.dir === 'up' || lost.dir === 'down' ? 'left' : 'up';
  assert.ok(sim.queueTurn(turn));
  sim.setPaused(false);
  // Then a pause in the middle of the run changes nothing.
  for (let i = 0; i < 5; i++) frame();
  sim.setPaused(true);
  for (let i = 0; i < 20; i++) frame();
  sim.setPaused(false);
  // And on to the end: no more keys, every respawn resumed by an empty key.
  while (!died) {
    if (sim.snapshot().waiting === 'respawn') sim.setPaused(false);
    frame();
  }
  const r = rec.snapshot();
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.turns), 'the snapshot is immutable');
  assert.equal(r.v, REPLAY_VERSION);
  assert.deepEqual(r.turns.slice(0, 6), [0, 0, t2, 1, t2, 2], 'up at 0, then right and down at the same tick');
  assert.deepEqual(r.turns.slice(6, 8), [respawnTick, turn === 'left' ? 3 : 0]);
  assert.equal(r.endTick, died.tick);
  assert.equal(replayError(r), null);
  const v = verifyReplay({ seed: 4242, replay: r });
  assert.deepEqual(plain(v), plain({
    ok: true, score: died.score, tick: died.tick, reason: died.death.reason,
    universe: sim.snapshot().universe.id, lives: 0, turns: 4, activeMs: v.activeMs,
  }));
  assert.ok(v.activeMs >= died.tick * RANKED_SPEED.capMs && v.activeMs <= died.tick * RANKED_SPEED.startMs);
});

test('recorder: snapshot() from a died listener registered before it already has the end tick', () => {
  const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 1 });
  let snap = null, rec = null;
  sim.on('died', () => { snap = rec.snapshot(); }); // main.js registers its listeners at load
  sim.reset(99);
  rec = createRecorder(sim);
  sim.setPaused(false);
  while (sim.snapshot().alive) {
    if (sim.snapshot().waiting === 'respawn') sim.setPaused(false);
    sim.advance(16.7);
  }
  assert.equal(snap.endTick, sim.snapshot().tick);
  assert.equal(verifyReplay({ seed: 99, replay: snap }).ok, true);
  assert.equal(rec.ended, true);
});

test('recorder: a reset abandons the run; past the limits it overflows', () => {
  const sim = createSim({ seed: 5 });
  const rec = createRecorder(sim);
  sim.queueTurn('up');
  sim.reset(6); // a new run before this one ended
  sim.queueTurn('down');
  assert.deepEqual(plain(rec.snapshot()), { v: 1, turns: [0, 0], endTick: null }, 'nothing after the reset');
  assert.equal(rec.ended, false);

  const small = { maxTicks: 30, maxTurns: 2, maxBytes: 1000 };
  const s2 = createSim({ seed: 7 });
  const r2 = createRecorder(s2, { limits: small });
  s2.setPaused(false);
  for (const d of ['up', 'left', 'down']) { s2.queueTurn(d); s2.step(); }
  assert.equal(r2.overflow, true, 'three turns, two allowed');
  const s3 = createSim({ seed: 8 });
  const r3 = createRecorder(s3, { limits: { ...small, maxTurns: 1000 } });
  const ap = createAutopilot(s3);
  s3.setPaused(false);
  for (let i = 0; i < 29; i++) { ap.update(); s3.step(); }
  assert.equal(s3.snapshot().alive, true);
  assert.equal(r3.overflow, false, 'tick 29 of 30');
  ap.update();
  s3.step();
  assert.equal(r3.overflow, true, 'still going at maxTicks: it can only end past the limit');
});

// ---------------------------------------------------------------- verification

test('verify: long autopilot runs over many seeds, played like the browser, verify to the played result', () => {
  const total = { lifeGained: 0, doubleTicks: 0, respawnTurns: 0, lifeLost: 0, pauses: 0, povTurns: 0, refusedFirst: 0, completed: 0 };
  const kinds = new Set();
  for (let i = 1; i <= 40; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const { replay, played, stats } = playLikeBrowser({ seed, crashAfter: 300 + ((i * 997) % 2500) });
    const v = verifyReplay({ seed, replay });
    assert.equal(v.ok, true, `seed ${seed}: ${v.error}`);
    assert.deepEqual(
      { score: v.score, tick: v.tick, reason: v.reason, universe: v.universe, lives: v.lives },
      played, `seed ${seed}`,
    );
    for (const k of Object.keys(total)) total[k] += stats[k] || 0;
    if (!stats.firstTurn) total.refusedFirst++;
    for (const k of stats.kinds) kinds.add(k);
  }
  // The runs covered what matters for replay.
  assert.deepEqual([...kinds].sort(), ['box', 'cube', 'lane'], 'all three spaces');
  assert.ok(total.lifeGained > 0, 'mushrooms gave lives');
  assert.ok(total.lifeLost > 40 && total.respawnTurns > 0, 'lost lives and respawn keys');
  assert.ok(total.doubleTicks > 0, 'two turns in one tick');
  assert.ok(total.pauses > 0 && total.povTurns > 0, 'pauses and first-person keys');
  assert.ok(total.refusedFirst > 0 && total.refusedFirst < 40, 'first keys taken and refused');
});

test('verify: one very long run (about 15000 ticks) still matches, and works in small slices', () => {
  const seed = 0xdeadbeef;
  const { replay, played } = playLikeBrowser({ seed, crashAfter: 15000, jog: 0, povChance: 0 });
  assert.ok(played.tick > 15000);
  const whole = verifyReplay({ seed, replay });
  assert.equal(whole.ok, true);
  assert.equal(whole.score, played.score);
  const v = createVerifier({ seed, replay });
  let r = null, calls = 0;
  while (!(r = v.run(7))) calls++;
  assert.ok(calls > 2000, 'it really ran in slices');
  assert.deepEqual(plain(r), plain(whole));
  assert.equal(v.run(7), r, 'a finished verifier keeps its answer');
});

test('verify: board completion ends the run with reason complete', () => {
  // A snake filling the whole board but one cell, the dot in that cell: eating it leaves no room.
  const path = [];
  for (let k = 0; k < 256; k++) {
    const y = Math.floor(k / 16);
    path.push({ x: y % 2 === 0 ? k % 16 : 15 - (k % 16), y });
  }
  const start = { snake: path.slice(0, 255).reverse(), dir: 'left', food: path[255] };
  const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 1, start });
  sim.reset(11);
  const rec = createRecorder(sim);
  let died = null;
  sim.on('died', (e) => { died = e; });
  sim.setPaused(false);
  while (!died) sim.advance(30);
  assert.equal(died.death.reason, 'complete');
  const r = rec.snapshot();
  assert.deepEqual(plain(r), { v: 1, turns: [], endTick: 1 });
  const simFactory = (s) => createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: s, start });
  const v = verifyReplay({ seed: 11, replay: r, simFactory });
  assert.equal(v.ok, true);
  assert.equal(v.reason, 'complete');
  assert.equal(v.score, 1);
  assert.equal(v.lives, 3);
  // The server never takes a prepared start: from the ranked start the same replay is not over at tick 1.
  assert.equal(verifyReplay({ seed: 11, replay: r }).error, 'not_over');
});

test('verify: a changed replay is refused', () => {
  const seed = 777;
  const { replay } = playLikeBrowser({ seed, crashAfter: 800 });
  const base = verifyReplay({ seed, replay });
  assert.equal(base.ok, true);
  const turns = replay.turns.slice();
  const withTurns = (t) => ({ v: 1, turns: t, endTick: replay.endTick });
  const err = (r, s = seed) => verifyReplay({ seed: s, replay: r }).error;

  assert.equal(err({ ...replay, endTick: replay.endTick + 1 }), 'ended_early', 'a later end');
  const lastTurnTick = turns.length ? turns[turns.length - 2] : -1;
  assert.equal(err({ ...replay, endTick: replay.endTick - 1 }), lastTurnTick < replay.endTick - 1 ? 'not_over' : 'turn_after_end', 'an earlier end');
  assert.equal(err({ ...replay, endTick: lastTurnTick + 1 }), lastTurnTick + 1 < replay.endTick ? 'not_over' : undefined);
  assert.equal(err({ ...replay, endTick: replay.endTick + 500 }), 'ended_early');
  assert.equal(err(withTurns([...turns, replay.endTick, 0])), 'turn_after_end');
  // The opposite of the heading at tick 0 (right) is refused by the simulation.
  assert.equal(err(withTurns([0, 3, ...turns.filter((_, i) => i >= 2 || turns[0] !== 0)])), 'turn_refused');
  // Dropping or moving a turn changes the run.
  const dropped = turns.slice(0, 10).concat(turns.slice(12));
  assert.notEqual(err(withTurns(dropped)), undefined, 'a dropped turn');
  const shifted = turns.slice();
  shifted[20] += 1;
  if (shifted[20] <= shifted[22]) assert.notEqual(err(withTurns(shifted)), undefined, 'a moved turn');
  // Another seed is another run.
  assert.notEqual(err(replay, seed + 1), undefined, 'another seed');
  assert.equal(err(replay, -1), 'bad_seed');
  assert.equal(err(replay, 2 ** 32), 'bad_seed');
  assert.equal(err(replay, 1.5), 'bad_seed');
});

test('verify: malformed and oversized replays are refused before anything runs', () => {
  const ok = { v: 1, turns: [0, 0, 5, 1], endTick: 9 };
  assert.equal(replayError(ok), null);
  const cases = [
    [null, 'malformed'], [[], 'malformed'], ['{"v":1}', 'malformed'], [{}, 'version'],
    [{ v: 2, turns: [], endTick: 3 }, 'version'],
    [{ v: 1, turns: [0], endTick: 3 }, 'malformed'],
    [{ v: 1, turns: 'x', endTick: 3 }, 'malformed'],
    [{ v: 1, turns: [], endTick: 0 }, 'malformed'],
    [{ v: 1, turns: [], endTick: 2.5 }, 'malformed'],
    [{ v: 1, turns: [], endTick: '9' }, 'malformed'],
    [{ v: 1, turns: [0, 4], endTick: 3 }, 'malformed'],
    [{ v: 1, turns: [0, -1], endTick: 3 }, 'malformed'],
    [{ v: 1, turns: [-1, 0], endTick: 3 }, 'malformed'],
    [{ v: 1, turns: [0.5, 0], endTick: 3 }, 'malformed'],
    [{ v: 1, turns: ['0', 0], endTick: 3 }, 'malformed'],
    [{ v: 1, turns: [5, 0, 4, 1], endTick: 9 }, 'turn_order'],
    [{ v: 1, turns: [9, 0], endTick: 9 }, 'turn_after_end'],
    [{ v: 1, turns: [], endTick: REPLAY_LIMITS.maxTicks + 1 }, 'too_long'],
  ];
  for (const [r, want] of cases) assert.equal(replayError(r), want, JSON.stringify(r));
  const many = [];
  for (let i = 0; i <= REPLAY_LIMITS.maxTurns; i++) many.push(i, i % 2);
  assert.equal(replayError({ v: 1, turns: many, endTick: REPLAY_LIMITS.maxTurns + 5 }), 'too_many_turns');
  const tight = { maxTicks: 100000, maxTurns: 1000, maxBytes: 40 };
  assert.equal(replayError({ v: 1, turns: [10, 0, 20, 1, 30, 2, 40, 3], endTick: 50 }, tight), 'too_large');
  assert.equal(verifyReplay({ seed: 1, replay: { v: 1, turns: [9, 0], endTick: 9 } }).error, 'turn_after_end');
  // The canonical text keeps only the three fields, in order.
  assert.equal(encodeReplay({ endTick: 9, junk: 1, turns: [0, 0], v: 1 }), '{"v":1,"turns":[0,0],"endTick":9}');
});
