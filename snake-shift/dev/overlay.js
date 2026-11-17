// Harness for the overlay stream (flat.js + persp.js): fake LEVELS_PLAN 3.3 snapshots, minimal d and fx.
// Renders on demand only. window.H exposes cases and checks; H.checks() returns a report object.
import { createFlatRenderer, dotHeading } from '../src/render/flat.js';
import { createPerspRenderer } from '../src/render/persp.js';
import { createFlatRenderer as createOldFlat } from './overlay.oldflat.js';
import { createPerspRenderer as createOldPersp } from './overlay.oldpersp.js';
import { cubeStep, cubeNet, canonToLocal, cubeNeighbour, toBoard, localToCanon, canonDirToLocal, DIR_ORDER } from '../src/space.js';

const errors = [];
const origErr = console.error.bind(console);
console.error = (...a) => { errors.push(a.map(String).join(' ')); origErr(...a); };
window.addEventListener('error', (e) => errors.push(String(e.message)));

// ---- probe timeline: cell-exact board, colour per cube face so the seam slide is visible -------
const FACE_COL = ['#24406e', '#5c2a6e', '#1f6e52', '#6e5320', '#3d6e1f', '#6e2424'];
const HEAD = [255, 255, 255], BODY = [119, 204, 255], FOOD = [255, 64, 32];
const probe = {
  meta: { id: 'probe', kind: '2d', hud: { accent: '#19e6ff' } },
  scenery(ctx, L) { ctx.fillStyle = '#0a0c14'; ctx.fillRect(0, 0, L.w, L.h); },
  board(ctx, L, snap) {
    const sp = snap.space || {};
    ctx.fillStyle = sp.kind === 'cube' ? FACE_COL[sp.face] : sp.kind === 'lane' ? '#4a3a1c' : '#1b1f2a';
    ctx.fillRect(L.bx, L.by, L.bw, L.bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    for (let i = 1; i < 16; i++) {
      ctx.moveTo(L.bx + i * L.cell + 0.5, L.by); ctx.lineTo(L.bx + i * L.cell + 0.5, L.by + L.bh);
      ctx.moveTo(L.bx, L.by + i * L.cell + 0.5); ctx.lineTo(L.bx + L.bw, L.by + i * L.cell + 0.5);
    }
    ctx.stroke();
    if (sp.kind === 'cube') {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = `900 ${Math.round(L.cell * 4)}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`F${sp.face}`, L.bx + L.bw / 2, L.by + L.bh / 2);
    }
    const cellFill = (c, rgb) => { ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(L.bx + c.x * L.cell + 2, L.by + c.y * L.cell + 2, L.cell - 4, L.cell - 4); };
    if (snap.food) cellFill(snap.food, FOOD);
    const sn = snap.snake || [];
    for (let i = sn.length - 1; i >= 0; i--) cellFill(sn[i], i ? BODY : HEAD);
  },
};

// ---- snapshot builders -------------------------------------------------------------------------
function base(over) {
  return {
    cols: 16, rows: 16, snake: [], breaks: [], length: 0, dir: 'up', prevDir: 'up', heading: 'up',
    prevTail: null, grew: false, food: null, mushroom: null, score: 12, stepMs: 130, tick: 100, progress: 0.5,
    alive: true, paused: false, waiting: null, death: null, lives: 3, maxLives: 5,
    universe: { id: 'castle', rules: 'cube', mushrooms: false, index: 5, holdLeft: 3 },
    space: { kind: 'box' }, body: null, foodAt: null, seed: 1, ...over,
  };
}
/** Visible board-local cells of a space body, with breaks per 3.3. */
function visible(space, body) {
  const snake = [], idx = [];
  body.forEach((c, i) => { const b = toBoard(space, c); if (b) { snake.push({ x: b.x, y: b.y }); idx.push(i); } });
  const breaks = [];
  for (let k = 0; k + 1 < snake.length; k++) {
    const adj = Math.abs(snake[k].x - snake[k + 1].x) + Math.abs(snake[k].y - snake[k + 1].y) === 1;
    if (idx[k + 1] !== idx[k] + 1 || !adj) breaks.push(k);
  }
  return { snake, breaks };
}

const CUBE_DOT = { f: 2, u: 3, v: 5 };
const WALK = 'u'.repeat(10) + 'r'.repeat(12) + 'd'.repeat(9) + 'l'.repeat(20) + 'u'.repeat(18) + 'r'.repeat(6);
const DN = { u: 'up', r: 'right', d: 'down', l: 'left' };
/** A walk over several seams: one snapshot per tick. */
function cubeWalk(len = 9) {
  let st = { f: 0, u: 7, v: 8, rot: 0 };
  // Head at (7, 8) heading up; the body runs down column 7, then left along the bottom row.
  let body = Array.from({ length: len }, (_, i) => ({ f: 0, u: i < 8 ? 7 : 7 - (i - 7), v: Math.min(15, 8 + i) }));
  const frames = [];
  let tick = 200;
  for (const ch of WALK) {
    const dir = DN[ch];
    const s = cubeStep(st.f, st.u, st.v, st.rot, dir);
    const prev = st;
    st = { f: s.f, u: s.u, v: s.v, rot: s.rot };
    body = [{ f: s.f, u: s.u, v: s.v }, ...body].slice(0, len);
    const space = { kind: 'cube', face: s.f, rot: s.rot, prevFace: prev.f, prevRot: prev.rot, entered: s.crossed ? dir : null };
    const vis = visible(space, body);
    const food = toBoard(space, CUBE_DOT);
    frames.push(base({
      snake: vis.snake, breaks: vis.breaks, length: len, dir, prevDir: dir, heading: dir, tick: ++tick,
      space, body: body.map((c) => ({ ...c })), food: food ? { x: food.x, y: food.y } : null, foodAt: { ...CUBE_DOT },
    }));
  }
  return frames;
}

/** Lane: window at y0, head on local row 7 heading up, dot at absolute row foodY. */
function laneSnap(y0, foodY, foodX = 4) {
  const space = { kind: 'lane', y0, prevY0: y0 + 1 };
  const body = [];
  for (let i = 0; i < 7; i++) body.push({ x: 9, y: y0 + 7 + i });
  for (let i = 1; i <= 6; i++) body.push({ x: 9 - i, y: y0 + 13 });
  for (let i = 1; i <= 5; i++) body.push({ x: 3, y: y0 + 13 + i }); // runs off the bottom of the window
  const vis = visible(space, body);
  const foodAt = { x: foodX, y: foodY };
  const food = toBoard(space, foodAt);
  return base({
    snake: vis.snake, breaks: vis.breaks, length: body.length, universe: { id: 'lane', rules: 'lane', mushrooms: false, index: 4, holdLeft: 2 },
    space, body, food: food ? { x: food.x, y: food.y } : null, foodAt,
  });
}
/** Box after leaving the cube: three visible runs with breaks, prevTail null. */
function brokenSnap() {
  const snake = [{ x: 8, y: 8 }, { x: 8, y: 9 }, { x: 8, y: 10 }, { x: 9, y: 10 }, { x: 12, y: 3 }, { x: 12, y: 4 }, { x: 13, y: 4 }, { x: 2, y: 14 }];
  return base({ snake, breaks: [3, 6], length: 21, prevTail: null, food: { x: 5, y: 5 }, universe: { id: 'lcd', rules: 'box', mushrooms: false, index: 6, holdLeft: 0 } });
}
/** Two adjacent cells that are NOT joined (break between them) plus a one-cell run. */
function adjacentBreakSnap() {
  const snake = [{ x: 6, y: 6 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 10, y: 12 }];
  return base({ snake, breaks: [0, 2], length: 15, prevTail: null, food: null, universe: { id: 'lcd', rules: 'box', mushrooms: false, index: 6, holdLeft: 0 } });
}
function respawnSnap() {
  return base({ snake: [{ x: 8, y: 9 }, { x: 8, y: 10 }, { x: 8, y: 11 }], length: 3, lives: 2, paused: true, waiting: 'respawn', food: { x: 3, y: 3 }, death: { reason: 'self', cell: { x: 4, y: 4 } }, universe: { id: 'lcd', rules: 'box', mushrooms: false, index: 6, holdLeft: 0 } });
}
function oneCellSnap() {
  return base({ snake: [{ x: 7, y: 7 }], length: 12, prevTail: null, food: null, universe: { id: 'lcd', rules: 'box', mushrooms: false, index: 6, holdLeft: 0 } });
}
/** Old-format snapshot (no new fields), for the regression compare. */
function oldSnap() {
  const snake = [];
  for (let i = 0; i < 6; i++) snake.push({ x: 10 - i, y: 6 });
  for (let i = 1; i <= 4; i++) snake.push({ x: 5, y: 6 + i });
  return { cols: 16, rows: 16, snake, dir: 'right', prevDir: 'right', food: { x: 12, y: 9 }, score: 9, alive: true, paused: false, progress: 0.4, tick: 50, stepMs: 136, grew: false, prevTail: { x: 5, y: 11 } };
}

// ---- d and fx ----------------------------------------------------------------------------------
const HUD = { accent: '#19e6ff', fg: '#fff3ff', bg: 'rgba(24,4,44,0.72)', panelFg: '#ffe9ff' };
function dFor(kind, view, timeline = 'probe') {
  return { showing: true, timeline, kind, view, sceneInfo: { id: timeline, timeline, kind, view, hud: HUD }, phrase: null, veil: null, strobe: 0, invertUntil: 0, bite: null, biteAt: 0, cutAt: 0, chaos: 0.3, variant: 0 };
}
function fxAt(now, extra) {
  return { now, time: now / 1000, chaos: 0.3, beat: 0.2, beatIndex: 3, glitch: 0, split: 0, strobe: 0, invert: false, reducedFlash: false, reducedMotion: false, variant: 0, punch: 0, cutAge: 1e9, bite: null, biteAge: 1e9, ...extra };
}

// ---- renderers and cases -----------------------------------------------------------------------
const cv = document.getElementById('cv');
const stage = document.getElementById('stage');
const out = document.getElementById('out');
const SIZES = { landscape: [1280, 800], portrait: [390, 844], square: [700, 700] };
const walk = cubeWalk();
const state = { size: 'landscape', name: 'cube-walk', step: 0, now: 10000, reducedMotion: false, padSide: false };
const timelines = { probe, lcd: probe };
const flat = createFlatRenderer({ canvas: cv, invertEl: null, cols: 16, rows: 16 });
const persp = createPerspRenderer({ cols: 16, rows: 16 });

function lanePov() { const s = laneSnap(-20, -26); return { ...s, dir: 'left', heading: 'left' }; }
const CASES = {
  'cube-walk': () => ({ snap: walk[state.step], d: dFor('2d', 'board') }),
  'cube-3d': () => ({ snap: walk[state.step], d: dFor('3d', 'board', 'castle'), glActive: true }),
  'lane-ahead': () => ({ snap: laneSnap(-20, -26), d: dFor('2d', 'board') }),
  'lane-behind': () => ({ snap: laneSnap(-20, -2, 11), d: dFor('2d', 'board') }),
  'lane-3d': () => ({ snap: laneSnap(-20, -26), d: dFor('3d', 'board', 'lane'), glActive: true }),
  'lane-pov': () => ({ snap: lanePov(), d: dFor('3d', 'pov', 'lane'), glActive: true }),
  broken: () => ({ snap: brokenSnap(), d: dFor('2d', 'board') }),
  'adjacent-break': () => ({ snap: adjacentBreakSnap(), d: dFor('2d', 'board') }),
  respawn: () => ({ snap: respawnSnap(), d: dFor('2d', 'board') }),
  'one-cell': () => ({ snap: oneCellSnap(), d: dFor('2d', 'board') }),
  'pov-broken': () => ({ snap: brokenSnap(), d: dFor('3d', 'pov', 'court'), glActive: true }),
  'persp-broken': () => ({ snap: brokenSnap(), d: dFor('3d', 'board', 'court'), persp }),
  'persp-adjacent': () => ({ snap: adjacentBreakSnap(), d: dFor('3d', 'board', 'court'), persp }),
  'persp-one': () => ({ snap: oneCellSnap(), d: dFor('3d', 'board', 'court'), persp }),
  'persp-respawn': () => ({ snap: respawnSnap(), d: dFor('3d', 'board', 'court'), persp }),
};

function setSize(name) {
  state.size = name;
  const [W, H] = SIZES[name];
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  flat.resize(W, H, 1);
}
/** Render one frame of a case. */
function frame(name = state.name, now = state.now, extra = {}) {
  const c = CASES[name]();
  flat.render({ snap: c.snap, fx: fxAt(now, { reducedMotion: state.reducedMotion, ...extra }), d: c.d, timelines, glActive: !!c.glActive, persp: c.persp || null, touch: false, padSide: state.padSide });
  return c;
}
function show(name = state.name) {
  state.name = name;
  frame();
  const c = CASES[name]();
  const dh = dotHeading(c.snap);
  out.textContent = `${name} ${state.size}${name.startsWith('cube') ? ` step ${state.step}/${walk.length - 1} face ${c.snap.space.face} rot ${c.snap.space.rot} entered ${c.snap.space.entered}` : ''}\n`
    + `snake ${JSON.stringify(c.snap.snake.slice(0, 4))}… breaks ${JSON.stringify(c.snap.breaks || [])} food ${JSON.stringify(c.snap.food)} arrow ${JSON.stringify(dh)}\nerrors: ${errors.length}`;
  [...document.querySelectorAll('#bar button')].forEach((b) => b.classList.toggle('on', b.dataset.k === name || b.dataset.k === state.size));
}
/** Play the cube walk in real time from the current step (setTimeout, so it runs in a hidden pane). */
function play(steps = 20, stepMs = 130) {
  state.name = 'cube-walk';
  let t = 0;
  const end = state.step + steps;
  return new Promise((res) => {
    const tick = () => {
      t += 16;
      state.now += 16;
      if (t >= stepMs) { t = 0; state.step = Math.min(walk.length - 1, state.step + 1); }
      frame();
      if (state.step >= end || state.step >= walk.length - 1) { show(); res(); } else setTimeout(tick, 16);
    };
    tick();
  });
}

const bar = document.getElementById('bar');
function btn(label, k, fn) { const b = document.createElement('button'); b.textContent = label; b.dataset.k = k; b.onclick = fn; bar.appendChild(b); }
for (const s of Object.keys(SIZES)) btn(s, s, () => { setSize(s); show(); });
for (const n of Object.keys(CASES)) btn(n, n, () => show(n));
btn('◀ step', '', () => { state.step = Math.max(0, state.step - 1); state.now += 1000; show(); });
btn('step ▶', '', () => { state.step = Math.min(walk.length - 1, state.step + 1); state.now += 1000; show(); });
btn('play walk', '', () => play(30));
btn('reduced motion', 'rm', () => { state.reducedMotion = !state.reducedMotion; show(); });
btn('pad side', 'pad', () => { state.padSide = !state.padSide; show(); });
btn('run checks', '', () => { out.textContent = JSON.stringify(checks(), null, 1); });

window.H = { state, walk, CASES, frame, show, play, setSize, flat, persp, errors, dotHeading, get checks() { return checks; } };
setSize('landscape');
show('cube-walk');

// ---- checks ------------------------------------------------------------------------------------
const g2 = () => cv.getContext('2d');
const ACC = [25, 230, 255], YEL = [255, 212, 0];
const near = (a, b, tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
function px(x, y) { const d = g2().getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; }
function boardData() { const L = flat.layout; return g2().getImageData(L.bx, L.by, L.bw, L.bh).data; }
/** Differing board pixels, skipping canvas rects (animated overlays that sit over the board). */
function diffMasked(a, b, skips) {
  const L = flat.layout;
  let n = 0;
  for (let j = 0; j < L.bh; j++) for (let i = 0; i < L.bw; i++) {
    const x = L.bx + i, y = L.by + j;
    if (skips.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue;
    const k = (j * L.bw + i) * 4;
    if (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2]) n++;
  }
  return n;
}
function diffCount(a, b) { if (a.length !== b.length) return -1; let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; }
/** Pixels of colour rgb inside a rect: { n, cx, cy } (centroid). */
function findColor(x, y, w, h, rgb, tol = 14, excl = null) {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.max(1, Math.min(cv.width - x, Math.ceil(w))); h = Math.max(1, Math.min(cv.height - y, Math.ceil(h)));
  const d = g2().getImageData(x, y, w, h).data;
  let n = 0, sx = 0, sy = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    if (excl && x + i >= excl.x - 6 && x + i < excl.x + excl.w + 6 && y + j >= excl.y - 6 && y + j < excl.y + excl.h + 26) continue;
    if (Math.abs(d[k] - rgb[0]) <= tol && Math.abs(d[k + 1] - rgb[1]) <= tol && Math.abs(d[k + 2] - rgb[2]) <= tol) { n++; sx += i; sy += j; }
  }
  return { n, cx: n ? x + sx / n : -1, cy: n ? y + sy / n : -1 };
}
/** Yellow arrow in a band across board edge `dir`: returns its centroid along the edge, in cells. */
function arrowOnBoardEdge(dir, excl = null) {
  const L = flat.layout, B = 60, I = 24;
  const r = dir === 'up' ? [L.bx, L.by - B, L.bw, B + I] : dir === 'down' ? [L.bx, L.by + L.bh - I, L.bw, B + I]
    : dir === 'left' ? [L.bx - B, L.by, B + I, L.bh] : [L.bx + L.bw - I, L.by, B + I, L.bh];
  const f = findColor(...r, YEL, 14, excl);
  if (f.n < 20) return null;
  return dir === 'up' || dir === 'down' ? (f.cx - L.bx) / L.cell - 0.5 : (f.cy - L.by) / L.cell - 0.5;
}
// Independent route check: BFS from the head, then every board-local seam that starts a shortest path.
function bfsCube(start) {
  const dist = new Int16Array(1536).fill(-1), q = [start.f * 256 + start.v * 16 + start.u];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], f = (i / 256) | 0, v = ((i % 256) / 16) | 0, u = i % 16;
    for (let d = 0; d < 4; d++) { const n = cubeNeighbour(f, u, v, d), j = n.f * 256 + n.v * 16 + n.u; if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } }
  }
  return dist;
}
function validExits(snap) {
  const sp = snap.space, hd = snap.body[0], dot = snap.foodAt;
  const dh = bfsCube(hd), dd = bfsCube(dot);
  const D = dh[dot.f * 256 + dot.v * 16 + dot.u];
  const ok = new Set();
  for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) {
    const i = sp.face * 256 + v * 16 + u;
    for (let d = 0; d < 4; d++) {
      const n = cubeNeighbour(sp.face, u, v, d);
      if (n.f === sp.face) continue;
      if (dh[i] + 1 + dd[n.f * 256 + n.v * 16 + n.u] === D) ok.add(canonDirToLocal(DIR_ORDER[d], sp.rot));
    }
  }
  return { D, ok };
}
function mapPoint(rect, cell) {
  const e = cubeNet(H.state.snapFace, H.state.snapRot).find((k) => k.f === cell.f);
  const l = canonToLocal(cell.u, cell.v, e.rot), c = rect.s / 16;
  return [rect.x + (e.gx * 16 + l.x + 0.5) * c, rect.y + (e.gy * 16 + l.y + 0.5) * c, e];
}

function checkWalk(report) {
  const res = { steps: 0, headOk: 0, arrowNeeded: 0, arrowOk: 0, routeOk: 0, mapHeadOk: 0, mapDotOk: 0, netJoinOk: 0, netJoinChecked: 0, fails: [] };
  const L = flat.layout;
  walk.forEach((snap, i) => {
    state.step = i;
    frame('cube-walk', 1e6 + i * 1000, { reducedMotion: true });
    res.steps++;
    const hd = snap.snake[0];
    if (near(px(L.bx + (hd.x + 0.5) * L.cell, L.by + (hd.y + 0.5) * L.cell), HEAD)) res.headOk++; else res.fails.push(`head ${i}`);
    const dh = dotHeading(snap);
    const rect = flat.cubeMapRect(false, true, snap);
    if (!snap.food) {
      res.arrowNeeded++;
      const along = dh && arrowOnBoardEdge(dh.dir, rect);
      if (dh && along !== null && Math.abs(along - dh.at) <= 1) res.arrowOk++; else res.fails.push(`arrow ${i} ${JSON.stringify(dh)} ${along}`);
      const v = validExits(snap);
      if (dh && v.ok.has(dh.dir) && dh.dist === v.D) res.routeOk++; else res.fails.push(`route ${i} ${JSON.stringify(dh)} ${[...v.ok]} ${v.D}`);
    } else if (dh) res.fails.push(`arrow drawn with food on board ${i}`);
    state.snapFace = snap.space.face; state.snapRot = snap.space.rot;
    const tol = rect.alpha < 1 ? 70 : 20;
    if (rect.alpha < 0.5) res.fails.push(`map faded over head ${i}`);
    const ph = mapPoint(rect, snap.body[0]);
    if (findColor(ph[0] - 1, ph[1] - 1, 3, 3, ACC, tol).n > 0) res.mapHeadOk++; else res.fails.push(`map head ${i}`);
    const pd = mapPoint(rect, snap.foodAt);
    if (findColor(pd[0] - 1, pd[1] - 1, 3, 3, YEL, tol + 10).n > 0) res.mapDotOk++; else res.fails.push(`map dot ${i}`);
    res.mapOver = (res.mapOver || 0) + (rect.over ? 1 : 0);
    // Net continuity: consecutive body cells, one on the centre face, the other on a net neighbour.
    for (let k = 0; k + 1 < snap.body.length; k++) {
      const a = snap.body[k], b = snap.body[k + 1];
      if (a.f === b.f || (a.f !== snap.space.face && b.f !== snap.space.face)) continue;
      const pa = mapPoint(rect, a), pb = mapPoint(rect, b);
      if (pa[2].gy === 3 || pb[2].gy === 3) continue;
      res.netJoinChecked++;
      if (Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) <= rect.s / 16 + 0.01) res.netJoinOk++; else res.fails.push(`net join ${i}`);
    }
  });
  report[`walk_${state.size}`] = res;
}

function checkSlide(report) {
  const res = { crossings: 0, midDiffers: 0, headShown: 0, exactAfter: 0, reducedCut: 0, fails: [] };
  const L = flat.layout;
  walk.forEach((snap, k) => {
    if (!snap.space.entered || k === 0) return;
    res.crossings++;
    const t0 = 2e6 + k * 5000;
    const hd = snap.snake[0], [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[snap.space.entered];
    state.step = k - 1; frame('cube-walk', t0);
    state.step = k;
    frame('cube-walk', t0 + 16); // first frame of the new tick: the slide starts here
    let shown = true;
    for (const age of [20, 70, 120]) {
      frame('cube-walk', t0 + 16 + age);
      const q = age / 140, p = 1 - Math.pow(1 - q, 3);
      const x = L.bx + (hd.x + 0.5) * L.cell + dx * (1 - p) * L.bw, y = L.by + (hd.y + 0.5) * L.cell + dy * (1 - p) * L.bh;
      const inside = x > L.bx && x < L.bx + L.bw && y > L.by && y < L.by + L.bh;
      if (!inside || !near(px(x, y), HEAD)) { shown = false; res.fails.push(`head hidden ${k} age ${age}`); }
    }
    if (shown) res.headShown++;
    frame('cube-walk', t0 + 16 + 60);
    const mid = boardData();
    frame('cube-walk', t0 + 16 + 141);
    const after = boardData();
    frame('cube-walk', t0 + 16 + 400, { reducedMotion: true });
    const exact = boardData();
    if (diffCount(mid, exact) > 0) res.midDiffers++; else res.fails.push(`no slide ${k}`);
    // Map (if it has to sit over the board) and an in-board arrow animate with time: masked out.
    const m = flat.cubeMapRect(false, true, snap), skips = [];
    if (m.over) skips.push({ x: m.x - 8, y: m.y - 8, w: m.w + 16, h: m.h + 36 });
    const dh = dotHeading(snap);
    if (dh) {
      const B = Math.ceil(L.cell * 1.6);
      skips.push(dh.dir === 'up' ? { x: L.bx, y: L.by, w: L.bw, h: B } : dh.dir === 'down' ? { x: L.bx, y: L.by + L.bh - B, w: L.bw, h: B }
        : dh.dir === 'left' ? { x: L.bx, y: L.by, w: B, h: L.bh } : { x: L.bx + L.bw - B, y: L.by, w: B, h: L.bh });
    }
    const nAfter = m.over ? diffMasked(after, exact, skips) : diffCount(after, exact);
    if (nAfter === 0) res.exactAfter++; else res.fails.push(`not exact after ${k}: ${nAfter}`);
    // Reduced motion: a cut, exact on the first frame.
    state.step = k - 1; frame('cube-walk', t0 + 2000, { reducedMotion: true });
    state.step = k; frame('cube-walk', t0 + 2020, { reducedMotion: true });
    if (diffCount(boardData(), exact) === 0) res.reducedCut++; else res.fails.push(`reduced not cut ${k}`);
  });
  report[`slide_${state.size}`] = res;
}

function checkLaneAnd3d(report) {
  const res = { fails: [] };
  const L = flat.layout, [W, Hh] = SIZES[state.size];
  frame('lane-ahead', 3e6);
  let s = CASES['lane-ahead']().snap, dh = dotHeading(s), a = dh && arrowOnBoardEdge('up');
  res.laneAhead = dh && dh.dir === 'up' && dh.at === 4 && a !== null && Math.abs(a - 4) <= 1;
  frame('lane-behind', 3e6);
  s = CASES['lane-behind']().snap; dh = dotHeading(s); a = dh && arrowOnBoardEdge('down');
  res.laneBehind = dh && dh.dir === 'down' && dh.at === 11 && a !== null && Math.abs(a - 11) <= 1;
  frame('lane-3d', 3e6);
  res.lane3dTop = findColor(0, 60, W, 60, YEL).n > 20;
  frame('lane-pov', 3e6); // heading left, dot ahead in the lane (grid up) -> right side of the screen
  res.lanePovRight = findColor(W - 70, 60, 70, Hh - 60, YEL).n > 20 && findColor(0, 60, 70, Hh - 60, YEL).n === 0;
  const kc = Math.round(Math.max(48, Math.min(78, Math.min(W, Hh) * 0.1))), ky = Math.round(Hh * 0.56 - kc / 2);
  res.lanePovClearOfCaps = findColor(W - 16 - kc, ky - 22, kc + 8, kc + 44, YEL).n === 0;
  // Cube in 3D: map at the corner, arrow on the matching screen edge.
  let n3 = 0, ok3 = 0;
  walk.forEach((snap, i) => {
    if (snap.food) return;
    state.step = i; frame('cube-3d', 3e6 + i * 1000, { reducedMotion: true });
    const d = dotHeading(snap), rect = flat.cubeMapRect(false, false, snap);
    const band = d.dir === 'up' ? [0, 60, W, 70] : d.dir === 'down' ? [0, Hh - 70, W, 70] : d.dir === 'left' ? [0, 60, 70, Hh - 60] : [W - 70, 60, 70, Hh - 60];
    n3++;
    const st = { ...state }; state.snapFace = snap.space.face; state.snapRot = snap.space.rot;
    const ph = mapPoint(rect, snap.body[0]);
    if (findColor(...band, YEL, 14, rect).n > 20 && findColor(ph[0] - 1, ph[1] - 1, 3, 3, ACC, 20).n > 0) ok3++; else res.fails.push(`cube3d ${i} ${d.dir}`);
  });
  res.cube3d = `${ok3}/${n3}`;
  report[`lane3d_${state.size}`] = res;
}

function checkBroken(report) {
  const res = { fails: [] };
  const L = flat.layout, [W, Hh] = SIZES[state.size];
  const e0 = errors.length;
  for (const n of ['broken', 'adjacent-break', 'respawn', 'one-cell', 'pov-broken', 'persp-broken', 'persp-adjacent', 'persp-one', 'persp-respawn']) {
    frame(n, 4e6); frame(n, 4e6 + 500, { reducedMotion: true });
  }
  res.noErrors = errors.length === e0;
  // 2D probe: every visible cell is where it is.
  frame('broken', 4e6);
  res.broken2d = brokenSnap().snake.every((c, i) => near(px(L.bx + (c.x + 0.5) * L.cell, L.by + (c.y + 0.5) * L.cell), i ? BODY : HEAD));
  // Stand-in: top colours of each block at its own cell, segment ends as tail blocks.
  const pal = persp.colors({ hud: HUD });
  const top = (name, snap, kinds) => {
    frame(name, 4e6, { reducedMotion: true });
    return snap.snake.every((c, i) => {
      const hgt = kinds[i] === 'head' ? persp.heights.head : kinds[i] === 'tail' ? persp.heights.tail : persp.heights.body;
      // Head: sample beside the direction chevron (back corner of the top face).
      const o = kinds[i] === 'head' ? [0.3, 0.3] : [0, 0];
      const p = persp.cellPoint(W, Hh, c.x + o[0], c.y + o[1], hgt, {});
      const ok = near(px(p[0], p[1]), pal[kinds[i]], 6);
      if (!ok) res.fails.push(`${name} cell ${i} ${px(p[0], p[1])} want ${pal[kinds[i]]}`);
      return ok;
    });
  };
  res.perspBroken = top('persp-broken', brokenSnap(), ['head', 'body', 'body', 'tail', 'body', 'body', 'tail', 'tail']);
  res.perspAdjacent = top('persp-adjacent', adjacentBreakSnap(), ['head', 'body', 'tail', 'tail']);
  res.perspOne = top('persp-one', oneCellSnap(), ['head']);
  res.perspRespawn = top('persp-respawn', respawnSnap(), ['head', 'body', 'tail']);
  report[`broken_${state.size}`] = res;
}

/** Old flat.js/persp.js (HEAD copies) vs new, pixel for pixel, on old-format snapshots. */
async function checkRegression(report) {
  const res = { compared: 0, identical: 0, nondeterministic: [], diffs: [], missing: [] };
  const ids = ['lcd', 'arcade', 'acid', 'kombat', 'desktop', 'timewarp', 'wrong'];
  const tl = {};
  for (const id of ids) { try { tl[id] = await import(`../src/render/timelines/${id}.js`); } catch (e) { res.missing.push(id); } }
  if (!tl.lcd) tl.lcd = probe;
  const mk = () => { const c = document.createElement('canvas'); return c; };
  const variants = [
    { name: 'plain', fx: {}, d: {} },
    { name: 'wild', fx: { glitch: 0.6, split: 1.2, strobe: 1, invert: true, chaos: 0.9 }, d: { phrase: { text: 'SHIFT', at: 5e6 - 60, dur: 700, seed: 3 } } },
    { name: 'veil', fx: { reducedFlash: true, reducedMotion: true }, d: { veil: { at: 5e6 - 100, dur: 450, from: 0.6, color: '#000' } } },
  ];
  const scenes = [];
  for (const id of Object.keys(tl)) if (id !== 'probe') scenes.push({ id, kind: '2d', view: 'board', gl: false });
  scenes.push({ id: 'court', kind: '3d', view: 'pov', gl: true });
  scenes.push({ id: 'court', kind: '3d', view: 'board', gl: false, persp: true });
  for (const sz of ['landscape', 'portrait']) {
    const [W, Hh] = SIZES[sz];
    for (const sc of scenes) for (const v of variants) {
      const run = (create, perspMod) => {
        const c = mk(), inv = { style: { display: '' } };
        const r = create({ canvas: c, invertEl: inv, cols: 16, rows: 16 });
        r.resize(W, Hh, 1);
        const d = { ...dFor(sc.kind, sc.view, sc.id), ...v.d };
        if (tl[sc.id] && tl[sc.id].meta) d.sceneInfo = { ...d.sceneInfo, ...tl[sc.id].meta, kind: sc.kind, view: sc.view, timeline: sc.id };
        r.render({ snap: oldSnap(), fx: fxAt(5e6, v.fx), d, timelines: tl, glActive: sc.gl, persp: sc.persp ? perspMod : null, touch: false, padSide: false });
        return { px: c.getContext('2d').getImageData(0, 0, W, Hh).data, inv: inv.style.display };
      };
      const tag = `${sz}/${sc.id}/${sc.kind}-${sc.view}${sc.persp ? '-persp' : ''}/${v.name}`;
      const a = run(createOldFlat, createOldPersp({ cols: 16, rows: 16 }));
      const b = run(createFlatRenderer, createPerspRenderer({ cols: 16, rows: 16 }));
      const b2 = run(createFlatRenderer, createPerspRenderer({ cols: 16, rows: 16 }));
      res.compared++;
      if (diffCount(b.px, b2.px) !== 0) { res.nondeterministic.push(tag); continue; }
      const n = diffCount(a.px, b.px);
      if (n === 0 && a.inv === b.inv) res.identical++; else res.diffs.push(`${tag}: ${n} px, invert ${a.inv}/${b.inv}`);
    }
  }
  report.regression = res;
}

async function checks() {
  const report = { errorsBefore: errors.length };
  const keep = { size: state.size, step: state.step, rm: state.reducedMotion };
  for (const sz of ['landscape', 'portrait', 'square']) { setSize(sz); checkWalk(report); checkSlide(report); checkLaneAnd3d(report); checkBroken(report); }
  await checkRegression(report);
  setSize(keep.size); state.step = keep.step; state.reducedMotion = keep.rm;
  report.errors = errors.slice();
  return report;
}

/** Magnified copy of a canvas region in a fixed overlay (for screenshots of small details). */
function peek(x, y, w, h, k = 3) {
  let pc = document.getElementById('peek');
  if (!pc) { pc = document.createElement('canvas'); pc.id = 'peek'; pc.style.cssText = 'position:fixed;left:4px;top:4px;z-index:9;outline:2px solid #19e6ff;image-rendering:pixelated;background:#000'; document.body.appendChild(pc); }
  pc.width = w * k; pc.height = h * k;
  const c2 = pc.getContext('2d');
  c2.imageSmoothingEnabled = false;
  c2.drawImage(cv, x, y, w, h, 0, 0, w * k, h * k);
  pc.style.display = 'block';
}
window.H.peek = peek;
window.H.unpeek = () => { const pc = document.getElementById('peek'); if (pc) pc.style.display = 'none'; };
