// rooms-a harness: bunker (and court as the regression check) through createRoomRenderer.
// URL: ?room=bunker|court  ?view=pov  ?chaos=0.8  ?rf  ?rm  ?pause
// Console: __ra.check() runs the cell check for every room, both views, at 1280x760 and 375x812.
//          __ra.frames(n, dtMs) renders n frames by hand (the hidden preview pane throttles rAF).
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const out = $('out');
const canvas = $('gl');
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const key = (c) => c.x + c.y * COLS;
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
};

// ---------------- fake simulation (autopilot toward the dot) ----------------
let seed = 9;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const S = {};
function resetSim() {
  Object.assign(S, {
    snake: [{ x: 8, y: 10 }, { x: 8, y: 11 }, { x: 8, y: 12 }, { x: 8, y: 13 }],
    dir: 'up', prevTail: { x: 8, y: 14 }, grew: false, food: { x: 8, y: 4 },
    score: 0, stepMs: 140, tick: 0, alive: true, acc: 0, queued: null,
  });
}
resetSim();
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
    opts.sort((a, b) => {
      const na = next(a), nb = next(b);
      return Math.abs(na.x - S.food.x) + Math.abs(na.y - S.food.y) - (Math.abs(nb.x - S.food.x) + Math.abs(nb.y - S.food.y));
    });
    dir = rand() < 0.85 ? opts[0] : opts[(rand() * opts.length) | 0];
  }
  const n = next(dir), grow = grows(n);
  if (!free(n, grow)) { resetSim(); return; }
  S.dir = dir;
  S.prevTail = { ...S.snake[S.snake.length - 1] };
  S.snake.unshift(n);
  if (!grow) S.snake.pop();
  S.grew = grow;
  S.tick++;
  if (grow) { S.score++; triggerBite(n); placeFood(); }
}
const snapshot = () => deepFreeze({
  cols: COLS, rows: ROWS, snake: S.snake.map((c) => ({ ...c })), dir: S.dir, prevDir: S.dir,
  prevTail: { ...S.prevTail }, grew: S.grew, food: S.food && { ...S.food }, score: S.score,
  stepMs: S.stepMs, tick: S.tick, progress: Math.min(1, S.acc / S.stepMs), alive: S.alive, paused, death: null,
});

// ---------------- fake fx ----------------
let view = q.get('view') === 'pov' ? 'pov' : 'board';
let roomId = q.get('room') || 'bunker';
let paused = q.has('pause');
let variant = 0, bite = null, biteAt = -Infinity, cutAt = 0, clock = 0, animTime = 0;
$('chaos').value = q.get('chaos') ?? '0.3';
$('rf').checked = q.has('rf');
$('rm').checked = q.has('rm');
$('room').value = roomId;
function triggerBite(cell) { bite = { x: cell.x, y: cell.y }; biteAt = clock; variant++; }
function makeFx(dt) {
  const rf = $('rf').checked, rm = $('rm').checked;
  animTime += (dt / 1000) * (rm ? 0.15 : 1);
  const beats = (clock / 1000) * (132 / 60);
  const beatIndex = Math.floor(beats);
  let beat = Math.exp(-(beats - beatIndex) * 5);
  if (rf) beat *= 0.15;
  const biteAge = clock - biteAt;
  return {
    now: clock, time: animTime, beat, beatIndex, chaos: +$('chaos').value,
    punch: rf ? 0 : Math.max(0, 1 - biteAge / 300), variant, bite, biteAge: bite ? biteAge : Infinity,
    cutAge: clock - cutAt, reducedFlash: rf, reducedMotion: rm,
  };
}

// ---------------- renderer + frame driver ----------------
const renderer = await createRoomRenderer(canvas, { cols: COLS, rows: ROWS });
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
function fit() { if (renderer) renderer.resize(innerWidth, innerHeight, devicePixelRatio || 1); }
addEventListener('resize', fit);
fit();
function setView(v) { view = v; cutAt = clock; $('view').textContent = `view: ${view} (V)`; }
setView(view);

let last = 0, fps = 0, frames0 = 0, fpsT = 0, frozen = q.has('freeze');
function step(dt) {
  clock += dt;
  if (!paused && S.alive) {
    S.acc += Math.min(100, dt);
    while (S.acc >= S.stepMs) { S.acc -= S.stepMs; stepSim(); }
  }
  if (renderer && !renderer.lost()) renderer.render(roomId, view, snapshot(), makeFx(dt));
}
function loop(now) {
  if (!frozen) step(last ? Math.min(100, now - last) : 16);
  last = now;
  frames0++;
  if (now - fpsT > 1000) { fps = Math.round((frames0 * 1000) / (now - fpsT)); frames0 = 0; fpsT = now; status(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
let checkText = '';
function status() {
  if (!renderer) { out.textContent = 'renderer: null'; return; }
  out.textContent = `rooms: ${Object.keys(renderer.rooms).join(', ')} | room ${roomId} | ${canvas.width}x${canvas.height} | ${fps} fps | score ${S.score}` + (checkText ? '\n' + checkText : '');
}

// ---------------- controls ----------------
$('toggle').onclick = () => $('ui').classList.toggle('min');
$('room').onchange = () => { roomId = $('room').value; };
$('view').onclick = () => setView(view === 'board' ? 'pov' : 'board');
$('bite').onclick = () => { if (S.food) triggerBite(S.food); placeFood(); };
$('pause').onclick = () => { paused = !paused; };
$('check').onclick = () => check();
addEventListener('keydown', (e) => {
  const k = e.code;
  if (k === 'KeyV') $('view').onclick();
  else if (k === 'KeyB') $('bite').onclick();
  else if (k === 'Space') { paused = !paused; e.preventDefault(); }
  else if (k === 'KeyC') check();
  else if (k.startsWith('Arrow')) S.queued = k.slice(5).toLowerCase();
});

// ---------------- cell check ----------------
const cells = (list) => list.map(([x, y]) => ({ x, y }));
const CASES = {
  board: { view: 'board', snake: cells([[8, 10], [8, 11], [9, 11], [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [11, 7], [12, 7], [12, 8], [12, 9]]), dir: 'up', food: { x: 4, y: 3 } },
  boardEdges: {
    view: 'board',
    snake: (() => {
      const s = [];
      for (let x = 15; x >= 0; x--) s.push([x, 0]);
      for (let y = 1; y < 16; y++) s.push([0, y]);
      for (let x = 1; x < 16; x++) s.push([x, 15]);
      return cells(s);
    })(),
    dir: 'right', food: { x: 15, y: 8 },
  },
  boardDotEdge: { view: 'board', snake: cells([[8, 8], [8, 9], [8, 10]]), dir: 'up', food: { x: 0, y: 15 } },
  pov: {
    view: 'pov',
    snake: cells([[5, 14], [5, 15], [6, 15], [7, 15], [7, 14], [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [6, 9], [5, 9], [4, 9]]), dir: 'up', food: { x: 3, y: 4 },
    only: [[7, 11], [7, 10], [7, 9], [6, 9], [5, 9], [4, 9], [3, 4], [5, 13], [5, 12], [5, 11], [5, 10], [4, 12], [4, 11], [4, 10], [6, 12], [6, 11], [6, 10], [3, 11], [3, 10]],
  },
};
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const CLASSIFY = {
  court(r, g, b) {
    if (r > 150 && g > 100 && b < 0.6 * r) return 'dot';
    if (lumOf(r, g, b) > 90 && b >= 0.85 * r) return 'snake';
    if (lumOf(r, g, b) < 75) return 'empty';
    return `?(${r | 0},${g | 0},${b | 0})`;
  },
  // bunker: snake = saturated red light, dot = white-hot core, empty = near-black panel
  bunker(r, g, b) {
    if (r > 200 && g > 130 && b > 110) return 'dot';
    if (r > 110 && g < 0.55 * r && b < 0.55 * r) return 'snake';
    if (r < 70 && lumOf(r, g, b) < 40) return 'empty';
    return `?(${r | 0},${g | 0},${b | 0})`;
  },
};

const CALM = { time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: true };
// strobe test: full kick, full chaos, full punch, but no bite burst (that one lands on the head on purpose)
const WILD = { time: 2, beat: 1, beatIndex: 0, chaos: 1, punch: 1, variant: 3, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: true };

// Render one case and return the 3x3-averaged colour at every cell's projected centre.
function sampleCase(room, c, fxBase) {
  const gl = renderer.debug.gl;
  const snap = deepFreeze({
    cols: COLS, rows: ROWS, snake: c.snake, dir: c.dir, prevDir: c.dir, prevTail: c.snake[c.snake.length - 1],
    grew: false, food: c.food, score: 7, stepMs: 150, tick: 0, progress: 0.4, alive: true, paused: false, death: null,
  });
  const fx = { ...fxBase, now: performance.now() };
  renderer.render(room, c.view, snap, fx);
  renderer.render(room, c.view, snap, fx);
  const Fr = renderer.debug.frame() || {};
  const sn = Fr.snake || {};
  const hBody = Math.min((sn.bodySize || [0, 0.26])[1], 0.34), hHead = Math.min((sn.headSize || [0, 0.3])[1], 0.3);
  const hDot = 0.03 + Math.min((sn.dotSize || [0, 0.3])[1], 0.34) / 2;
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const snakeSet = new Set(snap.snake.map(key)), headKey = key(snap.snake[0]);
  const only = c.only && new Set(c.only.map(([x, y]) => x + y * COLS));
  const res = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + y * COLS;
    if (only && !only.has(k)) continue;
    if (c.view === 'pov' && k === headKey) continue;
    const exp = snakeSet.has(k) ? 'snake' : snap.food && snap.food.x === x && snap.food.y === y ? 'dot' : 'empty';
    const h = exp === 'snake' ? (k === headKey ? hHead : hBody) : exp === 'dot' ? hDot : 0;
    const [wx, wz] = renderer.debug.cellToWorld(x, y);
    const p = renderer.debug.project(wx, h, wz);
    if (!p.visible) { res.push({ x, y, exp, off: true }); continue; }
    const sx = Math.round(p.x), sy = H - 1 - Math.round(p.y);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((sy + dy) * W + (sx + dx)) * 4;
      if (i < 0 || i >= px.length) continue;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    res.push({ x, y, exp, r: r / n, g: g / n, b: b / n });
  }
  return res;
}

function check(sizes = [[1280, 760], [375, 812]]) {
  if (!renderer) return null;
  const was = paused;
  paused = true;
  const report = {};
  for (const room of Object.keys(renderer.rooms)) {
    const cls = CLASSIFY[room] || CLASSIFY.court;
    for (const [w, h] of sizes) {
      renderer.resize(w, h, 1);
      for (const [name, c] of Object.entries(CASES)) {
        const modes = room === 'bunker' ? { calm: CALM, wild: WILD } : { calm: CALM };
        const calm = sampleCase(room, c, CALM);
        for (const [mode, fxb] of Object.entries(modes)) {
          const s = mode === 'calm' ? calm : sampleCase(room, c, fxb);
          let tested = 0, off = 0, delta = 0;
          const bad = [];
          s.forEach((e, i) => {
            if (e.off) { off++; return; }
            tested++;
            const got = cls(e.r, e.g, e.b);
            if (got !== e.exp) bad.push(`${e.x},${e.y} want ${e.exp} got ${got}`);
            const cc = calm[i];
            if (!cc.off) delta = Math.max(delta, Math.abs(e.r - cc.r), Math.abs(e.g - cc.g), Math.abs(e.b - cc.b));
          });
          report[`${room} ${w}x${h} ${name} ${mode}`] = { tested, off, bad: bad.length, first: bad.slice(0, 4), boardDelta: Math.round(delta) };
        }
      }
    }
  }
  fit();
  paused = was;
  const lines = Object.entries(report).map(([k, r]) => `${k}: ${r.tested} cells, ${r.bad} bad, ${r.off} off, Δ${r.boardDelta}${r.first.length ? ' ' + r.first.join('; ') : ''}`);
  checkText = lines.join('\n');
  status();
  console.log('[rooms-a] cell check', report);
  return report;
}

// Manual frame driver for a throttled (hidden) preview pane.
function frames(n = 1, dt = 16.7) { for (let i = 0; i < n; i++) step(dt); return { clock, score: S.score, view, roomId }; }
function set(o = {}) {
  if (o.room) { roomId = o.room; $('room').value = o.room; }
  if (o.view) setView(o.view);
  if (o.chaos != null) $('chaos').value = String(o.chaos);
  if (o.rf != null) $('rf').checked = !!o.rf;
  if (o.rm != null) $('rm').checked = !!o.rm;
  if (o.paused != null) paused = !!o.paused;
  if (o.bite) $('bite').onclick();
  if (o.frozen != null) frozen = !!o.frozen;
  if (o.clock != null) clock = o.clock;
  return { roomId, view };
}
window.__ra = { renderer, check, frames, set, errors, S };
status();
