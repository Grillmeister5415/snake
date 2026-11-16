// Autopilot: picks a direction from a snapshot alone and steers through
// queueTurn, like a player. Used by tests and by ?auto demo runs.

import { DIRS, OPPOSITE } from './sim.js';

const ORDER = ['up', 'right', 'down', 'left'];

function flood(blocked, cols, rows, sx, sy, target) {
  // Returns { area, dist } where dist is BFS steps to target (or Infinity).
  const seen = new Uint8Array(cols * rows);
  const qx = new Int16Array(cols * rows);
  const qy = new Int16Array(cols * rows);
  const qd = new Int16Array(cols * rows);
  let h = 0, t = 0, area = 0, dist = Infinity;
  seen[sy * cols + sx] = 1;
  qx[t] = sx; qy[t] = sy; qd[t] = 0; t++;
  while (h < t) {
    const x = qx[h], y = qy[h], d = qd[h]; h++;
    area++;
    if (target && dist === Infinity && x === target.x && y === target.y) dist = d;
    for (const k of ORDER) {
      const nx = x + DIRS[k].x, ny = y + DIRS[k].y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const i = ny * cols + nx;
      if (seen[i] || blocked[i]) continue;
      seen[i] = 1;
      qx[t] = nx; qy[t] = ny; qd[t] = d + 1; t++;
    }
  }
  return { area, dist };
}

/** Choose a direction for the next tick. Returns one of 'up'|'down'|'left'|'right'. */
export function chooseDir(snap) {
  const { cols, rows, snake, dir, food } = snap;
  const head = snake[0];
  const n = snake.length;
  let best = null;

  for (const d of ORDER) {
    if (d === OPPOSITE[dir]) continue;
    const nx = head.x + DIRS[d].x, ny = head.y + DIRS[d].y;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const eats = !!food && food.x === nx && food.y === ny;
    // Body after the move: head..(tail kept if eating).
    const keep = eats ? n : n - 1;
    let hit = false;
    const blocked = new Uint8Array(cols * rows);
    for (let i = 0; i < keep; i++) {
      const c = snake[i];
      if (c.x === nx && c.y === ny) hit = true;
      blocked[c.y * cols + c.x] = 1;
    }
    if (hit) continue;
    const newTail = snake[keep - 1];
    // The new tail will move away, so it counts as reachable space.
    blocked[newTail.y * cols + newTail.x] = 0;
    const { area, dist } = flood(blocked, cols, rows, nx, ny, food);
    const tailCheck = flood(blocked, cols, rows, nx, ny, newTail);
    const safe = tailCheck.dist !== Infinity || area > n + 2;
    const score = (safe ? 1e6 : 0) + (safe ? -Math.min(dist, 999) * 10 : area * 10) + (d === dir ? 1 : 0) + (eats ? 5 : 0);
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
