// abyss harness: fakes snapshots (LEVELS_PLAN §3.3) and fx (BUILD_PLAN §15.3) to show the ABYSSAL
// CATHEDRAL in its 2D look and its room (board view and first person), and runs a cell check on both.
// URL: ?look=2d|board|pov  ?case=moving|broken|respawn|dead|bite  ?size=land|port  ?chaos=0..1  ?rm ?rf
// Console: __ab.checkAll() -> { problems, errors, text }; __ab.run(frames, dtMs) draws on demand when the
// pane throttles animation frames; __ab.set({ look, case, size, chaos }).
import * as flat from '../src/render/timelines/abyss.js';
import * as roomMod from '../src/render/gl/rooms/abyss.js';
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const SIZES = { land: [1280, 720], port: [390, 844] };
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message || e)));
addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
const cerr = console.error.bind(console);
console.error = (...a) => { errors.push(a.map(String).join(' ')); cerr(...a); };
const freeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(freeze); } return o; };
const cells = (l) => l.map(([x, y]) => ({ x, y }));

// ---------------- fixed cases (board-local cells, head first) ----------------
function snapOf(c) {
  return freeze({
    cols: COLS, rows: ROWS, snake: cells(c.snake), breaks: c.breaks || [], length: c.length || c.snake.length,
    dir: c.dir, prevDir: c.dir, heading: c.dir, prevTail: c.prevTail === undefined ? { x: c.snake[c.snake.length - 1][0], y: c.snake[c.snake.length - 1][1] + 1 } : c.prevTail,
    grew: !!c.grew, food: c.food ? { x: c.food[0], y: c.food[1] } : null, mushroom: null,
    score: c.score ?? 12, stepMs: 132, tick: c.tick ?? 40, progress: c.progress ?? 1,
    alive: c.alive !== false, paused: !!c.paused, waiting: c.waiting || null, death: c.death || null,
    lives: c.lives ?? 3, maxLives: 5, universe: { id: 'abyss', rules: 'box', mushrooms: false, index: 7, holdLeft: 0 },
    space: { kind: 'box' }, body: null, foodAt: null, seed: 1,
  });
}
const CASES = {
  moving: { snake: [[8, 10], [8, 11], [9, 11], [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [11, 7], [12, 7], [12, 8], [12, 9]], dir: 'up', food: [4, 3], prevTail: { x: 12, y: 10 } },
  broken: { snake: [[6, 9], [6, 10], [6, 11], [7, 11], [12, 4], [12, 5], [13, 5], [2, 13], [3, 13], [4, 13], [4, 14]], breaks: [3, 6], length: 19, dir: 'up', food: [9, 3], prevTail: null },
  respawn: { snake: [[8, 8], [8, 9], [8, 10]], dir: 'up', food: [8, 3], prevTail: null, paused: true, waiting: 'respawn', tick: 57, progress: 0, lives: 2 },
  dead: { snake: [[5, 6], [5, 7], [6, 7], [7, 7], [7, 6], [7, 5], [6, 5], [6, 6]], dir: 'right', food: [11, 12], alive: false, death: { reason: 'self', cell: { x: 6, y: 6 } }, lives: 0 },
  bite: { snake: [[10, 6], [10, 7], [10, 8], [9, 8], [8, 8]], dir: 'up', food: [3, 12], grew: true, bite: { x: 10, y: 6 }, biteAge: 250 },
};

// ---------------- live state ----------------
const S = {
  look: ['2d', 'board', 'pov'].includes(q.get('look')) ? q.get('look') : '2d',
  kase: CASES[q.get('case')] ? q.get('case') : 'moving', size: SIZES[q.get('size')] ? q.get('size') : 'land',
  chaos: q.has('chaos') ? +q.get('chaos') : null, rm: q.has('rm'), rf: q.has('rf'), time: 0, variant: 2,
  biteAt: -Infinity, bite: null, hide: false,
};
// "moving" walks a Hamiltonian cycle so it never dies; the other cases are frozen snapshots.
const PATH = [];
for (let y = 0; y < ROWS; y++) PATH.push([0, y]);
for (let r = ROWS - 1; r >= 1; r--) { if (r % 2) for (let x = 1; x < COLS; x++) PATH.push([x, r]); else for (let x = COLS - 1; x >= 1; x--) PATH.push([x, r]); }
for (let x = COLS - 1; x >= 1; x--) PATH.push([x, 0]);
const N = PATH.length, mod = (a, n) => ((a % n) + n) % n;
const M = { idx: 30, len: 12, food: 60, acc: 0, tick: 0, score: 6 };
function liveSnap() {
  if (S.kase !== 'moving') return snapOf(CASES[S.kase]);
  const s = []; for (let i = 0; i < M.len; i++) s.push(PATH[mod(M.idx - i, N)]);
  const d = [s[0][0] - s[1][0], s[0][1] - s[1][1]];
  const dir = d[0] > 0 ? 'right' : d[0] < 0 ? 'left' : d[1] > 0 ? 'down' : 'up';
  return snapOf({ snake: s, dir, food: PATH[mod(M.food, N)], prevTail: { x: PATH[mod(M.idx - M.len, N)][0], y: PATH[mod(M.idx - M.len, N)][1] }, tick: M.tick, progress: Math.min(1, M.acc / 132), score: M.score });
}
function stepLive(dt) {
  if (S.kase !== 'moving') return;
  M.acc += dt;
  while (M.acc >= 132) {
    M.acc -= 132; M.idx = mod(M.idx + 1, N); M.tick++;
    if (mod(M.idx, N) === mod(M.food, N)) { M.len = Math.min(120, M.len + 1); M.score++; S.variant++; S.bite = { x: PATH[M.idx][0], y: PATH[M.idx][1] }; S.biteAt = performance.now(); M.food = M.idx + 9 + (M.tick % 23); }
  }
}
function makeFx(now, over = {}) {
  const beatPh = (now / (60000 / 112)) % 1, age = now - S.biteAt;
  const c = CASES[S.kase];
  const fx = {
    now, time: S.time, beat: Math.exp(-beatPh * 5) * 0.15, beatIndex: Math.floor(now / (60000 / 112)),
    chaos: S.chaos ?? Math.min(1, M.score / 25), punch: S.rf ? 0 : Math.max(0, 1 - age / 300), variant: S.variant,
    bite: S.bite, biteAge: S.bite ? age : Infinity, cutAge: 1e6, reducedFlash: S.rf, reducedMotion: S.rm,
    lives: 3, universe: 'abyss', look: S.look === '2d' ? '2d' : S.look === 'pov' ? 'pov' : '3d', calm: true, rules: 'box',
  };
  if (S.kase !== 'moving' && c.bite) Object.assign(fx, { bite: c.bite, biteAge: c.biteAge, punch: 0.5 });
  return Object.assign(fx, over);
}
const layout = (w, h) => {
  const cell = Math.floor(Math.min((0.94 * w) / COLS, (0.8 * h) / ROWS)), bw = cell * COLS, bh = cell * ROWS;
  return { w, h, cell, bx: Math.round((w - bw) / 2), by: Math.round((h - bh) * 0.6), bw, bh, cols: COLS, rows: ROWS };
};

// ---------------- canvases ----------------
const c2 = $('c2'), glc = $('gl'), lv = $('lives'), stage = $('stage');
let renderer = null, dpr = 1, L = null;
function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  const [w, h] = SIZES[S.size];
  for (const c of [c2, glc]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
  c2.width = Math.round(w * dpr); c2.height = Math.round(h * dpr);
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  stage.style.transform = `scale(${Math.min(1, (innerWidth - 16) / w, (innerHeight - 16) / h)})`;
  if (renderer) renderer.resize(w, h, dpr);
  L = layout(w, h);
  lv.width = 5 * 26 * dpr; lv.height = 26 * dpr; lv.style.width = 5 * 26 + 'px'; lv.style.height = '26px';
}
addEventListener('resize', resize);

function draw(now = performance.now()) {
  const snap = liveSnap(), fx = makeFx(now), gl = S.look !== '2d';
  c2.style.display = gl && renderer ? 'none' : 'block';
  glc.style.display = gl && renderer ? 'block' : 'none';
  try {
    if (gl && renderer) renderer.render('abyss', S.look, snap, fx);
    else {
      const g = c2.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      flat.scenery(g, L, snap, fx); flat.board(g, L, snap, fx);
    }
    const lg = lv.getContext('2d');
    lg.setTransform(dpr, 0, 0, dpr, 0, 0); lg.clearRect(0, 0, 130, 26);
    for (let i = 0; i < 5; i++) (gl ? roomMod : flat).life(lg, i * 26 + 2, 2, 22, i < snap.lives, fx);
  } catch (e) { errors.push(String(e && e.stack || e)); }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(100, now - last); last = now;
  S.time += (dt / 1000) * (S.rm ? 0.15 : 1);
  stepLive(dt); draw(now);
  requestAnimationFrame(loop);
}
// Draw `frames` frames of `dtMs` each, synchronously (for a hidden, throttled pane).
function run(frames = 1, dtMs = 16) {
  for (let i = 0; i < frames; i++) { S.time += (dtMs / 1000) * (S.rm ? 0.15 : 1); stepLive(dtMs); }
  draw(); return status();
}

// ---------------- cell check ----------------
// 2D: every cell centre is compared with an empty cell's colour; occupied cells must differ by > 60
// (sum of |ΔRGB|), empty cells must not. Runs board() alone on an offscreen canvas.
function check2d(name, snap, fx, size) {
  const [w, h] = SIZES[size], c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), LL = layout(w, h);
  flat.scenery(g, LL, snap, fx);             // must not throw
  g.clearRect(0, 0, w, h);
  flat.board(g, LL, snap, fx);
  const data = g.getImageData(0, 0, w, h).data;
  const occ = new Set(snap.snake.map((p) => p.x + ',' + p.y)); if (snap.food) occ.add(snap.food.x + ',' + snap.food.y);
  const px = (x, y) => { const i = ((LL.by + Math.floor((y + 0.5) * LL.cell)) * w + LL.bx + Math.floor((x + 0.5) * LL.cell)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  let ref = null;
  for (let y = 0; y < ROWS && !ref; y++) for (let x = 0; x < COLS && !ref; x++) if (!occ.has(x + ',' + y)) ref = px(x, y);
  const bad = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const p = px(x, y), diff = Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
    if ((diff > 60) !== occ.has(x + ',' + y)) bad.push(`${x},${y}(${p.join(',')})`);
  }
  return { name, tested: 256, bad };
}
// Room: project each cell centre (at the height of what should be there) and classify the 3×3 pixel
// average. Calm runs (chaos 0) test identity: pearl / shell / empty; wild runs (chaos 1, beat at the
// cap, variant 3) test that nothing covers an empty cell and that snake and pearl stay lit.
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const CLS = {
  dot: (r, g, b) => r > 150 && g > 120 && b < 0.95 * r,
  snake: (r, g, b) => lum(r, g, b) > 70 && b > r * 1.05,
  empty: (r, g, b) => lum(r, g, b) < 45,
};
function classify(r, g, b, wild) {
  if (wild) return CLS.empty(r, g, b) ? 'empty' : lum(r, g, b) > 70 ? 'lit' : `?(${r | 0},${g | 0},${b | 0})`;
  if (CLS.dot(r, g, b)) return 'dot';
  if (CLS.snake(r, g, b)) return 'snake';
  if (CLS.empty(r, g, b)) return 'empty';
  return `?(${r | 0},${g | 0},${b | 0})`;
}
function checkGl(name, snap, fx, view, wild) {
  renderer.render('abyss', view, snap, fx);
  renderer.render('abyss', view, snap, fx);
  const gl = renderer.debug.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const sk = (p) => p.x + p.y * COLS, snakeSet = new Set(snap.snake.map(sk)), head = snap.snake[0], hk = sk(head);
  const dv = DIRV[snap.dir], bad = [];
  let tested = 0, skipped = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + y * COLS;
    if (view === 'pov') {
      // first person: the near field ahead of the head (forward 1..6, lateral up to 3)
      const fwd = (x - head.x) * dv[0] + (y - head.y) * dv[1], lat = Math.abs((x - head.x) * dv[1] - (y - head.y) * dv[0]);
      if (k === hk || fwd < 1 || fwd > 6 || lat > 3) continue;
      // a raised shell or the pearl one cell nearer hides this cell's floor from a low camera
      const nx = x - dv[0], ny = y - dv[1], nk = nx + ny * COLS;
      if (!snakeSet.has(k) && !(snap.food && snap.food.x === x && snap.food.y === y) && (snakeSet.has(nk) || (snap.food && snap.food.x === nx && snap.food.y === ny))) continue;
    }
    let exp = snakeSet.has(k) ? 'snake' : snap.food && snap.food.x === x && snap.food.y === y ? 'dot' : 'empty';
    const hgt = (exp === 'snake' ? (k === hk ? 0.3 : 0.26) : exp === 'dot' ? 0.18 : 0) * (view === 'pov' ? 0.55 : 1);   // pov: below the apex silhouette
    if (wild && exp !== 'empty') exp = 'lit';
    if (!snap.alive && exp === 'snake') exp = wild ? 'lit' : 'dead';
    const [wx, wz] = renderer.debug.cellToWorld(x, y), p = renderer.debug.project(wx, hgt, wz);
    if (!p.visible) { skipped++; continue; }
    const sx = Math.round(p.x), sy = H - 1 - Math.round(p.y);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((sy + dy) * W + (sx + dx)) * 4;
      if (i < 0 || i >= px.length) continue;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    r /= n; g /= n; b /= n;
    let got = classify(r, g, b, wild);
    if (exp === 'dead') got = !CLS.empty(r, g, b) && lum(r, g, b) > 40 ? 'dead' : got;   // grey shells: lit, not blue
    tested++;
    if (got !== exp) bad.push(`${x},${y} want ${exp} got ${got}`);
  }
  return { name, tested, skipped, bad };
}
function checkAll() {
  const res = [], t0 = performance.now(), e0 = errors.length;
  const keepSize = S.size;
  for (const size of Object.keys(SIZES)) {
    S.size = size; resize();
    for (const [cn, c] of Object.entries(CASES)) {
      const snap = snapOf(c);
      for (const wild of [false, true]) {
        const fx = {
          now: performance.now(), time: wild ? 7.3 : 2, beat: wild ? 0.15 : 0, beatIndex: 5, chaos: wild ? 1 : 0, punch: c.bite ? 0.5 : 0,
          variant: wild ? 3 : 0, bite: c.bite || null, biteAge: c.bite ? c.biteAge : Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: !wild,
          lives: snap.lives, universe: 'abyss', look: '2d', calm: true, rules: 'box',
        };
        const tag = `${size} ${cn} ${wild ? 'chaos1' : 'chaos0'}`;
        try { res.push(check2d(`2d    ${tag}`, snap, fx, size)); } catch (e) { res.push({ name: `2d ${tag}`, tested: 0, bad: ['threw ' + e.message] }); }
        if (!renderer) continue;
        for (const view of ['board', 'pov']) {
          try { res.push(checkGl(`${view.padEnd(5)} ${tag}`, snap, { ...fx, look: view === 'pov' ? 'pov' : '3d' }, view, wild)); } catch (e) { res.push({ name: `${view} ${tag}`, tested: 0, bad: ['threw ' + e.message] }); }
        }
      }
    }
  }
  // life icons, both modules, both states
  const lc = document.createElement('canvas').getContext('2d');
  for (const m of [flat, roomMod]) for (const f of [true, false]) for (const ch of [0, 1]) m.life(lc, 0, 0, 22, f, { chaos: ch, time: 1 });
  S.size = keepSize; resize(); draw();
  const problems = res.reduce((a, r) => a + r.bad.length + (r.tested ? 0 : 1), 0) + (errors.length - e0);
  const text = `cell check: ${res.length} runs, ${problems} problems, renderer ${renderer ? 'yes' : 'NO'}, ${(performance.now() - t0).toFixed(0)} ms, errors ${errors.length - e0}\n` +
    res.map((r) => `${r.bad.length || !r.tested ? 'FAIL' : 'ok  '} ${r.name} ${r.tested}${r.skipped ? '/' + r.skipped + ' off' : ''}${r.bad.length ? '  ' + r.bad.slice(0, 4).join(' | ') : ''}`).join('\n');
  $('out').textContent = text;
  return { problems, runs: res.length, errors: errors.slice(e0), text };
}

// ---------------- UI ----------------
function status() {
  const s = `${S.look} ${S.kase} ${S.size} chaos ${S.chaos ?? 'auto'} ${S.rm ? 'rm ' : ''}${S.rf ? 'rf ' : ''}| renderer ${renderer ? Object.keys(renderer.rooms).join(',') : 'none'} | errors ${errors.length}`;
  document.querySelectorAll('[data-look]').forEach((b) => b.classList.toggle('on', b.dataset.look === S.look));
  document.querySelectorAll('[data-case]').forEach((b) => b.classList.toggle('on', b.dataset.case === S.kase));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === S.size));
  $('chaos').textContent = `chaos ${S.chaos ?? 'auto'} [C]`;
  $('rm').classList.toggle('on', S.rm); $('rf').classList.toggle('on', S.rf);
  return s;
}
function set(o = {}) {
  if (o.look) S.look = o.look; if (o.case) S.kase = o.case; if ('chaos' in o) S.chaos = o.chaos;
  if ('rm' in o) S.rm = o.rm; if ('rf' in o) S.rf = o.rf;
  if (o.size && o.size !== S.size) { S.size = o.size; resize(); }
  draw(); return status();
}
document.querySelectorAll('[data-look]').forEach((b) => (b.onclick = () => set({ look: b.dataset.look })));
document.querySelectorAll('[data-case]').forEach((b) => (b.onclick = () => set({ case: b.dataset.case })));
document.querySelectorAll('[data-size]').forEach((b) => (b.onclick = () => set({ size: b.dataset.size })));
const CH = [null, 0, 0.5, 1];
$('chaos').onclick = () => set({ chaos: CH[(CH.indexOf(S.chaos) + 1) % CH.length] });
$('rm').onclick = () => set({ rm: !S.rm }); $('rf').onclick = () => set({ rf: !S.rf });
const biteNow = () => { M.food = M.idx + 1; };
$('bitebtn').onclick = biteNow; $('check').onclick = () => checkAll();
$('hide').onclick = () => { S.hide = !S.hide; $('ui').style.opacity = S.hide ? 0.1 : 1; };
addEventListener('keydown', (e) => {
  if (e.key === '1') set({ look: '2d' }); if (e.key === '2') set({ look: 'board' }); if (e.key === '3') set({ look: 'pov' });
  if (e.code === 'KeyB') biteNow(); if (e.code === 'KeyX') checkAll(); if (e.code === 'KeyC') $('chaos').onclick(); if (e.code === 'KeyH') $('hide').onclick();
});

resize();
renderer = await createRoomRenderer(glc, { cols: COLS, rows: ROWS, roomIds: ['abyss'] }).catch((e) => { errors.push('renderer: ' + e.message); return null; });
resize(); status(); draw();
requestAnimationFrame(loop);
window.__ab = { S, CASES, run, draw, set, checkAll, errors, get renderer() { return renderer; }, status };
