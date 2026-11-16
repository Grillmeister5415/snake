import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlow, isSpecial, normaliseUniverses } from '../src/flow.js';
import { createRng } from '../src/rng.js';
import { UNIVERSES, SPECIAL, FLOW } from '../src/rules-config.js';

/** Play `foods` food events and record what happened on each. */
function play(seed, foods, universes = UNIVERSES) {
  const flow = createFlow({ universes, rng: createRng(seed) });
  flow.reset();
  const log = [];
  for (let s = 1; s <= foods; s++) {
    const before = flow.current();
    const r = flow.onFood(s);
    log.push({ score: s, from: before.id, to: flow.current().id, shift: r.shift, reset: !!r.reset, holdLeft: flow.current().holdLeft });
  }
  return log;
}

const byId = new Map(UNIVERSES.map((u) => [u.id, u]));
const special = (id) => isSpecial(byId.get(id));

test('the built-in table has the sixteen universes with their rules', () => {
  assert.equal(UNIVERSES.length, 16);
  assert.deepEqual(UNIVERSES.filter(isSpecial).map((u) => u.id).sort(), ['castle', 'lane', 'mushroom']);
  assert.equal(byId.get('lane').rules, 'lane');
  assert.equal(byId.get('castle').rules, 'cube');
  assert.equal(byId.get('mushroom').mushrooms, true);
  assert.deepEqual(UNIVERSES.filter((u) => u.rare).map((u) => u.id).sort(), ['timewarp', 'wrong']);
  const n = normaliseUniverses([{ id: 'lcd' }, { id: 'x', rules: 'weird', room: true }, { id: 'lcd' }]);
  assert.equal(n.length, 2);
  assert.equal(n[1].rules, 'box');
  assert.equal(n[1].weight, FLOW.roomWeight);
});

test('the universe sequence is deterministic', () => {
  assert.deepEqual(play('det', 500), play('det', 500));
  assert.notDeepEqual(play('det', 500), play('det2', 500));
});

test('opens in 3310 Ghost and the first two shifts are arcade, then court', () => {
  for (let seed = 0; seed < 50; seed++) {
    const log = play(seed, 3);
    assert.equal(log[0].from, 'lcd');
    assert.deepEqual([log[0].to, log[1].to], ['arcade', 'court']);
    assert.ok(log[0].shift && log[1].shift);
  }
});

test('the script skips universes that did not load', () => {
  const list = UNIVERSES.filter((u) => u.id !== 'court');
  for (let seed = 0; seed < 20; seed++) {
    const log = play(seed, 3, list);
    assert.equal(log[0].to, 'arcade');
    assert.notEqual(log[1].to, 'court');
  }
});

test('every food shifts to a different universe unless the universe is held', () => {
  for (let seed = 0; seed < 40; seed++) {
    for (const e of play(seed, 300)) {
      if (e.shift) assert.notEqual(e.to, e.from);
      else {
        assert.equal(e.to, e.from);
        assert.ok(special(e.from) || byId.get(e.from).rare, `${e.from} held`);
      }
    }
  }
});

test('special universes last 4 to 6 food events, rare ones 1 or 2', () => {
  const lengths = new Map();
  for (let seed = 0; seed < 60; seed++) {
    const log = play(seed, 400);
    let cur = 'lcd', count = 0;
    for (const e of log) {
      count += 1;
      if (e.shift) {
        if (special(cur)) {
          assert.ok(count >= SPECIAL.holdMin && count <= SPECIAL.holdMax, `${cur} lasted ${count}`);
          lengths.set(count, (lengths.get(count) || 0) + 1);
        } else if (byId.get(cur).rare) assert.ok(count === 1 || count === 2, `${cur} lasted ${count}`);
        else assert.equal(count, 1, `${cur} is standard`);
        cur = e.to;
        count = 0;
      }
    }
  }
  assert.deepEqual([...lengths.keys()].sort(), [4, 5, 6], 'all three hold lengths occur');
});

test('holdLeft counts down by one on each held food event', () => {
  for (let seed = 0; seed < 30; seed++) {
    const log = play(seed, 300);
    for (let i = 1; i < log.length; i++) {
      if (!log[i].shift) assert.equal(log[i].holdLeft, log[i - 1].holdLeft - 1);
      else if (special(log[i].to)) assert.ok(log[i].holdLeft >= SPECIAL.holdMin - 1 && log[i].holdLeft <= SPECIAL.holdMax - 1);
      else if (!byId.get(log[i].to).rare) assert.equal(log[i].holdLeft, 0);
    }
  }
});

test('special universes are rare, never two in a row, and none before the fourth food', () => {
  let shifts = 0, specials = 0;
  for (let seed = 0; seed < 200; seed++) {
    let lastShiftTo = 'lcd';
    for (const e of play(seed, 60)) {
      if (!e.shift) continue;
      shifts += 1;
      if (special(e.to)) {
        specials += 1;
        assert.ok(e.score >= SPECIAL.minScore, `special at food ${e.score}`);
        assert.ok(!special(lastShiftTo), `${lastShiftTo} then ${e.to}`);
      }
      lastShiftTo = e.to;
    }
  }
  const share = specials / shifts;
  assert.ok(share > 0.08 && share < 0.13, `about one shift in ten (got ${share.toFixed(3)})`);
});

test('rare universes: never before score 4, never straight after each other', () => {
  let seen = 0;
  for (let seed = 0; seed < 100; seed++) {
    let last = 'lcd';
    for (const e of play(seed, 120)) {
      if (!e.shift) continue;
      if (byId.get(e.to).rare) {
        seen += 1;
        assert.ok(e.score >= FLOW.rareMinScore);
        assert.ok(!byId.get(last).rare, `${last} then ${e.to}`);
      }
      last = e.to;
    }
  }
  assert.ok(seen > 50);
});

test('Total Reset snaps back to lcd only after a room or a rare universe', () => {
  let resets = 0;
  for (let seed = 0; seed < 100; seed++) {
    for (const e of play(seed, 120)) {
      if (!e.reset) continue;
      resets += 1;
      assert.equal(e.to, 'lcd');
      assert.ok(byId.get(e.from).room || byId.get(e.from).rare);
      assert.ok(e.score > 2, 'never in the opening');
    }
  }
  assert.ok(resets > 100, `resets happen (${resets})`);
});

test('unvisited universes are favoured and recent ones avoided', () => {
  const firstVisit = new Map();
  let repeatsSoon = 0, shifts = 0;
  for (let seed = 0; seed < 200; seed++) {
    const recent = [];
    for (const e of play(seed, 40)) {
      if (!e.shift || e.reset) continue;
      shifts += 1;
      if (recent.includes(e.to)) repeatsSoon += 1;
      recent.push(e.to);
      if (recent.length > 3) recent.shift();
      if (!firstVisit.has(seed)) firstVisit.set(seed, new Set());
      firstVisit.get(seed).add(e.to);
    }
  }
  // With 16 universes, a uniform pick would repeat one of the last three about 3/15 of the time.
  assert.ok(repeatsSoon / shifts < 0.12, `recent repeats ${(repeatsSoon / shifts).toFixed(3)}`);
});

test('lock holds one universe and release resumes the flow', () => {
  const flow = createFlow({ rng: createRng(4) });
  flow.reset();
  const r = flow.lock('castle');
  assert.equal(r.shift, true);
  assert.equal(r.to, 'castle');
  for (let s = 1; s < 20; s++) assert.equal(flow.onFood(s).shift, false);
  assert.equal(flow.current().id, 'castle');
  assert.equal(flow.lock('castle'), null, 'locking the current universe is not a shift');
  assert.equal(flow.lock('nope'), null);
  flow.lock(null);
  let shifted = false;
  for (let s = 20; s < 30 && !shifted; s++) shifted = flow.onFood(s).shift;
  assert.ok(shifted);
});

test('a table with only lcd never shifts', () => {
  const flow = createFlow({ universes: [{ id: 'lcd' }], rng: createRng(1) });
  flow.reset();
  for (let s = 1; s < 10; s++) assert.equal(flow.onFood(s).shift, false);
});
