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
