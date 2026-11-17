// castle-2d harness: the flat look of the cube universe `castle` with faked cube snapshots (LEVELS_PLAN 3.3/3.4).
// URL: ?case=<id> ?size=fit|land|port ?chaos=0.6
// Console: __c2.check() runs the cell check over every case × fx (chaos 0, chaos 1, wild, bite) × landscape
//          and portrait, plus ribbon-joint checks across breaks and the life icons.
//          __c2.show(case, { chaos, size, t }) renders one frame on demand (the hidden pane throttles rAF).
import * as flat from '../src/render/timelines/castle.js';

const COLS = 16, ROWS = 16;
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const key = (c) => c.x + c.y * COLS;
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); origErr(...a); };

// ---------------- faked cube snapshots ----------------
const MOVING = [[8, 10], [8, 11], [9, 11], [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [11, 7], [12, 7], [12, 8], [12, 9]];
// broken: A (5,5)-(5,7) | B (9,7)-(11,9) | C (12,9)-(12,11) | D (2,12)-(3,12); B|C are adjacent but split
const BROKEN = [[5, 5], [5, 6], [5, 7], [9, 7], [9, 8], [9, 9], [10, 9], [11, 9], [12, 9], [12, 10], [12, 11], [2, 12], [3, 12]];
const cube = (face, o = {}) => ({ kind: 'cube', face, rot: o.rot ?? 0, prevFace: o.prevFace ?? face, prevRot: o.prevRot ?? 0, entered: o.entered ?? null });
const CASES = {
  inUp: { snake: [[7, 15]], length: 9, dir: 'up', space: cube(1, { prevFace: 0, entered: 'up' }), food: { x: 7, y: 4 } },
  inDown: { snake: [[9, 0]], length: 9, dir: 'down', space: cube(3, { prevFace: 1, entered: 'down', rot: 2 }), food: { x: 2, y: 9 } },
  inLeft: { snake: [[15, 5]], length: 9, dir: 'left', space: cube(4, { prevFace: 2, entered: 'left', rot: 1 }), food: null },
  inRight: { snake: [[0, 11]], length: 9, dir: 'right', space: cube(2, { prevFace: 5, entered: 'right', rot: 3 }), food: { x: 12, y: 11 } },
  three: { snake: [[13, 4], [14, 4], [15, 4]], length: 10, dir: 'left', space: cube(5), food: { x: 3, y: 4 } },
  broken: { snake: BROKEN, breaks: [2, 7, 10], length: 20, dir: 'up', space: cube(0), food: { x: 13, y: 3 }, tick: 40, progress: 1 },
  respawn: { snake: [[8, 7], [8, 8], [8, 9]], dir: 'up', space: cube(0), food: { x: 3, y: 12 }, waiting: 'respawn', paused: true, lives: 2 },
  dead: { snake: MOVING, dir: 'up', space: cube(3), food: { x: 4, y: 3 }, alive: false, death: { reason: 'self', cell: { x: 8, y: 11 } }, lives: 0 },
  edges: { snake: [[15, 0], [14, 0], [13, 0], [12, 0], [12, 1], [0, 1], [0, 2]], breaks: [4], dir: 'right', space: cube(2), food: { x: 15, y: 15 } },
};
for (let f = 0; f < 6; f++) CASES['face' + f] = { snake: MOVING, dir: 'up', space: cube(f), food: { x: 4, y: 3 } };
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
function snapOf(c, over = {}) {
  const snake = c.snake.map(([x, y]) => ({ x, y }));
  return deepFreeze({
    cols: COLS, rows: ROWS, snake, breaks: c.breaks || [], length: c.length ?? snake.length,
    dir: c.dir, prevDir: c.dir, heading: c.dir, prevTail: null, grew: false, food: c.food || null, mushroom: null,
    score: 12, stepMs: 140, tick: c.tick ?? 7, progress: c.progress ?? 0.4, alive: c.alive !== false, paused: !!c.paused,
    waiting: c.waiting || null, death: c.death || null, lives: c.lives ?? 3, maxLives: 5,
    universe: { id: 'castle', rules: 'cube', mushrooms: false, index: 5, holdLeft: 3 },
    space: c.space, body: null, foodAt: c.food ? null : { f: 1, u: 3, v: 3 }, seed: 4, ...over,
  });
}
const BASE_FX = { now: 1000, time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: false };
const FXS = {
  chaos0: {},
  chaos1: { chaos: 1, variant: 1, time: 7.3 },
  wild: { chaos: 1, beat: 1, punch: 1, variant: 3, beatIndex: 5, time: 11.1 },
  bite: { chaos: 0.5, punch: 0.8, variant: 2, time: 3, biteAge: 60, bite: 'head' },
};
const mkFx = (o, snap) => ({ ...BASE_FX, ...o, bite: o.bite === 'head' ? snap.snake[0] : null });

// ---------------- canvas + on-demand render ----------------
const SIZES = { fit: null, land: [1280, 720], port: [390, 844] };
const cv = $('flat'), livesCv = $('lives'), stage = $('stage'), ctx = cv.getContext('2d');
let caseId = q.get('case') in CASES ? q.get('case') : 'face0', sizeId = q.get('size') in SIZES ? q.get('size') : 'fit';
let W = 0, H = 0, dpr = 1, t = 0, playing = false, biteAt = -1e9, variant = 0;
$('chaos').value = q.get('chaos') ?? '0';
function layout(w, h) {
  const cell = Math.floor(Math.min((0.94 * w) / COLS, (0.8 * h) / ROWS)), bw = cell * COLS, bh = cell * ROWS;
  return { w, h, cell, bx: Math.round((w - bw) / 2), by: Math.round((h - bh) * 0.6), bw, bh, cols: COLS, rows: ROWS };
}
function fit() {
  dpr = Math.min(2, devicePixelRatio || 1);
  const fixed = SIZES[sizeId];
  W = fixed ? fixed[0] : innerWidth; H = fixed ? fixed[1] : innerHeight;
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const k = fixed ? Math.min(1, (innerWidth - 16) / W, (innerHeight - 16) / H) : 1;
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  livesCv.width = Math.round(150 * dpr); livesCv.height = Math.round(30 * dpr);
  livesCv.style.width = '150px'; livesCv.style.height = '30px';
}
addEventListener('resize', () => { fit(); draw(); });
fit();
function liveFx() {
  const beats = t * (132 / 60), bi = Math.floor(beats), age = (t - biteAt) * 1000;
  return { ...BASE_FX, now: t * 1000, time: t, beat: Math.exp(-(beats - bi) * 5), beatIndex: bi, chaos: +$('chaos').value,
    punch: Math.max(0, 1 - age / 300), variant, bite: age < 2000 ? snapOf(CASES[caseId]).snake[0] : null, biteAge: age };
}
function draw() {
  const snap = snapOf(CASES[caseId]), fx = liveFx();
  try {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = layout(W, H);
    flat.scenery(ctx, L, snap, fx);
    flat.board(ctx, L, snap, fx);
    const lc = livesCv.getContext('2d');
    lc.setTransform(dpr, 0, 0, dpr, 0, 0); lc.clearRect(0, 0, 150, 30);
    for (let i = 0; i < 5; i++) flat.life(lc, 4 + i * 29, 3, 24, i < snap.lives, fx);
  } catch (e) { if (errors.length < 20) errors.push(String((e && e.stack) || e)); }
  status();
}
let last = 0;
function loop(now) { if (playing) { t += Math.min(0.1, (now - (last || now)) / 1000); draw(); } last = now; requestAnimationFrame(loop); }
requestAnimationFrame(loop);
function show(c, o = {}) {
  if (c) caseId = c;
  if (o.chaos != null) $('chaos').value = String(o.chaos);
  if (o.size) { sizeId = o.size; fit(); }
  if (o.t != null) t = o.t;
  if (o.bite) { biteAt = t - 0.05; variant++; }
  draw();
  return { caseId, sizeId, W, H, errors: errors.length };
}

// ---------------- controls ----------------
let checkText = '';
function status() {
  $('out').textContent = `case ${caseId} | ${W}x${H} | t ${t.toFixed(2)} | face ${snapOf(CASES[caseId]).space.face}` +
    (errors.length ? `\nERRORS: ${errors.slice(0, 3).join(' / ')}` : '') + (checkText ? '\n' + checkText : '');
  document.querySelectorAll('[data-case]').forEach((b) => b.classList.toggle('on', b.dataset.case === caseId));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === sizeId));
}
$('cases').innerHTML = Object.keys(CASES).map((v) => `<button data-case="${v}">${v}</button>`).join('');
$('sizes').innerHTML = Object.keys(SIZES).map((v) => `<button data-size="${v}">${v}</button>`).join('');
$('cases').onclick = (e) => { if (e.target.dataset.case) show(e.target.dataset.case); };
$('sizes').onclick = (e) => { if (e.target.dataset.size) show(null, { size: e.target.dataset.size }); };
$('chaos').oninput = () => draw();
$('toggle').onclick = () => $('ui').classList.toggle('min');
$('bite').onclick = () => show(null, { bite: true });
$('play').onclick = () => { playing = !playing; };
$('check').onclick = () => check();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') $('bite').onclick();
  else if (e.code === 'Space') { playing = !playing; e.preventDefault(); }
  else if (e.code === 'KeyC') check();
});

// ---------------- cell check ----------------
const BY_CENTRE = [];
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) BY_CENTRE.push({ x, y });
BY_CENTRE.sort((a, b) => Math.hypot(a.x - 7.5, a.y - 7.5) - Math.hypot(b.x - 7.5, b.y - 7.5));
function checkRun(L, w, h, cn, fn, snap, fx) {
  const sc = document.createElement('canvas'); sc.width = w; sc.height = h;
  const sg = sc.getContext('2d');
  flat.scenery(sg, L, snap, fx); flat.board(sg, L, snap, fx);            // the full frame must not throw
  const cv2 = document.createElement('canvas'); cv2.width = w; cv2.height = h;
  const g = cv2.getContext('2d', { willReadFrequently: true });
  flat.board(g, L, snap, fx);
  const bad = [];
  if (g.getTransform().a !== 1 || g.fillStyle !== '#000000' || g.globalAlpha !== 1) bad.push('context state not restored');
  const data = g.getImageData(0, 0, w, h).data;
  const px = (X, Y) => { const i = (Math.round(Y) * w + Math.round(X)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const at = (x, y) => px(L.bx + Math.floor((x + 0.5) * L.cell), L.by + Math.floor((y + 0.5) * L.cell));
  const occ = new Set(snap.snake.map(key)); if (snap.food) occ.add(key(snap.food));
  const refCell = BY_CENTRE.find((c) => !occ.has(key(c))), ref = at(refCell.x, refCell.y);
  const diff = (p) => Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((diff(at(x, y)) > 60) !== occ.has(x + y * COLS)) bad.push(`${x},${y}`);
  if (cn === 'broken' && fn === 'chaos0') {
    // a joined pair shows the ribbon on its shared edge, a pair split by `breaks` does not
    const edge = (a, b) => diff(px(L.bx + Math.max(a[0], b[0]) * L.cell, L.by + (a[1] + 0.5) * L.cell)) > 60;
    if (!edge([9, 9], [10, 9])) bad.push('ribbon missing 9,9|10,9');
    if (edge([11, 9], [12, 9])) bad.push('ribbon drawn across break 11,9|12,9');
  }
  return { name: `${w}x${h} ${cn} ${fn}`, bad };
}
function check() {
  const t0 = performance.now(), rows = [];
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    const L = layout(w, h);
    for (const [cn, c] of Object.entries(CASES)) for (const [fn, fo] of Object.entries(FXS)) {
      const snap = snapOf(c);
      try { rows.push(checkRun(L, w, h, cn, fn, snap, mkFx(fo, snap))); } catch (e) { rows.push({ name: `${w}x${h} ${cn} ${fn}`, bad: ['threw ' + e] }); }
    }
  }
  for (const ch of [0, 1]) {
    const c2 = document.createElement('canvas'); c2.width = 60; c2.height = 30;
    const g = c2.getContext('2d', { willReadFrequently: true });
    flat.life(g, 0, 0, 30, true, { chaos: ch }); flat.life(g, 30, 0, 30, false, { chaos: ch });
    const d = g.getImageData(0, 0, 60, 30).data, a = (x, y) => d[(y * 60 + x) * 4 + 3], bad = [];
    if (!(a(15, 17) > 200)) bad.push('filled berry not opaque at centre');
    if (!(a(45, 17) < 160)) bad.push('hollow berry not hollow at centre');
    if (g.getTransform().a !== 1 || g.fillStyle !== '#000000') bad.push('context state not restored');
    rows.push({ name: `life chaos ${ch}`, bad });
  }
  const failed = rows.filter((r) => r.bad.length);
  checkText = `cell check: ${rows.length - failed.length}/${rows.length} pass, errors ${errors.length}, ${Math.round(performance.now() - t0)} ms` +
    (failed.length ? '\n' + failed.map((r) => `FAIL ${r.name}: ${r.bad.slice(0, 5).join('; ')}${r.bad.length > 5 ? ` (+${r.bad.length - 5})` : ''}`).join('\n') : '');
  status();
  console.log('[castle-2d] ' + checkText);
  return { pass: rows.length - failed.length, total: rows.length, failed: failed.map((r) => r.name + ': ' + r.bad.slice(0, 5).join('; ')), errors: errors.slice() };
}
window.__c2 = { check, show, errors, layout, CASES };
draw();
