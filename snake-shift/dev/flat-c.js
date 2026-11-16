// flat-c harness: fakes a snapshot (§3) and fx (§15.3) to show the Wrong Universe and the Canvas 2D
// perspective stand-in in isolation. Snapshot and fx are deep-frozen every frame, so any write throws.
// Keys: 1 wrong · 2 persp · B bite · A auto-bite · [ ] variant · O wrong with only lcd+arcade (+ a missing id)
// G room colours · V view board/pov · C chaos · F reduced flash · M reduced motion · K kill · R reset
// L long snake · P pause · 7/8/9 size fit / 1280×720 / 390×844 · X cell check · H hide HUD.
// URL: ?mode=wrong|persp&size=fit|land|port&only&missing&rf&rm&auto&v=<n>. window.__flatC for scripted runs.
import * as wrongAll from '../src/render/timelines/wrong.js';
import { createPerspRenderer, FALLBACK_ROOMS } from '../src/render/persp.js';

// ?missing adds a sibling id with no file, to prove a 404 is tolerated (the browser logs that 404 as an error).
const wrongOnly = await import(`../src/render/timelines/wrong.js?only=lcd,arcade${new URLSearchParams(location.search).has('missing') ? ',nope' : ''}`);
await Promise.all([wrongAll.ready, wrongOnly.ready]);
let courtMeta = null;
try { const m = await import('../src/render/gl/rooms/court.js'); courtMeta = m.meta || (m.default && m.default.meta) || null; } catch (_) { /* fine */ }
const ROOMS = [courtMeta || FALLBACK_ROOMS.court, FALLBACK_ROOMS.disco, FALLBACK_ROOMS.plastic, FALLBACK_ROOMS.bunker];

const COLS = 16, ROWS = 16, N = COLS * ROWS;
const SIZES = { fit: null, land: [1280, 720], port: [390, 844] };
const mod = (a, n) => ((a % n) + n) % n;
const PATH = [];
for (let y = 0; y < ROWS; y++) PATH.push([0, y]);
for (let r = ROWS - 1; r >= 1; r--) {
  if (r % 2) for (let x = 1; x < COLS; x++) PATH.push([x, r]);
  else for (let x = COLS - 1; x >= 1; x--) PATH.push([x, r]);
}
for (let x = COLS - 1; x >= 1; x--) PATH.push([x, 0]);

const q = new URLSearchParams(location.search);
const S = {
  mode: q.get('mode') === 'persp' ? 'persp' : 'wrong', only: q.has('only'), size: SIZES[q.get('size')] !== undefined ? q.get('size') : 'fit',
  room: 0, view: 'board', idx: 2, len: 3, food: null, score: 0, alive: true, tick: 0, grew: false, prevTail: null, death: null,
  dir: 'down', prevDir: 'down', stepMs: 150, acc: 0, paused: false, rf: q.has('rf'), rm: q.has('rm'), chaos: null,
  variant: Number(q.get('v')) || 0, bite: null, biteAt: -Infinity, cutAt: 0, auto: q.has('auto'), autoAt: 0, now: 0, time: 0, hide: false,
};
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const at = (k) => PATH[mod(k, N)];
function cells() { const out = []; for (let k = 0; k < S.len; k++) { const p = at(S.idx - k); out.push({ x: p[0], y: p[1] }); } return out; }
function dirOf(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up'; }
function placeFood() {
  const occ = new Set(cells().map((c) => c.x + ',' + c.y)), free = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!occ.has(x + ',' + y)) free.push({ x, y });
  S.food = free.length ? free[Math.floor(rnd() * free.length)] : null;
}
function step() {
  const before = cells();
  S.idx = mod(S.idx + 1, N);
  const h = at(S.idx);
  const eat = S.food && S.food.x === h[0] && S.food.y === h[1];
  S.prevTail = before[before.length - 1];
  S.grew = !!eat;
  if (eat) { S.len = Math.min(N - 4, S.len + 1); S.score++; S.variant++; S.bite = { x: h[0], y: h[1] }; S.biteAt = S.now; placeFood(); }
  const c = cells();
  S.prevDir = S.dir; S.dir = dirOf(c[0], c[1]); S.tick++;
  S.stepMs = Math.max(95, 150 - 1.5 * S.score);
}
function reset() {
  Object.assign(S, { idx: 2, len: 3, score: 0, alive: true, tick: 0, grew: false, prevTail: null, death: null, dir: 'down', prevDir: 'down', bite: null, biteAt: -Infinity, stepMs: 150, acc: 0 });
  seed = 12345; placeFood();
}
function biteNow() { if (!S.alive) return; const p = at(S.idx + 1); S.food = { x: p[0], y: p[1] }; }
function kill() {
  if (!S.alive) return;
  const h = cells()[0], d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[S.dir];
  S.alive = false; S.death = { reason: 'wall', cell: { x: h.x + d[0], y: h.y + d[1] } };
}
const freeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(freeze); } return o; };
function snapshot() {
  return freeze({
    cols: COLS, rows: ROWS, snake: cells(), dir: S.dir, prevDir: S.prevDir, prevTail: S.prevTail, grew: S.grew, food: S.food,
    score: S.score, stepMs: S.stepMs, tick: S.tick, progress: Math.min(1, S.acc / S.stepMs), alive: S.alive, paused: S.paused, death: S.death,
  });
}
function makeFx() {
  const bpm = 132, beats = (S.time * bpm) / 60, bi = Math.floor(beats), ph = beats - bi;
  const chaos = S.chaos == null ? Math.min(1, S.score / 24) : S.chaos;
  const biteAge = S.biteAt === -Infinity ? Infinity : S.now - S.biteAt;
  const rmK = S.rm ? 0.15 : 1;
  return freeze({
    now: S.now, time: S.time * rmK, beat: Math.exp(-ph * 6) * (S.rf ? 0.15 : 1), beatIndex: bi, chaos,
    punch: S.rf ? 0 : Math.max(0, 1 - biteAge / 300), variant: S.variant, bite: S.bite, biteAge, cutAge: S.now - S.cutAt,
    reducedFlash: S.rf, reducedMotion: S.rm, prev: 'arcade',
  });
}

// ---- drawing ---------------------------------------------------------------------------------
const canvas = document.getElementById('c'), wrap = document.getElementById('wrap'), hud = document.getElementById('hud');
const persp = createPerspRenderer({ cols: COLS, rows: ROWS });
let W = 0, H = 0, DPR = 1, lastMs = 0, fps = 0, lastCheck = null;
export function layout(w, h) {
  const cell = Math.floor(Math.min((0.94 * w) / COLS, (0.8 * h) / ROWS)), bw = cell * COLS, bh = cell * ROWS;
  return { w, h, cell, bx: Math.round((w - bw) / 2), by: Math.round((h - bh) * 0.6), bw, bh, cols: COLS, rows: ROWS };
}
const wrongMod = () => (S.only ? wrongOnly : wrongAll);
function size() {
  const fixed = SIZES[S.size], vw = innerWidth, vh = innerHeight;
  const [w, h] = fixed || [vw, vh];
  DPR = Math.min(2, devicePixelRatio || 1);
  if (w !== W || h !== H || canvas.width !== Math.round(w * DPR)) {
    W = w; H = h;
    canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
  wrap.style.transform = `scale(${Math.min(1, vw / w, vh / h)})`;
}
function draw(ctx, w, h, dpr, snap, fx, mode = S.mode, room = ROOMS[S.room], m = wrongMod()) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mode === 'persp') persp.render(ctx, w, h, room, S.view, snap, fx);
  else { const L = layout(w, h); m.scenery(ctx, L, snap, fx); m.board(ctx, L, snap, fx); }
}
function advance(dt) {
  S.now += dt;
  if (!S.paused) S.time += dt / 1000;
  if (!S.paused && S.alive) { S.acc += dt; while (S.acc >= S.stepMs) { S.acc -= S.stepMs; step(); } }
  if (S.auto && S.alive && S.now - S.autoAt > 1400) { S.autoAt = S.now; biteNow(); }
}
function status() {
  hud.className = S.hide ? 'hide' : '';
  if (S.hide) return;
  const fx = makeFx(), m = wrongMod();
  let t = `${S.mode} ${W}×${H}@${DPR} · ${lastMs.toFixed(2)} ms · ${fps} fps · score ${S.score} · variant ${S.variant} · chaos ${fx.chaos.toFixed(2)}${S.rf ? ' · RF' : ''}${S.rm ? ' · RM' : ''}`;
  if (S.mode === 'wrong') { const P = m.planFor(fx); t += `\n${S.only ? 'ONLY ' : ''}eras [${m.eras().join(' ')}] · ${P.layout} · order ${P.order.join('>')} · board ${P.boardId}`; }
  else t += `\nroom ${ROOMS[S.room].id} · view ${S.view}${S.view === 'pov' ? ' (falls back to board)' : ''}`;
  if (lastCheck) t += `\ncheck: ${lastCheck.summary}`;
  hud.textContent = t;
}
function render() {
  size();
  const ctx = canvas.getContext('2d');
  const t0 = performance.now();
  draw(ctx, W, H, DPR, snapshot(), makeFx());
  lastMs = performance.now() - t0;
  status();
}
function frame(dt = 1000 / 60) { advance(dt); render(); }
let lastT = performance.now(), fN = 0, fT = 0;
function loop(t) {
  const dt = Math.min(100, t - lastT); lastT = t;
  fN++; fT += dt; if (fT > 500) { fps = Math.round((fN * 1000) / fT); fN = 0; fT = 0; }
  frame(dt);
  requestAnimationFrame(loop);
}

// ---- cell check ------------------------------------------------------------------------------
function off(w, h, dpr) {
  const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g;
}
const img = (g) => g.getImageData(0, 0, g.canvas.width, g.canvas.height);
function px(im, dpr, x, y) { const i = (Math.round(y * dpr - 0.5) * im.width + Math.round(x * dpr - 0.5)) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2]]; }
const same = (a, b, tol = 0) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
function testSnap(len, alive, end = 77) {
  const snake = []; for (let k = 0; k < len; k++) { const p = at(end - k); snake.push({ x: p[0], y: p[1] }); }
  const occ = new Set(snake.map((c) => c.x + ',' + c.y)); let food = null;
  for (let k = 0; k < N && !food; k++) { const c = { x: (k * 7) % COLS, y: Math.floor((k * 7) / COLS) % ROWS }; if (!occ.has(c.x + ',' + c.y)) food = c; }
  const dir = dirOf(snake[0], snake[1]), dd = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  return freeze({ cols: COLS, rows: ROWS, snake, dir, prevDir: dir, prevTail: snake[len - 1], grew: false, food, score: len - 3, stepMs: 120, tick: 99, progress: 0.4,
    alive, paused: false, death: alive ? null : { reason: 'wall', cell: { x: snake[0].x + dd[0], y: snake[0].y + dd[1] } } });
}
const testFx = (variant, extra = {}) => freeze({ now: 5000, time: 3.21, beat: 0.4, beatIndex: 9, chaos: 0.8, punch: 0, variant, bite: null, biteAge: Infinity, cutAge: 2000, reducedFlash: false, reducedMotion: false, prev: 'arcade', ...extra });
const SIBS = {};
for (const id of ['lcd', 'arcade', 'acid', 'timewarp', 'kombat', 'desktop']) { try { SIBS[id] = await import(`../src/render/timelines/${id}.js`); } catch (_) { /* missing is fine */ } }
/** Wrong: every cell of the full collage equals the owner's board drawn alone; occupied cells really are drawn.
 *  Only flat pixels are compared (all 4 neighbours equal): LCD's own scenery shifts antialiased stroke
 *  edges of its board by ~11 units even without wrong.js, so edge pixels prove nothing either way. */
function flatAt(im, X, Y) {
  const i = (Y * im.width + X) * 4, d = im.data;
  for (const o of [-4, 4, -im.width * 4, im.width * 4]) for (let k = 0; k < 3; k++) if (Math.abs(d[i + k] - d[i + o + k]) > 2) return false;
  return true;
}
function checkWrong(m, w, h, dpr, snap, fx) {
  const L = layout(w, h), id = m.boardOwner(fx), fails = [];
  const A = off(w, h, dpr); m.scenery(A, L, snap, fx); m.board(A, L, snap, fx);
  const B = off(w, h, dpr); m.board(B, L, snap, fx);
  const ia = img(A), ib = img(B);
  let compared = 0;
  const step = Math.max(1, Math.floor((L.cell * dpr) / 6));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const X0 = Math.round((L.bx + x * L.cell) * dpr), Y0 = Math.round((L.by + y * L.cell) * dpr), S = Math.round(L.cell * dpr);
    let bad = 0;
    for (let yy = Y0 + 1; yy < Y0 + S - 1; yy += step) for (let xx = X0 + 1; xx < X0 + S - 1; xx += step) {
      if (!flatAt(ib, xx, yy)) continue;
      compared++;
      const i = (yy * ib.width + xx) * 4;
      if (Math.abs(ia.data[i] - ib.data[i]) > 2 || Math.abs(ia.data[i + 1] - ib.data[i + 1]) > 2 || Math.abs(ia.data[i + 2] - ib.data[i + 2]) > 2) bad++;
    }
    if (bad) fails.push(`cell ${x},${y} touched (${bad})`);
  }
  if (compared < ROWS * COLS * 4) fails.push(`only ${compared} flat samples`);
  const sib = SIBS[id];
  if (sib) {
    const E = off(w, h, dpr); let ok = true;
    try { sib.board(E, L, freeze({ ...snap, snake: [snap.snake[snap.snake.length - 1]], food: null }), fx); } catch (_) { ok = false; }
    if (ok) {
      // Drawn = at least 4% of the cell's pixels change when the cell is occupied (LCD draws hollow outlines when dead).
      const ie = img(E), occ = snap.snake.slice(0, -1).concat(snap.food ? [snap.food] : []);
      for (const c of occ) {
        const X0 = Math.round((L.bx + c.x * L.cell) * dpr), Y0 = Math.round((L.by + c.y * L.cell) * dpr), S = Math.round(L.cell * dpr);
        let diff = 0;
        for (let yy = Y0; yy < Y0 + S; yy++) for (let xx = X0; xx < X0 + S; xx++) {
          const i = (yy * ib.width + xx) * 4;
          if (Math.abs(ib.data[i] - ie.data[i]) + Math.abs(ib.data[i + 1] - ie.data[i + 1]) + Math.abs(ib.data[i + 2] - ie.data[i + 2]) >= 24) diff++;
        }
        if (diff < S * S * 0.04) fails.push(`cell ${c.x},${c.y} not drawn`);
      }
    }
  }
  return { id, fails };
}
/** Persp: block tops have their exact flat colour, empty floor centres show the panel, the dot shows. */
function checkPersp(room, w, h, dpr, snap, fx) {
  const g = off(w, h, dpr); persp.render(g, w, h, room, 'board', snap, fx);
  const im = img(g), pal = persp.colors(room), Hh = persp.heights, fails = [];
  const n = snap.snake.length, dead = !snap.alive, occ = new Set(), skip = new Set();
  snap.snake.forEach((c, i) => {
    occ.add(c.x + ',' + c.y);
    const head = i === 0, tail = i === n - 1 && n > 2;
    const o = head ? 0.32 : 0.18, hgt = head ? Hh.head : tail ? Hh.tail : Hh.body;
    const want = head ? (dead ? pal.deadHead : pal.head) : dead ? pal.dead : tail ? pal.tail : pal.body;
    const p = persp.cellPoint(w, h, c.x - o, c.y + o, hgt, fx), got = px(im, dpr, p[0], p[1]);
    if (!same(got, want, 3)) fails.push(`${head ? 'head' : tail ? 'tail' : 'body'} ${c.x},${c.y} got ${got} want ${want}`);
    if (head) skip.add(c.x + ',' + (c.y - 1));
  });
  if (snap.food) {
    const f = snap.food; occ.add(f.x + ',' + f.y); skip.add(f.x + ',' + (f.y - 1));
    const p = persp.cellPoint(w, h, f.x, f.y, 0.4, fx);
    if (dist(px(im, dpr, p[0], p[1]), pal.panel) < 60) fails.push(`dot ${f.x},${f.y} not visible`);
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + ',' + y; if (occ.has(k) || skip.has(k)) continue;
    const p = persp.cellPoint(w, h, x, y, 0, fx), got = px(im, dpr, p[0], p[1]);
    if (!same(got, pal.panel, 3)) fails.push(`floor ${x},${y} got ${got}`);
  }
  return { fails };
}
async function check({ variants = 8, dprs = [1, 2] } = {}) {
  const t0 = performance.now(), sizes = [[1280, 720], [390, 844]];
  const snaps = [testSnap(10, true), testSnap(140, true, 200), testSnap(40, false, 120)];
  let runs = 0, bad = []; const owners = new Set();
  for (const dpr of dprs) for (const [w, h] of sizes) for (const snap of snaps) {
    for (const [name, m] of [['all', wrongAll], ['only', wrongOnly]]) for (let v = 0; v < (dpr === 1 ? variants : 3); v++) {
      const r = checkWrong(m, w, h, dpr, snap, testFx(v)); runs++; owners.add(r.id);
      if (r.fails.length) bad.push(`wrong/${name} v${v} ${w}×${h}@${dpr} len${snap.snake.length}${snap.alive ? '' : ' dead'} [${r.id}]: ${r.fails.slice(0, 3).join('; ')}`);
    }
    for (const room of ROOMS) {
      const r = checkPersp(room, w, h, dpr, snap, testFx(0)); runs++;
      if (r.fails.length) bad.push(`persp/${room.id} ${w}×${h}@${dpr} len${snap.snake.length}${snap.alive ? '' : ' dead'}: ${r.fails.slice(0, 3).join('; ')}`);
    }
  }
  lastCheck = { runs, failed: bad.length, bad, owners: [...owners], ms: Math.round(performance.now() - t0), summary: `${runs - bad.length}/${runs} pass · board owners ${[...owners].join(',')}` };
  console.log('[flat-c] check', lastCheck.summary, bad);
  status();
  return lastCheck;
}

// ---- input + boot -----------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === '1') S.mode = 'wrong';
  else if (k === '2') S.mode = 'persp';
  else if (k === 'w') S.mode = S.mode === 'wrong' ? 'persp' : 'wrong';
  else if (k === 'b') biteNow();
  else if (k === 'a') S.auto = !S.auto;
  else if (k === '[') S.variant = Math.max(0, S.variant - 1);
  else if (k === ']') S.variant++;
  else if (k === 'o') S.only = !S.only;
  else if (k === 'g') S.room = (S.room + 1) % ROOMS.length;
  else if (k === 'v') S.view = S.view === 'board' ? 'pov' : 'board';
  else if (k === 'c') S.chaos = S.chaos == null ? 0 : S.chaos === 0 ? 0.5 : S.chaos === 0.5 ? 1 : null;
  else if (k === 'f') S.rf = !S.rf;
  else if (k === 'm') S.rm = !S.rm;
  else if (k === 'k') kill();
  else if (k === 'r') reset();
  else if (k === 'l') { S.len = 120; placeFood(); }
  else if (k === 'p') S.paused = !S.paused;
  else if (k === '7') S.size = 'fit';
  else if (k === '8') S.size = 'land';
  else if (k === '9') S.size = 'port';
  else if (k === 'x') check();
  else if (k === 'h') S.hide = !S.hide;
  else return;
  e.preventDefault();
  render();
});
addEventListener('resize', render);
placeFood();
window.__flatC = {
  S, frame, render, check, layout, wrongAll, wrongOnly, persp, ROOMS, biteNow, kill, reset,
  /** Advance `ms` of fake time in 1/60 s steps, then draw once (for a throttled, hidden pane). */
  run(ms) { for (let t = 0; t < ms; t += 1000 / 60) advance(1000 / 60); render(); return { score: S.score, variant: S.variant }; },
  set(o) { Object.assign(S, o); render(); return S; },
};
render();
requestAnimationFrame(loop);
