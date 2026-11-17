// Director (LEVELS_PLAN 4.1): the simulation picks universes, the director picks looks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUniverses, simUniverses, createDirector, clearAhead, sceneId } from '../src/director.js';
import { createSim } from '../src/sim.js';
import { createAutopilot } from '../src/autopilot.js';
import { createFx, createQuality } from '../src/fx.js';
import { DIRECTOR as D, parseOptions } from '../src/config.js';

const NEW = ['lane', 'hangar', 'mushroom', 'castle', 'abyss'];
const OLD_ROOMS = ['court', 'disco', 'plastic', 'bunker'];
const FLAT_IDS = ['lcd', 'arcade', 'acid', 'kombat', 'desktop', 'timewarp', 'wrong', ...NEW];
const hud = (accent) => ({ fg: '#fff', bg: '#000', accent, panelFg: '#fff', panelBg: '#111' });
const meta = (id, luma, more = {}) => ({ id, name: id.toUpperCase(), year: '1999', luma, veil: '#123456', weight: 2, hud: hud('#f0f'), ...more });
const LUMAS = { lcd: 0.6, arcade: 0.08, acid: 0.7, kombat: 0.2, desktop: 0.45, timewarp: 0.45, wrong: 0.4, lane: 0.7, hangar: 0.55, mushroom: 0.22, castle: 0.6, abyss: 0.12, court: 0.25, disco: 0.35, plastic: 0.65, bunker: 0.06 };
const FLATS = Object.fromEntries(FLAT_IDS.map((id) => [id, meta(id, LUMAS[id], id === 'abyss' ? { calm: true } : {})]));
const ROOMS = Object.fromEntries([...OLD_ROOMS, ...NEW].map((id) => [id, meta(id, LUMAS[id], { year: `Y${id}` })]));
const GL = Object.fromEntries(Object.entries(ROOMS).map(([id, m]) => [id, { ...m, kind: '3d', views: ['board', 'pov'] }]));
const PERSP = Object.fromEntries(OLD_ROOMS.map((id) => [id, { ...ROOMS[id], kind: '3d', views: ['board'] }]));

const ALL = buildUniverses({ flats: FLATS, rooms: ROOMS, glRooms: GL });
const NOGL = buildUniverses({ flats: FLATS, rooms: ROOMS, glRooms: null, perspRooms: PERSP });
const byId = (list, id) => list.find((u) => u.id === id);
const special = (id) => id === 'lane' || id === 'mushroom' || id === 'castle';

const mkPrefs = (o = {}) => { const p = { reducedFlash: false, reducedMotion: false, ...o }; return { p, fn: () => p }; };
// A snapshot with plenty of room ahead (head mid-board facing right), and one facing a wall.
const open = (score = 5, more = {}) => ({ cols: 16, rows: 16, snake: [{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }], dir: 'right', score, alive: true, waiting: null, universe: { id: 'lcd' }, ...more });
const blocked = (score = 5) => ({ ...open(score), snake: [{ x: 13, y: 8 }, { x: 12, y: 8 }, { x: 11, y: 8 }] });

test('universe table: a flat timeline and a room with the same id are one universe', () => {
  assert.equal(ALL.length, 16);
  assert.deepEqual(byId(ALL, 'hangar').looks, ['2d', '3d', 'pov']);
  assert.deepEqual(byId(ALL, 'court').looks, ['3d', 'pov']);
  assert.deepEqual(byId(ALL, 'lcd').looks, ['2d']);
  assert.deepEqual(byId(ALL, 'castle').looks, ['2d', '3d'], 'castle has no first person');
  assert.equal(byId(ALL, 'lane').rules, 'lane');
  assert.equal(byId(ALL, 'castle').rules, 'cube');
  assert.equal(byId(ALL, 'mushroom').mushrooms, true);
  assert.deepEqual(ALL.filter((u) => u.rare).map((u) => u.id).sort(), ['timewarp', 'wrong']);
  assert.deepEqual(ALL.filter((u) => u.calm).map((u) => u.id).sort(), ['abyss', 'lcd']);
  const h = byId(ALL, 'hangar');
  assert.equal(h.info['2d'].id, 'hangar');
  assert.equal(h.info['3d'].id, 'hangar-3d');
  assert.equal(h.info.pov.id, 'hangar-pov');
  assert.equal(byId(ALL, 'court').info['3d'].id, 'court');
  assert.equal(sceneId('court', 'pov', false), 'court-pov');
  for (const u of ALL) for (const l of u.looks) {
    const i = u.info[l];
    assert.equal(i.timeline, u.id);
    assert.equal(i.kind, l === '2d' ? '2d' : '3d');
    assert.equal(i.view, l === 'pov' ? 'pov' : 'board');
  }
});

test('universe table: only what loaded; a universe with no look is never passed', () => {
  const some = buildUniverses({ flats: { lcd: FLATS.lcd, arcade: FLATS.arcade }, rooms: { hangar: ROOMS.hangar }, glRooms: null });
  assert.deepEqual(some.map((u) => u.id), ['lcd', 'arcade'], 'a room-only universe without WebGL has no look');
  const gl = buildUniverses({ flats: { lcd: FLATS.lcd }, rooms: { hangar: ROOMS.hangar }, glRooms: { hangar: GL.hangar } });
  assert.deepEqual(gl.map((u) => u.id), ['lcd', 'hangar']);
  assert.deepEqual(byId(gl, 'hangar').looks, ['3d', 'pov']);
  const sim = createSim({ universes: simUniverses(some), seed: 3 });
  assert.deepEqual(sim.universes.map((u) => u.id), ['lcd', 'arcade']);
});

test('without WebGL: new universes show only 2D, the four built rooms use the stand-in, same sim table', () => {
  for (const id of NEW) assert.deepEqual(byId(NOGL, id).looks, ['2d'], id);
  for (const id of OLD_ROOMS) assert.deepEqual(byId(NOGL, id).looks, ['3d'], id);
  assert.ok(byId(NOGL, 'court').persp && !byId(NOGL, 'court').gl);
  // The rules table does not depend on WebGL, so a seed gives the same run on every device.
  assert.deepEqual(simUniverses(NOGL), simUniverses(ALL));
});

/**
 * Wire a real simulation to a director the way main.js does, and play it with the autopilot.
 * Returns the log of bites and cuts. `gap` is the time between ticks in ms.
 */
function play({ universes = ALL, prefs = {}, hasGL = () => true, seed = 11, dseed = 5, foods = 300, gap = 140, start, look = null } = {}) {
  const { p, fn } = mkPrefs(prefs);
  const director = createDirector({ universes, seed: dseed, prefs: fn, hasGL });
  if (look) director.setLook(look, 0);
  const sim = createSim({ universes: simUniverses(universes), seed, start });
  const auto = createAutopilot(sim);
  let now = 0;
  const log = { shifts: [], flips: [], held: [], lost: [], died: 0, ticks: 0, frames: [] };
  const snap = () => sim.snapshot();
  sim.on('reset', () => director.reset(now, snap()));
  sim.on('ate', (e) => {
    const c = director.onAte(e, snap(), now);
    if (e.held) log.held.push({ e, c, d: director.get(), score: e.score, universe: snap().universe.id });
    if (c) log.flips.push({ c, d: director.get(), snap: snap(), at: now });
  });
  sim.on('shift', (e) => {
    const c = director.onShift(e, snap(), now);
    log.shifts.push({ e, c, d: director.get(), snap: snap(), at: now });
  });
  sim.on('lifeLost', (e) => {
    const before = director.get().look;
    director.onLifeLost(e, snap(), now);
    log.lost.push({ e, before, d: director.get() });
  });
  sim.on('died', () => { log.died++; director.onDeath(snap(), now); });
  sim.reset(seed);
  director.reset(now, snap());
  sim.setPaused(false);
  while (snap().score < foods && log.ticks < foods * 200) {
    const s = snap();
    if (!s.alive) { sim.reset(seed + log.ticks); sim.setPaused(false); continue; }
    if (s.waiting) sim.setPaused(false);
    auto.update();
    sim.step();
    log.ticks++;
    now += gap;
    director.update(snap(), now);
    log.frames.push({ d: director.get(), at: now });
    if (log.frames.length > 4000) log.frames.shift();
  }
  return { log, p, director, sim };
}

test('every shift is a cut to the universe the simulation chose, with a valid look and an impact', () => {
  const { log } = play({ foods: 400 });
  assert.ok(log.shifts.length > 200, `shifts ${log.shifts.length}`);
  for (const s of log.shifts) {
    assert.ok(s.c, 'a shift always cuts');
    assert.equal(s.c.to, s.e.to);
    assert.equal(s.d.universe, s.snap.universe.id);
    const u = byId(ALL, s.e.to);
    assert.ok(u.looks.includes(s.c.look), `${s.e.to} shown as ${s.c.look}`);
    assert.equal(s.c.impact, !s.e.reset, 'impact on every shift except the silent Total Reset');
    if (s.e.to === 'castle') assert.notEqual(s.c.look, 'pov');
    if (s.c.look === 'pov') {
      assert.ok(s.snap.score >= D.povMinScore, 'no first person before the fourth food');
      assert.ok(clearAhead(s.snap), 'first person only with clear cells ahead');
    }
  }
  assert.equal(log.shifts[0].c.look, '2d', 'arcade first');
  assert.equal(log.shifts[0].d.phrase && log.shifts[0].d.phrase.text, 'TIME BREAK!');
  assert.equal(log.shifts[1].e.to, 'court');
});

test('looks: new universes pick 2D about 40% of the time; rooms pick first person about 0.45 of the board', () => {
  const { log } = play({ foods: 1500, seed: 3 });
  const count = (pred) => log.shifts.filter((s) => !s.e.reset && pred(s)).length;
  const newArr = count((s) => NEW.includes(s.e.to));
  const new2d = count((s) => NEW.includes(s.e.to) && s.c.look === '2d');
  assert.ok(newArr > 60, `new arrivals ${newArr}`);
  const share = new2d / newArr;
  assert.ok(share > 0.28 && share < 0.55, `2D share ${share.toFixed(2)}`);
  const old = count((s) => OLD_ROOMS.includes(s.e.to) && s.snap.score >= D.povMinScore);
  const pov = count((s) => OLD_ROOMS.includes(s.e.to) && s.c.look === 'pov');
  assert.ok(pov > 0 && pov / old < 0.35, `old-room first person ${pov}/${old}`);
  for (const id of [...NEW.filter((i) => i !== 'castle'), ...OLD_ROOMS]) {
    assert.ok(log.shifts.some((s) => s.e.to === id), `${id} reached`);
  }
});

test('held bites inside a special universe flip the look with a shift\'s impact; castle alternates 2D and 3D', () => {
  const { log } = play({ foods: 1500, seed: 8 });
  const specialHeld = log.held.filter((h) => special(h.universe));
  assert.ok(specialHeld.length > 40, `held special bites ${specialHeld.length}`);
  for (const h of specialHeld) {
    assert.ok(h.c, 'a held special bite cuts');
    assert.equal(h.c.from, h.c.to, 'same universe');
    assert.notEqual(h.c.look, h.c.prevLook, 'a different look');
    assert.ok(h.c.impact && h.c.held);
    if (h.universe === 'castle') assert.ok(h.c.look === '2d' || h.c.look === '3d');
  }
  const rareHeld = log.held.filter((h) => h.universe === 'timewarp' || h.universe === 'wrong');
  for (const h of rareHeld) assert.equal(h.c, null, 'held rare bite: local changes only, as built');
});

test('first person falls back to the board view after 12 seconds; never under Reduced motion', () => {
  const u = byId(ALL, 'court');
  const d = createDirector({ universes: ALL, seed: 1 });
  d.setLook('pov', 0);
  d.onShift({ from: 'lcd', to: 'court', index: 1 }, open(6), 0);
  assert.equal(d.get().look, 'pov');
  d.setLook(null, 0);
  assert.equal(d.update(open(6), D.povTimeoutMs - 10), null);
  const c = d.update(open(6), D.povTimeoutMs + 10);
  assert.ok(c && c.look === '3d' && c.to === 'court', 'same universe, board view');
  assert.ok(u.looks.includes('pov'));
  const { log } = play({ foods: 600, prefs: { reducedMotion: true } });
  assert.ok(log.shifts.every((s) => s.c.look !== 'pov') && log.flips.every((f) => f.c.look !== 'pov'));
  assert.ok(log.frames.every((f) => f.d.view !== 'pov'));
});

test('a lost life forces the board look (never first person), with a phrase and a strobe burst', () => {
  const d = createDirector({ universes: ALL, seed: 4 });
  d.setLook('pov', 0);
  d.onShift({ from: 'lcd', to: 'hangar', index: 3 }, open(9), 0);
  assert.equal(d.get().look, 'pov');
  d.setLook(null, 0);
  d.onLifeLost({ lives: 2 }, open(9, { waiting: 'respawn' }), 1000);
  const g = d.get();
  assert.equal(g.look, '3d');
  assert.equal(g.phrase.text, 'LIFE LOST');
  assert.ok(g.strobe && Number.isFinite(g.invertUntil));
  d.onLifeLost({ lives: 1 }, open(9, { waiting: 'respawn' }), 3000);
  assert.equal(d.get().phrase.text, 'LAST LIFE');
  const { log } = play({ foods: 800, seed: 21, gap: 60 });
  assert.ok(log.lost.length > 0, 'the autopilot loses a life now and then');
  for (const l of log.lost) assert.notEqual(l.d.look, 'pov');
});

test('calm universes (3310 Ghost, Abyssal Cathedral): no inversion or strobe while they show', () => {
  const { log } = play({ foods: 1200, seed: 5 });
  const intoCalm = log.shifts.filter((s) => s.e.to === 'lcd' || s.e.to === 'abyss');
  assert.ok(intoCalm.some((s) => s.e.to === 'abyss') && intoCalm.some((s) => s.e.to === 'lcd'));
  for (const s of intoCalm) {
    assert.equal(s.d.strobe, null, `${s.e.to}: no strobe`);
    assert.ok(!Number.isFinite(s.d.invertUntil), `${s.e.to}: no inversion`);
  }
  // Leaving a calm universe keeps the impact, but on the new scene: the calm one never inverts.
  const fromLcd = log.shifts.find((s) => s.e.from === 'lcd' && s.e.to !== 'abyss');
  assert.ok(Number.isFinite(fromLcd.d.invertUntil));
  assert.notEqual(fromLcd.d.showing, 'lcd');
  // fx: calm zeroes strobe, inversion, glitch and split, and caps the beat pulse.
  const fxer = createFx();
  const beat = { running: true, sample: () => ({ pulse: 1, index: 3 }) };
  const prefs = { reducedFlash: false, reducedMotion: false };
  const calmD = { calm: true, chaos: 1, cutAt: 0, biteAt: 0, invertUntil: 1e9, strobe: { at: 0, count: 4, dur: 400 }, variant: 1, bite: null };
  const fx = fxer.frame({ now: 10, director: calmD, beat, prefs });
  assert.equal(fx.calm, true);
  assert.equal(fx.strobe, 0);
  assert.equal(fx.invert, false);
  assert.equal(fx.glitch, 0);
  assert.equal(fx.split, 0);
  assert.ok(fx.beat <= 0.15);
  const wild = createFx().frame({ now: 10, director: { ...calmD, calm: false }, beat, prefs });
  assert.ok(wild.invert && wild.glitch > 0 && wild.beat === 1);
});

test('Reduced flash: no inversion or strobe anywhere, every shift on time behind a veil that stays up when shifts come fast', () => {
  const fast = play({ foods: 500, prefs: { reducedFlash: true }, gap: 60, seed: 2 });
  const plain = play({ foods: 500, seed: 2, gap: 60 });
  assert.deepEqual(fast.log.shifts.map((s) => s.e.to), plain.log.shifts.map((s) => s.e.to), 'shifts are never skipped');
  for (const s of fast.log.shifts) {
    assert.ok(!Number.isFinite(s.d.invertUntil), 'no inversion');
    assert.equal(s.d.strobe, null, 'no strobe');
    assert.ok(s.d.veil && s.d.veil.from > 0, 'a veiled fade');
  }
  for (const f of fast.log.frames) assert.ok(!f.d.strobe && !Number.isFinite(f.d.invertUntil));
  // Fast shifts (< 3.5 s apart): the veil never drops away between them.
  const d = createDirector({ universes: ALL, seed: 3, prefs: () => ({ reducedFlash: true, reducedMotion: false }) });
  d.onShift({ from: 'lcd', to: 'arcade', index: 1 }, open(1), 1000);
  d.onShift({ from: 'arcade', to: 'acid', index: 2 }, open(2), 2000);
  d.update(open(2), 2900);
  const mid = d.get().veil;
  assert.ok(mid && mid.from > 0.1, `veil partly up between fast shifts (${mid && mid.from})`);
  d.update(open(2), 2000 + D.veilGapMs + 50);
  assert.equal(d.get().veil, null, 'and gone once they stop');
  // A single shift after a long gap fades in 450 ms.
  d.onShift({ from: 'acid', to: 'kombat', index: 3 }, open(3), 20000);
  d.update(open(3), 20000 + D.veilMs + 20);
  assert.equal(d.get().veil, null);
});

test('without WebGL the director never shows a room look the device cannot draw', () => {
  const { log } = play({ universes: NOGL, foods: 600, hasGL: () => false });
  for (const s of log.shifts) {
    if (NEW.includes(s.e.to)) assert.equal(s.c.look, '2d', `${s.e.to} in 2D`);
    if (OLD_ROOMS.includes(s.e.to)) assert.equal(s.c.look, '3d', `${s.e.to} through the stand-in`);
  }
  // Losing WebGL mid-run: a room look falls back to the universe's 2D look.
  let gl = true;
  const d = createDirector({ universes: ALL, seed: 2, hasGL: () => gl });
  d.setLook('3d', 0);
  d.onShift({ from: 'lcd', to: 'mushroom', index: 4 }, open(6), 0);
  assert.equal(d.get().look, '3d');
  gl = false;
  d.update(open(6), 100);
  assert.equal(d.get().look, '2d');
  assert.equal(d.get().universe, 'mushroom');
});

test('replay: the director cannot change the run (prefs, WebGL and look locks give the same simulation)', () => {
  const runs = [
    play({ foods: 200, seed: 31 }),
    play({ foods: 200, seed: 31, prefs: { reducedFlash: true, reducedMotion: true }, dseed: 99 }),
    play({ foods: 200, seed: 31, universes: NOGL, hasGL: () => false }),
    play({ foods: 200, seed: 31, look: '2d' }),
  ];
  const key = (r) => r.log.shifts.map((s) => `${s.e.to}@${s.snap.tick}`).join(' ');
  for (const r of runs.slice(1)) assert.equal(key(r), key(runs[0]));
  assert.equal(runs[3].log.shifts.filter((s) => byId(ALL, s.e.to).looks.includes('2d')).every((s) => s.c.look === '2d'), true, 'a look lock holds');
});

test('fx: lives, universe, look, calm and rules (LEVELS_PLAN 4.2); prev is the previous universe', () => {
  const sim = createSim({ universes: simUniverses(ALL), seed: 4, start: { universe: 'castle', lives: 4 } });
  const d = createDirector({ universes: ALL, seed: 3 });
  d.reset(0, sim.snapshot());
  const fxer = createFx();
  const beat = { running: false };
  const prefs = { reducedFlash: false, reducedMotion: false };
  let fx = fxer.frame({ now: 0, director: d.get(), beat, prefs, snap: sim.snapshot() });
  assert.equal(fx.lives, 4);
  assert.equal(fx.maxLives, 5);
  assert.equal(fx.universe, 'castle');
  assert.equal(fx.rules, 'cube');
  assert.ok(fx.look === '2d' || fx.look === '3d');
  assert.equal(fx.calm, false);
  assert.equal(fx.waiting, 'start');
  assert.equal(fx.biteAge, Infinity);
  d.onShift({ from: 'castle', to: 'abyss', index: 1 }, open(5), 100);
  fx = fxer.frame({ now: 600, director: d.get(), beat, prefs, snap: null });
  assert.equal(fx.prev, 'castle');
  assert.equal(fx.calm, true);
  d.onAte({ score: 6, cell: { x: 3, y: 3 }, held: false }, open(6), 700);
  fx = fxer.frame({ now: 750, director: d.get(), beat, prefs });
  assert.equal(fx.biteAge, 50);
  assert.deepEqual(fx.bite, { x: 3, y: 3 });
});

test('switches: universe, look, lock, score and lives work only with ?debug', () => {
  const on = parseOptions('?debug&universe=hangar&lock&look=pov&score=12&lives=5&seed=4');
  assert.equal(on.universe, 'hangar');
  assert.equal(on.lock, true);
  assert.equal(on.look, 'pov');
  assert.equal(on.score, 12);
  assert.equal(on.lives, 5);
  const off = parseOptions('?universe=hangar&lock&look=pov&score=12&lives=5&seed=4');
  assert.equal(off.universe, null);
  assert.equal(off.lock, false);
  assert.equal(off.look, null);
  assert.equal(off.score, null);
  assert.equal(off.lives, null);
  assert.equal(off.seed, '4');
  assert.equal(parseOptions('?debug&scene=court-pov').universe, 'court', 'the old ?scene= still names a universe');
  assert.equal(parseOptions('?debug&look=side').look, null);
  assert.equal(parseOptions('?debug&lives=9').lives, 5);
  assert.equal(parseOptions('?nogl&auto').nogl, true);
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

// ---------- the real modules: whatever has loaded in this checkout ----------
async function load(path) {
  try { return await import(path); } catch { return null; } // missing or mid-edit elsewhere: skipped, like the registry
}
const realFlats = {}, realRooms = {}, realMods = {};
for (const id of FLAT_IDS) { const m = await load(`../src/render/timelines/${id}.js`); if (m && m.meta) { realFlats[id] = m.meta; realMods[`2d:${id}`] = m; } }
for (const id of [...OLD_ROOMS, ...NEW]) { const m = await load(`../src/render/gl/rooms/${id}.js`); if (m && m.meta) { realRooms[id] = m.meta; realMods[`3d:${id}`] = m; } }

test('real modules: valid scene info for every look, life() icons where exported, the stand-in rooms', async () => {
  const glRooms = Object.fromEntries(Object.entries(realRooms).map(([id, m]) => [id, { ...m, views: ['board', 'pov'] }]));
  const real = buildUniverses({ flats: realFlats, rooms: realRooms, glRooms });
  assert.ok(real.length >= 14, `universes ${real.map((u) => u.id).join(' ')}`);
  for (const u of real) for (const l of u.looks) {
    const i = u.info[l];
    assert.ok(i.luma >= 0 && i.luma <= 1, `${i.id} luma ${i.luma}`);
    assert.ok(i.hud && i.hud.fg && i.hud.bg && i.hud.accent, `${i.id} has HUD colours`);
  }
  for (const id of ['hangar', 'mushroom', 'abyss']) {
    if (realFlats[id] && realRooms[id]) assert.deepEqual(byId(real, id).looks, ['2d', '3d', 'pov'], id);
  }
  for (const [key, m] of Object.entries(realMods)) {
    if (typeof m.life !== 'function') continue;
    const calls = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return { addColorStop() {} }; }), set: (t, k, v) => { t[k] = v; return true; } });
    m.life(ctx, 0, 0, 16, true, { chaos: 0.5, time: 1, now: 1000 });
    m.life(ctx, 20, 0, 16, false, { chaos: 0, time: 1, now: 1000 });
    assert.ok(calls.length > 0, `${key} life() draws`);
  }
  const { loadPersp } = await import('../src/render/registry.js');
  const fb = await loadPersp({ cols: 16, rows: 16 });
  assert.ok(fb && typeof fb.persp.render === 'function');
  assert.deepEqual(Object.keys(fb.rooms).sort(), [...OLD_ROOMS].sort());
  assert.ok(Object.values(fb.rooms).every((r) => r.views.length === 1 && r.views[0] === 'board'));
});
