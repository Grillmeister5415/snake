import test from 'node:test';
import assert from 'node:assert/strict';
import { steerFor } from '../src/input.js';
import { createSim } from '../src/sim.js';

test('board views pass grid directions through unchanged', () => {
  for (const dir of ['up', 'down', 'left', 'right']) {
    for (const heading of ['up', 'down', 'left', 'right']) {
      assert.equal(steerFor(dir, 'board', heading), dir);
    }
  }
});

test('first person: left and right turn relative to the heading', () => {
  const left = { up: 'left', left: 'down', down: 'right', right: 'up' };
  const right = { up: 'right', right: 'down', down: 'left', left: 'up' };
  for (const heading of Object.keys(left)) {
    assert.equal(steerFor('left', 'pov', heading), left[heading]);
    assert.equal(steerFor('right', 'pov', heading), right[heading]);
  }
});

test('first person: up and down are ignored', () => {
  for (const heading of ['up', 'down', 'left', 'right']) {
    assert.equal(steerFor('up', 'pov', heading), null);
    assert.equal(steerFor('down', 'pov', heading), null);
  }
});

test('snapshot heading follows queued turns, so two quick lefts make a U-turn', () => {
  const sim = createSim({ seed: 11 });
  sim.reset(11);
  sim.setPaused(false);
  assert.equal(sim.snapshot().heading, sim.snapshot().dir);

  const start = sim.snapshot().dir;
  const first = steerFor('left', 'pov', sim.snapshot().heading);
  assert.equal(sim.queueTurn(first), true);
  assert.equal(sim.snapshot().heading, first, 'heading reflects the queued turn before it is applied');

  const second = steerFor('left', 'pov', sim.snapshot().heading);
  assert.equal(sim.queueTurn(second), true);
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  assert.equal(second, opposite[start]);

  sim.step();
  assert.equal(sim.snapshot().dir, first);
  sim.step();
  assert.equal(sim.snapshot().dir, second);
  assert.equal(sim.snapshot().heading, second);
});

// ---------------------------------------------------------------- autopilot in all three spaces

import { createAutopilot, chooseDir } from '../src/autopilot.js';
import { createSpace, fromBoard, stepIn } from '../src/space.js';

for (const [id, kind] of [['lcd', 'box'], ['lane', 'lane'], ['castle', 'cube']]) {
  test(`autopilot steers through queueTurn alone in the ${kind}`, () => {
    const sim = createSim({ seed: `steer-${id}` });
    sim.lockUniverse(id);
    let turns = 0;
    // The autopilot gets nothing but snapshot() and queueTurn(), like a player.
    const ap = createAutopilot({ snapshot: () => sim.snapshot(), queueTurn: (d) => { turns++; return sim.queueTurn(d); } });
    let foods = 0, lost = 0, entered = 0, minY0 = 0, maxY0 = 0;
    const faces = new Set();
    sim.on('ate', () => foods++);
    sim.on('lifeLost', () => lost++);
    for (let i = 0; i < 4000 && sim.snapshot().alive; i++) {
      ap.update();
      sim.step();
      const s = sim.snapshot();
      assert.equal(s.space.kind, kind);
      if (s.space.kind === 'cube') { faces.add(s.space.face); if (s.space.entered) entered++; }
      if (s.space.kind === 'lane') { minY0 = Math.min(minY0, s.space.y0); maxY0 = Math.max(maxY0, s.space.y0); }
    }
    assert.ok(turns > 20, `turns ${turns}`);
    assert.ok(foods >= 40, `foods ${foods}`);
    assert.ok(lost <= 2, `lives lost ${lost}`);
    if (kind === 'cube') { assert.equal(faces.size, 6); assert.ok(entered >= 20, `seams crossed ${entered}`); }
    if (kind === 'lane') assert.ok(maxY0 - minY0 >= 100, `lane travelled ${maxY0 - minY0} rows`);
  });
}

test('chooseDir knows the walls of each space', () => {
  const snap = (space, cells, dir, extra = {}) => {
    const body = cells.map(([x, y]) => fromBoard(space, x, y));
    return {
      cols: 16, rows: 16, dir, length: body.length, food: null, foodAt: null, mushroom: null, space,
      snake: cells.map(([x, y]) => ({ x, y })), body: space.kind === 'box' ? null : body, ...extra,
    };
  };
  const box = createSpace('box');
  assert.notEqual(chooseDir(snap(box, [[15, 8], [14, 8], [13, 8]], 'right')), 'right', 'box wall');
  assert.notEqual(chooseDir(snap(box, [[8, 0], [8, 1], [8, 2]], 'up')), 'up', 'box wall');
  const lane = createSpace('lane');
  assert.notEqual(chooseDir(snap(lane, [[0, 8], [1, 8], [2, 8]], 'left')), 'left', 'lane side wall');
  assert.equal(chooseDir(snap(lane, [[8, 0], [8, 1], [8, 2]], 'up', { foodAt: { x: 8, y: -6 } })), 'up', 'no end wall');
  const cube = createSpace('cube');
  let beyond = fromBoard(cube, 8, 0);
  for (let k = 0; k < 3; k++) beyond = stepIn(cube, beyond, 'up').cell; // three cells past the top seam
  assert.notEqual(beyond.f, 0);
  assert.equal(chooseDir(snap(cube, [[8, 0], [8, 1], [8, 2]], 'up', { foodAt: beyond })), 'up', 'a seam is a way through');
  // The body blocks: a hook to the left leaves only one way out.
  assert.equal(chooseDir(snap(box, [[5, 5], [5, 6], [4, 6], [4, 5], [4, 4], [5, 4], [6, 4]], 'up')), 'right');
});
