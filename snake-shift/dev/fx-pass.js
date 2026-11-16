// fx-pass harness: checks the rooms' post-effects pass (src/render/gl/post.js).
// Console: __fp.check()  cell identity direct vs post, every room x view x size x chaos 0/1, bite in progress
//          __fp.cost(n)  frame cost with the pass off and on (GPU synced with a 1-pixel readPixels)
//          __fp.paths()  calm skip, reduced flash, incomplete buffer and context-loss fallbacks
//          __fp.show(room, view, chaos, post)  one frame at window size, for screenshots
import { createRoomRenderer } from '../src/render/gl/engine.js';

const COLS = 16, ROWS = 16;
const canvas = document.getElementById('gl');
const out = document.getElementById('out');
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
for (const k of ['warn', 'error']) {
  const o = console[k];
  console[k] = (...a) => { errors.push(`${k}: ${a.map(String).join(' ')}`.slice(0, 300)); o.apply(console, a); };
}
const log = (s) => { out.textContent = s; };

const renderer = await createRoomRenderer(canvas, { cols: COLS, rows: ROWS });
const gl = renderer && renderer.debug.gl;
const ROOMS = renderer ? Object.keys(renderer.rooms) : [];
const SIZES = { landscape: [1280, 760], portrait: [375, 812] };

// Snake hugging all four edges plus a run through the middle; the head just bit at (8, 8).
const path = [];
for (let y = 8; y <= 15; y++) path.push([8, y]);
for (let x = 9; x <= 15; x++) path.push([x, 15]);
for (let y = 14; y >= 0; y--) path.push([15, y]);
for (let x = 14; x >= 0; x--) path.push([x, 0]);
for (let y = 1; y <= 5; y++) path.push([0, y]);
const SNAP = Object.freeze({
  cols: COLS, rows: ROWS, snake: path.map(([x, y]) => ({ x, y })), dir: 'up', prevDir: 'up',
  prevTail: { x: 0, y: 6 }, grew: false, food: { x: 3, y: 11 }, score: 25, stepMs: 150, tick: 40,
  progress: 1, alive: true, paused: false, death: null,
});

// Same formulas as src/fx.js, frozen at a bite in progress.
function mkFx(chaos, o = {}) {
  const biteAge = o.biteAge ?? 120, cutAge = o.cutAge ?? 120, beat = o.beat ?? 0.8, rf = !!o.rf;
  const punch = rf || !Number.isFinite(biteAge) ? 0 : Math.pow(Math.max(0, 1 - biteAge / 300), 2);
  const cutKick = Math.max(0, 1 - cutAge / 350);
  return {
    now: o.now ?? 10000, time: o.time ?? 2, beat: rf ? Math.min(beat * 0.15, 0.15) : beat, beatIndex: 5, chaos, punch,
    variant: 3, bite: Number.isFinite(biteAge) ? { x: 8, y: 8 } : null, biteAge, cutAge,
    reducedFlash: rf, reducedMotion: false, strobe: 0, invert: false,
    glitch: rf ? 0 : Math.min(1, chaos * (0.22 + 0.78 * Math.max(punch, cutKick, beat * 0.45))),
    split: rf ? 0 : chaos * 7 * (0.3 + 0.7 * Math.max(punch, beat)),
  };
}

function seeded(seed, fn) {
  const r = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = r; }
}

function grab(room, view, fx, postOn, mode = 'buffer', zero = false) {
  const P = renderer.debug.post;
  P.enabled = postOn; P.mode = mode; P.zero = zero;
  seeded(1234, () => renderer.render(room, view, SNAP, fx));
  const active = P.active;
  P.enabled = true; P.mode = 'buffer'; P.zero = false;
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { px, W, H, active, err: gl.getError() };
}

// Cell centres at content height (snake 0.26/0.30, dot 0.18, empty 0), 3x3 average, as dev/gl.js does.
function cellSamples(img, view) {
  const res = [];
  const snakeSet = new Set(SNAP.snake.map((c) => c.x + c.y * COLS));
  const head = SNAP.snake[0].x + SNAP.snake[0].y * COLS;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = x + y * COLS;
    if (view === 'pov' && k === head) continue;
    const h = snakeSet.has(k) ? (k === head ? 0.3 : 0.26) : SNAP.food.x === x && SNAP.food.y === y ? 0.18 : 0;
    const [wx, wz] = renderer.debug.cellToWorld(x, y);
    const p = renderer.debug.project(wx, h, wz);
    if (!p.visible) continue;
    const sx = Math.round(p.x), sy = img.H - 1 - Math.round(p.y);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = sx + dx, Y = sy + dy;
      if (X < 0 || Y < 0 || X >= img.W || Y >= img.H) continue;
      const i = (Y * img.W + X) * 4;
      r += img.px[i]; g += img.px[i + 1]; b += img.px[i + 2]; n++;
    }
    res.push([x, y, r / n, g / n, b / n]);
  }
  return res;
}
const maxDiff = (a, b) => a.reduce((m, s, i) => Math.max(m, Math.abs(s[2] - b[i][2]), Math.abs(s[3] - b[i][3]), Math.abs(s[4] - b[i][4])), 0);
function meanDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.px.length; i += 16) s += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
  return s / (a.px.length / 16) / 3;
}

function check() {
  const rows = [];
  let problems = 0;
  for (const [sz, [w, h]] of Object.entries(SIZES)) {
    renderer.resize(w, h, 2);
    for (const room of ROOMS) for (const view of ['board', 'pov']) for (const chaos of [0, 1]) {
      const fx = mkFx(chaos);
      grab(room, view, fx, false); // settle first-person yaw
      // D direct, D2 direct again (noise), Z buffer pass at zero strength, B buffer with effects, C copy with effects
      const D = grab(room, view, fx, false), D2 = grab(room, view, fx, false);
      const Z = grab(room, view, fx, true, 'buffer', true), B = grab(room, view, fx, true), C = grab(room, view, fx, true, 'copy');
      const cd = cellSamples(D, view), cz = cellSamples(Z, view), cb = cellSamples(B, view), cc = cellSamples(C, view);
      const noise = maxDiff(cd, cellSamples(D2, view));
      const dB = maxDiff(cz, cb), dC = maxDiff(cd, cc), aa = maxDiff(cd, cz), eff = meanDiff(Z, B);
      const ok = B.active && C.active && !D.active && dB <= noise && dC <= noise && !(D.err || Z.err || B.err || C.err);
      if (!ok) problems++;
      const worst = [[cz, cb], [cd, cc]].flatMap(([p, q]) => p.map((s, i) => [s, q[i], Math.max(...[2, 3, 4].map((j) => Math.abs(s[j] - q[i][j])))]))
        .filter((e) => e[2] > noise).sort((p, q) => q[2] - p[2]).slice(0, 4)
        .map(([s, t]) => `${s[0]},${s[1]} ${s.slice(2).map(Math.round)}→${t.slice(2).map(Math.round)}`).join('; ');
      rows.push(`${ok ? 'ok ' : 'BAD'} ${sz} ${room}/${view} chaos ${chaos}: ${cd.length} cells, cell Δ buffer ${dB.toFixed(1)}, copy ${dC.toFixed(1)} (noise ${noise.toFixed(1)}; buffer vs MSAA ${aa.toFixed(1)}), scenery Δ ${eff.toFixed(1)}${worst ? '\n    ' + worst : ''}`);
    }
  }
  fit();
  const text = `check ${problems} problems\n${rows.join('\n')}\nerrors: ${errors.length ? errors.join(' | ') : 'none'}`;
  log(text);
  console.log('[fx-pass] check\n' + text);
  return { problems, rows, errors: errors.slice() };
}

function cost(n = 40, mode = 'buffer') {
  renderer.debug.post.mode = mode;
  const rows = [];
  const sync = new Uint8Array(4);
  for (const [sz, [w, h]] of Object.entries(SIZES)) {
    renderer.resize(w, h, 2);
    for (const room of ROOMS) for (const view of ['board', 'pov']) {
      const t = {};
      for (const on of [false, true, false, true]) {
        let ms = 0;
        for (let i = 0; i < n; i++) {
          const fx = mkFx(1, { time: 2 + i / 60, now: 10000 + i * 16.7 });
          renderer.debug.post.enabled = on;
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync);
          const t0 = performance.now();
          renderer.render(room, view, SNAP, fx);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync);
          ms += performance.now() - t0;
        }
        t[on] = ms / n; // second run of each wins (warm)
      }
      renderer.debug.post.enabled = true;
      rows.push(`${sz} ${canvas.width}x${canvas.height} ${room}/${view}: off ${t.false.toFixed(2)} ms, on ${t.true.toFixed(2)} ms, +${(t.true - t.false).toFixed(2)}`);
    }
  }
  fit();
  renderer.debug.post.mode = 'buffer';
  const text = `cost, ${mode} mode (chaos 1, bite; render + GPU sync)\n${rows.join('\n')}`;
  log(text);
  console.log('[fx-pass] ' + text);
  return rows;
}

async function paths() {
  const res = [];
  renderer.resize(1280, 760, 2);
  const room = ROOMS[0];
  renderer.render(room, 'board', SNAP, mkFx(0, { beat: 0, biteAge: Infinity, cutAge: 1e6 }));
  res.push(`calm (chaos 0, beat 0, no bite): post ${renderer.debug.post.active} (want false)`);
  renderer.render(room, 'board', SNAP, mkFx(1, { rf: true }));
  res.push(`reduced flash at chaos 1: post ${renderer.debug.post.active} (want false)`);
  renderer.render(room, 'board', SNAP, mkFx(1));
  res.push(`wild: post ${renderer.debug.post.active} (want true), buffer ${renderer.debug.postSize().join('x')} vs canvas ${canvas.width}x${canvas.height}`);
  // Buffer cannot be made: a second renderer whose texture size limit is 1 pixel.
  const P = WebGLRenderingContext.prototype, orig = P.getParameter;
  P.getParameter = function (k) { return k === this.MAX_TEXTURE_SIZE ? 1 : orig.call(this, k); };
  try {
    const c2 = document.createElement('canvas');
    const r2 = await createRoomRenderer(c2, { cols: COLS, rows: ROWS, roomIds: [room] });
    r2.resize(320, 200, 1);
    r2.render(room, 'board', SNAP, mkFx(1));
    const g2 = r2.debug.gl, px = new Uint8Array(4);
    const [x, y] = [160, 100];
    g2.readPixels(x, y, 1, 1, g2.RGBA, g2.UNSIGNED_BYTE, px);
    res.push(`no buffer: post ${r2.debug.post.active} (want false), drew direct: centre rgb ${px[0]},${px[1]},${px[2]}, gl error ${g2.getError()}`);
    // Context loss on that renderer.
    const ext = g2.getExtension('WEBGL_lose_context');
    if (ext) {
      ext.loseContext();
      r2.render(room, 'board', SNAP, mkFx(1));
      res.push(`context lost: lost() ${r2.lost()}, render no-op without throwing`);
    }
  } catch (e) {
    res.push(`fallback test threw: ${e}`);
  } finally {
    P.getParameter = orig;
  }
  fit();
  const text = `paths\n${res.join('\n')}\nerrors: ${errors.length ? errors.join(' | ') : 'none'}`;
  log(text);
  console.log('[fx-pass] ' + text);
  return res;
}

function fit() { renderer.resize(innerWidth, innerHeight, devicePixelRatio); }
function show(room = ROOMS[0], view = 'board', chaos = 1, postOn = true, o = {}) {
  fit();
  renderer.debug.post.enabled = postOn;
  renderer.render(room, view, SNAP, mkFx(chaos, o));
  renderer.debug.post.enabled = true;
  log('');
  return renderer.debug.post.params;
}

window.__fp = { renderer, check, cost, paths, show, mkFx, errors, ROOMS };
if (!renderer) log('no renderer (WebGL unavailable)');
else {
  fit();
  show(ROOMS[0], 'board', 1, true);
  log(`rooms: ${ROOMS.join(', ')}. Run __fp.check(), __fp.cost(), __fp.paths(), __fp.show(room, view, chaos, post).`);
}
