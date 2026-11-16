import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim.js';
import { createAutopilot, chooseDir } from '../src/autopilot.js';
import { LIVES, MUSHROOM } from '../src/rules-config.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const SHORT = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Brute force of LEVELS_PLAN 3.6: the best respawn distance to the centre for these items. */
function bestRespawn(items) {
  let best = Infinity;
  for (const [dx, dy] of Object.values(D)) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const body = [0, 1, 2].map((k) => ({ x: x - dx * k, y: y - dy * k }));
      const ahead = [1, 2, 3, 4, 5].map((k) => ({ x: x + dx * k, y: y + dy * k }));
      if (![...body, ...ahead].every((c) => c.x >= 0 && c.y >= 0 && c.x < 16 && c.y < 16)) continue;
      if (!body.every((c) => items.every((it) => man(c, it) >= LIVES.respawnItemGap))) continue;
      if (!ahead.every((c) => items.every((it) => man(c, it) >= 1))) continue;
      best = Math.min(best, (x - 7.5) ** 2 + (y - 7.5) ** 2);
    }
  }
  return best;
}

function checkRespawn(s, items) {
  assert.equal(s.snake.length, LIVES.respawnLength);
  assert.equal(s.length, LIVES.respawnLength);
  const [h, n] = s.snake;
  const [dx, dy] = D[s.dir];
  assert.deepEqual([n.x, n.y], [h.x - dx, h.y - dy], 'the body trails the head');
  for (let k = 1; k <= LIVES.respawnAhead; k++) {
    const c = { x: h.x + dx * k, y: h.y + dy * k };
    assert.ok(c.x >= 0 && c.y >= 0 && c.x < 16 && c.y < 16, 'five cells ahead on the board');
    assert.ok(items.every((it) => man(c, it) >= 1), 'and free');
  }
  for (const c of s.snake) for (const it of items) assert.ok(man(c, it) >= LIVES.respawnItemGap, 'away from the items');
  assert.equal((h.x - 7.5) ** 2 + (h.y - 7.5) ** 2, bestRespawn(items), 'nearest the centre');
}

/** Steer to a board-local cell with the autopilot's own search. */
function steerTo(sim, target) {
  const s = sim.snapshot();
  const d = chooseDir({ ...s, food: target, foodAt: null, mushroom: null });
  if (d !== s.dir) sim.queueTurn(d);
  sim.step();
}

test('a run starts with 3 lives of 5 and waits for the first direction key', () => {
  const sim = createSim({ seed: 1 });
  const s = sim.snapshot();
  assert.equal(s.lives, LIVES.start);
  assert.equal(s.maxLives, LIVES.max);
  assert.equal(s.waiting, 'start');
  assert.equal(s.paused, true);
  sim.queueTurn('up');
  sim.setPaused(false);
  assert.equal(sim.snapshot().waiting, null);
});

test('a collision costs one life and respawns a short snake; score, universe, space, dot and speed stay', () => {
  const long = [];
  for (let x = 12; x >= 3; x--) long.push({ x, y: 8 });
  const sim = createSim({ seed: 2, start: { score: 7, snake: long, dir: 'right', food: { x: 0, y: 15 } } });
  sim.setPaused(false);
  let lost = null;
  sim.on('lifeLost', (e) => { lost = e; });
  let before = sim.snapshot();
  while (!lost) { before = sim.snapshot(); sim.step(); }
  const s = sim.snapshot();
  assert.deepEqual(plain(lost), { lives: 2, death: { reason: 'wall', cell: { x: 16, y: 8 } } });
  assert.equal(s.lives, 2);
  assert.equal(s.alive, true);
  assert.equal(s.paused, true);
  assert.equal(s.waiting, 'respawn');
  assert.deepEqual(plain(s.death), plain(lost.death));
  assert.equal(s.score, before.score);
  assert.equal(s.stepMs, before.stepMs);
  assert.deepEqual(plain(s.universe), plain(before.universe));
  assert.deepEqual(plain(s.space), plain(before.space));
  assert.deepEqual(plain(s.food), plain(before.food));
  assert.deepEqual(plain(s.breaks), []);
  checkRespawn(s, [s.food]);
  assert.equal(s.dir, 'right', 'keeps the heading when it fits');
  // The shell resumes on the first direction key.
  sim.queueTurn('up');
  sim.setPaused(false);
  assert.equal(sim.snapshot().waiting, null);
  assert.equal(sim.advance(s.stepMs), 1);
  assert.equal(sim.snapshot().dir, 'up');
});

test('respawn keeps away from the dot and the mushroom', () => {
  for (const [food, start] of [[{ x: 7, y: 7 }, SHORT], [{ x: 8, y: 9 }, SHORT], [{ x: 3, y: 12 }, SHORT]]) {
    const sim = createSim({ seed: 3, start: { universe: 'mushroom', snake: start, dir: 'right', food } });
    sim.lockUniverse('mushroom');
    sim.step(); // the mushroom arrives
    const m = sim.snapshot().mushroom;
    assert.ok(m);
    sim.queueTurn('up');
    let s;
    do { sim.step(); s = sim.snapshot(); } while (s.waiting !== 'respawn');
    checkRespawn(s, [s.food, s.mushroom].filter(Boolean));
  }
});

test('lives 3 -> 0: two respawns, then the third collision ends the run', () => {
  const sim = createSim({ seed: 4, start: { snake: SHORT, dir: 'right', food: { x: 0, y: 0 } } });
  const events = [];
  sim.on('lifeLost', (e) => events.push(['lifeLost', e.lives]));
  sim.on('died', (e) => events.push(['died', e.score, e.death.reason]));
  for (let round = 0; round < 3; round++) {
    sim.setPaused(false);
    for (let i = 0; i < 40 && sim.snapshot().alive && sim.snapshot().waiting !== 'respawn'; i++) sim.step();
    if (round < 2) assert.equal(sim.snapshot().waiting, 'respawn');
  }
  const s = sim.snapshot();
  assert.deepEqual(events, [['lifeLost', 2], ['lifeLost', 1], ['died', 0, 'wall']]);
  assert.equal(s.lives, 0);
  assert.equal(s.alive, false);
  assert.equal(sim.step(), false);
  assert.equal(sim.queueTurn('up'), false);
  sim.reset(5);
  assert.equal(sim.snapshot().lives, LIVES.start);
});

test('respawn in the lane and on the cube stays on the active board and keeps the space', () => {
  // Lane: drive into the left side wall.
  const lane = createSim({ seed: 5, start: { universe: 'lane', snake: [{ x: 8, y: 8 }, { x: 8, y: 9 }, { x: 8, y: 10 }], dir: 'up', food: { x: 0, y: 0 } } });
  for (let i = 0; i < 12; i++) lane.step();
  lane.queueTurn('left');
  let before;
  do { before = lane.snapshot(); lane.step(); } while (lane.snapshot().waiting !== 'respawn');
  let s = lane.snapshot();
  assert.equal(s.lives, 2);
  assert.equal(s.space.kind, 'lane');
  assert.equal(s.space.y0, before.space.y0);
  assert.equal(s.space.prevY0, s.space.y0);
  assert.equal(s.dir, 'up', 'the lane respawns facing forward');
  assert.equal(s.body.length, 3);
  assert.deepEqual(plain(s.snake), plain(s.body.map((c) => ({ x: c.x, y: c.y - s.space.y0 }))));
  checkRespawn(s, s.food ? [s.food] : []);
  // Cube: hit the own body across a seam.
  const snake = [];
  for (let y = 3; y <= 12; y++) snake.push({ x: 4, y });
  const cube = createSim({ seed: 1, start: { universe: 'castle', snake, dir: 'up', food: { x: 14, y: 14 } } });
  for (const t of ['up', 'up', 'up', 'up', 'right', 'right', 'down', 'left', 'up']) {
    if (t !== cube.snapshot().dir) cube.queueTurn(t);
    cube.step();
  }
  s = cube.snapshot();
  assert.equal(s.waiting, 'respawn');
  assert.equal(s.death.reason, 'self');
  assert.equal(s.space.kind, 'cube');
  assert.equal(s.space.face, 0);
  assert.ok(s.body.every((c) => c.f === 0), 'the short snake is on the active face');
  assert.equal(s.body.length, 3);
  checkRespawn(s, [s.food].filter(Boolean));
});

test('a mushroom spawns on the tick after Mushroom Land arrives, at least 4 cells from the head, and expires after 80 ticks', () => {
  for (let seed = 0; seed < 30; seed++) {
    const sim = createSim({ seed, start: { snake: SHORT, dir: 'right', food: { x: 0, y: 0 } } });
    sim.lockUniverse('mushroom');
    assert.equal(sim.snapshot().mushroom, null);
    // Circle in a 2x2 square so neither item is touched.
    const turns = ['down', 'left', 'up', 'right'];
    sim.queueTurn(turns[0]);
    sim.step();
    const born = sim.snapshot();
    assert.ok(born.mushroom, 'spawned on the next tick');
    assert.ok(man(born.mushroom, born.snake[0]) >= MUSHROOM.minHeadDist);
    for (let t = 2; t <= 120; t++) {
      sim.queueTurn(turns[(t - 1) % 4]);
      sim.step();
      const s = sim.snapshot();
      assert.ok(s.alive && s.waiting === null);
      if (s.tick < 1 + MUSHROOM.lifetimeTicks) assert.deepEqual(plain(s.mushroom), plain(born.mushroom), `present at tick ${s.tick}`);
      else assert.equal(s.mushroom, null, `expired at tick ${s.tick}`);
    }
  }
});

test('eating a mushroom: one food event, one more cell, one more life; the dot stays', () => {
  for (let seed = 0; seed < 10; seed++) {
    const sim = createSim({ seed, start: { universe: 'mushroom', snake: SHORT, dir: 'right' } });
    sim.step();
    let ate = null, prev = null;
    sim.on('ate', (e) => { if (e.kind === 'mushroom') ate = { e, s: sim.snapshot() }; });
    for (let i = 0; i < 200 && !ate; i++) {
      prev = sim.snapshot();
      if (!prev.mushroom) break;
      steerTo(sim, prev.mushroom);
    }
    if (!ate) continue;
    const { e, s } = ate;
    assert.equal(e.score, prev.score + 1);
    assert.equal(e.lifeGained, true);
    assert.equal(s.lives, prev.lives + 1);
    assert.equal(s.length, prev.length + 1);
    assert.equal(s.score, prev.score + 1);
    assert.deepEqual(plain(s.food), plain(prev.food), 'the dot stays where it is');
    assert.equal(s.universe.holdLeft, prev.universe.holdLeft - 1, 'counts toward the hold');
    assert.equal(s.mushroom, null);
    return;
  }
  assert.fail('never reached a mushroom');
});

test('at 5 lives a mushroom is still food, and lives never pass 5', () => {
  const sim = createSim({ seed: 6, start: { lives: 5, snake: SHORT, dir: 'right' } });
  sim.lockUniverse('mushroom');
  const ap = createAutopilot(sim);
  let mushrooms = 0, atCap = 0, before = sim.snapshot();
  sim.on('ate', (e) => {
    const s = sim.snapshot();
    assert.ok(s.lives <= LIVES.max);
    assert.equal(e.score, before.score + 1, 'still food');
    if (e.kind === 'mushroom') {
      mushrooms++;
      if (before.lives === LIVES.max) atCap++;
      assert.equal(e.lifeGained, before.lives < LIVES.max);
      assert.equal(s.lives, Math.min(LIVES.max, before.lives + 1));
    }
  });
  let lastScore = 0;
  for (let i = 0; i < 6000 && sim.snapshot().alive; i++) {
    ap.update();
    before = sim.snapshot();
    sim.step();
    const s = sim.snapshot();
    assert.ok(s.lives <= LIVES.max);
    assert.ok(s.score >= lastScore);
    lastScore = s.score;
    if (s.waiting === 'respawn') sim.setPaused(false);
  }
  assert.ok(mushrooms >= 3 && atCap >= 1, `ate ${mushrooms} mushrooms, ${atCap} at the cap`);
});

test('another mushroom after every second food event; none outside Mushroom Land', () => {
  const sim = createSim({ seed: 7, start: { snake: SHORT, dir: 'right' } });
  sim.lockUniverse('mushroom');
  const ap = createAutopilot(sim);
  let foods = 0, checks = 0, spawns = 0, prevMush = null;
  sim.on('ate', () => {
    foods++;
    if (foods % MUSHROOM.every === 0) { checks++; assert.ok(sim.snapshot().mushroom, `a mushroom after food ${foods}`); }
  });
  for (let i = 0; i < 4000 && sim.snapshot().alive; i++) {
    ap.update();
    sim.step();
    const s = sim.snapshot();
    if (s.mushroom && (!prevMush || s.mushroom.x !== prevMush.x || s.mushroom.y !== prevMush.y)) {
      spawns++;
      assert.ok(man(s.mushroom, s.snake[0]) >= MUSHROOM.minHeadDist, 'spawned away from the head');
    }
    prevMush = s.mushroom;
  }
  assert.ok(checks >= 10 && spawns >= 10);
  // Released: the flow moves on and the mushroom goes with Mushroom Land.
  sim.lockUniverse(null);
  let left = false;
  sim.on('shift', (e) => {
    const s = sim.snapshot();
    if (!s.universe.mushrooms) { left = true; assert.equal(s.mushroom, null, `removed on the way to ${e.to}`); }
  });
  for (let i = 0; i < 4000 && sim.snapshot().alive; i++) {
    ap.update();
    sim.step();
    const s = sim.snapshot();
    if (!s.universe.mushrooms) assert.equal(s.mushroom, null);
    if (s.waiting === 'respawn') sim.setPaused(false);
  }
  assert.ok(left);
});
