import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, stepMsFor } from '../src/sim.js';
import { createAutopilot } from '../src/autopilot.js';
import { SPEED } from '../src/config.js';

const head = (s) => s.snapshot().snake[0];

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

test('long autopilot run keeps the invariants', () => {
  const sim = createSim({ seed: 'invariants' });
  const ap = createAutopilot(sim);
  let runs = 0, maxScore = 0;
  for (let i = 0; i < 30000; i++) {
    ap.update();
    sim.step();
    const s = sim.snapshot();
    assert.equal(s.snake.length, 3 + s.score);
    const seen = new Set();
    for (const c of s.snake) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x < s.cols && c.y < s.rows, 'cell inside grid');
      const k = c.y * s.cols + c.x;
      assert.ok(!seen.has(k), 'no duplicate cells');
      seen.add(k);
    }
    if (s.food) {
      assert.ok(!seen.has(s.food.y * s.cols + s.food.x), 'dot never on the snake');
      assert.ok(s.food.x >= 0 && s.food.y >= 0 && s.food.x < s.cols && s.food.y < s.rows);
    }
    if (!s.alive) {
      maxScore = Math.max(maxScore, s.score);
      runs++;
      sim.reset(`invariants-${runs}`);
      ap.reset();
    }
  }
  assert.ok(maxScore >= 10, `autopilot should eat a fair amount (best ${maxScore})`);
});

function runToDeath(sim, turns = []) {
  for (const t of turns) { assert.equal(sim.queueTurn(t), true); sim.step(); }
  let guard = 0;
  while (sim.snapshot().alive && guard++ < 100) sim.step();
  return sim.snapshot();
}

for (const [wall, turns, expect] of [
  ['top', ['up'], (s) => s.snake[0].y === 0 && s.death.cell.y === -1],
  ['bottom', ['down'], (s) => s.snake[0].y === s.rows - 1 && s.death.cell.y === s.rows],
  ['right', [], (s) => s.snake[0].x === s.cols - 1 && s.death.cell.x === s.cols],
  ['left', ['up', 'left'], (s) => s.snake[0].x === 0 && s.death.cell.x === -1],
]) {
  test(`death on the ${wall} wall, no wrap`, () => {
    // Dot parked far away so nothing grows.
    const sim = createSim({ start: { snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 0, y: 15 } } });
    if (wall === 'bottom') sim.reset();
    const s = runToDeath(sim, turns);
    assert.equal(s.alive, false);
    assert.equal(s.death.reason, 'wall');
    assert.ok(expect(s), JSON.stringify(s.snake[0]));
  });
}

test('death on self', () => {
  const sim = createSim({ start: { snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }, { x: 1, y: 5 }], dir: 'right', food: { x: 15, y: 15 } } });
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

test('same seed and inputs give the same run', () => {
  const record = () => {
    const sim = createSim({ seed: 'determinism' });
    const ap = createAutopilot(sim);
    const out = [];
    for (let i = 0; i < 4000; i++) {
      ap.update();
      sim.step();
      out.push(JSON.stringify(sim.snapshot()));
      if (!sim.snapshot().alive) { sim.reset(`d${i}`); ap.reset(); }
    }
    return out;
  };
  assert.deepEqual(record(), record());
});

test('snapshots reject mutation', () => {
  const sim = createSim({ seed: 5 });
  const s = sim.snapshot();
  assert.throws(() => { s.score = 99; }, TypeError);
  assert.throws(() => { s.snake.push({ x: 0, y: 0 }); }, TypeError);
  assert.throws(() => { s.snake[0].x = 3; }, TypeError);
  assert.throws(() => { s.food.y = 3; }, TypeError);
  assert.throws(() => { s.prevTail.x = 3; }, TypeError);
  sim.step();
  assert.equal(sim.snapshot().score, 0);
});

test('events fire and listeners cannot break the sim', () => {
  const sim = createSim({ start: { snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }], dir: 'right', food: { x: 9, y: 8 } } });
  const seen = [];
  const orig = console.error; console.error = () => {};
  try {
    for (const t of ['step', 'ate', 'died', 'turn', 'pause', 'resume', 'reset']) {
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
