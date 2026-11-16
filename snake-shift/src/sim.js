// Snake simulation (LEVELS_PLAN section 3). Pure: no DOM, own seeded generator, fixed tick.
// Universes can change the rules (lane, cube, mushrooms); renderers always see one 16x16
// board in board-local coordinates and can never write state.

import { createRng } from './rng.js';
import { SPEED } from './config.js';
import { BOARD, LIVES, MUSHROOM, LANE, CUBE, UNIVERSES } from './rules-config.js';
import {
  DIRS, OPPOSITE, DIR_ORDER, createSpace, stepIn, toBoard, fromBoard, leaveToBox, enterFromBox,
  laneFollow, sameCell, spaceGraph, bfs, cubeFaceNeighbours,
} from './space.js';
import { createFlow } from './flow.js';

export { DIRS, OPPOSITE };

export function stepMsFor(score, speed = SPEED) {
  return Math.max(speed.capMs, speed.startMs - speed.rampMs * score);
}

const N = BOARD;
const OFF = Object.freeze({ off: true }); // a body cell left outside the board by a space change
const cell = (x, y) => Object.freeze({ x, y });

/**
 * createSim({ universes, speed, seed, start })
 *   universes: [{ id, rules: 'box'|'lane'|'cube', mushrooms, rare, room, weight }] (default: the sixteen)
 *   start (tests and debug): { score, lives, universe, snake: [{x,y}...head first], dir, food } (board-local)
 * Events: reset, pause, resume, turn, step, ate { kind, score, cell, lifeGained, held },
 *   shift { from, to, index, reset }, lifeLost { lives, death }, died { death, score, tick }.
 * On a food tick: step, ate, then (unless held) the universe, space and dot change and shift fires.
 */
export function createSim({ universes = UNIVERSES, speed = SPEED, seed = 1, start = null } = {}) {
  const cols = N, rows = N;
  const sp = Object.freeze({ ...SPEED, ...speed });
  const listeners = new Map();
  let rng = createRng(seed);
  const rngProxy = { next: () => rng.next(), int: (n) => rng.int(n) };
  const flow = createFlow({ universes, rng: rngProxy });

  let runSeed;
  let body, space, dir, prevDir, prevTail, grew, food, mush, mushPending, mushFoods;
  let score, tick, alive, paused, waiting, death, queue, acc, lives;
  let cache = null; // derived snapshot parts, rebuilt after any change

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[sim] '${type}' listener failed`, err); }
    }
  }
  const touch = () => { cache = null; };
  const universe = () => flow.current().universe;

  // ------------------------------------------------------------ spawning

  /** Graph, blocked cells (the body) and BFS distances from the head. */
  function survey() {
    const g = spaceGraph(space);
    const blocked = new Uint8Array(g.size);
    for (const c of body) {
      const i = g.index(c);
      if (i >= 0) blocked[i] = 1;
    }
    return { g, blocked, dist: bfs(g, blocked, g.index(body[0])) };
  }

  /** Pick a free cell among `region` (graph indices), preferring reachable ones. Avoids `avoid` cells. */
  function pickCell(sv, region, avoid, ok = () => true) {
    const free = [], reach = [];
    for (const i of region) {
      if (sv.blocked[i]) continue;
      const c = sv.g.cell(i);
      if (avoid.some((a) => sameCell(a, c)) || !ok(c, i)) continue;
      free.push(c);
      if (sv.dist[i] > 0) reach.push(c);
    }
    const pool = reach.length ? reach : free;
    return pool.length ? pool[rng.int(pool.length)] : null;
  }

  function boardRegion(g) {
    const out = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out.push(g.index(fromBoard(space, x, y)));
    return out;
  }

  /** Place the dot by the current space's rule. Returns null only when no free cell is left. */
  function placeDot() {
    const sv = survey();
    const avoid = mush ? [mush.cell] : [];
    let region;
    if (space.kind === 'lane') {
      region = [];
      for (let y = space.y0 - LANE.dotMax; y <= space.y0 - LANE.dotMin; y++) {
        for (let x = 0; x < N; x++) region.push(sv.g.index({ x, y }));
      }
    } else if (space.kind === 'cube') {
      const faces = rng.next() < CUBE.neighbourFaceChance ? cubeFaceNeighbours(space.face) : [space.face];
      region = [];
      for (const f of faces) for (let i = 0; i < N * N; i++) region.push(f * N * N + i);
    } else {
      region = boardRegion(sv.g);
    }
    let c = pickCell(sv, region, avoid);
    if (!c) { // anywhere in the space, as a last resort
      const all = [];
      for (let i = 0; i < sv.g.size; i++) all.push(i);
      c = pickCell(sv, all, avoid);
    }
    return c;
  }

  function placeMushroom() {
    const sv = survey();
    const head = body[0];
    const hb = toBoard(space, head);
    const region = boardRegion(sv.g);
    const far = (c, i) => {
      const b = toBoard(space, c);
      if (hb && b && Math.abs(b.x - hb.x) + Math.abs(b.y - hb.y) < MUSHROOM.minHeadDist) return false;
      return sv.dist[i] < 0 || sv.dist[i] >= MUSHROOM.minHeadDist;
    };
    const c = pickCell(sv, region, food ? [food] : [], far);
    return c ? { cell: c, born: tick } : null;
  }

  // ------------------------------------------------------------ space changes

  /** Old space -> box -> new space on the same tick. Never moves a cell. */
  function changeSpace(kind) {
    if (space.kind !== 'box') {
      const old = space;
      const conv = (c) => (c === OFF ? OFF : leaveToBox(old, c) || OFF);
      body = body.map(conv);
      prevTail = prevTail && prevTail !== OFF ? leaveToBox(old, prevTail) : null;
      food = food ? leaveToBox(old, food) : null;
      if (mush) { const m = leaveToBox(old, mush.cell); mush = m ? { cell: m, born: mush.born } : null; }
      space = createSpace('box');
    }
    if (kind !== 'box') {
      const conv = (c) => (c === OFF ? OFF : enterFromBox(kind, c));
      body = body.map(conv);
      prevTail = prevTail ? enterFromBox(kind, prevTail) : null;
      food = food ? enterFromBox(kind, food) : null;
      if (mush) mush = { cell: enterFromBox(kind, mush.cell), born: mush.born };
      space = createSpace(kind);
    }
  }

  /** Arrival in a universe: space, items. Returns false when the dot cannot be placed. */
  function arrive(prevUniverse) {
    const u = universe();
    changeSpace(u.rules);
    if (!u.mushrooms) { mush = null; mushPending = false; }
    else if (!prevUniverse || !prevUniverse.mushrooms) { mushPending = true; mushFoods = 0; }
    if (space.kind !== 'box' || !food || !toBoard(space, food)) food = placeDot();
    return !!food;
  }

  // ------------------------------------------------------------ run control

  function reset(s) {
    if (s !== undefined && s !== null) runSeed = s;
    rng = createRng(runSeed);
    const st = start || {};
    flow.reset(st.universe);
    space = createSpace('box');
    if (st.snake && st.snake.length) {
      body = st.snake.map((c) => cell(c.x, c.y));
      dir = st.dir || 'right';
    } else {
      const hx = N / 2, hy = N / 2;
      body = [cell(hx, hy), cell(hx - 1, hy), cell(hx - 2, hy)];
      dir = 'right';
    }
    prevDir = dir;
    prevTail = body[body.length - 1];
    grew = false;
    score = Number.isFinite(st.score) ? Math.max(0, st.score | 0) : 0;
    lives = Number.isFinite(st.lives) ? Math.max(1, Math.min(LIVES.max, st.lives | 0)) : LIVES.start;
    tick = 0;
    alive = true;
    paused = true;
    waiting = 'start';
    death = null;
    queue = [];
    acc = 0;
    mush = null;
    mushPending = false;
    mushFoods = 0;
    food = st.food ? cell(st.food.x, st.food.y) : null;
    const u = universe();
    if (u.rules !== 'box') changeSpace(u.rules); // start cells and dot are board-local
    if (u.mushrooms) mushPending = true;
    if (!food) food = placeDot();
    touch();
    emit('reset', { seed: runSeed });
  }

  function setPaused(p) {
    p = !!p;
    if (p === paused) return;
    paused = p;
    if (!p) waiting = null;
    touch();
    emit(p ? 'pause' : 'resume', { tick });
  }

  function queueTurn(d) {
    if (!alive || !DIRS[d]) return false;
    if (queue.length >= 2) return false;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (d === last || d === OPPOSITE[last]) return false;
    queue.push(d);
    touch();
    emit('turn', { dir: d, queued: queue.length });
    return true;
  }

  // ------------------------------------------------------------ lives

  /** Respawn spot: nearest the centre, LIVES.respawnAhead free cells ahead, away from the items. */
  function respawnSpot(prefer) {
    const items = [food, mush && mush.cell].map((c) => (c ? toBoard(space, c) : null)).filter(Boolean);
    const dirs = [prefer, ...DIR_ORDER.filter((d) => d !== prefer)];
    const tries = [[LIVES.respawnAhead, LIVES.respawnItemGap], [LIVES.respawnAhead, 1], [2, 1], [0, 1], [0, 0]];
    for (const [ahead, gap] of tries) {
      let best = null;
      for (const d of dirs) {
        const v = DIRS[d];
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const cells = [];
            for (let k = 0; k < LIVES.respawnLength; k++) cells.push([x - v.x * k, y - v.y * k]);
            for (let k = 1; k <= ahead; k++) cells.push([x + v.x * k, y + v.y * k]);
            let ok = cells.every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < N && cy < N);
            if (ok) {
              ok = cells.every(([cx, cy], k) => items.every((it) => {
                const m = Math.abs(it.x - cx) + Math.abs(it.y - cy);
                return k < LIVES.respawnLength ? m >= gap : m >= 1;
              }));
            }
            if (!ok) continue;
            const dd = (x - 7.5) ** 2 + (y - 7.5) ** 2;
            if (!best || dd < best.dd) best = { x, y, d, dd };
          }
        }
      }
      if (best) return best;
    }
    return { x: N / 2, y: N / 2, d: 'right' };
  }

  function collide(reason, at) {
    death = Object.freeze({ reason, cell: cell(at.x, at.y) });
    grew = false;
    prevTail = body[body.length - 1];
    queue = [];
    if (lives > 1) {
      lives -= 1;
      const s = respawnSpot(space.kind === 'lane' ? 'up' : dir);
      const v = DIRS[s.d];
      body = [];
      for (let k = 0; k < LIVES.respawnLength; k++) body.push(fromBoard(space, s.x - v.x * k, s.y - v.y * k));
      dir = s.d;
      prevDir = s.d;
      prevTail = body[body.length - 1];
      if (space.kind === 'lane') space.prevY0 = space.y0;
      if (space.kind === 'cube') { space.prevFace = space.face; space.prevRot = space.rot; space.entered = null; }
      paused = true;
      waiting = 'respawn';
      acc = 0;
      touch();
      emit('step', { tick, ate: false });
      emit('lifeLost', { lives, death });
    } else {
      lives = 0;
      alive = false;
      acc = 0;
      touch();
      emit('step', { tick, ate: false });
      emit('died', { death, score, tick });
    }
  }

  // ------------------------------------------------------------ the tick

  function doStep() {
    const nextDir = queue.length ? queue.shift() : dir;
    prevDir = dir;
    dir = nextDir;
    tick += 1;
    waiting = null;
    if (space.kind === 'lane') space.prevY0 = space.y0;
    if (space.kind === 'cube') { space.prevFace = space.face; space.prevRot = space.rot; space.entered = null; }

    const head = body[0];
    const hb = toBoard(space, head);
    const unfolded = { x: hb.x + DIRS[dir].x, y: hb.y + DIRS[dir].y };
    const res = stepIn(space, head, dir);
    if (!res) return collide('wall', unfolded);
    const target = res.cell;

    const eatsDot = !!food && sameCell(food, target);
    const eatsMush = !!mush && sameCell(mush.cell, target);
    const eats = eatsDot || eatsMush;
    // The tail cell is being vacated this tick unless the snake grows.
    const limit = eats ? body.length : body.length - 1;
    for (let i = 0; i < limit; i++) {
      if (body[i] !== OFF && sameCell(body[i], target)) {
        return collide('self', toBoard(space, target) || unfolded);
      }
    }

    body.unshift(target);
    if (space.kind === 'cube') {
      space.face = res.face;
      space.rot = res.rot;
      space.entered = res.crossed ? dir : null;
    }
    if (space.kind === 'lane') laneFollow(space, target);

    if (!eats) {
      grew = false;
      prevTail = body.pop();
      tickItems();
      touch();
      emit('step', { tick, ate: false });
      return;
    }

    // A food event: the dot or a mushroom.
    grew = true;
    prevTail = body[body.length - 1];
    score += 1;
    let lifeGained = false;
    if (eatsDot) food = null;
    if (eatsMush) {
      mush = null;
      lifeGained = lives < LIVES.max;
      lives = Math.min(LIVES.max, lives + 1);
    }
    const u0 = universe();
    if (u0.mushrooms) {
      mushFoods += 1;
      if (mushFoods % MUSHROOM.every === 0) mushPending = true;
    }
    tickItems();
    const kind = eatsMush ? 'mushroom' : 'dot';
    const ateCell = toBoard(space, target);

    if (flow.held()) { // a held bite: only ate fires, holdLeft drops by one
      flow.onFood(score);
      if (!food) food = placeDot();
      touch();
      emit('step', { tick, ate: true });
      emit('ate', { kind, score, cell: ateCell, lifeGained, held: true, tick });
      if (!food) complete();
      return;
    }
    touch();
    emit('step', { tick, ate: true });
    emit('ate', { kind, score, cell: ateCell, lifeGained, held: false, tick });
    // Then the next universe is picked, the space changes, the dot is placed, and shift fires.
    const decision = flow.onFood(score);
    if (!decision.shift) { // nowhere to go (a one-universe table)
      if (!food) food = placeDot();
      touch();
      if (!food) complete();
      return;
    }
    const placed = arrive(u0);
    touch();
    emit('shift', { from: decision.from, to: decision.to, index: decision.index, reset: decision.reset });
    if (!placed) complete();
  }

  /** Mushroom expiry and pending spawns, after the move. */
  function tickItems() {
    if (mush && tick - mush.born >= MUSHROOM.lifetimeTicks) mush = null;
    if (mushPending && !mush && universe().mushrooms) {
      mush = placeMushroom();
      mushPending = false;
    }
  }

  function complete() { // no free cell left for the dot
    alive = false;
    death = Object.freeze({ reason: 'complete', cell: toBoard(space, body[0]) });
    touch();
    emit('died', { death, score, tick });
  }

  function step() {
    if (!alive) return false;
    doStep();
    return true;
  }

  function advance(dtMs) {
    if (!alive || paused || !(dtMs > 0)) return 0;
    acc += dtMs;
    let n = 0;
    while (alive && !paused) {
      const ms = stepMsFor(score, sp); // taken before the tick
      if (acc < ms) break;
      acc -= ms;
      doStep();
      n += 1;
    }
    if (!alive) acc = 0;
    return n;
  }

  function lockUniverse(id) {
    const prev = universe();
    const r = flow.lock(id);
    if (!r || !r.shift) { touch(); return false; }
    const placed = arrive(prev);
    touch();
    emit('shift', { from: r.from, to: r.to, index: r.index, reset: false });
    if (!placed) complete();
    return true;
  }

  // ------------------------------------------------------------ snapshot

  function build() {
    const snake = [], idx = [];
    for (let i = 0; i < body.length; i++) {
      const b = toBoard(space, body[i]);
      if (b) { snake.push(b); idx.push(i); }
    }
    const breaks = [];
    for (let k = 0; k + 1 < idx.length; k++) if (idx[k + 1] !== idx[k] + 1) breaks.push(k);
    const fu = flow.current();
    const spaceSnap = space.kind === 'lane'
      ? { kind: 'lane', y0: space.y0, prevY0: space.prevY0 }
      : space.kind === 'cube'
        ? { kind: 'cube', face: space.face, rot: space.rot, prevFace: space.prevFace, prevRot: space.prevRot, entered: space.entered }
        : { kind: 'box' };
    return {
      snake: Object.freeze(snake),
      breaks: Object.freeze(breaks),
      prevTail: prevTail && prevTail !== OFF ? toBoard(space, prevTail) : null,
      food: food ? toBoard(space, food) : null,
      mushroom: mush ? toBoard(space, mush.cell) : null,
      universe: Object.freeze({ id: fu.id, rules: fu.universe.rules, mushrooms: fu.universe.mushrooms, index: fu.index, holdLeft: fu.holdLeft }),
      space: Object.freeze(spaceSnap),
      body: space.kind === 'box' ? null : Object.freeze(body.filter((c) => c !== OFF)),
      foodAt: space.kind === 'box' || !food ? null : food,
    };
  }

  function snapshot() {
    if (!cache) cache = build();
    const ms = stepMsFor(score, sp);
    return Object.freeze({
      cols, rows,
      snake: cache.snake,
      breaks: cache.breaks,
      length: body.length,
      dir, prevDir,
      // Where the snake will be heading once every queued turn has been applied.
      heading: queue.length ? queue[queue.length - 1] : dir,
      prevTail: cache.prevTail,
      grew,
      food: cache.food,
      mushroom: cache.mushroom,
      score,
      stepMs: ms,
      tick,
      progress: Math.min(0.999999, Math.max(0, acc / ms)),
      alive, paused, waiting, death,
      lives, maxLives: LIVES.max,
      universe: cache.universe,
      space: cache.space,
      body: cache.body,
      foodAt: cache.foodAt,
      seed: runSeed,
    });
  }

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  }

  runSeed = seed;
  reset(seed);

  return {
    cols, rows, speed: sp, universes: flow.universes,
    reset, setPaused, queueTurn, advance, step, snapshot, on, lockUniverse,
    get seed() { return runSeed; },
  };
}
