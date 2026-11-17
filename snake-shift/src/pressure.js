// SNAKE//SHIFT — musical pressure estimate (SOUND_PLAN 2.4). Pure: reads a snapshot, writes nothing.
//
// createPressure() → { evaluate(snap) } reuses its buffers; pressureOf(snap) is a one-off copy.
// Result: { danger 0..1, exits 0..3, ahead 0..6, escape 0..2, room, certain }.
//
// This is a musical estimate, not a navigation aid. It never promises safety and gives no direction.
// - Hittable cells: snap.snake in a box, snap.body in lane and cube (space coordinates).
// - Walls come from stepIn() only: four in a box, two in the lane, none on the cube.
//   On the cube the frame of each step is carried into the next call, as the sim does.
// - The projected path: turns[0] ?? dir, then turns[1] ?? the same, then straight on.
//   `heading` is never used for the next step.
// - Moving tail: body cell i is still there at step k when i <= L - 1 - k + (food eaten by step k).
//   When some body cells are off the board (snap.length > visible), every visible cell counts as occupied.

import { OPPOSITE, DIR_ORDER, stepIn, fromBoard, sameCell, spaceGraph } from './space.js';

export const PRESSURE = Object.freeze({
  look: 6,        // path steps looked at
  roomDepth: 5,   // flood fill depth for `room`
  closeMs: 200,   // time to impact at or below this: full path pressure
  farMs: 560,     // at or above this: none
  // Path pressure by sideways ways out at the last safe cell. With both sides open it stays under the
  // tense threshold (0.40): heading at a wall in the open is not an emergency.
  escape: Object.freeze([1, 0.7, 0.36]),
  exits: Object.freeze([1, 0.55, 0.1, 0]), // pressure by legal next moves
  room: 0.8,      // weight of a small reachable area
  roomCap: 24,    // area that counts as enough room (or length + 2 when smaller)
});

const SIDES = { up: ['left', 'right'], down: ['left', 'right'], left: ['up', 'down'], right: ['up', 'down'] };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ZERO = Object.freeze({ danger: 0, exits: 3, ahead: PRESSURE.look, escape: 2, room: 0, certain: false });

export function createPressure() {
  let owner = new Int32Array(0); // graph index -> smallest body index on it, or -1
  let mark = new Int32Array(0);  // flood fill stamps
  let queue = new Int32Array(0);
  let depth = new Int8Array(0);
  let stamp = 0;
  const cube = { kind: 'cube', face: 0, rot: 0 }; // frame carried along the projected path
  const side = { kind: 'cube', face: 0, rot: 0 };
  const out = { danger: 0, exits: 3, ahead: PRESSURE.look, escape: 2, room: 0, certain: false };

  function size(n) {
    if (owner.length >= n) return;
    owner = new Int32Array(n).fill(-1);
    mark = new Int32Array(n);
    queue = new Int32Array(n);
    depth = new Int8Array(n);
    stamp = 0;
  }

  function evaluate(snap) {
    if (!snap || !snap.alive || snap.paused || snap.waiting) return Object.assign(out, ZERO);
    const space = snap.space || { kind: 'box' };
    const box = space.kind === 'box' || !snap.body;
    const body = box ? snap.snake : snap.body;
    if (!body || !body.length) return Object.assign(out, ZERO);
    const L = Math.max(body.length, snap.length || 0);
    const tailKnown = body.length === L;
    const g = spaceGraph(space);
    size(g.size);
    for (let i = 0; i < body.length; i++) {
      const k = g.index(body[i]);
      if (k >= 0 && owner[k] < 0) owner[k] = i;
    }
    const food0 = box ? snap.food : snap.foodAt;
    const food1 = snap.mushroom ? fromBoard(space, snap.mushroom.x, snap.mushroom.y) : null;
    const isFood = (c) => sameCell(food0, c) || sameCell(food1, c);
    // Occupied at step k (1 = the next move), with `eaten` foods taken by then.
    const occupied = (c, k, eaten) => {
      const j = g.index(c);
      if (j < 0) return false;
      const o = owner[j];
      if (o < 0) return false;
      return !tailKnown || o <= L - 1 - k + eaten;
    };
    const cubeSpace = space.kind === 'cube';
    if (cubeSpace) { cube.face = space.face; cube.rot = space.rot; }
    const sp = cubeSpace ? cube : space;
    const head = body[0];
    const dir = snap.dir;
    const turns = snap.turns || [];

    // exits: legal next moves among the three non-reverse directions.
    let exits = 0;
    for (const d of DIR_ORDER) {
      if (d === OPPOSITE[dir]) continue;
      const r = stepIn(sp, head, d);
      if (r && !occupied(r.cell, 1, isFood(r.cell) ? 1 : 0)) exits++;
    }

    // The projected path.
    let cur = head;
    let eaten = 0;
    let ahead = PRESSURE.look;
    let escape = 2;
    let certain = false;
    let d1 = turns[0] || dir;
    for (let k = 1; k <= PRESSURE.look; k++) {
      const d = k === 1 ? d1 : k === 2 ? turns[1] || d1 : turns[1] || d1;
      const r = stepIn(sp, cur, d);
      const eats = r && isFood(r.cell) ? 1 : 0;
      if (!r || occupied(r.cell, k, eaten + eats)) {
        ahead = k - 1;
        certain = k <= turns.length;
        escape = 0;
        for (const s of SIDES[d]) {
          if (cubeSpace) { side.face = cube.face; side.rot = cube.rot; }
          const q = stepIn(cubeSpace ? side : sp, cur, s);
          if (q && !occupied(q.cell, k, eaten + (isFood(q.cell) ? 1 : 0))) escape++;
        }
        break;
      }
      eaten += eats;
      cur = r.cell;
      if (cubeSpace) { cube.face = r.face; cube.rot = r.rot; }
    }

    // room: cells reachable within roomDepth steps (a body cell that vacates before arrival is free).
    stamp++;
    const h = g.index(head);
    let room = 0;
    if (h >= 0) {
      let qh = 0, qt = 0;
      mark[h] = stamp;
      queue[qt] = h; depth[qt++] = 0;
      const nb = g.nb;
      while (qh < qt) {
        const i = queue[qh], di = depth[qh++];
        if (di >= PRESSURE.roomDepth) continue;
        for (let n = 0; n < 4; n++) {
          const j = nb[i * 4 + n];
          if (j < 0 || mark[j] === stamp) continue;
          mark[j] = stamp;
          const o = owner[j];
          if (o >= 0 && (!tailKnown || o <= L - 1 - (di + 1))) continue;
          room++;
          queue[qt] = j; depth[qt++] = di + 1;
        }
      }
    }
    for (let i = 0; i < body.length; i++) { const k = g.index(body[i]); if (k >= 0) owner[k] = -1; }

    const stepMs = snap.stepMs > 0 ? snap.stepMs : 150;
    const tti = ahead >= PRESSURE.look ? Infinity : ahead * stepMs;
    const close = clamp01((PRESSURE.farMs - tti) / (PRESSURE.farMs - PRESSURE.closeMs));
    if (exits === 0) certain = true;
    const pPath = certain ? 1 : close * PRESSURE.escape[escape];
    const pExit = PRESSURE.exits[exits];
    const pRoom = PRESSURE.room * clamp01(1 - room / Math.min(PRESSURE.roomCap, L + 2));
    out.danger = Math.max(pPath, pExit, pRoom);
    out.exits = exits;
    out.ahead = ahead;
    out.escape = escape;
    out.room = room;
    out.certain = certain;
    return out;
  }

  return { evaluate };
}

const shared = createPressure();
/** One-off estimate; returns a fresh object. */
export function pressureOf(snap) {
  return { ...shared.evaluate(snap) };
}
