// lane room harness: the universe `lane` in board view and first person, with faked lane snapshots
// (LEVELS_PLAN 3.3 / 3.4) and fx. Renders on demand (the hidden preview pane throttles rAF).
// URL: ?view=board|pov  ?case=live|up|down|broken|respawn|edges|dead  ?size=fit|land|port  ?chaos=0.6 ?rf ?rm ?pause
// Console: __ln.check() cell check (both views, every case, chaos 0 / 1 / wild / mid, landscape and
//          portrait, far-dot visibility, no interpolation across breaks); __ln.smooth() scroll smoothness
//          (frame-to-frame image change and lane origin across y0 changes); __ln.frames(n, dtMs).
import * as roomMod from '../src/render/gl/rooms/lane.js';
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const LEFT = { up: 'left', left: 'down', down: 'right', right: 'up' };
const RIGHT = { up: 'right', right: 'down', down: 'left', left: 'up' };
const key = (c) => c.x + c.y * COLS;
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
};
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
const origErr = console.error.bind(console);
console.error = (...a) => { errors.push(a.map(String).join(' ')); origErr(...a); };

// ---------------- lane state -> snapshot (board-local window of 16 rows at y0) ----------------
// L = { body: absolute cells head first, dir, y0, prevY0, foodAt, prevTail (absolute or null), tick, ... }
function snapOf(L, over = {}) {
  const inWin = (c) => c.x >= 0 && c.x < COLS && c.y - L.y0 >= 0 && c.y - L.y0 < ROWS;
  const snake = [], idx = [], breaks = [];
  L.body.forEach((c, i) => { if (inWin(c)) { snake.push({ x: c.x, y: c.y - L.y0 }); idx.push(i); } });
  for (let k = 0; k + 1 < snake.length; k++) {
    const a = snake[k], b = snake[k + 1];
    if (idx[k + 1] !== idx[k] + 1 || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1 || (L.cut || []).includes(idx[k])) breaks.push(k);
  }
  const pt = L.prevTail && inWin(L.prevTail) ? { x: L.prevTail.x, y: L.prevTail.y - L.y0 } : null;
  const fa = L.foodAt;
  const food = fa && inWin(fa) ? { x: fa.x, y: fa.y - L.y0 } : null;
  return deepFreeze({
    cols: COLS, rows: ROWS, snake, breaks, length: L.body.length,
    dir: L.dir, prevDir: L.prevDir || L.dir, heading: L.dir, prevTail: pt, grew: !!L.grew,
    food, mushroom: null, score: L.score ?? 9, stepMs: 140, tick: L.tick ?? 50, progress: L.progress ?? 1,
    alive: L.alive !== false, paused: !!L.paused, waiting: L.waiting || null, death: L.death || null,
    lives: L.lives ?? 3, maxLives: 5,
    universe: { id: 'lane', rules: 'lane', mushrooms: false, index: 6, holdLeft: 3 },
    space: { kind: 'lane', y0: L.y0, prevY0: L.prevY0 ?? L.y0 },
    body: L.body.map((c) => ({ x: c.x, y: c.y })), foodAt: fa ? { x: fa.x, y: fa.y } : null, seed: 1,
    ...(L.box ? { space: { kind: 'box' }, body: null, foodAt: null } : {}), ...over,
  });
}
const path = (start, moves) => { // absolute cells from a head and a list of [dir, n] going toward the tail
  const out = [{ ...start }];
  for (const [d, n] of moves) for (let i = 0; i < n; i++) { const p = out[out.length - 1]; out.push({ x: p.x + DIRS[d][0], y: p.y + DIRS[d][1] }); }
  return out;
};
// fixed cases (progress 1: cells exact)
const CASES = {
  // travelling up, the window just scrolled (prevY0 = y0 + 1), dot 5 rows beyond the top edge
  up: { body: path({ x: 8, y: -45 }, [['down', 2], ['right', 2], ['down', 5], ['right', 2], ['down', 4]]), dir: 'up', y0: -50, prevY0: -49, foodAt: { x: 4, y: -55 }, prevTail: { x: 12, y: -33 } },
  // travelling back down, window scrolled down (prevY0 = y0 - 1), dot on the board
  down: { body: path({ x: 6, y: -20 }, [['up', 2], ['left', 2], ['up', 9]]), dir: 'down', y0: -30, prevY0: -31, foodAt: { x: 12, y: -27 }, prevTail: null },
  // a body that leaves the window over the top and comes back (gap), plus a split-off piece (listed break)
  broken: { body: path({ x: 3, y: -60 }, [['up', 7], ['right', 3], ['down', 9], ['right', 1]]).concat(path({ x: 13, y: -52 }, [['down', 2]])), dir: 'down', y0: -65, prevY0: -65, foodAt: { x: 10, y: -70 }, prevTail: null, cut: [20] },
  // short respawned snake waiting for a key
  respawn: { body: [{ x: 8, y: -37 }, { x: 8, y: -36 }, { x: 8, y: -35 }], dir: 'up', y0: -45, prevY0: -45, foodAt: { x: 2, y: -49 }, prevTail: null, waiting: 'respawn', paused: true, lives: 2, tick: 77, progress: 0 },
  // along both lethal side columns, dot on the board
  edges: { body: path({ x: 0, y: -90 }, [['down', 9], ['right', 15], ['up', 11]]), dir: 'up', y0: -95, prevY0: -94, foodAt: { x: 8, y: -93 }, prevTail: null },
  // a box-space snapshot (fallback): closed board, no lane hooks
  box: { body: path({ x: 5, y: 5 }, [['down', 3], ['right', 2]]), dir: 'up', y0: 0, prevY0: 0, foodAt: { x: 12, y: 2 }, prevTail: null, box: true },
  dead: { body: path({ x: 8, y: -45 }, [['down', 2], ['right', 2], ['down', 5]]), dir: 'up', y0: -50, prevY0: -50, foodAt: { x: 4, y: -55 }, alive: false, death: { reason: 'wall', cell: { x: 8, y: 5 } }, lives: 0 },
};

const BASE_FX = { now: 1000, time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: false };
const FXS = {
  chaos0: {},
  chaos1: { chaos: 1, variant: 1, time: 7.3 },
  wild: { chaos: 1, beat: 1, punch: 1, variant: 3, beatIndex: 5, time: 11.1 },
  mid: { chaos: 0.6, beat: 0.15, variant: 2, reducedFlash: true, reducedMotion: true },
  print: { chaos: 0, beat: 1, punch: 1, variant: 2, time: 4.4 },
};
const mkFx = (o, extra = {}) => ({ ...BASE_FX, ...o, ...extra });

// ---------------- live lane sim (seeded) ----------------
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function newLane(s = 7) {
  seed = s;
  return { body: path({ x: 8, y: 8 }, [['down', 5]]), dir: 'up', prevDir: 'up', y0: 0, prevY0: 0, foodAt: { x: 5, y: -4 }, prevTail: null, tick: 1, progress: 0, score: 9, lives: 3, alive: true, goal: 'up', goalLeft: 40, acc: 0 };
}
function spawnFood(L) {
  for (let i = 0; i < 50; i++) {
    const c = { x: Math.floor(rnd() * COLS), y: L.y0 - 2 - Math.floor(rnd() * 7) };
    if (!L.body.some((b) => b.x === c.x && b.y === c.y)) { L.foodAt = c; return; }
  }
}
const blocked = (L, c) => c.x < 0 || c.x >= COLS || L.body.slice(0, -1).some((b) => b.x === c.x && b.y === c.y);
function laneStep(L, steer = true) {
  const h = L.body[0];
  if (steer) {
    if (--L.goalLeft <= 0) { L.goal = L.goal === 'up' ? 'down' : 'up'; L.goalLeft = L.goal === 'up' ? 40 : 14; }
    let best = null, bs = -1e9;
    for (const d of [L.dir, LEFT[L.dir], RIGHT[L.dir]]) {
      const c = { x: h.x + DIRS[d][0], y: h.y + DIRS[d][1] };
      if (blocked(L, c)) continue;
      let sc = rnd() * 0.6;
      if (d === L.goal) sc += 2;
      if (L.dir === OPP[L.goal] && d !== L.dir) sc += 1;
      if (d !== L.goal && d !== OPP[L.goal] && L.foodAt && Math.sign(L.foodAt.x - h.x) === DIRS[d][0]) sc += 0.7;
      if (sc > bs) { bs = sc; best = d; }
    }
    if (best) { L.prevDir = L.dir; L.dir = best; }
  }
  const nh = { x: h.x + DIRS[L.dir][0], y: h.y + DIRS[L.dir][1] };
  if (blocked(L, nh)) { Object.assign(L, newLane(seed)); return 'reset'; }
  const ate = L.foodAt && nh.x === L.foodAt.x && nh.y === L.foodAt.y;
  L.body.unshift(nh);
  L.prevTail = ate ? null : L.body.pop();
  L.grew = !!ate;
  L.prevY0 = L.y0;
  const ly = nh.y - L.y0;
  if (ly < 5) L.y0 = nh.y - 5; else if (ly > 10) L.y0 = nh.y - 10;
  L.tick++;
  if (ate) { L.score++; spawnFood(L); return 'ate'; }
  return 'step';
}

// ---------------- canvases and driver ----------------
let view = q.get('view') === 'pov' ? 'pov' : 'board';
let caseId = q.get('case') || 'live';
let sizeId = q.get('size') || 'fit';
let paused = q.has('pause');
let clock = 0, animTime = 0, biteAt = -1e9, cutAt = 0, variant = 0, bite = null;
let L = newLane();
if (q.get('chaos')) $('chaos').value = q.get('chaos');
$('rf').checked = q.has('rf');
$('rm').checked = q.has('rm');
function liveFx() {
  const rf = $('rf').checked, rm = $('rm').checked;
  const beats = (clock / 1000) * (128 / 60), beatIndex = Math.floor(beats);
  let beat = Math.exp(-(beats - beatIndex) * 5);
  if (rf) beat *= 0.15;
  const biteAge = clock - biteAt;
  return {
    now: clock, time: animTime, beat, beatIndex, chaos: +$('chaos').value,
    punch: rf ? 0 : Math.max(0, 1 - biteAge / 300), variant, bite, biteAge: bite ? biteAge : Infinity,
    cutAge: clock - cutAt, reducedFlash: rf, reducedMotion: rm,
  };
}
const currentSnap = () => (caseId === 'live' ? snapOf(L) : snapOf(CASES[caseId]));
const SIZES = { fit: null, land: [1280, 720], port: [390, 844] };
const glCv = $('gl'), livesCv = $('lives'), stage = $('stage');
let W = 0, H = 0, dpr = 1;
const renderer = await createRoomRenderer(glCv, { cols: COLS, rows: ROWS, roomIds: ['lane'] });
function fit() {
  dpr = Math.min(2, devicePixelRatio || 1);
  const fixed = SIZES[sizeId];
  W = fixed ? fixed[0] : innerWidth; H = fixed ? fixed[1] : innerHeight;
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  glCv.style.width = W + 'px'; glCv.style.height = H + 'px';
  if (renderer) renderer.resize(W, H, dpr);
  const k = fixed ? Math.min(1, (innerWidth - 16) / W, (innerHeight - 16) / H) : 1;
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  livesCv.width = Math.round(150 * dpr); livesCv.height = Math.round(30 * dpr);
  livesCv.style.width = '150px'; livesCv.style.height = '30px';
}
addEventListener('resize', fit);
fit();
function step(dt) {
  clock += dt;
  animTime += (dt / 1000) * ($('rm').checked ? 0.15 : 1);
  if (caseId === 'live' && !paused) {
    L.acc += Math.min(100, dt);
    while (L.acc >= 140) { L.acc -= 140; if (laneStep(L) === 'ate') { bite = { x: L.body[0].x, y: L.body[0].y - L.y0 }; biteAt = clock; variant++; } }
    L.progress = L.acc / 140;
  }
  const snap = currentSnap(), fx = liveFx();
  try {
    if (renderer && !renderer.lost()) renderer.render('lane', view, snap, fx);
    const lc = livesCv.getContext('2d');
    lc.setTransform(dpr, 0, 0, dpr, 0, 0); lc.clearRect(0, 0, 150, 30);
    for (let i = 0; i < 5; i++) roomMod.life(lc, 4 + i * 29, 3, 24, i < snap.lives, fx);
  } catch (e) { if (errors.length < 20) errors.push(String((e && e.stack) || e)); }
}
let fps = 0, nFrames = 0, fpsT = 0, last = 0;
function loop(now) {
  step(last ? Math.min(100, now - last) : 16);
  last = now; nFrames++;
  if (now - fpsT > 1000) { fps = Math.round((nFrames * 1000) / (now - fpsT)); nFrames = 0; fpsT = now; status(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
function frames(n = 1, dt = 16.7) { for (let i = 0; i < n; i++) step(dt); status(); return { clock, view, caseId, y0: L.y0, tick: L.tick, errors: errors.length }; }

// ---------------- controls ----------------
let checkText = '';
function status() {
  $('out').textContent = `view ${view} | case ${caseId} | ${W}x${H} | ${fps} fps | gl ${renderer ? Object.keys(renderer.rooms).join(',') : 'null'} | y0 ${L.y0} score ${L.score}` +
    (errors.length ? `\nERRORS: ${errors.slice(0, 3).join(' / ')}` : '') + (checkText ? '\n' + checkText : '');
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  document.querySelectorAll('[data-case]').forEach((b) => b.classList.toggle('on', b.dataset.case === caseId));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === sizeId));
}
$('views').innerHTML = ['board', 'pov'].map((v) => `<button data-view="${v}">${v}</button>`).join('');
$('cases').innerHTML = ['live', ...Object.keys(CASES)].map((v) => `<button data-case="${v}">${v}</button>`).join('');
$('sizes').innerHTML = Object.keys(SIZES).map((v) => `<button data-size="${v}">${v}</button>`).join('');
$('views').onclick = (e) => { if (e.target.dataset.view) { view = e.target.dataset.view; cutAt = clock; status(); } };
$('cases').onclick = (e) => { if (e.target.dataset.case) { caseId = e.target.dataset.case; status(); } };
$('sizes').onclick = (e) => { if (e.target.dataset.size) { sizeId = e.target.dataset.size; fit(); status(); } };
$('toggle').onclick = () => $('ui').classList.toggle('min');
$('bite').onclick = () => { const s = currentSnap(); bite = s.snake[0] || { x: 8, y: 8 }; biteAt = clock; variant++; };
$('pause').onclick = () => { paused = !paused; };
$('check').onclick = () => check();
$('smooth').onclick = () => smooth();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') $('bite').onclick();
  else if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
  else if (e.code === 'KeyC') check();
  else if (e.code === 'KeyS') smooth();
  else if (e.code === 'KeyV') { view = view === 'board' ? 'pov' : 'board'; cutAt = clock; status(); }
});

// ---------------- cell check ----------------
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// classes from the frame's own colours: empty = the panel colour, dot = near the dot ink, snake = anything else
function classifier() {
  const Fr = renderer.debug.frame() || {};
  const panel = (Fr.board && Fr.board.panel) || [0, 0, 0];
  const P = panel.map((v) => Math.min(255, v * 255));
  const de = Fr.snake && Fr.snake.dot ? Array.from(Fr.snake.dot.emissive).map((v) => Math.min(255, v * 255)) : [255, 0, 255];
  // far cells at grazing angles blend in their anti-aliased grid lines: empty = within reach of the
  // segment from the panel colour 60% of the way to the line colour (panel + grid)
  const Gd = ((Fr.board && Fr.board.grid) || [0, 0, 0]).map((v) => v * 255 * 0.6);
  const segDist = (c) => {
    const L2 = Gd[0] * Gd[0] + Gd[1] * Gd[1] + Gd[2] * Gd[2] || 1;
    const u = Math.max(0, Math.min(1, ((c[0] - P[0]) * Gd[0] + (c[1] - P[1]) * Gd[1] + (c[2] - P[2]) * Gd[2]) / L2));
    return dist3(c, [P[0] + Gd[0] * u, P[1] + Gd[1] * u, P[2] + Gd[2] * u]);
  };
  return (r, g, b) => {
    const c = [r, g, b];
    if (segDist(c) < 48) return 'empty';
    if (dist3(c, de) < 80) return 'dot';
    return 'snake';
  };
}
function readAll() {
  const gl = renderer.debug.gl, Wb = gl.drawingBufferWidth, Hb = gl.drawingBufferHeight, px = new Uint8Array(Wb * Hb * 4);
  gl.readPixels(0, 0, Wb, Hb, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { px, Wb, Hb };
}
function at(img, x, y) { // canvas pixel (origin top-left) -> 3x3 mean
  const sx = Math.round(x), sy = img.Hb - 1 - Math.round(y);
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = sx + dx, Y = sy + dy;
    if (X < 0 || Y < 0 || X >= img.Wb || Y >= img.Hb) continue;
    const i = (Y * img.Wb + X) * 4;
    r += img.px[i]; g += img.px[i + 1]; b += img.px[i + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
function sampleRoom(v, snap, fx, only) {
  renderer.render('lane', v, snap, { ...fx, reducedMotion: true }); // settles the first-person yaw on snap.dir
  renderer.render('lane', v, snap, fx);
  const Fr = renderer.debug.frame() || {}, sn = Fr.snake || {};
  const hBody = Math.min((sn.bodySize || [0, 0.26])[1], 0.34), hHead = Math.min((sn.headSize || [0, 0.3])[1], 0.3);
  const hDot = 0.03 + Math.min((sn.dotSize || [0, 0.3])[1], 0.34) / 2;
  const img = readAll(), cls = classifier();
  const snakeSet = new Set(snap.snake.map(key)), headKey = snap.snake.length ? key(snap.snake[0]) : -1;
  const eye = renderer.debug.camera().eye;
  const occList = snap.snake.slice(1).map((c) => ({ c, dot: false })).concat(snap.food ? [{ c: snap.food, dot: true }] : []);
  const res = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + y * COLS;
    if (only && !only.has(k)) continue;
    const exp = snakeSet.has(k) ? 'snake' : snap.food && snap.food.x === x && snap.food.y === y ? 'dot' : 'empty';
    const [wx, wz] = renderer.debug.cellToWorld(x, y);
    if (v === 'pov') {
      if (k === headKey) continue;
      const ex = wx - eye[0], ez = wz - eye[2], D = Math.hypot(ex, ez);
      if (D < 1.6) { res.push({ x, y, exp, off: true }); continue; }
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
    const [r, g, b] = at(img, p.x, p.y);
    res.push({ x, y, exp, r, g, b, got: cls(r, g, b) });
  }
  // the dot far down the lane: its marble and the flower flag above it must show in the dot ink
  let far = null;
  if (!snap.food && snap.foodAt && v === 'board' || (!snap.food && snap.foodAt && v === 'pov' && snap.dir === 'up')) {
    const wx = renderer.debug.cellToWorld(snap.foodAt.x, 0)[0], wz = renderer.debug.laneZ(snap.foodAt.y);
    far = [];
    const p0 = renderer.debug.project(wx, hDot, wz);
    if (!p0.visible) far.push({ what: 'marble', off: true });
    else { const c = at(img, p0.x, p0.y); far.push({ what: 'marble', got: cls(...c), rgb: c.map((u) => u | 0) }); }
    // flag: a ring of petals around the heart at y 2.2, facing the camera; most samples must be dot ink
    let rx = eye[2] - wz, rz = -(eye[0] - wx);
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    let hits = 0, seen = 0, rgb = null;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, u = Math.cos(a) * 0.42, w = Math.sin(a) * 0.42;
      const p = renderer.debug.project(wx + rx * u, 2.2 + w, wz + rz * u);
      if (!p.visible) continue;
      seen++;
      const c = at(img, p.x, p.y);
      if (cls(...c) === 'dot') hits++; else rgb = c.map((u) => u | 0);
    }
    far.push(seen < 4 ? { what: 'flag', off: true } : { what: 'flag', got: hits >= Math.ceil(seen * 0.6) ? 'dot' : `${hits}/${seen}`, rgb });
  }
  return { cells: res, far };
}

function checkRoom(sizes) {
  const out = [];
  if (!renderer) return [{ name: 'room: renderer null (no WebGL)', bad: ['no renderer'] }];
  for (const [w, h] of sizes) {
    renderer.resize(w, h, 1);
    for (const v of ['board', 'pov']) for (const [cn, c] of Object.entries(CASES)) for (const [fn, fo] of Object.entries(FXS)) {
      const snap = snapOf(c), fx = mkFx(fo);
      const s = sampleRoom(v, snap, fx);
      const bad = []; let tested = 0, off = 0;
      for (const e of s.cells) {
        if (e.off) { off++; continue; }
        tested++;
        if (e.got !== e.exp) bad.push(`${e.x},${e.y} want ${e.exp} got ${e.got} rgb(${e.r | 0},${e.g | 0},${e.b | 0})`);
      }
      if (s.far && c.alive !== false) for (const f of s.far) if (!f.off && f.got !== 'dot') bad.push(`far ${f.what} got ${f.got} rgb(${f.rgb})`);
      out.push({ name: `${v} ${w}x${h} ${cn} ${fn}`, tested, off, far: s.far, bad });
    }
    // no interpolation across a break: mid-tick, the gap cells between the split pieces stay empty
    const mid = snapOf({ ...CASES.broken, tick: 60, progress: 0.5 });
    const gap = new Set([4 + 0 * COLS, 5 + 0 * COLS, 4 + 1 * COLS, 5 + 1 * COLS, 8 + 7 * COLS, 9 + 8 * COLS]);
    for (const v of ['board', 'pov']) {
      const sg = sampleRoom(v, mid, mkFx(FXS.chaos0), gap).cells.filter((e) => !e.off);
      out.push({ name: `${v} ${w}x${h} broken mid-tick gap`, tested: sg.length, off: 0, bad: sg.filter((e) => e.got !== 'empty').map((e) => `${e.x},${e.y} got ${e.got}`) });
    }
    // a bite in both views must render (engine-owned bite rings are not classified)
    for (const v of ['board', 'pov']) {
      const snap = snapOf(CASES.up);
      renderer.render('lane', v, snap, mkFx({ chaos: 0.7, punch: 1, variant: 4 }, { bite: snap.snake[0], biteAge: 40 }));
    }
  }
  fit();
  return out;
}
function check() {
  const was = paused; paused = true;
  const t0 = performance.now();
  const e0 = errors.length;
  const rows = checkRoom([[1280, 720], [390, 844]]);
  paused = was;
  const failed = rows.filter((r) => r.bad.length);
  const text = `cell check: ${rows.length - failed.length}/${rows.length} pass, errors ${errors.length} (+${errors.length - e0}), ${Math.round(performance.now() - t0)} ms` +
    (failed.length ? '\n' + failed.slice(0, 12).map((r) => `FAIL ${r.name}: ${r.bad.slice(0, 4).join('; ')}${r.bad.length > 4 ? ` (+${r.bad.length - 4})` : ''}`).join('\n') : '');
  checkText = text;
  status();
  console.log('[lane] ' + text);
  return { pass: rows.length - failed.length, total: rows.length, failed, rows, errors: errors.slice() };
}

// ---------------- scroll smoothness ----------------
// A snake drives straight up the lane for `ticks` ticks (y0 changes on every tick once the head reaches
// row 5), rendered at 8 sub-steps per tick with frozen time and beat, so only the scroll moves the picture.
// Pass: the lane origin moves by at most 1/8 row per sub-step and never jumps, and no frame-to-frame image
// change spikes at a tick boundary (max <= 2.6 x median + 1).
function smoothRun(v, fo, w, h) {
  renderer.resize(w, h, 1);
  const S = newLane(11);
  S.body = path({ x: 7, y: 5 }, [['down', 6]]); S.foodAt = { x: 12, y: -30 };
  const diffs = [], orgs = [], bounds = [], seams = [];
  let prev = null, endImg = null;
  const mad = (a, b) => { let sum = 0, n = 0; for (let i = 0; i < a.length; i += 4 * 3) { sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++; } return sum / n; };
  const fx = mkFx(fo, { time: 3, beat: 0, punch: 0, now: 5000 });
  for (let t = 0; t < 10; t++) {
    S.dir = 'up';
    laneStep(S, false);
    for (let k = 0; k < 8; k++) {
      S.progress = k / 8;
      const snap = snapOf(S);
      renderer.render('lane', v, snap, fx);
      orgs.push(renderer.debug.lane().org);
      const img = readAll();
      if (k === 0 && endImg) seams.push(mad(img.px, endImg)); // y0 just changed: must match the tick's end exactly
      if (prev) {
        let sum = 0, n = 0;
        for (let i = 0; i < img.px.length; i += 4 * 7) { sum += Math.abs(img.px[i] - prev[i]) + Math.abs(img.px[i + 1] - prev[i + 1]) + Math.abs(img.px[i + 2] - prev[i + 2]); n++; }
        diffs.push(sum / n);
        if (k === 0) bounds.push(diffs.length - 1);
      }
      prev = img.px;
    }
    S.progress = 1;
    renderer.render('lane', v, snapOf(S), fx);
    endImg = readAll().px;
  }
  const sorted = diffs.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1], max = sorted[sorted.length - 1];
  const steps = orgs.slice(1).map((o, i) => o - orgs[i]);
  const maxStep = Math.max(...steps.map(Math.abs));
  const bad = [];
  if (maxStep > 0.126) bad.push(`origin step ${maxStep.toFixed(3)} rows`);
  if (steps.some((s) => s > 1e-6)) bad.push('origin moved backwards');
  const seam = Math.max(...seams);
  if (seam > 0.05) bad.push(`tick seam differs by ${seam.toFixed(3)} (y0 change shows a jump)`);
  if (max > 2.6 * med + 1) bad.push(`image change spike ${max.toFixed(2)} vs median ${med.toFixed(2)} at ${diffs.indexOf(max)} (tick bounds ${bounds.slice(0, 4).join(',')}…)`);
  return { name: `smooth ${v} ${w}x${h} ${fo.chaos ? 'chaos1' : 'chaos0'}`, med: +med.toFixed(2), max: +max.toFixed(2), seam: +seam.toFixed(4), maxStep: +maxStep.toFixed(3), y0: S.y0, bad };
}
function smooth() {
  const was = paused; paused = true;
  const rows = [];
  for (const [w, h] of [[1280, 720], [390, 844]]) for (const v of ['board', 'pov']) for (const fo of [FXS.chaos0, FXS.chaos1]) rows.push(smoothRun(v, fo, w, h));
  fit();
  paused = was;
  const failed = rows.filter((r) => r.bad.length);
  checkText = `smooth: ${rows.length - failed.length}/${rows.length} pass` + rows.map((r) => `\n${r.bad.length ? 'FAIL' : 'ok  '} ${r.name} med ${r.med} max ${r.max} seam ${r.seam} step ${r.maxStep}${r.bad.length ? ' ' + r.bad.join('; ') : ''}`).join('');
  status();
  console.log('[lane] ' + checkText);
  return { pass: rows.length - failed.length, total: rows.length, rows, errors: errors.slice() };
}

function set(o = {}) {
  if (o.view) { view = o.view; cutAt = clock; }
  if (o.case) caseId = o.case;
  if (o.size) { sizeId = o.size; fit(); }
  if (o.chaos != null) $('chaos').value = String(o.chaos);
  if (o.rf != null) $('rf').checked = !!o.rf;
  if (o.rm != null) $('rm').checked = !!o.rm;
  if (o.paused != null) paused = !!o.paused;
  if (o.bite) $('bite').onclick();
  status();
  return { view, caseId, sizeId };
}
window.__ln = { renderer, check, smooth, frames, set, errors, get L() { return L; }, snapOf, CASES };
status();
