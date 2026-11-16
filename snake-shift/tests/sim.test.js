import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, stepMsFor } from '../src/sim.js';
import { createAutopilot } from '../src/autopilot.js';
import { isSpecial } from '../src/flow.js';
import { SPEED } from '../src/config.js';
import { UNIVERSES, LANE, LIVES } from '../src/rules-config.js';

const head = (s) => s.snapshot().snake[0];
const plain = (v) => JSON.parse(JSON.stringify(v));
const SPECIAL_IDS = new Set(UNIVERSES.filter(isSpecial).map((u) => u.id));

/** Invariants every snapshot must hold (LEVELS_PLAN 3.3). */
function checkSnap(s) {
  assert.equal(s.cols, 16);
  assert.equal(s.rows, 16);
  const seen = new Set();
  for (const c of s.snake) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x < 16 && c.y < 16, `visible cell on the board ${JSON.stringify(c)}`);
    const k = c.y * 16 + c.x;
    assert.ok(!seen.has(k), 'visible cells unique');
    seen.add(k);
  }
  const br = new Set(s.breaks);
  for (let k = 0; k + 1 < s.snake.length; k++) {
    if (br.has(k)) continue;
    const a = s.snake[k], b = s.snake[k + 1];
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, 'joined cells are adjacent');
  }
  for (let i = 0; i < s.breaks.length; i++) {
    assert.ok(s.breaks[i] >= 0 && s.breaks[i] < s.snake.length - 1);
    if (i) assert.ok(s.breaks[i] > s.breaks[i - 1]);
  }
  assert.ok(s.length >= s.snake.length);
  if (s.food) {
    assert.ok(s.food.x >= 0 && s.food.y >= 0 && s.food.x < 16 && s.food.y < 16);
    assert.ok(!seen.has(s.food.y * 16 + s.food.x), 'dot never on the snake');
  }
  if (s.mushroom) {
    assert.ok(!seen.has(s.mushroom.y * 16 + s.mushroom.x), 'mushroom never on the snake');
    assert.ok(!s.food || s.food.x !== s.mushroom.x || s.food.y !== s.mushroom.y);
  }
  assert.ok(s.lives >= 0 && s.lives <= LIVES.max, `lives ${s.lives}`);
  assert.equal(s.maxLives, LIVES.max);
  if (s.space.kind === 'box') {
    assert.equal(s.body, null);
    assert.equal(s.foodAt, null);
  } else {
    assert.ok(Array.isArray(s.body) && s.body.length >= s.snake.length);
    assert.ok(s.body.length <= s.length);
  }
  if (s.space.kind === 'cube') assert.ok(s.space.face >= 0 && s.space.face < 6 && s.space.rot >= 0 && s.space.rot < 4);
  if (s.alive) assert.ok(s.snake.length > 0, 'the head is always on the board');
}

/** Record pre-shift snapshots and check that no shift moves a cell. Returns stats. */
function watchShifts(sim) {
  const stats = { shifts: 0, specials: 0, held: 0, kinds: new Set() };
  let pre = null;
  sim.on('ate', (e) => { pre = sim.snapshot(); if (e.held) stats.held++; });
  sim.on('shift', (e) => {
    const s = sim.snapshot();
    stats.shifts++;
    if (SPECIAL_IDS.has(e.to)) stats.specials++;
    stats.kinds.add(s.space.kind);
    assert.equal(s.universe.id, e.to, 'the shift listener already sees the new universe');
    if (pre) {
      assert.deepEqual(plain(s.snake), plain(pre.snake), 'a shift never moves a visible cell');
      assert.deepEqual(plain(s.breaks), plain(pre.breaks));
      assert.equal(s.length, pre.length);
      assert.equal(s.dir, pre.dir);
      assert.equal(s.score, pre.score);
      // Everything that was not on the board is off-board now.
      if (s.body) assert.equal(s.body.length, s.snake.length);
    }
    pre = null;
  });
  return stats;
}

// ---------------------------------------------------------------- classic checks

test('one cell per tick', () => {
  const sim = createSim({ seed: 1 });
  const a = head(sim);
  assert.equal(sim.snapshot().paused, true, 'reset leaves the run paused');
  sim.step();
  const s = sim.snapshot();
  assert.deepEqual({ ...s.snake[0] }, { x: a.x + 1, y: a.y });
  assert.equal(s.snake.length, 3);
  assert.equal(s.tick, 1);
  assert.equal(s.prevTail.x, a.x - 2);
});

test('two-turn queue', () => {
  const sim = createSim({ seed: 2 });
  assert.equal(sim.queueTurn('up'), true);
  assert.equal(sim.queueTurn('left'), true);
  assert.equal(sim.queueTurn('down'), false, 'queue holds at most two');
  sim.step();
  assert.equal(sim.snapshot().dir, 'up');
  sim.step();
  assert.equal(sim.snapshot().dir, 'left');
  assert.equal(sim.snapshot().prevDir, 'up');
  sim.step();
  assert.equal(sim.snapshot().dir, 'left');
});

test('reversal rejected, including two quick turns inside one tick', () => {
  const sim = createSim({ seed: 3 });
  assert.equal(sim.queueTurn('left'), false, 'reverse of current');
  assert.equal(sim.queueTurn('right'), false, 'same as current');
  assert.equal(sim.queueTurn('up'), true);
  assert.equal(sim.queueTurn('down'), false, 'reverse of last queued');
  assert.equal(sim.queueTurn('up'), false, 'same as last queued');
  assert.equal(sim.queueTurn('left'), true, 'up then left is legal');
  const neck = sim.snapshot().snake[1];
  sim.step();
  sim.step();
  const s = sim.snapshot();
  assert.equal(s.alive, true);
  assert.notDeepEqual({ ...s.snake[0] }, { ...neck });
});

function runToDeath(sim, turns = []) {
  for (const t of turns) { assert.equal(sim.queueTurn(t), true); sim.step(); }
  let guard = 0;
  while (sim.snapshot().alive && sim.snapshot().waiting !== 'respawn' && guard++ < 100) sim.step();
  return sim.snapshot();
}

for (const [wall, turns, expect] of [
  ['top', ['up'], (s) => s.snake[0].y === 0 && s.death.cell.y === -1],
  ['bottom', ['down'], (s) => s.snake[0].y === s.rows - 1 && s.death.cell.y === s.rows],
  ['right', [], (s) => s.snake[0].x === s.cols - 1 && s.death.cell.x === s.cols],
  ['left', ['up', 'left'], (s) => s.snake[0].x === 0 && s.death.cell.x === -1],
]) {
  test(`death on the ${wall} wall, no wrap`, () => {
    // Dot parked far away so nothing grows. One life left, so the collision ends the run.
    const sim = createSim({ start: { lives: 1, snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 0, y: 15 } } });
    const s = runToDeath(sim, turns);
    assert.equal(s.alive, false);
    assert.equal(s.lives, 0);
    assert.equal(s.death.reason, 'wall');
    assert.ok(expect(s), JSON.stringify(s.snake[0]));
  });
}

test('death on self', () => {
  const sim = createSim({ start: { lives: 1, snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }, { x: 1, y: 5 }], dir: 'right', food: { x: 15, y: 15 } } });
  sim.queueTurn('up'); sim.step();
  sim.queueTurn('left'); sim.step();
  sim.queueTurn('down'); sim.step();
  const s = sim.snapshot();
  assert.equal(s.alive, false);
  assert.equal(s.death.reason, 'self');
  assert.deepEqual({ ...s.death.cell }, { x: 4, y: 5 });
});

test('moving into the vacating tail is legal', () => {
  const sim = createSim({ start: { snake: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }], dir: 'up', food: { x: 10, y: 10 } } });
  assert.equal(sim.queueTurn('right'), true);
  sim.step();
  const s = sim.snapshot();
  assert.equal(s.alive, true);
  assert.deepEqual({ ...s.snake[0] }, { x: 2, y: 1 });
  assert.equal(s.snake.length, 4);
});

test('speed curve values', () => {
  assert.equal(stepMsFor(0, SPEED), 150);
  assert.equal(stepMsFor(1, SPEED), 148.5);
  assert.equal(stepMsFor(10, SPEED), 135);
  assert.equal(stepMsFor(36, SPEED), 96);
  assert.equal(stepMsFor(37, SPEED), 95);
  assert.equal(stepMsFor(500, SPEED), 95);
});

test('advance consumes time exactly; a bite changes speed from the next step', () => {
  const sim = createSim({ start: { snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 10, y: 8 } } });
  assert.equal(sim.advance(500), 0, 'paused runs do not tick');
  sim.setPaused(false);
  assert.equal(sim.advance(100), 0);
  assert.equal(sim.advance(50), 1);
  assert.equal(sim.snapshot().progress, 0);
  assert.equal(sim.advance(75), 0);
  assert.equal(sim.snapshot().progress, 0.5);
  assert.equal(sim.advance(75), 1, 'eats on this tick');
  assert.equal(sim.snapshot().score, 1);
  assert.equal(sim.snapshot().stepMs, 148.5);
  assert.equal(sim.advance(148), 0);
  assert.equal(sim.advance(0.5), 1);
  assert.equal(sim.advance(148.5 * 3), 3);
});

test('snapshots reject mutation', () => {
  const sim = createSim({ seed: 5 });
  const s = sim.snapshot();
  assert.throws(() => { s.score = 99; }, TypeError);
  assert.throws(() => { s.snake.push({ x: 0, y: 0 }); }, TypeError);
  assert.throws(() => { s.snake[0].x = 3; }, TypeError);
  assert.throws(() => { s.food.y = 3; }, TypeError);
  assert.throws(() => { s.prevTail.x = 3; }, TypeError);
  assert.throws(() => { s.breaks.push(1); }, TypeError);
  assert.throws(() => { s.universe.id = 'x'; }, TypeError);
  assert.throws(() => { s.space.kind = 'cube'; }, TypeError);
  sim.lockUniverse('castle');
  const c = sim.snapshot();
  assert.throws(() => { c.body[0].u = 1; }, TypeError);
  assert.throws(() => { c.foodAt.f = 1; }, TypeError);
  assert.throws(() => { c.space.rot = 2; }, TypeError);
  sim.step();
  assert.equal(sim.snapshot().score, 0);
});

test('events fire and listeners cannot break the sim', () => {
  const sim = createSim({ start: { snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 9, y: 8 } } });
  const seen = [];
  const orig = console.error; console.error = () => {};
  try {
    for (const t of ['step', 'ate', 'shift', 'died', 'lifeLost', 'turn', 'pause', 'resume', 'reset']) {
      sim.on(t, () => { seen.push(t); throw new Error('visual bug'); });
    }
    sim.setPaused(false);
    sim.queueTurn('up');
    sim.step(); // goes up, not onto the dot
    sim.queueTurn('right');
    sim.step();
    assert.equal(sim.snapshot().alive, true);
    sim.reset();
  } finally { console.error = orig; }
  assert.deepEqual(seen, ['resume', 'turn', 'step', 'turn', 'step', 'reset']);
});

// ---------------------------------------------------------------- API and snapshot

test('createSim() with no universes uses the sixteen, opens in 3310 Ghost and waits', () => {
  const sim = createSim();
  assert.equal(sim.universes.length, 16);
  const s = sim.snapshot();
  checkSnap(s);
  for (const k of ['cols', 'rows', 'snake', 'breaks', 'length', 'dir', 'prevDir', 'heading', 'prevTail', 'grew', 'food',
    'mushroom', 'score', 'stepMs', 'tick', 'progress', 'alive', 'paused', 'waiting', 'death', 'lives', 'maxLives',
    'universe', 'space', 'body', 'foodAt', 'seed']) assert.ok(k in s, `snapshot has ${k}`);
  assert.deepEqual(plain(s.universe), { id: 'lcd', rules: 'box', mushrooms: false, index: 0, holdLeft: 0 });
  assert.deepEqual(plain(s.space), { kind: 'box' });
  assert.equal(s.waiting, 'start');
  assert.equal(s.lives, 3);
  assert.equal(s.length, 3);
  assert.deepEqual(plain(s.breaks), []);
  assert.equal(s.mushroom, null);
  sim.setPaused(false);
  assert.equal(sim.snapshot().waiting, null);
});

test('a caller table without some universes still runs, lcd first', () => {
  const sim = createSim({ seed: 9, universes: [{ id: 'lcd' }, { id: 'arcade' }, { id: 'lane', rules: 'lane', room: true }] });
  const ap = createAutopilot(sim);
  const seenIds = new Set();
  sim.on('shift', (e) => seenIds.add(e.to));
  for (let i = 0; i < 3000; i++) { ap.update(); sim.step(); if (!sim.snapshot().alive) { sim.reset(i); ap.reset(); } }
  assert.ok(seenIds.has('arcade') && seenIds.has('lane') && seenIds.has('lcd'));
  assert.equal(seenIds.size, 3);
});

test('order on a food tick: step, ate, shift; the shift listener sees the new universe and space', () => {
  const sim = createSim({ start: { snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 9, y: 8 } } });
  const log = [];
  sim.on('step', (e) => log.push(['step', e.ate]));
  sim.on('ate', (e) => log.push(['ate', e.kind, e.score, e.cell.x, e.cell.y, e.lifeGained, e.held, sim.snapshot().universe.id]));
  sim.on('shift', (e) => {
    const s = sim.snapshot();
    log.push(['shift', e.from, e.to, e.index, s.universe.id, s.universe.index, s.space.kind, !!s.food]);
  });
  sim.step();
  assert.deepEqual(log, [
    ['step', true],
    ['ate', 'dot', 1, 9, 8, false, false, 'lcd'],
    ['shift', 'lcd', 'arcade', 1, 'arcade', 1, 'box', true],
  ]);
});

test('a held bite fires only ate and holdLeft drops by one', () => {
  const sim = createSim({ seed: 3, start: { universe: 'mushroom', snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 9, y: 8 } } });
  const h = sim.snapshot().universe.holdLeft;
  assert.ok(h >= 3 && h <= 5);
  const log = [];
  for (const t of ['step', 'ate', 'shift']) sim.on(t, () => log.push(t));
  sim.step();
  assert.deepEqual(log, ['step', 'ate']);
  const s = sim.snapshot();
  assert.equal(s.universe.id, 'mushroom');
  assert.equal(s.universe.holdLeft, h - 1);
  assert.ok(s.food && !(s.food.x === 9 && s.food.y === 8), 'a new dot is placed');
});

test('lockUniverse holds one universe; null releases it', () => {
  const sim = createSim({ seed: 12 });
  const ap = createAutopilot(sim);
  assert.equal(sim.lockUniverse('lane'), true);
  assert.equal(sim.snapshot().space.kind, 'lane');
  let shifts = 0, foods = 0;
  sim.on('shift', () => shifts++);
  sim.on('ate', () => foods++);
  for (let i = 0; i < 1500 && sim.snapshot().alive; i++) { ap.update(); sim.step(); }
  assert.ok(foods > 5);
  assert.equal(shifts, 0);
  sim.lockUniverse(null);
  for (let i = 0; i < 1500 && !shifts && sim.snapshot().alive; i++) { ap.update(); sim.step(); }
  assert.ok(shifts > 0);
});

// ---------------------------------------------------------------- spaces

test('lane: no end wall in either direction, lethal sides', () => {
  for (const d of ['up', 'down']) {
    const snake = d === 'up' ? [{ x: 8, y: 8 }, { x: 8, y: 9 }, { x: 8, y: 10 }] : [{ x: 8, y: 8 }, { x: 8, y: 7 }, { x: 8, y: 6 }];
    const sim = createSim({ seed: 4, start: { universe: 'lane', snake, dir: d, food: { x: 0, y: 0 } } });
    sim.lockUniverse('lane');
    for (let i = 0; i < 200; i++) {
      sim.step();
      const s = sim.snapshot();
      checkSnap(s);
      const r = s.snake[0].y;
      if (i > 8) assert.ok(r >= LANE.bandTop && r <= LANE.bandBottom, `head row ${r}`);
      assert.ok(Math.abs(s.space.y0 - s.space.prevY0) <= 1, `smooth scroll at ${i}`);
    }
    const s = sim.snapshot();
    assert.equal(s.lives, 3);
    assert.equal(s.alive, true);
    assert.ok(Math.abs(s.body[0].y - 8) === 200, 'travelled 200 rows');
  }
  for (const side of ['left', 'right']) {
    const sim = createSim({ seed: 5, start: { universe: 'lane', snake: [{ x: 8, y: 8 }, { x: 8, y: 9 }, { x: 8, y: 10 }], dir: 'up', food: { x: 0, y: 15 } } });
    sim.queueTurn(side);
    let lost = null;
    sim.on('lifeLost', (e) => { lost = e; });
    for (let i = 0; i < 20 && !lost; i++) sim.step();
    assert.ok(lost);
    assert.equal(lost.death.reason, 'wall');
    assert.equal(lost.death.cell.x, side === 'left' ? -1 : 16);
  }
});

test('lane: dots spawn 2 to 8 rows beyond the top edge and come into view', () => {
  for (let seed = 0; seed < 40; seed++) {
    const sim = createSim({ seed });
    sim.lockUniverse('lane');
    const s = sim.snapshot();
    assert.equal(s.food, null, 'the dot is off the board at first');
    assert.ok(s.foodAt.y >= s.space.y0 - LANE.dotMax && s.foodAt.y <= s.space.y0 - LANE.dotMin, `row ${s.foodAt.y}`);
  }
  const sim = createSim({ seed: 2, start: { universe: 'lane', snake: [{ x: 8, y: 8 }, { x: 8, y: 9 }, { x: 8, y: 10 }], dir: 'up' } });
  const at = sim.snapshot().foodAt;
  let visible = false;
  for (let i = 0; i < 30 && !visible; i++) { sim.step(); visible = !!sim.snapshot().food; }
  assert.ok(visible);
  const f = sim.snapshot().food;
  assert.equal(f.y + sim.snapshot().space.y0, at.y);
});

test('cube: seams are connections, the frame keeps the direction, a straight line goes around', () => {
  const sim = createSim({ seed: 1, start: { universe: 'castle', snake: [{ x: 4, y: 8 }, { x: 4, y: 9 }, { x: 4, y: 10 }], dir: 'up', food: { x: 15, y: 15 } } });
  sim.lockUniverse('castle');
  const faces = [];
  let entered = 0;
  for (let i = 0; i < 64; i++) {
    sim.step();
    const s = sim.snapshot();
    checkSnap(s);
    assert.equal(s.dir, 'up');
    assert.equal(s.snake[0].x, 4);
    if (s.space.entered) {
      entered++;
      assert.equal(s.space.entered, 'up');
      assert.equal(s.snake[0].y, 15, 'enters on the bottom row');
      assert.notEqual(s.space.face, s.space.prevFace);
    }
    faces.push(s.space.face);
  }
  assert.equal(entered, 4);
  assert.equal(new Set(faces).size, 4);
  const s = sim.snapshot();
  assert.deepEqual([s.space.face, s.snake[0].x, s.snake[0].y, s.space.rot], [0, 4, 8, 0]);
  assert.ok(s.alive && s.lives === 3);
});

test('cube: self-collision is checked across faces', () => {
  const snake = [];
  for (let y = 3; y <= 12; y++) snake.push({ x: 4, y });
  const sim = createSim({ seed: 1, start: { universe: 'castle', lives: 1, snake, dir: 'up', food: { x: 14, y: 14 } } });
  for (const t of ['up', 'up', 'up', 'up', 'right', 'right', 'down', 'left', 'up']) {
    if (t !== sim.snapshot().dir) assert.equal(sim.queueTurn(t), true, t);
    sim.step();
  }
  const s = sim.snapshot();
  assert.equal(s.alive, false);
  assert.equal(s.death.reason, 'self');
  assert.deepEqual(plain(s.death.cell), { x: 5, y: -1 });
  assert.equal(s.space.face, 0, 'the head stayed on its face');
});

test('every space pair transition preserves cells and marks off-board cells', () => {
  // A long serpentine on the box, head last laid.
  const path = [];
  for (let y = 15; path.length < 40; y--) for (let i = 0; i < 16 && path.length < 40; i++) path.push({ x: (15 - y) % 2 ? 15 - i : i, y });
  const snake = path.reverse();
  const sim = createSim({ seed: 21, start: { snake, dir: 'right' } });
  const ap = createAutopilot(sim);
  watchShifts(sim);
  const hidden = (s) => s.length - s.snake.length;
  const pairs = [];
  const go = (id) => {
    const before = sim.snapshot();
    let inside = null;
    const off = sim.on('shift', () => { inside = sim.snapshot(); });
    assert.equal(sim.lockUniverse(id), true);
    off();
    const after = sim.snapshot();
    assert.deepEqual(plain(inside), plain(after));
    assert.deepEqual(plain(after.snake), plain(before.snake), `${before.space.kind} -> ${after.space.kind}`);
    assert.deepEqual(plain(after.breaks), plain(before.breaks));
    assert.equal(after.length, before.length);
    assert.equal(after.dir, before.dir);
    assert.equal(hidden(after), hidden(before), 'cells off the board stay off the board');
    if (after.body) assert.equal(after.body.length, after.snake.length);
    pairs.push(`${before.space.kind}>${after.space.kind}`);
    checkSnap(after);
  };
  const runUntil = (cond, max = 400) => {
    for (let i = 0; i < max; i++) {
      if (cond(sim.snapshot())) return true;
      ap.update(); sim.step();
      assert.ok(sim.snapshot().alive && sim.snapshot().waiting === null, 'no collision while moving');
    }
    return false;
  };
  go('lane');
  assert.ok(runUntil((s) => hidden(s) > 3), 'lane: body behind the window');
  go('castle');
  assert.ok(hidden(sim.snapshot()) > 3);
  assert.ok(runUntil((s) => s.body.length > s.snake.length), 'cube: body on another face');
  go('lcd');
  assert.ok(hidden(sim.snapshot()) > 0);
  go('castle'); // straight back: the off-board cells are still there
  assert.ok(hidden(sim.snapshot()) > 0);
  assert.ok(runUntil((s) => s.body.length > s.snake.length));
  go('lane');
  assert.ok(runUntil((s) => s.body.length > s.snake.length));
  go('lcd');
  assert.deepEqual(pairs, ['box>lane', 'lane>cube', 'cube>box', 'box>cube', 'cube>lane', 'lane>box']);
});

test('off-board cells are harmless and expire from the tail end', () => {
  // A lane snake with a U-bend below the window: the visible body is interrupted.
  const snake = [];
  for (let y = 8; y <= 17; y++) snake.push({ x: 3, y });
  for (let y = 17; y >= 12; y--) snake.push({ x: 4, y });
  const sim = createSim({ seed: 2, start: { universe: 'lane', snake, dir: 'up', food: { x: 12, y: 2 } } });
  let s = sim.snapshot();
  assert.equal(s.length, 16);
  assert.equal(s.snake.length, 12);
  assert.deepEqual(plain(s.breaks), [7], 'break where the body leaves the window and comes back');
  sim.lockUniverse('lcd');
  s = sim.snapshot();
  assert.deepEqual(plain(s.breaks), [7]);
  assert.equal(s.length - s.snake.length, 4);
  // Walk down the right side; the head passes rows 16..17 of the old lane's x = 3, 4 never existed on the box.
  let prevHidden = 4;
  for (const t of ['right', 'right', 'right', 'right', 'down', 'down', 'down', 'down', 'down', 'down']) {
    if (t !== sim.snapshot().dir) sim.queueTurn(t);
    sim.step();
    s = sim.snapshot();
    checkSnap(s);
    assert.ok(s.alive && s.waiting === null);
    assert.equal(s.length, 16, 'length untouched');
    const h = s.length - s.snake.length;
    assert.ok(h <= prevHidden);
    prevHidden = h;
  }
  // The tail end held the bend's last cells (visible), then the off-board ones; all used up within 16 ticks.
  sim.queueTurn('left');
  for (let i = 0; i < 6; i++) sim.step();
  s = sim.snapshot();
  assert.equal(s.length - s.snake.length, 0, 'off-board cells expired');
  assert.deepEqual(plain(s.breaks), []);
});

test('spawns are on reachable free cells', () => {
  // An L-shaped body seals the top-left 3x3 pocket; the head is outside it.
  const snake = [{ x: 4, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 },
    { x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 }, { x: 0, y: 6 }];
  for (let seed = 0; seed < 150; seed++) {
    const sim = createSim({ seed, start: { universe: 'mushroom', snake, dir: 'right' } });
    const f = sim.snapshot().food;
    assert.ok(!(f.x < 3 && f.y < 3), `dot in the sealed pocket (seed ${seed})`);
    sim.step();
    const m = sim.snapshot().mushroom;
    assert.ok(m, 'mushroom spawned');
    assert.ok(!(m.x < 3 && m.y < 3), `mushroom in the sealed pocket (seed ${seed})`);
  }
});

// ---------------------------------------------------------------- long runs

test('replay: same seed and inputs give the same run across all three spaces', () => {
  const record = () => {
    const sim = createSim({ seed: 'replay' });
    const ap = createAutopilot(sim);
    const kinds = new Set();
    const out = [];
    for (let i = 0; i < 12000; i++) {
      ap.update();
      sim.step();
      const s = sim.snapshot();
      kinds.add(s.space.kind);
      out.push(JSON.stringify(s));
      if (!s.alive) { sim.reset(`r${i}`); ap.reset(); }
    }
    return { out, kinds };
  };
  const a = record(), b = record();
  assert.deepEqual([...a.kinds].sort(), ['box', 'cube', 'lane'], 'the run visits all three spaces');
  assert.equal(a.out.length, b.out.length);
  for (let i = 0; i < a.out.length; i++) if (a.out[i] !== b.out[i]) assert.fail(`runs differ at tick ${i}`);
});

test('2,000 food events over random universes keep every invariant', () => {
  const sim = createSim({ seed: 'soak' });
  const ap = createAutopilot(sim);
  const stats = watchShifts(sim);
  let foods = 0, runs = 0, lost = 0, maxLives = 0;
  sim.on('ate', () => { foods++; });
  sim.on('lifeLost', (e) => { lost++; assert.ok(e.lives >= 1); });
  for (let i = 0; i < 400000 && foods < 2000; i++) {
    ap.update();
    sim.step();
    const s = sim.snapshot();
    checkSnap(s);
    maxLives = Math.max(maxLives, s.lives);
    if (!s.alive) { runs++; sim.reset(`soak-${runs}`); ap.reset(); }
  }
  assert.ok(foods >= 2000, `food events ${foods}`);
  assert.ok(maxLives <= LIVES.max);
  assert.deepEqual([...stats.kinds].sort(), ['box', 'cube', 'lane']);
  const share = stats.specials / stats.shifts;
  assert.ok(share > 0.06 && share < 0.15, `special universes about one shift in ten (${share.toFixed(3)})`);
  assert.ok(lost > 0);
});
