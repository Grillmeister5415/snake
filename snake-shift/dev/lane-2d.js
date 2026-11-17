// lane-2d harness: the flat timeline `lane` with faked lane snapshots (LEVELS_PLAN 3.3 / 3.4) and fx.
// Renders on demand (the hidden preview pane throttles rAF).
// URL: ?case=live|up|upFar|down|broken|one|three|respawn|dead|edges  ?size=fit|land|port  ?chaos=0.6 ?rf ?rm ?pause
// Console: __l2.check() cell check (every case × fx set × landscape/portrait, hinge checks across breaks,
//          scroll smoothness, cells fixed while scrolling, life icon); __l2.frames(n, dt) steps frames by hand.
import * as flat from '../src/render/timelines/lane.js';

const COLS = 16, ROWS = 16, STEP = 140;
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const key = (c) => c.x + c.y * COLS;
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
};
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

// ---------------- fake lane simulation (absolute cells, window follows the head) ----------------
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const follow = (y0, hy) => (hy - y0 < 5 ? hy - 5 : hy - y0 > 10 ? hy - 10 : y0);
function spawnDot(st) {
  for (let k = 0; k < 50; k++) {
    const c = { x: (rand() * COLS) | 0, y: st.y0 - 2 - ((rand() * 7) | 0) };
    if (!st.body.some((b) => b.x === c.x && b.y === c.y)) return c;
  }
  return { x: 3, y: st.y0 - 4 };
}
function initState() {
  seed = 7;
  const body = []; for (let i = 0; i < 6; i++) body.push({ x: 8, y: 12 + i });
  const st = { t: 0, body, dir: 'up', y0: 0, prevY0: 0, prevTail: { x: 8, y: 18 }, grew: false, score: 0, phase: 'up', phaseT: 0, plan: [] };
  st.food = { x: 5, y: -6 };
  return st;
}
function nextDir(st) {
  if (st.plan.length) return st.plan.shift();
  const h = st.body[0];
  if (st.phase === 'up' && st.phaseT > 64) { st.phase = 'down'; st.phaseT = 0; const s = h.x < 8 ? 'right' : 'left'; st.plan = [s, s, 'down']; return st.plan.shift(); }
  if (st.phase === 'down' && st.phaseT > 26) { st.phase = 'up'; st.phaseT = 0; const s = h.x < 8 ? 'right' : 'left'; st.plan = [s, s, 'up']; return st.plan.shift(); }
  if (st.phase === 'up' && st.food && st.food.y < h.y && st.food.x !== h.x && h.y - st.food.y <= Math.abs(h.x - st.food.x) + 1) return st.food.x < h.x ? 'left' : 'right';
  return st.phase;
}
function stepState(st) {
  const dir = nextDir(st), h = st.body[0];
  const n = { x: Math.max(0, Math.min(COLS - 1, h.x + DIRS[dir][0])), y: h.y + DIRS[dir][1] };
  const grow = !!(st.food && n.x === st.food.x && n.y === st.food.y);
  st.prevTail = { ...st.body[st.body.length - 1] };
  st.body.unshift(n);
  if (!grow) st.body.pop();
  st.grew = grow; st.dir = dir; st.t++; st.phaseT++;
  st.prevY0 = st.y0; st.y0 = follow(st.y0, n.y);
  if (grow) { st.score++; st.food = spawnDot(st); bite = { x: n.x, y: n.y - st.y0 }; biteAt = clock; variant++; }
}
// Convert an absolute lane state to the board-local snapshot of LEVELS_PLAN 3.3.
function laneSnap(st, over = {}) {
  const inWin = (c) => c.y >= st.y0 && c.y < st.y0 + ROWS && c.x >= 0 && c.x < COLS;
  const snake = [], breaks = [];
  let lastIdx = -2;
  st.body.forEach((c, i) => {
    if (!inWin(c)) return;
    if (snake.length && lastIdx !== i - 1) breaks.push(snake.length - 1);
    snake.push({ x: c.x, y: c.y - st.y0 }); lastIdx = i;
  });
  const local = (c) => (c && inWin(c) ? { x: c.x, y: c.y - st.y0 } : null);
  return deepFreeze({
    cols: COLS, rows: ROWS, snake, breaks, length: st.body.length, dir: st.dir, prevDir: st.dir, heading: st.dir,
    prevTail: local(st.prevTail), grew: st.grew, food: local(st.food), mushroom: null, score: st.score, stepMs: STEP,
    tick: st.t, progress: 1, alive: true, paused: false, waiting: null, death: null, lives: 3, maxLives: 5,
    universe: { id: 'lane', rules: 'lane', mushrooms: false, index: 5, holdLeft: 3 },
    space: { kind: 'lane', y0: st.y0, prevY0: st.prevY0 }, body: st.body.map((c) => ({ ...c })),
    foodAt: st.food && { ...st.food }, seed: 7, ...over,
  });
}
// Static snapshots: real sim states found by scanning, plus synthetic board-local ones.
function simUntil(pred, max = 400) { const st = initState(); for (let i = 0; i < max && !pred(st); i++) stepState(st); return st; }
function localSnap(cells, o = {}) {
  const snake = cells.map(([x, y]) => ({ x, y }));
  return deepFreeze({
    cols: COLS, rows: ROWS, snake, breaks: o.breaks || [], length: o.length ?? snake.length, dir: o.dir || 'up',
    prevDir: o.dir || 'up', heading: o.dir || 'up', prevTail: o.prevTail ?? null, grew: false, food: o.food || null,
    mushroom: null, score: 9, stepMs: STEP, tick: 50, progress: o.progress ?? 0.4, alive: o.alive !== false,
    paused: !!o.paused, waiting: o.waiting || null, death: o.death || null, lives: o.lives ?? 3, maxLives: 5,
    universe: { id: 'lane', rules: 'lane', mushrooms: false, index: 5, holdLeft: 2 },
    space: { kind: 'lane', y0: o.y0 ?? -40, prevY0: o.prevY0 ?? -39 }, body: null, foodAt: null, seed: 7,
  });
}
const BROKEN = [[5, 5], [5, 6], [5, 7], [9, 7], [9, 8], [9, 9], [10, 9], [11, 9], [12, 9], [12, 10], [12, 11], [2, 12], [3, 12]];
const EDGE = (() => { const s = []; for (let y = 0; y < 16; y++) s.push([0, y]); for (let x = 1; x < 16; x++) s.push([x, 15]); for (let y = 14; y >= 0; y--) s.push([15, y]); return s.reverse(); })();
let bite = null, biteAt = -Infinity, variant = 0, clock = 0, animTime = 0;
const CASES = {};
function buildCases() {
  const keep = { bite, biteAt, variant };
  CASES.up = laneSnap(simUntil((s) => s.t > 6 && s.phase === 'up' && s.food && s.food.y >= s.y0 && s.food.y < s.y0 + 6), { progress: 0.35 });
  CASES.upFar = laneSnap(simUntil((s) => s.t > 12 && s.phase === 'up' && s.food && s.food.y < s.y0), { progress: 0.7 });
  CASES.down = laneSnap(simUntil((s) => s.phase === 'down' && s.phaseT > 12), { progress: 0.5 });
  CASES.broken = localSnap(BROKEN, { breaks: [2, 7, 10], length: 20, food: { x: 13, y: 3 } });
  CASES.one = localSnap([[8, 15]], { dir: 'down', length: 9, progress: 0.8 });
  CASES.three = localSnap([[7, 0], [7, 1], [7, 2]], { dir: 'up', length: 12, food: { x: 2, y: 0 } });
  CASES.respawn = localSnap([[8, 7], [8, 8], [8, 9]], { waiting: 'respawn', paused: true, lives: 2, food: { x: 3, y: 11 }, progress: 0, prevY0: -40 });
  CASES.dead = localSnap([[0, 6], [1, 6], [2, 6], [2, 7], [2, 8], [3, 8]], { dir: 'left', alive: false, lives: 0, death: { reason: 'wall', cell: { x: -1, y: 6 } }, food: { x: 9, y: 4 } });
  CASES.edges = localSnap(EDGE, { dir: 'left', food: { x: 8, y: 8 } });
  ({ bite, biteAt, variant } = keep);
}
buildCases();

// ---------------- live state and fake fx ----------------
let caseId = q.get('case') in CASES || q.get('case') === 'live' ? q.get('case') : 'live';
let sizeId = ['fit', 'land', 'port'].includes(q.get('size')) ? q.get('size') : 'fit';
let paused = q.has('pause');
$('chaos').value = q.get('chaos') ?? '0';
$('rf').checked = q.has('rf');
$('rm').checked = q.has('rm');
let live = initState(), acc = 0;
const BASE_FX = { now: 1000, time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 0, bite: null, biteAge: Infinity, cutAge: 1e6, reducedFlash: false, reducedMotion: false };
const FXS = {
  chaos0: {},
  chaos1: { chaos: 1, variant: 1, time: 7.3 },
  wild: { chaos: 1, beat: 1, punch: 1, variant: 3, beatIndex: 5, time: 11.1 },
  switches: { chaos: 0.6, beat: 0.15, variant: 2, reducedFlash: true, reducedMotion: true },
};
const mkFx = (o, extra = {}) => ({ ...BASE_FX, ...o, ...extra });
function liveFx() {
  const rf = $('rf').checked, rm = $('rm').checked;
  const beats = (clock / 1000) * (132 / 60), beatIndex = Math.floor(beats);
  let beat = Math.exp(-(beats - beatIndex) * 5);
  if (rf) beat *= 0.15;
  const biteAge = clock - biteAt;
  return { now: clock, time: animTime, beat, beatIndex, chaos: +$('chaos').value, punch: rf ? 0 : Math.max(0, 1 - biteAge / 300),
    variant, bite, biteAge: bite ? biteAge : Infinity, cutAge: clock, reducedFlash: rf, reducedMotion: rm };
}
const currentSnap = () => (caseId === 'live' ? laneSnap(live, { progress: Math.min(1, acc / STEP), paused }) : CASES[caseId]);

// ---------------- canvas ----------------
const SIZES = { fit: null, land: [1280, 720], port: [390, 844] };
const cv = $('flat'), livesCv = $('lives'), stage = $('stage'), ctx2 = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
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
addEventListener('resize', fit);
fit();

// ---------------- frame driver ----------------
let fps = 0, nFrames = 0, fpsT = 0, last = 0;
function step(dt) {
  clock += dt;
  animTime += (dt / 1000) * ($('rm').checked ? 0.15 : 1);
  if (caseId === 'live' && !paused) {
    acc += Math.min(100, dt);
    while (acc >= STEP) { acc -= STEP; stepState(live); if (live.t > 600) live = initState(); }
  }
  const snap = currentSnap(), fx = liveFx();
  try {
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = layout(W, H);
    flat.scenery(ctx2, L, snap, fx);
    flat.board(ctx2, L, snap, fx);
    const lc = livesCv.getContext('2d');
    lc.setTransform(dpr, 0, 0, dpr, 0, 0); lc.clearRect(0, 0, 150, 30);
    for (let i = 0; i < 5; i++) flat.life(lc, 4 + i * 29, 3, 24, i < snap.lives, fx);
  } catch (e) { if (errors.length < 20) errors.push(String((e && e.stack) || e)); }
}
function loop(now) {
  step(last ? Math.min(100, now - last) : 16);
  last = now; nFrames++;
  if (now - fpsT > 1000) { fps = Math.round((nFrames * 1000) / (now - fpsT)); nFrames = 0; fpsT = now; status(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
function frames(n = 1, dt = 16.7) {
  for (let i = 0; i < n; i++) step(dt);
  status();
  const s = currentSnap();
  return { clock, caseId, tick: s.tick, y0: s.space.y0, food: s.food, foodAt: s.foodAt, len: s.snake.length, errors: errors.length };
}

// ---------------- controls ----------------
let checkText = '';
function status() {
  const s = currentSnap();
  $('out').textContent = `case ${caseId} | ${W}x${H} | ${fps} fps | tick ${s.tick} y0 ${s.space.y0} food ${s.food ? s.food.x + ',' + s.food.y : 'null'}` +
    (errors.length ? `\nERRORS: ${errors.slice(0, 3).join(' / ')}` : '') + (checkText ? '\n' + checkText : '');
  document.querySelectorAll('[data-case]').forEach((b) => b.classList.toggle('on', b.dataset.case === caseId));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === sizeId));
}
$('cases').innerHTML = ['live', ...Object.keys(CASES)].map((v) => `<button data-case="${v}">${v}</button>`).join('');
$('sizes').innerHTML = Object.keys(SIZES).map((v) => `<button data-size="${v}">${v}</button>`).join('');
$('cases').onclick = (e) => { if (e.target.dataset.case) { caseId = e.target.dataset.case; step(0); status(); } };
$('sizes').onclick = (e) => { if (e.target.dataset.size) { sizeId = e.target.dataset.size; fit(); step(0); status(); } };
$('toggle').onclick = () => $('ui').classList.toggle('min');
$('bite').onclick = () => { const s = currentSnap(); bite = s.snake[0] || { x: 8, y: 8 }; biteAt = clock; variant++; };
$('pause').onclick = () => { paused = !paused; };
$('check').onclick = () => check();
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') $('bite').onclick();
  else if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
  else if (e.code === 'KeyC') check();
});

// ---------------- cell check ----------------
const occOf = (snap) => { const o = new Set(snap.snake.map(key)); if (snap.food) o.add(key(snap.food)); return o; };
function renderBoardOnly(w, h, L, snap, fx) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  flat.board(g, L, snap, fx);
  const st = g.getTransform();
  const restored = st.a === 1 && st.e === 0 && g.globalAlpha === 1 && g.fillStyle === '#000000' && g.globalCompositeOperation === 'source-over';
  return { data: g.getImageData(0, 0, w, h).data, restored };
}
function classify(L, w, data, snap) {
  const px = (X, Y) => { const i = (Math.round(Y) * w + Math.round(X)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const at = (x, y) => px(L.bx + Math.floor((x + 0.5) * L.cell), L.by + Math.floor((y + 0.5) * L.cell));
  const occ = occOf(snap);
  let ref = null;
  for (let y = 0; y < ROWS && !ref; y++) for (let x = 0; x < COLS && !ref; x++) if (!occ.has(x + y * COLS)) ref = at(x, y);
  const diff = (p) => Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
  const bad = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((diff(at(x, y)) > 60) !== occ.has(x + y * COLS)) bad.push(`${x},${y}${occ.has(x + y * COLS) ? ' missing' : ' extra'}`);
  return { bad, px, diff };
}
function check() {
  const was = paused, keep = { bite, biteAt, variant }; paused = true;
  const t0 = performance.now(), rows = [];
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    const L = layout(w, h);
    for (const [cn, snap] of Object.entries(CASES)) {
      const runs = Object.entries(FXS).map(([n, o]) => [n, mkFx(o)]);
      runs.push(['bite60', mkFx({ chaos: 0.5, punch: 1, variant: 2, time: 3 }, { bite: snap.snake[0], biteAge: 60 })]);
      runs.push(['bite300', mkFx({ chaos: 1, punch: 0.1, variant: 5, time: 4 }, { bite: snap.snake[0], biteAge: 300 })]);
      for (const [fn, fx] of runs) {
        const sc = document.createElement('canvas'); sc.width = w; sc.height = h;
        const sg = sc.getContext('2d');
        flat.scenery(sg, L, snap, fx); flat.board(sg, L, snap, fx);     // the full frame must not throw
        const r = renderBoardOnly(w, h, L, snap, fx);
        const { bad, px, diff } = classify(L, w, r.data, snap);
        if (!r.restored) bad.push('context state not restored');
        if (cn === 'broken' && fn === 'chaos0') {
          const empty = renderBoardOnly(w, h, L, { ...snap, snake: [], food: null }, fx).data;
          const hinge = (a, b) => {   // the boundary pixel between two cells differs from the empty board there
            const X = L.bx + Math.max(a[0], b[0]) * L.cell, Y = Math.floor(L.by + (a[1] + 0.5) * L.cell), i = (Y * w + X) * 4;
            return Math.abs(r.data[i] - empty[i]) + Math.abs(r.data[i + 1] - empty[i + 1]) + Math.abs(r.data[i + 2] - empty[i + 2]) > 60;
          };
          if (!hinge([9, 9], [10, 9])) bad.push('hinge missing 9,9|10,9');
          if (hinge([11, 9], [12, 9])) bad.push('hinge drawn across break 11,9|12,9');
          if (hinge([5, 7], [6, 7])) bad.push('joined across a gap');
        }
        rows.push({ name: `${w}x${h} ${cn} ${fn}`, bad });
      }
    }
    // cells stay exact while the lane scrolls: the classification is the same at every progress
    for (const p of [0, 0.25, 0.5, 0.99]) {
      const snap = { ...CASES.up, progress: p };
      const r = renderBoardOnly(w, h, L, snap, mkFx(FXS.chaos1));
      rows.push({ name: `${w}x${h} up progress ${p}`, bad: classify(L, w, r.data, snap).bad });
    }
  }
  // scroll position: continuous across ticks, from prevY0 at progress 0 to y0 at progress 1
  const sm = [];
  let st = initState(), prevEnd = flat.scrollRows(laneSnap(st));
  for (let i = 0; i < 160; i++) {
    stepState(st);
    const a = flat.scrollRows(laneSnap(st, { progress: 0 })), b = flat.scrollRows(laneSnap(st, { progress: 1 }));
    if (Math.abs(a - prevEnd) > 1e-9) sm.push(`tick ${st.t} jump ${prevEnd}→${a}`);
    if (Math.abs(b - st.y0) > 1e-9) sm.push(`tick ${st.t} end ${b}≠y0 ${st.y0}`);
    prevEnd = b;
  }
  rows.push({ name: 'scroll continuity', bad: sm });
  // the dot comes into view as the window follows the head
  st = initState(); let seen = 0, wasNull = 0;
  for (let i = 0; i < 200; i++) { stepState(st); const s = laneSnap(st); if (s.food) seen++; else wasNull++; }
  rows.push({ name: 'dot null then in view', bad: seen && wasNull ? [] : [`seen ${seen} null ${wasNull}`] });
  // life icon: filled and hollow differ, state restored
  for (const ch of [0, 1]) {
    const c = document.createElement('canvas'); c.width = 60; c.height = 30;
    const g = c.getContext('2d', { willReadFrequently: true });
    flat.life(g, 0, 0, 30, true, { chaos: ch }); flat.life(g, 30, 0, 30, false, { chaos: ch });
    const d = g.getImageData(0, 0, 60, 30).data, a = (x, y) => d[(y * 60 + x) * 4 + 3];
    const bad = [];
    if (!(a(15, 15) > 200)) bad.push('filled not opaque at centre');
    if (!(a(45, 15) < 160)) bad.push('hollow not hollow at centre');
    if (g.getTransform().a !== 1 || g.fillStyle !== '#000000' || g.globalAlpha !== 1) bad.push('context state not restored');
    rows.push({ name: `life chaos ${ch}`, bad });
  }
  // timing: one full frame at 1280x720
  const tc = document.createElement('canvas'); tc.width = 1280; tc.height = 720;
  const tg = tc.getContext('2d'), L = layout(1280, 720), tf = performance.now();
  for (let i = 0; i < 20; i++) { const fx = mkFx(FXS.wild, { time: i * 0.05 }); flat.scenery(tg, L, CASES.up, fx); flat.board(tg, L, CASES.up, fx); }
  const ms = (performance.now() - tf) / 20;
  paused = was; ({ bite, biteAt, variant } = keep);
  const failed = rows.filter((r) => r.bad.length);
  checkText = `cell check: ${rows.length - failed.length}/${rows.length} pass, errors ${errors.length}, frame ${ms.toFixed(2)} ms, ${Math.round(performance.now() - t0)} ms` +
    (failed.length ? '\n' + failed.slice(0, 12).map((r) => `FAIL ${r.name}: ${r.bad.slice(0, 4).join('; ')}${r.bad.length > 4 ? ` (+${r.bad.length - 4})` : ''}`).join('\n') : '');
  status();
  console.log('[lane-2d] ' + checkText);
  return { pass: rows.length - failed.length, total: rows.length, failed, errors: errors.slice(), frameMs: ms };
}

function set(o = {}) {
  if (o.case) caseId = o.case;
  if (o.size) { sizeId = o.size; fit(); }
  if (o.chaos != null) $('chaos').value = String(o.chaos);
  if (o.rf != null) $('rf').checked = !!o.rf;
  if (o.rm != null) $('rm').checked = !!o.rm;
  if (o.paused != null) paused = !!o.paused;
  if (o.bite) $('bite').onclick();
  step(0); status();
  return { caseId, sizeId };
}
window.__l2 = { check, frames, set, errors, CASES, layout, get live() { return live; } };
status();
