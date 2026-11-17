// castle-room harness (LEVELS_PLAN 6, castle). Renders on demand; open dev/castle.html and run __castle.check().
// Drives the real simulation (createSim, cube space) across all four seams of face 0 and around a corner,
// spreads a long body over three faces with the dot on a neighbouring face, and respawns a short snake.
// Checks, at chaos 0 and 1, landscape and portrait:
//   cells  - every camera-facing body cell and the dot change the picture at their projected centre
//            (frame vs. the same frame without snake and dot), and no changed pixel lies away from them;
//   dir    - after each crossing the head's travel points up/right/down/left on screen as the board-local
//            direction says, and the frame's up is screen-up;
//   turn   - during the 300 ms seam turn the head stays on screen and keeps its screen direction.
import { createRoomRenderer } from '../src/render/gl/engine.js';
import { createSim } from '../src/sim.js';
import { cubeCellToWorld, faceFrame, cubeNet, CUBE_FACES } from '../src/space.js';
import * as castle from '../src/render/gl/rooms/castle.js';
import { add, sub, scale, dot, norm, cameraFor, frameBasis } from '../src/render/gl/cube.js';

const $ = (id) => document.getElementById(id);
const out = $('out');
const canvas = $('gl');
const log = (s) => { out.textContent = s; };
const errors = [];
for (const k of ['error', 'warn']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => { errors.push(`${k}: ${a.map(String).join(' ')}`); orig(...a); };
}
window.addEventListener('error', (e) => errors.push(`uncaught: ${e.message}`));

let R = null;
let T = 10000; // harness clock (ms), only grows
const cells = (l) => l.map(([x, y]) => ({ x, y }));
const DIR = { U: 'up', R: 'right', D: 'down', L: 'left' };
const SCREEN = { up: [0, -1], down: [0, 1], right: [1, 0], left: [-1, 0] };

function fxOf(o = {}) {
  return { now: T, time: T / 1000, beat: 0.3, beatIndex: 0, chaos: 0, punch: 0, variant: 1, bite: null, biteAge: Infinity,
    cutAge: 1e6, reducedFlash: false, reducedMotion: false, ...o };
}
function setSize(w, h) {
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  R.resize(w, h, 1);
}
function read() {
  const gl = R.debug.gl, W = canvas.width, H = canvas.height;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}
const diffAt = (A, B, x, y) => {
  const W = canvas.width, H = canvas.height;
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  const i = ((H - 1 - y) * W + x) * 4;
  return Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
};
const P = (v) => R.debug.project(v[0], v[1], v[2]);
const angle = (v, w) => (Math.acos(Math.max(-1, Math.min(1, (v[0] * w[0] + v[1] * w[1]) / (Math.hypot(v[0], v[1]) || 1)))) * 180) / Math.PI;
function render(snap, fx) { R.render('castle', 'board', snap, fx); }

// ---------------------------------------------------------------- scenarios (real simulation)
function newSim(snake, dir, food) {
  const sim = createSim({ seed: 7, start: { universe: 'castle', snake: cells(snake), dir, food } });
  sim.setPaused(false);
  return sim;
}
function* play(sim, script) {
  for (const tok of script.split(/\s+/)) {
    const d = DIR[tok[0]], n = +tok.slice(1);
    for (let i = 0; i < n; i++) {
      sim.queueTurn(d);
      sim.step();
      yield sim.snapshot();
    }
  }
}
const SEAMS = { snake: [[8, 8], [8, 9], [8, 10], [8, 11]], dir: 'up', food: { x: 1, y: 14 },
  script: 'U12 R1 D22 L1 U6 R9 U1 L4 L16 U1 R5 R12 U13 R3 D10 L10 U3' };
const LONG = { snake: [[8, 3], ...Array.from({ length: 12 }, (_, i) => [8, 4 + i]), ...Array.from({ length: 11 }, (_, i) => [7, 15 - i])],
  dir: 'up', food: { x: 2, y: 12 }, script: 'U5 R10' };

// ---------------------------------------------------------------- checks
/** Cells: frame with and without snake + dot, same camera. Every facing cell must change its pixel. */
function cellCheck(snap, fx, label) {
  const inst = castle.debug.inst;
  const s1 = { ...snap, progress: 1 };
  inst.holdCamera = false;
  render(s1, fx);
  const A = read();
  inst.holdCamera = true;
  render({ ...s1, snake: [], body: [], breaks: [], food: null, foodAt: null, prevTail: null }, fx);
  const B = read();
  inst.holdCamera = false;
  const eye = R.debug.camera().eye;
  const pts = (snap.body || []).map((c, i) => ({ c, lift: 0.3, kind: i ? 'body' : 'head' }));
  if (snap.foodAt) pts.push({ c: snap.foodAt, lift: 0.34, kind: 'dot' });
  const near = [];
  const res = { label, cells: pts.length, hit: 0, hidden: 0, miss: [], diffPx: 0, stray: 0 };
  for (const p of pts) {
    const w = cubeCellToWorld(p.c.f, p.c.u, p.c.v);
    const pos = add(w.pos, scale(w.normal, p.lift));
    const pr = P(pos);
    // the cell's size on screen: along both face axes and along the normal (segments stand up from the face)
    const Fc = CUBE_FACES[p.c.f];
    const cellPx = Math.max(...[Fc.right, Fc.down, scale(w.normal, 0.6)].map((v) => { const q = P(add(pos, v)); return Math.hypot(q.x - pr.x, q.y - pr.y); }));
    near.push({ x: pr.x, y: pr.y, r: Math.max(4, cellPx * (p.kind === 'dot' ? 1.7 : 1.15)) });
    const facing = dot(norm(sub(eye, pos)), w.normal);
    if (facing < 0.2 || !pr.visible) { res.hidden++; continue; }
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (diffAt(A, B, Math.round(pr.x) + dx, Math.round(pr.y) + dy) > 30) k++;
    if (k >= 5) res.hit++;
    else res.miss.push(`${p.kind} f${p.c.f} ${p.c.u},${p.c.v} k${k}`);
  }
  const W = canvas.width, H = canvas.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (diffAt(A, B, x, y) <= 48) continue;
      res.diffPx++;
      let ok = false;
      for (const n of near) if ((x - n.x) ** 2 + (y - n.y) ** 2 < n.r * n.r) { ok = true; break; }
      if (!ok) res.stray++;
    }
  }
  res.ok = !res.miss.length && res.stray <= 2 && res.hit > 0;
  return res;
}

/** Head pose on screen: visible with a margin, and its travel along the expected screen direction. */
function headOnScreen(snap, a) {
  const hp = castle.bodyPoses(snap, a, 0.3)[0];
  const sp = snap.space;
  const fwd = hp.moving ? hp.fwd : faceFrame(sp.face, sp.rot)[snap.dir === 'up' || snap.dir === 'down' ? 'up' : 'right'].map((v) => v * (snap.dir === 'down' || snap.dir === 'left' ? -1 : 1));
  const p0 = P(hp.pos), p1 = P(add(hp.pos, scale(fwd, 0.8)));
  const W = canvas.width, H = canvas.height, m = 6;
  const inside = p0.x > m && p0.y > m && p0.x < W - m && p0.y < H - m;
  return { inside, ang: angle([p1.x - p0.x, p1.y - p0.y], SCREEN[snap.dir]) };
}
/** The frame's up on screen (face centre -> centre + up). */
function upAngle(snap) {
  const F = faceFrame(snap.space.face, snap.space.rot);
  const c0 = P(scale(F.normal, 8)), c1 = P(add(scale(F.normal, 8), scale(F.up, 3)));
  return angle([c1.x - c0.x, c1.y - c0.y], [0, -1]);
}

/** One scenario at one chaos and size: per-tick dir checks, turn checks on crossings, cell checks. */
function runScenario(sc, chaos, label, opts = {}) {
  const sim = newSim(sc.snake, sc.dir, sc.food);
  castle.debug.inst && castle.debug.inst.camera.reset();
  const r = { label, ticks: 0, crossings: [], dirFail: [], turnFail: [], cellFail: [], cellRuns: 0, maxAng: 0, maxUp: 0, maxTurnAng: 0, last: null };
  let snap = sim.snapshot();
  T += 1000;
  render(snap, fxOf({ chaos }));
  const it = play(sim, sc.script + (opts.extra ? ' ' + opts.extra : ''));
  for (const s of it) {
    snap = s;
    r.ticks++;
    if (!s.alive) { r.dirFail.push(`dead at tick ${r.ticks}`); break; }
    if (s.waiting) { r.respawn = s; break; }
    const crossed = !!s.space.entered;
    if (crossed) {
      r.crossings.push(`${s.space.prevFace}/${s.space.prevRot}-${s.space.entered}->${s.space.face}/${s.space.rot}`);
      const t0 = T + 16;
      for (const dt of [0, 40, 80, 120, 160, 200, 240, 280, 320, 400]) { // the seam turn, frame by frame
        T = t0 + dt;
        const a = Math.min(1, dt / 150);
        render({ ...s, progress: a >= 1 ? 1 : a }, fxOf({ chaos }));
        const h = headOnScreen(s, a);
        r.maxTurnAng = Math.max(r.maxTurnAng, h.ang);
        if (!h.inside || h.ang > 40) r.turnFail.push(`${r.crossings.at(-1)} dt${dt} inside=${h.inside} ang=${h.ang.toFixed(1)}`);
      }
    } else {
      T += 150;
      render({ ...s, progress: 1 }, fxOf({ chaos }));
    }
    T += 600; // let the eye glide settle, then check direction and frame
    render({ ...s, progress: 1 }, fxOf({ chaos }));
    render({ ...s, progress: 1 }, fxOf({ chaos, now: T + 300 }));
    T += 300;
    const h = headOnScreen(s, 1), up = upAngle(s);
    r.maxAng = Math.max(r.maxAng, h.ang); r.maxUp = Math.max(r.maxUp, up);
    if (!h.inside || h.ang > 30 || up > 25) r.dirFail.push(`tick ${r.ticks} f${s.space.face}/${s.space.rot} ${s.dir} ang=${h.ang.toFixed(1)} up=${up.toFixed(1)} in=${h.inside}`);
    if (crossed || r.ticks % 7 === 0) {
      const c = cellCheck(s, fxOf({ chaos }), `tick ${r.ticks}`);
      r.cellRuns++;
      if (!c.ok) r.cellFail.push(c);
    }
  }
  r.last = snap;
  return r;
}

/** Cells seen from a camera parked over each face the body or dot touches (the game camera hides most). */
function allFaces(snap, fx, label) {
  const inst = castle.debug.inst;
  const faces = new Set([...(snap.body || []).map((c) => c.f), ...(snap.foodAt ? [snap.foodAt.f] : [])]);
  const res = { label, faces: faces.size, hit: 0, seen: 0, stray: 0, miss: [] };
  for (const f of faces) {
    inst.forceCamera = cameraFor(frameBasis(f, 0), [0.15, 0.1], canvas.width / canvas.height);
    const c = cellCheck(snap, fx, `${label} face ${f}`);
    res.hit += c.hit; res.seen += c.cells - c.hidden; res.stray += c.stray; res.miss.push(...c.miss);
  }
  inst.forceCamera = null;
  res.ok = !res.miss.length && res.stray <= 2 * faces.size && res.hit === res.seen && res.seen >= (snap.body || []).length;
  return res;
}

// ---------------------------------------------------------------- everything
const SIZES = [[640, 400], [300, 520]];
function check() {
  const t0 = performance.now();
  const out = { sizes: [], fails: [] };
  for (const [w, h] of SIZES) {
    setSize(w, h);
    for (const chaos of [0, 1]) {
      const tag = `${w}x${h}/c${chaos}`;
      const seams = runScenario(SEAMS, chaos, `seams ${tag}`);
      const outOf0 = new Set(seams.crossings.filter((c) => c.startsWith('0/')).map((c) => c.split('-')[1]));
      const into0 = new Set(seams.crossings.filter((c) => /->0\//.test(c)).map((c) => c.split('-')[1]));
      const corner = seams.crossings.some((c) => c.endsWith('->0/1')); // back on face 0 in a turned frame
      const long = runScenario(LONG, chaos, `long ${tag}`);
      const L = long.last;
      const faces = new Set(L.body.map((c) => c.f));
      const net = cubeNet(L.space.face, L.space.rot).slice(1, 5).map((e) => e.f);
      const dotNb = !!L.foodAt && L.foodAt.f !== L.space.face && net.includes(L.foodAt.f);
      const longCells = cellCheck(L, fxOf({ chaos }), `long body ${tag}`);
      const longAll = allFaces(L, fxOf({ chaos }), `long all faces ${tag}`);
      const resp = runScenario(LONG, chaos, `respawn ${tag}`, { extra: 'D1 L1 U1' });
      const RS = resp.respawn;
      const respCells = RS ? cellCheck(RS, fxOf({ chaos }), `respawn ${tag}`) : null;
      const row = {
        tag,
        seams: { ticks: seams.ticks, crossings: seams.crossings.length, outOf0: [...outOf0].sort().join(','), into0: [...into0].sort().join(','), corner,
          maxAng: +seams.maxAng.toFixed(1), maxUp: +seams.maxUp.toFixed(1), maxTurnAng: +seams.maxTurnAng.toFixed(1), cellRuns: seams.cellRuns },
        long: { faces: faces.size, bodyLen: L.body.length, dotOnNeighbour: dotNb, cells: `${longCells.hit}/${longCells.cells - longCells.hidden} hidden ${longCells.hidden} stray ${longCells.stray}`,
          allFaces: `${longAll.hit}/${longAll.seen} on ${longAll.faces} faces, stray ${longAll.stray}` },
        respawn: RS ? { waiting: RS.waiting, lives: RS.lives, len: RS.body.length, cells: `${respCells.hit}/${respCells.cells - respCells.hidden} stray ${respCells.stray}` } : null,
      };
      out.sizes.push(row);
      for (const r of [seams, long]) {
        for (const f of [...r.dirFail, ...r.turnFail]) out.fails.push(`${r.label}: ${f}`);
        for (const c of r.cellFail) out.fails.push(`${r.label} cells ${c.label}: miss ${c.miss.join('; ')} stray ${c.stray}`);
      }
      if (outOf0.size !== 4 || into0.size !== 4) out.fails.push(`${tag}: not all four seams of face 0 crossed both ways`);
      if (!corner) out.fails.push(`${tag}: corner loop missing`);
      if (faces.size < 3) out.fails.push(`${tag}: long body on ${faces.size} faces`);
      if (!dotNb) out.fails.push(`${tag}: dot not on a neighbouring face`);
      if (!longAll.ok) out.fails.push(`${tag}: long body, face views ${longAll.miss.join('; ')} seen ${longAll.seen} stray ${longAll.stray}`);
      if (!longCells.ok) out.fails.push(`${tag}: long body cells ${longCells.miss.join('; ')} stray ${longCells.stray}`);
      if (!RS || RS.waiting !== 'respawn' || RS.body.length !== 3) out.fails.push(`${tag}: no short respawned snake`);
      else if (!respCells.ok) out.fails.push(`${tag}: respawn cells ${respCells.miss.join('; ')} stray ${respCells.stray}`);
    }
  }
  // reduced motion: a seam crossing cuts (no turn), and the camera shows the new frame at once
  setSize(640, 400);
  {
    const sim = newSim(SEAMS.snake, SEAMS.dir, SEAMS.food);
    castle.debug.inst.camera.reset();
    let cut = null;
    for (const s of play(sim, 'U9')) {
      T += 150;
      render({ ...s, progress: 1 }, fxOf({ reducedMotion: true }));
      if (s.space.entered) {
        const c = castle.debug.inst.state.cam, F = faceFrame(s.space.face, s.space.rot);
        cut = { turning: c.turning, upErr: +Math.hypot(...sub(c.basis.up, F.up)).toFixed(6), up: +upAngle(s).toFixed(1) };
      }
    }
    out.reducedMotion = cut;
    if (!cut || cut.turning || cut.upErr > 1e-6) out.fails.push('reduced motion does not cut');
  }
  // meta: board view only; a stray 'pov' request still renders the board camera without errors
  out.views = R.rooms.castle && R.rooms.castle.views;
  if (!out.views || out.views.join() !== 'board') out.fails.push('views');
  render(newSim(SEAMS.snake, SEAMS.dir, SEAMS.food).snapshot(), fxOf());
  R.render('castle', 'pov', newSim(SEAMS.snake, SEAMS.dir, SEAMS.food).snapshot(), fxOf({ chaos: 1 }));
  // the berry icon: filled and hollow differ, both draw, at chaos 0 and 1
  {
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 60;
    const g = cv.getContext('2d');
    const ink = [];
    for (const chaos of [0, 1]) {
      for (const filled of [true, false]) {
        g.clearRect(0, 0, 120, 60);
        castle.life(g, 10, 10, 40, filled, { chaos, time: 1 });
        const px = g.getImageData(0, 0, 120, 60).data;
        let n = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 40) n++;
        ink.push(n);
      }
    }
    out.lifeInk = ink;
    if (ink.some((n) => n < 30) || ink[0] <= ink[1] * 1.5) out.fails.push('life icon');
  }
  // scenery never between camera and cube: every piece outside the keep-out sphere, camera always inside it
  const W = castle.debug.world;
  let minR = Infinity;
  for (const list of Object.values(W.P)) for (const q of list) minR = Math.min(minR, Math.hypot(...q.t) - castle.partExtent(q));
  for (const b of W.bridges) for (let t = 0; t <= 1; t += 0.05) minR = Math.min(minR, Math.hypot(...b.A.map((a, i) => a + (b.B[i] - a) * t)) - 9);
  out.scenery = { minDistance: +minR.toFixed(1), keepOut: castle.KEEP_OUT, cameraDist: 50 };
  if (minR < castle.KEEP_OUT - 0.01) out.fails.push(`scenery reaches ${minR.toFixed(1)} < ${castle.KEEP_OUT}`);
  out.errors = errors.slice();
  if (errors.length) out.fails.push('console');
  out.ms = Math.round(performance.now() - t0);
  log(`castle check: ${out.fails.length ? 'FAIL' : 'all ok'}\n` + JSON.stringify(out, null, 1));
  return out;
}

/** Visual: a scenario frozen after `ticks` steps, at chaos and size; reducedMotion optional. */
function show(name = 'long', chaos = 0, w = 640, h = 400, extra = '') {
  setSize(w, h);
  const sc = name === 'seams' ? SEAMS : LONG;
  const sim = newSim(sc.snake, sc.dir, sc.food);
  let s = sim.snapshot();
  for (const x of play(sim, sc.script + (extra ? ' ' + extra : ''))) { s = x; if (s.waiting || !s.alive) break; }
  for (let i = 0; i < 12; i++) { T += 100; render({ ...s, progress: 1 }, fxOf({ chaos })); }
  log(`${name} c${chaos} ${w}x${h} face ${s.space.face}/${s.space.rot} dir ${s.dir}`);
  return s;
}

(async () => {
  R = await createRoomRenderer(canvas, { roomIds: ['castle'] });
  if (!R) { log('no WebGL / castle room missing'); return; }
  setSize(640, 400);
  window.__castle = { R, check, show, cellCheck, runScenario, render, fxOf, errors, SEAMS, LONG, castle, setSize };
  show('long', 0);
})();
