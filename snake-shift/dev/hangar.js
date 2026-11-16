// hangar harness: the universe `hangar` in all three looks with faked snapshots (LEVELS_PLAN 3.3) and fx.
// URL: ?look=2d|board|pov  ?case=live|moving|edges|broken|respawn|dead|dotEdge  ?size=fit|land|port
//      ?chaos=0.6  ?rf  ?rm  ?pause
// Console: __hg.check() runs the cell check for both looks: every case, chaos 0 / 1 / wild, landscape
//          and portrait, plus 2D hinge checks across breaks and a 3D no-interpolation-across-breaks
//          check. __hg.frames(n, dtMs) renders n frames by hand (the hidden preview pane throttles rAF).
import * as flat from '../src/render/timelines/hangar.js';
import * as roomMod from '../src/render/gl/rooms/hangar.js';
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const key = (c) => c.x + c.y * COLS;
const cells = (list) => list.map(([x, y]) => ({ x, y }));
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
};
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

// ---------------- snapshots ----------------
function snapOf(c, over = {}) {
  const snake = cells(c.snake);
  const tail = snake[snake.length - 1];
  return deepFreeze({
    cols: COLS, rows: ROWS, snake, breaks: c.breaks || [], length: c.length ?? snake.length,
    dir: c.dir, prevDir: c.dir, heading: c.dir,
    prevTail: c.prevTail === undefined ? { x: tail.x, y: Math.min(ROWS - 1, tail.y + 1) } : c.prevTail,
    grew: false, food: c.food || null, mushroom: null, score: c.score ?? 7, stepMs: 140,
    tick: c.tick ?? 0, progress: c.progress ?? 0, alive: c.alive !== false, paused: !!c.paused,
    waiting: c.waiting || null, death: c.death || null, lives: c.lives ?? 3, maxLives: 5,
    universe: { id: 'hangar', rules: 'box', mushrooms: false, index: 3, holdLeft: 0 },
    space: { kind: 'box' }, body: null, foodAt: null, seed: 1, ...over,
  });
}
const MOVING = [[8, 10], [8, 11], [9, 11], [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [11, 7], [12, 7], [12, 8], [12, 9]];
const EDGE = (() => { const s = []; for (let x = 15; x >= 0; x--) s.push([x, 0]); for (let y = 1; y < 16; y++) s.push([0, y]); for (let x = 1; x < 16; x++) s.push([x, 15]); return s; })();
// broken: A (5,5)-(5,7) | B (9,7)-(11,9) | C (12,9)-(12,11) | D (2,12)-(3,12); B|C are adjacent but split
const BROKEN = [[5, 5], [5, 6], [5, 7], [9, 7], [9, 8], [9, 9], [10, 9], [11, 9], [12, 9], [12, 10], [12, 11], [2, 12], [3, 12]];
const CASES = {
  moving: { snake: MOVING, dir: 'up', food: { x: 4, y: 3 } },
  edges: { snake: EDGE, dir: 'right', food: { x: 15, y: 8 } },
  broken: { snake: BROKEN, breaks: [2, 7, 10], length: 20, prevTail: null, dir: 'up', food: { x: 13, y: 3 }, tick: 40, progress: 1 },
  respawn: { snake: [[8, 7], [8, 8], [8, 9]], dir: 'up', food: { x: 3, y: 12 }, tick: 57, progress: 0, prevTail: null, waiting: 'respawn', paused: true, lives: 2 },
  dead: { snake: MOVING, dir: 'up', food: { x: 4, y: 3 }, alive: false, death: { reason: 'wall', cell: { x: 8, y: 9 } }, lives: 0 },
  dotEdge: { snake: [[8, 8], [8, 9], [8, 10]], dir: 'up', food: { x: 0, y: 15 } },
};
const BASE_FX = { now: 1000, time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: false };
const FXS = {
  chaos0: {},
  chaos1: { chaos: 1, variant: 1, time: 7.3 },
  wild: { chaos: 1, beat: 1, punch: 1, variant: 3, beatIndex: 5, time: 11.1 },
  switches: { chaos: 0.6, beat: 0.15, variant: 2, reducedFlash: true, reducedMotion: true },
};
const mkFx = (o, snap, extra = {}) => ({ ...BASE_FX, ...o, ...extra, bite: extra.bite !== undefined ? extra.bite : o.bite ?? null });

// ---------------- live fake simulation (autopilot, lives, respawn) ----------------
let seed = 9;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const S = {};
function resetSim(keepLives) {
  Object.assign(S, {
    snake: [{ x: 8, y: 10 }, { x: 8, y: 11 }, { x: 8, y: 12 }, { x: 8, y: 13 }],
    dir: 'up', prevTail: { x: 8, y: 14 }, grew: false, food: { x: 8, y: 4 }, tick: 0, acc: 0, queued: null,
    alive: true, waiting: null, waitUntil: 0, death: null,
  });
  if (!keepLives) Object.assign(S, { score: 0, lives: 3 });
}
resetSim();
function freeCell(c, grow) {
  if (c.x < 0 || c.y < 0 || c.x >= COLS || c.y >= ROWS) return false;
  const body = S.snake.slice(0, grow ? S.snake.length : S.snake.length - 1);
  return !body.some((b) => b.x === c.x && b.y === c.y);
}
function placeFood() {
  const occ = new Set(S.snake.map(key)), free = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!occ.has(x + y * COLS)) free.push({ x, y });
  S.food = free.length ? free[(rand() * free.length) | 0] : null;
}
function collide(cell) {
  if (S.lives > 1) {
    S.lives--;
    S.snake = [{ x: 8, y: 7 }, { x: 8, y: 8 }, { x: 8, y: 9 }];
    Object.assign(S, { dir: 'up', prevTail: null, waiting: 'respawn', waitUntil: clock + 1200, acc: 0 });
    if (S.food && S.snake.some((c) => c.x === S.food.x && c.y === S.food.y)) placeFood();
  } else {
    Object.assign(S, { alive: false, lives: 0, death: { reason: 'wall', cell }, waitUntil: clock + 2000 });
  }
}
function stepSim() {
  const h = S.snake[0];
  const next = (d) => ({ x: h.x + DIRS[d][0], y: h.y + DIRS[d][1] });
  const grows = (c) => S.food && c.x === S.food.x && c.y === S.food.y;
  let dir = S.queued && S.queued !== OPP[S.dir] ? S.queued : null;
  S.queued = null;
  if (!dir) {
    const opts = Object.keys(DIRS).filter((d) => d !== OPP[S.dir] && freeCell(next(d), grows(next(d))));
    if (!opts.length || rand() < 0.004) { collide(next(S.dir)); return; }   // the odd crash shows lives and respawn
    opts.sort((a, b) => { const na = next(a), nb = next(b); return Math.abs(na.x - S.food.x) + Math.abs(na.y - S.food.y) - (Math.abs(nb.x - S.food.x) + Math.abs(nb.y - S.food.y)); });
    dir = rand() < 0.85 ? opts[0] : opts[(rand() * opts.length) | 0];
  }
  const n = next(dir), grow = grows(n);
  if (!freeCell(n, grow)) { collide(n); return; }
  S.dir = dir;
  S.prevTail = { ...S.snake[S.snake.length - 1] };
  S.snake.unshift(n);
  if (!grow) S.snake.pop();
  S.grew = grow;
  S.tick++;
  if (grow) { S.score++; triggerBite(n); placeFood(); }
}
const liveSnap = () => deepFreeze({
  cols: COLS, rows: ROWS, snake: S.snake.map((c) => ({ ...c })), breaks: [], length: S.snake.length,
  dir: S.dir, prevDir: S.dir, heading: S.dir, prevTail: S.prevTail && { ...S.prevTail }, grew: S.grew,
  food: S.food && { ...S.food }, mushroom: null, score: S.score, stepMs: 140, tick: S.tick,
  progress: Math.min(1, S.acc / 140), alive: S.alive, paused, waiting: S.waiting, death: S.death,
  lives: S.lives, maxLives: 5, universe: { id: 'hangar', rules: 'box', mushrooms: false, index: 3, holdLeft: 0 },
  space: { kind: 'box' }, body: null, foodAt: null, seed: 9,
});

// ---------------- fake fx ----------------
let look = ['2d', 'board', 'pov'].includes(q.get('look')) ? q.get('look') : '2d';
let caseId = q.get('case') in CASES ? q.get('case') : 'live';
let sizeId = ['fit', 'land', 'port'].includes(q.get('size')) ? q.get('size') : 'fit';
let paused = q.has('pause');
let variant = 0, bite = null, biteAt = -Infinity, cutAt = 0, clock = 0, animTime = 0;
$('chaos').value = q.get('chaos') ?? '0';
$('rf').checked = q.has('rf');
$('rm').checked = q.has('rm');
function triggerBite(cell) { bite = { x: cell.x, y: cell.y }; biteAt = clock; variant++; }
function liveFx() {
  const rf = $('rf').checked, rm = $('rm').checked;
  const beats = (clock / 1000) * (132 / 60), beatIndex = Math.floor(beats);
  let beat = Math.exp(-(beats - beatIndex) * 5);
  if (rf) beat *= 0.15;
  const biteAge = clock - biteAt;
  return {
    now: clock, time: animTime, beat, beatIndex, chaos: +$('chaos').value,
    punch: rf ? 0 : Math.max(0, 1 - biteAge / 300), variant, bite, biteAge: bite ? biteAge : Infinity,
    cutAge: clock - cutAt, reducedFlash: rf, reducedMotion: rm,
  };
}
const currentSnap = () => (caseId === 'live' ? liveSnap() : snapOf(CASES[caseId]));

// ---------------- canvases ----------------
const SIZES = { fit: null, land: [1280, 720], port: [390, 844] };
const flatCv = $('flat'), glCv = $('gl'), livesCv = $('lives'), stage = $('stage');
const ctx2 = flatCv.getContext('2d');
let W = 0, H = 0, dpr = 1;
function layout(w, h) {
  const cell = Math.floor(Math.min((0.94 * w) / COLS, (0.8 * h) / ROWS)), bw = cell * COLS, bh = cell * ROWS;
  return { w, h, cell, bx: Math.round((w - bw) / 2), by: Math.round((h - bh) * 0.6), bw, bh, cols: COLS, rows: ROWS };
}
const renderer = await createRoomRenderer(glCv, { cols: COLS, rows: ROWS, roomIds: ['hangar'] });
function fit() {
  dpr = Math.min(2, devicePixelRatio || 1);
  const fixed = SIZES[sizeId];
  W = fixed ? fixed[0] : innerWidth; H = fixed ? fixed[1] : innerHeight;
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  for (const c of [flatCv, glCv]) { c.style.width = W + 'px'; c.style.height = H + 'px'; }
  flatCv.width = Math.round(W * dpr); flatCv.height = Math.round(H * dpr);
  if (renderer) renderer.resize(W, H, dpr);
  const k = fixed ? Math.min(1, (innerWidth - 16) / W, (innerHeight - 16) / H) : 1;
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  livesCv.width = Math.round(150 * dpr); livesCv.height = Math.round(30 * dpr);
  livesCv.style.width = '150px'; livesCv.style.height = '30px';
}
addEventListener('resize', fit);
fit();

// ---------------- frame driver ----------------
let fps = 0, nFrames = 0, fpsT = 0, last = 0;
function step(dt) {
  clock += dt;
  animTime += (dt / 1000) * ($('rm').checked ? 0.15 : 1);
  if (caseId === 'live' && !paused) {
    if (!S.alive) { if (clock > S.waitUntil) resetSim(); }
    else if (S.waiting) { if (clock > S.waitUntil) S.waiting = null; }
    else { S.acc += Math.min(100, dt); while (S.acc >= 140 && S.alive && !S.waiting) { S.acc -= 140; stepSim(); } }
  }
  const snap = currentSnap(), fx = liveFx();
  flatCv.style.display = look === '2d' ? 'block' : 'none';
  glCv.style.display = look === '2d' ? 'none' : 'block';
  try {
    if (look === '2d') {
      ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      const L = layout(W, H);
      flat.scenery(ctx2, L, snap, fx);
      flat.board(ctx2, L, snap, fx);
    } else if (renderer && !renderer.lost()) renderer.render('hangar', look === 'pov' ? 'pov' : 'board', snap, fx);
    const lc = livesCv.getContext('2d'), life = look === '2d' ? flat.life : roomMod.life;
    lc.setTransform(dpr, 0, 0, dpr, 0, 0); lc.clearRect(0, 0, 150, 30);
    for (let i = 0; i < 5; i++) life(lc, 4 + i * 29, 3, 24, i < snap.lives, fx);
  } catch (e) { if (errors.length < 20) errors.push(String(e && e.stack || e)); }
}
function loop(now) {
  step(last ? Math.min(100, now - last) : 16);
  last = now; nFrames++;
  if (now - fpsT > 1000) { fps = Math.round((nFrames * 1000) / (now - fpsT)); nFrames = 0; fpsT = now; status(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
function frames(n = 1, dt = 16.7) { for (let i = 0; i < n; i++) step(dt); status(); return { clock, look, caseId, score: S.score, lives: S.lives, errors: errors.length }; }

// ---------------- controls ----------------
let checkText = '';
function status() {
  $('out').textContent = `look ${look} | case ${caseId} | ${W}x${H} | ${fps} fps | gl ${renderer ? Object.keys(renderer.rooms).join(',') : 'null'} | score ${S.score} lives ${S.lives}` +
    (errors.length ? `\nERRORS: ${errors.slice(0, 3).join(' / ')}` : '') + (checkText ? '\n' + checkText : '');
  document.querySelectorAll('[data-look]').forEach((b) => b.classList.toggle('on', b.dataset.look === look));
  document.querySelectorAll('[data-case]').forEach((b) => b.classList.toggle('on', b.dataset.case === caseId));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === sizeId));
}
$('looks').innerHTML = ['2d', 'board', 'pov'].map((v) => `<button data-look="${v}">${v}</button>`).join('');
$('cases').innerHTML = ['live', ...Object.keys(CASES)].map((v) => `<button data-case="${v}">${v}</button>`).join('');
$('sizes').innerHTML = Object.keys(SIZES).map((v) => `<button data-size="${v}">${v}</button>`).join('');
$('looks').onclick = (e) => { if (e.target.dataset.look) { look = e.target.dataset.look; cutAt = clock; status(); } };
$('cases').onclick = (e) => { if (e.target.dataset.case) { caseId = e.target.dataset.case; status(); } };
$('sizes').onclick = (e) => { if (e.target.dataset.size) { sizeId = e.target.dataset.size; fit(); status(); } };
$('toggle').onclick = () => $('ui').classList.toggle('min');
$('bite').onclick = () => { const s = currentSnap(); triggerBite(s.snake[0] || { x: 8, y: 8 }); if (caseId === 'live') { S.score++; placeFood(); } };
$('pause').onclick = () => { paused = !paused; };
$('check').onclick = () => check();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') $('bite').onclick();
  else if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
  else if (e.code === 'KeyC') check();
  else if (e.code === 'KeyV') { look = { '2d': 'board', board: 'pov', pov: '2d' }[look]; cutAt = clock; status(); }
  else if (e.code.startsWith('Arrow')) S.queued = e.code.slice(5).toLowerCase();
});

// ---------------- cell check: flat look ----------------
const isOcc = (snap) => { const o = new Set(snap.snake.map(key)); if (snap.food) o.add(key(snap.food)); return o; };
function checkFlat(sizes) {
  const out = [];
  for (const [w, h] of sizes) {
    const L = layout(w, h);
    for (const [cn, c] of Object.entries(CASES)) {
      const snap = snapOf(c);
      const runs = Object.entries(FXS).map(([n, o]) => [n, mkFx(o, snap)]);
      runs.push(['bite60', mkFx({ chaos: 0.5, punch: 1, variant: 2, time: 3 }, snap, { bite: snap.snake[0], biteAge: 60 })]);
      runs.push(['bite300', mkFx({ chaos: 1, punch: 0.1, variant: 5, time: 4 }, snap, { bite: snap.snake[0], biteAge: 300 })]);
      for (const [fn, fx] of runs) {
        const sc = document.createElement('canvas'); sc.width = w; sc.height = h;
        const sg = sc.getContext('2d');
        flat.scenery(sg, L, snap, fx); flat.board(sg, L, snap, fx);      // full frame must not throw
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d', { willReadFrequently: true });
        flat.board(g, L, snap, fx);
        const data = g.getImageData(0, 0, w, h).data;
        const px = (X, Y) => { const i = (Math.round(Y) * w + Math.round(X)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
        const at = (x, y) => px(L.bx + Math.floor((x + 0.5) * L.cell), L.by + Math.floor((y + 0.5) * L.cell));
        const occ = isOcc(snap);
        let ref = null;
        for (let y = 0; y < ROWS && !ref; y++) for (let x = 0; x < COLS && !ref; x++) if (!occ.has(x + y * COLS)) ref = at(x, y);
        const diff = (p) => Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
        const bad = [];
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((diff(at(x, y)) > 60) !== occ.has(x + y * COLS)) bad.push(`${x},${y}`);
        // hinge checks: a joined pair shows a hinge on its boundary, a pair split by `breaks` does not
        if (cn === 'broken' && fn === 'chaos0') {
          const hinge = (a, b) => { const hx = L.bx + Math.max(a[0], b[0]) * L.cell - 1, hy = L.by + (a[1] + 0.5) * L.cell; return diff(px(hx, Math.floor(hy))) > 60; };
          if (!hinge([9, 9], [10, 9])) bad.push('hinge missing 9,9|10,9');
          if (hinge([11, 9], [12, 9])) bad.push('hinge drawn across break 11,9|12,9');
        }
        out.push({ name: `2d ${w}x${h} ${cn} ${fn}`, cell: L.cell, bad });
      }
    }
  }
  // life icons: filled and hollow must differ, both looks, chaos 0 and 1
  for (const [lname, fn] of [['flat', flat.life], ['room', roomMod.life]]) for (const ch of [0, 1]) {
    const cv = document.createElement('canvas'); cv.width = 60; cv.height = 30;
    const g = cv.getContext('2d', { willReadFrequently: true });
    fn(g, 0, 0, 30, true, { chaos: ch }); fn(g, 30, 0, 30, false, { chaos: ch });
    const d = g.getImageData(0, 0, 60, 30).data, p = (x, y) => d[(y * 60 + x) * 4 + 3];
    const bad = [];
    if (!(p(15, 15) > 200)) bad.push('filled rivet not opaque at centre');
    if (!(p(45, 15) < 160)) bad.push('hollow rivet not hollow at centre');
    if (g.getTransform().a !== 1 || g.fillStyle !== '#000000') bad.push('context state not restored');
    out.push({ name: `life ${lname} chaos ${ch}`, cell: 30, bad });
  }
  return out;
}

// ---------------- cell check: room looks ----------------
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// empty = dark panel; snake = brass or dead iron (warm or grey, lit); dot = red lamp or its white core
function cls3(r, g, b) {
  if (r > 170 && b > 0.75 * g && g > 90) return 'dot';            // white core and its pink rim (brass has b << g)
  if (r > 100 && g < 0.42 * r && b < 0.5 * r) return 'dot';
  if (lumOf(r, g, b) < 40) return 'empty';
  if (r >= g * 0.95 && g >= b * 0.85) return 'snake';
  return `?(${r | 0},${g | 0},${b | 0})`;
}
function sampleRoom(view, snap, fx, only) {
  const gl = renderer.debug.gl;
  renderer.render('hangar', view, snap, fx);
  renderer.render('hangar', view, snap, fx);
  const Fr = renderer.debug.frame() || {}, sn = Fr.snake || {};
  const hBody = Math.min((sn.bodySize || [0, 0.26])[1], 0.34), hHead = Math.min((sn.headSize || [0, 0.3])[1], 0.3);
  const hDot = 0.03 + Math.min((sn.dotSize || [0, 0.3])[1], 0.34) / 2;
  const Wb = gl.drawingBufferWidth, Hb = gl.drawingBufferHeight, px = new Uint8Array(Wb * Hb * 4);
  gl.readPixels(0, 0, Wb, Hb, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const snakeSet = new Set(snap.snake.map(key)), headKey = key(snap.snake[0]);
  const eye = renderer.debug.camera().eye;
  const occList = snap.snake.slice(1).map((c) => ({ c, dot: false })).concat(snap.food ? [{ c: snap.food, dot: true }] : []);
  const res = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + y * COLS;
    if (only && !only.has(k)) continue;
    const exp = snakeSet.has(k) ? 'snake' : snap.food && snap.food.x === x && snap.food.y === y ? 'dot' : 'empty';
    const [wx, wz] = renderer.debug.cellToWorld(x, y);
    if (view === 'pov') {
      if (k === headKey) continue;
      const ex = wx - eye[0], ez = wz - eye[2], D = Math.hypot(ex, ez);
      if (D < 1.6) { res.push({ x, y, exp, off: true }); continue; }
      // skip cells hidden in screen space by a plate near the ray's end or by the dot's beacon in front
      let hidden = false;
      for (const o of occList) {
        if (o.c.x === x && o.c.y === y) continue;
        const [ox, oz] = renderer.debug.cellToWorld(o.c.x, o.c.y);
        const f = ((ox - eye[0]) * ex + (oz - eye[2]) * ez) / (D * D);
        const lat = Math.abs((ox - eye[0]) * ez - (oz - eye[2]) * ex) / D;
        if (o.dot ? f > 0 && f < 1 && lat < 0.9 : f > 0.55 && f < 1 && lat < 0.75) hidden = true;
      }
      if (hidden) { res.push({ x, y, exp, off: true }); continue; }
    }
    const h = exp === 'snake' ? (k === headKey ? hHead : hBody) : exp === 'dot' ? hDot : 0;
    const p = renderer.debug.project(wx, h, wz);
    if (!p.visible) { res.push({ x, y, exp, off: true }); continue; }
    const sx = Math.round(p.x), sy = Hb - 1 - Math.round(p.y);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((sy + dy) * Wb + (sx + dx)) * 4;
      if (i < 0 || i >= px.length) continue;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    res.push({ x, y, exp, r: r / n, g: g / n, b: b / n });
  }
  return res;
}
function checkRoom(sizes) {
  const out = [];
  if (!renderer) return [{ name: 'room: renderer null (no WebGL)', bad: ['no renderer'] }];
  for (const [w, h] of sizes) {
    renderer.resize(w, h, 1);
    for (const view of ['board', 'pov']) for (const [cn, c] of Object.entries(CASES)) for (const [fn, fo] of Object.entries(FXS)) {
      const snap = snapOf(c), fx = mkFx(fo, snap);
      const s = sampleRoom(view, snap, fx);
      const bad = []; let tested = 0, off = 0;
      for (const e of s) {
        if (e.off) { off++; continue; }
        tested++;
        const got = cls3(e.r, e.g, e.b);
        if (got !== e.exp) bad.push(`${e.x},${e.y} want ${e.exp} got ${got} rgb(${e.r | 0},${e.g | 0},${e.b | 0})`);
      }
      out.push({ name: `${view} ${w}x${h} ${cn} ${fn}`, tested, off, bad });
    }
    // no interpolation across a break: mid-tick, the cells between split pieces stay empty
    const mid = snapOf(CASES.broken, { progress: 0.5 });
    const gap = new Set([6 + 7 * COLS, 7 + 7 * COLS, 8 + 7 * COLS]);
    const sg = sampleRoom('board', mid, mkFx(FXS.chaos0, mid), gap);
    out.push({ name: `board ${w}x${h} broken mid-tick gap`, tested: sg.length, off: 0, bad: sg.filter((e) => cls3(e.r, e.g, e.b) !== 'empty').map((e) => `${e.x},${e.y} got ${cls3(e.r, e.g, e.b)}`) });
    // a bite in both views must render (engine-owned bite rings are not classified)
    for (const view of ['board', 'pov']) {
      const snap = snapOf(CASES.moving);
      renderer.render('hangar', view, snap, mkFx({ chaos: 0.7, punch: 1, variant: 4 }, snap, { bite: snap.snake[0], biteAge: 40 }));
    }
  }
  fit();
  return out;
}
function check() {
  const was = paused; paused = true;
  const t0 = performance.now();
  const rows = checkFlat([[1280, 720], [390, 844]]).concat(checkRoom([[1280, 720], [390, 844]]));
  paused = was;
  const failed = rows.filter((r) => r.bad.length);
  const text = `cell check: ${rows.length - failed.length}/${rows.length} pass, errors ${errors.length}, ${Math.round(performance.now() - t0)} ms` +
    (failed.length ? '\n' + failed.map((r) => `FAIL ${r.name}: ${r.bad.slice(0, 4).join('; ')}${r.bad.length > 4 ? ` (+${r.bad.length - 4})` : ''}`).join('\n') : '');
  checkText = text;
  status();
  console.log('[hangar] ' + text);
  return { pass: rows.length - failed.length, total: rows.length, failed, rows, errors: errors.slice() };
}

function set(o = {}) {
  if (o.look) { look = o.look; cutAt = clock; }
  if (o.case) caseId = o.case;
  if (o.size) { sizeId = o.size; fit(); }
  if (o.chaos != null) $('chaos').value = String(o.chaos);
  if (o.rf != null) $('rf').checked = !!o.rf;
  if (o.rm != null) $('rm').checked = !!o.rm;
  if (o.paused != null) paused = !!o.paused;
  if (o.bite) $('bite').onclick();
  if (o.clock != null) clock = o.clock;
  status();
  return { look, caseId, sizeId };
}
window.__hg = { renderer, check, frames, set, errors, S, layout };
status();
