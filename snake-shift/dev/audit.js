// audit harness (levels wave 2): the eleven existing universes against snapshots that can differ
// from an unbroken snake (LEVELS_PLAN 3.3): normal, broken twice, one visible cell, three cells while
// waiting (respawn and start), dead. Plus every life() icon filled and hollow at 16 and 22 px.
// Console: __audit.check() runs everything and returns { pass, rows }; __audit.render(case, fx) draws
//          the gallery on demand (no animation loop: the hidden pane throttles frames);
//          __audit.hashes() hashes the board layer of the normal and dead cases ("looks as before").
import * as lcd from '../src/render/timelines/lcd.js';
import * as arcade from '../src/render/timelines/arcade.js';
import * as acid from '../src/render/timelines/acid.js';
import * as kombat from '../src/render/timelines/kombat.js';
import * as desktop from '../src/render/timelines/desktop.js';
import * as timewarp from '../src/render/timelines/timewarp.js';
import * as wrong from '../src/render/timelines/wrong.js';
import * as court from '../src/render/gl/rooms/court.js';
import * as bunker from '../src/render/gl/rooms/bunker.js';
import * as disco from '../src/render/gl/rooms/disco.js';
import * as plastic from '../src/render/gl/rooms/plastic.js';
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const $ = (id) => document.getElementById(id);
const key = (c) => c.x + c.y * COLS;
const cells = (list) => list.map(([x, y]) => ({ x, y }));
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
const cerr = console.error.bind(console), cwarn = console.warn.bind(console);
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ')); cerr(...a); };
console.warn = (...a) => { errors.push('console.warn: ' + a.map(String).join(' ')); cwarn(...a); };
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
};

const FLAT = { lcd, arcade, acid, kombat, desktop, timewarp, wrong };
// wrong.js with no usable sibling, to exercise its own fallback board (a separate module instance).
// Opt-in via check({ bare: true }): loading it logs one expected 404 for the missing sibling 'none'.
let wrongBare = null;
const ROOMS = { court, bunker, disco, plastic };

// ---------------- snapshots ----------------
const MOVING = [[8, 10], [8, 11], [9, 11], [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [11, 7], [12, 7], [12, 8], [12, 9]];
// broken: A (8,10)-(10,11) | B (11,11)-(12,10), adjacent to A's end but split | C (3,4)-(4,5), far away
const BROKEN = [[8, 10], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11], [12, 10], [3, 4], [3, 5], [4, 5]];
const CASES = {
  normal: { snake: MOVING, dir: 'up', food: { x: 4, y: 3 } },
  broken: { snake: BROKEN, breaks: [3, 6], length: 16, prevTail: null, dir: 'up', food: { x: 6, y: 3 }, tick: 40, progress: 0.5 },
  one: { snake: [[8, 8]], length: 9, prevTail: null, dir: 'left', food: { x: 3, y: 12 }, progress: 0.5 },
  waitRespawn: { snake: [[8, 7], [8, 8], [8, 9]], dir: 'up', food: { x: 3, y: 12 }, prevTail: null, waiting: 'respawn', paused: true, lives: 2 },
  waitStart: { snake: [[8, 7], [8, 8], [8, 9]], dir: 'up', food: { x: 12, y: 3 }, prevTail: null, waiting: 'start', paused: true, score: 0 },
  dead: { snake: MOVING, dir: 'up', food: { x: 4, y: 3 }, alive: false, death: { reason: 'self', cell: { x: 8, y: 9 } }, lives: 0 },
};
function snapOf(c, over = {}) {
  const snake = cells(c.snake);
  const tail = snake[snake.length - 1];
  return deepFreeze({
    cols: COLS, rows: ROWS, snake, breaks: c.breaks || [], length: c.length ?? snake.length,
    dir: c.dir, prevDir: c.dir, heading: c.dir,
    prevTail: c.prevTail === undefined ? { x: tail.x, y: Math.min(ROWS - 1, tail.y + 1) } : c.prevTail,
    grew: false, food: c.food || null, mushroom: null, score: c.score ?? 7, stepMs: 140,
    tick: c.tick ?? 12, progress: c.progress ?? 0, alive: c.alive !== false, paused: !!c.paused,
    waiting: c.waiting || null, death: c.death || null, lives: c.lives ?? 3, maxLives: 5,
    universe: { id: 'lcd', rules: 'box', mushrooms: false, index: 3, holdLeft: 0 },
    space: { kind: 'box' }, body: null, foodAt: null, seed: 1, ...over,
  });
}
// reference: same snapshot without snake and dot (cell check compares against it)
const emptyOf = (snap) => deepFreeze({ ...snap, snake: [], breaks: [], length: 0, food: null, prevTail: null, death: null });

const BASE_FX = { now: 1000, time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: false, lives: 3 };
const FXS = {
  calm: {},
  wild: { chaos: 1, beat: 1, punch: 1, variant: 3, beatIndex: 5, time: 11.1 },
  bite: { chaos: 0.5, punch: 1, variant: 2, time: 3, biteHead: 60 },
};
function mkFx(name, snap, extra = {}) {
  const o = { ...BASE_FX, ...FXS[name], ...extra };
  if (o.biteHead != null) { o.bite = snap.snake[0] ? { ...snap.snake[0] } : null; o.biteAge = o.biteHead; delete o.biteHead; }
  return o;
}

// ---------------- flat variants (timewarp skins, wrong's board owners) ----------------
function flatVariants(fxName) {
  const out = [];
  for (const id of ['lcd', 'arcade', 'acid', 'kombat', 'desktop']) out.push({ name: id, mod: FLAT[id], extra: {} });
  for (const prev of [null, 'arcade', 'acid']) out.push({ name: `timewarp<${prev || 'own'}`, mod: timewarp, extra: { prev } });
  const seen = new Set();
  for (let v = 0; v < 64 && seen.size < 7; v++) {
    const fx = mkFx(fxName, snapOf(CASES.normal), { variant: v });
    const owner = wrong.boardOwner(fx) || 'fallback';
    if (seen.has(owner)) continue;
    seen.add(owner);
    out.push({ name: `wrong>${owner}`, mod: wrong, extra: { variant: v } });
  }
  if (wrongBare) out.push({ name: 'wrong>bare-fallback', mod: wrongBare, extra: {} });
  return out;
}

// ---------------- pixel helpers ----------------
function layout(w, h) {
  const cell = Math.floor(Math.min((0.94 * w) / COLS, (0.8 * h) / ROWS)), bw = cell * COLS, bh = cell * ROWS;
  return { w, h, cell, bx: Math.round((w - bw) / 2), by: Math.round((h - bh) * 0.6), bw, bh, cols: COLS, rows: ROWS };
}
function canvas2d(w, h, dpr = 1) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv, g };
}
function boardImage(mod, L, snap, fx, dpr) {
  const { cv, g } = canvas2d(L.w, L.h, dpr);
  mod.board(g, L, snap, fx);
  return { data: g.getImageData(0, 0, cv.width, cv.height).data, W: cv.width, H: cv.height, cv };
}
// fraction of pixels in a CSS-px rectangle where A and B differ by more than `t` (sum of |dRGB|)
function diffFrac(A, B, dpr, x0, y0, x1, y1, t = 48) {
  const X0 = Math.max(0, Math.round(x0 * dpr)), Y0 = Math.max(0, Math.round(y0 * dpr));
  const X1 = Math.min(A.W, Math.round(x1 * dpr)), Y1 = Math.min(A.H, Math.round(y1 * dpr));
  let n = 0, d = 0;
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const i = (y * A.W + x) * 4;
    n++;
    if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > t) d++;
  }
  return n ? d / n : 0;
}
const cellFrac = (A, B, L, dpr, x, y, ins) => diffFrac(A, B, dpr, L.bx + (x + ins) * L.cell, L.by + (y + ins) * L.cell, L.bx + (x + 1 - ins) * L.cell, L.by + (y + 1 - ins) * L.cell);
// thin band across the shared edge of two adjacent cells, middle half of the edge
// (strong marks only: t = 110, so a faint per-cell glow that touches its neighbour is not a link)
function bandFrac(A, B, L, dpr, a, b) {
  const c = L.cell;
  if (a.y === b.y) { const ex = L.bx + Math.max(a.x, b.x) * c, y = L.by + a.y * c; return diffFrac(A, B, dpr, ex - 1, y + c * 0.25, ex + 1, y + c * 0.75, 110); }
  const ey = L.by + Math.max(a.y, b.y) * c, x = L.bx + a.x * c;
  return diffFrac(A, B, dpr, x + c * 0.25, ey - 1, x + c * 0.75, ey + 1, 110);
}
const adj = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };

// ---------------- flat cell check ----------------
const SIZES = [[1280, 720, 1], [390, 844, 2]];
function checkFlatOne(v, L, dpr, cn, fxName) {
  const snap = snapOf(CASES[cn]), fx = mkFx(fxName, snap, v.extra), bad = [];
  try {
    const { g } = canvas2d(L.w, L.h, dpr);
    v.mod.scenery(g, L, snap, fx); v.mod.board(g, L, snap, fx);       // the full frame must not throw
  } catch (e) { return { bad: [`throw full frame: ${e && e.message}`] }; }
  let A, B;
  try { A = boardImage(v.mod, L, snap, fx, dpr); B = boardImage(v.mod, L, emptyOf(snap), fx, dpr); } catch (e) { return { bad: [`throw board: ${e && e.message}`] }; }
  const occ = new Set(snap.snake.map(key));
  if (snap.food) occ.add(key(snap.food));
  const inner = {};
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + y * COLS;
    if (occ.has(k)) { const f = (inner[k] = cellFrac(A, B, L, dpr, x, y, 0.12)); if (f < 0.12) bad.push(`${x},${y} not drawn (${f.toFixed(2)})`); }
    else { const f = cellFrac(A, B, L, dpr, x, y, 0.3); if (f >= 0.08) bad.push(`${x},${y} empty cell covered (${f.toFixed(2)})`); }
  }
  // no connection across a break between two adjacent body cells
  const s = snap.snake;
  for (const k of snap.breaks) {
    if (k === 0 || !s[k + 1] || !adj(s[k], s[k + 1])) continue;
    const f = bandFrac(A, B, L, dpr, s[k], s[k + 1]);
    if (f >= 0.3) bad.push(`link drawn across break ${k} (${f.toFixed(2)})`);
  }
  // a body that ends at a break (or at the board, with cells off it) gets a neutral end, not a tail
  if (snap.length > s.length && s.length > 2) {
    const ends = new Set([s.length - 1]);
    for (const k of snap.breaks) { ends.add(k); ends.add(k + 1); }
    ends.delete(0);
    const mids = s.map((c, i) => i).filter((i) => i > 0 && !ends.has(i)).map((i) => inner[key(s[i])]);
    const m = median(mids);
    for (const i of ends) if (s[i] && inner[key(s[i])] < 0.8 * m) bad.push(`end ${i} looks like a tail (${inner[key(s[i])].toFixed(2)} vs ${m.toFixed(2)})`);
  }
  return { bad };
}
// waiting: the still snake may pulse gently but must not flash. Mean luminance of the snake cells over 2 s.
function checkWaiting(v, L, dpr, cn) {
  const snap = snapOf(CASES[cn]), lums = [];
  for (let i = 0; i <= 40; i++) {
    const t = 2 + i * 0.05, bp = t * 2.2;
    const fx = mkFx('calm', snap, { ...v.extra, time: t, now: t * 1000, beat: Math.exp(-(bp - Math.floor(bp)) * 5), beatIndex: Math.floor(bp), chaos: 0.6 });
    const A = boardImage(v.mod, L, snap, fx, dpr);
    let sum = 0, n = 0;
    for (const c of snap.snake) {
      const X0 = Math.round((L.bx + (c.x + 0.12) * L.cell) * dpr), X1 = Math.round((L.bx + (c.x + 0.88) * L.cell) * dpr);
      const Y0 = Math.round((L.by + (c.y + 0.12) * L.cell) * dpr), Y1 = Math.round((L.by + (c.y + 0.88) * L.cell) * dpr);
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const j = (y * A.W + x) * 4; sum += 0.2126 * A.data[j] + 0.7152 * A.data[j + 1] + 0.0722 * A.data[j + 2]; n++; }
    }
    lums.push(sum / n);
  }
  let step = 0;
  for (let i = 1; i < lums.length; i++) step = Math.max(step, Math.abs(lums[i] - lums[i - 1]));
  const range = Math.max(...lums) - Math.min(...lums), bad = [];
  if (step > 25 || range > 60) bad.push(`snake flashes while ${cn}: step ${step.toFixed(1)}, range ${range.toFixed(1)}`);
  return { bad, step, range };
}
function checkFlat() {
  const rows = [];
  for (const [w, h, dpr] of SIZES) {
    const L = layout(w, h);
    for (const fxName of Object.keys(FXS)) for (const v of flatVariants(fxName)) for (const cn of Object.keys(CASES)) {
      const r = checkFlatOne(v, L, dpr, cn, fxName);
      rows.push({ name: `2d ${v.name} ${w}x${h}@${dpr} ${cn} ${fxName}`, bad: r.bad });
    }
    for (const v of flatVariants('calm')) for (const cn of ['waitRespawn', 'waitStart']) {
      const r = checkWaiting(v, L, dpr, cn);
      rows.push({ name: `2d ${v.name} ${w}x${h}@${dpr} ${cn} still (step ${r.step.toFixed(1)}, range ${r.range.toFixed(1)})`, bad: r.bad });
    }
  }
  return rows;
}

// ---------------- rooms ----------------
const glCv = $('gl');
let renderer = null;
try { renderer = await createRoomRenderer(glCv, { cols: COLS, rows: ROWS, roomIds: Object.keys(ROOMS) }); } catch (e) { errors.push('createRoomRenderer: ' + (e && e.message)); }
// reference for rooms: the snake parked as one cell in a far corner, no dot
const PARK = { x: 15, y: 0 };
const parkedOf = (snap) => deepFreeze({ ...snap, snake: [PARK], breaks: [], length: 1, food: null, prevTail: null, death: null });
function readRoom(id, view, snap, fx) {
  renderer.render(id, view, snap, fx);
  renderer.render(id, view, snap, fx);
  const gl = renderer.debug.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { px, W, H };
}
function roomSample(img, wx, h, wz) {
  const p = renderer.debug.project(wx, h, wz);
  if (!p.visible) return null;
  const sx = Math.round(p.x), sy = img.H - 1 - Math.round(p.y);
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= img.W || y >= img.H) continue;
    const i = (y * img.W + x) * 4;
    r += img.px[i]; g += img.px[i + 1]; b += img.px[i + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : null;
}
// exact pass at progress 1 (the engine glides joined segments mid-tick, which is allowed in 3D);
// mid pass at the case's own progress: only checks that no empty cell gets covered (no glide across a gap)
function checkRoomOne(id, cn, fxName, mid = false) {
  const snap = mid ? snapOf(CASES[cn]) : snapOf(CASES[cn], { progress: 1 }), fx = mkFx(fxName, snap, { reducedMotion: true }), bad = [];
  let A, B;
  try { A = readRoom(id, 'board', snap, fx); B = readRoom(id, 'board', parkedOf(snap), fx); } catch (e) { return { bad: [`throw: ${e && e.message}`] }; }
  const Fr = renderer.debug.frame() || {}, sn = Fr.snake || {};
  const hBody = Math.min((sn.bodySize || [0, 0.26])[1], 0.34), hHead = Math.min((sn.headSize || [0, 0.3])[1], 0.3);
  const hDot = 0.03 + Math.min((sn.dotSize || [0, 0.3])[1], 0.34) / 2;
  const snakeSet = new Set(snap.snake.map(key)), headKey = key(snap.snake[0]);
  let tested = 0, minOcc = Infinity, maxEmpty = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + y * COLS;
    if (Math.abs(x - PARK.x) + Math.abs(y - PARK.y) <= 1) continue;
    if (fx.bite && fx.bite.x === x && fx.bite.y === y) continue;               // engine-owned bite ring
    if (snap.prevTail && snap.prevTail.x === x && snap.prevTail.y === y) continue;
    const isDot = snap.food && snap.food.x === x && snap.food.y === y, isSnake = snakeSet.has(k);
    const h = isSnake ? (k === headKey ? hHead : hBody) : isDot ? hDot : 0;
    const [wx, wz] = renderer.debug.cellToWorld(x, y);
    const a = roomSample(A, wx, h, wz), b = roomSample(B, wx, h, wz);
    if (!a || !b) continue;
    tested++;
    const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    if (mid && (isSnake || isDot)) continue;
    if (isSnake || isDot) { minOcc = Math.min(minOcc, d); if (d < 40) bad.push(`${x},${y} ${isDot ? 'dot' : 'snake'} not drawn (Δ${d | 0})`); }
    else { maxEmpty = Math.max(maxEmpty, d); if (d >= 40) bad.push(`${x},${y} empty cell covered (Δ${d | 0})`); }
  }
  return { bad, tested, minOcc, maxEmpty };
}
function checkRooms() {
  if (!renderer) return [{ name: 'rooms: no WebGL renderer', bad: ['renderer null'] }];
  const rows = [];
  for (const [w, h, dpr] of SIZES) {
    renderer.resize(w, h, dpr);
    for (const id of Object.keys(ROOMS)) {
      for (const fxName of ['calm', 'bite']) for (const cn of Object.keys(CASES)) {
        const r = checkRoomOne(id, cn, fxName);
        rows.push({ name: `3d ${id} board ${w}x${h}@${dpr} ${cn} ${fxName} (${r.tested} cells, occ ≥ Δ${r.minOcc | 0}, empty ≤ Δ${r.maxEmpty | 0})`, bad: r.bad });
      }
      for (const cn of Object.keys(CASES)) {
        const r = checkRoomOne(id, cn, 'calm', true);
        rows.push({ name: `3d ${id} board ${w}x${h}@${dpr} ${cn} mid-tick gaps (empty ≤ Δ${r.maxEmpty | 0})`, bad: r.bad });
      }
      // first person and the wild board: must render every case without errors
      for (const cn of Object.keys(CASES)) for (const [view, fxName] of [['pov', 'calm'], ['pov', 'wild'], ['board', 'wild']]) {
        const before = errors.length, snap = snapOf(CASES[cn]);
        try { renderer.render(id, view, snap, mkFx(fxName, snap)); } catch (e) { errors.push(`${id} ${view}: ${e && e.message}`); }
        rows.push({ name: `3d ${id} ${view} ${w}x${h}@${dpr} ${cn} ${fxName} renders`, bad: errors.slice(before) });
      }
    }
  }
  return rows;
}

// ---------------- life icons ----------------
const ALL = { ...FLAT, ...ROOMS };
function stateOf(g) {
  const t = g.getTransform();
  return [t.a, t.b, t.c, t.d, t.e, t.f, g.fillStyle, g.strokeStyle, g.globalAlpha, g.lineWidth, g.lineCap, g.lineJoin, g.shadowBlur,
    g.shadowColor, g.globalCompositeOperation, g.font, g.textAlign, g.textBaseline, g.getLineDash().length, g.filter, g.imageSmoothingEnabled].join('|');
}
function checkIcons() {
  const rows = [];
  for (const [id, mod] of Object.entries(ALL)) {
    if (typeof mod.life !== 'function') { rows.push({ name: `life ${id}`, bad: ['no life() export'] }); continue; }
    for (const size of [16, 22]) for (const chaos of [0, 1]) {
      const bad = [], cov = {}, imgs = {};
      for (const filled of [true, false]) {
        const S = size * 3, { cv, g } = canvas2d(S, S, 1), st = stateOf(g);
        try { mod.life(g, size, size, size, filled, { ...BASE_FX, chaos, lives: 3 }); mod.life(canvas2d(S, S).g, 0, 0, size, filled); } catch (e) { bad.push(`throw (${filled ? 'filled' : 'hollow'}): ${e && e.message}`); continue; }
        if (stateOf(g) !== st) bad.push(`context state not restored (${filled ? 'filled' : 'hollow'})`);
        const d = g.getImageData(0, 0, S, S).data;
        let inBox = 0, outBox = 0, inner = 0, innerN = 0;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const a = d[(y * S + x) * 4 + 3], inside = x >= size - 1 && x < 2 * size + 1 && y >= size - 1 && y < 2 * size + 1;
          if (inside && a > 24) inBox++;
          if (!inside && a > 24) outBox++;
          if (x >= size * 1.25 && x < size * 1.75 && y >= size * 1.25 && y < size * 1.75) { innerN++; if (a > 128) inner++; }
        }
        if (inBox < size * size * 0.08) bad.push(`${filled ? 'filled' : 'hollow'} draws almost nothing (${inBox} px)`);
        if (outBox > size) bad.push(`${filled ? 'filled' : 'hollow'} spills outside its box (${outBox} px)`);
        cov[filled] = inner / innerN; imgs[filled] = d;
      }
      if (cov[true] != null && cov[false] != null && !(cov[true] >= cov[false] + 0.15)) bad.push(`filled and hollow too alike (centre ${cov[true].toFixed(2)} vs ${cov[false].toFixed(2)})`);
      rows.push({ name: `life ${id} ${size}px chaos ${chaos}`, bad });
    }
  }
  return rows;
}
function drawIcons() {
  const host = $('icons');
  host.textContent = '';
  for (const [id, mod] of Object.entries(ALL)) {
    const fig = document.createElement('figure'), cap = document.createElement('figcaption');
    const W = 470, H = 76, { cv, g } = canvas2d(W, H, devicePixelRatio || 1);
    const hud = (mod.meta && mod.meta.hud) || {};
    g.fillStyle = '#3a3a44'; g.fillRect(0, 0, W, H);
    g.fillStyle = hud.bg || '#15151c'; g.fillRect(0, 0, W, H);
    let x = 6;
    for (const [size, chaos] of [[22, 0], [16, 0], [22, 1]]) {
      for (let i = 0; i < 5; i++) { if (mod.life) mod.life(g, x, 6, size, i < 3, { ...BASE_FX, chaos }); x += size + 4; }
      x += 10;
    }
    g.save(); g.scale(3, 3);
    let zx = 4;
    for (const filled of [true, false]) { if (mod.life) mod.life(g, zx, 10 / 3 + 6, 14, filled, { ...BASE_FX, chaos: 0 }); zx += 18; }
    g.restore();
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cap.textContent = `${id} life() — 22, 16, 22 @ chaos 1; zoom ×3 at 14 px`;
    fig.append(cap, cv); host.append(fig);
  }
}

// ---------------- gallery (on demand) ----------------
function render(cn = $('case').value, fxName = $('fx').value) {
  const grid = $('grid');
  grid.textContent = '';
  const add = (title, w, h, paint) => {
    const fig = document.createElement('figure'), cap = document.createElement('figcaption');
    const { cv, g } = canvas2d(w, h, 1);
    try { paint(g, cv); } catch (e) { errors.push(`${title}: ${e && e.message}`); }
    cap.textContent = title; fig.append(cap, cv); grid.append(fig);
  };
  const snap = snapOf(CASES[cn]), W = 300, H = 250, L = layout(W, H);
  for (const v of flatVariants(fxName)) add(v.name, W, H, (g) => { const fx = mkFx(fxName, snap, v.extra); v.mod.scenery(g, L, snap, fx); v.mod.board(g, L, snap, fx); });
  if (renderer) {
    renderer.resize(W, H, 1);
    for (const id of Object.keys(ROOMS)) for (const view of ['board', 'pov']) {
      add(`${id} ${view}`, W, H, (g) => { renderer.render(id, view, snap, mkFx(fxName, snap)); g.drawImage(glCv, 0, 0, W, H); });
    }
  }
  drawIcons();
  status(`rendered ${cn} / ${fxName}`);
}

// ---------------- "looks as before": hashes of the normal and dead cases ----------------
function fnv(data) { let h = 0x811c9dc5; for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
function hashes() {
  const out = {}, L = layout(1280, 720);
  for (const fxName of Object.keys(FXS)) for (const v of flatVariants(fxName)) for (const cn of ['normal', 'dead']) {
    const snap = snapOf(CASES[cn]);
    out[`2d ${v.name} ${cn} ${fxName}`] = fnv(boardImage(v.mod, L, snap, mkFx(fxName, snap, v.extra), 1).data);
  }
  if (renderer) {
    renderer.resize(640, 400, 1);
    for (const id of Object.keys(ROOMS)) for (const view of ['board', 'pov']) for (const cn of ['normal', 'dead']) {
      const snap = snapOf(CASES[cn]);
      out[`3d ${id} ${view} ${cn}`] = fnv(readRoom(id, view, snap, mkFx('calm', snap, { reducedMotion: true })).px);
    }
  }
  return out;
}
async function checkBaseline() {
  let base = null;
  try { const r = await fetch('./audit.baseline.json', { cache: 'no-store' }); if (r.ok) base = await r.json(); } catch (_) { /* none yet */ }
  if (!base) return [{ name: 'baseline: audit.baseline.json missing (run __audit.hashes() before edits)', bad: [] }];
  const now = hashes();
  return Object.keys(base).map((k) => ({ name: `same as before: ${k}`, bad: now[k] === base[k] ? [] : [`changed ${base[k]} → ${now[k]}`] }));
}

// ---------------- check + UI ----------------
function status(t) { $('out').textContent = t + (errors.length ? `\nERRORS (${errors.length}): ${errors.slice(0, 4).join(' / ')}` : ''); }
async function check({ rooms = true, baseline = true, bare = false } = {}) {
  if (bare && !wrongBare) wrongBare = await import('../src/render/timelines/wrong.js?only=none').catch(() => null);
  const t0 = performance.now(), e0 = errors.length;
  // baseline first: disco and plastic keep animation state across renders, so their hashes are only
  // comparable on a page that has rendered nothing else yet (reload before running check())
  const base = baseline ? await checkBaseline() : [];
  const rows = [...base, ...checkFlat(), ...(rooms ? checkRooms() : []), ...checkIcons()];
  if (renderer) renderer.resize(640, 400, 1);
  const failed = rows.filter((r) => r.bad.length);
  const newErr = errors.slice(e0);
  const text = `audit: ${rows.length - failed.length}/${rows.length} pass, console errors ${newErr.length}, ${Math.round(performance.now() - t0)} ms` +
    failed.slice(0, 40).map((r) => `\nFAIL ${r.name}: ${r.bad.slice(0, 4).join('; ')}`).join('');
  status(text);
  return { pass: !failed.length && !newErr.length, total: rows.length, failed: failed.map((r) => `${r.name}: ${r.bad.slice(0, 3).join('; ')}`), errors: newErr.slice(0, 10) };
}
for (const cn of Object.keys(CASES)) $('case').append(new Option(cn, cn));
for (const fn of Object.keys(FXS)) $('fx').append(new Option(fn, fn));
$('case').value = new URLSearchParams(location.search).get('case') || 'broken';
$('render').onclick = () => render();
$('case').onchange = $('fx').onchange = () => render();
$('check').onclick = () => check();
$('iconsBtn').onclick = () => drawIcons();
addEventListener('keydown', (e) => { if (e.code === 'KeyC') check(); });
// one universe at a time: flat rows and icons whose name matches `re`, plus 2D baseline changes for it
async function quick(re) {
  re = new RegExp(re);
  const e0 = errors.length;
  const rows = [...checkFlat().filter((r) => re.test(r.name)), ...checkIcons().filter((r) => re.test(r.name))];
  const base = (await checkBaseline()).filter((r) => re.test(r.name) && r.name.includes(' 2d '));
  const all = rows.concat(base), bad = all.filter((r) => r.bad.length);
  return { rows: all.length, failed: bad.map((r) => `${r.name}: ${r.bad.slice(0, 3).join('; ')}`).slice(0, 30), errors: errors.slice(e0, e0 + 6),
    still: rows.filter((r) => r.name.includes(' still ')).map((r) => r.name.replace(/^2d /, '')).slice(0, 4) };
}
window.__audit = { quick, check, render, hashes, checkFlat, checkRooms, checkIcons, CASES, snapOf, mkFx, errors, renderer };
status('ready: press C or run __audit.check()');
