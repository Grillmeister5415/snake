// ABYSSAL CATHEDRAL, −4000 M (abyss stream). A drowned gothic nave four kilometres down: clustered
// piers with gold filigree, pointed arcades, clerestory and aisle windows in stained glass, a far
// facade with a rose window, coral and organ-pipe tubes at the pier bases, a giant ammonite, a manta
// gliding overhead, jellyfish rising through the nave, light shafts and caustics from the surface.
// Own style at fx.chaos 0 (dark stained glass, gold, amber light) → bioluminescent neon coral at 1.
// CALM universe: no flashes, no strobe, no sudden brightness of its own; fx.beat is used at most at
// 15 %, fx.punch is replaced by a slow swell rebuilt from biteAge. Snake = gold-edged scallop shells
// with a pointed shell head; dot = a pearl. Interface: see the top of rooms/court.js.
//
// Uniform use:
//   uPal  0 ambient sky, 1 ambient ground, 2 surface light, 3 mid water, 4 deep horizon, 5 shaft light,
//         6 floor glass A, 7 neon line A
//   uRoom 0 rgb floor glass B, w caustic strength
//         1 rgb far glow down the nave, w swell
//         2 x chaos, y gentle beat, z unused, w ray strength
//         3 rgb neon line B, w lead glow (0 own .. 1 neon)

export const meta = {
  id: 'abyss',
  name: 'ABYSSAL CATHEDRAL',
  year: '−4000 M',
  luma: 0.14,
  veil: '#06182a',
  weight: 2,
  calm: true,
  hud: { fg: '#f4e3b5', bg: 'rgba(3,12,22,0.78)', accent: '#e7b450', panelFg: '#f4e3b5', panelBg: 'rgba(4,16,30,0.92)' },
};

export const glsl = {
  sky: /* glsl */ `
float abCaustic(vec2 p, float t) {
  vec2 q = p + vec2(sin(p.y * 1.3 + t * 0.3), cos(p.x * 1.1 - t * 0.25)) * 0.6;
  float c = abs(sin(q.x * 2.1 + t * 0.2) + sin(q.y * 2.3 - t * 0.17) + sin((q.x + q.y) * 1.4 + t * 0.13));
  return pow(clamp(1.0 - c * 0.45, 0.0, 1.0), 4.0);
}
vec3 abWater(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 col = mix(uPal[4], uPal[3], smoothstep(0.0, 0.3, y));
  col = mix(col, uPal[2], smoothstep(0.3, 1.0, y));
  vec2 sp = d.xz / (y + 0.15) * 1.4;
  col += uPal[5] * abCaustic(sp, uTime) * uRoom[0].w * smoothstep(0.3, 0.9, y);
  float az = atan(d.x, d.z);
  float rays = pow(0.5 + 0.5 * sin(az * 11.0 + sin(az * 3.0 + uTime * 0.05) * 2.0), 6.0)
             + pow(0.5 + 0.5 * sin(az * 7.0 - 1.3 + uTime * 0.03), 10.0);
  col += uPal[5] * rays * uRoom[2].w * smoothstep(0.12, 0.7, y) * 0.3;
  float a = max(dot(d, normalize(vec3(0.0, 0.12, -1.0))), 0.0);
  col += uRoom[1].rgb * (pow(a, 24.0) * 0.7 + pow(a, 4.0) * 0.12) * (1.0 + 0.4 * uRoom[1].w);
  // drifting motes, slow twinkle; bioluminescent with chaos
  vec2 mp = vec2(az * 38.0, y * 46.0 + uTime * 0.05);
  vec2 cell = floor(mp);
  float h = hash12(cell);
  if (h > 0.9) {
    vec2 f = fract(mp) - 0.5 - (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.5;
    float s = exp(-dot(f, f) * 60.0) * (0.55 + 0.45 * sin(uTime * (0.3 + h) + h * 40.0));
    col += mix(uPal[5] * 0.35, uPal[7], uRoom[2].x) * s * (h - 0.9) * 8.0;
  }
  return col;
}
vec3 roomSky(vec3 d) {
  if (d.y < 0.0) {
    vec3 m = abWater(vec3(d.x, -d.y, d.z));
    return mix(uPal[6] * 0.6, m * 0.55, 0.35 + 0.4 * exp(d.y * 4.0));
  }
  return abWater(d);
}
`,
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  vec2 q = p * 0.42;
  vec2 i = floor(q), f = fract(q);
  float d1 = 8.0, d2 = 8.0;
  vec2 id = vec2(0.0);
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec2 g = vec2(float(xx), float(yy));
      vec2 o = g + 0.15 + 0.7 * vec2(hash12(i + g), hash12(i + g + 17.3)) - f;
      float dd = dot(o, o);
      if (dd < d1) { d2 = d1; d1 = dd; id = i + g; } else if (dd < d2) { d2 = dd; }
    }
  }
  float e = sqrt(d2) - sqrt(d1);
  float far = clamp(dist / 70.0, 0.0, 1.0);
  float lead = (1.0 - smoothstep(0.04, 0.06 + dist * 0.004, e)) * (1.0 - far * 0.8);
  float h = hash12(id);
  vec3 glass = mix(uPal[6], uRoom[0].rgb, h) * (0.6 + 0.5 * hash12(id + 3.1));
  vec3 col = glass * (1.0 - lead * 0.85);
  vec3 neon = mix(uPal[7], uRoom[3].rgb, step(0.5, hash12(id + 7.7)));
  col += neon * lead * uRoom[3].w * (0.65 + 0.35 * sin(uTime * 0.4 + h * 6.0));
  col += uPal[5] * abCaustic(p * 0.35, uTime * 0.8) * uRoom[0].w * 0.3 * (1.0 - far);
  col += neon * pow(hash12(floor(p * 3.0)), 40.0) * uRoom[2].x * 0.7;
  gloss = 0.6 - lead * 0.4;
  return col;
}
`,
};

const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const mod = (a, n) => ((a % n) + n) % n;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const lerp3 = (out, a, b, k) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };
const setRGB = (arr, i, c) => { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; };
// slow swell after a bite instead of fx.punch: peak ~0.6 s, gone by 2.4 s, continuous at both ends
function swellOf(fx) {
  const u = num(fx.biteAge, Infinity) / 2400;
  return fx.bite && u < 1 ? Math.sin(Math.PI * Math.sqrt(Math.max(0, u))) * (fx.reducedFlash ? 0.4 : 1) : 0;
}

// ─────────────── geometry helpers (plain { pos, nrm, uv, idx } like geometry.js) ───────────────
const G = () => ({ pos: [], nrm: [], uv: [], idx: [] });
function vert(g, p, n, uv) { g.pos.push(p[0], p[1], p[2]); g.nrm.push(n[0], n[1], n[2]); g.uv.push(uv[0], uv[1]); return g.pos.length / 3 - 1; }
// Smooth normals from the triangles; flipped as a whole so that they agree with `out(p)`.
function computeNormals(g, out) {
  const n = new Float64Array(g.pos.length), P = g.pos;
  for (let i = 0; i < g.idx.length; i += 3) {
    const a = g.idx[i] * 3, b = g.idx[i + 1] * 3, c = g.idx[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  let agree = 0;
  for (let i = 0; i < n.length; i += 3) {
    const o = out([P[i], P[i + 1], P[i + 2]]);
    agree += n[i] * o[0] + n[i + 1] * o[1] + n[i + 2] * o[2];
  }
  const s = agree < 0 ? -1 : 1;
  g.nrm = [];
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; g.nrm.push((s * n[i]) / l, (s * n[i + 1]) / l, (s * n[i + 2]) / l); }
  return g;
}
// Append `g` transformed by the column-major 4×4 `M` (from kit.m4) to `out`.
function addXf(out, g, M) {
  const base = out.pos.length / 3;
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    out.pos.push(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]);
    const a = g.nrm[i], b = g.nrm[i + 1], c = g.nrm[i + 2];
    const nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    out.nrm.push(nx / l, ny / l, nz / l);
  }
  for (let i = 0; i < g.uv.length; i++) out.uv.push(g.uv[i]);
  for (let i = 0; i < g.idx.length; i++) out.idx.push(g.idx[i] + base);
}
function grid(g, R, S, fn) {   // (R+1) × (S+1) vertex grid from fn(r, s) -> [pos, uv]
  const b = g.pos.length / 3;
  for (let r = 0; r <= R; r++) for (let s = 0; s <= S; s++) { const [p, uv] = fn(r / R, s / S); vert(g, p, [0, 1, 0], uv); }
  for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) { const a = b + r * (S + 1) + s, c = a + S + 1; g.idx.push(a, c, a + 1, a + 1, c, c + 1); }
}

// Scallop rosette: a ribbed dome with a scalloped rim (base y 0, height 1, radius 0.5). The body is
// drawn without rotation, so the shell is radially symmetric.
function shellGeo() {
  const g = G(), N = 10;
  grid(g, 7, 60, (t, s) => {
    const a = s * TAU, rib = 0.5 + 0.5 * Math.cos(a * N);
    const r = t * 0.5 * (0.9 + 0.1 * rib), y = Math.pow(Math.max(0, 1 - t * t), 0.55) * (0.86 + 0.14 * rib * t);
    return [[Math.cos(a) * r, y, Math.sin(a) * r], [s, t]];
  });
  return computeNormals(g, (p) => [p[0], p[1] + 0.2, p[2]]);
}
// Head: a smooth shell dome drawn out into a pointed lancet nose toward local −Z, with a raised spine.
function headGeo() {
  const g = G();
  grid(g, 8, 64, (t, s) => {
    const a = s * TAU, fwd = -Math.sin(a), side = Math.cos(a);
    const tip = Math.pow(Math.max(0, fwd), 3);
    const r = t * (0.44 + 0.2 * tip);
    const y = Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 0.5) * (0.92 + 0.08 * Math.exp(-side * side * 30) * t);
    return [[side * r, y, -fwd * r + 0.06], [s, t]];
  });
  return computeNormals(g, (p) => [p[0], p[1] + 0.2, p[2]]);
}
// Pointed (gothic) arch rib from x = −span/2 to +span/2, springing at y 0: two arcs of radius R.
// Front/back faces carry uv (path, across) so material lines draw gold edges and voussoir joints.
function archGeo(span, R, thick, depth, segs = 16) {
  const g = G(), c = R - span / 2, th1 = Math.acos(-c / R), S = [];
  for (let i = 0; i <= segs; i++) { const th = Math.PI + (th1 - Math.PI) * (i / segs); S.push([c + R * Math.cos(th), R * Math.sin(th), Math.cos(th), Math.sin(th)]); }
  for (let i = segs; i >= 0; i--) { const th = Math.PI + (th1 - Math.PI) * (i / segs); S.push([-(c + R * Math.cos(th)), R * Math.sin(th), -Math.cos(th), Math.sin(th)]); }
  const n = S.length, h = thick / 2, dz = depth / 2;
  const strip = (pa, pb, na, nb, va, vb) => {
    const b = g.pos.length / 3;
    for (let i = 0; i < n; i++) { const u = i / (n - 1); vert(g, pa(S[i]), na(S[i]), [u, va]); vert(g, pb(S[i]), nb(S[i]), [u, vb]); }
    for (let i = 0; i < n - 1; i++) { const a = b + i * 2; g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  const inn = (s, z) => [s[0] - s[2] * h, s[1] - s[3] * h, z], out = (s, z) => [s[0] + s[2] * h, s[1] + s[3] * h, z];
  strip((s) => inn(s, dz), (s) => out(s, dz), () => [0, 0, 1], () => [0, 0, 1], 0, 1);
  strip((s) => inn(s, -dz), (s) => out(s, -dz), () => [0, 0, -1], () => [0, 0, -1], 0, 1);
  strip((s) => out(s, dz), (s) => out(s, -dz), (s) => [s[2], s[3], 0], (s) => [s[2], s[3], 0], 0, 1);
  strip((s) => inn(s, dz), (s) => inn(s, -dz), (s) => [-s[2], -s[3], 0], (s) => [-s[2], -s[3], 0], 0, 1);
  return g;
}
// Logarithmic-spiral tube standing upright in the XY plane: a giant ammonite, height ~1.
function ammoniteGeo() {
  const g = G(), N = 140, M = 14, b = 0.17, th0 = 0, th1 = 4.2 * Math.PI;
  let minY = Infinity, maxY = -Infinity;
  const raw = [];
  for (let i = 0; i <= N; i++) {
    const th = th0 + (th1 - th0) * (i / N), r = Math.exp(b * th), rho = 0.46 * r;
    const cx = Math.cos(th) * r, cy = Math.sin(th) * r, n1 = [Math.cos(th), Math.sin(th), 0];
    for (let j = 0; j <= M; j++) {
      const ph = (j / M) * TAU, nn = [n1[0] * Math.cos(ph), n1[1] * Math.cos(ph), Math.sin(ph)];
      const p = [cx + nn[0] * rho, cy + nn[1] * rho, nn[2] * rho * 0.8];
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      raw.push([p, nn, [i / N, j / M]]);
    }
  }
  const s = 1 / (maxY - minY);
  for (const [p, nn, uv] of raw) vert(g, [p[0] * s, (p[1] - minY) * s, p[2] * s], nn, uv);
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, c = a + M + 1; g.idx.push(a, c, a + 1, a + 1, c, c + 1); }
  return g;
}
// Jellyfish bell: a dome (base ring y 0, apex y 1, radius 0.5) whose hem dips in eight scallops.
function bellGeo() {
  const g = G();
  grid(g, 8, 48, (t, s) => {
    const a = s * TAU, r = 0.5 * Math.sin(t * Math.PI / 2), hem = (1 - t) < 0.15 ? 0 : 0;
    const y = Math.cos(t * Math.PI / 2) - (t > 0.85 ? 0.12 * (0.5 + 0.5 * Math.cos(a * 8)) * (t - 0.85) / 0.15 : 0) + hem;
    return [[Math.cos(a) * r, y, Math.sin(a) * r], [s, t]];
  });
  return computeNormals(g, (p) => [p[0], p[1] - 0.2, p[2]]);
}
// Manta: a flat diamond of wings with a low ridge, nose toward −Z.
function mantaGeo() {
  const g = G();
  const V = { n: [0, 0, -0.62], l: [-1.25, 0.06, 0.22], r: [1.25, 0.06, 0.22], t: [0, 0, 0.55], top: [0, 0.15, -0.08], bot: [0, -0.07, -0.02], hl: [-0.22, 0, -0.66], hr: [0.22, 0, -0.66] };
  const T = [['n', 'l', 'top'], ['l', 't', 'top'], ['t', 'r', 'top'], ['r', 'n', 'top'], ['n', 'l', 'bot'], ['l', 't', 'bot'], ['t', 'r', 'bot'], ['r', 'n', 'bot'], ['n', 'hl', 'l'], ['n', 'hr', 'r']];
  for (const [a, b, c] of T) {
    const A = V[a], B = V[b], C = V[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn) || 1; nn = nn.map((q) => q / l);
    if ((c === 'top' && nn[1] < 0) || (c === 'bot' && nn[1] > 0)) nn = nn.map((q) => -q);
    const i0 = vert(g, A, nn, [0, 0]); vert(g, B, nn, [1, 0]); vert(g, C, nn, [0, 1]);
    g.idx.push(i0, i0 + 1, i0 + 2);
  }
  return g;
}

// ─────────────── stained-glass sheets (Canvas 2D, built lazily per chaos level) ───────────────
const OWN = {
  stone: [10, 20, 26], lead: [4, 8, 12], gold: [214, 160, 60], glow: [255, 170, 70],
  pane: [[242, 169, 59], [255, 210, 122], [228, 138, 42], [45, 111, 179], [27, 79, 143], [60, 143, 154], [36, 60, 120], [22, 46, 92]],
};
const NEON = {
  stone: [8, 14, 34], lead: [3, 4, 10], gold: [41, 243, 255], glow: [255, 63, 210],
  pane: [[255, 63, 210], [0, 229, 255], [155, 92, 255], [61, 255, 158], [255, 122, 61], [46, 168, 255], [120, 40, 200], [30, 30, 120]],
};
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function palAt(k) {
  const L = (a, b) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
  return { stone: L(OWN.stone, NEON.stone), lead: L(OWN.lead, NEON.lead), gold: L(OWN.gold, NEON.gold), glow: L(OWN.glow, NEON.glow), pane: OWN.pane.map((c, i) => L(c, NEON.pane[i])) };
}
function lancetPath(g, cx, y0, y1, w) {
  const h = w * 0.866;
  g.moveTo(cx - w / 2, y1); g.lineTo(cx - w / 2, y0 + h);
  g.arc(cx + w / 2, y0 + h, w, Math.PI, Math.PI + Math.PI / 3);
  g.arc(cx - w / 2, y0 + h, w, -Math.PI / 3, 0);
  g.lineTo(cx + w / 2, y1); g.closePath();
}
function panes(g, x0, y0, w, h, s, P, seed) {
  const nx = Math.ceil(w / s) + 1, ny = Math.ceil(h / s) + 1, V = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) V.push([x0 + i * s + (hash(seed + i * 7.3 + j * 13.1) - 0.5) * s * 0.6, y0 + j * s + (hash(seed * 1.7 + i * 3.7 + j * 5.9) - 0.5) * s * 0.6]);
  const at = (i, j) => V[j * (nx + 1) + i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1), flip = hash(seed + i * 1.7 + j * 9.1) < 0.5;
    for (const [t, q] of [[flip ? [a, b, c] : [a, b, d], 0], [flip ? [a, c, d] : [b, c, d], 1]]) {
      g.beginPath(); g.moveTo(t[0][0], t[0][1]); g.lineTo(t[1][0], t[1][1]); g.lineTo(t[2][0], t[2][1]); g.closePath();
      g.fillStyle = css(P.pane[Math.floor(hash(seed * 3 + i * 4.1 + j * 2.3 + q * 0.7) * 97) % P.pane.length]); g.fill();
      g.strokeStyle = css(P.lead); g.lineWidth = Math.max(1.5, s * 0.09); g.stroke();
    }
  }
}
function newCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function lancetSheet(P, seed) {
  const c = newCanvas(128, 256);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = css(P.stone); g.fillRect(0, 0, 128, 256);
  g.save(); g.beginPath(); lancetPath(g, 64, 8, 250, 104); g.clip();
  panes(g, 12, 8, 104, 242, 13, P, seed);
  g.restore();
  g.beginPath();
  lancetPath(g, 39, 76, 250, 44); lancetPath(g, 89, 76, 250, 44);
  g.moveTo(84, 58); g.arc(64, 58, 20, 0, TAU);
  g.strokeStyle = css(P.lead); g.lineWidth = 5; g.stroke();
  g.strokeStyle = css(P.gold, 0.8); g.lineWidth = 1.5; g.stroke();
  g.beginPath(); lancetPath(g, 64, 8, 250, 104);
  g.strokeStyle = css(P.stone); g.lineWidth = 9; g.stroke();
  g.strokeStyle = css(P.gold); g.lineWidth = 2.5; g.stroke();
  return c;
}
function facadeSheet(P) {
  const c = newCanvas(512, 512);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = css(P.stone); g.fillRect(0, 0, 512, 512);
  g.strokeStyle = css(P.lead); g.lineWidth = 2;
  for (let y = 0; y < 512; y += 22) for (let x = (y / 22) % 2 ? 0 : 20; x < 512; x += 40) g.strokeRect(x, y, 40, 22);
  // gable outline
  g.beginPath(); lancetPath(g, 256, 18, 512, 470);
  g.strokeStyle = css(P.gold, 0.6); g.lineWidth = 4; g.stroke();
  // rose window
  const cx = 256, cy = 236, R = 132;
  const gl = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.35);
  gl.addColorStop(0, css(P.glow, 0.35)); gl.addColorStop(1, css(P.glow, 0));
  g.fillStyle = gl; g.fillRect(0, 0, 512, 512);
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  panes(g, cx - R, cy - R, 2 * R, 2 * R, 16, P, 91);
  g.restore();
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, px = cx + Math.cos(a) * R * 0.68, py = cy + Math.sin(a) * R * 0.68;
    g.moveTo(px + R * 0.2, py); g.arc(px, py, R * 0.2, 0, TAU);
    g.moveTo(cx + Math.cos(a) * R * 0.28, cy + Math.sin(a) * R * 0.28); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  g.moveTo(cx + R * 0.28, cy); g.arc(cx, cy, R * 0.28, 0, TAU);
  g.strokeStyle = css(P.lead); g.lineWidth = 6; g.stroke();
  g.strokeStyle = css(P.gold, 0.85); g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.strokeStyle = css(P.stone); g.lineWidth = 14; g.stroke();
  g.strokeStyle = css(P.gold); g.lineWidth = 4; g.stroke();
  g.fillStyle = css(P.gold); g.beginPath(); g.arc(cx, cy, 12, 0, TAU); g.fill();
  // lancets and the portal below
  for (const [x, w, y0] of [[96, 64, 300], [416, 64, 300], [256, 110, 384]]) {
    g.save(); g.beginPath(); lancetPath(g, x, y0, 512, w); g.clip();
    if (x === 256) {
      const pg = g.createLinearGradient(0, y0, 0, 512);
      pg.addColorStop(0, css(P.glow, 0.9)); pg.addColorStop(1, css(P.glow, 0.25));
      g.fillStyle = pg; g.fillRect(x - w, y0, 2 * w, 512 - y0);
    } else panes(g, x - w / 2, y0, w, 512 - y0, 12, P, x);
    g.restore();
    g.beginPath(); lancetPath(g, x, y0, 512, w);
    g.strokeStyle = css(P.stone); g.lineWidth = 8; g.stroke();
    g.strokeStyle = css(P.gold); g.lineWidth = 2.5; g.stroke();
  }
  return c;
}

// ─────────────── room ───────────────
const C = {
  stone: [[0.16, 0.25, 0.29], [0.1, 0.13, 0.26]], line: [[0.42, 0.3, 0.08], [0.06, 0.75, 0.95]],
  gold: [[0.26, 0.17, 0.04], [0.05, 0.55, 0.7]],
  coral: [[[0.34, 0.1, 0.04], [1.0, 0.12, 0.72]], [[0.36, 0.17, 0.04], [1.0, 0.42, 0.08]], [[0.05, 0.2, 0.16], [0.08, 1.0, 0.8]]],
  polyp: [[0.9, 0.55, 0.22], [1.0, 0.3, 0.9]],
  body: [[0.07, 0.26, 0.55], [0.04, 0.7, 0.95]], bodyRim: [[0.75, 0.55, 0.18], [0.95, 0.2, 0.8]],
  head: [[0.28, 0.62, 0.72], [0.3, 1.0, 0.85]], headRim: [[0.9, 0.66, 0.22], [1.0, 0.35, 0.9]],
  panel: [[0.02, 0.075, 0.1], [0.03, 0.04, 0.13]], grid: [[0.3, 0.22, 0.07], [0.05, 0.5, 0.7]],
  frame: [[0.95, 0.68, 0.25], [0.25, 0.95, 1.0]],
  pool: [[0.15, 0.45, 0.8], [0.1, 0.8, 1.0]], fog: [[0.04, 0.13, 0.17], [0.05, 0.12, 0.3]],
  wall: [[0.04, 0.16, 0.18], [0.06, 0.3, 0.36]],
  bell: [[0.3, 0.45, 0.7], [0.15, 0.85, 1.0]], core: [[1.0, 0.72, 0.38], [1.0, 0.22, 0.85]],
  shaft: [[0.42, 0.66, 0.6], [0.2, 0.85, 0.95]], haze: [[0.09, 0.27, 0.3], [0.08, 0.2, 0.45]],
  pal: [
    [[0.16, 0.3, 0.36], [0.12, 0.3, 0.5]], [[0.03, 0.06, 0.08], [0.05, 0.04, 0.12]],
    [[0.14, 0.38, 0.42], [0.05, 0.55, 0.7]], [[0.05, 0.17, 0.22], [0.03, 0.2, 0.38]],
    [[0.025, 0.08, 0.11], [0.03, 0.06, 0.2]], [[0.55, 0.75, 0.65], [0.3, 1.0, 1.0]],
    [[0.03, 0.09, 0.13], [0.03, 0.06, 0.18]], [[0.1, 0.9, 1.0], [0.1, 0.9, 1.0]],
  ],
  glassB: [[0.05, 0.07, 0.16], [0.08, 0.03, 0.2]], far: [[0.6, 0.38, 0.12], [0.6, 0.1, 0.55]], lineB: [1.0, 0.2, 0.75],
};
const NEON_SETS = [[[0.15, 0.85, 1.0], [1.0, 0.22, 0.85]], [[0.55, 0.35, 1.0], [0.2, 1.0, 0.7]], [[1.0, 0.4, 0.15], [0.3, 0.8, 1.0]]];

export function create(kit) {
  const { material, cols, rows, m4 } = kit;
  const GEO = kit.geometry;
  const HX = cols / 2, HZ = rows / 2;
  const M = m4.create ? m4.create() : new Float32Array(16);
  const XF = (tx, ty, tz, rx, ry, rz, sx, sy, sz) => m4.euler(M, tx, ty, tz, rx, ry, rz, sx, sy, sz);

  // ---- geometry ----
  kit.addGeometry('abShell', shellGeo());
  kit.addGeometry('abHead', headGeo());
  kit.addGeometry('abArcade', archGeo(6, 4.2, 0.7, 1.3));
  kit.addGeometry('abVault', archGeo(23, 14.5, 1.1, 1.4, 22));
  kit.addGeometry('abAmmo', ammoniteGeo());
  kit.addGeometry('abManta', mantaGeo());
  kit.addGeometry('abBell', bellGeo());
  kit.addGeometry('abRing', GEO.torus(0.5, 0.09, 40, 8));
  const cyl = GEO.cylinder(14), cylT = GEO.cylinder(8, 0.7), cylF = GEO.cylinder(10, 1.18), sph = GEO.sphere(10, 6, 0);
  {
    const p = G();
    addXf(p, GEO.cylinder(8), XF(0, 0, 0, 0, 0, 0, 2.3, 0.7, 2.3));
    addXf(p, cyl, XF(0, 0.7, 0, 0, 0, 0, 1.45, 8.5, 1.45));
    for (const [x, z] of [[0.74, 0], [-0.74, 0], [0, 0.74], [0, -0.74]]) addXf(p, cyl, XF(x, 0.7, z, 0, 0, 0, 0.55, 8.5, 0.55));
    addXf(p, GEO.box(), XF(0, 9.2, 0, 0, 0, 0, 2.1, 0.45, 2.1));
    addXf(p, cyl, XF(0.82, 9.6, 0, 0, 0, 0, 0.42, 12.4, 0.42));          // vaulting shaft on the +x side
    kit.addGeometry('abPier', p);
    const w = G();
    addXf(w, GEO.cylinder(8), XF(0, 0, 0, 0, 0, 0, 1.8, 0.6, 1.8));
    addXf(w, cyl, XF(0, 0.6, 0, 0, 0, 0, 1.0, 14, 1.0));
    addXf(w, GEO.box(), XF(0, 14.6, 0, 0, 0, 0, 1.6, 0.4, 1.6));
    kit.addGeometry('abWallPier', w);
  }
  // corals: three kinds, each one merged mesh, with the tips kept for polyp glows
  function coral(kind, seed) {
    const g = G(), tips = [];
    const branch = (b, rx, ry, len, rad, depth, sd) => {
      const T = XF(b[0], b[1], b[2], rx, ry, 0, rad * 2, len, rad * 2);
      addXf(g, cylT, T);
      const e = [b[0] + T[4], b[1] + T[5], b[2] + T[6]];
      if (depth <= 0) { addXf(g, sph, XF(e[0], e[1], e[2], 0, 0, 0, rad * 2.6, rad * 2.6, rad * 2.6)); tips.push(e); return; }
      const n = kind === 1 ? 2 : 2 + (hash(sd) < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const sp = (i - (n - 1) / 2) * (kind === 1 ? 0.55 : 0.7) + (hash(sd + i) - 0.5) * 0.3;
        const nry = kind === 1 ? ry : ry + (hash(sd * 2 + i) - 0.5) * 2.4;
        branch(e, rx * 0.5 + sp, nry, len * (0.66 + hash(sd + i * 3) * 0.14), rad * 0.72, depth - 1, sd * 1.37 + i * 5 + 1);
      }
    };
    if (kind === 2) {
      for (let i = 0; i < 9; i++) {
        const a = hash(seed + i) * TAU, r = 0.1 + 0.35 * hash(seed + i * 2), h = 0.5 + 1.1 * hash(seed + i * 3), rad = 0.09 + 0.1 * hash(seed + i * 4);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        addXf(g, cylF, XF(x, 0, z, (hash(seed + i * 5) - 0.5) * 0.25, 0, (hash(seed + i * 6) - 0.5) * 0.25, rad * 2, h, rad * 2));
        tips.push([x, h, z]);
      }
    } else branch([0, 0, 0], 0, hash(seed) * TAU, kind === 1 ? 0.42 : 0.38, kind === 1 ? 0.09 : 0.11, kind === 1 ? 5 : 4, seed + 1);
    return { g, tips };
  }
  const CORALS = [coral(0, 3), coral(1, 7), coral(2, 11)].map((c, i) => { kit.addGeometry('abCoral' + i, c.g); return c.tips.slice(0, 8); });

  // ---- materials ----
  const stone = material({ color: [0.16, 0.25, 0.29], emissive: [0.01, 0.025, 0.035], rim: [0.04, 0.12, 0.14], lines: 1, lineWidth: 0.025, lineColor: [0.42, 0.3, 0.08], uvScale: [6, 1] });
  const arch = material({ color: [0.18, 0.27, 0.31], emissive: [0.01, 0.025, 0.035], rim: [0.04, 0.12, 0.14], lines: 1, lineWidth: 0.05, lineColor: [0.5, 0.36, 0.1], uvScale: [14, 1] });
  const gold = material({ color: [0.9, 0.66, 0.26], chrome: 0.55, emissive: [0.26, 0.17, 0.04], rim: [0.5, 0.36, 0.1] });
  const nacre = material({ color: [0.5, 0.45, 0.4], chrome: 0.35, emissive: [0.04, 0.035, 0.03], rim: [0.3, 0.22, 0.4], lines: 1, lineWidth: 0.04, lineColor: [0.45, 0.32, 0.1], uvScale: [30, 1] });
  const manta = material({ color: [0.1, 0.14, 0.18], emissive: [0.01, 0.02, 0.03], rim: [0.25, 0.55, 0.65] });
  const bellM = [0, 1, 2].map(() => material({ color: [0.03, 0.05, 0.08], emissive: [0.06, 0.1, 0.16], rim: [0.9, 1.0, 1.1], lines: 1, lineWidth: 0.035, lineColor: [0.5, 0.42, 0.25], uvScale: [10, 1], twoSided: true, fog: 0.5 }));
  const coralM = [0, 1, 2].map((i) => material({ color: [[0.95, 0.42, 0.22], [1.0, 0.6, 0.25], [0.35, 0.7, 0.6]][i], emissive: C.coral[i][0].slice(), rim: [0.25, 0.12, 0.06] }));
  const winMat = [0, 1].map(() => material({ color: [1.8, 1.8, 1.8], emissive: [0.02, 0.02, 0.03], twoSided: true, fog: 0.3, mode: 0 }));
  const facadeMat = material({ color: [1.7, 1.7, 1.7], emissive: [0.02, 0.02, 0.03], twoSided: true, fog: 0.2, mode: 0 });
  const sheets = new Map();   // quantised chaos level -> { lancet: [tex, tex], facade: tex }
  function sheetsAt(k) {
    const q = Math.round(k * 6);
    if (!sheets.has(q)) {
      const P = palAt(q / 6), a = lancetSheet(P, 5), b = lancetSheet(P, 23), f = facadeSheet(P);
      sheets.set(q, { lancet: [a && kit.texture(a, { mipmap: true }), b && kit.texture(b, { mipmap: true })], facade: f && kit.texture(f, { mipmap: true }) });
    }
    return sheets.get(q);
  }

  const body = material({ color: [0.25, 0.55, 0.95], emissive: C.body[0].slice(), rim: C.bodyRim[0].slice(), chrome: 0.12 });
  const head = material({ color: [0.6, 0.95, 1.0], emissive: C.head[0].slice(), rim: C.headRim[0].slice(), chrome: 0.15 });
  const eye = material({ color: [0.02, 0.02, 0.04], emissive: [0.12, 0.08, 0.02] });
  const dot = material({ color: [1.0, 0.95, 0.88], chrome: 0.3, emissive: [0.62, 0.53, 0.38], rim: [0.55, 0.42, 0.75] });

  // ---- layout: everything outside the board (|x| > HX + 0.5 or z < -HZ - 0.5) ----
  const XI = HX + 3.5, XO = HX + 13;
  const PIERS = [], BAYS = [];
  for (let z = 6; z >= -60; z -= 6) PIERS.push(z);
  for (let i = 0; i < PIERS.length - 1; i++) BAYS.push((PIERS[i] + PIERS[i + 1]) / 2);
  const VAULTS = [-12, -24, -36, -48, -60];
  // coral clusters: x, z, kind, scale, ry
  const REEF = [
    [-(HX + 2.4), 4.5, 0, 1.4, 0.3], [HX + 2.6, 2.5, 1, 1.4, 1.2], [-(HX + 2.2), -3.5, 2, 1.4, 0], [HX + 2.4, -6, 0, 1.3, 2.1],
    [-(HX + 2.6), -9, 1, 1.3, 0.5], [HX + 2.3, 7.5, 2, 1.5, 0.4], [-5, -HZ - 2.2, 2, 1.3, 0.8], [4.5, -HZ - 2.6, 0, 1.5, 1.7],
    [-(XI + 3), -1, 1, 4.6, 0.7], [XI + 3.2, -14, 0, 5, 2.4], [-(XI + 4.5), -22, 2, 3.4, 0.2], [XI + 4, 3, 2, 3.2, 1.1],
    [-(XI + 2.5), -34, 0, 4.4, 1.4], [XI + 2.2, -30, 1, 4.8, 0.3], [-8, -HZ - 9, 1, 3.4, 0.9], [9, -HZ - 13, 2, 3.2, 2.2],
    [-(XI + 3.5), 6, 0, 3.6, 2.9], [XI + 3.6, -4, 1, 4.2, 1.9], [-3, -HZ - 18, 0, 4, 0.4], [-(XI + 3), -48, 1, 5, 2.6],
  ];
  const POLYPS = [];
  for (const [x, z, kind, s, ry] of REEF) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    for (const [tx, ty, tz] of CORALS[kind]) POLYPS.push([x + (tx * c + tz * sn) * s, ty * s, z + (-tx * sn + tz * c) * s, hash(x * 3 + z + ty)]);
  }
  // jellyfish: x, y0, z, size, speed, phase
  const JELLY = [];
  for (let i = 0; i < 24; i++) {
    if (i % 2 === 0) JELLY.push([(hash(i * 1.3) - 0.5) * 20, 3 + hash(i * 3.1) * 20, -HZ - 6 - hash(i * 2.7) * 42, i % 8 === 0 ? 6 : 2 + hash(i * 4.3) * 2.6, 0.18 + hash(i * 10.1) * 0.25, hash(i * 12.7) * 40]);
    else { const side = hash(i * 5.9) < 0.5 ? -1 : 1; JELLY.push([side * (HX + 5.5 + hash(i * 6.1) * 7), 3 + hash(i * 8.9) * 14, 7 - hash(i * 7.3) * 52, 1.4 + hash(i * 9.7) * 1.6, 0.18 + hash(i * 10.1) * 0.25, hash(i * 12.7) * 40]); }
  }
  // Jellyfish rise very slowly through 40 units and wrap out of view; a bud grows as it leaves the floor.
  const JP = { x: 0, y: 0, z: 0, s: 0, fade: 0, pulse: 1 };
  function jellyAt(i, t, still) {
    const [x0, y0, z, s0, sp, ph] = JELLY[i];
    const y = still ? y0 : mod(y0 + 6 + t * sp, 40) - 6;
    JP.x = x0 + (still ? 0 : 0.5 * Math.sin(t * 0.2 + ph)); JP.y = y; JP.z = z;
    JP.s = s0 * smooth(y / 3); JP.fade = smooth(y / 3) * smooth((34 - y) / 5);
    JP.pulse = 1 + (still ? 0 : 0.07 * Math.sin(t * 1.1 + ph));
    return JP;
  }
  // light shafts: foot x, foot z, width, lean
  const SHAFTS = [[-(HX + 6), -2, 3, 0.16], [HX + 6.5, -8, 3.4, -0.14], [-(HX + 8), -24, 4, 0.12], [6, -30, 4.5, -0.1], [-5, -44, 5, 0.08], [HX + 7, -40, 4, -0.18], [0, -58, 6, 0]];
  const MOTES = [];
  for (let i = 0; i < 70; i++) {
    const side = hash(i * 2.1) < 0.7;
    MOTES.push(side ? [(hash(i * 3.3) < 0.5 ? -1 : 1) * (HX + 1.5 + hash(i * 4.4) * 12), 0.4 + hash(i * 5.5) * 8, 8 - hash(i * 6.6) * 50, hash(i * 7.7)]
      : [(hash(i * 3.3) - 0.5) * 22, 0.5 + hash(i * 5.5) * 12, -HZ - 2 - hash(i * 6.6) * 40, hash(i * 7.7)]);
  }

  // ---- per-frame state ----
  const pal = new Float32Array(24), room = new Float32Array(16), tmp = [0, 0, 0];
  const F = {
    pal, room,
    board: { panel: [0, 0, 0], grid: [0, 0, 0], frame: [0, 0, 0], lineWidth: 0.035, band: 0.35, gridGlow: 0.5, frameGlow: 0.8 },
    snake: {
      body, head, eye, dot, bodyGeom: 'abShell', headGeom: 'abHead', dotGeom: 'ball',
      bodySize: [0.86, 0.26, 0.86], headSize: [0.9, 0.3, 0.98], dotSize: [0.44, 0.34, 0.44],
      pool: [0, 0, 0], dotPool: [1.0, 0.85, 0.6], poolIntensity: 0.25, dotPoolBeat: 0.15, segment: null,
    },
    ring: [0.07, 0.065, 0.045], wall: [0, 0, 0], beacon: [0.45, 0.4, 0.3], fog: [0, 0, 0],
  };
  let k = 0, time = 0, alive = true, wait = false;
  const bodyE = [0, 0, 0];
  F.snake.segment = (i, n, mat) => {
    if (!alive) { mat.emissive[0] = 0.05; mat.emissive[1] = 0.055; mat.emissive[2] = 0.06; mat.rim[0] = 0.22; mat.rim[1] = 0.19; mat.rim[2] = 0.13; return; }
    const w = 0.85 + 0.2 * Math.sin(time * 0.9 - i * 0.45) + (wait ? 0.25 * (0.5 + 0.5 * Math.sin(time * 2.4)) : 0);
    mat.emissive[0] = bodyE[0] * w; mat.emissive[1] = bodyE[1] * w; mat.emissive[2] = bodyE[2] * w;
    lerp3(mat.rim, C.bodyRim[0], C.bodyRim[1], k);
  };

  function frame(fx, snap) {
    k = smooth(num(fx.chaos)); time = num(fx.time);
    alive = !snap || snap.alive !== false;
    wait = !!(snap && (snap.waiting === 'respawn' || snap.waiting === 'start'));
    const beat = Math.min(0.15, num(fx.beat)), sw = swellOf(fx);
    for (let i = 0; i < 8; i++) setRGB(pal, i, lerp3(tmp, C.pal[i][0], C.pal[i][1], k));
    const ns = NEON_SETS[mod(num(fx.variant) | 0, NEON_SETS.length)];
    setRGB(pal, 7, ns[0]);
    lerp3(tmp, C.glassB[0], C.glassB[1], k); room[0] = tmp[0]; room[1] = tmp[1]; room[2] = tmp[2];
    room[3] = 0.6 + 0.4 * k + 0.2 * sw;
    lerp3(tmp, C.far[0], C.far[1], k); room[4] = tmp[0]; room[5] = tmp[1]; room[6] = tmp[2];
    room[7] = sw;
    room[8] = k; room[9] = beat; room[10] = 0; room[11] = 0.45 + 0.55 * k + 0.3 * sw;
    room[12] = ns[1][0]; room[13] = ns[1][1]; room[14] = ns[1][2]; room[15] = k;

    lerp3(F.board.panel, C.panel[0], C.panel[1], k);
    lerp3(F.board.grid, C.grid[0], C.grid[1], k);
    lerp3(F.board.frame, C.frame[0], C.frame[1], k);
    F.board.frameGlow = 0.8 + 0.25 * sw + beat;
    lerp3(F.snake.pool, C.pool[0], C.pool[1], k);
    lerp3(F.fog, C.fog[0], C.fog[1], k);
    lerp3(F.wall, C.wall[0], C.wall[1], k);

    lerp3(bodyE, C.body[0], C.body[1], k);
    if (alive) {
      lerp3(head.emissive, C.head[0], C.head[1], k);
      if (wait) { const p = 1 + 0.25 * (0.5 + 0.5 * Math.sin(time * 2.4)); head.emissive[0] *= p; head.emissive[1] *= p; head.emissive[2] *= p; }
      lerp3(head.rim, C.headRim[0], C.headRim[1], k);
      eye.emissive[0] = 0.12; eye.emissive[1] = 0.08; eye.emissive[2] = 0.02;
    } else {
      head.emissive[0] = 0.08; head.emissive[1] = 0.085; head.emissive[2] = 0.09;
      head.rim[0] = 0.25; head.rim[1] = 0.22; head.rim[2] = 0.15;
      eye.emissive[0] = 0; eye.emissive[1] = 0; eye.emissive[2] = 0;
    }
    dot.emissive[0] = 0.62 + 0.2 * beat; dot.emissive[1] = 0.53 + 0.18 * beat; dot.emissive[2] = 0.38 + 0.12 * beat;

    lerp3(stone.lineColor, C.line[0], C.line[1], k);
    lerp3(arch.lineColor, C.line[0], C.line[1], k);
    lerp3(nacre.lineColor, C.line[0], C.line[1], k);
    lerp3(gold.emissive, C.gold[0], C.gold[1], k);
    gold.emissive[0] *= 1 + 0.3 * sw; gold.emissive[1] *= 1 + 0.3 * sw; gold.emissive[2] *= 1 + 0.3 * sw;
    lerp3(manta.rim, [0.1, 0.3, 0.38], [0.25, 0.85, 1.0], k);
    for (let i = 0; i < 3; i++) lerp3(coralM[i].emissive, C.coral[i][0], C.coral[i][1], k * (0.75 + 0.25 * Math.sin(time * 0.5 + i * 2)));
    for (let i = 0; i < 3; i++) {
      const set = NEON_SETS[(i + (mod(num(fx.variant) | 0, NEON_SETS.length))) % NEON_SETS.length];
      lerp3(bellM[i].emissive, [0.06, 0.1, 0.16], set[0], k * 0.3);
      lerp3(bellM[i].rim, [0.9, 1.0, 1.1], set[0], k);
      lerp3(bellM[i].lineColor, [0.5, 0.42, 0.25], set[1], k);
    }
    const sh = sheetsAt(k);
    for (let i = 0; i < 2; i++) { winMat[i].tex = sh.lancet[i]; winMat[i].mode = sh.lancet[i] ? 2 : 0; }
    facadeMat.tex = sh.facade; facadeMat.mode = sh.facade ? 2 : 0;
    return F;
  }

  function props(d) {
    const fx = d.fx, still = fx.reducedMotion, t = still ? 0 : num(fx.time);
    // nave arcade: clustered piers, gold capitals, pointed arches, string course, clerestory windows
    for (const s of [-1, 1]) {
      for (const z of PIERS) {
        d.mesh('abPier', d.trs(s * XI, 0, z, s < 0 ? 0 : Math.PI, 1, 1, 1), stone);
        d.mesh('abRing', d.trs(s * XI, 9.05, z, 0, 2.5, 2.5, 2.5), gold);
        d.mesh('abRing', d.trs(s * (XI - 0.82), 22, z, 0, 0.9, 0.9, 0.9), gold);
        d.mesh('abWallPier', d.trs(s * XO, 0, z, 0, 1, 1, 1), stone);
      }
      for (let i = 0; i < BAYS.length; i++) {
        const z = BAYS[i];
        d.mesh('abArcade', d.trs(s * XI, 9.4, z, Math.PI / 2, 1, 1, 1), arch);
        d.mesh('plane', d.trs(s * (XI + 0.2), 16.2, z, -s * Math.PI / 2, 3.4, 6.8, 1), winMat[i % 2]);
        d.mesh('plane', d.trs(s * (XO - 0.3), 1.2, z, -s * Math.PI / 2, 4, 11.5, 1), winMat[(i + 1) % 2]);
      }
      d.mesh('box', d.trs(s * XI, 15.2, (PIERS[0] + PIERS[PIERS.length - 1]) / 2, 0, 1.6, 0.5, PIERS[0] - PIERS[PIERS.length - 1] + 2), arch);
    }
    for (const z of VAULTS) d.mesh('abVault', d.trs(0, 22.2, z, 0, 1, 1, 1), arch);
    d.mesh('plane', d.trs(0, 0, -64, 0, 46, 46, 1), facadeMat);
    // reef
    for (const [x, z, kind, s, ry] of REEF) d.mesh('abCoral' + kind, d.trs(x, 0, z, ry, s, s, s), coralM[kind]);
    // a giant ammonite half sunk in the left aisle, a smaller one far right
    d.mesh('abAmmo', d.euler(-(XI + 5.5), -0.8, -16, 0, 0.5, 0, 7.5, 7.5, 7.5), nacre);
    d.mesh('abAmmo', d.euler(XI + 5, -0.4, -46, 0, -0.9, 0, 4.5, 4.5, 4.5), nacre);
    // jellyfish bells (glowing domes; halos and tentacles are in glows)
    for (let i = 0, nJ = Math.min(JELLY.length, 13 + Math.round(11 * k)); i < nJ; i++) {
      const j = jellyAt(i, t, still);
      if (j.s < 0.05) continue;
      d.mesh('abBell', d.trs(j.x, j.y, j.z, i, j.s * j.pulse, 0.62 * j.s / j.pulse, j.s * j.pulse), bellM[i % 3]);
    }
    // a manta glides in a wide slow loop high over the far nave
    if (!d.mirror) {
      const a = t * 0.09;
      const mx = Math.cos(a) * 16, mz = -36 + Math.sin(a) * 12, my = 17 + Math.sin(a * 2) * 2;
      d.mesh('abManta', d.euler(mx, my, mz, 0.05, -a - Math.PI / 2 + Math.PI, 0.18 * Math.sin(t * 0.5), 5, 5, 5), manta);
    }
  }

  const tmpB = [0, 0, 0], tmpC = [0, 0, 0], tmpS = [0, 0, 0];
  function glows(d) {
    const fx = d.fx, still = fx.reducedMotion, t = num(fx.time), tp = still ? 0 : t, sw = swellOf(fx);
    const v = mod(num(fx.variant) | 0, NEON_SETS.length);
    // haze in the far nave and the aisles
    lerp3(tmpS, C.haze[0], C.haze[1], k);
    d.glow('plane', d.trs(0, 0, -30, 0, 46, 22, 1), tmpS, 5, 0.7, 0.37, 0.7);
    for (const [x, z, w, h] of [[0, -16, 34, 14], [0, -36, 48, 24], [-(HX + 9), 2, 12, 12], [HX + 9, -6, 12, 12]]) d.billboard(x, 0, z, w, h, tmpS, 0, 0.4);
    d.glow('plane', d.trs(-(HX + 9), 0, -6, 0, 10, 10, 1), tmpS, 5, 0.4, 0.71, 0.6);
    d.glow('plane', d.trs(HX + 9, 0, -12, 0, 10, 10, 1), tmpS, 5, 0.4, 0.19, 0.6);
    // light shafts from the surface and their pools
    lerp3(tmpS, C.shaft[0], C.shaft[1], k);
    const si = (0.22 + 0.12 * k + 0.1 * sw) * (1 + Math.min(0.15, num(fx.beat)));
    for (let i = 0; i < SHAFTS.length; i++) {
      const [x, z, w, lean] = SHAFTS[i];
      const ry = Math.atan2(d.eye[0] - x, d.eye[2] - z), sway = lean + 0.03 * Math.sin(tp * 0.07 + i * 1.7);
      d.glow('plane', d.euler(x, 0, z, 0, ry, sway, w, 30, 1), tmpS, 0, si);
      d.floorGlow(x, z, w * 2.2, tmpS, si * 1.4);
    }
    // the rose window breathes light down the nave
    lerp3(tmpS, C.far[0], C.far[1], k);
    d.billboard(0, 2, -62, 34, 30, tmpS, 0, 0.14 + 0.08 * k + 0.06 * sw);
    // jellyfish: a halo around each bell, a warm glow under it, soft tentacles
    const nJ = Math.min(JELLY.length, 13 + Math.round(11 * k));
    for (let i = 0; i < nJ; i++) {
      const j = jellyAt(i, t, still), s = j.s, fade = j.fade;
      if (fade < 0.02 || s < 0.05) continue;
      const set = NEON_SETS[(i + v) % NEON_SETS.length];
      lerp3(tmpB, C.bell[0], set[0], k); lerp3(tmpC, C.core[0], set[1], k);
      d.billboard(j.x, j.y - 0.5 * s, j.z, 2.4 * s, 1.9 * s, tmpB, 0, 0.45 * fade * (1 + 0.3 * sw));
      d.billboard(j.x, j.y - 0.35 * s, j.z, 0.9 * s, 0.6 * s, tmpC, 0, 0.9 * fade);
      for (let q = 0; q < 4; q++) {
        const ox = (q - 1.5) * 0.24 * s, len = s * (1.4 + 0.9 * hash(i * 7 + q)), wv = still ? 0 : Math.sin(t * 0.7 + q * 1.9 + i) * 0.3 * s;
        d.beam(j.x + ox, j.y + 0.02 * s, j.z, j.x + ox * 1.3 + wv, j.y - len, j.z + wv * 0.4, 0.04 * s, q % 2 ? tmpC : tmpB, 0.75 * fade, 0.8, 0.9, 1.5);
      }
    }
    // coral polyps: faint amber in the own style, bioluminescent with chaos (slow, never blinking)
    lerp3(tmpS, C.polyp[0], NEON_SETS[v][1], k);
    for (const [x, y, z, h] of POLYPS) d.billboard(x, y - 0.2, z, 0.5, 0.5, tmpS, 0, (0.18 + 0.75 * k) * (0.75 + 0.25 * Math.sin(t * 0.6 + h * 30)));
    // plankton motes
    const nM = 14 + Math.round(56 * k);
    lerp3(tmpS, [0.5, 0.7, 0.75], NEON_SETS[v][0], k);
    for (let i = 0; i < nM; i++) {
      const [x, y0, z, h] = MOTES[i];
      const y = y0 + (still ? 0 : 0.4 * Math.sin(t * 0.25 + h * 20));
      d.billboard(x, y, z, 0.22, 0.22, tmpS, 0, (0.35 + 0.65 * k) * (0.6 + 0.4 * Math.sin(t * 0.45 + h * 50)));
    }
  }

  return { frame, props, glows };
}

// ─────────────── life icon (LEVELS_PLAN §4.3): a pearl, filled or as an empty gold setting ───────────────
// (x, y) is the top-left corner of a size × size slot.
export function life(ctx, x, y, size, filled, fx) {
  const k = smooth(num(fx && fx.chaos)), t = num(fx && fx.time), cx = x + size / 2, cy = y + size / 2, R = size * 0.36;
  const gold = [214 + (41 - 214) * k, 160 + (243 - 160) * k, 60 + (255 - 60) * k];
  ctx.save();
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.strokeStyle = css(gold);
  if (filled) {
    const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, size * 0.5);
    halo.addColorStop(0, css([255, 236 - 146 * k, 200 + 30 * k], 0.4)); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff5e4'); g.addColorStop(0.75, '#e6d6c9'); g.addColorStop(1, '#a995b8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.4; ctx.strokeStyle = `hsl(${mod(t * 18, 360) | 0},90%,72%)`; ctx.lineWidth = Math.max(1, R * 0.16);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, t * 0.3, t * 0.3 + 2.2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.ellipse(cx - R * 0.35, cy - R * 0.42, R * 0.22, R * 0.13, -0.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(gold); ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath(); ctx.arc(cx, cy, R + ctx.lineWidth * 0.5, 0, TAU); ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(4,14,24,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(0.6, size * 0.03);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
