// ACID ENDLESS LANE, 1967 — room for the universe `lane` (stream lane-room, LEVELS_PLAN 6).
// An endless strip (F.board.open) through a hand-printed op-art arcade: swirl-striped arches on both
// sides, giant flowers, toadstools, striped domes and a swirling spiral sun at the vanishing point.
// Every prop sits on an absolute lane row (placed by modulo of d.scroll), so the arcade slides past
// smoothly as the window follows the head and never ends in either direction. The two lethal sides
// carry rails; the far and near ends are open and fade into haze.
// Two styles: chaos 0 = screen print (cream paper, orange grid, warm inks, misregistered key line);
// chaos 1 = neon glass flowers, glowing spiral sun, checker domes, mirror floor (accent by fx.variant).
// Snake = floral worm (scalloped ink blocks, a daisy on every third), head = pointed bud; dot = hot
// pink marble (gold orb in neon) with a far beacon while it lies ahead of the window. The board keeps
// fixed colours (no beat in there). Interface: see the top of court.js. Extra export: life().

export const meta = {
  id: 'lane',
  name: 'ACID ENDLESS LANE',
  year: '1967',
  luma: 0.55,
  veil: '#3a1030',
  weight: 3,
  hud: { fg: '#fff1d6', bg: 'rgba(58,16,40,0.8)', accent: '#ff6a1a', panelFg: '#fff1d6', panelBg: 'rgba(58,16,40,0.9)' },
};

// ───────────────────────────── palette ─────────────────────────────
const CREAM = [0.96, 0.88, 0.7];
const ORANGE = [0.93, 0.36, 0.1];
const MUSTARD = [0.93, 0.68, 0.14];
const OLIVE = [0.56, 0.62, 0.16];
const TEAL = [0.1, 0.5, 0.5];
const PLUM = [0.36, 0.1, 0.28];
const PINK = [1.0, 0.16, 0.55];
const NIGHT = [0.05, 0.015, 0.1];
const BERRY = [0.3, 0.08, 0.22];
const CORAL = [1.0, 0.45, 0.42];
const CYAN = [0.15, 0.95, 1.0];
const MAGENTA = [1.0, 0.15, 0.85];
const VIOLET = [0.55, 0.2, 1.0];
const BLUE = [0.2, 0.45, 1.0];
const GOLD = [1.0, 0.62, 0.08];
const YELLOW = [1.0, 0.92, 0.2];
const LIME = [0.55, 1.0, 0.2];
const INKS = [ORANGE, MUSTARD, OLIVE, TEAL, PLUM];
const NEONS = [CYAN, MAGENTA, YELLOW, LIME];
const WORM0 = [ORANGE, MUSTARD, OLIVE, TEAL, PLUM];
const WORM1 = [CYAN, VIOLET, MAGENTA, BLUE];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
function setRGB(arr, i, c, k = 1) { arr[i * 3] = c[0] * k; arr[i * 3 + 1] = c[1] * k; arr[i * 3 + 2] = c[2] * k; }
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
// chaos -> style blend; eased so the print look holds a while and the neon arrives with a push
const tone = (c) => { const x = clamp(num(c, 0), 0, 1); return x * x * (3 - 2 * x); };

// ───────────────────────────── shaders ─────────────────────────────
// uPal: 0/1 mesh ambient sky/ground, 2 zenith, 3 horizon, 4 ink A, 5 ink B, 6 key ink, 7 sun ink
// uRoom[0] tone, beat, punch, swirl phase; [1] sun spin phase, grain, misregistration, stars
// uRoom[2] floor paper rgb, gloss; [3] floor dark rgb, bite wave strength
export const glsl = {
  sky: /* glsl */ `
float lnNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// three inks in turn, picked by band index (no dynamic uniform indexing)
vec3 lnInk(float m) {
  return mix(mix(uPal[4], uPal[5], step(0.5, m)), uPal[6], step(1.5, m));
}
vec3 roomSky(vec3 d) {
  float t = uRoom[0].x;
  if (d.y < 0.0) return mix(uPal[3], uRoom[2].rgb, 0.55);
  float y = d.y;
  vec3 col = mix(uPal[3], uPal[2], smoothstep(0.0, 0.55, y));
  // coordinates around the sun, straight down the lane and a little above the horizon
  vec3 sd = normalize(vec3(0.0, 0.1, -1.0));
  vec3 rr = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
  vec3 uu = cross(rr, sd);
  float fw = max(dot(d, sd), 0.06);
  vec2 q = vec2(dot(d, rr), dot(d, uu)) / fw;
  float rad = length(q), ang = atan(q.y, q.x);
  float far = smoothstep(-0.05, 0.4, dot(d, sd));        // swirl only in the forward half
  // swirling ink bands (screen print) or thin neon streaks
  float s = ang * 0.9549 + log(rad + 0.04) * 1.6 - uRoom[0].w;   // 6 arms
  float f = fract(s);
  float aw = 0.04 + 0.1 * smoothstep(0.6, 0.05, rad);
  float on = smoothstep(0.42 - aw, 0.42 + aw, f) * (1.0 - smoothstep(0.94 - aw, 0.94 + aw, f));
  float m = mod(floor(s), 3.0);
  vec3 ink = lnInk(m);
  // misregistered key line: the plum outline printed slightly off its colour
  vec2 qo = q + vec2(0.012, -0.008) * uRoom[1].z;
  float so = atan(qo.y, qo.x) * 0.9549 + log(length(qo) + 0.04) * 1.6 - uRoom[0].w;
  float key = 1.0 - smoothstep(0.0, 0.035 + aw * 0.5, abs(fract(so) - 0.42));
  float grain = (lnNoise(q * 90.0) - 0.5) * uRoom[1].y + (hash12(floor(d.xz * 900.0 + d.y * 300.0)) - 0.5) * uRoom[1].y * 0.6;
  vec3 print = mix(col, ink, on * far * 0.92);
  print = mix(print, uPal[6] * 0.55, key * far * (1.0 - t) * 0.8);
  print *= 1.0 + grain;
  vec3 neon = col + ink * on * far * 0.16 + ink * exp(-pow((f - 0.42) * 14.0, 2.0)) * far * (0.9 + 0.8 * uRoom[0].y);
  col = mix(print, neon, t);
  // spiral sun
  float sr = 0.36 * (1.0 + 0.06 * uRoom[0].z);
  float disc = 1.0 - smoothstep(sr - 0.012, sr + 0.012, rad);
  float spi = fract(ang * 1.9099 + rad * 9.0 - uRoom[1].x);      // 12 spiral stripes
  float st = smoothstep(0.45, 0.5, spi) * (1.0 - smoothstep(0.95, 1.0, spi));
  vec3 sun = mix(uPal[7], mix(CREAMSKY, uPal[5], t), st);
  sun *= 1.0 + grain * (1.0 - t);
  col = mix(col, sun * (1.0 + 0.15 * t + 0.4 * uRoom[0].z), disc * far);
  col = mix(col, uPal[6] * 0.5, (1.0 - smoothstep(0.0, 0.03, abs(rad - sr))) * far * (1.0 - t));  // printed rim
  col += uPal[7] * exp(-max(rad - sr, 0.0) * 9.0) * far * t * (0.22 + 0.3 * uRoom[0].y + 0.6 * uRoom[0].z);
  // neon: floating bubbles and stars
  if (uRoom[1].w > 0.01) {
    vec2 sp = vec2(atan(d.x, -d.z) * 18.0, y * 24.0 + uTime * 0.15);
    vec2 cell = floor(sp), fr = fract(sp) - 0.5;
    float h = hash12(cell);
    if (h > 0.9) {
      vec2 o = fr - (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.5;
      float r = length(o), br = 0.12 + 0.18 * hash12(cell + 1.3);
      float ringb = exp(-pow((r - br) * 40.0, 2.0)) + exp(-dot(o - vec2(-br * 0.4, br * 0.4), o - vec2(-br * 0.4, br * 0.4)) * 900.0);
      col += mix(uPal[5], uPal[4], hash12(cell + 9.0)) * ringb * uRoom[1].w * smoothstep(0.03, 0.2, y);
    }
  }
  col += uPal[4] * uRoom[0].z * 0.18;
  return col;
}
`.replace('CREAMSKY', 'vec3(0.97, 0.9, 0.74)'),
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  float t = uRoom[0].x;
  vec2 w = aaWidth(p);
  float Y = p.y + uLaneScroll.y + uBoard.y;            // absolute lane row (mod 256)
  float ax = abs(p.x) - uBoard.x;                      // distance outside the strip's side edge
  float far = smoothstep(30.0, 180.0, dist);           // patterns settle into flat ink far away
  // screen print: op-art ripples running along the lane, inks separated by cream paper
  float s = ax * 0.42 + 0.85 * sin(Y * 0.3927 + ax * 0.33);   // 16-row period (divides 256)
  float f = fract(s);
  float aw = clamp((w.x + w.y) * 0.6, 0.01, 0.5);
  float on = smoothstep(0.5 - aw, 0.5 + aw, f) * (1.0 - smoothstep(0.96 - aw, 0.96 + aw, f));
  vec3 ink = lnInk(mod(floor(s), 3.0));
  vec3 paper = uRoom[2].rgb * (1.0 + (lnNoise(p * 3.1) - 0.5) * uRoom[1].y * 1.4);
  vec3 print = mix(paper, ink, on * (1.0 - far) * 0.95);
  print = mix(print, mix(paper, ink, 0.35), far);
  // neon: a glossy night checker on absolute rows, edges lit
  vec2 c = vec2(p.x * 0.5, Y * 0.5);
  float ch = checkerAA(c, w * 0.5);
  vec3 dark = mix(uRoom[3].rgb, uRoom[3].rgb * 2.6 + uPal[5] * 0.05, ch);
  float edge = gridAA(c, 0.03, w * 0.5) * (1.0 - far);
  vec3 neon = dark + uPal[4] * edge * (0.35 + 0.5 * uRoom[0].y);
  // bite wave: a ring of ink racing out across the floor
  if (uBite.w > 0.5) {
    float r = length(p - uBite.xy), front = uBite.z * 26.0;
    float wave = exp(-pow((r - front) * 0.35, 2.0)) * exp(-uBite.z * 1.6) * uRoom[3].w;
    neon += uPal[5] * wave * 1.5;
    print = mix(print, uPal[6], clamp(wave, 0.0, 1.0) * 0.6);
  }
  gloss = uRoom[2].w;
  return mix(print, neon, t);
}
`,
};

// ───────────────────────────── geometry ─────────────────────────────
// copy of g, scaled, rotated (z, then x, then y) and moved
function xf(g, s = [1, 1, 1], r = [0, 0, 0], t = [0, 0, 0]) {
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  const rot = (x, y, z) => {
    const x1 = x * cz - y * sz, y1 = x * sz + y * cz;
    const y2 = y1 * cx - z * sx, z2 = y1 * sx + z * cx;
    return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];
  };
  const out = { pos: [], nrm: [], uv: g.uv.slice(), idx: g.idx.slice() };
  for (let i = 0; i < g.pos.length; i += 3) {
    const p = rot(g.pos[i] * s[0], g.pos[i + 1] * s[1], g.pos[i + 2] * s[2]);
    out.pos.push(p[0] + t[0], p[1] + t[1], p[2] + t[2]);
    const n = rot(g.nrm[i] / s[0], g.nrm[i + 1] / s[1], g.nrm[i + 2] / s[2]);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    out.nrm.push(n[0] / l, n[1] / l, n[2] / l);
  }
  return out;
}
const mergeAll = (G, list) => G.merge(list.map((g) => ({ g })));

// body block: a rounded square with a scalloped rim (reads as a cell, prints like a flower)
function segGeo(G) {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const r = 0.5 / Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(s), 4), 0.25);
    const k = 0.93 + 0.05 * Math.cos(a * 8);
    pts.push([c * r * k, s * r * k]);
  }
  return G.prism(pts);
}
// head: a pointed flower bud, tip toward local -z
function budGeo(G) {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const tip = Math.pow(Math.max(0, -s), 6);
    const r = (0.4 + 0.045 * Math.cos(a * 6) * (1 - tip)) + 0.1 * tip;   // tip at 0.5: stays inside its cell
    pts.push([c * r * (1 - 0.4 * tip), s * r]);
  }
  return G.prism(pts);
}
// a ring of n petals around the origin, tilted up by `lift`, each `len` long
function petalsGeo(G, n, len, wid, lift, phase = 0, thick = 0.1) {
  const petal = xf(G.sphere(12, 8, 0), [wid, thick, len], [0, 0, 0], [0, 0, -len * 0.5]);
  const out = [];
  for (let i = 0; i < n; i++) out.push(xf(petal, [1, 1, 1], [lift, ((i + phase) / n) * Math.PI * 2, 0]));
  return mergeAll(G, out);
}
// curved stem with two leaves, 1 unit tall
function stemGeo(G) {
  const parts = [], N = 6;
  let px = 0;
  for (let i = 0; i < N; i++) {
    const nx = 0.09 * Math.sin((i + 1) * 1.15), dy = 1 / N, dx = nx - px;
    const len = Math.hypot(dx, dy);
    parts.push(xf(G.cylinder(10, 0.92), [0.07, len * 1.04, 0.07], [0, 0, -Math.atan2(dx, dy)], [px, i * dy, 0]));
    px = nx;
  }
  parts.push(xf(G.sphere(10, 6, 0), [0.22, 0.03, 0.08], [0, 0, 0.5], [0.12, 0.35, 0]));
  parts.push(xf(G.sphere(10, 6, 0), [0.2, 0.03, 0.07], [0, Math.PI, 0.5], [-0.1, 0.58, 0]));
  return mergeAll(G, parts);
}
// one arch in the xy-plane: two pillars and a half-torus top; spans x -1..1, stands on y = 0
function archParts(G, R = 1, r = 0.16, H0 = 1.2) {
  const g = { pos: [], nrm: [], uv: [], idx: [] }, seg = 24, tube = 8;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= tube; j++) {
      const b = (j / tube) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
      const n = [ca * cb, sa * cb, sb];
      g.pos.push(ca * (R + r * cb), H0 + sa * (R + r * cb), r * sb);
      g.nrm.push(n[0], n[1], n[2]);
      g.uv.push(i / seg, j / tube);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < tube; j++) {
    const a = i * (tube + 1) + j, b = a + tube + 1;
    g.idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return [g, xf(G.cylinder(12, 1), [r * 2.4, H0, r * 2.4], [0, 0, 0], [-R, 0, 0]), xf(G.cylinder(12, 1), [r * 2.4, H0, r * 2.4], [0, 0, 0], [R, 0, 0])];
}
// a run of n arches every `gap` units toward -z, scaled by k
function arcadeGeo(G, n, gap, k) {
  const one = archParts(G), out = [];
  for (let j = 0; j < n; j++) for (const p of one) out.push(xf(p, [k, k, k], [0, 0, 0], [0, 0, -j * gap]));
  return mergeAll(G, out);
}
// rail posts every `gap` units toward -z, each with a ball cap
function postsGeo(G, n, gap) {
  const out = [];
  for (let j = 0; j < n; j++) {
    out.push(xf(G.cylinder(10, 1), [0.13, 0.62, 0.13], [0, 0, 0], [0, 0, -j * gap]));
    out.push(xf(G.sphere(10, 6, 0), [0.24, 0.2, 0.24], [0, 0, 0], [0, 0.66, -j * gap]));
  }
  return mergeAll(G, out);
}
// little verge flowers (petals / centres) every `gap` units toward -z
function vergeGeo(G, n, gap, centres) {
  const one = centres ? xf(G.sphere(8, 6, 0), [0.22, 0.14, 0.22], [0, 0, 0], [0, 0.42, 0]) : mergeAll(G, [
    xf(petalsGeo(G, 7, 0.24, 0.13, 0.25), [1, 1, 1], [0, 0, 0], [0, 0.4, 0]),
    xf(G.cylinder(6, 1), [0.04, 0.4, 0.04]),
  ]);
  const out = [];
  for (let j = 0; j < n; j++) out.push(xf(one, [1, 1, 1], [0, j * 1.3, 0], [0.25 * Math.sin(j * 2.1), 0, -j * gap]));
  return mergeAll(G, out);
}
// dot: a marble ringed by a collar of petals (base y = 0, 1 unit)
function blossomGeo(G) {
  return mergeAll(G, [G.sphere(18, 12, 0.5), xf(petalsGeo(G, 8, 0.32, 0.22, 0.15, 0, 0.25), [1, 1, 1], [0, 0, 0], [0, 0.45, 0])]);
}

// ───────────────────────────── print sheets ─────────────────────────────
const css = (c, k = 1) => `rgb(${Math.round(clamp(c[0] * k, 0, 1) * 255)},${Math.round(clamp(c[1] * k, 0, 1) * 255)},${Math.round(clamp(c[2] * k, 0, 1) * 255)})`;
function sheet(kit, w, h) {
  if (kit.canvas) return kit.canvas(w, h);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
// diagonal ink bands with cream gaps and paper grain (barber-pole swirl on arches and posts)
function stripeSheet(kit) {
  const cv = sheet(kit, 256, 64);
  const g = cv && cv.getContext && cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = css(CREAM); g.fillRect(0, 0, 256, 64);
  const inks = [ORANGE, TEAL, MUSTARD, PLUM, OLIVE, ORANGE, TEAL, PLUM];
  for (let i = -2; i < 10; i++) {
    g.fillStyle = css(inks[(i + 8) % 8]);
    g.beginPath();
    const x = i * 32;
    g.moveTo(x, 0); g.lineTo(x + 22, 0); g.lineTo(x + 22 + 64, 64); g.lineTo(x + 64, 64); g.closePath(); g.fill();
  }
  const img = g.getImageData(0, 0, 256, 64), px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (hash(i * 0.37) - 0.5) * 34;
    px[i] = clamp(px[i] + n, 0, 255); px[i + 1] = clamp(px[i + 1] + n, 0, 255); px[i + 2] = clamp(px[i + 2] + n * 0.8, 0, 255);
  }
  g.putImageData(img, 0, 0);
  return cv;
}
// checker for the neon domes and caps (tinted by the material colour)
function checkerSheet(kit) {
  const cv = sheet(kit, 64, 64);
  const g = cv && cv.getContext && cv.getContext('2d');
  if (!g) return null;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) & 1 ? '#ffffff' : '#1a0830';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  return cv;
}

// ───────────────────────────── layout ─────────────────────────────
const RAIL_X = 9.0;            // lethal side rails, just outside the strip (|x| > cols / 2 + 0.5)
const ARC_X = 15, ARC_K = 4;   // arcade centre line and arch scale (pillars at x 11 and 19)
const P_POST = 2, P_ARC = 6, P_MUSH = 12, P_FLOW = 10, P_DOME = 36, P_VERGE = 3;
// prop range in world z: the board camera only looks toward -z (its near cut at +26 is never on screen);
// first person may look either way down the lane, so it gets both. Props bloom in over FADE units.
const Z_FAR = -175, Z_NEAR_BOARD = 26, Z_NEAR_POV = 175, FADE = 40, RUN_NEAR = 180;

export function create(kit) {
  const { material } = kit;
  const G = kit.geometry;
  kit.addGeometry('lane:seg', segGeo(G));
  kit.addGeometry('lane:bud', budGeo(G));
  kit.addGeometry('lane:blossom', blossomGeo(G));
  kit.addGeometry('lane:daisy', petalsGeo(G, 8, 0.26, 0.16, 0.06, 0, 0.05));
  kit.addGeometry('lane:petals', petalsGeo(G, 9, 1.0, 0.42, 0.42));
  kit.addGeometry('lane:petals2', petalsGeo(G, 7, 0.6, 0.34, 0.95, 0.5));
  kit.addGeometry('lane:stem', stemGeo(G));
  kit.addGeometry('lane:arch', arcadeGeo(G, 1, P_ARC, ARC_K));
  kit.addGeometry('lane:posts', postsGeo(G, 230, P_POST));      // long merged runs: their ends lie far past the haze
  kit.addGeometry('lane:verge', vergeGeo(G, 150, P_VERGE, false));
  kit.addGeometry('lane:vergeC', vergeGeo(G, 150, P_VERGE, true));

  const tex = (cv, o) => (cv && kit.texture ? kit.texture(cv, o) : null);
  const stripeTex = tex(stripeSheet(kit), { repeat: true, mipmap: true });
  const checkTex = tex(checkerSheet(kit), { repeat: true, mipmap: true });
  const tmat = (o, t) => material(t ? { ...o, tex: t, mode: 2 } : { ...o, color: o.plain || o.color });

  const M = {
    arch: tmat({ color: [1, 1, 1], plain: ORANGE, uvScale: [5, 1], rim: [0.2, 0.08, 0.05], fog: 0.7 }, stripeTex),
    post: tmat({ color: [1, 1, 1], plain: PLUM, uvScale: [2, 1], rim: [0.15, 0.05, 0.05] }, stripeTex),
    rail: material({ color: [0.2, 0.08, 0.05], emissive: ORANGE, rim: [0.3, 0.1, 0.05] }),
    rail2: material({ color: [0.1, 0.03, 0.06], emissive: PLUM }),
    stem: material({ color: [0.25, 0.3, 0.06], emissive: [0.3, 0.36, 0.08], rim: [0.2, 0.2, 0.05], fog: 0.6 }),
    petA: material({ color: [0.3, 0.1, 0.03], emissive: ORANGE, rim: [0.3, 0.1, 0.05], fog: 0.6 }),
    petB: material({ color: [0.1, 0.25, 0.25], emissive: TEAL, rim: [0.2, 0.2, 0.1], fog: 0.6 }),
    petC: material({ color: [0.3, 0.2, 0.03], emissive: MUSTARD, rim: [0.3, 0.2, 0.05], fog: 0.6 }),
    inner: material({ color: [0.2, 0.06, 0.15], emissive: PLUM, rim: [0.2, 0.1, 0.1], fog: 0.6 }),
    core: material({ color: [0.3, 0.28, 0.2], emissive: CREAM, fog: 0.6 }),
    mstem: material({ color: [0.4, 0.36, 0.28], emissive: [0.55, 0.5, 0.38], rim: [0.2, 0.1, 0.05], fog: 0.7 }),
    capP: tmat({ color: [1, 1, 1], plain: ORANGE, uvScale: [3, 1], rim: [0.25, 0.1, 0.05], fog: 0.7 }, stripeTex),
    capN: tmat({ color: MAGENTA, plain: MAGENTA, uvScale: [8, 4], rim: [0.3, 0.9, 1], fog: 0.7 }, checkTex),
    domeP: tmat({ color: [1, 1, 1], plain: MUSTARD, uvScale: [6, 2], fog: 0.8 }, stripeTex),
    domeN: tmat({ color: YELLOW, plain: YELLOW, uvScale: [12, 6], rim: [1, 0.2, 0.8], fog: 0.8 }, checkTex),
    verge: material({ color: [0.3, 0.27, 0.2], emissive: CREAM, fog: 0.8 }),
    vergeC: material({ color: [0.3, 0.1, 0.03], emissive: ORANGE, fog: 0.8 }),
  };

  // ---- snake: scalloped ink blocks, a daisy on every third; head = bud; dot = blossom marble ----
  const snakeBody = material({ color: [0.08, 0.05, 0.04], emissive: ORANGE, rim: [0.1, 0.05, 0.05] });
  const snakeHead = material({ color: [0.04, 0.12, 0.12], emissive: TEAL, lines: 1, lineWidth: 0.08, lineColor: MUSTARD, rim: [0.15, 0.1, 0.05] });
  const snakeEye = material({ color: [0, 0, 0], emissive: [0.1, 0.02, 0.08] });
  const dot = material({ color: [0.1, 0.02, 0.06], emissive: PINK, rim: [0.4, 0.3, 0.3] });
  const DAISY0 = [0.5, 0.86, 0.9];
  const daisy = material({ color: [0.1, 0.16, 0.16], emissive: DAISY0 });
  const HEART0 = [0.42, 0.08, 0.4];
  const daisyC = material({ color: [0.1, 0.02, 0.1], emissive: HEART0 });

  const pal = new Float32Array(24), room = new Float32Array(16);
  const F = {
    pal, room,
    board: { open: true, panel: CREAM.slice(), grid: [0, 0, 0], frame: PLUM.slice(), lineWidth: 0.04, band: 0.32, gridGlow: 0, frameGlow: 0.15 },
    snake: {
      body: snakeBody, head: snakeHead, eye: snakeEye, dot,
      bodyGeom: 'lane:seg', headGeom: 'lane:bud', dotGeom: 'lane:blossom',
      bodySize: [0.86, 0.24, 0.86], headSize: [0.92, 0.26, 0.92], dotSize: [0.64, 0.34, 0.64],
      pool: ORANGE.slice(), dotPool: PINK.slice(), poolIntensity: 0.05, dotPoolBeat: 0,
      segment: null,
    },
    ring: ORANGE.slice(), wall: [1, 0.45, 0.12], beacon: PINK.slice(), fog: [0.96, 0.8, 0.55],
    curb: false, reflections: false,
  };
  const st = { t: 0, vi: 0, acc: CYAN, beat: 0, punch: 0, alive: true, waiting: false, pulse: 1, swirl: 0, sun: 0, last: null, beacon: PINK.slice() };
  // faded ink of a dead worm: always the opposite brightness of the panel at that chaos
  const deadInk = (t, k) => scl(mixc([0.35, 0.3, 0.28], [0.7, 0.67, 0.76], t), k);
  F.snake.segment = (i, n, mat) => {
    // fixed ink per segment from the head; never the beat
    const c0 = WORM0[i % WORM0.length], c1 = WORM1[i % WORM1.length];
    const c = st.alive ? mixc(c0, c1, st.t) : deadInk(st.t, 1);
    setRGB(mat.emissive, 0, c, st.pulse);
  };

  function frame(fx, snap) {
    const alive = snap.alive !== false;
    const t = tone(fx.chaos), b = fx.beat, p = fx.punch, vi = ((fx.variant % 4) + 4) % 4, acc = NEONS[vi];
    const still = fx.reducedMotion;
    // phases advance with time (no jump when the speed changes); a bite kicks the swirl
    const dt = st.last == null ? 0 : clamp(fx.time - st.last, 0, 0.1);
    st.last = fx.time;
    st.swirl += dt * (still ? 0.02 : 0.12 + 0.3 * fx.chaos + 2.2 * p + 0.25 * b);
    st.sun += dt * (still ? 0.03 : 0.25 + 0.6 * fx.chaos + 3 * p);
    const waiting = !!snap.waiting;
    Object.assign(st, { t, vi, acc, beat: b, punch: p, alive, waiting });
    st.pulse = waiting && !still ? 0.9 + 0.1 * Math.sin(fx.time * 4) : 1;

    // inks rotate with fx.variant in print; neon takes the variant's accent
    const inkA = INKS[vi % 5], inkB = INKS[(vi + 3) % 5];
    setRGB(pal, 0, mixc([0.78, 0.7, 0.56], [0.38, 0.22, 0.6], t), 1 + 0.3 * p);
    setRGB(pal, 1, mixc([0.36, 0.26, 0.18], [0.08, 0.03, 0.14], t));
    setRGB(pal, 2, mixc([0.95, 0.7, 0.42], [0.07, 0.02, 0.17], t));
    setRGB(pal, 3, mixc(CREAM, [0.62, 0.1, 0.5], t), 1 + 0.12 * b * t);
    setRGB(pal, 4, mixc(inkA, acc, t));
    setRGB(pal, 5, mixc(inkB, MAGENTA, t));
    setRGB(pal, 6, mixc(PLUM, VIOLET, t));
    setRGB(pal, 7, mixc(ORANGE, YELLOW, t));
    room[0] = t; room[1] = b; room[2] = p; room[3] = st.swirl;
    room[4] = st.sun; room[5] = 0.16 * (1 - t); room[6] = 1 - t; room[7] = t;
    const paper = mixc(CREAM, [0.9, 0.8, 0.62], 0.3);
    room[8] = paper[0]; room[9] = paper[1]; room[10] = paper[2]; room[11] = lerp(0, 0.72, t);
    room[12] = 0.03; room[13] = 0.008; room[14] = 0.06; room[15] = 0.5 + 0.7 * t;
    setRGB(F.fog, 0, mixc([0.96, 0.8, 0.55], [0.36, 0.06, 0.42], t), 1 + 0.15 * b * t);
    F.reflections = t > 0.12;

    // board: fixed colours per chaos level, never on the beat (grid is added to the panel: orange on
    // cream needs a negative grid colour)
    // three stops: cream paper with orange lines -> deep berry with coral lines -> night with cyan lines
    const B = F.board;
    B.open = !!(snap.space && snap.space.kind === 'lane'); // a box snapshot (fallback, debug) gets a closed board
    const u = t < 0.5 ? t * 2 : t * 2 - 1;
    B.panel = t < 0.5 ? mixc(CREAM, BERRY, u) : mixc(BERRY, NIGHT, u);
    const line = t < 0.5 ? mixc(ORANGE, CORAL, u) : mixc(CORAL, [NIGHT[0] + CYAN[0] * 0.85, NIGHT[1] + CYAN[1] * 0.85, NIGHT[2] + CYAN[2] * 0.85], u);
    B.grid = [line[0] - B.panel[0], line[1] - B.panel[1], line[2] - B.panel[2]];
    B.frame = mixc(PLUM, MAGENTA, t);
    B.lineWidth = lerp(0.04, 0.028, t); B.gridGlow = lerp(0, 0.5, t); B.frameGlow = lerp(0.15, 0.9, t);
    F.ring = mixc(ORANGE, acc, t);
    F.wall = mixc([1, 0.45, 0.12], MAGENTA, t);
    // while the dot lies ahead of the window the room draws its own beacon behind the flag; the engine's
    // first-person beam would sit on top of the flag and wash it out
    const fa = snap.foodAt, ahead = !snap.food && fa && snap.space && snap.space.kind === 'lane' && fa.y < snap.space.y0;
    st.beacon = mixc(PINK, GOLD, t);
    F.beacon = ahead ? [0, 0, 0] : st.beacon;
    const sn = F.snake;
    sn.pool = mixc(ORANGE, CYAN, t); sn.poolIntensity = lerp(0.04, 0.12, t);
    sn.dotPool = mixc(scl(PINK, 0.45), scl(GOLD, 0.8), t);

    snakeHead.emissive.set(alive ? mixc(TEAL, [0.85, 1, 1], t) : deadInk(t, 1.15));
    snakeHead.lineColor.set(alive ? mixc(MUSTARD, MAGENTA, t) : [0.1, 0.1, 0.1]);
    snakeBody.rim.set(mixc([0.1, 0.05, 0.05], [0.5, 0.5, 0.9], t));
    snakeBody.color.set(mixc([0.08, 0.05, 0.04], [0.1, 0.1, 0.2], t));
    dot.emissive.set(mixc(PINK, GOLD, t));
    dot.rim.set(mixc([0.3, 0.2, 0.2], [0.4, 0.25, 0.05], t));
    daisy.emissive.set(alive ? mixc(DAISY0, [1, 0.55, 0.95], t) : deadInk(t, 1.25));
    daisyC.emissive.set(alive ? mixc(HEART0, [0.8, 1, 1], t) : deadInk(t, 1.25));
    styleProps(t, b, p, acc);
    return F;
  }

  // scenery materials: screen-print inks -> neon glass (wild: beat and punch live out here)
  function styleProps(t, b, p, acc) {
    const glow = t * (0.55 + 0.6 * b) + 0.5 * p;
    const ink = (m, c0, c1, k1 = 1) => m.emissive.set(scl(mixc(c0, c1, t), (1 + 0.25 * b * (1 - t)) * (t > 0 ? lerp(1, k1 * (0.8 + 0.5 * b), t) : 1) + 0.6 * p));
    M.arch.color.set(stripeTex ? mixc([1, 1, 1], [0.3, 0.07, 0.4], t) : mixc(ORANGE, [0.25, 0.04, 0.32], t));
    M.arch.emissive.set(scl(mixc([0, 0, 0], [0.1, 0.0, 0.16], t), 1 + 1.2 * b + 2 * p));
    M.arch.lines = t > 0.05 ? 1 : 0; M.arch.lineColor.set(scl(acc, 1.4 * t)); M.arch.lineWidth = 0.05;
    M.arch.rim.set(mixc([0.2, 0.08, 0.05], scl(MAGENTA, 0.9), t));
    M.post.color.set(stripeTex ? scl([1, 1, 1], lerp(1, 0.25, t)) : mixc(PLUM, [0.2, 0.05, 0.25], t));
    M.post.emissive.set(scl(acc, glow * 0.6));
    ink(M.rail, ORANGE, acc, 1.3); ink(M.rail2, PLUM, MAGENTA, 1.2);
    ink(M.stem, [0.3, 0.36, 0.08], [0.05, 0.45, 0.5]);
    M.stem.chrome = M.petA.chrome = M.petB.chrome = M.petC.chrome = M.inner.chrome = 0.5 * t;
    ink(M.petA, ORANGE, MAGENTA, 1.2); ink(M.petB, TEAL, VIOLET, 1.2); ink(M.petC, MUSTARD, acc, 1.1);
    for (const m of [M.petA, M.petB, M.petC]) m.rim.set(mixc([0.3, 0.15, 0.05], [1, 0.85, 1], t));
    ink(M.inner, PLUM, YELLOW, 1.2); ink(M.core, CREAM, [1, 1, 0.8], 1.4);
    ink(M.mstem, [0.55, 0.5, 0.38], [0.3, 0.15, 0.6]);
    M.capP.color.set(stripeTex ? [1, 1, 1] : ORANGE); M.capP.emissive.set(scl(ORANGE, 0.1 * b + 0.4 * p));
    M.capN.emissive.set(scl(MAGENTA, 0.25 + 0.4 * b + 0.5 * p)); M.capN.rim.set(acc);
    M.domeP.emissive.set(scl(MUSTARD, 0.1 * b + 0.4 * p));
    M.domeN.emissive.set(scl(YELLOW, 0.15 + 0.35 * b + 0.5 * p)); M.domeN.rim.set(scl(MAGENTA, 1.2));
    ink(M.verge, CREAM, [1, 0.45, 0.9]); ink(M.vergeC, ORANGE, acc);
  }

  // every absolute lane row Y = off (mod P) whose world z lies in the prop range; fn(Y, z, grow), where
  // grow eases 0 -> 1 over FADE units at each open end so props bloom in instead of popping
  const hd = kit.rows / 2 - 0.5;
  const ss = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  function slots(d, P, off, fn) {
    const S = d.scroll, pov = d.view === 'pov', zn = pov ? Z_NEAR_POV : Z_NEAR_BOARD;
    const k0 = Math.ceil((S + Z_FAR + hd - off) / P), k1 = Math.floor((S + zn + hd - off) / P);
    for (let k = k0; k <= k1; k++) {
      const Y = k * P + off, z = d.laneZ(Y);
      const grow = ss(Z_FAR, Z_FAR + FADE, z) * (pov ? ss(zn, zn - FADE, z) : 1);
      if (grow > 0.001) fn(Y, z, grow);
    }
  }
  // origin of a merged run that repeats every P rows: its first element sits just inside RUN_NEAR
  const runZ = (d, P) => d.laneZ(Math.floor((d.scroll + RUN_NEAR + hd) / P) * P);

  function props(d) {
    const fx = d.fx, t = st.t, b = st.beat, p = st.punch, time = fx.time, still = fx.reducedMotion, mir = d.mirror;
    // rails on the lethal edges: striped posts and two long bars
    const zp = runZ(d, P_POST);
    for (const s of [-1, 1]) {
      d.mesh('lane:posts', d.trs(s * RAIL_X, 0, zp, 0, 1, 1, 1), M.post);
      d.mesh('box', d.trs(s * RAIL_X, 0.5, 0, 0, 0.18, 0.13, 1200), M.rail);
      d.mesh('box', d.trs(s * RAIL_X, 0.2, 0, 0, 0.1, 0.08, 1200), M.rail2);
    }
    // verge of little flowers between rail and arcade
    const zv = runZ(d, P_VERGE);
    for (const s of [-1, 1]) {
      const sv = still ? 1 : 1 + 0.12 * b;
      d.mesh('lane:verge', d.trs(s * 9.9, 0, zv, 0, sv, sv, 1), M.verge);
      d.mesh('lane:vergeC', d.trs(s * 9.9, 0, zv, 0, sv, sv, 1), M.vergeC);
    }
    // the arcade: swirl-striped arches on both sides
    for (const s of [-1, 1]) slots(d, P_ARC, s > 0 ? 0 : 3, (Y, z, g) => {
      if (mir && z < -90) return;
      d.mesh('lane:arch', d.trs(s * ARC_X, 0, z, 0, 1, g * (1 + 0.03 * p), 1), M.arch);
    });
    // toadstools inside the arcade, between the arches
    const cap = t < 0.5 ? M.capP : M.capN;
    for (const s of [-1, 1]) slots(d, P_MUSH, s > 0 ? 3 : 9, (Y, z, g) => {
      if (mir && z < -90) return;
      const h = hash(Y * 0.61 + s * 3.3), x = s * (ARC_X + (h - 0.5) * 3);
      const H = (1.4 + 1.6 * h) * g, R = (1.0 + 0.8 * hash(Y * 1.7 + s)) * g, pump = 1 + (still ? 0 : 0.06 * b + 0.12 * p);
      d.mesh('cylinder', d.trs(x, 0, z, 0, 0.5 * R, H, 0.5 * R), M.mstem);
      d.mesh('sphere', d.trs(x, H, z, still ? 0 : time * 0.2 * (h - 0.5), 2 * R * pump, 1.1 * R * pump, 2 * R * pump), cap);
    });
    // giant flowers outside the arcade, faces turned toward the lane
    const pets = [M.petA, M.petB, M.petC];
    for (const s of [-1, 1]) slots(d, P_FLOW, s > 0 ? 5 : 0, (Y, z, g) => {
      if (mir && z < -80) return;
      const h1 = hash(Y * 0.37 + s * 1.7), h2 = hash(Y * 1.13 + s * 0.3), h3 = hash(Y * 2.71 - s);
      const x = s * (23 + 7 * h1), H = (8 + 7 * h2) * g, k = (2.6 + 1.8 * h3) * g;
      const sway = still ? 0 : 0.06 * Math.sin(time * 0.7 + Y);
      const breathe = still ? 1 : 1 + 0.07 * Math.sin(time * 1.3 + Y * 0.5) + 0.1 * b + 0.18 * p;
      d.mesh('lane:stem', d.trs(x, 0, z, 0, k * 2.2, H, k * 2.2), M.stem);
      const phi = Math.atan2(-s, 0.45), tilt = 0.55 + sway, hx = x + 0.09 * k * 2.2 * Math.sin(6.9) , hy = H;
      const pm = pets[Math.floor(h3 * 3) % 3];
      d.mesh('lane:petals', d.euler(hx, hy, z, tilt, phi, 0, k * breathe, k * breathe, k * breathe), pm);
      d.mesh('lane:petals2', d.euler(hx, hy, z, tilt, phi, 0, k * 0.9, k * 0.9 * breathe, k * 0.9), M.inner);
      d.mesh('sphere', d.euler(hx, hy + 0.1 * k, z, tilt, phi, 0, 0.75 * k, 0.4 * k, 0.75 * k), M.core);
    });
    // striped domes far out (checker domes in neon); not mirrored (they are half spheres)
    if (!mir) {
      const dome = t < 0.5 ? M.domeP : M.domeN;
      for (const s of [-1, 1]) slots(d, P_DOME, s > 0 ? 18 : 0, (Y, z, g) => {
        const h = hash(Y * 0.91 + s * 5.1), R = (6 + 4 * h) * g;
        d.mesh('sphere', d.trs(s * (40 + 10 * h), 0, z, still ? 0 : time * 0.05 * s, R * 2, R * (1.3 + 0.6 * h), R * 2), dome);
      });
    }
  }

  // where the dot lies ahead of the window (lane space, food off the board), else null
  const AHEAD = [0, 0];
  function dotAhead(d) {
    const s = d.snap, fa = s && s.foodAt;
    if (!d.lane || !fa || s.food || !Number.isFinite(fa.x) || !Number.isFinite(fa.y)) return null;
    const z = d.laneZ(fa.y);
    if (z > -kit.rows / 2 - 1.2) return null; // only beyond the far edge: the flag then never covers the board
    AHEAD[0] = d.cellToWorld(fa.x, 0)[0]; AHEAD[1] = z;
    return AHEAD;
  }
  const flagPole = material({ color: [0.1, 0.03, 0.08], emissive: PLUM });
  function items(d) {
    const fx = d.fx, g = d.segs, t = st.t;
    // a daisy printed on every third body block (moves with the smoothed segments)
    const top = 0.004 + F.snake.bodySize[1] + 0.006;
    for (let i = 2; i < g.n; i += 3) {
      d.mesh('lane:daisy', d.trs(g.x[i], top, g.z[i], i * 0.9, 1, 1, 1), daisy);
      d.mesh('cylinder', d.trs(g.x[i], top, g.z[i], 0, 0.3, 0.03, 0.3), daisyC);
    }
    // the dot far ahead: a flower flag on a pole, easy to spot down the lane
    const a = dotAhead(d);
    if (a) {
      const bob = 0, k = 1 + 0.12 * Math.sin(fx.time * 6) * (fx.reducedMotion ? 0 : 1);
      flagPole.emissive.set(mixc(PLUM, VIOLET, t));
      d.mesh('cylinder', d.trs(a[0], 0, a[1], 0, 0.1, 2.5 + bob, 0.1), flagPole);
      const ry = Math.atan2(d.eye[0] - a[0], d.eye[2] - a[1]);
      d.mesh('lane:petals', d.euler(a[0], 2.2 + bob, a[1], Math.PI / 2 - 0.3, ry, 0, 0.62 * k, 0.62 * k, 0.62 * k), dot);
      d.mesh('sphere', d.euler(a[0], 2.2 + bob, a[1], Math.PI / 2 - 0.3, ry, 0, 1.0 * k, 0.1, 1.0 * k), dot);
      d.mesh('sphere', d.euler(a[0], 2.2 + bob, a[1], Math.PI / 2 - 0.3, ry, 0, 0.42, 0.24, 0.42), daisyC);
    }
  }

  const BUBBLES = Array.from({ length: 14 }, (_, i) => [hash(i * 3.1), hash(i * 7.3 + 1), hash(i * 1.7 + 2)]);
  function glows(d) {
    const fx = d.fx, t = st.t, b = st.beat, p = st.punch, time = fx.time, still = fx.reducedMotion, acc = st.acc;
    const a = dotAhead(d);
    if (a) { // beacon over the far dot (beyond the board, never over it)
      const pulse = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 6);
      const bc = st.beacon;
      let bx = a[0] - d.eye[0], bz = a[1] - d.eye[2];
      const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      d.billboard(a[0] + bx * 0.8, 0, a[1] + bz * 0.8, 1.2, 10, bc, 3, (0.9 + 0.8 * t) * (0.8 + 0.4 * pulse));
      d.billboard(a[0] + bx * 0.8, 0.2, a[1] + bz * 0.8, 4.5, 4.5, bc, 0, (0.5 + 1.1 * t) * (0.7 + 0.5 * pulse));
      d.ring(a[0], a[1], 5, bc, 1 + t, 0.45 + 0.4 * pulse, 0.1);
    }
    if (t > 0.02) {
      // halos on the giant flowers and glowing rails
      for (const s of [-1, 1]) slots(d, P_FLOW, s > 0 ? 5 : 0, (Y, z, g) => {
        if (Math.abs(z) > 120) return;
        const h1 = hash(Y * 0.37 + s * 1.7), h2 = hash(Y * 1.13 + s * 0.3), h3 = hash(Y * 2.71 - s);
        const x = s * (23 + 7 * h1), H = (8 + 7 * h2) * g, k = (2.6 + 1.8 * h3) * g;
        d.billboard(x, H - k * 0.8, z, k * 4, k * 4, h3 > 0.5 ? MAGENTA : acc, 0, t * (0.35 + 0.6 * b + 0.8 * p));
      });
      for (const s of [-1, 1]) d.beam(s * RAIL_X, 0.56, d.view === 'pov' ? Z_NEAR_POV : Z_NEAR_BOARD, s * RAIL_X, 0.56, Z_FAR, 0.06, acc, t * (0.7 + 0.7 * b), 0.5, 0.5);
      // bubbles rising beyond the rails
      for (const [h1, h2, h3] of BUBBLES) {
        // anchored to lane rows (they slide past with the strip), faded where the loop wraps
        const s = h1 > 0.5 ? 1 : -1, x = s * (12 + 20 * h2);
        const y = still ? 3 + 10 * h3 : ((time * (0.6 + h3) + h2 * 20) % 18) + 1;
        const zf = (((h3 * 180 - d.scroll) % 180) + 180) % 180, z = zf - 160;
        const k = ss(0, 20, zf) * ss(180, 160, zf) * (still ? 1 : ss(19, 14, y));
        d.billboard(x, y, z, 1.6 + 2 * h2, 1.6 + 2 * h2, h2 > 0.5 ? CYAN : MAGENTA, 1, k * t * (0.8 + 0.6 * b), 0.8, 0.12);
      }
    }
    // bite: ink burst on both sides of the lane
    if (p > 0.02) for (const s of [-1, 1]) d.billboard(s * 30, 2, -30, 40, 26, mixc(ORANGE, acc, t), 0, p * (0.5 + 0.5 * t));
  }

  return { frame, props, items, glows };
}

// ───────────────────────────── life icon ─────────────────────────────
// A flower disc. Filled = printed daisy (eight ink petals, cream centre ring, orange heart), neon as
// chaos rises; hollow = the petals' outline only. (x, y) is the top-left of a size x size slot.
export function life(ctx, x, y, size, filled, fx) {
  const t = tone(fx && fx.chaos), cx = x + size / 2, cy = y + size / 2, R = size * 0.46;
  const petal = css(mixc(ORANGE, MAGENTA, t)), edge = css(mixc(PLUM, CYAN, t)), heart = css(mixc(MUSTARD, YELLOW, t));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, size * 0.07);
  const petals = () => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, px = cx + Math.cos(a) * R * 0.55, py = cy + Math.sin(a) * R * 0.55;
      ctx.moveTo(px + Math.cos(a) * R * 0.45, py + Math.sin(a) * R * 0.45);
      ctx.ellipse(px, py, R * 0.45, R * 0.24, a, 0, Math.PI * 2);
    }
  };
  if (filled) {
    if (t > 0.3) { ctx.shadowColor = petal; ctx.shadowBlur = size * 0.3 * t; }
    ctx.fillStyle = petal; petals(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = edge; ctx.stroke();
    ctx.fillStyle = css(CREAM); ctx.beginPath(); ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = heart; ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = edge; ctx.setLineDash([size * 0.08, size * 0.06]); petals(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
