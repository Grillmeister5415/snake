// rooms-b harness: fakes snapshots and fx to show the disco and plastic rooms alone.
// URL: ?room=disco|plastic|court  ?view=pov  ?chaos=0.8  ?rf  ?rm  ?pause
// Console: __rb.check() (current room), __rb.sweep() (both rooms, both views, calm + wild),
//          __rb.run(frames, dtMs) drives frames by hand when the pane throttles rAF.
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const out = $('out');
const canvas = $('gl');
const ROOMS = ['disco', 'plastic'];

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// ---------------- fake simulation (same rules as dev/gl.js) ----------------
let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const S = {};
function resetSim() {
  Object.assign(S, {
    snake: [{ x: 8, y: 10 }, { x: 8, y: 11 }, { x: 8, y: 12 }, { x: 8, y: 13 }, { x: 8, y: 14 }],
    dir: 'up', prevDir: 'up', prevTail: { x: 8, y: 15 }, grew: false,
    food: { x: 8, y: 4 }, score: 0, stepMs: 150, tick: 0, alive: true, acc: 0, queued: null,
  });
}
resetSim();
const key = (c) => c.x + c.y * COLS;
function free(c, grow) {
  if (c.x < 0 || c.y < 0 || c.x >= COLS || c.y >= ROWS) return false;
  const body = S.snake.slice(0, grow ? S.snake.length : S.snake.length - 1);
  return !body.some((b) => b.x === c.x && b.y === c.y);
}
function placeFood() {
  const occ = new Set(S.snake.map(key));
  const cells = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!occ.has(x + y * COLS)) cells.push({ x, y });
  S.food = cells.length ? cells[(rand() * cells.length) | 0] : null;
}
function stepSim() {
  const h = S.snake[0];
  const next = (d) => ({ x: h.x + DIRS[d][0], y: h.y + DIRS[d][1] });
  const grows = (c) => S.food && c.x === S.food.x && c.y === S.food.y;
  let dir = S.queued && S.queued !== OPP[S.dir] ? S.queued : null;
  S.queued = null;
  if (!dir) {
    const opts = Object.keys(DIRS).filter((d) => d !== OPP[S.dir] && free(next(d), grows(next(d))));
    if (!opts.length) { resetSim(); return; }
    const toward = opts.slice().sort((a, b) => {
      const na = next(a), nb = next(b);
      return Math.abs(na.x - S.food.x) + Math.abs(na.y - S.food.y) - (Math.abs(nb.x - S.food.x) + Math.abs(nb.y - S.food.y));
    });
    dir = rand() < 0.8 ? toward[0] : opts[(rand() * opts.length) | 0];
  }
  const n = next(dir);
  const grow = grows(n);
  if (!free(n, grow)) { resetSim(); return; }
  S.prevDir = S.dir;
  S.dir = dir;
  S.prevTail = { ...S.snake[S.snake.length - 1] };
  S.snake.unshift(n);
  if (!grow) S.snake.pop();
  S.grew = grow;
  S.tick++;
  if (grow) { S.score++; triggerBite(n); placeFood(); }
}
function snapshot() {
  return deepFreeze({
    cols: COLS, rows: ROWS, snake: S.snake.map((c) => ({ ...c })),
    dir: S.dir, prevDir: S.prevDir, prevTail: { ...S.prevTail }, grew: S.grew,
    food: S.food && { ...S.food }, score: S.score, stepMs: S.stepMs, tick: S.tick,
    progress: Math.min(1, S.acc / S.stepMs), alive: S.alive, paused, death: null,
  });
}

// ---------------- fake fx ----------------
let view = q.get('view') === 'pov' ? 'pov' : 'board';
let paused = q.has('pause');
let roomId = q.get('room') || 'disco';
let variant = 0, bite = null, biteAt = -Infinity, cutAt = performance.now();
let animTime = 0, lastNow = performance.now(), clock = performance.now();
const t0 = clock;
$('chaos').value = q.get('chaos') ?? '0.3';
$('rf').checked = q.has('rf');
$('rm').checked = q.has('rm');

function triggerBite(cell) {
  bite = { x: cell.x, y: cell.y };
  biteAt = clock;
  variant++;
}
function makeFx(now) {
  const rf = $('rf').checked, rm = $('rm').checked;
  const dt = Math.max(0, Math.min(0.1, (now - lastNow) / 1000));
  lastNow = now;
  animTime += dt * (rm ? 0.15 : 1);
  const beats = ((now - t0) / 1000) * (132 / 60);
  const beatIndex = Math.floor(beats);
  let beat = Math.exp(-(beats - beatIndex) * 5);
  if (rf) beat *= 0.15;
  const biteAge = now - biteAt;
  return {
    now, time: animTime, beat, beatIndex, chaos: +$('chaos').value,
    punch: rf ? 0 : Math.max(0, 1 - biteAge / 300),
    variant, bite, biteAge: bite ? biteAge : Infinity, cutAge: now - cutAt,
    reducedFlash: rf, reducedMotion: rm,
  };
}

// ---------------- renderer ----------------
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
const renderer = await createRoomRenderer(canvas, { cols: COLS, rows: ROWS });
function fit() { if (renderer) renderer.resize(innerWidth, innerHeight, devicePixelRatio || 1); }
addEventListener('resize', fit);
fit();

function setView(v) { view = v; cutAt = clock; $('view').textContent = `view: ${view} (V)`; }
function setRoom(r) { roomId = r; cutAt = clock; $('room').textContent = `room: ${roomId} (R)`; }
setView(view);
setRoom(roomId);

let frames = 0, fpsT = performance.now(), fps = 0, renderMs = 0;
function tick(now) {
  if (!paused && S.alive) {
    S.acc += Math.min(100, Math.max(0, now - (tick.last ?? now)));
    while (S.acc >= S.stepMs) { S.acc -= S.stepMs; stepSim(); }
  }
  tick.last = now;
  clock = now;
  if (renderer && !renderer.lost()) {
    const a = performance.now();
    renderer.render(roomId, view, snapshot(), makeFx(now));
    renderMs = renderMs * 0.9 + (performance.now() - a) * 0.1;
  }
  frames++;
}
function loop(now) {
  tick(now);
  if (now - fpsT > 1000) {
    fps = Math.round((frames * 1000) / (now - fpsT));
    frames = 0;
    fpsT = now;
    if (!checkText) status();
  }
  requestAnimationFrame(loop);
}
let checkText = '';
function status() {
  if (!renderer) { out.textContent = 'renderer: null (WebGL unavailable)'; return; }
  out.textContent = `rooms: ${Object.keys(renderer.rooms).join(', ')} | ${roomId}/${view} | ${canvas.width}x${canvas.height} | ${fps} fps | ${renderMs.toFixed(2)} ms | score ${S.score}` + (checkText ? '\n' + checkText : '');
}
requestAnimationFrame(loop);

// Drive frames by hand (hidden panes throttle rAF): advances a synthetic clock.
function run(n = 60, dt = 16.7) {
  let now = Math.max(clock, performance.now());
  for (let i = 0; i < n; i++) { now += dt; tick(now); }
  status();
  return { frames: n, score: S.score, variant, errors: errors.slice() };
}

// ---------------- controls ----------------
$('toggle').onclick = () => $('ui').classList.toggle('min');
$('room').onclick = () => setRoom(ROOMS[(ROOMS.indexOf(roomId) + 1) % ROOMS.length]);
$('view').onclick = () => setView(view === 'board' ? 'pov' : 'board');
$('bite').onclick = () => { if (S.food) triggerBite(S.food); placeFood(); };
$('pause').onclick = () => { paused = !paused; };
$('check').onclick = () => check();
addEventListener('keydown', (e) => {
  const k = e.code;
  if (k === 'KeyV') $('view').onclick();
  else if (k === 'KeyR') $('room').onclick();
  else if (k === 'KeyB') $('bite').onclick();
  else if (k === 'Space') { paused = !paused; e.preventDefault(); }
  else if (k === 'KeyC') check();
  else if (k.startsWith('Arrow')) S.queued = k.slice(5).toLowerCase();
});

// ---------------- verification: cell check (modelled on dev/gl.js) ----------------
const cells = (list) => list.map(([x, y]) => ({ x, y }));
const CASES = {
  board: {
    view: 'board',
    snap: { snake: cells([[8, 10], [8, 11], [9, 11], [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [11, 7], [12, 7], [12, 8], [12, 9]]), dir: 'up', food: { x: 4, y: 3 } },
  },
  boardEdges: {
    view: 'board',
    snap: (() => {
      const s = [];
      for (let x = 15; x >= 0; x--) s.push([x, 0]);
      for (let y = 1; y < 16; y++) s.push([0, y]);
      for (let x = 1; x < 16; x++) s.push([x, 15]);
      return { snake: cells(s), dir: 'right', food: { x: 15, y: 8 } };
    })(),
  },
  pov: {
    view: 'pov',
    snap: { snake: cells([[5, 14], [5, 15], [6, 15], [7, 15], [7, 14], [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [6, 9], [5, 9], [4, 9]]), dir: 'up', food: { x: 3, y: 4 } },
    only: [[7, 11], [7, 10], [7, 9], [6, 9], [5, 9], [4, 9], [3, 4], [5, 13], [5, 12], [5, 11], [5, 10], [4, 12], [4, 11], [4, 10], [6, 12], [6, 11], [6, 10], [3, 11], [3, 10]],
  },
};
// Per-room colour classes. Calm runs test identity (snake / dot / empty); wild runs (chaos 1,
// beat 1, variant 3) test that nothing covers an empty cell and that snake and dot stay lit.
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const CLASSES = {
  disco: {
    dot: (r, g, b) => r > 150 && g > 90 && b < 0.6 * r,
    snake: (r, g, b) => lumOf(r, g, b) > 90 && b >= 0.75 * r,
    empty: (r, g, b) => lumOf(r, g, b) < 60,
  },
  plastic: {
    dot: (r, g, b) => r > 150 && g > 110 && b < 0.6 * r,
    snake: (r, g, b) => lumOf(r, g, b) > 90 && b >= 0.6 * r,   // chrome mirrors the (cool) sky hue
    empty: (r, g, b) => lumOf(r, g, b) < 75,
  },
  court: {
    dot: (r, g, b) => r > 150 && g > 100 && b < 0.6 * r,
    snake: (r, g, b) => lumOf(r, g, b) > 90 && b >= 0.85 * r,
    empty: (r, g, b) => lumOf(r, g, b) < 75,
  },
};
function classify(id, r, g, b, wild) {
  const C = CLASSES[id] || CLASSES.court;
  if (wild) return C.empty(r, g, b) ? 'empty' : lumOf(r, g, b) > 90 ? 'lit' : `?(${r | 0},${g | 0},${b | 0})`;
  if (C.dot(r, g, b)) return 'dot';
  if (C.snake(r, g, b)) return 'snake';
  if (C.empty(r, g, b)) return 'empty';
  return `?(${r | 0},${g | 0},${b | 0})`;
}

function checkRoom(id, wild = false) {
  const gl = renderer.debug.gl;
  const res = {};
  for (const [name, c] of Object.entries(CASES)) {
    const snap = deepFreeze({
      cols: COLS, rows: ROWS, snake: c.snap.snake, dir: c.snap.dir, prevDir: c.snap.dir,
      prevTail: c.snap.snake[c.snap.snake.length - 1], grew: false, food: c.snap.food,
      score: 0, stepMs: 150, tick: 0, progress: 0.4, alive: true, paused: false, death: null,
    });
    const fx = wild
      ? { now: performance.now(), time: 7.3, beat: 1, beatIndex: 5, chaos: 1, punch: 0, variant: 3, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: false }
      : { now: performance.now(), time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: true };
    renderer.render(id, c.view, snap, fx);
    renderer.render(id, c.view, snap, fx);
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const snakeSet = new Set(snap.snake.map(key));
    const headKey = key(snap.snake[0]);
    const only = c.only && new Set(c.only.map(([x, y]) => x + y * COLS));
    let tested = 0, skipped = 0;
    const bad = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const k = x + y * COLS;
        if (only && !only.has(k)) continue;
        if (c.view === 'pov' && k === headKey) continue;
        let exp = snakeSet.has(k) ? 'snake' : snap.food && snap.food.x === x && snap.food.y === y ? 'dot' : 'empty';
        const h = exp === 'snake' ? (k === headKey ? 0.3 : 0.26) : exp === 'dot' ? 0.18 : 0;
        if (wild && exp !== 'empty') exp = 'lit';
        const [wx, wz] = renderer.debug.cellToWorld(x, y);
        const p = renderer.debug.project(wx, h, wz);
        if (!p.visible) { skipped++; continue; }
        const sx = Math.round(p.x), sy = H - 1 - Math.round(p.y);
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const i = ((sy + dy) * W + (sx + dx)) * 4;
          if (i < 0 || i >= px.length) continue;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
        const got = classify(id, r / n, g / n, b / n, wild);
        tested++;
        if (got !== exp) bad.push(`${x},${y} want ${exp} got ${got}`);
      }
    }
    res[name] = { tested, skipped, mismatches: bad.length, bad: bad.slice(0, 6) };
  }
  return res;
}
const fmt = (title, res) => `${title}\n` + Object.entries(res).map(([n, r]) => `  ${n}: ${r.tested} cells, ${r.mismatches} bad, ${r.skipped} off-screen${r.bad.length ? '\n    ' + r.bad.join('\n    ') : ''}`).join('\n');

function check(id = roomId) {
  if (!renderer) { checkText = 'check: no renderer'; status(); return null; }
  const res = { calm: checkRoom(id, false), wild: checkRoom(id, true) };
  checkText = fmt(`${id} calm`, res.calm) + '\n' + fmt(`${id} wild`, res.wild);
  status();
  return res;
}
function sweep() {
  const all = {};
  let bad = 0;
  for (const id of ROOMS) {
    if (!renderer.rooms[id]) { all[id] = 'not loaded'; bad++; continue; }
    all[id] = { calm: checkRoom(id, false), wild: checkRoom(id, true) };
    for (const m of ['calm', 'wild']) for (const r of Object.values(all[id][m])) bad += r.mismatches;
  }
  checkText = `sweep ${canvas.width}x${canvas.height}: ${bad} problems\n` + ROOMS.map((id) => typeof all[id] === 'string' ? `${id}: ${all[id]}` : fmt(`${id} calm`, all[id].calm) + '\n' + fmt(`${id} wild`, all[id].wild)).join('\n');
  status();
  return { size: [canvas.width, canvas.height], problems: bad, errors: errors.slice(), all };
}
window.__rb = { renderer, S, check, sweep, run, setView, setRoom, errors };
