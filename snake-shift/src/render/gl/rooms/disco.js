// DISCO INFERNO, 1977 (rooms-b stream). An enormous club: amber/violet dome with a chasing marquee
// ring, a giant faceted mirror ball behind the board throwing moving light spots over the dome and the
// light-up dance floor, rainbow arches, glitter stars and mirror pillars. Snake = chain of mirror
// tiles that sparkle; dot = tiny gold mirror ball. Interface: see the top of rooms/court.js.
//
// Uniform use:
//   uPal  0 ambient sky, 1 ambient ground, 2 zenith, 3 mid, 4 horizon, 5/6/7 tile colours A/B/C
//   uRoom 0 rgb tile colour D, w mirror-ball spin (rad, accumulated)
//         1 x lit fraction, y floor pattern (0 random, 1 rings, 2 diagonals, 3 checker), z punch flash, w step index
//         2 x ray intensity, y glitter, z light-spot intensity, w tile brightness
//         3 xyz mirror-ball world position, w sky hue shift

export const meta = {
  id: 'disco',
  name: 'DISCO INFERNO',
  year: '1977',
  luma: 0.3,
  veil: '#3a0c34',
  weight: 3,
  hud: { fg: '#fff1d6', bg: 'rgba(44,8,40,0.72)', accent: '#ffb321', panelFg: '#ffe9c9', panelBg: 'rgba(52,10,46,0.88)' },
};

export const glsl = {
  sky: /* glsl */ `
vec3 discoPick(float h) {
  return h < 0.25 ? uPal[5] : h < 0.5 ? uPal[6] : h < 0.75 ? uPal[7] : uRoom[0].rgb;
}
// What chrome sees below the horizon: the lit dance floor, projected.
vec3 discoGround(vec3 d) {
  vec2 g = d.xz / max(-d.y, 0.05) * 0.9;
  vec2 t = floor(g);
  float h = hash12(t + vec2(uRoom[1].w * 3.1, uRoom[1].w * 1.7));
  float lit = step(1.0 - max(uRoom[1].x, 0.3), h);
  vec2 f = abs(fract(g) - 0.5);
  float core = 1.0 - smoothstep(0.32, 0.48, max(f.x, f.y));
  vec3 col = vec3(0.06, 0.02, 0.07) + discoPick(fract(h * 5.7)) * lit * core * uRoom[2].w;
  return mix(col, uPal[4], exp(d.y * 6.0) * 0.8);
}
vec3 roomSky(vec3 d) {
  vec3 col;
  if (d.y < 0.0) {
    col = discoGround(d);
  } else {
    float y = d.y;
    col = mix(uPal[4], uPal[3], smoothstep(0.0, 0.3, y));
    col = mix(col, uPal[2], smoothstep(0.25, 0.9, y));
    // light rays fanning out from the mirror ball
    vec3 bd = normalize(uRoom[3].xyz - uEye);
    float c = dot(d, bd);
    float ang = acos(clamp(c, -1.0, 1.0));
    vec3 rx = normalize(cross(bd, vec3(0.0, 1.0, 0.0)));
    vec3 ry = cross(rx, bd);
    vec3 s = d - bd * c;
    float a = atan(dot(s, ry), dot(s, rx));
    float rays = pow(0.5 + 0.5 * sin(a * 13.0 + uRoom[0].w * 1.7), 8.0)
               + 0.7 * pow(0.5 + 0.5 * sin(a * 21.0 - uRoom[0].w * 2.6), 14.0);
    col += mix(uPal[5], vec3(1.0, 0.92, 0.75), 0.55) * rays * exp(-ang * 1.3) * uRoom[2].x * smoothstep(0.02, 0.2, ang);
    col += vec3(1.0, 0.7, 0.45) * exp(-ang * 5.0) * 0.3 * uRoom[2].x;
    // mirror-ball reflections sweeping the dome
    float az = atan(d.x, -d.z);
    vec2 sp = vec2((az + uRoom[0].w) * 10.0, y * 26.0);
    vec2 cell = floor(sp);
    float h = hash12(cell);
    if (h > 1.0 - 0.3 * uRoom[2].z) {
      vec2 q = fract(sp) - 0.5;
      col += discoPick(fract(h * 9.1)) * exp(-dot(q, q) * 18.0) * 1.3 * uRoom[2].z * smoothstep(0.03, 0.15, y);
    }
    // glitter
    vec2 gp = vec2(az * 70.0, y * 90.0);
    vec2 gc = floor(gp);
    float gh = hash12(gc + 17.0);
    if (gh > 0.93) {
      vec2 q = fract(gp) - 0.5;
      float tw = 0.5 + 0.5 * sin(uTime * (3.0 + gh * 9.0) + gh * 60.0);
      float star = exp(-dot(q, q) * 60.0) + 0.6 * exp(-abs(q.x) * 40.0 - q.y * q.y * 30.0) + 0.6 * exp(-abs(q.y) * 40.0 - q.x * q.x * 30.0);
      col += vec3(1.0, 0.9, 0.75) * star * tw * tw * uRoom[2].y * smoothstep(0.05, 0.25, y);
    }
    // marquee bulb ring chasing around the club
    float by = (y - 0.12) * 70.0;
    if (abs(by) < 1.2) {
      float bx = (az / (2.0 * PI) + 0.5) * 180.0;
      float idx = floor(bx);
      vec2 q = vec2(fract(bx) - 0.5, by * 0.42);
      float on = step(mod(idx + uRoom[1].w, 3.0), 0.99);
      col += mix(vec3(0.35, 0.12, 0.05), vec3(1.0, 0.82, 0.45) * (1.2 + uBeat), on) * exp(-dot(q, q) * 26.0);
    }
    // horizon glow
    col += uPal[7] * exp(-y * 18.0) * (0.35 + 0.9 * uBeat);
  }
  col = hueRotate(col, uRoom[3].w);
  col += vec3(1.0, 0.85, 0.7) * uRoom[1].z * 0.35;
  return col;
}
`,
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  vec2 q = p + uBoard;                     // cell units, aligned to the board corner
  vec2 t = floor(q);
  vec2 f = fract(q) - 0.5;
  vec2 w = aaWidth(q);
  float aw = max(w.x, w.y);
  float st = uRoom[1].w;
  float mode = uRoom[1].y;
  vec2 c = t + 0.5 - uBoard;
  float ring = floor(max(abs(c.x) - uBoard.x, abs(c.y) - uBoard.y));
  float h = hash12(t + vec2(st * 3.1, st * 1.7));
  float lit;
  if (mode < 0.5) lit = step(1.0 - uRoom[1].x, h);
  else if (mode < 1.5) lit = step(mod(ring - st, 3.0), 0.5);
  else if (mode < 2.5) lit = step(mod(t.x + t.y - st, 4.0), 0.5);
  else lit = step(mod(t.x + t.y + st, 2.0), 0.5);
  lit = max(lit, step(1.0 - uRoom[1].x * 0.45, h) * step(0.5, mode));
  vec3 tc = discoPick(hash12(t * 1.37 + floor(st * 0.5) * 0.71 + 11.0));
  float edge = max(abs(f.x), abs(f.y));
  float core = 1.0 - smoothstep(0.25, 0.47, edge);
  float grout = smoothstep(0.47 - aw, 0.5, edge);
  vec3 col = vec3(0.05, 0.015, 0.06) + tc * lit * (0.2 + 0.95 * core) * uRoom[2].w;
  col = mix(col, vec3(0.012, 0.0, 0.02), grout * 0.85);
  // far away the tiles blur into their average
  vec3 avg = vec3(0.07, 0.025, 0.08) + (uPal[5] + uPal[6] + uPal[7] + uRoom[0].rgb) * 0.25 * uRoom[1].x * 0.7 * uRoom[2].w;
  float far = smoothstep(0.3, 0.9, aw);
  col = mix(col, avg, far);
  lit = mix(lit, 0.3, far);
  // mirror-ball light spots raking across the floor
  vec3 v = normalize(vec3(p.x, 0.0, p.y) - uRoom[3].xyz);
  float az = atan(v.x, v.z) + uRoom[0].w;
  float el = asin(clamp(-v.y, -1.0, 1.0));
  vec2 sp = vec2(az * 15.0, el * 24.0);
  vec2 sc = floor(sp);
  float sh = hash12(sc + 3.0);
  vec2 sf = fract(sp) - 0.5;
  float spot = step(1.0 - 0.32 * uRoom[2].z, sh) * exp(-dot(sf, sf) * 13.0) * (1.0 - far * 0.7);
  col += discoPick(fract(sh * 7.3)) * spot * 1.5 * uRoom[2].z;
  // bite shock ring and a beat wave rolling out from the board
  float bd = length(p - uBite.xy);
  col += uPal[7] * exp(-pow((bd - uBite.z * 24.0) * 0.5, 2.0)) * exp(-uBite.z * 1.3) * uBite.w * 2.2;
  float r = max(abs(p.x) - uBoard.x, abs(p.y) - uBoard.y);
  col += uPal[5] * exp(-pow(r - (1.0 - uBeat) * 14.0, 2.0) * 0.12) * uBeat * 0.5;
  col += vec3(1.0, 0.9, 0.8) * uRoom[1].z * 0.5;
  gloss = mix(0.72, 0.2, lit * core);
  return col;
}
`,
};

const TAU = Math.PI * 2;
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- geometry built here (the kit has no faceted shapes); same { pos, nrm, uv, idx } format ----
function quadInto(g, a, b, c, d, n) {
  const i0 = g.pos.length / 3;
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  [a, b, c, d].forEach((p, k) => { g.pos.push(p[0], p[1], p[2]); g.nrm.push(n[0], n[1], n[2]); g.uv.push(uvs[k][0], uvs[k][1]); });
  g.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}
// Mirror ball: flat-shaded facets, each with UV 0..1 so `lines` draws the grout. Diameter 1.
function facetSphere(seg, rings, yOff = 0) {
  const g = { pos: [], nrm: [], uv: [], idx: [] };
  const P = (th, ph) => [Math.sin(th) * Math.cos(ph) * 0.5, Math.cos(th) * 0.5 + yOff, Math.sin(th) * Math.sin(ph) * 0.5];
  for (let r = 0; r < rings; r++) {
    const t0 = (r / rings) * Math.PI, t1 = ((r + 1) / rings) * Math.PI, tm = (t0 + t1) / 2;
    for (let s = 0; s < seg; s++) {
      const p0 = (s / seg) * TAU, p1 = ((s + 1) / seg) * TAU, pm = (p0 + p1) / 2;
      const n = [Math.sin(tm) * Math.cos(pm), Math.cos(tm), Math.sin(tm) * Math.sin(pm)];
      quadInto(g, P(t0, p0), P(t0, p1), P(t1, p1), P(t1, p0), n);
    }
  }
  return g;
}
// Snake segment: a block (y 0..1) tiled with N x N mirror tiles on top and N per side, each tile
// tilted a little so the chain glitters as it moves.
function mirrorBlock(N = 3, jitter = 0.13) {
  const g = { pos: [], nrm: [], uv: [], idx: [] };
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * jitter;
  const q = (a, b, c, d, n) => quadInto(g, a, b, c, d, norm3([n[0] + rnd(), n[1] + rnd(), n[2] + rnd()]));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x0 = -0.5 + i / N, x1 = x0 + 1 / N, z0 = -0.5 + j / N, z1 = z0 + 1 / N;
      q([x0, 1, z1], [x1, 1, z1], [x1, 1, z0], [x0, 1, z0], [0, 1, 0]);
    }
    const a = -0.5 + i / N, b = a + 1 / N;
    q([a, 0, 0.5], [b, 0, 0.5], [b, 1, 0.5], [a, 1, 0.5], [0, 0, 1]);
    q([b, 0, -0.5], [a, 0, -0.5], [a, 1, -0.5], [b, 1, -0.5], [0, 0, -1]);
    q([0.5, 0, b], [0.5, 0, a], [0.5, 1, a], [0.5, 1, b], [1, 0, 0]);
    q([-0.5, 0, a], [-0.5, 0, b], [-0.5, 1, b], [-0.5, 1, a], [-1, 0, 0]);
  }
  return g;
}
// Five-point star standing in the XY plane, centred on the origin, 1 across, z -0.5..0.5.
function standingStar(prism) {
  const outline = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 0.2 : 0.5;
    outline.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const g = prism(outline);                       // y 0..1 is the thickness
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    g.pos[i] = x; g.pos[i + 1] = -z; g.pos[i + 2] = y - 0.5;
    const nx = g.nrm[i], ny = g.nrm[i + 1], nz = g.nrm[i + 2];
    g.nrm[i] = nx; g.nrm[i + 1] = -nz; g.nrm[i + 2] = ny;
  }
  return g;
}

function setRGB(arr, i, c, k = 1) {
  arr[i * 3] = c[0] * k;
  arr[i * 3 + 1] = c[1] * k;
  arr[i * 3 + 2] = c[2] * k;
}
function hueRotate(out, c, a) {
  const k = 0.57735, ca = Math.cos(a), sa = Math.sin(a);
  const dot = k * (c[0] + c[1] + c[2]) * (1 - ca);
  const cx = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])];
  out[0] = c[0] * ca + cx[0] * sa + k * dot;
  out[1] = c[1] * ca + cx[1] * sa + k * dot;
  out[2] = c[2] * ca + cx[2] * sa + k * dot;
  return out;
}
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const TILE_PALETTES = [
  [[1.0, 0.45, 0.08], [1.0, 0.15, 0.55], [0.55, 0.2, 1.0], [1.0, 0.8, 0.2]],
  [[1.0, 0.2, 0.6], [0.15, 0.85, 1.0], [1.0, 0.9, 0.2], [0.6, 0.25, 1.0]],
  [[1.0, 0.15, 0.1], [1.0, 0.5, 0.05], [1.0, 0.85, 0.25], [1.0, 0.9, 0.8]],
  [[0.2, 1.0, 0.4], [0.7, 1.0, 0.2], [0.1, 0.9, 0.8], [1.0, 0.3, 0.7]],
  [[0.5, 0.2, 1.0], [0.2, 0.4, 1.0], [1.0, 0.2, 0.9], [1.0, 0.6, 0.45]],
];
const BOARD_PALETTES = [
  { grid: [1.0, 0.55, 0.15], frame: [1.0, 0.75, 0.25] },
  { grid: [1.0, 0.3, 0.7], frame: [1.0, 0.45, 0.85] },
  { grid: [0.7, 0.4, 1.0], frame: [0.8, 0.55, 1.0] },
  { grid: [1.0, 0.85, 0.3], frame: [1.0, 0.95, 0.5] },
  { grid: [0.3, 0.9, 1.0], frame: [0.5, 1.0, 1.0] },
];
const RAINBOW = [[1, 0.08, 0.2], [1, 0.32, 0.04], [1, 0.62, 0.08], [1, 0.18, 0.5], [0.85, 0.12, 0.8], [0.5, 0.14, 1]];
const FOG = [0.85, 0.36, 0.2];
const mod = (a, n) => ((a % n) + n) % n;

export function create(kit) {
  const { material, cols, rows } = kit;
  kit.addGeometry('discoBall', facetSphere(44, 22, 0));
  kit.addGeometry('discoDot', facetSphere(14, 8, 0.5));
  kit.addGeometry('discoTiles', mirrorBlock(3, 0.13));
  kit.addGeometry('discoStar', standingStar(kit.geometry.prism));
  kit.addGeometry('discoBand', kit.geometry.torus(0.5, 0.032, 96, 8));

  const HX = cols / 2, HZ = rows / 2;
  const BALL = [0, 19, -HZ - 36];
  const BALL_R = 7.5;

  // ---- materials ----
  const M = {
    ball: material({ color: [0.92, 0.88, 1.0], chrome: 1, lines: 1, lineWidth: 0.07, lineColor: [-0.35, -0.3, -0.4], fog: 0.4 }),
    pillar: material({ color: [1.0, 0.6, 0.85], chrome: 0.85, lines: 1, lineWidth: 0.06, lineColor: [-0.3, -0.25, -0.35], uvScale: [22, 26] }),
    cap: material({ color: [0, 0, 0], emissive: [1, 0.7, 0.2] }),
    star: material({ color: [1.0, 0.75, 0.25], chrome: 0.55, emissive: [0.6, 0.32, 0.04], lines: 1, lineWidth: 0.05, lineColor: [1, 0.9, 0.5], rim: [1, 0.7, 0.3] }),
    starPink: material({ color: [1.0, 0.4, 0.8], chrome: 0.55, emissive: [0.55, 0.08, 0.4], lines: 1, lineWidth: 0.05, lineColor: [1, 0.75, 0.95], rim: [1, 0.5, 0.9] }),
    stage: material({ color: [0.08, 0.02, 0.08], chrome: 0.25, lines: 1, lineWidth: 0.04, lineColor: [1, 0.6, 0.2], uvScale: [10, 1] }),
  };
  const bands = RAINBOW.map((c) => material({ color: [0, 0, 0], emissive: c, rim: [0.4, 0.3, 0.4], fog: 0.5 }));

  const snakeBody = material({ color: [0.8, 0.74, 1.0], emissive: [0.3, 0.24, 0.52], chrome: 0.5,
    lines: 1, lineWidth: 0.07, lineColor: [-0.22, -0.22, -0.2], rim: [0.55, 0.45, 1.0] });
  const snakeHead = material({ color: [1, 0.96, 1], emissive: [0.72, 0.62, 0.95], chrome: 0.45,
    lines: 1, lineWidth: 0.05, lineColor: [1, 0.8, 0.3], rim: [0.7, 0.6, 1] });
  const snakeEye = material({ color: [0.03, 0.0, 0.05], emissive: [0, 0, 0] });
  const dot = material({ color: [1, 0.78, 0.3], emissive: [0.85, 0.5, 0.05], chrome: 0.4,
    lines: 1, lineWidth: 0.09, lineColor: [-0.3, -0.24, -0.08], rim: [1, 0.8, 0.4] });
  const BODY_EMIT = [0.3, 0.24, 0.52];

  // ---- layout: everything outside the board (|x| > HX + 0.5 or z < -HZ - 0.5) ----
  const pillars = [];
  for (const s of [-1, 1]) for (const z of [-10, -21, -33, -46]) pillars.push([s * (HX + 5 + (z < -25 ? 3 : 0)), z, 1.3]);
  const stars = [
    [-(HX + 3), 3.2, 1.5, 3.0, 0], [HX + 3, 3.4, -2.5, 3.2, 1],
    [-(HX + 7), 9, -13, 7, 1], [HX + 8, 10, -17, 8, 0],
    [-(HX + 15), 15, -36, 11, 0], [HX + 16, 14, -32, 10, 1],
    [-11, 26, -HZ - 50, 6, 1], [12, 27, -HZ - 52, 6, 0],
  ];
  // rainbow arch sets: [x, z, inner radius, step, facing x?]
  const arches = [
    [0, -HZ - 20, 7, 0.6, false],
    [0, -HZ - 56, 20, 1.3, false],
    [-(HX + 11), -6, 4, 0.45, true],
    [HX + 11, -6, 4, 0.45, true],
  ];
  // glitter points: sides and back only
  const glitter = [];
  for (let i = 0; i < 160; i++) {
    const side = hash(i * 3.1) < 0.6;
    const x = side ? (hash(i * 5.7) < 0.5 ? -1 : 1) * (HX + 2.5 + hash(i * 7.3) * 30) : (hash(i * 9.1) - 0.5) * 80;
    const z = side ? 12 - hash(i * 11.3) * 70 : -HZ - 3 - hash(i * 13.7) * 60;
    glitter.push([x, 0.6 + hash(i * 17.9) * 24, z, 2 + hash(i * 19.3) * 7, hash(i * 23.1) * TAU]);
  }

  const pal = new Float32Array(24);
  const room = new Float32Array(16);
  const tmp = [0, 0, 0];
  const F = {
    pal, room,
    board: { panel: [0.05, 0.012, 0.06], grid: [0, 0, 0], frame: [0, 0, 0], lineWidth: 0.028, band: 0.3, gridGlow: 0.55, frameGlow: 1.0 },
    snake: {
      body: snakeBody, head: snakeHead, eye: snakeEye, dot,
      bodyGeom: 'discoTiles', dotGeom: 'discoDot',
      bodySize: [0.8, 0.26, 0.8], headSize: [0.9, 0.3, 0.9], dotSize: [0.46, 0.34, 0.46],
      pool: [0.7, 0.4, 1.0], dotPool: [1, 0.7, 0.2], poolIntensity: 0.3,
      segment: null,
    },
    ring: [1, 0.85, 0.5], wall: [1, 0.6, 0.2], beacon: [1, 0.85, 0.4], fog: [0.85, 0.36, 0.2],
  };
  for (const gp of glitter) if (Math.abs(gp[0]) > HX) gp[3] = Math.min(gp[3], 2 * (Math.abs(gp[0]) - HX - 0.8));

  let alive = true, chaos = 0, time = 0, beat = 0, flashOK = true, lastT = null, spin = 0, step = 0, palIdx = 0;
  // Mirror-tile sparkle: random tiles flash white, a beat wave runs down the chain, and with chaos the
  // chain cycles through the floor palette.
  F.snake.segment = (i, n, mat) => {
    const t = i / Math.max(1, n - 1);
    if (!alive) { mat.emissive[0] = 0.09; mat.emissive[1] = 0.08; mat.emissive[2] = 0.11; return; }
    const k = 1 - 0.3 * t;
    let c = BODY_EMIT;
    if (chaos > 0.4) {
      const P = TILE_PALETTES[palIdx];
      const a = P[mod(i + step, 4)];
      tmp[0] = BODY_EMIT[0] * 0.5 + a[0] * 0.35; tmp[1] = BODY_EMIT[1] * 0.5 + a[1] * 0.35; tmp[2] = BODY_EMIT[2] * 0.5 + a[2] * 0.35 + 0.12;
      c = tmp;
    }
    const wave = 1 + beat * 0.8 * Math.max(0, Math.sin(i * 0.9 - time * 7));
    const tw = hash(i * 7.31 + Math.floor(time * 9)) > 0.84 ? (flashOK ? 0.65 : 0.15) : 0;
    mat.emissive[0] = c[0] * k * wave + tw;
    mat.emissive[1] = c[1] * k * wave + tw;
    mat.emissive[2] = c[2] * k * wave + tw;
  };

  function frame(fx, snap) {
    alive = snap.alive !== false;
    chaos = fx.chaos; time = fx.time; beat = fx.beat; flashOK = !fx.reducedFlash;
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, fx.time - lastT));
    lastT = fx.time;
    spin = (spin + dt * (0.22 + fx.chaos * 0.9)) % (TAU * 100);
    const v = fx.variant;
    step = fx.reducedFlash ? Math.floor(fx.beatIndex / 4) : fx.beatIndex;
    palIdx = mod(v + (fx.chaos > 0.55 && !fx.reducedFlash ? Math.floor(step / 2) : 0), TILE_PALETTES.length);
    const P = TILE_PALETTES[palIdx];
    const bp = BOARD_PALETTES[mod(v, BOARD_PALETTES.length)];
    for (let i = 0; i < 3; i++) { F.board.grid[i] = bp.grid[i] * 0.55; F.board.frame[i] = bp.frame[i]; }
    F.wall = bp.frame;

    setRGB(pal, 0, [0.45, 0.26, 0.55]);
    setRGB(pal, 1, [0.5, 0.22, 0.14]);
    setRGB(pal, 2, [0.1, 0.015, 0.2]);
    setRGB(pal, 3, [0.42, 0.05, 0.4]);
    setRGB(pal, 4, [1.0, 0.42, 0.12]);
    // tile colours; a bite punch swaps them around for a moment
    const sw = fx.punch > 0.3 ? 2 : 0;
    setRGB(pal, 5, P[(0 + sw) % 4]);
    setRGB(pal, 6, P[(1 + sw) % 4]);
    setRGB(pal, 7, P[(2 + sw) % 4]);
    const D = P[(3 + sw) % 4];
    room[0] = D[0]; room[1] = D[1]; room[2] = D[2]; room[3] = spin;
    room[4] = 0.16 + 0.45 * fx.chaos;                                             // lit fraction
    room[5] = mod(v + (fx.chaos > 0.7 ? Math.floor(step / 8) : 0), 4);           // floor pattern
    room[6] = fx.punch * 0.8;                                                    // punch flash
    room[7] = step;
    room[8] = 0.25 + 0.45 * fx.chaos + 0.55 * fx.beat;                            // rays
    room[9] = 0.6 + 1.2 * fx.chaos;                                              // glitter
    room[10] = 0.55 + 0.7 * fx.chaos + 0.3 * fx.beat;                            // light spots
    room[11] = 0.5 + 0.65 * fx.beat;                                              // tile brightness
    room[12] = BALL[0]; room[13] = BALL[1]; room[14] = BALL[2];
    const hue = fx.chaos > 0.6 ? ((v * 0.9) % TAU) * Math.min(1, (fx.chaos - 0.6) * 2.5) : 0;
    room[15] = hue + (fx.chaos > 0.85 && !fx.reducedFlash ? (fx.beatIndex % 2) * 0.4 : 0);
    hueRotate(F.fog, FOG, room[15]);

    // rainbow bands step round on the beat once things heat up
    const shift = fx.chaos > 0.3 ? step : 0;
    const pulse = 0.6 + 0.55 * fx.beat + 0.5 * fx.punch;
    for (let i = 0; i < bands.length; i++) {
      const c = RAINBOW[mod(i + shift, RAINBOW.length)];
      bands[i].emissive[0] = c[0] * pulse; bands[i].emissive[1] = c[1] * pulse; bands[i].emissive[2] = c[2] * pulse;
    }
    M.cap.emissive.set(P[1]);
    const sp = 1 + fx.beat * 1.2 + fx.punch;
    M.star.emissive[0] = 0.6 * sp; M.star.emissive[1] = 0.32 * sp; M.star.emissive[2] = 0.04 * sp;
    M.starPink.emissive[0] = 0.55 * sp; M.starPink.emissive[1] = 0.08 * sp; M.starPink.emissive[2] = 0.4 * sp;
    M.stage.lineColor.set(P[0]);

    snakeHead.emissive.set(alive ? [0.72, 0.62, 0.95] : [0.25, 0.24, 0.28]);
    snakeHead.lineColor.set(alive ? [1, 0.8, 0.3] : [0.4, 0.4, 0.42]);
    snakeBody.chrome = alive ? 0.5 : 0.15;
    dot.emissive.set([0.85 + 0.15 * fx.beat, 0.5 + 0.2 * fx.beat, 0.05]);
    return F;
  }

  function props(d) {
    const fx = d.fx, t = fx.time, still = fx.reducedMotion;
    // the giant mirror ball, spinning with the light spots it throws
    const S = BALL_R * 2;
    d.mesh('discoBall', d.euler(BALL[0], BALL[1], BALL[2], 0.22, spin, 0, S, S, S), M.ball);
    // mirror pillars with glowing caps
    for (const [x, z, r] of pillars) {
      d.mesh('cylinder', d.trs(x, 0, z, spin * 0.5, r * 2, 18, r * 2), M.pillar);
      d.mesh('cylinder', d.trs(x, 18, z, 0, r * 2.4, 0.5, r * 2.4), M.cap);
      d.mesh('cylinder', d.trs(x, 0, z, 0, r * 2.6, 0.5, r * 2.6), M.cap);
    }
    // rainbow arches (outer band first in RAINBOW order)
    const bp = still ? 1 : 1 + 0.025 * fx.beat;
    for (const [x, z, r0, st, side] of arches) {
      for (let i = 0; i < bands.length; i++) {
        const k = (r0 + (bands.length - 1 - i) * st) * 2 * bp;
        d.mesh('discoBand', d.euler(x, 0, z, Math.PI / 2, side ? Math.PI / 2 : 0, 0, k, k, k), bands[i]);
      }
    }
    // glitter stars
    for (const [x, y, z, s, pink] of stars) {
      const ry = still ? 0.35 : t * 0.7 + x;
      const k = s * (1 + 0.12 * fx.beat + 0.1 * fx.punch);
      const yy = y + (still ? 0 : Math.sin(t * 1.3 + x) * 0.35);
      d.mesh('discoStar', d.trs(x, yy, z, ry, k, k, k * 0.14), pink ? M.starPink : M.star);
    }
    // stage and speaker stacks behind the far edge
    d.mesh('box', d.trs(0, 0, -HZ - 4, 0, cols + 10, 0.5, 5), M.stage);
    for (const s of [-1, 1]) d.mesh('box', d.trs(s * (HX + 4), 0, -HZ - 4, 0, 3, 6 + 0.4 * fx.beat, 3), M.stage);
  }

  const BM = new Float32Array(16);
  const WARM = [1, 0.88, 0.68], HALO = [1, 0.55, 0.25];
  // Light beam from a floor point (outside the board) up to the mirror ball, facing the camera.
  function beam(d, bx, bz, col, k) {
    const tx = BALL[0] - bx, ty = BALL[1], tz = BALL[2] - bz;
    const e = d.eye, ax = e[0] - bx, ay = e[1], az = e[2] - bz;
    let cx = ty * az - tz * ay, cy = tz * ax - tx * az, cz = tx * ay - ty * ax;
    const l = (Math.hypot(cx, cy, cz) || 1) / 1.5;
    cx /= l; cy /= l; cz /= l;
    BM[0] = cx; BM[1] = cy; BM[2] = cz; BM[3] = 0;
    BM[4] = tx; BM[5] = ty; BM[6] = tz; BM[7] = 0;
    BM[8] = 0; BM[9] = 0; BM[10] = 0; BM[11] = 0;
    BM[12] = bx; BM[13] = 0.02; BM[14] = bz; BM[15] = 1;
    d.glow('plane', BM, col, 3, k);
    d.floorGlow(bx, bz, 3.2, col, k * 1.4);
  }

  function glows(d) {
    const fx = d.fx, t = fx.time;
    const P = TILE_PALETTES[palIdx];
    d.billboard(BALL[0], BALL[1] - BALL_R * 2.2, BALL[2] - 2, BALL_R * 4.4, BALL_R * 4.4, HALO, 0, 0.3 + 0.5 * fx.beat + 0.4 * fx.punch);
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1;
      const ph = t * (0.35 + 0.08 * i) + i * 1.7;
      beam(d, s * (HX + 9 + 2 * Math.sin(ph * 1.3)), -12 + 16 * Math.sin(ph), P[(i + step) % 4], 0.3 + 0.45 * fx.beat + 0.3 * fx.chaos);
    }
    for (let i = 0; i < 4; i++) {
      const s = i < 2 ? -1 : 1;
      const ph = t * 0.5 + i * 2.1;
      d.floorGlow(s * (HX + 7 + 2.5 * Math.sin(ph * 1.7)), -6 + 12 * Math.sin(ph), 7, P[(i + step) % 4], 0.35 + 0.5 * fx.beat);
    }
    const nG = Math.min(glitter.length, Math.floor(50 + 110 * fx.chaos));
    const gk = (0.7 + fx.beat) * (fx.reducedFlash ? 0.4 : 1);
    for (let i = 0; i < nG; i++) {
      const [x, y, z, s, ph] = glitter[i];
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * (2.5 + (i % 7)) + ph), 10);
      if (tw < 0.04) continue;
      const c = i % 3 === 0 ? P[i % 4] : WARM;
      d.billboard(x, y - s * 0.03, z, s, s * 0.06, c, 0, tw * gk);
      d.billboard(x, y - s * 0.5, z, s * 0.06, s, c, 0, tw * gk);
    }
    // glint on the tiny mirror ball (stays inside its own cell)
    if (d.snap && d.snap.food) {
      const [x, z] = d.cellToWorld(d.snap.food.x, d.snap.food.y);
      const tw = 0.6 + 0.4 * Math.sin(t * 7);
      d.billboard(x, 0.15, z, 0.8, 0.04, WARM, 0, 0.9 * tw);
      d.billboard(x, -0.1, z, 0.04, 0.55, WARM, 0, 0.9 * tw);
    }
  }

  return { frame, props, glows };
}
