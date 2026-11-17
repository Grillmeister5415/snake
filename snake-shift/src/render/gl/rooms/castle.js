// CASTLE CUBE, ONCE (castle-room stream, LEVELS_PLAN 6). Board view only.
// One floating cube of edge 16 whose six faces carry the board, in a hand-painted sky kingdom of floating
// gardens, towers, bridges and clouds (chaos 0) that turns glossy saturated neon (chaos 1).
// Uses the engine's custom board (F.custom, F.camera, surface(d), F.protect, F.floor = false): the room draws
// the faces, the whole body from snap.body (canonical cells on every face) and the dot from snap.foodAt.
// The camera sits off the current face (cube.js) and turns across a seam over 300 ms (cut under reduced motion).
import {
  HALF, cellPose, surfaceLerp, surfaceModel, basisModel, localCell, frameDir, cubeAdjacent, createCubeCamera,
  add, sub, scale, norm, cross, lerp3,
} from '../cube.js';
import { CUBE_FACES } from '../../../space.js';

export const meta = {
  id: 'castle',
  name: 'CASTLE CUBE',
  year: 'ONCE',
  luma: 0.62,
  veil: '#f3e6ff',
  weight: 1,
  views: ['board'],
  hud: { fg: '#4a2f6b', bg: 'rgba(255,248,240,0.82)', accent: '#e0567f', panelFg: '#4a2f6b', panelBg: 'rgba(255,246,236,0.94)' },
};

// ---------------------------------------------------------------- sky (real sky below the horizon: no floor)
const SKY = /* glsl */ `
#define SKY_FULL
float ckN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float ckF(vec2 p) {
  float a = 0.0, w = 0.5;
  for (int i = 0; i < 4; i++) { a += w * ckN(p); p = p * 2.07 + vec2(3.1, 7.7); w *= 0.5; }
  return a;
}
vec3 roomSky(vec3 d) {
  float y = d.y;
  float t = uTime;
  float az = atan(d.x, -d.z);
  // ---- own style: watercolour sky, cerulean zenith, cream horizon, rose cloud sea below
  vec3 zen = vec3(0.24, 0.5, 0.94), hor = vec3(1.0, 0.86, 0.72), low = vec3(0.95, 0.7, 0.84);
  vec3 col = mix(hor, zen, smoothstep(0.0, 0.8, y));
  col = mix(col, low, smoothstep(0.0, -0.35, y));
  vec3 sd = normalize(vec3(0.5, 0.38, -0.78));
  float s = max(dot(d, sd), 0.0);
  col += vec3(1.0, 0.82, 0.55) * (pow(s, 6.0) * 0.28 + pow(s, 260.0) * 1.4);
  // painted cloud banks above the horizon (soft wet edges)
  float c = ckF(vec2(az * 2.4 + t * 0.006, y * 5.0));
  float bank = smoothstep(0.48, 0.72, c) * (1.0 - smoothstep(0.05, 0.5, abs(y - 0.14)));
  col = mix(col, mix(vec3(1.0, 0.96, 0.95), vec3(0.78, 0.7, 0.95), smoothstep(0.58, 0.85, c)), bank * 0.9);
  // painted swirls: soft brush rings drifting in the high sky
  float sw = sin(length(vec2(az * 3.0, y * 6.0) - vec2(1.2, 2.6)) * 9.0 - t * 0.2 + ckN(vec2(az, y) * 6.0) * 4.0);
  col += vec3(0.95, 0.9, 1.0) * smoothstep(0.75, 1.0, sw) * smoothstep(0.2, 0.6, y) * 0.12;
  // cloud sea below the kingdom
  float ny = min(y, -0.02);
  vec2 sp = d.xz / -ny * 0.9 + vec2(t * 0.012, t * 0.005);
  float cs = ckF(sp);
  float sea = smoothstep(-0.02, -0.25, y);
  col = mix(col, mix(vec3(0.93, 0.76, 0.9), vec3(1.0, 0.98, 0.96), smoothstep(0.45, 0.75, cs)), sea * smoothstep(0.3, 0.6, cs + 0.15));
  // paper grain and brush streaks
  col *= 0.95 + 0.07 * ckN(vec2(az * 90.0, y * 140.0)) + 0.03 * sin(az * 40.0 + y * 25.0);
  // ---- neon style: glossy saturated night with a hot horizon and outlined clouds
  vec3 nz = hueRotate(vec3(0.1, 0.0, 0.28), uVariant * 1.3);
  vec3 nh = hueRotate(vec3(1.0, 0.15, 0.6), uVariant * 1.3);
  vec3 ncol = mix(nh, nz, smoothstep(-0.05, 0.55, abs(y)));
  ncol += vec3(1.0, 0.6, 0.2) * pow(s, 30.0) * 1.5;
  float edge = smoothstep(0.46, 0.5, c) * (1.0 - smoothstep(0.5, 0.56, c)) * (1.0 - smoothstep(0.05, 0.5, abs(y - 0.14)));
  ncol += hueRotate(vec3(0.1, 1.0, 0.9), uVariant * 1.3) * (edge * 1.4 + bank * 0.25);
  vec2 g = abs(fract(sp * 1.5) - 0.5);
  ncol += hueRotate(vec3(0.2, 0.9, 1.0), uVariant * 1.3) * sea * (1.0 - smoothstep(0.0, 0.05, min(g.x, g.y))) * 0.8;
  ncol += vec3(1.0) * pow(ckN(vec2(az * 120.0, y * 120.0)), 30.0) * step(0.1, y) * 2.0;
  float k = smoothstep(0.0, 1.0, uChaos);
  col = mix(col, ncol, k);
  col *= 1.0 + 0.08 * uBeat * (0.3 + k) + 0.25 * uPunch;
  return col;
}
`;

export const glsl = {
  sky: SKY,
  floor: 'vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) { gloss = 0.0; return vec3(0.0); }\n',
};

// ---------------------------------------------------------------- helpers
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const kOf = (fx) => { const c = clamp(num(fx && fx.chaos), 0, 1); return c * c * (3 - 2 * c); };
// Hue rotation for rgb arrays (same maths as the GLSL hueRotate in shaders.js).
function hue(c, a) {
  const k = 0.57735, ca = Math.cos(a), sa = Math.sin(a), dk = k * (c[0] + c[1] + c[2]) * (1 - ca);
  const cr = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])]; // cross(k, c)
  return [c[0] * ca + cr[0] * sa + k * dk, c[1] * ca + cr[1] * sa + k * dk, c[2] * ca + cr[2] * sa + k * dk];
}
function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- lives icon: a berry
export function life(ctx, x, y, size, filled, fx) {
  const k = kOf(fx), t = num(fx && fx.time);
  const cx = x + size / 2, cy = y + size * 0.56, R = size * 0.32;
  const rgb = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 1) * 255)).join(',')})`;
  const berry = mix([0.36, 0.2, 0.72], [1.0, 0.18, 0.72], k);
  const leaf = mix([0.32, 0.66, 0.36], [0.2, 1.0, 0.6], k);
  ctx.save();
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.lineJoin = 'round';
  // leaf and stem on top
  ctx.beginPath();
  ctx.moveTo(cx, cy - R * 0.9);
  ctx.quadraticCurveTo(cx + R * 0.9, cy - R * 1.9, cx + R * 1.25, cy - R * 1.2);
  ctx.quadraticCurveTo(cx + R * 0.5, cy - R * 0.85, cx, cy - R * 0.9);
  if (filled) { ctx.fillStyle = rgb(leaf); ctx.fill(); } else { ctx.strokeStyle = rgb(leaf); ctx.stroke(); }
  // berry body
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  if (filled) {
    if (k > 0.3) { ctx.shadowColor = rgb(berry); ctx.shadowBlur = size * 0.3 * k; }
    ctx.fillStyle = rgb(berry);
    ctx.fill();
    ctx.shadowBlur = 0;
    // drupelets: a few lighter bumps, and a highlight
    ctx.fillStyle = rgb(mix(berry, [1, 1, 1], 0.28));
    for (let i = 0; i < 5; i++) {
      const a = i * 1.257 + 0.4, r = R * (i ? 0.52 : 0);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx - R * 0.38, cy - R * 0.4, R * (0.16 + 0.04 * Math.sin(t * 3)), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = rgb(mix(berry, [0.5, 0.45, 0.6], 0.35));
    ctx.setLineDash([size * 0.12, size * 0.08]);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- palettes (own -> neon)
// Faces: pale watercolour washes, each a little different; neon: dark glossy jewel tones with bright seams.
const FACE_OWN = [[0.99, 0.91, 0.8], [0.86, 0.96, 0.85], [0.91, 0.87, 0.99], [0.84, 0.92, 0.99], [0.99, 0.87, 0.9], [0.84, 0.96, 0.94]];
const FACE_NEON = [[0.2, 0.03, 0.32], [0.02, 0.16, 0.3], [0.28, 0.0, 0.22], [0.06, 0.06, 0.34], [0.3, 0.02, 0.3], [0.0, 0.2, 0.26]];
const SEAM_NEON = [[0.2, 1.0, 0.95], [1.0, 0.3, 0.8], [0.4, 1.0, 0.4], [1.0, 0.75, 0.2], [0.3, 0.6, 1.0], [1.0, 0.3, 0.4]];
const C = {
  body: [[0.93, 0.42, 0.55], [1.0, 0.16, 0.62]],
  ribbon: [[0.58, 0.48, 0.9], [0.1, 0.95, 1.0]],
  bud: [[1.0, 0.66, 0.26], [1.0, 1.0, 0.6]],
  head: [[0.86, 0.3, 0.46], [1.0, 0.25, 0.75]],
  crown: [[1.0, 0.76, 0.32], [1.0, 0.95, 0.3]],
  eye: [[0.12, 0.06, 0.16], [0.02, 0.0, 0.05]],
  berry: [[0.32, 0.16, 0.7], [0.75, 1.0, 0.15]],
  leaf: [[0.3, 0.64, 0.32], [0.1, 1.0, 0.65]],
};
const WORLD = { // scenery materials: [own, neon]
  rock: [[0.66, 0.54, 0.62], [0.5, 0.1, 0.95]], grass: [[0.56, 0.8, 0.46], [0.1, 1.0, 0.5]],
  trunk: [[0.58, 0.42, 0.38], [0.7, 0.2, 1.0]], bloom: [[0.99, 0.72, 0.84], [1.0, 0.2, 0.7]],
  leaf: [[0.44, 0.74, 0.48], [0.2, 1.0, 0.6]], stone: [[0.98, 0.94, 0.88], [0.3, 0.8, 1.0]],
  roofA: [[0.94, 0.5, 0.52], [1.0, 0.25, 0.55]], roofB: [[0.5, 0.64, 0.94], [0.25, 0.6, 1.0]],
  petalA: [[1.0, 0.98, 0.96], [1.0, 0.45, 0.95]], petalB: [[0.99, 0.64, 0.72], [1.0, 0.35, 0.3]],
  heart: [[1.0, 0.8, 0.45], [1.0, 0.9, 0.2]], cloud: [[1.0, 1.0, 1.0], [0.6, 0.3, 1.0]],
  cloudRose: [[1.0, 0.88, 0.94], [1.0, 0.25, 0.75]],
};
const AMB_OWN = [[0.66, 0.64, 0.7], [0.5, 0.46, 0.54]];   // uPal[0] sky, uPal[1] ground
const AMB_NEON = [[0.36, 0.24, 0.52], [0.22, 0.1, 0.34]];

// One painted sheet per face: near-white wash with soft blotches, per-cell shading and faint seams.
// The colour comes from the material (tint, chaos blend, light compensation), so the sheet stays neutral.
function paintFace(kit, seed) {
  const S = 256, cell = S / 16;
  const cv = kit.canvas ? kit.canvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) { // watercolour blotches, warm and cool
    const x = hash(seed * 91 + i) * S, y = hash(seed * 37 + i * 3.1) * S, r = 20 + hash(seed + i * 7.7) * 70;
    const warm = hash(seed * 5 + i) > 0.5;
    const gr = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    gr.addColorStop(0, warm ? 'rgba(150,110,90,0.075)' : 'rgba(90,100,150,0.075)');
    gr.addColorStop(0.75, warm ? 'rgba(150,110,90,0.035)' : 'rgba(90,100,150,0.035)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let v = 0; v < 16; v++) { // cell shading: every tile a touch lighter or darker
    for (let u = 0; u < 16; u++) {
      const h = hash(seed * 1000 + v * 16 + u);
      g.fillStyle = h > 0.5 ? `rgba(255,255,255,${(h - 0.5) * 0.16})` : `rgba(70,50,90,${(0.5 - h) * 0.07})`;
      g.fillRect(u * cell, v * cell, cell, cell);
    }
  }
  g.strokeStyle = 'rgba(80,60,110,0.06)'; // faint seams between tiles
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 16; i++) { g.moveTo(i * cell + 0.5, 0); g.lineTo(i * cell + 0.5, S); g.moveTo(0, i * cell + 0.5); g.lineTo(S, i * cell + 0.5); }
  g.stroke();
  const img = g.getImageData(0, 0, S, S); // paper grain
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (hash(i * 0.37 + seed) - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; // soft light rim at the seams: doorways, not walls
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, S - 3, S - 3);
  return kit.texture(cv, { mipmap: true });
}

// Ambient light the mesh shader applies to a surface with normal n: 0.3 + mix(ground, sky, 0.5 + 0.5 n.y).
function lightOf(n, pal) {
  const h = 0.5 + 0.5 * n[1];
  return [0, 1, 2].map((c) => 0.3 + pal[3 + c] * (1 - h) + pal[c] * h);
}
// Set mat.color so that the lit result on a surface with normal n is `want` (faces read equally on all sides).
function compensate(mat, want, n, pal) {
  const L = lightOf(n, pal);
  mat.color[0] = want[0] / L[0]; mat.color[1] = want[1] / L[1]; mat.color[2] = want[2] / L[2];
}

// ---------------------------------------------------------------- snake and dot cells
const sameFaceNormal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0.999;
const sameCell = (a, b) => !!a && !!b && a.f === b.f && a.u === b.u && a.v === b.v;
function cubeSpace(snap) { return snap && snap.space && snap.space.kind === 'cube' ? snap.space : null; }
/** The whole body in canonical cells, head first (snap.body); outside cube space the board as face 0. */
export function bodyCells(snap) {
  const sp = cubeSpace(snap);
  if (sp && Array.isArray(snap.body)) return snap.body.filter((c) => c && Number.isFinite(c.f));
  const face = sp ? sp.face : 0, rot = sp ? sp.rot : 0;
  return (snap.snake || []).map((c) => localCell(face, rot, c.x, c.y));
}
/** The dot in canonical cells (snap.foodAt), or null. */
export function dotCell(snap) {
  const sp = cubeSpace(snap);
  if (sp && snap.foodAt && Number.isFinite(snap.foodAt.f)) return snap.foodAt;
  if (snap.food) return localCell(sp ? sp.face : 0, sp ? sp.rot : 0, snap.food.x, snap.food.y);
  return null;
}
/**
 * Surface poses of every body segment at tick fraction a: segment i glides from the cell it held last tick
 * (body[i + 1], or prevTail for the tail) to body[i], over the seam when needed. Pairs that are not cube
 * neighbours (breaks) are never joined: the segment sits on its own cell.
 */
export function bodyPoses(snap, a, lift) {
  const B = bodyCells(snap), n = B.length, out = [];
  const sp = cubeSpace(snap);
  let tailFrom = B[n - 1];
  if (n && !snap.grew && snap.prevTail && sp) tailFrom = localCell(sp.face, sp.rot, snap.prevTail.x, snap.prevTail.y);
  for (let i = 0; i < n; i++) {
    const to = B[i], from = i < n - 1 ? B[i + 1] : tailFrom;
    const moving = !sameCell(from, to) && cubeAdjacent(from, to) >= 0;
    const p = moving ? surfaceLerp(from, to, a, lift) : surfaceLerp(to, to, 1, lift);
    p.cell = to;
    p.moving = moving;
    p.link = i < n - 1 && cubeAdjacent(B[i], B[i + 1]) >= 0;
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- the sky kingdom (scenery)
// Everything sits outside a sphere of radius 58 around the cube centre; the camera stays within 50, so no
// scenery can come between the camera and the cube from any face. Static pieces are merged per material.
export const KEEP_OUT = 58;
function rng(seed) { let i = seed; return () => hash(i++ * 1.618 + seed * 0.37); }
function fibDir(i, n, jitter) {
  const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963 + jitter;
  return norm([Math.cos(th) * r, y * 0.9, Math.sin(th) * r]);
}
function buildWorld(Gm) {
  const R = rng(11);
  const sph = Gm.sphere(12, 8, 0), cone = Gm.cone(16), cyl = Gm.cylinder(14, 1), taper = Gm.cylinder(14, 0.82);
  const P = { rock: [], grass: [], trunk: [], bloom: [], leaf: [], stone: [], roofA: [], roofB: [], petalA: [], petalB: [], heart: [], cloud: [], cloudRose: [] };
  const islands = [], falls = [], flags = [];
  const tower = (c, r, h, roof) => { // stone tower with a pointed roof and a flag on top
    P.stone.push({ g: taper, t: c, s: [2 * r, h, 2 * r] });
    P.stone.push({ g: cyl, t: add(c, [0, h, 0]), s: [2.5 * r, 0.12 * h, 2.5 * r] });
    P[roof].push({ g: cone, t: add(c, [0, h * 1.12, 0]), s: [2.7 * r, 1.4 * h * 0.5, 2.7 * r] });
    flags.push({ p: add(c, [0, h * 1.12 + h * 0.7, 0]), s: r * 1.4, roof });
  };
  const flower = (c, r, k) => { // a giant flower: stem, a ring of petals, a round heart
    P.leaf.push({ g: cyl, t: c, s: [0.25 * r, 2.2 * r, 0.25 * r] });
    const top = add(c, [0, 2.2 * r, 0]);
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2;
      P[k ? 'petalB' : 'petalA'].push({ g: sph, t: add(top, [Math.cos(a) * r * 0.62, 0, Math.sin(a) * r * 0.62]), s: [r * 0.9, r * 0.22, r * 0.9] });
    }
    P.heart.push({ g: sph, t: add(top, [0, 0.12 * r, 0]), s: [r * 0.55, r * 0.4, r * 0.55] });
  };
  const N = 34;
  for (let i = 0; i < N; i++) {
    const dir = fibDir(i, N, 0.7);
    const S = 5 + R() * 6;
    const c = scale(dir, 84 + R() * 56);
    islands.push({ c, S });
    P.rock.push({ g: cone, t: c, s: [2 * S, -1.8 * S, 2 * S] });
    P.rock.push({ g: cone, t: add(c, [S * 0.45, -S * 0.15, -S * 0.3]), s: [1.1 * S, -1.3 * S, 1.1 * S] });
    P.grass.push({ g: cyl, t: add(c, [0, -0.2, 0]), s: [2.12 * S, 0.7, 2.12 * S] });
    const trees = 2 + Math.floor(R() * 3);
    for (let j = 0; j < trees; j++) {
      const a = R() * Math.PI * 2, rr = S * (0.25 + R() * 0.55), base = add(c, [Math.cos(a) * rr, 0.4, Math.sin(a) * rr]);
      const h = S * (0.35 + R() * 0.3);
      P.trunk.push({ g: cyl, t: base, s: [0.16 * S, h, 0.16 * S] });
      P[R() > 0.5 ? 'bloom' : 'leaf'].push({ g: sph, t: add(base, [0, h + S * 0.2, 0]), s: [S * 0.6, S * 0.5, S * 0.6] });
    }
    if (R() > 0.45) tower(add(c, [-S * 0.35, 0.4, S * 0.25]), S * 0.17, S * (1.1 + R() * 0.8), R() > 0.5 ? 'roofA' : 'roofB');
    if (R() > 0.55) flower(add(c, [S * 0.4, 0.4, S * 0.4]), S * 0.32, R() > 0.5);
    if (R() > 0.4) falls.push({ p: add(c, [S * 0.9, 0, 0]), h: S * 3.2, w: S * 0.7, seed: i });
  }
  // the castle: a big island crowned by a keep and four towers, wall ring between them
  const castles = [[-0.42, 0.22, -0.88, 128], [0.5, -0.12, 0.86, 140]];
  for (const [x, y, z, r] of castles) {
    const c = scale(norm([x, y, z]), r), S = 15;
    islands.push({ c, S });
    P.rock.push({ g: cone, t: c, s: [2.2 * S, -2.2 * S, 2.2 * S] });
    P.grass.push({ g: cyl, t: add(c, [0, -0.2, 0]), s: [2.3 * S, 0.8, 2.3 * S] });
    tower(add(c, [0, 0.5, 0]), 2.6, 30, 'roofA');
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2 + 0.4;
      tower(add(c, [Math.cos(a) * 9, 0.5, Math.sin(a) * 9]), 1.6, 15 + 4 * (j % 2), j % 2 ? 'roofB' : 'roofA');
    }
    P.stone.push({ g: cyl, t: add(c, [0, 0.5, 0]), s: [19, 6, 19] });
    falls.push({ p: add(c, [S * 1.1, 0, 0]), h: S * 4, w: S, seed: 40 + r });
  }
  // clouds: soft puffs all around, a pink-tinted layer below the kingdom
  for (let i = 0; i < 72; i++) {
    const dir = fibDir(i, 72, 2.1);
    const c = scale(dir, 72 + R() * 90);
    const k = 3 + Math.floor(R() * 4), sz = 4 + R() * 5;
    for (let j = 0; j < k; j++) {
      P[dir[1] < -0.2 ? 'cloudRose' : 'cloud'].push({ g: sph, t: add(c, [(j - k / 2) * sz * 0.8, R() * sz * 0.4, (R() - 0.5) * sz]), s: [sz * (1.4 + R()), sz * (0.9 + R() * 0.5), sz * (1.2 + R())] });
    }
  }
  // arched bridges between near islands, only where the span stays clear of the cube's sphere
  const bridges = [];
  for (let i = 0; i < islands.length && bridges.length < 7; i++) {
    for (let j = i + 1; j < islands.length && bridges.length < 7; j++) {
      const A0 = islands[i], B0 = islands[j];
      const dv = [B0.c[0] - A0.c[0], 0, B0.c[2] - A0.c[2]];
      const L = Math.hypot(dv[0], dv[2]);
      if (L < 20 || L > 62 || Math.abs(B0.c[1] - A0.c[1]) > 18) continue;
      const u = [dv[0] / L, 0, dv[2] / L];
      const A = add(A0.c, scale(u, A0.S * 0.85)), B = add(B0.c, scale(u, -B0.S * 0.85));
      let clear = true;
      for (let t = 0; t <= 1.001; t += 0.1) if (Math.hypot(...lerp3(A, B, t)) < KEEP_OUT + 4) clear = false;
      if (clear) bridges.push({ A, B });
    }
  }
  // guard: push any piece whose bounds reach into the keep-out sphere straight outward
  for (const list of Object.values(P)) {
    for (const q of list) {
      const ext = partExtent(q), r = Math.hypot(q.t[0], q.t[1], q.t[2]);
      if (r - ext < KEEP_OUT) q.t = scale(q.t, (KEEP_OUT + ext + 0.5) / Math.max(r, 1e-3));
    }
  }
  return { P, falls, flags, bridges, islands };
}
/** Conservative radius of a merged piece around its origin t (unit meshes scaled by s). */
export const partExtent = (q) => Math.max(Math.abs(q.s[0]), Math.abs(q.s[1]), Math.abs(q.s[2]));

// Harness hook (not part of the room contract): the last created instance; inst.holdCamera keeps the camera.
export const debug = { inst: null, world: null };

// ---------------------------------------------------------------- the room
export function create(kit) {
  const M = new Float32Array(16), G = new Float32Array(16);
  const faceMats = [0, 1, 2, 3, 4, 5].map((f) => kit.material({
    tex: paintFace(kit, f + 1), lines: 16, lineWidth: 0.022, lineColor: [0, 0, 0], uvScale: [1, 1], fog: 0,
  }));
  const mat = {
    body: kit.material({ rim: [0.3, 0.25, 0.3], fog: 0 }),
    head: kit.material({ rim: [0.3, 0.25, 0.3], fog: 0 }),
    crown: kit.material({ chrome: 0.35, fog: 0 }),
    eye: kit.material({ fog: 0 }),
    berry: kit.material({ chrome: 0.3, rim: [0.4, 0.3, 0.5], fog: 0 }),
    leaf: kit.material({ fog: 0 }),
  };
  const cam = createCubeCamera();
  const pal = new Float32Array(24);
  // scenery: own pastel colour -> neon (dark glossy body, neon emissive and rim), blended every frame
  const pm = [];
  function pmat(own, neon, o = {}) {
    const m = kit.material({ ...o, color: own });
    pm.push({ m, own, neon, em: (o.emissive || [0, 0, 0]).slice(), rim: (o.rim || [0, 0, 0]).slice(), ch: o.chrome || 0 });
    return m;
  }
  const world = buildWorld(kit.geometry);
  debug.world = world;
  const merged = [];
  for (const [name, parts] of Object.entries(world.P)) {
    if (!parts.length || !WORLD[name]) continue;
    const id = 'castle_' + name;
    kit.addGeometry(id, kit.geometry.merge(parts));
    const cloud = name.startsWith('cloud');
    merged.push({ id, cloud, mat: pmat(WORLD[name][0], WORLD[name][1], { rim: cloud ? [0.3, 0.26, 0.34] : [0.14, 0.12, 0.18], emissive: cloud ? [0.16, 0.14, 0.18] : [0, 0, 0] }) });
  }
  const arcade = pmat([0.96, 0.9, 0.84], [0.25, 0.9, 1.0], { mode: 1, twoSided: true, uvScale: [6, 1], rim: [0.1, 0.1, 0.12] });
  const deck = pmat([0.9, 0.78, 0.7], [1.0, 0.3, 0.7], { rim: [0.1, 0.1, 0.12] });
  const flagA = pmat([0.95, 0.42, 0.55], [1.0, 0.2, 0.6], { twoSided: true, emissive: [0.15, 0.04, 0.08] });
  const flagB = pmat([0.4, 0.62, 0.95], [0.2, 0.8, 1.0], { twoSided: true, emissive: [0.04, 0.08, 0.15] });
  const moon = kit.material({ color: [0.2, 0.2, 0.2], emissive: [1.0, 0.95, 0.84], fog: 0 });
  const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), CM = new Float32Array(ID);
  const MOON = scale(norm([0.38, 0.52, -0.76]), 560);
  const F = {
    pal, room: new Float32Array(16), fog: [0.98, 0.9, 0.86],
    custom: true, floor: false, reflections: false, curb: false, povWalls: false,
    camera: { eye: [0, 30, 40], target: [0, 0, 0], up: [0, 1, 0], fovy: 35, near: 1 },
    protect: CUBE_FACES.map((Fc) => ({
      origin: add(scale(Fc.normal, HALF), add(scale(Fc.right, -HALF), scale(Fc.down, -HALF))),
      u: scale(Fc.right, 2 * HALF), v: scale(Fc.down, 2 * HALF), h: 0.9,
    })),
  };
  const st = { k: 0, var: 0, cam: null, bite: null, biteKey: '' };
  const hv = (c) => (st.var ? hue(c, st.var) : c);
  const tone = (pair, k = st.k) => mix(pair[0], hv(pair[1]), k);

  function setMat(m, want, n, k, glow = 0.35) {
    compensate(m, want, n, pal);
    m.emissive[0] = want[0] * glow * k; m.emissive[1] = want[1] * glow * k; m.emissive[2] = want[2] * glow * k;
  }

  const inst = {
    camera: cam,
    holdCamera: false, // harness: keep the last camera
    forceCamera: null, // harness: { eye, target, up, fovy, near } used instead of the cube camera
    state: st,
    frame(fx, snap) {
      const k = kOf(fx);
      st.k = k;
      st.var = (num(fx.variant) % 6) * 0.9;
      const a0 = mix(AMB_OWN[0], AMB_NEON[0], k), a1 = mix(AMB_OWN[1], AMB_NEON[1], k);
      pal.set(a0, 0); pal.set(a1, 3);
      F.fog = mix([0.98, 0.9, 0.86], hv([0.5, 0.1, 0.5]), k);
      const c = inst.forceCamera ? inst.forceCamera : inst.holdCamera && st.cam ? st.cam
        : cam.update(snap, num(fx.now, 0), { reducedMotion: fx.reducedMotion, aspect: kit.aspect ? kit.aspect() : 1 });
      st.cam = c;
      F.camera.eye = c.eye; F.camera.target = c.target; F.camera.up = c.up; F.camera.fovy = c.fovy; F.camera.near = c.near;
      for (let f = 0; f < 6; f++) {
        const m = faceMats[f], n = CUBE_FACES[f].normal;
        // the face turned most toward the eye (the current one) reads brightest; the others shade off with angle
        const e = c.eye, el = Math.hypot(e[0] - n[0] * HALF, e[1] - n[1] * HALF, e[2] - n[2] * HALF) || 1;
        const facing = clamp(((e[0] - n[0] * HALF) * n[0] + (e[1] - n[1] * HALF) * n[1] + (e[2] - n[2] * HALF) * n[2]) / el, 0, 1);
        const shade = 0.74 + 0.26 * facing;
        compensate(m, scale(mix(FACE_OWN[f], hv(FACE_NEON[f]), k), shade), n, pal);
        const s = hv(SEAM_NEON[f]);
        m.lineColor[0] = s[0] * 0.13 * k; m.lineColor[1] = s[1] * 0.13 * k; m.lineColor[2] = s[2] * 0.13 * k;
        m.emissive[0] = FACE_NEON[f][0] * 0.2 * k; m.emissive[1] = FACE_NEON[f][1] * 0.2 * k; m.emissive[2] = FACE_NEON[f][2] * 0.2 * k;
        m.chrome = 0.3 * k;
      }
      mat.body.chrome = 0.06 + 0.4 * k; mat.head.chrome = 0.06 + 0.4 * k;
      const beat = num(fx.beat);
      for (const p of pm) {
        const nn = hv(p.neon), m = p.m;
        for (let i = 0; i < 3; i++) {
          m.color[i] = p.own[i] + (nn[i] * 0.3 - p.own[i]) * k;
          m.emissive[i] = p.em[i] + (nn[i] * (0.5 + 0.35 * beat) - p.em[i]) * k;
          m.rim[i] = p.rim[i] + (nn[i] * 1.1 - p.rim[i]) * k;
        }
        m.chrome = p.ch + (0.45 - p.ch) * k;
      }
      const mo = mix([1.0, 0.95, 0.84], hv([1.0, 0.3, 0.85]), k);
      moon.emissive[0] = mo[0]; moon.emissive[1] = mo[1]; moon.emissive[2] = mo[2];
      // a new bite: remember its canonical cell (fx.bite is board-local on the face current at that moment)
      const sp = cubeSpace(snap);
      if (fx.bite && Number.isFinite(fx.bite.x)) {
        const key = `${fx.bite.x},${fx.bite.y},${snap.score}`;
        if (key !== st.biteKey && num(fx.biteAge, 1e9) < 400) {
          st.biteKey = key;
          st.bite = localCell(sp ? sp.face : 0, sp ? sp.rot : 0, fx.bite.x, fx.bite.y);
        }
      }
      return F;
    },

    surface(d) {
      const s = d.snap, fx = d.fx, k = st.k, t = num(fx.time);
      // the six faces
      for (let f = 0; f < 6; f++) {
        const Fc = CUBE_FACES[f];
        basisModel(M, scale(Fc.normal, HALF), Fc.right, Fc.normal, Fc.down, 2 * HALF, 1, 2 * HALF);
        d.mesh('floorQuad', M, faceMats[f]);
      }
      // the body, tail first: ribbon beads with a cream bud on every third
      const a = clamp(num(d.progress, 1), 0, 1);
      const P = bodyPoses(s, a, 0.21);
      const n = P.length;
      const sp = cubeSpace(s);
      let hf = null;
      if (n) {
        const h = P[0];
        hf = h.moving ? h.fwd : (sp && h.cell.f === sp.face ? frameDir(sp.face, sp.rot, s.dir || 'up') : null);
        if (!hf && n > 1) hf = norm(add(h.pos, scale(P[1].pos, -1)));
        if (!hf) hf = CUBE_FACES[h.cell.f].right;
      }
      const pulse = 1 + 0.05 * num(fx.beat) * (0.4 + k);
      for (let i = n - 1; i >= 1; i--) {
        const p = P[i];
        const j = P[i - 1];
        // ribbon between neighbours on the same face only: never across a break, never through the cube
        if (P[i - 1] && p.link !== undefined && P[i].cell && cubeAdjacent(P[i].cell, j.cell) >= 0 && sameFaceNormal(p.normal, j.normal)) {
          const dv = sub(j.pos, p.pos), L = Math.hypot(dv[0], dv[1], dv[2]);
          if (L > 0.05 && L < 1.2) {
            setMat(mat.body, tone(C.ribbon), p.normal, k);
            surfaceModel(M, add(lerp3(p.pos, j.pos, 0.5), scale(p.normal, -0.19)), p.normal, dv, 0.56, 0.3, L);
            d.mesh('box', M, mat.body);
          }
        }
        setMat(mat.body, tone(i % 4 === 2 ? C.ribbon : C.body), p.normal, k);
        const w = 0.9 * pulse;
        surfaceModel(M, p.pos, p.normal, p.fwd[0] || p.fwd[1] || p.fwd[2] ? p.fwd : hf, w, 0.44, w);
        d.mesh('sphere', M, mat.body);
        if (i % 3 === 0) {
          setMat(mat.body, tone(C.bud), p.normal, k, 0.6);
          surfaceModel(M, add(p.pos, scale(p.normal, 0.19)), p.normal, hf, 0.32, 0.18, 0.32);
          d.mesh('gem', M, mat.body);
        }
      }
      if (n) { // head: tapered block pointing along travel, with a little crown and two eyes
        const h = P[0];
        const N = h.normal;
        const base = add(h.pos, scale(N, -0.21 + 0.005));
        setMat(mat.head, tone(C.head), N, k);
        surfaceModel(M, base, N, hf, 0.94, 0.4, 0.94);
        d.mesh('head', M, mat.head);
        const Z = scale(norm(hf), -1), X = norm([N[1] * Z[2] - N[2] * Z[1], N[2] * Z[0] - N[0] * Z[2], N[0] * Z[1] - N[1] * Z[0]]);
        const at = (lx, ly, lz) => add(base, add(scale(X, lx), add(scale(N, ly), scale(Z, lz))));
        setMat(mat.crown, tone(C.crown), N, k, 0.5);
        for (let j = -1; j <= 1; j++) {
          basisModel(M, at(j * 0.2, 0.4, 0.2 - Math.abs(j) * 0.04), X, N, Z, 0.14, 0.26 + (j ? 0 : 0.08), 0.14);
          d.mesh('cone', M, mat.crown);
        }
        setMat(mat.eye, tone(C.eye), N, k, 0);
        for (const side of [-1, 1]) {
          basisModel(M, at(side * 0.25, 0.38, -0.12), X, N, Z, 0.15, 0.15, 0.15);
          d.mesh('sphere', M, mat.eye);
        }
      }
      // the dot: a berry with a leaf, on its own face
      const dc = dotCell(s);
      if (dc) {
        const q = cellPose(dc.f, dc.u, dc.v, 0);
        const bob = fx.reducedMotion ? 0 : 0.05 * Math.sin(t * 4);
        const spin = [Math.cos(t * 1.5), Math.sin(t * 1.5)];
        const fw = add(scale(q.right, spin[0]), scale(q.down, spin[1]));
        setMat(mat.berry, tone(C.berry), q.normal, k, 0.55);
        surfaceModel(M, add(q.pos, scale(q.normal, 0.34 + bob)), q.normal, fw, 0.68, 0.64, 0.68);
        d.mesh('sphere', M, mat.berry);
        setMat(mat.leaf, tone(C.leaf), q.normal, k, 0.4);
        surfaceModel(M, add(q.pos, scale(q.normal, 0.64 + bob)), q.normal, fw, 0.44, 0.12, 0.2);
        d.mesh('gem', M, mat.leaf);
      }
    },

    props(d) {
      const fx = d.fx, t = num(fx.time), still = !!fx.reducedMotion;
      const a = still ? 0 : t * 0.012; // the cloud layer turns slowly around the kingdom
      CM[0] = Math.cos(a); CM[2] = -Math.sin(a); CM[8] = Math.sin(a); CM[10] = Math.cos(a);
      for (const m of merged) d.mesh(m.id, m.cloud ? CM : ID, m.mat);
      for (const b of world.bridges) { // an arcade hanging under a deck
        const X = norm(sub(b.B, b.A)), Y0 = [0, 1, 0];
        const Y = norm(sub(Y0, scale(X, X[1]))), Z = cross(X, Y);
        const L = Math.hypot(...sub(b.B, b.A)), mid = lerp3(b.A, b.B, 0.5), h = Math.min(9, L * 0.22);
        basisModel(M, add(mid, scale(Y, -h)), X, Y, Z, L, h, 1);
        d.mesh('plane', M, arcade);
        basisModel(M, mid, X, Y, Z, L + 1.5, 0.7, 2.6);
        d.mesh('box', M, deck);
      }
      for (const f of world.flags) { // pennants on the tower tips, fluttering
        const w = still ? 0 : Math.sin(t * 3 + f.p[0]) * 0.35;
        const X = [Math.cos(w), 0, Math.sin(w)];
        basisModel(M, f.p, X, [0, 1, 0], cross(X, [0, 1, 0]), f.s * 2.4, f.s * 1.1, 1);
        d.mesh('plane', M, f.roof === 'roofA' ? flagA : flagB);
      }
      basisModel(M, MOON, [1, 0, 0], [0, 1, 0], [0, 0, 1], 70, 70, 70);
      d.mesh('sphere', M, moon);
    },

    glows(d) {
      const fx = d.fx, s = d.snap, k = st.k, t = num(fx.time), beat = num(fx.beat), still = !!fx.reducedMotion;
      // the twelve seams: soft light, never a rail (doorways); brighter and coloured in neon
      for (let ax = 0; ax < 3; ax++) {
        for (let j = 0; j < 4; j++) {
          const p0 = [0, 0, 0], p1 = [0, 0, 0];
          const b1 = (ax + 1) % 3, b2 = (ax + 2) % 3;
          p0[ax] = -HALF; p1[ax] = HALF;
          p0[b1] = p1[b1] = j & 1 ? HALF : -HALF;
          p0[b2] = p1[b2] = j & 2 ? HALF : -HALF;
          const c = mix([1.0, 0.92, 0.8], hv(SEAM_NEON[(ax * 4 + j) % 6]), k);
          d.beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.08, c, 0.16 + k * (0.45 + 0.35 * beat), 0, 0.7, 3);
        }
      }
      // a soft halo under the dot
      const dc = dotCell(s);
      if (dc) {
        const q = cellPose(dc.f, dc.u, dc.v, 0.03);
        basisModel(G, q.pos, q.right, q.normal, q.down, 2.6, 1, 2.6);
        d.glow('floorQuad', G, mix([0.55, 0.4, 1.0], hv([0.7, 1.0, 0.2]), k), 0, 0.45 + 0.35 * beat);
      }
      // the bite: a ring on the face and a beam out of it
      if (st.bite && fx.bite && num(fx.biteAge, 1e9) < 900) {
        const b = st.bite, q = cellPose(b.f, b.u, b.v, 0.04), u = num(fx.biteAge) / 900;
        const rc = mix([1.0, 0.75, 0.85], hv([1.0, 0.3, 0.9]), k);
        basisModel(G, q.pos, q.right, q.normal, q.down, 9, 1, 9);
        d.glow('floorQuad', G, rc, 1, (1 - u) * (1 - u) * 2.2, u * 0.95, 0.05 + 0.06 * u);
        if (u < 0.4) {
          const view = norm(sub(d.eye, q.pos));
          let X = cross(q.normal, view);
          X = Math.hypot(...X) < 1e-3 ? q.right : norm(X);
          basisModel(G, q.pos, X, q.normal, cross(X, q.normal), 1.4, 6, 1);
          d.glow('plane', G, rc, 3, (1 - u / 0.4) * 1.4);
        }
      }
      // waterfalls from the islands, sparkles and the moon's halo
      const wc = mix([0.75, 0.85, 1.0], hv([0.2, 1.0, 1.0]), k);
      for (const f of world.falls) d.billboard(f.p[0], f.p[1] - f.h, f.p[2], f.w, f.h, wc, 5, 0.55 + 0.4 * k, f.seed * 0.37, 1.1);
      for (let i = 0; i < 40; i++) {
        const dir = fibDir(i, 40, 4.4), r = 66 + hash(i * 3.7) * 60;
        const tw = still ? 0.6 : 0.5 + 0.5 * Math.sin(t * (1.3 + hash(i) * 2) + i);
        const c = mix([1.0, 0.92, 0.7], hv(SEAM_NEON[i % 6]), k);
        d.billboard(dir[0] * r, dir[1] * r, dir[2] * r, 2.2, 2.2, c, 0, (0.35 + 0.9 * k) * tw * (1 + beat * 0.6));
      }
      d.billboard(MOON[0], MOON[1] - 150, MOON[2], 300, 300, mix([1.0, 0.9, 0.75], hv([1.0, 0.25, 0.8]), k), 0, 0.35 + 0.3 * k);
    },
  };
  debug.inst = inst;
  return inst;
}
