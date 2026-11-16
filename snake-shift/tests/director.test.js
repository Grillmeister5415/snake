import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScenes, createDirector, clearAhead } from '../src/director.js';
import { createSim } from '../src/sim.js';
import { createAutopilot } from '../src/autopilot.js';
import { createFx, createQuality } from '../src/fx.js';
import { createRng } from '../src/rng.js';
import { DIRECTOR as D } from '../src/config.js';

const FLATS = {
  lcd: { name: '3310 GHOST', year: '1999', luma: 0.6, veil: '#8a9a72', weight: 1 },
  arcade: { name: 'ELECTRIC ARCADE', year: '1986', luma: 0.08, veil: '#05030c', weight: 3 },
  acid: { name: 'ACID PARADISE', year: '1968', luma: 0.7, veil: '#e0a040', weight: 3 },
  kombat: { name: 'PIXEL KOMBAT', year: '1993', luma: 0.2, veil: '#301020', weight: 3 },
  desktop: { name: 'DESKTOP ERROR', year: '1995', luma: 0.45, veil: '#008080', weight: 2 },
};
const ROOMS = {
  court: { name: 'REALITY.EXE', year: '2088', luma: 0.25, veil: '#100828', weight: 3, views: ['board', 'pov'] },
  bunker: { name: 'BERLIN BUNKER', year: '2026', luma: 0.06, veil: '#100000', weight: 2, views: ['board'] },
};
const scenes = buildScenes({ flats: FLATS, rooms: ROOMS });
const lumaOf = (id) => scenes.find((s) => s.id === id).luma;

// A snapshot with plenty of room ahead (head mid-board facing right).
const open = (score = 1) => ({ cols: 16, rows: 16, snake: [{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }], dir: 'right', score, alive: true });
// Head two cells from the right wall.
const blocked = (score = 1) => ({ cols: 16, rows: 16, snake: [{ x: 13, y: 8 }, { x: 12, y: 8 }, { x: 11, y: 8 }], dir: 'right', score, alive: true });

function mkPrefs(o = {}) {
  const p = { reducedFlash: false, reducedMotion: false, ...o };
  return { p, fn: () => p };
}

test('scene table is derived from what loaded', () => {
  const ids = scenes.map((s) => s.id).sort();
  assert.deepEqual(ids, ['acid', 'arcade', 'bunker', 'court', 'court-pov', 'desktop', 'kombat', 'lcd']);
  const only = buildScenes({ flats: { lcd: FLATS.lcd } });
  assert.equal(only.length, 1);
  const d = createDirector({ scenes: only });
  assert.equal(d.get().scene, 'lcd');
  assert.equal(d.onBite(open(1), 1000), null, 'nothing to cut to with only LCD');
});

test('first bite cuts LCD to Arcade with TIME BREAK!', () => {
  const { fn } = mkPrefs();
  const d = createDirector({ scenes, prefs: fn });
  d.reset(0);
  assert.equal(d.get().scene, 'lcd');
  const cut = d.onBite(open(1), 1000);
  assert.equal(cut.to, 'arcade');
  const g = d.get();
  assert.equal(g.phrase.text, 'TIME BREAK!');
  assert.ok(g.invertUntil >= 1060 && g.invertUntil <= 1090, 'wild bite impact is 60-90 ms');
  assert.equal(g.showing, 'lcd', 'old scene shows inverted during the impact');
  d.update(open(1), 1100);
  assert.equal(d.get().showing, 'arcade');
  assert.ok(g.strobe, 'the first cut is a big event');
});

test('scripted opening reaches the room, first person, and the silent LCD return', () => {
  const { fn } = mkPrefs();
  const d = createDirector({ scenes, prefs: fn });
  d.reset(0);
  const seq = [];
  for (let i = 1; i <= 7; i++) { d.onBite(open(i), i * 2000); seq.push(d.get().scene); }
  assert.deepEqual(seq, ['arcade', 'court', 'court-pov', 'lcd', 'court', 'arcade', 'court-pov']);
  const d2 = createDirector({ scenes, prefs: fn });
  d2.onBite(open(1), 1000); d2.onBite(open(2), 3000);
  assert.equal(d2.get().phrase.text, 'WELCOME TO 2088');
  d2.onBite(open(3), 5000);
  assert.equal(d2.get().phrase, null, 'no phrase on first-person cuts');
  d2.onBite(open(4), 7000);
  assert.equal(d2.get().scene, 'lcd');
  assert.equal(d2.get().phrase, null, 'no phrase on the silent return to LCD');
});

test('blocked first person is kept for the next bite', () => {
  const { fn } = mkPrefs();
  const d = createDirector({ scenes, prefs: fn });
  d.onBite(open(1), 1000);
  d.onBite(open(2), 2000);
  assert.equal(d.get().scene, 'court');
  assert.equal(clearAhead(blocked()), false);
  d.onBite(blocked(3), 3000);
  assert.notEqual(d.get().scene, 'court-pov');
  d.onBite(open(4), 4000);
  assert.equal(d.get().scene, 'court-pov');
});

test('first-person timeout cuts back to the board view of the same room', () => {
  const { fn } = mkPrefs();
  const d = createDirector({ scenes, prefs: fn });
  d.force('court-pov', 1000, false);
  d.update(open(), 1000 + D.povTimeoutMs - 1);
  assert.equal(d.get().scene, 'court-pov');
  d.update(open(), 1000 + D.povTimeoutMs + 1);
  assert.equal(d.get().scene, 'court');
});

function longRun(prefs, opts = {}) {
  const d = createDirector({ scenes, prefs: prefs.fn, seed: opts.seed ?? 11, hasGL: opts.hasGL });
  const r = createRng(opts.seed ?? 99);
  const cuts = [];
  let now = 0, prev = d.get().scene, score = 0;
  for (let i = 0; i < 3000; i++) {
    now += 150 + r.int(4000);
    score++;
    const snap = r.chance(0.5) ? open(score) : blocked(score);
    const c = d.onBite(snap, now);
    const g = d.get();
    if (c) {
      assert.notEqual(g.scene, prev, 'never the same scene twice in a row');
      cuts.push({ at: now, from: prev, to: g.scene, g });
      prev = g.scene;
    }
    if (c && c.to.endsWith('-pov')) assert.ok(clearAhead(snap), 'first person only with clear cells ahead');
    d.update(snap, now + 10);
    if (d.get().scene !== prev) { cuts.push({ at: now + 10, from: prev, to: d.get().scene, g: d.get() }); prev = d.get().scene; }
  }
  return cuts;
}

test('wild mode: a cut on every bite, never a repeat', () => {
  const cuts = longRun(mkPrefs());
  assert.ok(cuts.length > 2900);
  for (const c of cuts) assert.notEqual(c.from, c.to);
  assert.ok(cuts.some((c) => c.to === 'court-pov'));
});

test('reduced flash: cut and swing limits hold over a long random sequence', () => {
  const cuts = longRun(mkPrefs({ reducedFlash: true }), { seed: 5 });
  assert.ok(cuts.length > 100);
  let lastCut = -Infinity, lastSwing = -Infinity;
  for (const c of cuts) {
    assert.ok(c.at - lastCut >= D.reducedCutGapMs, `cut gap ${c.at - lastCut}`);
    lastCut = c.at;
    if (Math.abs(lumaOf(c.to) - lumaOf(c.from)) > D.swingLuma) {
      assert.ok(c.at - lastSwing >= D.swingGapMs, `swing gap ${c.at - lastSwing}`);
      lastSwing = c.at;
      assert.ok(c.g.veil && c.g.veil.dur === D.veilMs && c.g.veil.from === 0.5, 'swing gets a veil');
    }
    assert.ok(!Number.isFinite(c.g.invertUntil), 'no inversion');
    assert.equal(c.g.strobe, null, 'no strobe');
  }
});

test('no first person under reduced motion', () => {
  const cuts = longRun(mkPrefs({ reducedMotion: true }), { seed: 8 });
  assert.ok(cuts.length > 1000);
  assert.ok(cuts.every((c) => !c.to.endsWith('-pov')));
});

test('no 3D without WebGL, and losing it cuts back to a flat scene', () => {
  const cuts = longRun(mkPrefs(), { hasGL: () => false, seed: 3 });
  assert.ok(cuts.every((c) => !['court', 'court-pov', 'bunker'].includes(c.to)));
  let gl = true;
  const d = createDirector({ scenes, hasGL: () => gl });
  d.force('court', 0);
  gl = false;
  d.update(open(), 100);
  assert.equal(d.get().kind, '2d');
});

test('chaos rises with score', () => {
  const d = createDirector({ scenes });
  d.onBite(open(5), 100);
  assert.equal(d.get().chaos, 0.2);
  d.onBite(open(40), 200);
  assert.equal(d.get().chaos, 1);
});

test('replay: a director forcing every scene and toggling both switches cannot change the run', () => {
  const N = 6000;
  const run = (attach) => {
    const sim = createSim({ seed: 'replay' });
    const ap = createAutopilot(sim);
    const ticks = [];
    let now = 0;
    let d = null, fx = null, prefs = null, k = 0;
    if (attach) {
      prefs = { reducedFlash: false, reducedMotion: false };
      d = createDirector({ scenes, prefs: () => prefs, seed: 1 });
      fx = createFx();
      const order = scenes.map((s) => s.id);
      sim.on('ate', () => {
        const snap = sim.snapshot();
        d.onBite(snap, now);
        let id = order[k++ % order.length];
        if (id === d.get().scene) id = order[k++ % order.length];
        d.force(id, now);
        prefs = { reducedFlash: k % 2 === 0, reducedMotion: k % 3 === 0 };
      });
      sim.on('died', () => d.onDeath(sim.snapshot(), now));
      sim.on('reset', () => d.reset(now));
    }
    sim.setPaused(false);
    for (let i = 0; i < N; i++) {
      ap.update();
      now += 37;
      sim.advance(37);
      if (attach) {
        const snap = sim.snapshot();
        d.update(snap, now);
        const f = fx.frame({ now, director: d.get(), beat: null, prefs });
        assert.equal(typeof f.time, 'number');
        assert.throws(() => { snap.snake[0].x = -1; }, TypeError);
      }
      const s = sim.snapshot();
      ticks.push(JSON.stringify(s));
      if (!s.alive) { sim.reset(`replay-${i}`); ap.reset(); sim.setPaused(false); }
    }
    return ticks;
  };
  const a = run(false);
  const b = run(true);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.equal(b[i], a[i], `tick ${i} differs`);
});

// ---------- wave 2 (integrate): rare scenes, Total Reset, variety, fx.prev ----------

const WIDE = buildScenes({
  flats: { ...FLATS, timewarp: { name: 'TIME WARP', year: '????', luma: 0.45, weight: 1 }, wrong: { name: 'WRONG UNIVERSE', luma: 0.4, weight: 1 } },
  rooms: { ...ROOMS, disco: { name: 'DISCO', year: '1978', luma: 0.35 }, plastic: { name: 'PLASTIC', year: '1999', luma: 0.65 } },
});
const RARE_IDS = new Set(['timewarp', 'wrong']);

/** Feed `bites` bites, `gap` ms apart, with an open snapshot. Returns per-bite records. */
function feed(d, bites, gap = 1500, t0 = 0) {
  const out = [];
  let t = t0;
  for (let score = 1; score <= bites; score++) {
    t += gap;
    const snap = open(score);
    const before = d.get().scene;
    const cut = d.onBite(snap, t);
    d.update(snap, t + 200);
    out.push({ score, before, cut, after: d.get().scene, g: d.get() });
  }
  return out;
}

test('rare scenes: marked, never in the opening or early, never back to back, held 1-2 bites', () => {
  assert.deepEqual(WIDE.filter((s) => s.rare).map((s) => s.id).sort(), ['timewarp', 'wrong']);
  let entries = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const d = createDirector({ scenes: WIDE, seed, prefs: () => ({ reducedFlash: false, reducedMotion: false }) });
    const recs = feed(d, 40);
    let held = 0, inRare = null;
    for (const r of recs) {
      if (r.cut && RARE_IDS.has(r.cut.to)) {
        entries++;
        assert.ok(r.score >= D.rareMinScore, `rare scene at score ${r.score}`);
        assert.ok(r.score > 7, 'not inside the scripted opening');
        assert.ok(!RARE_IDS.has(r.before), 'never rare straight after rare');
        inRare = r.cut.to; held = 0;
      } else if (inRare && r.before === inRare) {
        if (!r.cut) held++;
        else { assert.ok(held <= D.rareHoldMax - 1, `held ${held + 1} bites`); inRare = null; }
      }
    }
  }
  assert.ok(entries > 50, `rare scenes do appear (${entries} in 300 runs)`);
});

test('rare scenes are rare: well under 10% of cuts', () => {
  let cuts = 0, rare = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const d = createDirector({ scenes: WIDE, seed });
    for (const r of feed(d, 30)) if (r.cut) { cuts++; if (RARE_IDS.has(r.cut.to)) rare++; }
  }
  assert.ok(rare / cuts < 0.1 && rare > 0, `rare share ${(rare / cuts).toFixed(3)}`);
});

test('Total Reset: only after a room, timewarp or wrong; silent snap to LCD; likelier with chaos', () => {
  const early = { n: 0, r: 0 }, late = { n: 0, r: 0 };
  for (let seed = 1; seed <= 400; seed++) {
    const d = createDirector({ scenes: WIDE, seed });
    for (const r of feed(d, 40)) {
      const from = WIDE.find((s) => s.id === r.before);
      const eligible = r.score > 7 && from && (from.kind === '3d' || from.rare);
      if (eligible) { const b = r.g.chaos < 0.5 ? early : late; b.n++; if (r.cut && r.cut.reset) b.r++; }
      if (!r.cut || !r.cut.reset) continue;
      assert.ok(eligible, `reset from ${r.before} at score ${r.score}`);
      assert.equal(r.cut.to, 'lcd');
      assert.equal(r.cut.impact, false);
      assert.equal(r.g.phrase, null, 'no phrase card on the silent return');
      assert.equal(r.g.strobe, null);
      assert.ok(!(r.g.invertUntil > r.cut.at), 'no inversion');
    }
  }
  assert.ok(early.r > 0 && late.r > 0, 'resets happen');
  assert.ok(late.r / late.n > early.r / early.n, `rises with chaos (${(early.r / early.n).toFixed(3)} -> ${(late.r / late.n).toFixed(3)})`);
});

test('Total Reset obeys the reduced-flash limiter', () => {
  const { p, fn } = mkPrefs({ reducedFlash: true });
  for (let seed = 1; seed <= 100; seed++) {
    const d = createDirector({ scenes: WIDE, seed, prefs: fn });
    let lastCut = -Infinity, lastSwing = -Infinity;
    for (const r of feed(d, 60, 900)) {
      if (!r.cut) continue;
      assert.ok(r.cut.at - lastCut >= D.reducedCutGapMs, 'cut gap');
      if (r.cut.swing) { assert.ok(r.cut.at - lastSwing >= D.swingGapMs, 'swing gap'); lastSwing = r.cut.at; }
      lastCut = r.cut.at;
    }
  }
  assert.ok(p.reducedFlash);
});

test('variety: every loaded scene is reached, no scene dominates after the opening', () => {
  const count = new Map();
  let total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const d = createDirector({ scenes: WIDE, seed });
    for (const r of feed(d, 30)) if (r.cut && r.score > 7) { total++; count.set(r.cut.to, (count.get(r.cut.to) || 0) + 1); }
  }
  for (const s of WIDE) assert.ok(count.get(s.id) > 0, `${s.id} never picked`);
  for (const [id, n] of count) assert.ok(n / total < 0.2, `${id} has ${(100 * n / total).toFixed(1)}%`);
});

test('fx.prev is the previous timeline or room; fx.biteAge is Infinity with no bite', () => {
  const d = createDirector({ scenes: WIDE, seed: 3 });
  const fxer = createFx();
  const beat = { running: false };
  const prefs = { reducedFlash: false, reducedMotion: false };
  let fx = fxer.frame({ now: 0, director: d.get(), beat, prefs });
  assert.equal(fx.biteAge, Infinity);
  assert.equal(fx.bite, null);
  assert.equal(fx.punch, 0);
  assert.equal(fx.prev, 'lcd');
  d.force('court-pov', 100, false);
  d.force('timewarp', 200, false);
  fx = fxer.frame({ now: 300, director: d.get(), beat, prefs });
  assert.equal(fx.scene, 'timewarp');
  assert.equal(fx.prev, 'court', 'a first-person scene reports its room id');
  d.onBite(open(5), 400);
  fx = fxer.frame({ now: 450, director: d.get(), beat, prefs });
  assert.equal(fx.biteAge, 50);
  d.reset(1000);
  fx = fxer.frame({ now: 1010, director: d.get(), beat, prefs });
  assert.equal(fx.biteAge, Infinity, 'a new run clears the bite');
});

// ---------- wave 3 (finish): the real eleven timelines, and the 2D perspective fallback ----------

const FLAT_REAL = ['lcd', 'arcade', 'acid', 'kombat', 'desktop', 'timewarp', 'wrong'];
const ROOM_REAL = ['court', 'disco', 'plastic', 'bunker'];
const { FALLBACK_ROOMS } = await import('../src/render/persp.js');
async function metaOf(path, fallback) {
  try { return (await import(path)).meta || fallback; } catch { return fallback; } // a room mid-edit elsewhere must not fail this file
}
const REAL = buildScenes({
  flats: Object.fromEntries(await Promise.all(FLAT_REAL.map(async (id) => [id, await metaOf(`../src/render/timelines/${id}.js`, { luma: 0.4 })]))),
  rooms: Object.fromEntries(await Promise.all(ROOM_REAL.map(async (id) => [id, await metaOf(`../src/render/gl/rooms/${id}.js`, FALLBACK_ROOMS[id])]))),
});
const realLuma = (id) => REAL.find((s) => s.id === id).luma;

/** Bites at random gaps over random open/blocked snapshots, the way longRun does, on REAL scenes. */
function realRun(p, { seed = 21, bites = 4000, hasGL } = {}) {
  const d = createDirector({ scenes: REAL, prefs: () => p, seed, hasGL });
  const r = createRng(seed * 7 + 1);
  const cuts = [];
  let now = 0, prev = d.get().scene;
  for (let score = 1; score <= bites; score++) {
    now += 150 + r.int(4000);
    const snap = r.chance(0.6) ? open(score) : blocked(score);
    const c = d.onBite(snap, now);
    if (c) {
      const g = d.get();
      assert.notEqual(g.scene, prev, 'never the same scene twice in a row');
      if (g.scene.endsWith('-pov')) assert.ok(clearAhead(snap), 'first person only with clear cells');
      cuts.push({ at: now, from: prev, to: g.scene, score, reset: !!c.reset, g });
      prev = g.scene;
    }
    d.update(snap, now + 10);
    if (d.get().scene !== prev) { cuts.push({ at: now + 10, from: prev, to: d.get().scene, score, g: d.get() }); prev = d.get().scene; }
  }
  return cuts;
}

test('all eleven timelines: real metas give fifteen scenes with valid luma and HUD colours', () => {
  assert.equal(REAL.length, 15);
  assert.equal(new Set(REAL.map((s) => s.id)).size, 15);
  assert.deepEqual(REAL.filter((s) => s.rare).map((s) => s.id).sort(), ['timewarp', 'wrong']);
  for (const s of REAL) {
    assert.ok(s.luma >= 0 && s.luma <= 1, `${s.id} luma ${s.luma}`);
    assert.ok(s.hud && s.hud.fg && s.hud.bg && s.hud.accent, `${s.id} has hud colours`);
  }
  assert.equal(REAL.find((s) => s.id === 'bunker').clock, '04:37');
});

test('all eleven, wild: every scene reached, none dominates, rare stays rare and late', () => {
  const cuts = realRun({ reducedFlash: false, reducedMotion: false });
  const hist = {};
  for (const c of cuts) if (!c.reset) hist[c.to] = (hist[c.to] || 0) + 1; // Total Resets add LCD on purpose
  for (const s of REAL) assert.ok(hist[s.id] > 0, `${s.id} reached`);
  for (const [id, n] of Object.entries(hist)) assert.ok(n / cuts.length < 0.15, `${id} share ${(n / cuts.length).toFixed(3)}`);
  for (const id of ['timewarp', 'wrong']) assert.ok(hist[id] / cuts.length < 0.05, `${id} share ${(hist[id] / cuts.length).toFixed(3)}`);
  for (let i = 1; i < cuts.length; i++) {
    if (RARE_IDS.has(cuts[i].to)) {
      assert.ok(!RARE_IDS.has(cuts[i].from), 'rare never follows rare');
      assert.ok(cuts[i].score >= D.rareMinScore);
    }
  }
  const resets = cuts.filter((c) => c.reset);
  assert.ok(resets.length > 0 && resets.every((c) => c.to === 'lcd'), 'Total Resets happen and land on LCD');
});

test('all eleven, reduced flash: cut gap, swing gap and veil, no inversion or strobe', () => {
  const cuts = realRun({ reducedFlash: true, reducedMotion: false }, { seed: 4 });
  assert.ok(cuts.length > 300);
  let lastCut = -Infinity, lastSwing = -Infinity;
  for (const c of cuts) {
    assert.ok(c.at - lastCut >= D.reducedCutGapMs, `cut gap ${c.at - lastCut}`);
    lastCut = c.at;
    if (Math.abs(realLuma(c.to) - realLuma(c.from)) > D.swingLuma) {
      assert.ok(c.at - lastSwing >= D.swingGapMs, `swing gap ${c.at - lastSwing}`);
      lastSwing = c.at;
    }
    assert.ok(!Number.isFinite(c.g.invertUntil), 'no inversion');
    assert.equal(c.g.strobe, null, 'no strobe');
  }
});

test('all eleven: no first person under reduced motion; no rooms without WebGL or fallback', () => {
  assert.ok(realRun({ reducedFlash: false, reducedMotion: true }, { seed: 9, bites: 1500 }).every((c) => !c.to.endsWith('-pov')));
  assert.ok(realRun({ reducedFlash: false, reducedMotion: false }, { seed: 10, bites: 1500, hasGL: () => false }).every((c) => c.g.kind === '2d'));
});

test('2D perspective fallback: four rooms, board view only, reached by the director', async () => {
  const { loadPersp } = await import('../src/render/registry.js');
  const fb = await loadPersp({ cols: 16, rows: 16 });
  assert.ok(fb && typeof fb.persp.render === 'function');
  assert.deepEqual(Object.keys(fb.rooms).sort(), [...ROOM_REAL].sort());
  const sc = buildScenes({ flats: { lcd: { luma: 0.6 }, arcade: { luma: 0.08 } }, rooms: fb.rooms });
  assert.ok(sc.every((s) => s.view === 'board'), 'no first person without WebGL');
  const d = createDirector({ scenes: sc, seed: 2, hasGL: () => true });
  const seen = new Set();
  for (const r of feed(d, 60)) seen.add(r.after);
  for (const id of ROOM_REAL) assert.ok(seen.has(id), `${id} reached through the fallback`);
});

test('quality scaling: two seconds of slow frames lower the resolution; fast or throttled frames do not', () => {
  const q = createQuality();
  for (let i = 0; i < 600; i++) assert.equal(q.sample(16.7), false);
  for (let i = 0; i < 40; i++) q.sample(1000); // hidden-tab gaps are ignored
  assert.equal(q.level, 0);
  let changed = 0;
  for (let i = 0; i < 60; i++) if (q.sample(45)) changed++; // 2.7 s at 22 fps
  assert.equal(changed, 1);
  assert.equal(q.scale, 0.75);
  for (let i = 0; i < 400; i++) q.sample(45);
  assert.equal(q.scale, 0.5, 'steps down again while still slow');
  for (let i = 0; i < 400; i++) q.sample(45);
  assert.equal(q.level, 2, 'never below the last level');
});
