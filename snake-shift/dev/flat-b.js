// flat-b harness: fakes a snapshot (§3) and fx (§15.3) to show desktop / kombat in isolation.
// Copied from dev/flat-a.js; modules load dynamically so one broken timeline does not hide the other.
// window.__flatB.drive(n, dtMs) runs n frames by hand when the pane throttles requestAnimationFrame.
// The fake snake follows a Hamiltonian cycle so it never dies; "bite" puts the dot right in front of it.
const TL = {};
for (const id of ['desktop', 'kombat']) {
  try { TL[id] = await import(`../src/render/timelines/${id}.js?v=${Date.now()}`); } catch (e) { console.error('load ' + id, e); }
}
const IDS = Object.keys(TL);
const COLS = 16, ROWS = 16, N = COLS * ROWS;
const SIZES = { fit: null, '1280×720': [1280, 720], '390×844': [390, 844] };
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
  id: IDS.includes(q.get('tl')) ? q.get('tl') : IDS[0], prev: null, size: SIZES[q.get('size')] !== undefined ? q.get('size') : 'fit',
  idx: 2, len: 3, food: null, score: 0, alive: true, tick: 0, grew: false, prevTail: null, death: null, dir: 'down', prevDir: 'down',
  stepMs: 150, acc: 0, paused: false, rf: q.has('rf'), rm: q.has('rm'), chaos: null, variant: 0, bite: null, biteAt: -Infinity,
  cutAt: performance.now(), auto: q.has('auto'), autoAt: 0, time: 0, hide: false,
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
  if (eat) { S.len = Math.min(N - 4, S.len + 1); S.score++; S.variant++; S.bite = { x: h[0], y: h[1] }; S.biteAt = performance.now(); placeFood(); }
  const c = cells();
  S.prevDir = S.dir; S.dir = dirOf(c[0], c[1]); S.tick++;
  S.stepMs = Math.max(95, 150 - 1.5 * S.score);
}
function reset() {
  Object.assign(S, { idx: 2, len: 3, score: 0, alive: true, tick: 0, grew: false, prevTail: null, death: null, dir: 'down', prevDir: 'down', variant: 0, bite: null, biteAt: -Infinity, stepMs: 150, acc: 0 });
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
    cols: COLS, rows: ROWS, snake: cells(), dir: S.dir, prevDir: S.prevDir, prevTail: S.prevTail, grew: S.grew,
    food: S.food ? { ...S.food } : null, score: S.score, stepMs: S.stepMs, tick: S.tick, progress: Math.min(1, S.acc / S.stepMs),
    alive: S.alive, paused: S.paused, death: S.death,
  });
}
const BEAT_MS = 60000 / 132, T0 = performance.now();
function makeFx(now, over = {}) {
  const ph = (now - T0) / BEAT_MS, biteAge = now - S.biteAt;
  const fx = {
    now, time: S.time, beat: Math.exp(-(ph % 1) * 5) * (S.rf ? 0.15 : 1), beatIndex: Math.floor(ph),
    chaos: S.chaos ?? Math.min(1, S.score / 25), punch: S.rf ? 0 : Math.max(0, 1 - biteAge / 300), variant: S.variant,
    bite: S.bite, biteAge: S.bite ? biteAge : Infinity, cutAge: now - S.cutAt, reducedFlash: S.rf, reducedMotion: S.rm, prev: S.prev,
  };
  return Object.assign(fx, over);
}
function layout(w, h) {
  const cell = Math.floor(Math.min((0.94 * w) / COLS, (0.8 * h) / ROWS)), bw = cell * COLS, bh = cell * ROWS;
  return { w, h, cell, bx: Math.round((w - bw) / 2), by: Math.round((h - bh) * 0.6), bw, bh, cols: COLS, rows: ROWS };
}

// ── canvas + sizing
const cv = document.getElementById('cv'), ctx = cv.getContext('2d'), stage = document.getElementById('stage');
let L = null, dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const fixed = SIZES[S.size], w = fixed ? fixed[0] : innerWidth, h = fixed ? fixed[1] : innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const k = fixed ? Math.min(1, (innerWidth - 16) / w, (innerHeight - 16) / h) : 1;
  stage.style.transform = `scale(${k})`;
  L = layout(w, h);
}
addEventListener('resize', resize);

// ── UI
const $ = (id) => document.getElementById(id);
function setTl(id) { if (id !== S.id) { S.prev = S.id; S.id = id; S.cutAt = performance.now(); } sync(); }
$('tl').innerHTML = IDS.map((id, i) => `<button data-tl="${id}">${id} [${i + 1}]</button>`).join('');
$('sizes').innerHTML = Object.keys(SIZES).map((k, i) => `<button data-size="${k}">${k} [${i + 7}]</button>`).join('');
$('tl').onclick = (e) => e.target.dataset.tl && setTl(e.target.dataset.tl);
$('sizes').onclick = (e) => { if (e.target.dataset.size) { S.size = e.target.dataset.size; resize(); sync(); } };
const CH = [null, 0, 0.5, 1];
const act = {
  bite: biteNow, auto: () => (S.auto = !S.auto), pause: () => (S.paused = !S.paused), kill, reset, long: () => { S.len = 140; S.score = 20; placeFood(); },
  rf: () => (S.rf = !S.rf), rm: () => (S.rm = !S.rm), chaos: () => (S.chaos = CH[(CH.indexOf(S.chaos) + 1) % CH.length]),
  runcheck: () => { $('check').textContent = check().text; }, hide: () => { S.hide = !S.hide; $('ui').style.opacity = S.hide ? 0.12 : 1; },
};
for (const k of Object.keys(act)) $(k).onclick = () => { act[k](); sync(); };
const KEYS = { KeyB: 'bite', KeyA: 'auto', KeyP: 'pause', KeyK: 'kill', KeyR: 'reset', KeyL: 'long', KeyF: 'rf', KeyM: 'rm', KeyC: 'chaos', KeyX: 'runcheck', KeyH: 'hide' };
addEventListener('keydown', (e) => {
  if (KEYS[e.code]) { act[KEYS[e.code]](); sync(); }
  const n = +e.key;
  if (n >= 1 && n <= IDS.length) setTl(IDS[n - 1]);
  if (n >= 7 && n <= 9) { S.size = Object.keys(SIZES)[n - 7]; resize(); sync(); }
});
function sync() {
  document.querySelectorAll('[data-tl]').forEach((b) => b.classList.toggle('on', b.dataset.tl === S.id));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === S.size));
  for (const k of ['auto', 'pause', 'rf', 'rm']) $(k).classList.toggle('on', !!S[k === 'pause' ? 'paused' : k]);
  $('chaos').textContent = `chaos ${S.chaos === null ? 'auto' : S.chaos} [C]`;
}

// ── cell check: draws board() alone and classifies every cell centre against an empty cell's colour.
function check() {
  const base = snapshot(), lines = [];
  const hd = base.snake[0], dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[base.dir];
  const dead = freeze({ ...base, alive: false, death: { reason: 'self', cell: { x: hd.x + dv[0], y: hd.y + dv[1] } } });
  let fails = 0, runs = 0;
  for (const id of IDS) for (const prev of [null]) for (const sz of [[1280, 720], [390, 844]]) for (const snap of [base, dead]) {
    const c = document.createElement('canvas'); c.width = sz[0]; c.height = sz[1];
    const g = c.getContext('2d'), LL = layout(sz[0], sz[1]);
    const fx = makeFx(performance.now(), { bite: null, biteAge: Infinity, punch: 0, beat: 0, prev });
    TL[id].board(g, LL, snap, fx);
    TL[id].scenery(c.getContext('2d'), LL, snap, fx); // must not throw either; drawn after so it cannot affect the board sample
    const g2 = document.createElement('canvas'); g2.width = sz[0]; g2.height = sz[1];
    const gg = g2.getContext('2d'); TL[id].board(gg, LL, snap, fx);
    const data = gg.getImageData(0, 0, sz[0], sz[1]).data;
    const occ = new Set(snap.snake.map((p) => p.x + ',' + p.y)); if (snap.food) occ.add(snap.food.x + ',' + snap.food.y);
    const px = (x, y) => { const i = ((LL.by + Math.floor((y + 0.5) * LL.cell)) * sz[0] + LL.bx + Math.floor((x + 0.5) * LL.cell)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    let ref = null;
    for (let y = 0; y < ROWS && !ref; y++) for (let x = 0; x < COLS && !ref; x++) if (!occ.has(x + ',' + y)) ref = px(x, y);
    const bad = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const p = px(x, y), diff = Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
      if ((diff > 60) !== occ.has(x + ',' + y)) bad.push(`${x},${y}`);
    }
    runs++; if (bad.length) fails++;
    lines.push(`${bad.length ? 'FAIL' : 'ok  '} ${id}${prev ? '<' + prev : ''} ${sz.join('x')} ${snap.alive ? 'alive' : 'dead '} cell=${LL.cell}${bad.length ? ' bad:' + bad.slice(0, 6).join(' ') : ''}`);
  }
  const text = `cells: ${runs - fails}/${runs} pass (snake ${base.snake.length}, food ${base.food ? base.food.x + ',' + base.food.y : '-'})\n` + lines.join('\n');
  console.log(text);
  return { runs, fails, text };
}

// ── loop
const perf = { sc: 0, bd: 0, n: 0, fps: 0, last: 0, frames: 0, t: performance.now() };
let last = performance.now(), errored = false;
function frame(now, manual) {
  const dt = Math.min(100, now - last); last = now;
  if (!S.paused && S.alive) { S.acc += dt; while (S.acc >= S.stepMs) { S.acc -= S.stepMs; step(); } }
  S.time += (dt / 1000) * (S.rm ? 0.15 : 1);
  if (S.auto && S.alive && now - S.autoAt > 1800) { S.autoAt = now; biteNow(); }
  const snap = snapshot(), fx = makeFx(now), mod = TL[S.id];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  try {
    const t0 = performance.now(); mod.scenery(ctx, L, snap, fx);
    const t1 = performance.now(); mod.board(ctx, L, snap, fx);
    const t2 = performance.now();
    perf.sc += t1 - t0; perf.bd += t2 - t1; perf.n++;
  } catch (e) { if (!errored) { errored = true; console.error(e); } }
  perf.frames++;
  if (now - perf.t > 1000) {
    $('stats').textContent = `${S.id}  ${L.w}x${L.h} cell ${L.cell} dpr ${dpr}\n` +
      `scenery ${(perf.sc / perf.n).toFixed(2)} ms  board ${(perf.bd / perf.n).toFixed(2)} ms  fps ${Math.round((perf.frames * 1000) / (now - perf.t))}\n` +
      `score ${S.score} len ${S.len} variant ${S.variant} chaos ${fx.chaos.toFixed(2)} ${S.alive ? '' : 'DEAD'}`;
    window.__flatB.perf = { scenery: perf.sc / perf.n, board: perf.bd / perf.n };
    perf.sc = perf.bd = perf.n = perf.frames = 0; perf.t = now;
  }
  if (!manual) requestAnimationFrame(frame);
}
window.__flatB = { S, drive: (n = 1, dt = 16) => { let t = last; for (let i = 0; i < n; i++) { t += dt; frame(t, true); } return S.time; }, check, setTl, placeFood, biteNow, kill, reset, snapshot, perf: null, setSize: (k) => { S.size = k; resize(); sync(); } };
resize(); placeFood(); sync(); requestAnimationFrame(frame);

// still(id, [w, h], fxOverrides, snapOverrides): renders one frame into a fixed overlay (click it to close),
// so bite frames can be inspected even when the pane throttles animation.
window.__flatB.still = (id = S.id, sz = [1280, 720], over = {}, snapOver = {}) => {
  let o = document.getElementById('still');
  if (!o) { o = document.createElement('canvas'); o.id = 'still'; o.style.cssText = 'position:fixed;left:0;top:0;z-index:20;max-width:100vw;max-height:100vh;background:#000'; o.onclick = () => o.remove(); document.body.appendChild(o); }
  o.width = sz[0]; o.height = sz[1];
  const g = o.getContext('2d'), LL = layout(sz[0], sz[1]), snap = freeze({ ...snapshot(), ...snapOver });
  const fx = makeFx(performance.now(), over);
  TL[id].scenery(g, LL, snap, fx); TL[id].board(g, LL, snap, fx);
  return { cell: LL.cell, bx: LL.bx, by: LL.by };
};
