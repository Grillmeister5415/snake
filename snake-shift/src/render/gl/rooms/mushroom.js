// MUSHROOM LAND, 1991 (stream mushroom, levels wave 1). A voxel valley around a navy lake: terraced cubic hills with
// moss mantles and waterfalls, giant stepped toadstools that bounce on the beat, voxel clouds under a pixelated
// banded sky with a pixel sun. At chaos 0 everything is flat 1991 pixel art (ink cube seams, posterised sky); as
// chaos rises it turns into glowing voxel neon (bright cube edges, synth-sliced sun, dome grid, glowing lake grid).
// Snake: coral/cream checker blocks; dot: magenta voxel spore orb; life mushroom (items): tall bell cap in mint and
// gold bands on a cream stem. Interface: see the top of rooms/court.js; items(d) is the LEVELS_PLAN §5.3 hook.
//
// Uniform use:
//   uPal  0 ambient sky, 1 ambient ground, 2 zenith, 3 mid, 4 horizon, 5 sun, 6 cloud, 7 accent (neon lines)
//   uRoom 0 xyz unused, w sky pixel size (rad)
//         1 x neon mix, y beat, z punch flash, w scroll clock (s)
//         2 rgb lake dark, w sun radius (rad)
//         3 rgb lake ripple, w unused

import { life as flatLife, mushroomFade, neonMix } from '../../timelines/mushroom.js';

export const meta = {
  id: 'mushroom',
  name: 'MUSHROOM LAND',
  year: '1991',
  luma: 0.24,
  veil: '#1c1a5a',
  weight: 0.9,
  rules: 'box',
  mushrooms: true,
  hud: { fg: '#f6e7c8', bg: 'rgba(12,16,64,0.72)', accent: '#7ff0c8', panelFg: '#f6e7c8', panelBg: 'rgba(12,16,64,0.9)' },
};

// HUD life icon (LEVELS_PLAN §4.3): the same toadstool as the flat look; (x, y) is the slot's top-left.
export function life(ctx, x, y, size, filled, fx) { flatLife(ctx, x, y, size, filled, fx); }

export const glsl = {
  sky: /* glsl */ `
vec3 mushBand(float t) {
  return t < 0.5 ? mix(uPal[4], uPal[3], t * 2.0) : mix(uPal[3], uPal[2], t * 2.0 - 1.0);
}
vec3 roomSky(vec3 d) {
  float B = uRoom[0].w;
  float neon = uRoom[1].x;
  float az = atan(d.x, -d.z);
  float el = asin(clamp(abs(d.y), 0.0, 1.0));
  vec2 cell = floor(vec2(az, el) / B);
  vec2 q = (cell + 0.5) * B;
  // posterised bands, checker dither on each band edge
  float tb = clamp(q.y / 1.0, 0.0, 1.0) * 6.0;
  float band = floor(tb);
  if (fract(tb) > 0.74 && mod(cell.x + cell.y, 2.0) > 0.5) band += 1.0;
  vec3 col = mushBand(min(band, 6.0) / 6.0);
  // stars
  float hs = hash12(cell);
  if (q.y > 0.3 && hs > 0.991) col = mix(col, vec3(1.0, 0.95, 0.85), 0.55 + 0.45 * uBeat);
  // blocky clouds drifting sideways, shaded bottom row
  float cw = B * 7.0, chh = B * 3.0;
  vec2 cg = vec2(floor((q.x + uRoom[1].w * 0.006) / cw), floor(q.y / chh));
  float ch = hash12(cg + 7.0);
  if (q.y > 0.05 && q.y < 0.45 && ch > 0.84) {
    float under = step(fract(q.y / chh), 0.34);
    col = mix(uPal[6], uPal[6] * vec3(0.6, 0.58, 0.85), under);
  }
  // pixel sun low behind the board; sliced like a synth sun once neon
  float sr = uRoom[2].w;
  float ds = length(vec2(q.x, q.y - 0.08));
  if (ds < sr) {
    float slice = step(0.45, neon) * step(q.y, 0.08 + sr * 0.2) * step(fract(q.y / (B * 3.0) - uTime * 0.6), 0.4);
    if (slice < 0.5) col = mix(uPal[5], vec3(1.0, 0.98, 0.88), step(0.08 + sr * 0.5, q.y));
  }
  // neon dome grid, drawn in sky pixels
  float gx = step(mod(cell.x, 24.0), 0.5), gy = step(mod(cell.y, 12.0), 0.5);
  col += uPal[7] * max(gx, gy) * neon * (0.55 + 0.8 * uBeat);
  col += uPal[7] * exp(-q.y * 14.0) * (0.12 + 0.5 * uBeat) * (0.35 + neon);
  col += vec3(1.0, 0.95, 0.85) * uRoom[1].z * 0.35;
  return col;
}
`,
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  float neon = uRoom[1].x;
  vec2 pp = p / 0.5;
  vec2 c = floor(pp);
  vec2 w = aaWidth(pp);
  float far = smoothstep(0.3, 0.9, max(w.x, w.y));
  float h = hash12(c);
  vec2 t2 = floor(p / 2.0);
  vec3 col = uRoom[2].rgb * (1.0 + 0.3 * mod(t2.x + t2.y, 2.0));
  float rip = step(0.9, fract(c.y * 0.173 + c.x * 0.031 + h * 0.12 - uRoom[1].w * 0.06));
  col = mix(col, uRoom[3].rgb, rip * (1.0 - far) * 0.8);
  col += vec3(0.9, 0.95, 1.0) * step(0.996, hash12(c + floor(uTime * 2.0) * 13.0)) * (1.0 - far) * (0.5 + uBeat);
  vec2 gq = p / 2.0;
  col += uPal[7] * gridAA(gq, 0.04, aaWidth(gq)) * neon * (0.7 + 0.9 * uBeat) * (1.0 - 0.6 * far);
  float r = max(abs(p.x) - uBoard.x, abs(p.y) - uBoard.y);
  col += uPal[7] * exp(-pow(r - (1.0 - uBeat) * 16.0, 2.0) * 0.15) * uBeat * (0.2 + 0.5 * neon);
  float bd = length(p - uBite.xy);
  col += uPal[5] * exp(-pow((bd - uBite.z * 22.0) * 0.6, 2.0)) * exp(-uBite.z * 1.5) * uBite.w * 1.6;
  col += vec3(1.0, 0.95, 0.85) * uRoom[1].z * 0.3;
  gloss = mix(0.5, 0.78, neon) * (1.0 - rip * 0.4);
  n = normalize(n + vec3(sin(c.x * 1.7 + uTime * 1.5), 0.0, cos(c.y * 1.3 + uTime * 1.2)) * 0.03 * (1.0 - far));
  return col;
}
`,
};

const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const lerp = (a, b, t) => a + (b - a) * t;
function mix3(out, a, b, t, k = 1) { out[0] = lerp(a[0], b[0], t) * k; out[1] = lerp(a[1], b[1], t) * k; out[2] = lerp(a[2], b[2], t) * k; return out; }
function setRGB(arr, i, c) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }

// ---- geometry with UVs in world units, so `lines` draws a voxel grid on every face whatever the size ----
function voxInto(g, x0, y0, z0, x1, y1, z1, u = 1, o = 0) {
  const quad = (a, b, c, d, n, uv) => {
    const i0 = g.pos.length / 3;
    [a, b, c, d].forEach((p, k) => { g.pos.push(p[0], p[1], p[2]); g.nrm.push(n[0], n[1], n[2]); g.uv.push((uv[k][0] + o) / u, (uv[k][1] + o) / u); });
    g.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[z1, y0], [z0, y0], [z0, y1], [z1, y1]]);
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[x1, y0], [x0, y0], [x0, y1], [x1, y1]]);
}
const G = () => ({ pos: [], nrm: [], uv: [], idx: [] });

// ---- palettes: four own (one per bite) and two neon; mixed by neonMix(chaos) ----
const OWN = [
  { zen: [0.04, 0.06, 0.25], mid: [0.2, 0.17, 0.55], hor: [0.69, 0.48, 0.82], sun: [0.96, 0.83, 0.42], cloud: [0.96, 0.9, 0.78], lakeA: [0.05, 0.07, 0.28], lakeB: [0.35, 0.66, 1.0] },
  { zen: [0.07, 0.19, 0.5], mid: [0.29, 0.5, 0.88], hor: [0.78, 0.92, 1.0], sun: [1.0, 0.95, 0.63], cloud: [1, 1, 1], lakeA: [0.06, 0.12, 0.38], lakeB: [0.54, 0.82, 1.0] },
  { zen: [0.11, 0.04, 0.21], mid: [0.42, 0.15, 0.52], hor: [1.0, 0.6, 0.66], sun: [1.0, 0.82, 0.63], cloud: [1.0, 0.85, 0.88], lakeA: [0.1, 0.05, 0.25], lakeB: [0.6, 0.72, 1.0] },
  { zen: [0.02, 0.08, 0.16], mid: [0.08, 0.35, 0.42], hor: [0.54, 0.82, 0.63], sun: [0.91, 0.97, 0.82], cloud: [0.88, 0.96, 0.91], lakeA: [0.02, 0.1, 0.18], lakeB: [0.42, 0.88, 0.94] },
];
const NEON = [
  { zen: [0.02, 0.0, 0.06], mid: [0.16, 0.02, 0.34], hor: [1.0, 0.17, 0.84], sun: [1.0, 0.31, 0.85], cloud: [1.0, 0.54, 0.94], lakeA: [0.03, 0.01, 0.1], lakeB: [0.17, 0.94, 1.0], acc: [0.17, 0.94, 1.0] },
  { zen: [0.0, 0.03, 0.08], mid: [0.0, 0.23, 0.42], hor: [0.17, 0.94, 1.0], sun: [0.17, 0.94, 1.0], cloud: [1.0, 0.17, 0.84], lakeA: [0.0, 0.02, 0.08], lakeB: [1.0, 0.54, 0.94], acc: [1.0, 0.17, 0.84] },
];
const CREAM = [0.96, 0.9, 0.78];
// cap pairs (base, band): own coral / violet / teal, neon pink / cyan / yellow
const CAP_OWN = [[[0.88, 0.33, 0.25], [1.0, 0.54, 0.35]], [[0.48, 0.36, 0.78], [0.7, 0.6, 0.94]], [[0.18, 0.72, 0.66], [0.5, 0.94, 0.78]]];
const CAP_NEON = [[[1.0, 0.17, 0.84], [1.0, 0.6, 0.94]], [[0.17, 0.94, 1.0], [0.78, 1.0, 1.0]], [[1.0, 0.91, 0.1], [1.0, 0.96, 0.63]]];
const SPORE = [[1.0, 0.54, 0.94], [0.5, 0.94, 0.78], [1.0, 0.89, 0.48]];
const MINT = [0.5, 0.94, 0.78], GOLD = [0.96, 0.78, 0.29];

export function create(kit) {
  const { material, cols, rows } = kit;
  const GEO = kit.geometry;
  const HX = cols / 2, HZ = rows / 2;

  // ---------- static layout (everything outside the board and out of the near wedge) ----------
  const hills = [];
  const hillSpots = [
    [-(HX + 9), -2, 5, 4], [HX + 10, -6, 6, 5], [-(HX + 18), -16, 8, 5], [HX + 20, -20, 9, 5],
    [-14, -HZ - 16, 7, 4], [6, -HZ - 22, 9, 5], [24, -HZ - 34, 11, 5], [-30, -HZ - 38, 12, 5],
    [-(HX + 30), 2, 9, 4], [HX + 32, -2, 10, 4], [0, -HZ - 52, 16, 5],
  ];
  const hg = G(), mg = G(), falls = [];
  hillSpots.forEach(([cx, cz, a, tiers], i) => {
    const th = 1.6 + hash(i * 3.3) * 1.6, u = a > 9 ? 2 : 1;
    let x0 = cx - a, x1 = cx + a, z0 = cz - a * 0.8, z1 = cz + a * 0.8, y = 0;
    const steps = [];
    for (let j = 0; j < tiers; j++) {
      voxInto(hg, x0, y, z0, x1, y + th, z1, u);
      steps.push({ x0, x1, z: z1 + 0.13, y0: y, y1: y + th });
      voxInto(mg, x0 - 0.15, y + th, z0 - 0.15, x1 + 0.15, y + th + 0.35, z1 + 0.15, u * 0.5);
      // moss drips down the front and sides
      for (let k = 0; k < 9; k++) {
        const t = hash(i * 17 + j * 5 + k), dl = 0.3 + hash(i * 7 + j * 3 + k * 1.3) * th * 0.6;
        if (k % 3 === 0) voxInto(mg, x0 + (x1 - x0) * t - 0.2, y + th - dl, z1 - 0.02, x0 + (x1 - x0) * t + 0.2, y + th, z1 + 0.18, 0.5);
        else if (k % 3 === 1) voxInto(mg, x1 - 0.02, y + th - dl, z0 + (z1 - z0) * t - 0.2, x1 + 0.18, y + th, z0 + (z1 - z0) * t + 0.2, 0.5);
        else voxInto(mg, x0 - 0.18, y + th - dl, z0 + (z1 - z0) * t - 0.2, x0 + 0.02, y + th, z0 + (z1 - z0) * t + 0.2, 0.5);
      }
      y += th;
      const s = (x1 - x0) * 0.18 + 0.4, sh = (hash(i * 9 + j) - 0.5) * 0.8;
      x0 += s + sh; x1 -= s - sh; z0 += s * 0.7; z1 -= s * 0.7;
      if (x1 - x0 < 1.5 || z1 - z0 < 1.2) break;
    }
    // a waterfall cascading down the front face of every terrace on most hills
    const tp = steps[steps.length - 1];
    if (hash(i * 5.7) > 0.3) {
      const w = Math.min(1 + a * 0.12, (tp.x1 - tp.x0) * 0.45);
      falls.push({ x: (tp.x0 + tp.x1) / 2 + (hash(i * 2.9) - 0.5) * (tp.x1 - tp.x0 - w) * 0.8, w, steps, z: steps[0].z });
    }
    hills.push({ cx, cz, a, top: y });
  });
  kit.addGeometry('mushHills', hg);
  kit.addGeometry('mushMoss', mg);

  // Stepped dome cap, split into two band sets (A: steps 0, 2, 4; B: steps 1, 3). Diameter 1, height 0.8.
  const capA = [], capB = [];
  [0.5, 0.44, 0.36, 0.26, 0.14].forEach((r, k) => (k % 2 ? capB : capA).push({ g: GEO.cylinder(24, 1), t: [0, k * 0.16, 0], s: [2 * r, 0.16, 2 * r] }));
  kit.addGeometry('mushCapA', GEO.merge(capA));
  kit.addGeometry('mushCapB', GEO.merge(capB));

  // Life mushroom: bell profile (y, radius), bands gold / mint / gold / mint / gold, stem cream. Height ~0.98.
  const prof = [[0.3, 0.36], [0.37, 0.31], [0.52, 0.29], [0.62, 0.27], [0.76, 0.22], [0.88, 0.15], [0.98, 0.04]];
  const gold = [], mint = [];
  for (let k = 0; k < prof.length - 1; k++) {
    const [y0, r0] = prof[k], [y1, r1] = prof[k + 1];
    const band = k === 0 || k === 2 || k >= 4 ? gold : mint;
    band.push({ g: GEO.cylinder(28, r1 / r0), t: [0, y0, 0], s: [2 * r0, y1 - y0, 2 * r0] });
  }
  kit.addGeometry('mushLifeGold', GEO.merge(gold));
  kit.addGeometry('mushLifeMint', GEO.merge(mint));
  kit.addGeometry('mushLifeStem', GEO.merge([
    { g: GEO.cylinder(18, 0.9), t: [0, 0, 0], s: [0.24, 0.32, 0.24] },
    { g: GEO.cylinder(18, 0.75), t: [0, 0, 0], s: [0.32, 0.06, 0.32] },
    { g: GEO.cylinder(24, 0.7), t: [0, 0.29, 0], s: [0.62, 0.03, 0.62] },
  ]));

  // Snake segment: unit voxel block with 0..1 UVs per face (checker texture), voxel spore orb for the dot.
  const seg = G(); voxInto(seg, -0.5, 0, -0.5, 0.5, 1, 0.5, 1, 0.5); kit.addGeometry('mushSeg', seg);
  const orb = G();
  voxInto(orb, -0.5, 0.2, -0.3, 0.5, 0.8, 0.3, 0.2); voxInto(orb, -0.3, 0, -0.3, 0.3, 1, 0.3, 0.2);
  voxInto(orb, -0.3, 0.2, -0.5, 0.3, 0.8, 0.5, 0.2); voxInto(orb, -0.4, 0.1, -0.4, 0.4, 0.9, 0.4, 0.2);
  kit.addGeometry('mushOrb', orb);
  // Voxel cloud: a lumpy row of blocks, base y = 0, about 1 x 0.5 x 0.5.
  const cl = G();
  voxInto(cl, -0.5, 0, -0.22, 0.5, 0.22, 0.22, 0.125); voxInto(cl, -0.32, 0.22, -0.18, 0.1, 0.42, 0.18, 0.125);
  voxInto(cl, 0.02, 0.22, -0.16, 0.36, 0.34, 0.16, 0.125); voxInto(cl, -0.2, 0.42, -0.12, 0.0, 0.5, 0.12, 0.125);
  kit.addGeometry('mushCloud', cl);

  const checker = kit.canvas ? kit.canvas(64, 64) : (() => { const c = document.createElement('canvas'); c.width = c.height = 64; return c; })();
  {
    const g = checker.getContext('2d');
    g.fillStyle = '#e8583f'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#f6e7c8'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  }
  const checkerTex = kit.texture(checker, { repeat: true, mipmap: true });

  const stools = [
    [-(HX + 6.5), -3, 9, 4.5, 0], [HX + 8, -10, 12, 6, 1], [-(HX + 14), -20, 16, 7.5, 2], [HX + 16, -28, 18, 8.5, 0],
    [-6, -HZ - 22, 14, 7, 1], [11, -HZ - 30, 20, 9.5, 2], [-(HX + 4), 5, 3.5, 2.2, 1], [HX + 4.6, 3, 4.2, 2.6, 2],
    [-(HX + 22), -4, 11, 6, 2], [HX + 25, -12, 13, 7, 0], [-24, -HZ - 30, 10, 5, 0],
  ].map(([x, z, h, r, k]) => ({ x, z, h, r, k }));
  const small = [];
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) small.push({ x: s * (HX + 1.3 + (i % 2) * 0.6), z: -HZ + 1 + i * 2.8 + (s > 0 ? 1.2 : 0), h: 0.7 + hash(i * 3 + s) * 0.8, r: 0.38 + hash(i * 5 + s) * 0.2, k: i % 3 });
  const ferns = [];
  for (const s of [-1, 1]) for (const z of [-6.5, -1.5, 3.5]) ferns.push({ x: s * (HX + 2.4), z: z + (s > 0 ? 1.4 : 0), s });
  const clouds = [];
  for (let i = 0; i < 9; i++) clouds.push({ x: (hash(i * 4.1) - 0.5) * 160, y: 22 + hash(i * 6.3) * 18, z: -HZ - 50 - hash(i * 8.7) * 70, s: 10 + hash(i * 2.2) * 12, sp: 0.6 + hash(i * 9.9) * 1.2 });
  const spores = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 3 !== 2;
    spores.push({ x: side ? (i % 2 ? -1 : 1) * (HX + 2 + hash(i * 3.7) * 22) : (hash(i * 5.3) - 0.5) * 50, z: side ? 6 - hash(i * 7.1) * 40 : -HZ - 3 - hash(i * 2.9) * 30, sp: 0.6 + hash(i * 1.3) * 1.2, ph: hash(i * 9.1) * 14, k: i % 3, sz: 0.25 + hash(i * 4.4) * 0.3 });
  }

  // ---------- materials ----------
  const M = {
    hill: material({ color: [0.29, 0.25, 0.6], lines: 1, lineWidth: 0.05, lineColor: [-0.12, -0.12, -0.1], fog: 0.6 }),
    moss: material({ color: [0.24, 0.6, 0.24], lines: 1, lineWidth: 0.06, lineColor: [-0.1, -0.12, -0.1], fog: 0.6 }),
    water: material({ color: [0.35, 0.66, 1.0], emissive: [0.1, 0.2, 0.3], lines: 1, lineWidth: 0.04, lineColor: [0.2, 0.25, 0.3], uvScale: [1, 6], fog: 0.5 }),
    streak: material({ color: [0.9, 0.97, 1.0], emissive: [0.4, 0.45, 0.5] }),
    stem: material({ color: [0.95, 0.89, 0.75], lines: 1, lineWidth: 0.05, lineColor: [-0.12, -0.12, -0.1], uvScale: [10, 4], fog: 0.5 }),
    gill: material({ color: [0.54, 0.42, 0.35], lines: 1, lineWidth: 0.12, lineColor: [-0.2, -0.2, -0.2], uvScale: [24, 1], fog: 0.5 }),
    cloud: material({ color: [0.96, 0.9, 0.78], emissive: [0.3, 0.28, 0.25], lines: 1, lineWidth: 0.05, lineColor: [-0.25, -0.25, -0.1], fog: 0.4 }),
    fern: material({ color: [0.24, 0.54, 0.23], lines: 1, lineWidth: 0.08, lineColor: [-0.1, -0.1, -0.1], uvScale: [1, 6], twoSided: true }),
    lifeGold: material({ color: GOLD.slice(), emissive: [0.25, 0.18, 0.04], lines: 1, lineWidth: 0.06, lineColor: [-0.2, -0.18, -0.08], uvScale: [16, 1] }),
    lifeMint: material({ color: MINT.slice(), emissive: [0.12, 0.25, 0.2], lines: 1, lineWidth: 0.06, lineColor: [-0.15, -0.2, -0.18], uvScale: [16, 1] }),
    lifeStem: material({ color: CREAM.slice(), emissive: [0.12, 0.11, 0.09] }),
  };
  const capMats = [0, 1, 2].map(() => [material({ color: [1, 1, 1], lines: 1, lineWidth: 0.05, lineColor: [-0.15, -0.15, -0.15], uvScale: [16, 1], fog: 0.5 }),
    material({ color: [1, 1, 1], lines: 1, lineWidth: 0.05, lineColor: [-0.15, -0.15, -0.15], uvScale: [16, 1], fog: 0.5 })]);
  const sporeMats = SPORE.map((c) => material({ color: c, emissive: c.map((v) => v * 0.4), lines: 1, lineWidth: 0.1, lineColor: [0.3, 0.3, 0.3] }));

  const snakeBody = material({ color: [1, 1, 1], emissive: [0.08, 0.04, 0.03], mode: 2, lines: 1, lineWidth: 0.06, lineColor: [-0.3, -0.25, -0.2] });
  snakeBody.tex = checkerTex;
  const snakeHead = material({ color: [0.91, 0.35, 0.25], emissive: [0.12, 0.04, 0.02], lines: 1, lineWidth: 0.05, lineColor: [0.5, 0.45, 0.35] });
  const snakeEye = material({ color: [1, 1, 1], emissive: [0.85, 0.88, 0.95] });
  const dot = material({ color: [1.0, 0.25, 0.85], emissive: [0.5, 0.06, 0.42], lines: 1, lineWidth: 0.07, lineColor: [-0.3, -0.1, -0.25] });

  const pal = new Float32Array(24);
  const room = new Float32Array(16);
  const F = {
    pal, room,
    board: { panel: [0.05, 0.08, 0.3], grid: [0.3, 0.32, 0.55], frame: CREAM.slice(), lineWidth: 0.03, band: 0.3, gridGlow: 0.35, frameGlow: 0.7 },
    snake: {
      body: snakeBody, head: snakeHead, eye: snakeEye, dot,
      bodyGeom: 'mushSeg', headGeom: 'head', dotGeom: 'mushOrb',
      bodySize: [0.76, 0.24, 0.76], headSize: [0.8, 0.24, 0.8], dotSize: [0.56, 0.28, 0.56],
      pool: [1.0, 0.45, 0.3], dotPool: [1.0, 0.3, 0.85], poolIntensity: 0.22, dotPoolBeat: 0.5,
      segment: null,
    },
    ring: [0.5, 1.0, 0.8], wall: CREAM.slice(), beacon: [1.0, 0.4, 0.9], fog: [0.6, 0.45, 0.8],
  };

  const T = [0, 0, 0], T2 = [0, 0, 0];
  let alive = true, q = 0, beat = 0, time = 0, step = 0, clock = 0, lastT = null, itemsDone = false, capIdx = 0;
  F.snake.segment = (i, n, mat) => {
    if (!alive) { mat.color[0] = 0.66; mat.color[1] = 0.64; mat.color[2] = 0.78; mat.emissive[0] = mat.emissive[1] = mat.emissive[2] = 0.1; return; }
    mat.color[0] = mat.color[1] = mat.color[2] = 1;
    const wave = beat * Math.max(0, Math.sin(i * 0.8 - time * 8)), alt = i % 2;
    // own: faint warm emissive; neon: alternating hot pink / cyan glow pulsing down the body
    mat.emissive[0] = lerp(0.08, alt ? 0.3 : 0.95, q) + 0.25 * wave;
    mat.emissive[1] = lerp(0.04, alt ? 0.9 : 0.15, q) + 0.15 * wave;
    mat.emissive[2] = lerp(0.03, alt ? 1.0 : 0.65, q) + 0.15 * wave;
  };

  function frame(fx, snap) {
    alive = snap.alive !== false;
    q = neonMix(fx.chaos); beat = fx.beat; time = fx.time; itemsDone = false;
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, fx.time - lastT));
    lastT = fx.time;
    clock = (clock + dt * (1 + 2 * fx.chaos)) % 3600;
    step = fx.reducedFlash ? 0 : fx.beatIndex;
    const v = fx.variant, O = OWN[mod(v, 4)], N = NEON[mod(v, 2)];
    capIdx = mod(v + (q > 0.6 && !fx.reducedFlash ? step : 0), 3);

    setRGB(pal, 0, mix3(T, [0.78, 0.74, 0.92], [0.5, 0.4, 0.7], q));
    setRGB(pal, 1, mix3(T, [0.5, 0.44, 0.62], [0.25, 0.15, 0.4], q));
    setRGB(pal, 2, mix3(T, O.zen, N.zen, q));
    setRGB(pal, 3, mix3(T, O.mid, N.mid, q));
    setRGB(pal, 4, mix3(T, O.hor, N.hor, q, 1 + 0.25 * fx.beat));
    setRGB(pal, 5, mix3(T, O.sun, N.sun, q));
    setRGB(pal, 6, mix3(T, O.cloud, N.cloud, q));
    setRGB(pal, 7, mix3(T, CREAM, N.acc, q));
    room[3] = lerp(0.012, 0.007, q);
    room[4] = q; room[5] = fx.beat; room[6] = fx.punch * 0.8; room[7] = clock;
    mix3(T, O.lakeA, N.lakeA, q); room[8] = T[0]; room[9] = T[1]; room[10] = T[2]; room[11] = lerp(0.1, 0.14, q);
    mix3(T, O.lakeB, N.lakeB, q); room[12] = T[0]; room[13] = T[1]; room[14] = T[2];
    mix3(F.fog, O.hor, N.hor, q, 0.8);

    // board: navy panel, cream rail -> neon
    mix3(F.board.panel, [0.05, 0.08, 0.3], [0.03, 0.02, 0.14], q);
    mix3(F.board.grid, [0.3, 0.32, 0.55], N.acc, q, lerp(1, 0.55, q));
    mix3(F.board.frame, CREAM, N.hor, q, 1 + 0.3 * fx.beat);
    F.board.frameGlow = 0.7 + 0.5 * q;
    F.wall = F.board.frame;
    mix3(F.ring, MINT, N.acc, q);

    // props: own flat pixel colours with ink seams -> dark bodies with glowing neon edges
    const k = 1 + 0.6 * fx.beat;
    mix3(M.hill.color, [0.29, 0.25, 0.6], [0.08, 0.03, 0.2], q);
    mix3(M.hill.lineColor, [-0.12, -0.12, -0.1], N.acc, q, q > 0.01 ? k : 1);
    mix3(M.hill.emissive, [0, 0, 0], [0.04, 0.0, 0.1], q);
    mix3(M.moss.color, [0.24, 0.6, 0.24], [0.05, 0.3, 0.12], q);
    mix3(M.moss.emissive, [0.0, 0.03, 0.0], [0.1, 0.9, 0.35], q, k);
    mix3(M.moss.lineColor, [-0.1, -0.12, -0.1], [0.8, 1.0, 0.35], q);
    mix3(M.water.emissive, [0.1, 0.2, 0.3], N.lakeB, q, 0.5 + 0.4 * fx.beat);
    mix3(M.streak.emissive, [0.4, 0.45, 0.5], [1, 1, 1], q);
    mix3(M.stem.color, [0.95, 0.89, 0.75], [0.3, 0.35, 0.45], q);
    mix3(M.stem.emissive, [0, 0, 0], [0.4, 0.8, 0.9], q);
    mix3(M.gill.emissive, [0, 0, 0], N.hor, q);
    mix3(M.cloud.emissive, [0.3, 0.28, 0.25], N.cloud, q, 0.4 + 0.6 * q);
    mix3(M.cloud.color, O.cloud, [0.2, 0.1, 0.3], q);
    mix3(M.fern.color, [0.24, 0.54, 0.23], [0.05, 0.3, 0.15], q);
    mix3(M.fern.emissive, [0, 0, 0], [0.1, 1.0, 0.54], q);
    for (let c = 0; c < 3; c++) {
      // neon: both bands in one saturated hue (the second darker), cube edges in the next hue
      const o = CAP_OWN[mod(c + v, 3)], n = CAP_NEON[mod(c + capIdx, 3)][0], e = CAP_NEON[mod(c + capIdx + 1, 3)][0];
      for (let b = 0; b < 2; b++) {
        const m = capMats[c][b];
        mix3(m.color, o[b], [0.06, 0.02, 0.08], q);
        mix3(m.emissive, [0, 0, 0], n, q, (b ? 0.45 : 0.85) * (0.8 + 0.4 * fx.beat));
        mix3(m.lineColor, [-0.15, -0.15, -0.15], e, q, 0.9);
      }
    }
    sporeMats.forEach((m, i) => mix3(m.emissive, SPORE[i], SPORE[mod(i + capIdx, 3)], q, 0.4 + 0.9 * q + 0.4 * fx.beat));

    // snake, dot
    snakeHead.color.set(alive ? mix3(T, [0.91, 0.35, 0.25], [1.0, 0.25, 0.55], q) : [0.55, 0.54, 0.66]);
    snakeHead.emissive.set(alive ? mix3(T, [0.12, 0.04, 0.02], [0.75, 0.1, 0.4], q) : [0.08, 0.08, 0.1]);
    snakeHead.lineColor.set(alive ? [0.5, 0.45, 0.35] : [0.1, 0.1, 0.12]);
    snakeEye.emissive.set(alive ? [0.85, 0.88, 0.95] : [0.25, 0.25, 0.3]);
    dot.emissive.set(mix3(T2, [0.5, 0.06, 0.42], [0.9, 0.15, 0.8], q, 1 + 0.4 * fx.beat));
    F.beacon = dot.emissive;
    return F;
  }

  const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function stool(d, s, bounce, punch, big) {
    const [ma, mb] = capMats[s.k];
    const st = 1 + 0.12 * bounce - 0.18 * punch, sq = 1 + 0.15 * punch;
    const sw = s.r * (big ? 0.42 : 0.5), lift = s.h * 0.03 * bounce;
    d.mesh('cylinder', d.trs(s.x, 0, s.z, 0, sw, s.h + lift, sw), M.stem);
    if (big) d.mesh('cylinder', d.trs(s.x, s.h * 0.68 + lift, s.z, 0, sw * 1.6, s.h * 0.04, sw * 1.6), M.stem);
    d.mesh('cylinder', d.trs(s.x, s.h - s.r * 0.08 + lift, s.z, 0, s.r * 1.8 * sq, s.r * 0.1, s.r * 1.8 * sq), M.gill);
    const w = s.r * 2 * sq, h = s.r * st;
    d.mesh('mushCapA', d.trs(s.x, s.h + lift, s.z, 0, w, h, w), ma);
    d.mesh('mushCapB', d.trs(s.x, s.h + lift, s.z, 0, w, h, w), mb);
  }

  function props(d) {
    const fx = d.fx, t = fx.time, still = fx.reducedMotion;
    const bounce = still ? 0 : fx.beat, punch = still ? 0 : fx.punch;
    d.mesh('mushHills', ID, M.hill);
    d.mesh('mushMoss', ID, M.moss);
    // waterfalls: one water sheet per terrace face, with bright streak blocks sliding down each
    const sp = 2.5 + 5 * fx.chaos;
    for (let i = 0; i < falls.length; i++) {
      const f = falls[i];
      for (let j = 0; j < f.steps.length; j++) {
        const st = f.steps[j], hh = st.y1 - st.y0 + 0.36;
        d.mesh('box', d.trs(f.x, st.y0, st.z, 0, f.w, hh, 0.26), M.water);
        if (d.mirror) continue;
        for (let k = 0; k < 2; k++) {
          const sl = Math.min(0.6, hh * 0.4), y = st.y0 + hh - sl - mod(t * sp + k * hh * 0.5 + j + i, hh - sl);
          d.mesh('box', d.trs(f.x + (k ? 0.22 : -0.22) * f.w, y, st.z + 0.15, 0, f.w * 0.26, sl, 0.08), M.streak);
        }
      }
      if (d.mirror) continue;
      for (let k = 0; k < 3; k++) {
        const b = still ? 0.2 : 0.2 + 0.25 * Math.abs(Math.sin(t * 5 + k * 2 + i));
        d.mesh('box', d.trs(f.x + (k - 1) * f.w * 0.45, 0, f.z + 0.5 + (k % 2) * 0.3, k, 0.5 + b, 0.35 + b, 0.5), M.streak);
      }
    }
    for (const s of stools) stool(d, s, bounce, punch, true);
    for (const c of clouds) {
      const x = mod(c.x + t * c.sp + 90, 180) - 90;
      d.mesh('mushCloud', d.trs(x, c.y, c.z, 0, c.s, c.s, c.s), M.cloud);
    }
    if (d.mirror) return;
    for (let i = 0; i < small.length; i++) {
      const s = small[i], hop = (i + step) % 2 === 0 ? bounce : 0;
      stool(d, s, hop, punch, false);
    }
    for (let i = 0; i < ferns.length; i++) {
      const f = ferns[i];
      for (let b = 0; b < 5; b++) {
        const a = (b - 2) * 0.32 + (still ? 0 : Math.sin(t * 1.7 + i + b) * 0.06);
        d.mesh('box', d.euler(f.x, 0, f.z, 0, f.s > 0 ? 0.3 : -0.3, a, 0.12, 1.4 + (2 - Math.abs(b - 2)) * 0.35, 0.4), M.fern);
      }
    }
    for (const sp of spores) {
      const y = mod(sp.ph + t * sp.sp, 14), rot = still ? 0.6 : t * 1.3 + sp.ph;
      d.mesh('box', d.euler(sp.x, y, sp.z, rot, rot * 0.7, 0, sp.sz, sp.sz, sp.sz), sporeMats[sp.k]);
    }
  }

  // The life mushroom (LEVELS_PLAN §3.5 / §5.3). Opaque meshes inside its own cell. Gentle rock and bob; as it nears
  // expiry it dims and shrinks a little (no blinking).
  function items(d) {
    if (d.mirror) return;
    itemsDone = true;
    const snap = d.snap, m = snap && snap.mushroom;
    if (!m) return;
    const fx = d.fx, t = fx.time, still = fx.reducedMotion;
    const fade = mushroomFade(snap), [x, z] = d.cellToWorld(m.x, m.y);
    const pov = d.view === 'pov', sc = 0.82 + 0.18 * fade, sy = sc * (pov ? 1 : 0.42), sxz = sc * (pov ? 1 : 0.95);
    const bob = still || !pov ? 0 : 0.03 * (1 + Math.sin(t * 2.3)), w = pov ? 0.07 : 0.05;
    const rx = still ? 0 : w * Math.sin(t * 1.7), rz = still ? 0 : w * Math.cos(t * 1.3);
    const ry = still ? 0.4 : t * 0.6;
    const k = 0.35 + 0.65 * fade, glow = (0.35 + 0.5 * q + 0.25 * beat) * fade;
    mix3(M.lifeGold.color, [0, 0, 0], GOLD, k); mix3(M.lifeGold.emissive, [0, 0, 0], GOLD, glow * 0.6);
    mix3(M.lifeMint.color, [0, 0, 0], MINT, k); mix3(M.lifeMint.emissive, [0, 0, 0], MINT, glow * 0.6);
    mix3(M.lifeStem.color, [0, 0, 0], CREAM, k); mix3(M.lifeStem.emissive, [0, 0, 0], CREAM, 0.15 * fade);
    d.mesh('mushLifeStem', d.euler(x, bob, z, rx, ry, rz, sxz, sy, sxz), M.lifeStem);
    d.mesh('mushLifeMint', d.euler(x, bob, z, rx, ry, rz, sxz, sy, sxz), M.lifeMint);
    d.mesh('mushLifeGold', d.euler(x, bob, z, rx, ry, rz, sxz, sy, sxz), M.lifeGold);
  }

  const WHITE = [1, 1, 1];
  function glows(d) {
    // Until the engine calls items() itself (LEVELS_PLAN §5.3), draw the mushroom here, before any glow.
    if (!itemsDone) items(d);
    const fx = d.fx, t = fx.time, snap = d.snap;
    for (const f of falls) d.floorGlow(f.x, f.z + 1.2, 4 + f.w, M.water.emissive, 0.5 + 0.4 * fx.beat);
    if (q > 0.05) {
      for (const s of stools) {
        const c = capMats[s.k][0].emissive;
        d.billboard(s.x, s.h - s.r * 0.6, s.z - 0.5, s.r * 4, s.r * 3, c, 0, q * (0.25 + 0.4 * fx.beat));
      }
    }
    const nS = Math.floor(30 + 60 * q), gk = (0.6 + 0.8 * fx.beat) * (fx.reducedFlash ? 0.5 : 1);
    for (let i = 0; i < nS; i++) {
      const side = i % 3 !== 2, sx = side ? (i % 2 ? -1 : 1) * (HX + 1.5 + hash(i * 3.1) * 26) : (hash(i * 5.9) - 0.5) * 60;
      const sz = side ? 7 - hash(i * 7.7) * 46 : -HZ - 2 - hash(i * 2.3) * 40;
      const y = mod(hash(i * 1.9) * 16 + t * (0.5 + hash(i * 4.3)), 16);
      const tw = 0.5 + 0.5 * Math.sin(t * (2 + (i % 5)) + i);
      d.billboard(sx, y, sz, 0.35, 0.35, SPORE[mod(i + capIdx, 3)], 0, tw * gk);
    }
    if (snap && snap.mushroom) {
      const [x, z] = d.cellToWorld(snap.mushroom.x, snap.mushroom.y), fade = mushroomFade(snap);
      d.floorGlow(x, z, 1.3, MINT, (0.45 + 0.3 * fx.beat) * fade);
      if (d.view === 'pov') d.billboard(x, 0, z, 0.8, 7, MINT, 3, 1.1 * fade);
    }
    if (snap && snap.food) {
      const [x, z] = d.cellToWorld(snap.food.x, snap.food.y);
      d.billboard(x, 0.2, z, 0.7, 0.05, WHITE, 0, 0.6 * (0.5 + 0.5 * Math.sin(t * 6)));
    }
  }

  return { frame, props, items, glows };
}
