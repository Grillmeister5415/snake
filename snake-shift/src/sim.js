// Classic Snake simulation. Pure: no DOM, own seeded generator, fixed tick.
// The rules never change. Visuals read snapshots and can never write state.

import { createRng } from './rng.js';
import { SPEED } from './config.js';

export const DIRS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
});
export const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });

export function stepMsFor(score, speed = SPEED) {
  return Math.max(speed.capMs, speed.startMs - speed.rampMs * score);
}

const cell = (x, y) => Object.freeze({ x, y });

/**
 * createSim({ cols, rows, speed: { startMs, rampMs, capMs }, seed, start })
 * `start` (optional, tests only): { snake: [{x,y}...head first], dir, food } fixes the opening layout.
 * Death cells: 'wall' -> the out-of-grid cell the head tried to enter; 'self' -> the body cell hit;
 * 'complete' -> the head (board full).
 */
export function createSim({ cols = 16, rows = 16, speed = SPEED, seed = 1, start = null } = {}) {
  const sp = Object.freeze({ ...SPEED, ...speed });
  const listeners = new Map();
  const occupied = new Uint8Array(cols * rows);

  let rng, runSeed;
  let snake, dir, prevDir, prevTail, grew, food, score, tick, alive, paused, death, queue, acc;
  let frozenSnake = null;

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[sim] '${type}' listener failed`, err); }
    }
  }

  function inside(x, y) { return x >= 0 && y >= 0 && x < cols && y < rows; }

  function spawnFood() {
    occupied.fill(0);
    for (const c of snake) occupied[c.y * cols + c.x] = 1;
    const free = [];
    for (let i = 0; i < occupied.length; i++) if (!occupied[i]) free.push(i);
    if (!free.length) return null;
    const i = free[rng.int(free.length)];
    return cell(i % cols, Math.floor(i / cols));
  }

  function reset(s) {
    if (s !== undefined && s !== null) runSeed = s;
    rng = createRng(runSeed);
    if (start && start.snake) {
      snake = start.snake.map((c) => cell(c.x, c.y));
      dir = start.dir || 'right';
    } else {
      const hx = Math.floor(cols / 2), hy = Math.floor(rows / 2);
      snake = [cell(hx, hy), cell(hx - 1, hy), cell(hx - 2, hy)];
      dir = 'right';
    }
    prevDir = dir;
    prevTail = snake[snake.length - 1];
    grew = false;
    score = 0;
    tick = 0;
    alive = true;
    paused = true;
    death = null;
    queue = [];
    acc = 0;
    frozenSnake = null;
    food = start && start.food ? cell(start.food.x, start.food.y) : spawnFood();
    emit('reset', { seed: runSeed });
  }

  function setPaused(p) {
    p = !!p;
    if (p === paused) return;
    paused = p;
    emit(p ? 'pause' : 'resume', { tick });
  }

  function queueTurn(d) {
    if (!alive || !DIRS[d]) return false;
    if (queue.length >= 2) return false;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (d === last || d === OPPOSITE[last]) return false;
    queue.push(d);
    emit('turn', { dir: d, queued: queue.length });
    return true;
  }

  function doStep() {
    const nextDir = queue.length ? queue.shift() : dir;
    prevDir = dir;
    dir = nextDir;
    tick += 1;
    const head = snake[0];
    const d = DIRS[dir];
    const nx = head.x + d.x, ny = head.y + d.y;

    if (!inside(nx, ny)) {
      grew = false;
      prevTail = snake[snake.length - 1];
      alive = false;
      death = Object.freeze({ reason: 'wall', cell: cell(nx, ny) });
      emit('step', { tick, ate: false });
      emit('died', { death, tick, score });
      return;
    }

    const eats = !!food && food.x === nx && food.y === ny;
    // The tail cell is being vacated this tick unless the snake grows.
    const limit = eats ? snake.length : snake.length - 1;
    for (let i = 0; i < limit; i++) {
      const c = snake[i];
      if (c.x === nx && c.y === ny) {
        grew = false;
        prevTail = snake[snake.length - 1];
        alive = false;
        death = Object.freeze({ reason: 'self', cell: cell(nx, ny) });
        emit('step', { tick, ate: false });
        emit('died', { death, tick, score });
        return;
      }
    }

    const newHead = cell(nx, ny);
    snake.unshift(newHead);
    frozenSnake = null;
    if (eats) {
      grew = true;
      score += 1;
      prevTail = snake[snake.length - 1];
      food = spawnFood();
      emit('step', { tick, ate: true });
      emit('ate', { score, cell: newHead, tick });
      if (!food) {
        alive = false;
        death = Object.freeze({ reason: 'complete', cell: newHead });
        emit('died', { death, tick, score });
      }
    } else {
      grew = false;
      prevTail = snake.pop();
      emit('step', { tick, ate: false });
    }
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

  function snapshot() {
    if (!frozenSnake) frozenSnake = Object.freeze(snake.slice());
    const ms = stepMsFor(score, sp);
    return Object.freeze({
      cols, rows,
      snake: frozenSnake,
      dir, prevDir, prevTail, grew, food,
      // Where the snake will be heading once every queued turn has been applied.
      heading: queue.length ? queue[queue.length - 1] : dir,
      score,
      stepMs: ms,
      tick,
      progress: Math.min(0.999999, Math.max(0, acc / ms)),
      alive, paused, death,
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
    cols, rows, speed: sp,
    reset, setPaused, queueTurn, advance, step, snapshot, on,
    get seed() { return runSeed; },
  };
}
