// mushroom harness (levels wave 1): fakes snapshots (LEVELS_PLAN §3.3) and fx (BUILD_PLAN §15.3) to show MUSHROOM LAND
// in its flat look and both room views, with the life mushroom. Renders on demand: __mush.render() draws one frame,
// __mush.check() runs the cell check for both looks over every case, size and chaos level and returns a summary.
import * as flat from '../src/render/timelines/mushroom.js';
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16, N = COLS * ROWS;
const SIZES = { fit: null, land: [1280, 720], port: [390, 844] };
const CASES = ['moving', 'broken', 'respawn', 'dead'];
const mod = (a, n) => ((a % n) + n) % n;
const P = (x, y) => ({ x, y });
const key = (c) => c.x + ',' + c.y;
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
const cerr = console.error.bind(console);
console.error = (...a) => { errors.push(a.join(' ')); cerr(...a); };

// Hamiltonian cycle so the moving snake never dies.
const PATH = [];
for (let y = 0; y < ROWS; y++) PATH.push([0, y]);
for (let r = ROWS - 1; r >= 1; r--) {
  if (r % 2) for (let x = 1; x < COLS; x++) PATH.push([x, r]);
  else for (let x = COLS - 1; x >= 1; x--) PATH.push([x, r]);
}
for (let x = COLS - 1; x >= 1; x--) PATH.push([x, 0]);
const at = (k) => { const p = PATH[mod(k, N)]; return P(p[0], p[1]); };

const qs = new URLSearchParams(location.search);
const S = {
  look: ['2d', '3d', 'pov'].includes(qs.get('look')) ? qs.get('look') : '2d', kase: CASES.includes(qs.get('case')) ? qs.get('case') : 'moving',
  size: SIZES[qs.get('size')] !== undefined ? qs.get('size') : 'fit', mush: !qs.has('nomush'), chaos: qs.has('chaos') ? +qs.get('chaos') : 0,
  idx: 40, len: 14, tick: 100, acc: 0, stepMs: 150, run: false, rf: false, rm: false, variant: 0, time: 0,
  food: P(12, 5), mushroom: P(4, 9), mushBorn: 100, biteAt: -Infinity, bite: null, last: performance.now(),
};
const dirOf = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up'; };
const movingCells = (idx = S.idx, len = S.len) => { const o = []; for (let k = 0; k < len; k++) o.push(at(idx - k)); return o; };
function freeCell(occ, avoid, minD = 0) {
  for (let t = 0; t < 400; t++) {
    const c = P(Math.floor(Math.random() * COLS), Math.floor(Math.random() * ROWS));
    if (!occ.has(key(c)) && (!avoid || Math.abs(c.x - avoid.x) + Math.abs(c.y - avoid.y) >= minD)) return c;
  }
  return null;
}
function stepMoving() {
  S.idx = mod(S.idx + 1, N); S.tick++;
  const s = movingCells(), h = s[0], occ = new Set(s.map(key));
  if (S.food && key(S.food) === key(h)) { biteAt(h); S.len = Math.min(60, S.len + 1); occ.add(key(h)); S.food = freeCell(occ); }
  if (S.mushroom && key(S.mushroom) === key(h)) { biteAt(h); S.mushroom = null; S.mushBorn = S.tick; }
  if (S.mushroom && S.tick - S.mushBorn >= 80) { S.mushroom = null; S.mushBorn = S.tick; }
  if (S.mush && !S.mushroom && S.tick - S.mushBorn >= 16) { occ.add(key(S.food)); S.mushroom = freeCell(occ, h, 4); S.mushBorn = S.tick; }
}
function biteAt(c) { S.bite = { x: c.x, y: c.y }; S.biteAt = performance.now(); S.variant++; }

const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const base = (o) => ({
  cols: COLS, rows: ROWS, breaks: [], prevTail: null, grew: false, food: null, mushroom: null, score: 12, stepMs: 150, tick: 100, progress: 1,
  alive: true, paused: false, waiting: null, death: null, lives: 3, maxLives: 5, universe: { id: 'mushroom', rules: 'box', mushrooms: true, index: 6, holdLeft: 3 },
  space: { kind: 'box' }, body: null, foodAt: null, seed: 1, ...o,
});
// Builds the snapshot for a case. `mush` false removes the mushroom; `live` uses the running state for 'moving'.
function snapOf(kase, mush, live = true) {
  let o;
  if (kase === 'moving' || kase === 'dead') {
    const s = live ? movingCells() : movingCells(40, 14), prevTail = at((live ? S.idx : 40) - (live ? S.len : 14));
    const dir = dirOf(s[0], s[1]), food = live ? S.food : P(12, 5), m = live ? S.mushroom : P(4, 9);
    o = { snake: s, length: s.length, dir, prevDir: dir, heading: dir, prevTail, food, mushroom: m, tick: live ? S.tick : 100, progress: live ? Math.min(1, S.acc / S.stepMs) : 1 };
    if (live) o.mushroom = m && S.mush ? { ...m, ...(S.mushTtl ? { ttl: S.mushTtl } : {}) } : null;
    if (kase === 'dead') {
      const h = s[0], d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
      Object.assign(o, { alive: false, progress: 1, death: { reason: 'wall', cell: P(h.x + d[0], h.y + d[1]) }, lives: 0 });
    }
  } else if (kase === 'broken') {
    // three visible pieces; (5,3)-(5,4) are neighbours on the board but NOT joined (break at 2)
    const s = [P(3, 3), P(4, 3), P(5, 3), P(5, 4), P(5, 5), P(6, 5), P(7, 5), P(11, 10), P(11, 11), P(12, 11)];
    o = { snake: s, length: 31, breaks: [2, 6], dir: 'left', prevDir: 'left', heading: 'left', prevTail: null, food: P(13, 3), mushroom: P(8, 12), tick: 300, progress: 1 };
  } else {
    const s = [P(8, 9), P(8, 10), P(8, 11)];
    o = { snake: s, length: 3, dir: 'up', prevDir: 'up', heading: 'up', prevTail: null, food: P(3, 4), mushroom: P(12, 4), tick: 0, progress: 0, paused: true, waiting: 'respawn', lives: 2 };
  }
  if (!mush) o.mushroom = null;
  return deepFreeze(base(o));
}
const BEAT_MS = 60000 / 132, T0 = performance.now();
function fxOf(now, over = {}) {
  const ph = (now - T0) / BEAT_MS, biteAge = now - S.biteAt;
  return Object.assign({
    now, time: S.time, beat: Math.exp(-(ph % 1) * 5) * (S.rf ? 0.15 : 1), beatIndex: Math.floor(ph), chaos: S.chaos,
    punch: S.rf ? 0 : Math.max(0, 1 - biteAge / 300), variant: S.variant, bite: S.bite, biteAge: S.bite ? biteAge : Infinity, cutAge: 1e6,
    reducedFlash: S.rf, reducedMotion: S.rm, lives: 3, universe: 'mushroom', look: S.look, calm: false, rules: 'box',
  }, over);
}
function layout(w, h) {
  const cell = Math.floor(Math.min((0.94 * w) / COLS, (0.8 * h) / ROWS)), bw = cell * COLS, bh = cell * ROWS;
  return { w, h, cell, bx: Math.round((w - bw) / 2), by: Math.round((h - bh) * 0.6), bw, bh, cols: COLS, rows: ROWS };
}

// ── canvases
const cv = document.getElementById('cv'), ctx = cv.getContext('2d'), glc = document.getElementById('gl'), stage = document.getElementById('stage');
let renderer = null, W = 0, H = 0, dpr = 1;
function resize() {
  dpr = S.size === 'fit' ? Math.min(2, devicePixelRatio || 1) : 1;
  const f = SIZES[S.size]; W = f ? f[0] : innerWidth; H = f ? f[1] : innerHeight;
  for (const c of [cv, glc]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  stage.style.transform = `scale(${f ? Math.min(1, (innerWidth - 16) / W, (innerHeight - 16) / H) : 1})`;
  if (renderer) renderer.resize(W, H, dpr);
}
addEventListener('resize', () => { resize(); render(); });

// Draws one frame of the current state.
function render(now = performance.now()) {
  const snap = snapOf(S.kase, S.mush), fx = fxOf(now);
  const room = S.look !== '2d' && renderer;
  glc.style.display = room ? 'block' : 'none';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const L = layout(W, H);
  if (room) renderer.render('mushroom', S.look === 'pov' ? 'pov' : 'board', snap, fx);
  else { flat.scenery(ctx, L, snap, fx); flat.board(ctx, L, snap, fx); }
  // HUD lives strip with the universe icon (both files export life())
  for (let i = 0; i < 5; i++) flat.life(ctx, 12 + i * 30, H - 40, 26, i < snap.lives, fx);
  status(snap, fx);
}
function status(snap, fx) {
  const t = `${S.look} | ${S.kase} | ${W}x${H} | chaos ${fx.chaos} | mush ${snap.mushroom ? key(snap.mushroom) + ' fade ' + flat.mushroomFade(snap).toFixed(2) : '-'} | v${S.variant} | gl ${renderer ? 'yes' : 'no'}`;
  document.getElementById('out').textContent = t + (lastCheck ? '\n' + lastCheck : '');
}
function loop(now) {
  const dt = Math.min(100, now - S.last); S.last = now;
  S.time += (dt / 1000) * (S.rm ? 0.15 : 1);
  if (S.run && S.kase === 'moving') { S.acc += dt; while (S.acc >= S.stepMs) { S.acc -= S.stepMs; stepMoving(); } }
  render(now);
  if (S.run) requestAnimationFrame(loop);
}

// ── cell check, flat look: classify every cell centre against an empty cell; check joints across breaks
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function checkFlat(kase, size, chaos, mush, bite) {
  const [w, h] = size, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), L = layout(w, h), snap = snapOf(kase, mush, false);
  const fx = fxOf(performance.now(), { chaos, beat: 0, punch: bite ? 0.5 : 0, bite: bite ? snap.snake[0] : null, biteAge: bite ? 200 : Infinity, variant: 2 });
  flat.scenery(g, L, snap, fx); flat.board(g, L, snap, fx);
  const d = g.getImageData(0, 0, w, h).data;
  const px = (X, Y) => { const i = (Y * w + X) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const cen = (x, y) => px(L.bx + Math.floor((x + 0.5) * L.cell), L.by + Math.floor((y + 0.5) * L.cell));
  const occ = new Set(snap.snake.map(key)); if (snap.food) occ.add(key(snap.food)); if (snap.mushroom) occ.add(key(snap.mushroom));
  let ref = null;
  for (let y = 0; y < ROWS && !ref; y++) for (let x = 0; x < COLS && !ref; x++) if (!occ.has(x + ',' + y)) ref = cen(x, y);
  const diff = (p) => Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
  const bad = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((diff(cen(x, y)) > 60) !== occ.has(x + ',' + y)) bad.push(`${x},${y}`);
  // identity: the mushroom reads mint/gold, the dot magenta (they must never look alike)
  if (snap.mushroom) { const p = cen(snap.mushroom.x, snap.mushroom.y); if (!(p[1] >= p[0] * 0.75 && p[1] > p[2] * 0.8)) bad.push(`mush(${p})`); }
  if (snap.food) { const p = cen(snap.food.x, snap.food.y); if (!(p[2] > p[1] * 1.3 && p[0] > p[1] * 1.3)) bad.push(`dot(${p})`); }
  // joints: compare with a render where every pair is broken; the pixels on both sides of each shared edge must
  // change exactly where neighbours are joined (a bridge), and never across an index listed in breaks
  const all = [], br = new Set(snap.breaks || []);
  for (let i = 0; i + 1 < snap.snake.length; i++) all.push(i);
  const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
  const g2 = c2.getContext('2d'); flat.board(g2, L, deepFreeze({ ...snap, breaks: all }), fx);
  const d2 = g2.getImageData(0, 0, w, h).data;
  const changed = (X, Y) => { const i = (Y * w + X) * 4; return Math.abs(d[i] - d2[i]) + Math.abs(d[i + 1] - d2[i + 1]) + Math.abs(d[i + 2] - d2[i + 2]) > 30; };
  let joints = 0;
  for (let i = 0; i + 1 < snap.snake.length; i++) {
    const a = snap.snake[i], b = snap.snake[i + 1], dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
    const ex = L.bx + Math.max(a.x, b.x) * L.cell, ey = L.by + Math.max(a.y, b.y) * L.cell;
    const mx = L.bx + Math.floor((a.x + 0.5) * L.cell), my = L.by + Math.floor((a.y + 0.5) * L.cell);
    const bridged = dx ? changed(ex - 1, my) || changed(ex, my) : changed(mx, ey - 1) || changed(mx, ey), want = !br.has(i);
    joints++;
    if (bridged !== want) bad.push(`joint ${i}:${key(a)}-${key(b)} ${bridged ? 'bridged' : 'open'}`);
  }
  return { ok: !bad.length, line: `${bad.length ? 'FAIL' : 'ok  '} 2d ${kase.padEnd(7)} ${w}x${h} chaos ${chaos} ${mush ? 'mush' : '----'}${bite ? ' bite' : ''} joints ${joints}${bad.length ? ' bad: ' + bad.slice(0, 5).join(' ') : ''}` };
}

// ── cell check, room: project cell centres (at item height) and classify the rendered pixels
function classify(r, g, b) {
  const l = lumOf(r, g, b);
  if (r > 140 && b > 120 && g < 0.62 * Math.min(r, b)) return 'dot';
  if (l > 90 && g > r * 0.85 && (g > r || g > b * 1.15)) return 'mush';   // mint or gold band
  if (l > 80 && r > g * 1.1 && b < r) return 'snake';
  if (l < 75) return 'empty';
  return 'lit';
}
const POV = {   // first person heading up the board; tests only cells in view and not hidden behind items
  snap: { snake: [P(7, 12), P(7, 13), P(7, 14), P(7, 15), P(8, 15), P(9, 15)], dir: 'up', food: P(9, 4), mushroom: P(5, 6) },
  only: (() => { const o = [[9, 4], [5, 6]]; for (let y = 7; y <= 10; y++) for (let x = 4; x <= 10; x++) o.push([x, y]); return o.map(([x, y]) => x + ',' + y); })(),
};
function checkRoom(kase, size, chaos, mush, view) {
  if (!renderer) return { ok: false, line: 'FAIL room: no WebGL renderer' };
  const gl = renderer.debug.gl;
  renderer.resize(size[0], size[1], 1);
  let snap = snapOf(kase, mush, false);
  if (view === 'pov') snap = deepFreeze(base({ ...POV.snap, length: 6, prevTail: P(10, 15), progress: 1, tick: 120, mushroom: mush ? POV.snap.mushroom : null }));
  const wild = chaos >= 1;
  const fx = wild ? { now: performance.now(), time: 7.3, beat: 1, beatIndex: 5, chaos: 1, punch: 0, variant: 3, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: false }
    : { now: performance.now(), time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: true };
  renderer.render('mushroom', view, snap, fx); renderer.render('mushroom', view, snap, fx);
  const Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight, px = new Uint8Array(Wd * Hd * 4);
  gl.readPixels(0, 0, Wd, Hd, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const snakeSet = new Set(snap.snake.map(key)), head = key(snap.snake[0]);
  const only = view === 'pov' ? new Set(POV.only) : null;
  const bad = []; let tested = 0, skipped = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + ',' + y;
    if (only && !only.has(k)) continue;
    if (view === 'pov' && k === head) continue;
    const isM = snap.mushroom && key(snap.mushroom) === k, isD = snap.food && key(snap.food) === k;
    let exp = snakeSet.has(k) ? 'snake' : isD ? 'dot' : isM ? 'mush' : 'empty';
    const hgt = exp === 'snake' ? 0.21 : exp === 'dot' ? 0.17 : exp === 'mush' ? (view === 'pov' ? 0.45 : 0.19) : 0;
    if (exp === 'snake' && (wild || snap.alive === false)) exp = 'lit';
    const [wx, wz] = renderer.debug.cellToWorld(x, y), p = renderer.debug.project(wx, hgt, wz);
    if (!p.visible) { skipped++; continue; }
    const sx = Math.round(p.x), sy = Hd - 1 - Math.round(p.y);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((sy + dy) * Wd + (sx + dx)) * 4;
      if (i < 0 || i >= px.length) continue;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    let got = classify(r / n, g / n, b / n);
    if (exp === 'lit' && got !== 'empty') got = 'lit';
    tested++;
    if (got !== exp) bad.push(`${k} want ${exp} got ${got}(${r / n | 0},${g / n | 0},${b / n | 0})`);
  }
  return { ok: !bad.length, line: `${bad.length ? 'FAIL' : 'ok  '} ${view === 'pov' ? 'pov' : '3d '} ${kase.padEnd(7)} ${size.join('x')} chaos ${chaos} ${mush ? 'mush' : '----'} ${tested} cells${skipped ? ' (' + skipped + ' off)' : ''}${bad.length ? ' bad: ' + bad.slice(0, 4).join(' | ') : ''}` };
}

let lastCheck = '';
function check() {
  const lines = []; let runs = 0, fails = 0;
  const add = (r) => { runs++; if (!r.ok) fails++; lines.push(r.line); };
  const e0 = errors.length;
  for (const size of [SIZES.land, SIZES.port]) for (const kase of CASES) for (const chaos of [0, 1]) for (const mush of [true, false]) {
    add(checkFlat(kase, size, chaos, mush, false));
    add(checkRoom(kase, size, chaos, mush, 'board'));
  }
  for (const size of [SIZES.land, SIZES.port]) for (const chaos of [0, 1]) for (const mush of [true, false]) add(checkRoom('moving', size, chaos, mush, 'pov'));
  for (const kase of CASES) add(checkFlat(kase, SIZES.land, 0.5, true, true));
  // life icons and a bite render in every look must not throw
  try { const c = document.createElement('canvas').getContext('2d'); flat.life(c, 0, 0, 24, true, {}); flat.life(c, 0, 0, 24, false, { chaos: 1 }); } catch (e) { errors.push('life: ' + e.message); }
  resize();
  const newErr = errors.slice(e0);
  lastCheck = `cells: ${runs - fails}/${runs} pass, console errors ${newErr.length}${newErr.length ? ': ' + newErr.slice(0, 3).join(' / ') : ''}\n` + lines.join('\n');
  console.log(lastCheck);
  render();
  return { runs, fails, errors: newErr, text: lastCheck };
}

// ── UI
const $ = (id) => document.getElementById(id);
$('looks').innerHTML = ['2d', '3d', 'pov'].map((l, i) => `<button data-look="${l}">${l} [${i + 1}]</button>`).join('');
$('cases').innerHTML = CASES.map((c, i) => `<button data-case="${c}">${c} [${i + 4}]</button>`).join('');
$('sizes').innerHTML = Object.keys(SIZES).map((k, i) => `<button data-size="${k}">${k} [${(i + 8) % 10}]</button>`).join('');
const setLook = (l) => { S.look = l; sync(); render(); };
const setCase = (c) => { S.kase = c; sync(); render(); };
const setSize = (k) => { S.size = k; resize(); sync(); render(); };
$('looks').onclick = (e) => e.target.dataset.look && setLook(e.target.dataset.look);
$('cases').onclick = (e) => e.target.dataset.case && setCase(e.target.dataset.case);
$('sizes').onclick = (e) => e.target.dataset.size && setSize(e.target.dataset.size);
const act = {
  mush: () => (S.mush = !S.mush), bite: () => biteAt(snapOf(S.kase, S.mush).snake[0]), chaos: () => (S.chaos = S.chaos >= 1 ? 0 : +(S.chaos + 0.5).toFixed(1)),
  run: () => { S.run = !S.run; S.last = performance.now(); if (S.run) requestAnimationFrame(loop); }, step: () => { if (S.kase === 'moving') stepMoving(); },
  rf: () => (S.rf = !S.rf), rm: () => (S.rm = !S.rm), variant: () => S.variant++, check, hide: () => ($('ui').style.opacity = $('ui').style.opacity === '0.12' ? 1 : 0.12),
};
for (const k of Object.keys(act)) $(k).onclick = () => { act[k](); sync(); render(); };
const KEYS = { KeyU: 'mush', KeyB: 'bite', KeyC: 'chaos', Space: 'run', KeyS: 'step', KeyV: 'variant', KeyX: 'check', KeyH: 'hide' };
addEventListener('keydown', (e) => {
  if (KEYS[e.code]) { e.preventDefault(); act[KEYS[e.code]](); sync(); render(); }
  const n = +e.key;
  if (n >= 1 && n <= 3) setLook(['2d', '3d', 'pov'][n - 1]);
  if (n >= 4 && n <= 7) setCase(CASES[n - 4]);
  if (e.key === '8' || e.key === '9' || e.key === '0') setSize(Object.keys(SIZES)[{ 8: 0, 9: 1, 0: 2 }[e.key]]);
});
function sync() {
  document.querySelectorAll('[data-look]').forEach((b) => b.classList.toggle('on', b.dataset.look === S.look));
  document.querySelectorAll('[data-case]').forEach((b) => b.classList.toggle('on', b.dataset.case === S.kase));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === S.size));
  for (const k of ['mush', 'run', 'rf', 'rm']) $(k).classList.toggle('on', !!S[k]);
  $('chaos').textContent = `chaos ${S.chaos} [C]`;
}

// Advance the fake clock without animation frames (the Browser pane may be hidden): __mush.advance(ms)
function advance(ms, frames = 1) {
  for (let i = 0; i < frames; i++) {
    S.time += ms / frames / 1000;
    if (S.kase === 'moving') { S.acc += ms / frames; while (S.acc >= S.stepMs) { S.acc -= S.stepMs; stepMoving(); } }
  }
  render(T0 + S.time * 1000);
}

window.__mush = { S, render, check, checkFlat, checkRoom, setLook, setCase, setSize, advance, snapOf, errors, get renderer() { return renderer; } };
resize(); sync(); render();
createRoomRenderer(glc, { cols: COLS, rows: ROWS, roomIds: ['mushroom'] }).then((r) => {
  renderer = r;
  if (r) { resize(); window.__mush.rooms = Object.keys(r.rooms); }
  render();
  if (qs.has('check')) check();
}).catch((e) => { errors.push('renderer: ' + e.message); render(); });
