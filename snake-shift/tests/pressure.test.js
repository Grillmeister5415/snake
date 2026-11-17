// Musical pressure estimate (SOUND_PLAN 2.4): every row of its table, in box, lane and cube,
// checked against real createSim() snapshots and, where it matters, against what the sim then does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim.js';
import { UNIVERSES } from '../src/rules-config.js';
import { createPressure, pressureOf } from '../src/pressure.js';

const xy = (pts) => pts.map(([x, y]) => ({ x, y }));
function sim(universe, snake, dir, food = [0, 15], extra = {}) {
  const s = createSim({ universes: UNIVERSES, seed: 4, start: { universe, snake: xy(snake), dir, food: { x: food[0], y: food[1] }, ...extra } });
  s.setPaused(false);
  return s;
}

test('safe movement along a wall is low', () => {
  const s = sim('arcade', [[4, 15], [3, 15], [2, 15]], 'right', [2, 2]);
  for (let i = 0; i < 6; i++) {
    const p = pressureOf(s.snapshot());
    assert.ok(p.danger <= 0.12, `step ${i}: ${p.danger}`);
    assert.equal(p.exits, 2);
    s.step();
  }
});

test('heading at a wall in the open rises only in the last cells and stays at or below 0.4', () => {
  const s = sim('arcade', [[6, 8], [5, 8], [4, 8]], 'right', [2, 2]);
  const seen = [];
  while (s.snapshot().alive && s.snapshot().snake[0].x <= 15 && seen.length < 12) {
    seen.push(pressureOf(s.snapshot()).danger);
    if (s.snapshot().snake[0].x === 15) break;
    s.step();
  }
  assert.ok(seen.every((d) => d < 0.4), `below the tense threshold: ${seen.join(' ')}`);
  assert.ok(seen.slice(0, 5).every((d) => d === 0), `far from the wall: ${seen.join(' ')}`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] - 1e-9, 'rises as the wall nears');
  assert.ok(seen.at(-1) > 0.3);
});

test('a one-cell corridor between body and wall holds around 0.55', () => {
  const body = [[3, 0], [2, 0], [1, 0], [0, 0]];
  for (let x = 0; x <= 13; x++) body.push([x, 1]);
  const s = sim('arcade', body, 'right', [8, 10]);
  // The tail end of the lower row moves away, so the corridor lasts five steps, then it opens.
  for (let i = 0; i < 5; i++) {
    const p = pressureOf(s.snapshot());
    assert.equal(p.exits, 1);
    assert.ok(p.danger >= 0.5 && p.danger <= 0.7, `step ${i}: ${p.danger}`);
    s.step();
  }
  assert.ok(pressureOf(s.snapshot()).danger <= 0.12, 'open again');
});

test('a small enclosed pocket is high through room', () => {
  // A ring of body around a 2x2 pocket in the middle of the board; the head is inside.
  const ring = [[7, 7], [7, 8], [6, 8], [6, 9], [7, 9], [8, 9], [9, 9], [9, 8], [9, 7], [9, 6], [8, 6], [7, 6], [6, 6], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10]];
  const s = sim('arcade', ring, 'up', [0, 0]);
  const p = pressureOf(s.snapshot());
  assert.ok(p.room <= 3, `room ${p.room}`);
  assert.ok(p.danger >= 0.6, `${p.danger}`);
});

test('no legal move, or a queued turn into the body, is 1', () => {
  const s = sim('arcade', [[0, 0], [0, 1], [1, 1], [1, 0], [2, 0], [3, 0]], 'up', [9, 9]);
  const p = pressureOf(s.snapshot());
  assert.equal(p.exits, 0);
  assert.equal(p.danger, 1);
  assert.equal(p.certain, true);
  const q = sim('arcade', [[5, 5], [4, 5], [4, 6], [5, 6], [6, 6], [7, 6]], 'right', [12, 1]);
  assert.ok(pressureOf(q.snapshot()).danger < 0.5);
  assert.ok(q.queueTurn('down'));
  const r = pressureOf(q.snapshot());
  assert.equal(r.danger, 1);
  assert.equal(r.certain, true);
  q.step();
  assert.equal(q.snapshot().lives, 2, 'the sim agrees: that turn is a collision');
});

test('the next step follows turns[0], never heading', () => {
  // Against the right wall, moving right: a queued up-turn is the next move, so no collision is coming.
  const s = sim('arcade', [[15, 8], [14, 8], [13, 8]], 'right', [2, 2]);
  assert.ok(pressureOf(s.snapshot()).ahead === 0);
  s.queueTurn('up');
  s.queueTurn('left');
  const snap = s.snapshot();
  assert.equal(snap.heading, 'left');
  assert.deepEqual([...snap.turns], ['up', 'left']);
  const p = pressureOf(snap);
  assert.ok(p.ahead >= 1, `ahead ${p.ahead}`);
  assert.equal(p.certain, false);
});

test('the tail cell ahead is free without food, a collision when the step eats', () => {
  const loop = [[6, 5], [6, 6], [5, 6], [5, 5]]; // head (6,5), came from below; tail (5,5) to the left
  const a = sim('arcade', loop, 'up', [12, 12]);
  a.queueTurn('left');
  const pa = pressureOf(a.snapshot());
  assert.equal(pa.certain, false);
  assert.ok(pa.ahead >= 1);
  a.step();
  assert.equal(a.snapshot().lives, 3, 'the sim agrees: the tail moved away');
  const b = sim('arcade', loop, 'up', [5, 5]); // the dot sits on the tail cell
  b.queueTurn('left');
  const pb = pressureOf(b.snapshot());
  assert.equal(pb.ahead, 0);
  assert.equal(pb.danger, 1);
  b.step();
  assert.equal(b.snapshot().lives, 2, 'the sim agrees: eating keeps the tail');
});

test('hidden body cells: with the true tail unknown, every visible cell counts', () => {
  const snap = {
    alive: true, paused: false, waiting: null, space: { kind: 'box' }, body: null, food: null, mushroom: null,
    snake: xy([[6, 5], [6, 6], [5, 6], [5, 5]]), length: 9, dir: 'up', turns: ['left'], stepMs: 120,
  };
  const p = pressureOf(snap);
  assert.equal(p.ahead, 0);
  assert.equal(p.danger, 1);
  assert.equal(pressureOf({ ...snap, length: 4 }).ahead >= 1, true, 'known tail: free');
});

test('lane: moving forward for any distance never meets a wall', () => {
  const s = sim('lane', [[8, 9], [8, 10], [8, 11]], 'up', [0, 15]);
  assert.equal(s.snapshot().space.kind, 'lane');
  for (let i = 0; i < 60; i++) {
    const p = pressureOf(s.snapshot());
    assert.equal(p.ahead, 6, `step ${i}`);
    assert.equal(p.danger, 0);
    s.step();
    assert.ok(s.snapshot().alive && s.snapshot().lives === 3);
  }
  // The side walls are walls.
  const w = sim('lane', [[15, 9], [14, 9], [13, 9]], 'right', [0, 15]);
  assert.equal(pressureOf(w.snapshot()).ahead, 0);
});

test('cube: a seam ahead is not a wall, the path continues on the next face', () => {
  const s = sim('castle', [[8, 2], [8, 3], [8, 4]], 'up', [0, 15]);
  assert.equal(s.snapshot().space.kind, 'cube');
  const faces = new Set();
  for (let i = 0; i < 8; i++) {
    const p = pressureOf(s.snapshot());
    assert.equal(p.ahead, 6, `step ${i}`);
    assert.ok(p.danger <= 0.1, `step ${i}: ${p.danger}`);
    s.step();
    faces.add(s.snapshot().space.face);
  }
  assert.ok(faces.size >= 2, 'crossed a seam');
  assert.equal(s.snapshot().lives, 3);
});

test('paused, waiting and dead give 0', () => {
  const s = createSim({ universes: UNIVERSES, seed: 1 });
  assert.equal(pressureOf(s.snapshot()).danger, 0, 'waiting to start');
  const t = sim('arcade', [[0, 0], [0, 1], [1, 1], [1, 0], [2, 0], [3, 0]], 'up', [9, 9], { lives: 1 });
  t.setPaused(true);
  assert.equal(pressureOf(t.snapshot()).danger, 0, 'paused');
  t.setPaused(false);
  t.step();
  assert.equal(t.snapshot().alive, false);
  assert.equal(pressureOf(t.snapshot()).danger, 0, 'dead');
  assert.equal(pressureOf(null).danger, 0);
});

test('identical input gives identical output; buffers are reused across spaces', () => {
  const ev = createPressure();
  const snaps = [
    sim('arcade', [[3, 0], [2, 0], [1, 0], [0, 0]], 'right', [8, 10]).snapshot(),
    sim('lane', [[8, 9], [8, 10], [8, 11]], 'up').snapshot(),
    sim('castle', [[8, 0], [8, 1], [8, 2]], 'up').snapshot(),
  ];
  const first = snaps.map((s) => ({ ...ev.evaluate(s) }));
  for (let k = 0; k < 3; k++) snaps.forEach((s, i) => assert.deepEqual({ ...ev.evaluate(s) }, first[i]));
  snaps.forEach((s, i) => assert.deepEqual(pressureOf(s), first[i]));
});
