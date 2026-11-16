// engine-ext harness (LEVELS_PLAN 5). Renders on demand only (the pane may throttle rAF).
// __ext.hashes()      pixel hashes of the four existing rooms (both views, calm and wild) -> compare with BASELINE
// __ext.check()       everything: hashes, gap-safe snake, items mask, lane strip, custom cube
// __ext.show(name)    draw one named scene for a screenshot
import { createRoomRenderer, ROOM_IDS } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const $ = (id) => document.getElementById(id);
const out = $('out');
const canvas = $('gl');
const log = (s) => { out.textContent = s; };

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
const cells = (list) => list.map(([x, y]) => ({ x, y }));
function snapOf(o) {
  const snake = o.snake || [];
  return deepFreeze({
    cols: COLS, rows: ROWS, snake, breaks: o.breaks || [], length: o.length ?? snake.length,
    dir: o.dir || 'up', prevDir: o.dir || 'up', heading: o.dir || 'up',
    prevTail: 'prevTail' in o ? o.prevTail : snake[snake.length - 1] || null,
    grew: !!o.grew, food: 'food' in o ? o.food : { x: 4, y: 3 }, mushroom: o.mushroom || null,
    score: 3, stepMs: 150, tick: o.tick ?? 9, progress: o.progress ?? 0.4, alive: true, paused: false,
    waiting: o.waiting || null, death: null, lives: 3, maxLives: 5,
    universe: { id: 'court', rules: 'box', mushrooms: false, index: 2, holdLeft: 0 },
    space: o.space || { kind: 'box' }, body: o.body || null, foodAt: o.foodAt || null, seed: 1,
  });
}
function fxOf(o = {}) {
  return {
    now: 1000, time: 2, beat: 0, beatIndex: 0, chaos: 0, punch: 0, variant: 1, bite: null, biteAge: Infinity,
    cutAge: 1e6, reducedFlash: false, reducedMotion: false, ...o,
  };
}
const CALM = fxOf();
const WILD = fxOf({ beat: 0.8, chaos: 1, punch: 0.36, bite: { x: 9, y: 11 }, biteAge: 120, variant: 3 });

const SNAKE_A = cells([[8, 10], [8, 11], [9, 11], [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [11, 7], [12, 7], [12, 8], [12, 9]]);
const POV_A = cells([[5, 14], [5, 15], [6, 15], [7, 15], [7, 14], [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [6, 9], [5, 9], [4, 9]]);

function fnv(px) {
  let h = 0x811c9dc5;
  for (let i = 0; i < px.length; i++) { h ^= px[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function setSize(w, h) {
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  R.resize(w, h, 1);
}
function readPx() {
  const gl = R.debug.gl;
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { px, W, H };
}
function draw(room, view, snap, fx) {
  R.render(room, view, snap, fx);
  R.render(room, view, snap, fx);
}

// ---------- 1. existing rooms stay bit-identical ----------
const OLD_ROOMS = ['court', 'disco', 'plastic', 'bunker'];
// Captured from the engine before any engine-ext change (same machine, same GPU).
const BASELINE = {"court/board/calm/640x400":"108510f9","court/board/wild/640x400":"fd659e68","court/pov/calm/640x400":"2f28cfb9","court/pov/wild/640x400":"63fb6734","disco/board/calm/640x400":"37ce95ae","disco/board/wild/640x400":"505dd2e8","disco/pov/calm/640x400":"92e63ec5","disco/pov/wild/640x400":"33e8bbab","plastic/board/calm/640x400":"5005ae86","plastic/board/wild/640x400":"ae72ea9e","plastic/pov/calm/640x400":"931c02b6","plastic/pov/wild/640x400":"0ea5c7f4","bunker/board/calm/640x400":"5e80e624","bunker/board/wild/640x400":"0226f477","bunker/pov/calm/640x400":"7d3a87a5","bunker/pov/wild/640x400":"8f9c9317","court/board/calm/300x520":"58a4a84e","court/board/wild/300x520":"7c146dfa","court/pov/calm/300x520":"8609aaf9","court/pov/wild/300x520":"2d2eba16","disco/board/calm/300x520":"19d52577","disco/board/wild/300x520":"68f7df65","disco/pov/calm/300x520":"f208f400","disco/pov/wild/300x520":"9e621445","plastic/board/calm/300x520":"9dd972ce","plastic/board/wild/300x520":"b2499220","plastic/pov/calm/300x520":"30ded1ca","plastic/pov/wild/300x520":"6a243227","bunker/board/calm/300x520":"1a0ffeb1","bunker/board/wild/300x520":"7a22b61f","bunker/pov/calm/300x520":"0a0bdfc2","bunker/pov/wild/300x520":"2aedda58"};
function compareBaseline() {
  const h = hashes();
  const diff = Object.keys(BASELINE).filter((k) => h[k] !== BASELINE[k]);
  return { frames: Object.keys(BASELINE).length, identical: Object.keys(BASELINE).length - diff.length, diff };
}
function hashes() {
  const res = {};
  for (const [w, h] of [[640, 400], [300, 520]]) {
    setSize(w, h);
    for (const room of OLD_ROOMS) {
      for (const view of ['board', 'pov']) {
        for (const [fxName, fx] of [['calm', CALM], ['wild', WILD]]) {
          const snap = snapOf({ snake: view === 'pov' ? POV_A : SNAKE_A, food: { x: 3, y: 4 } });
          draw(room, view, snap, fx);
          res[`${room}/${view}/${fxName}/${w}x${h}`] = fnv(readPx().px);
        }
      }
    }
  }
  return res;
}

// ---------- 2. checks for the new hooks ----------
const cx = (x) => x - COLS / 2 + 0.5;
function classify(r, g, b) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (r > 150 && g > 100 && b < 0.6 * r) return 'dot';
  if (lum > 90 && b >= 0.85 * r) return 'snake';
  if (lum < 75) return 'empty';
  return `?(${r | 0},${g | 0},${b | 0})`;
}
function sample(img, p) {
  const sx = Math.round(p.x), sy = img.H - 1 - Math.round(p.y);
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = sx + dx, Y = sy + dy;
    if (X < 0 || Y < 0 || X >= img.W || Y >= img.H) continue;
    const i = (Y * img.W + X) * 4;
    r += img.px[i]; g += img.px[i + 1]; b += img.px[i + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
// Brightest pixel within 2 px: for far items only a few pixels wide.
function brightest(img, p) {
  const sx = Math.round(p.x), sy = img.H - 1 - Math.round(p.y);
  let best = [0, 0, 0], bl = -1;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const X = sx + dx, Y = sy + dy;
    if (X < 0 || Y < 0 || X >= img.W || Y >= img.H) continue;
    const i = (Y * img.W + X) * 4, l = img.px[i] + img.px[i + 1] + img.px[i + 2];
    if (l > bl) { bl = l; best = [img.px[i], img.px[i + 1], img.px[i + 2]]; }
  }
  return best;
}
// Pixel classification of board cells (and extra world points) for one render.
// o: { cells: [[x, y]] (default all), base: y of the board plane, skipHead, extra: [{ at: [x, y, z], want }] }
function cellCheck(room, view, snap, fx, o = {}) {
  draw(room, view, snap, fx);
  const img = readPx();
  const snakeSet = new Set(snap.snake.map((c) => c.x + c.y * COLS));
  const head = snap.snake[0] ? snap.snake[0].x + snap.snake[0].y * COLS : -1;
  const list = o.cells || Array.from({ length: COLS * ROWS }, (_, k) => [k % COLS, (k / COLS) | 0]);
  const base = o.base || 0;
  let tested = 0, skipped = 0;
  const bad = [];
  const test = (wx, wy, wz, want, label, peak) => {
    const p = R.debug.project(wx, wy, wz);
    if (!p.visible) { skipped++; return; }
    const got = classify(...(peak ? brightest(img, p) : sample(img, p)));
    tested++;
    if (got !== want) bad.push(`${label} want ${want} got ${got}`);
  };
  for (const [x, y] of list) {
    const k = x + y * COLS;
    if ((view === 'pov' || o.skipHead) && k === head) continue;
    const want = snakeSet.has(k) ? 'snake' : snap.food && snap.food.x === x && snap.food.y === y ? 'dot' : 'empty';
    const h = want === 'snake' ? (k === head ? 0.3 : 0.26) : want === 'dot' ? 0.18 : 0;
    const [wx, wz] = R.debug.cellToWorld(x, y);
    test(wx, base + h, wz, want, `${x},${y}`);
  }
  for (const e of o.extra || []) { // `at` may be a function, evaluated after the render (lane state)
    const at = typeof e.at === 'function' ? e.at() : e.at;
    test(at[0], at[1], at[2], e.want, e.label || at.join(','), e.peak);
  }
  return { tested, skipped, bad: bad.length, list: bad.slice(0, 6) };
}
// Post-effects mask: render WILD with the pass at zero strength and at full strength; the listed world
// points must not change at all, and a real share of the frame must change (the effects are on).
function maskCheck(room, view, snap, points) {
  const post = R.debug.post;
  post.zero = true;
  draw(room, view, snap, WILD);
  const A = readPx();
  post.zero = false;
  draw(room, view, snap, WILD);
  const B = readPx();
  const active = post.active;
  let maxD = 0, tested = 0;
  for (const w of points) {
    const p = R.debug.project(w[0], w[1], w[2]);
    if (!p.visible) continue;
    tested++;
    const a = sample(A, p), b = sample(B, p);
    maxD = Math.max(maxD, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }
  let changed = 0;
  for (let i = 0; i < A.px.length; i += 4) if (A.px[i] !== B.px[i] || A.px[i + 1] !== B.px[i + 1] || A.px[i + 2] !== B.px[i + 2]) changed++;
  return { active, tested, maxDelta: maxD, changedShare: +(changed / (A.px.length / 4)).toFixed(3) };
}
// Exact item test: the item's own pixels are those that differ between the zero-strength frames with
// and without it. Under full effects every one of them must stay identical; `exposed` counts how many of
// them change in the frame without the item (they lie outside the board volume, so only items(d) covers them).
function itemMask(room, view, withItem, without) {
  const post = R.debug.post;
  post.zero = true;
  draw(room, view, without, WILD);
  const A = readPx();
  draw(room, view, withItem, WILD);
  const B = readPx();
  post.zero = false;
  draw(room, view, withItem, WILD);
  const C = readPx();
  const active = post.active;
  draw(room, view, without, WILD);
  const D = readPx();
  let item = 0, bad = 0, exposed = 0;
  for (let i = 0; i < A.px.length; i += 4) {
    if (A.px[i] === B.px[i] && A.px[i + 1] === B.px[i + 1] && A.px[i + 2] === B.px[i + 2]) continue;
    item++;
    if (B.px[i] !== C.px[i] || B.px[i + 1] !== C.px[i + 1] || B.px[i + 2] !== C.px[i + 2]) bad++;
    if (A.px[i] !== D.px[i] || A.px[i + 1] !== D.px[i + 1] || A.px[i + 2] !== D.px[i + 2]) exposed++;
  }
  return { active, itemPixels: item, changedUnderEffects: bad, exposedWithoutItem: exposed };
}
const near = (a, b) => Math.abs(a - b) < 1e-5; // segment positions are Float32

// Fake snapshots shaped as LEVELS_PLAN 3.3.
const BROKEN = cells([[8, 10], [8, 11], [8, 12], [8, 13], [3, 4], [3, 3], [4, 3], [5, 3]]);
const SC = {
  // broken snake, null food, null prevTail (box space)
  gap: (o = {}) => snapOf({ snake: BROKEN, breaks: [3], length: 12, food: null, prevTail: null, tick: 0, ...o }),
  // short respawned snake waiting for a key, mid-tick progress that must be ignored
  respawn: () => snapOf({ snake: cells([[8, 9], [8, 10], [8, 11]]), prevTail: null, length: 3, tick: 50, progress: 0.7, waiting: 'respawn' }),
  // lane space: window moved one row forward this tick (y0 -40, prevY0 -39); the dot is 4 rows ahead of the window
  lane: (o = {}) => snapOf({
    snake: cells([[8, 8], [8, 9], [8, 10], [8, 11], [7, 11], [6, 11]]), food: null, foodAt: { x: 8, y: -44 },
    space: { kind: 'lane', y0: -40, prevY0: -39 }, progress: 1, ...o,
  }),
  // first person in the lane: a second visible piece ahead (break after the head piece), dot ahead off the window
  lanePov: () => snapOf({
    snake: cells([[8, 9], [8, 10], [8, 11], [8, 12], [5, 4], [5, 3], [5, 2]]), breaks: [3], length: 20,
    food: null, foodAt: { x: 11, y: -43 }, prevTail: null, space: { kind: 'lane', y0: -40, prevY0: -40 }, progress: 1,
  }),
  cube: () => snapOf({ snake: SNAKE_A, food: { x: 4, y: 3 }, tick: 0 }),
};

function layoutChecks() {
  const res = {};
  setSize(640, 400);
  // broken snake mid-tick: no interpolation across the break, none from a null prevTail
  draw('court', 'board', SC.gap({ tick: 9, progress: 0.4 }), CALM);
  let g = R.debug.segs();
  res.breakLinks = g.link.join('') === '11101110';
  res.breakNoBridge = near(g.x[3], cx(8)) && near(g.z[3], cx(13));
  res.nullPrevTail = near(g.x[7], cx(5)) && near(g.z[7], cx(3));
  res.interpInsidePiece = near(g.z[4], cx(3 + 0.4)) && near(g.x[0], cx(8)) && near(g.z[0], cx(10.6));
  // same cells with breaks missing: adjacency alone stops the bridge
  draw('court', 'board', SC.gap({ tick: 9, progress: 0.4, breaks: [] }), CALM);
  g = R.debug.segs();
  res.adjacencyOnly = g.link[3] === 0 && near(g.z[3], cx(13));
  // respawn: everything exactly on its cell
  draw('court', 'board', SC.respawn(), CALM);
  g = R.debug.segs();
  res.respawnExact = [[8, 9], [8, 10], [8, 11]].every(([x, y], i) => near(g.x[i], cx(x)) && near(g.z[i], cx(y)));
  // lane, half way through the tick, grew: origin glides, body sits half a row back
  draw('xstrip', 'board', SC.lane({ progress: 0.5, grew: true }), CALM);
  const L = R.debug.lane();
  g = R.debug.segs();
  res.laneOrigin = L.on && near(L.org, -39.5) && near(L.off, -0.5);
  res.laneRows = [[8, 9], [8, 10], [8, 11], [7, 11], [6, 11]].every(([x, y], i) => near(g.z[i + 1], cx(y - 0.5)));
  res.laneHead = near(g.z[0], cx(9 + (8 - 9) * 0.5 - 0.5));
  res.laneZ = near(R.debug.laneZ(-44), cx(-44 + 39.5));
  return res;
}

function pixelChecks() {
  const res = {};
  for (const [w, h] of [[640, 400], [300, 520]]) {
    setSize(w, h);
    const tag = `${w}x${h}`;
    res[`court gap, null food ${tag}`] = cellCheck('court', 'board', SC.gap(), CALM);
    res[`strip board ${tag}`] = cellCheck('xstrip', 'board', SC.lane(), CALM, {
      extra: [{ at: () => [cx(8), 0.18, R.debug.laneZ(-44)], want: 'dot', label: 'dot 4 rows ahead', peak: true }],
    });
    res[`strip board mid-scroll ${tag}`] = cellCheck('xstrip', 'board', SC.lane({ progress: 0.5, grew: true }), CALM, { skipHead: true });
    const pov = SC.lanePov();
    res[`strip pov ${tag}`] = cellCheck('xstrip', 'pov', pov, CALM, {
      cells: [[5, 4], [5, 3], [5, 2], [8, 4], [8, 3], [8, 2], [10, 5], [11, 6], [12, 4], [3, 5], [2, 3], [7, 6]],
      extra: [{ at: () => [cx(11), 0.18, R.debug.laneZ(-43)], want: 'dot', label: 'dot 3 rows ahead', peak: true }],
    });
    res[`cube top face ${tag}`] = cellCheck('xcube', 'board', SC.cube(), CALM, { base: 8 });
  }
  return res;
}

function maskChecks() {
  const res = {};
  setSize(640, 400);
  const cellPts = (snap, base = 0) => {
    const pts = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const [wx, wz] = R.debug.cellToWorld(x, y); pts.push([wx, base + 0.1, wz]); }
    return pts;
  };
  // items(d): a 1.15-high item on the strip, plus the open strip itself far beyond the window
  const withItem = SC.lane({ mushroom: { x: 12, y: 4 } });
  const [ix, iz] = (draw('xstrip', 'board', withItem, CALM), R.debug.cellToWorld(12, 4));
  const itemPts = [];
  for (let k = 0; k <= 10; k++) itemPts.push([ix, 0.1 * k + 0.05, iz], [ix - 0.3, 0.6 + 0.05 * k, iz], [ix + 0.3, 0.6 + 0.05 * k, iz]);
  const farPts = [];
  for (let Y = -80; Y <= -45; Y += 5) for (const x of [1, 8, 14]) farPts.push([cx(x), 0.05, R.debug.laneZ(Y)]);
  res.items = maskCheck('xstrip', 'board', withItem, itemPts);
  res.itemsVolume = R.debug.volumes().some((v) => v.box && v.hi[1] >= 1.1);
  res.stripBoard = maskCheck('xstrip', 'board', withItem, cellPts(withItem));
  res.stripFar = maskCheck('xstrip', 'board', withItem, farPts);
  res.stripPov = maskCheck('xstrip', 'pov', SC.lanePov(), cellPts(SC.lanePov()));
  // custom cube: the three visible faces, sampled on a 9 x 9 grid each, plus the snake on top
  const facePts = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const a = -7.9 + (15.8 * i) / 8, b = -7.9 + (15.8 * j) / 8;
    facePts.push([a, 8.15, b], [a, b, 8.01], [8.01, a, b]);
  }
  res.cubeFaces = maskCheck('xcube', 'board', SC.cube(), facePts);
  res.cubeNoBoardBox = R.debug.volumes().length === 3;
  // controls: the same points must change when nothing protects them
  const Fc = R.debug.frame(), keep = Fc.protect;
  Fc.protect = [];
  const ctl = maskCheck('xcube', 'board', SC.cube(), facePts);
  Fc.protect = keep;
  res.cubeControl = ctl.maxDelta > 20;
  // items on a closed board: an item on the far row sticks out past the board volume (height 0.46)
  const boxItem = snapOf({ snake: SNAKE_A, food: { x: 3, y: 4 }, tick: 0, mushroom: { x: 12, y: 0 } });
  draw('xstrip', 'board', boxItem, CALM);
  const [bx, bz] = R.debug.cellToWorld(12, 0);
  const topPts = [];
  for (let k = 0; k <= 8; k++) topPts.push([bx + (k - 4) * 0.08, 1.12, bz], [bx, 0.75 + 0.04 * k, bz - 0.25]);
  const noItem = snapOf({ snake: SNAKE_A, food: { x: 3, y: 4 }, tick: 0 });
  setSize(1280, 760);
  const ic = itemMask('xstrip', 'board', boxItem, noItem);
  res.itemsClosed = ic.active && ic.itemPixels > 100 && ic.changedUnderEffects === 0;
  res.itemsClosedExposed = ic.exposedWithoutItem > 10; // control: part of the item is outside the board volume
  res.itemsClosedDetail = JSON.stringify(ic);
  const io = itemMask('xstrip', 'board', withItem, SC.lane());
  res.itemsOpen = io.active && io.itemPixels > 100 && io.changedUnderEffects === 0;
  const ip = itemMask('xstrip', 'pov', snapOf({ ...SC.lanePov(), mushroom: { x: 10, y: 4 } }), SC.lanePov());
  res.itemsPov = ip.active && ip.itemPixels > 100 && ip.changedUnderEffects === 0;
  res.itemsPovDetail = JSON.stringify(ip);
  res.itemsOpenDetail = JSON.stringify(io);
  setSize(640, 400);
  return res;
}

function check() {
  const out = {
    baseline: compareBaseline(),
    layout: layoutChecks(),
    pixels: pixelChecks(),
    mask: maskChecks(),
  };
  const fails = [];
  if (out.baseline.diff.length) fails.push('baseline');
  for (const [k, v] of Object.entries(out.layout)) if (v !== true) fails.push('layout.' + k);
  for (const [k, v] of Object.entries(out.pixels)) if (v.bad || !v.tested) fails.push('pixels.' + k);
  for (const [k, v] of Object.entries(out.mask)) {
    if (typeof v === 'string') continue;
    if (typeof v === 'boolean') { if (!v) fails.push('mask.' + k); continue; }
    if (!v.active || v.maxDelta !== 0 || v.changedShare < 0.03 || !v.tested) fails.push('mask.' + k);
  }
  out.fails = fails;
  log(`engine-ext check: ${fails.length ? 'FAIL ' + fails.join(', ') : 'all ok'}\n` + JSON.stringify(out, null, 1));
  return out;
}

// Draw one scene for a screenshot: strip, strip-mid, strip-pov, strip-item, cube, court-gap; wild = true for effects.
function show(name, wild = false, size) {
  if (size) setSize(size[0], size[1]);
  const fx = wild ? WILD : CALM;
  const S = {
    strip: ['xstrip', 'board', SC.lane()],
    'strip-mid': ['xstrip', 'board', SC.lane({ progress: 0.5, grew: true })],
    'strip-pov': ['xstrip', 'pov', SC.lanePov()],
    'strip-item': ['xstrip', 'board', SC.lane({ mushroom: { x: 12, y: 4 } })],
    cube: ['xcube', 'board', SC.cube()],
    'court-gap': ['court', 'board', SC.gap()],
  }[name];
  if (!S) return 'unknown scene';
  draw(S[0], S[1], S[2], fx);
  return `${name} drawn`;
}

let R = null;
async function boot() {
  const { strip, cube } = await import('./gl.rooms.js');
  R = await createRoomRenderer(canvas, { cols: COLS, rows: ROWS, roomIds: [...OLD_ROOMS, 'xstrip', 'xcube'], roomModules: { xstrip: strip, xcube: cube } });
  window.__ext = { R, hashes, compareBaseline, check, show, layoutChecks, pixelChecks, maskChecks, ROOM_IDS };
  log(R ? `rooms: ${Object.keys(R.rooms).join(', ')}` : 'renderer null');
  setSize(640, 400);
}
await boot();
