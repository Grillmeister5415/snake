// Autopilot: picks a direction from a snapshot alone and steers through
// queueTurn, like a player. Works in all three spaces (box, lane, cube) using
// the neighbours of space.js. Used by tests and by ?auto demo runs.

import { OPPOSITE, DIR_ORDER, stepIn, fromBoard, spaceGraph, bfs, sameCell } from './space.js';

/** Choose a board-local direction for the next tick. Returns one of 'up'|'down'|'left'|'right'. */
export function chooseDir(snap) {
  const space = snap.space || { kind: 'box' };
  const box = space.kind === 'box' || !snap.body;
  // Every hittable cell, head first, in space coordinates. In a box that is the visible snake.
  const body = box ? snap.snake : snap.body;
  const head = body[0];
  const dir = snap.dir;
  const n = body.length;
  // Off-board cells may hide the true tail; then no cell is assumed to be vacated.
  const tailKnown = n === (snap.length ?? n);
  const targets = [];
  if (box ? snap.food : snap.foodAt) targets.push(box ? snap.food : snap.foodAt);
  if (snap.mushroom) targets.push(fromBoard(space, snap.mushroom.x, snap.mushroom.y));
  const g = spaceGraph(space);
  let best = null;

  for (const d of DIR_ORDER) {
    if (d === OPPOSITE[dir]) continue;
    const r = stepIn(space, head, d);
    if (!r) continue;
    const nc = r.cell;
    const eats = targets.some((t) => sameCell(t, nc));
    const keep = eats || !tailKnown ? n : n - 1;
    const blocked = new Uint8Array(g.size);
    let hit = false;
    for (let i = 0; i < keep; i++) {
      const c = body[i];
      if (sameCell(c, nc)) hit = true;
      const k = g.index(c);
      if (k >= 0) blocked[k] = 1;
    }
    if (hit) continue;
    const newTail = body[keep - 1];
    const tailIdx = g.index(newTail);
    // The new tail will move away, so it counts as reachable space.
    if (tailKnown && tailIdx >= 0) blocked[tailIdx] = 0;
    const dist = bfs(g, blocked, g.index(nc));
    let area = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 0) area++;
    let foodDist = Infinity;
    for (const t of targets) {
      const ti = g.index(t);
      // Outside the search window (far along the lane): head that way by plain distance.
      const td = ti >= 0 ? (dist[ti] >= 0 ? dist[ti] : Infinity) : 200 + Math.abs(t.x - nc.x) + Math.abs(t.y - nc.y);
      if (td < foodDist) foodDist = td;
    }
    const safe = (tailKnown && tailIdx >= 0 && dist[tailIdx] >= 0) || area > n + 2;
    const score = (safe ? 1e6 : 0) + (safe ? -Math.min(foodDist, 999) * 10 : area * 10) + (d === dir ? 1 : 0) + (eats ? 5 : 0);
    if (!best || score > best.score) best = { d, score };
  }
  return best ? best.d : dir;
}

/** Steers a sim once per tick. Call update() every frame or before every step(). */
export function createAutopilot(sim) {
  let lastKey = -1;
  return {
    update() {
      const s = sim.snapshot();
      if (!s.alive) return null;
      const key = s.tick;
      if (key === lastKey) return null;
      lastKey = key;
      const d = chooseDir(s);
      if (d !== s.dir) sim.queueTurn(d);
      return d;
    },
    reset() { lastKey = -1; },
  };
}
