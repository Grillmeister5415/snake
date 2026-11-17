// Replay (LEVELS_PLAN 8.3): the same seeded inputs give the same simulation, tick for tick, in all
// three spaces, whatever the director, the effects and the player's switches do around it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUniverses, simUniverses, createDirector } from '../src/director.js';
import { createSim } from '../src/sim.js';
import { createAutopilot } from '../src/autopilot.js';
import { createFx } from '../src/fx.js';
import { loadTimelines, loadRoomModules } from '../src/render/registry.js';

// The real module metas, joined the way main.js joins them (with and without WebGL).
const metas = (mods) => Object.fromEntries(Object.entries(mods).map(([id, m]) => [id, m.meta]));
const FL = metas(await loadTimelines());
const RM = metas(await loadRoomModules());
const OLD = ['court', 'bunker', 'disco', 'plastic'];
const GL = Object.fromEntries(Object.entries(RM).map(([id, m]) => [id, { ...m, kind: '3d', views: id === 'castle' ? ['board'] : ['board', 'pov'] }]));
const PERSP = Object.fromEntries(OLD.filter((id) => RM[id]).map((id) => [id, { ...RM[id], kind: '3d', views: ['board'] }]));
const ALL = buildUniverses({ flats: FL, rooms: RM, glRooms: GL });
const NOGL = buildUniverses({ flats: FL, rooms: RM, glRooms: null, perspRooms: PERSP });

const SEED = 'replay-3';
const TICKS = 9000;
const BEAT = { running: false };

/**
 * One run. Without `inputs` the autopilot steers and its turns are recorded by tick; with `inputs`
 * exactly those turns are replayed. `dir` wires a director and an fx frame loop around the sim, as
 * main.js does, with three frames per tick; `toggle` flips both Reduced switches every 700 ticks.
 */
function run({ inputs = null, dir = null } = {}) {
  const universes = dir && dir.universes ? dir.universes : ALL;
  const sim = createSim({ universes: simUniverses(universes), seed: SEED });
  const turns = inputs || new Map();
  let i = 0, now = 0;
  const ap = inputs ? null : createAutopilot({ snapshot: () => sim.snapshot(), queueTurn: (d) => { turns.set(i, d); sim.queueTurn(d); } });
  const snap = () => sim.snapshot();
  let director = null, fxer = null;
  const prefs = { reducedFlash: false, reducedMotion: false, ...(dir && dir.prefs) };
  if (dir) {
    director = createDirector({ universes, seed: dir.dseed || 5, prefs: () => prefs, hasGL: () => universes !== NOGL });
    if (dir.look) director.setLook(dir.look, 0);
    fxer = createFx();
    sim.on('reset', () => director.reset(now, snap()));
    sim.on('ate', (e) => director.onAte(e, snap(), now));
    sim.on('shift', (e) => director.onShift(e, snap(), now));
    sim.on('lifeLost', (e) => director.onLifeLost(e, snap(), now));
    sim.on('died', () => director.onDeath(snap(), now));
    director.reset(0, snap());
  }
  const ticks = [], kinds = new Set();
  for (; i < TICKS; i++) {
    if (!snap().alive) { sim.reset(`${SEED}-${i}`); if (ap) ap.reset(); }
    if (snap().waiting) sim.setPaused(false);
    if (ap) ap.update();
    else if (turns.has(i)) sim.queueTurn(turns.get(i));
    sim.step();
    if (dir) {
      if (dir.toggle && i % 700 === 0) { prefs.reducedFlash = !prefs.reducedFlash; prefs.reducedMotion = !prefs.reducedMotion; }
      for (let f = 0; f < 3; f++) {
        now += 41;
        director.update(snap(), now);
        fxer.frame({ now, director: director.get(), beat: BEAT, prefs, snap: snap() });
      }
    }
    const s = snap();
    kinds.add(s.space.kind);
    ticks.push(JSON.stringify(s));
  }
  return { ticks, kinds, turns };
}

test('replay: the same inputs give the same run tick for tick, with or without the director and switches, in all three spaces', () => {
  assert.deepEqual(simUniverses(NOGL), simUniverses(ALL), 'the rules table does not depend on WebGL');
  const base = run();
  assert.deepEqual([...base.kinds].sort(), ['box', 'cube', 'lane'], 'the run visits all three spaces');
  assert.ok(base.turns.size > 500, `turns recorded: ${base.turns.size}`);
  const variants = {
    'bare replay': null,
    'director, default': {},
    'Reduced flash + motion, other director seed': { prefs: { reducedFlash: true, reducedMotion: true }, dseed: 99 },
    'switches toggled mid-run': { toggle: true, dseed: 7 },
    'no WebGL': { universes: NOGL },
    'look held at pov': { look: 'pov' },
    'look held at 2d': { look: '2d', prefs: { reducedFlash: true } },
  };
  for (const [name, dir] of Object.entries(variants)) {
    const r = run({ inputs: base.turns, dir: dir || null });
    assert.equal(r.ticks.length, base.ticks.length, name);
    for (let t = 0; t < base.ticks.length; t++) {
      if (r.ticks[t] !== base.ticks[t]) assert.fail(`${name}: run differs at tick ${t}`);
    }
  }
});
