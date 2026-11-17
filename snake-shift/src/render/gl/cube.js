// Castle Cube maths (castle-room stream, LEVELS_PLAN 3.4 / 6). Pure: no GL, no DOM.
// World positions and orientations of canonical cube cells, surface paths between neighbours,
// model matrices for meshes lying on a face, and the camera that sits off the current face and
// turns across a seam (createCubeCamera keeps the little state that needs: easing and turns).
import {
  SIZE, CUBE_FACES, DIR_ORDER, cubeCellToWorld, cubeNeighbour, faceFrame, localToCanon, canonToLocal, cubeNet,
} from '../../space.js';

export const EDGE = SIZE;       // 16
export const HALF = SIZE / 2;   // 8

// ---------------------------------------------------------------- small vector helpers
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- cells
/** World pose of canonical cell (f, u, v): centre lifted `lift` along the normal, plus the face axes. */
export function cellPose(f, u, v, lift = 0) {
  const w = cubeCellToWorld(f, u, v);
  const F = CUBE_FACES[f];
  return { pos: add(w.pos, scale(w.normal, lift)), normal: w.normal, right: F.right.slice(), down: F.down.slice() };
}

/** World vector of board-local direction `dir` ('up' | 'right' | 'down' | 'left') in frame (f, rot). */
export function frameDir(f, rot, dir) {
  const F = faceFrame(f, rot);
  return dir === 'up' ? F.up : dir === 'down' ? scale(F.up, -1) : dir === 'right' ? F.right : scale(F.right, -1);
}

/** Canonical direction index (0 up, 1 right, 2 down, 3 left) from cell a to neighbour b, or -1. */
export function cubeAdjacent(a, b) {
  if (!a || !b) return -1;
  for (let d = 0; d < 4; d++) {
    const n = cubeNeighbour(a.f, a.u, a.v, d);
    if (n.f === b.f && n.u === b.u && n.v === b.v) return d;
  }
  return -1;
}
const sameCell = (a, b) => !!a && !!b && a.f === b.f && a.u === b.u && a.v === b.v;

// World vector of canonical direction index d on face f (0 up = -down, 1 right, 2 down, 3 left).
function canonVec(f, d) {
  const F = CUBE_FACES[f];
  return d === 0 ? scale(F.down, -1) : d === 1 ? F.right.slice() : d === 2 ? F.down.slice() : scale(F.right, -1);
}

/**
 * Point on the cube surface between the centres of cells a and b (neighbours, possibly across a seam),
 * at s = 0 (a) .. 1 (b), lifted `lift` along the local normal. Returns { pos, normal, fwd } (fwd = travel
 * direction a -> b on the surface at that point). Across a seam the path runs to the shared edge on a's face,
 * then on b's face, and the normal bends over the edge. Non-neighbours: no path (returns b).
 */
export function surfaceLerp(a, b, s, lift = 0) {
  const pa = cubeCellToWorld(a.f, a.u, a.v), pb = cubeCellToWorld(b.f, b.u, b.v);
  const d = sameCell(a, b) ? -1 : cubeAdjacent(a, b);
  if (d < 0) return { pos: add(pb.pos, scale(pb.normal, lift)), normal: pb.normal, fwd: [0, 0, 0] };
  s = clamp(s, 0, 1);
  if (a.f === b.f) {
    const p = lerp3(pa.pos, pb.pos, s);
    return { pos: add(p, scale(pa.normal, lift)), normal: pa.normal, fwd: norm(sub(pb.pos, pa.pos)) };
  }
  // across a seam: a's centre -> edge point E (half a cell along a's travel vector) -> b's centre
  const ta = canonVec(a.f, d);            // travel on a's face, toward the edge
  const E = add(pa.pos, scale(ta, 0.5));
  const tb = norm(sub(pb.pos, E));        // travel on b's face, away from the edge
  // the normal turns over the edge in a short arc around s = 0.5 so a block sitting on the seam leans over it
  const k = smooth((s - 0.35) / 0.3);
  const n = norm(lerp3(pa.normal, pb.normal, k));
  const p = s < 0.5 ? add(pa.pos, scale(ta, s)) : add(E, scale(tb, s - 0.5));
  const fwd = norm(lerp3(ta, tb, k));
  return { pos: add(p, scale(n, lift)), normal: n, fwd };
}

/** Canonical cell of a board-local cell on the active face (frame face, rot). */
export function localCell(face, rot, x, y) {
  const c = localToCanon(x, y, rot);
  return { f: face, u: c.u, v: c.v };
}

// ---------------------------------------------------------------- model matrices (column-major, like m4.js)
/** Model matrix with local axes X, Y, Z (world vectors) scaled by sx, sy, sz, origin at pos. */
export function basisModel(o, pos, X, Y, Z, sx, sy, sz) {
  o[0] = X[0] * sx; o[1] = X[1] * sx; o[2] = X[2] * sx; o[3] = 0;
  o[4] = Y[0] * sy; o[5] = Y[1] * sy; o[6] = Y[2] * sy; o[7] = 0;
  o[8] = Z[0] * sz; o[9] = Z[1] * sz; o[10] = Z[2] * sz; o[11] = 0;
  o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
  return o;
}

/**
 * Model matrix for a mesh lying on the surface: local +Y along `normal`, local -Z along `fwd` (the engine's
 * head geometry points to -Z), local +X = Y x Z (right of travel). Right-handed, like m4.trs.
 */
export function surfaceModel(o, pos, normal, fwd, sx, sy, sz) {
  let f = sub(fwd, scale(normal, dot(fwd, normal)));
  if (len(f) < 1e-6) f = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [0, 0, -1];
  f = norm(sub(f, scale(normal, dot(f, normal))));
  const Z = scale(f, -1);
  const X = cross(normal, Z);
  return basisModel(o, pos, X, normal, Z, sx, sy, sz);
}

// ---------------------------------------------------------------- frames and quaternions
/** Orthonormal frame of the board in (f, rot): right, up (screen-up), normal (out of the face). */
export function frameBasis(f, rot) {
  const F = faceFrame(f, rot);
  return { right: F.right, up: F.up, normal: F.normal };
}

/** Unit quaternion [x, y, z, w] of the rotation whose matrix has columns R, U, N. */
export function quatFromBasis(R, U, N) {
  const m00 = R[0], m10 = R[1], m20 = R[2], m01 = U[0], m11 = U[1], m21 = U[2], m02 = N[0], m12 = N[1], m22 = N[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w, s;
  if (tr > 0) { s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

/** Rotate vector v by unit quaternion q. */
export function quatRotate(q, v) {
  const [x, y, z, w] = q;
  const t = scale(cross([x, y, z], v), 2);
  return add(add(v, scale(t, w)), cross([x, y, z], t));
}
export const basisFromQuat = (q) => ({ right: quatRotate(q, [1, 0, 0]), up: quatRotate(q, [0, 1, 0]), normal: quatRotate(q, [0, 0, 1]) });

/** Shortest-path spherical interpolation of unit quaternions. */
export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let c = b;
  if (d < 0) { d = -d; c = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) {
    const r = [0, 1, 2, 3].map((i) => a[i] + (c[i] - a[i]) * t);
    const l = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
    return r.map((x) => x / l);
  }
  const th = Math.acos(clamp(d, -1, 1)), s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [0, 1, 2, 3].map((i) => a[i] * ka + c[i] * kb);
}

// ---------------------------------------------------------------- camera
const DEG = Math.PI / 180;
/**
 * Camera defaults. The eye sits on the ray normal + ahead * travel + side * perpendicular (in the frame),
 * `dist` from the cube centre, so the face ahead and one side face are visible next to the current one;
 * `band` cells of each of those two faces are kept in view.
 * turnMs: seam turn; glideMs: time constant of the eye's glide when the travel direction or side changes.
 */
export const CAM = { dist: 50, ahead: 0.6, side: 0.4, lift: 3, margin: 1.06, band: 5, turnMs: 300, glideMs: 220, reach: HALF + 0.7 };

const LOCAL = { up: [0, 1], right: [1, 0], down: [0, -1], left: [-1, 0] }; // board-local dirs, y up
const NET_OF = (v) => (v[1] > 0 ? 1 : v[0] > 0 ? 2 : v[1] < 0 ? 3 : 4); // cubeNet entry next to the centre

/**
 * Eye, target, up and vertical fov for frame basis B and local eye offset `off` ([right, up] in face units).
 * The view fits the current face (corners lifted for the snake) plus a band `band` cells deep on each of the
 * two neighbour faces the eye leans toward (scaled by how far it leans), then re-aims at the middle of that
 * content, so the board is as large as possible and the head is always on screen.
 */
export function cameraFor(B, off, aspect = 1, opt = CAM) {
  const dir = norm(add(B.normal, add(scale(B.right, off[0]), scale(B.up, off[1]))));
  const eye = scale(dir, opt.dist);
  const N = B.normal, k = opt.reach - HALF; // k: lift of the face corners
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(add(scale(N, HALF + k), add(scale(B.right, sx * HALF), scale(B.up, sy * HALF))));
  for (const [ax, other, o] of [[B.right, B.up, off[0]], [B.up, B.right, off[1]]]) {
    const depth = opt.band * Math.min(1, Math.abs(o) / opt.side);
    const sg = o < 0 ? -1 : 1;
    for (const e of [-1, 1]) {
      const edge = add(scale(N, HALF), add(scale(ax, sg * (HALF + k)), scale(other, e * HALF)));
      pts.push(edge, add(edge, scale(N, -depth)));
    }
  }
  let target = scale(N, opt.lift), f, r, u, tanY = 0.3;
  for (let pass = 0; pass < 3; pass++) {
    f = norm(sub(target, eye));
    r = norm(cross(f, B.up));
    u = cross(r, f);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of pts) {
      const p = sub(q, eye), z = dot(p, f);
      const x = dot(p, r) / z, y = dot(p, u) / z;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    tanY = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / Math.max(0.2, aspect)) * opt.margin;
    if (pass < 2) target = add(eye, scale(add(f, add(scale(r, (x0 + x1) / 2), scale(u, (y0 + y1) / 2))), opt.dist));
  }
  return { eye, target, up: B.up.slice(), fovy: (2 * Math.atan(tanY)) / DEG, near: 1 };
}

/**
 * Stateful camera for the cube room. update(snap, nowMs, { reducedMotion, aspect }) returns
 * { eye, target, up, fovy, near, basis, off, turning, turnT }.
 * - A seam crossing (snap.space.entered set and the frame changed) turns the frame basis from what is on
 *   screen to the new frame over turnMs (smoothstep in time). Board-local directions are carried across
 *   seams, so the snake keeps its direction on screen. Reduced motion, respawn and arrival cut.
 * - The eye offset follows the travel direction and the chosen side with an exponential glide (cut under
 *   reduced motion).
 */
export function createCubeCamera(opt = {}) {
  const o = { ...CAM, ...opt };
  const st = { key: -1, q: null, from: null, to: null, t0: 0, turning: false, off: null, side: 1, last: 0 };

  function offsetTarget(snap, face, rot) {
    const t = LOCAL[snap.dir] || LOCAL.up;
    const p = [-t[1], t[0]]; // left of travel
    let side = st.side;
    const head = snap.snake && snap.snake[0];
    if (head) {
      const along = (head.x - 7.5) * p[0] + (7.5 - head.y) * p[1];
      if (Math.abs(along) > 2.5) side = along > 0 ? 1 : -1;
    }
    const fa = snap.foodAt;
    if (fa && Number.isFinite(fa.f) && fa.f !== face) { // the dot on a side neighbour: look that way
      const net = cubeNet(face, rot);
      if (net[NET_OF(p)].f === fa.f) side = 1;
      else if (net[NET_OF([-p[0], -p[1]])].f === fa.f) side = -1;
    }
    st.side = side;
    return [o.ahead * t[0] + o.side * side * p[0], o.ahead * t[1] + o.side * side * p[1]];
  }

  function currentQ(now) {
    if (!st.turning) return st.q;
    const t = (now - st.t0) / o.turnMs;
    if (t >= 1) { st.turning = false; st.q = st.to; return st.q; }
    return slerp(st.from, st.to, smooth(Math.max(0, t)));
  }

  function update(snap, now, env = {}) {
    const sp = snap && snap.space && snap.space.kind === 'cube' ? snap.space : { face: 0, rot: 0, entered: null };
    const face = sp.face | 0, rot = (sp.rot | 0) & 3;
    const key = face * 4 + rot;
    const B = frameBasis(face, rot);
    const qT = quatFromBasis(B.right, B.up, B.normal);
    const rm = !!env.reducedMotion;
    let cut = false;
    if (st.key < 0) { st.q = qT; st.turning = false; cut = true; }
    else if (key !== st.key) {
      if (sp.entered && !rm) {
        st.from = currentQ(now); st.to = qT; st.t0 = now; st.turning = true; st.q = qT;
      } else { st.q = qT; st.turning = false; cut = true; }
    }
    st.key = key;
    const q = currentQ(now);
    const offT = offsetTarget(snap || {}, face, rot);
    const dt = clamp(now - st.last, 0, 100);
    st.last = now;
    if (!st.off || cut || rm) st.off = offT.slice();
    else {
      const a = 1 - Math.exp(-dt / o.glideMs);
      st.off[0] += (offT[0] - st.off[0]) * a;
      st.off[1] += (offT[1] - st.off[1]) * a;
    }
    const basis = st.turning ? basisFromQuat(q) : B;
    const cam = cameraFor(basis, st.off, env.aspect || 1, o);
    cam.basis = basis;
    cam.off = st.off.slice();
    cam.turning = st.turning;
    cam.turnT = st.turning ? clamp((now - st.t0) / o.turnMs, 0, 1) : 1;
    return cam;
  }

  return { update, state: st, reset() { st.key = -1; st.off = null; st.turning = false; } };
}

export { canonToLocal, localToCanon, DIR_ORDER };
