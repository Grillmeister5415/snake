// RED IRON HANGAR, 1957 — room for the universe `hangar` (stream hangar, LEVELS_PLAN 6).
// A vast concrete hangar in amber haze: arched window walls, pilasters, gantry crane runways with
// two travelling bridges (one carries a swinging tank on chains), pipes, valve wheels, pendant lamps,
// light shafts, smoke, a wet floor with puddles and painted safety stripes, and boxy tanks of our own
// invention (no markings) parked outside the board. A red iron rail runs beside the lethal edges.
// Two styles: chaos 0 = sepia amber; chaos 1 = the same hall with red lamps, a cyan floor and vault
// grid and neon edges on every machine (accent colour steps with fx.variant).
// Snake = riveted brass plates, head = arrow plate, dot = red lamp sphere with a white core. The board
// keeps fixed colours (no beat in there). Interface: see the top of court.js. Extra export: life().

export const meta = {
  id: 'hangar',
  name: 'RED IRON HANGAR',
  year: '1957',
  luma: 0.2,
  veil: '#3a2410',
  weight: 3,
  hud: { fg: '#ffdca6', bg: 'rgba(26,14,6,0.8)', accent: '#ff4a1a', panelFg: '#ffe9c4', panelBg: 'rgba(32,16,6,0.9)' },
};

export const glsl = {
  sky: /* glsl */ `
// uPal: 2 haze, 3 vault concrete, 4 window light, 5 neon accent, 6 red lamp, 7 floor concrete
// uRoom[0] tone(chaos), beat, punch, -; uRoom[1] floor grid, ripple, base gloss, vault red lamps
float hnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 roomSky(vec3 d) {
  float y = d.y;
  if (y < 0.0) return uPal[7] * 0.35 + uPal[2] * exp(y * 5.0) * 0.6;
  // barrel vault seen from below: a long skylight down the middle, ribs across
  vec2 c = d.xz / max(y, 0.02);
  float far = length(c);
  float strip = 1.0 - smoothstep(0.35, 0.62, abs(c.x));
  vec2 q = vec2(c.x * 4.0, c.y * 1.1);
  float mull = gridAA(q, 0.07, aaWidth(q));
  float rib = smoothstep(0.36, 0.46, abs(fract(c.y * 0.35) - 0.5));
  float glass = strip * (1.0 - 0.75 * mull) * (1.0 - rib);
  vec3 col = uPal[3] * (0.65 + 0.55 * hnoise(c * 1.5)) + uPal[3] * rib * 0.5;
  col = mix(col, uPal[4], glass * exp(-far * 0.07));
  vec2 lp = vec2(abs(c.x) - 1.4, fract(c.y * 0.3) - 0.5);
  col += uPal[6] * exp(-dot(lp, lp) * 120.0) * uRoom[1].w * exp(-far * 0.05);
  vec2 gq = c * 0.8;
  col += uPal[5] * gridAA(gq, 0.03, aaWidth(gq)) * uRoom[0].x * 0.55 * exp(-far * 0.06);
  col = mix(col, uPal[2], exp(-y * 3.0) * 0.9);
  col += uPal[2] * exp(-y * 16.0) * (0.5 + 0.3 * uRoom[0].y);
  col += uPal[4] * uRoom[0].z * 0.12;
  return col;
}
`,
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  vec2 w = aaWidth(p);
  float slab = gridAA(p * 0.25, 0.012, w * 0.25);
  float tone = hnoise(p * 0.5) * 0.5 + hnoise(p * 2.3) * 0.3 + hnoise(p * 9.0) * 0.12;
  vec3 col = uPal[7] * (0.5 + tone);
  col *= 1.0 - 0.6 * slab;
  col *= 1.0 - 0.45 * smoothstep(0.62, 0.8, hnoise(p * 0.21 + 7.3));      // oil stains
  // puddles: mirror-glossy, rippling harder on a bite
  float pud = smoothstep(0.42, 0.6, hnoise(p * 0.14 + 3.1) * 0.7 + hnoise(p * 0.6 - 1.7) * 0.3);
  vec2 rp = p * 1.6 + vec2(0.0, uTime * 0.4);
  float n0 = hnoise(rp);
  n.xz += vec2(hnoise(rp + vec2(0.37, 0.0)) - n0, hnoise(rp + vec2(0.0, 0.37)) - n0) * uRoom[1].y * pud;
  col *= mix(1.0, 0.4, pud);
  gloss = mix(0.3 * uRoom[1].z, 0.95, pud);
  // painted safety stripe around the board: amber/black hatching -> neon accent
  float sd = max(abs(p.x) - uBoard.x, abs(p.y) - uBoard.y);
  float band = smoothstep(1.0, 1.06, sd) * (1.0 - smoothstep(1.6, 1.66, sd));
  float hatch = step(0.5, fract((p.x + p.y) * 0.9));
  vec3 paint = mix(vec3(0.62, 0.42, 0.08), uPal[5] * 1.4, uRoom[0].x);
  col = mix(col, mix(paint, col * 0.3, hatch), band * 0.85);
  // neon: cyan floor grid on the cell lines, pulsing on the beat
  float g = gridAA(p, 0.025, w);
  col += uPal[5] * g * uRoom[1].x * exp(-max(dist - 18.0, 0.0) * 0.02);
  // red lamp light leaking onto the wet floor near the walls
  col += uPal[6] * uRoom[1].w * 0.08 * (0.5 + pud) * smoothstep(14.0, 24.0, abs(p.x));
  return col;
}
`,
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const tone = (ch) => { const x = clamp((num(ch) - 0.12) / 0.78, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
function setRGB(arr, i, c, k = 1) { arr[i * 3] = c[0] * k; arr[i * 3 + 1] = c[1] * k; arr[i * 3 + 2] = c[2] * k; }
function setMix(arr, i, a, b, t, k = 1) { for (let j = 0; j < 3; j++) arr[i * 3 + j] = lerp(a[j], b[j], t) * k; }
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const ACCENT = [[0.1, 0.88, 1.0], [1.0, 0.17, 0.84], [0.62, 1.0, 0.22], [1.0, 0.62, 0.1]];
const RED = [1, 0.07, 0.05];
const AMBER = [1, 0.62, 0.24];
const BRASS = [0.62, 0.44, 0.16];
const BRASS_HEAD = [0.86, 0.6, 0.22];
const IRON = [0.24, 0.21, 0.19];

// Swap two axes of a generated mesh (a cylinder lying along x or z). Culling is off, so the flipped
// winding does no harm; normals are swapped the same way.
function swapAxes(geo, a, b) {
  const pos = geo.pos.slice(), nrm = geo.nrm.slice();
  for (let i = 0; i < pos.length; i += 3) {
    let v = pos[i + a]; pos[i + a] = pos[i + b]; pos[i + b] = v;
    v = nrm[i + a]; nrm[i + a] = nrm[i + b]; nrm[i + b] = v;
  }
  return { ...geo, pos, nrm, uv: geo.uv.slice(), idx: geo.idx.slice() };
}

// Invented tank: hull (tracks, wheels, decks) and a separate turret so turrets can traverse.
function hullGeo(G) {
  const wheel = swapAxes(G.cylinder(14), 0, 1);
  const parts = [
    { g: G.box(), t: [-1.36, 0.1, 0], s: [0.72, 0.9, 6.3] },
    { g: G.box(), t: [1.36, 0.1, 0], s: [0.72, 0.9, 6.3] },
    { g: G.box(), t: [-1.36, 0.34, 3.32], s: [0.72, 0.56, 0.5] },
    { g: G.box(), t: [1.36, 0.34, 3.32], s: [0.72, 0.56, 0.5] },
    { g: G.box(), t: [-1.36, 0.34, -3.32], s: [0.72, 0.56, 0.5] },
    { g: G.box(), t: [1.36, 0.34, -3.32], s: [0.72, 0.56, 0.5] },
    { g: G.box(), t: [0, 0.5, -0.1], s: [2.1, 0.92, 6.1] },
    { g: G.box(), t: [0, 1.0, 0], s: [3.5, 0.12, 6.6] },
    { g: G.box(), t: [0, 0.55, 3.2], s: [2.1, 0.58, 0.7] },
    { g: G.box(), t: [0, 1.12, -2.6], s: [2.6, 0.22, 1.2] },
    { g: G.box(), t: [-0.75, 1.12, -3.0], s: [0.5, 0.36, 0.45] },
    { g: G.box(), t: [0.75, 1.12, -3.0], s: [0.5, 0.36, 0.45] },
    { g: G.box(), t: [-1.2, 1.12, 2.4], s: [0.7, 0.3, 1.1] },
    { g: G.box(), t: [1.2, 1.12, 2.4], s: [0.7, 0.3, 1.1] },
  ];
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) parts.push({ g: wheel, t: [sx * 1.72 - 0.07, 0.5, -2.6 + k * 1.04], s: [0.14, 0.86, 0.86] });
  return G.merge(parts);
}
function turretGeo(G) {
  const barrel = swapAxes(G.cylinder(12), 1, 2);
  return G.merge([
    { g: G.box(), t: [0, 0, 0], s: [2.0, 0.72, 2.6] },
    { g: G.box(), t: [0, 0.72, -0.2], s: [1.5, 0.26, 1.8] },
    { g: G.cylinder(12), t: [0.42, 0.98, -0.6], s: [0.6, 0.12, 0.6] },
    { g: G.box(), t: [0, 0.12, 1.42], s: [0.9, 0.5, 0.36] },
    { g: barrel, t: [0, 0.37, 1.55], s: [0.24, 0.24, 3.6] },
    { g: G.box(), t: [0, 0.19, 5.1], s: [0.38, 0.36, 0.5] },
    { g: G.box(), t: [0, 0.2, -1.55], s: [1.6, 0.4, 0.5] },
  ]);
}
// Brass plate with four domed rivets, for the snake body.
function plateGeo(G) {
  const parts = [{ g: G.box(), t: [0, 0, 0], s: [1, 0.72, 1] }];
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) parts.push({ g: G.sphere(8, 6, 0), t: [x, 0.72, z], s: [0.16, 0.5, 0.16] });
  return G.merge(parts);
}

// the front wall stays behind the board camera even on very tall phones (eye z ~ 35 at aspect 0.35)
const HX = 26, WALL_H = 32, ZB = -112, ZF = 50, LEN = ZF - ZB, ZMID = (ZF + ZB) / 2, RUN_Y = 21;
const COL_Z = [];
for (let z = ZF - 10; z > ZB; z -= 12) COL_Z.push(z);

// rail beside the lethal edges: posts and two bars, outside the board (|x| > 8.5 or z < -8.5)
function railGeo(G, hw, hd) {
  const parts = [], X = hw + 0.95, Z = -hd - 0.95;
  for (let z = hd; z >= -hd; z -= 2) for (const s of [-1, 1]) parts.push({ g: G.box(), t: [s * X, 0, z], s: [0.2, 0.82, 0.2] });
  for (let x = -hw + 1; x <= hw - 1; x += 2) parts.push({ g: G.box(), t: [x, 0, Z], s: [0.2, 0.82, 0.2] });
  for (const s of [-1, 1]) for (const y of [0.3, 0.66]) parts.push({ g: G.box(), t: [s * X, y, (hd + Z) / 2], s: [0.12, 0.12, hd - Z] });
  for (const y of [0.3, 0.66]) parts.push({ g: G.box(), t: [0, y, Z], s: [2 * X, 0.12, 0.12] });
  return G.merge(parts);
}
function crateGeo(G) {
  const parts = [], drum = G.cylinder(14);
  for (let i = 0; i < 18; i++) {
    const s = i < 9 ? -1 : 1, z = 18 - (i % 9) * 12.5 - hash(i * 3.1) * 4, x = s * (HX - 4.2 - hash(i * 5.3) * 2.2);
    const w = 1.4 + hash(i) * 1.2;
    parts.push({ g: G.box(), t: [x, 0, z], s: [w, w * 0.8, w] });
    if (hash(i * 7.7) > 0.4) parts.push({ g: G.box(), t: [x + 0.2, w * 0.8, z - 0.2], s: [w * 0.7, w * 0.6, w * 0.7] });
    for (let k = 0; k < 3; k++) parts.push({ g: drum, t: [x - s * 1.9, 0, z + 1.6 + k * 1.05], s: [0.9, 1.25, 0.9] });
  }
  return G.merge(parts);
}

// The hall wall: plaster and brick with one tall arched factory window per tile.
function wallCanvas(kit) {
  const c = kit.canvas(512, 512);
  const x = c && c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#4e4034'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${20 + hash(i) * 70 | 0},${16 + hash(i + 1) * 50 | 0},${10 + hash(i + 2) * 30 | 0},0.18)`; x.fillRect(hash(i * 3.3) * 512, hash(i * 5.7) * 512, 6 + hash(i * 2) * 26, 3 + hash(i * 4) * 8); }
  x.strokeStyle = 'rgba(20,14,8,0.35)'; x.lineWidth = 1;
  for (let y = 0; y < 512; y += 16) { x.beginPath(); x.moveTo(0, y + 0.5); x.lineTo(512, y + 0.5); x.stroke(); }
  // pilaster shadows at the tile edges
  let g = x.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.12, 'rgba(0,0,0,0)'); g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  // arched window (texture y runs top -> bottom; v=1 is the top of the wall)
  const win = new Path2D();
  win.moveTo(110, 470); win.lineTo(110, 200); win.arc(256, 200, 146, Math.PI, 0); win.lineTo(402, 470); win.closePath();
  g = x.createLinearGradient(0, 54, 0, 470);
  g.addColorStop(0, '#fff6dc'); g.addColorStop(0.55, '#ffd590'); g.addColorStop(1, '#b8752e');
  x.fillStyle = g; x.fill(win);
  x.save(); x.clip(win);
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(40,24,10,${0.25 + hash(i * 9.1) * 0.5})`; x.fillRect(110 + Math.floor(hash(i * 2.3) * 7) * 42, 54 + Math.floor(hash(i * 6.1) * 9) * 46, 42, 46); }
  x.strokeStyle = '#1d150d'; x.lineWidth = 6;
  for (let xx = 110; xx <= 402; xx += 42) { x.beginPath(); x.moveTo(xx, 40); x.lineTo(xx, 470); x.stroke(); }
  for (let yy = 54; yy <= 470; yy += 46) { x.beginPath(); x.moveTo(100, yy); x.lineTo(412, yy); x.stroke(); }
  x.restore();
  x.strokeStyle = '#2a1f15'; x.lineWidth = 12; x.stroke(win);
  x.fillStyle = '#5c4c3e'; x.fillRect(96, 470, 320, 16);
  return c;
}

export function create(kit) {
  const { material, cols, rows } = kit;
  const G = kit.geometry;
  const hw = cols / 2, hd = rows / 2;

  kit.addGeometry('hangar:hull', hullGeo(G));
  kit.addGeometry('hangar:turret', turretGeo(G));
  kit.addGeometry('hangar:plate', plateGeo(G));
  kit.addGeometry('hangar:rail', railGeo(G, hw, hd));
  kit.addGeometry('hangar:crates', crateGeo(G));

  const wallCv = wallCanvas(kit), wallTex = wallCv ? kit.texture(wallCv, { repeat: true }) : null;
  const concCv = kit.concreteSheet ? kit.concreteSheet({ seed: 57, base: '#6a5a48' }) : null;
  const concTex = concCv ? kit.texture(concCv, { repeat: true }) : null;
  const tex = (o, t) => material({ ...o, mode: t ? 2 : 0, tex: t });

  const M = {
    wall: tex({ color: [0.95, 0.88, 0.8], uvScale: [LEN / 12, 1], lines: 0, fog: 0.5 }, wallTex),
    back: tex({ color: [0.95, 0.88, 0.8], uvScale: [(2 * HX) / 12, 1], fog: 0.5 }, wallTex),
    column: tex({ color: [0.62, 0.55, 0.48], uvScale: [1, 4], lines: 1, lineWidth: 0.02, lineColor: [0.05, 0.03, 0.02] }, concTex),
    steel: material({ color: [0.24, 0.17, 0.1], chrome: 0.25, lines: 1, lineWidth: 0.03, lineColor: [0.08, 0.05, 0.02] }),
    crane: material({ color: [0.55, 0.4, 0.12], chrome: 0.15, lines: 3, lineWidth: 0.05, lineColor: [0.12, 0.07, 0.02] }),
    tank: material({ color: [0.36, 0.33, 0.21], chrome: 0.12, lines: 1, lineWidth: 0.025, lineColor: [0.08, 0.07, 0.04], rim: [0.25, 0.16, 0.06] }),
    hang: material({ color: [0.4, 0.3, 0.16], chrome: 0.2, lines: 1, lineWidth: 0.025, lineColor: [0.08, 0.05, 0.02], rim: [0.3, 0.18, 0.06] }),
    chain: material({ color: [0.18, 0.15, 0.12], chrome: 0.5 }),
    pipeRust: material({ color: [0.46, 0.14, 0.07], chrome: 0.35, lines: 8, lineWidth: 0.01, lineColor: [0.15, 0.04, 0.02] }),
    pipeOchre: material({ color: [0.5, 0.36, 0.13], chrome: 0.35 }),
    pipeSteel: material({ color: [0.3, 0.28, 0.25], chrome: 0.6 }),
    valve: material({ color: [0.6, 0.06, 0.03], emissive: [0.1, 0, 0] }),
    rail: material({ color: [0.5, 0.07, 0.04], chrome: 0.4, emissive: [0.12, 0.01, 0] }),
    crates: material({ color: [0.36, 0.27, 0.15], lines: 1, lineWidth: 0.04, lineColor: [0.1, 0.06, 0.02], fog: 0.6 }),
    shade: material({ color: [0.2, 0.17, 0.1], chrome: 0.4, rim: [0.4, 0.25, 0.08] }),
    bulb: material({ color: [0, 0, 0], emissive: [1.4, 0.95, 0.5] }),
    beacon: material({ color: [0.1, 0.02, 0.02], emissive: [0.3, 0.02, 0.02] }),
  };
  if (!wallTex) { M.wall.color.set([0.22, 0.17, 0.12]); M.back.color.set([0.22, 0.17, 0.12]); }
  const NEON_MATS = ['column', 'steel', 'crane', 'tank', 'hang', 'rail', 'crates'];
  const BASE_LINE = {};
  for (const k of NEON_MATS) BASE_LINE[k] = Array.from(M[k].lineColor || [0, 0, 0]);
  const BASE_LINES = {};
  for (const k of NEON_MATS) BASE_LINES[k] = M[k].lines || 0;

  // ---- snake: brass plates; head = arrow plate; dot = red lamp (white core in glows) ----
  const snakeBody = material({ color: [0, 0, 0], emissive: BRASS, lines: 1, lineWidth: 0.07, lineColor: [0.1, 0.06, 0.02], rim: [0.35, 0.24, 0.08] });
  const snakeHead = material({ color: [0, 0, 0], emissive: BRASS_HEAD, lines: 1, lineWidth: 0.06, lineColor: [0.25, 0.15, 0.04], rim: [0.4, 0.3, 0.1] });
  const snakeEye = material({ color: [0, 0, 0], emissive: [0.06, 0.035, 0.015] });
  const dot = material({ color: [0, 0, 0], emissive: [1.0, 0.07, 0.04], rim: [0.6, 0.12, 0.05] });

  const pal = new Float32Array(24);
  const room = new Float32Array(16);
  const F = {
    pal, room,
    board: { panel: [0.035, 0.028, 0.02], grid: [0.5, 0.3, 0.1], frame: [0.7, 0.1, 0.05], lineWidth: 0.024, band: 0.16, gridGlow: 0.3, frameGlow: 0.5 },
    snake: {
      body: snakeBody, head: snakeHead, eye: snakeEye, dot,
      bodyGeom: 'hangar:plate', headGeom: 'head', dotGeom: 'ball',
      bodySize: [0.84, 0.2, 0.84], headSize: [0.9, 0.26, 0.9], dotSize: [0.56, 0.34, 0.56],
      pool: [0.9, 0.55, 0.15], dotPool: [1.8, 0.2, 0.1], poolIntensity: 0.25, dotPoolBeat: 0,
      segment: null,
    },
    ring: [1, 0.6, 0.2], wall: [1, 0.35, 0.1], beacon: [1, 0.12, 0.06], fog: [0.5, 0.31, 0.12],
  };
  const st = { t: 0, vi: 0, acc: ACCENT[0], beat: 0, punch: 0, alive: true };
  F.snake.segment = (i, n, mat) => {
    // fixed tone ramp toward the tail; never the beat
    const k = st.alive ? 1 - 0.3 * (i / Math.max(1, n - 1)) : 1;
    const c = st.alive ? BRASS : IRON;
    mat.emissive[0] = c[0] * k; mat.emissive[1] = c[1] * k; mat.emissive[2] = c[2] * k;
  };

  function frame(fx, snap) {
    const alive = snap.alive !== false;
    const t = tone(fx.chaos), b = fx.beat, p = fx.punch, vi = ((fx.variant % 4) + 4) % 4, acc = ACCENT[vi];
    Object.assign(st, { t, vi, acc, beat: b, punch: p, alive });
    setMix(pal, 0, [0.95, 0.68, 0.4], [0.34, 0.26, 0.55], t, 1 + 0.18 * b + 0.9 * p);
    setMix(pal, 1, [0.22, 0.13, 0.06], [0.06, 0.03, 0.1], t, 1 + 0.3 * p);
    setMix(pal, 2, [0.6, 0.37, 0.14], [0.2, 0.03, 0.1], t, 1 + 0.15 * b + 0.4 * p);
    setMix(pal, 3, [0.12, 0.095, 0.07], [0.015, 0.015, 0.035], t);
    setMix(pal, 4, [1.0, 0.8, 0.52], acc, t, 1 + 0.25 * b + 0.8 * p);
    setRGB(pal, 5, acc);
    setRGB(pal, 6, RED);
    setMix(pal, 7, [0.26, 0.21, 0.16], [0.045, 0.045, 0.06], t);
    room[0] = t; room[1] = b; room[2] = p; room[3] = 0;
    room[4] = t * (0.55 + 0.45 * b);
    room[5] = fx.reducedMotion ? 0.1 : 0.25 + 0.35 * fx.chaos + 0.5 * p;
    room[6] = 1 - 0.3 * t;
    room[7] = t * (0.6 + 0.9 * b);
    const fog = mixc([0.5, 0.31, 0.12], [0.12, 0.02, 0.08], t);
    setRGB(F.fog, 0, fog, 1 + 0.2 * b);

    // board: fixed per chaos level, never on the beat
    const B = F.board;
    B.panel = mixc([0.035, 0.028, 0.02], [0.008, 0.012, 0.03], t);
    B.grid = mixc([0.5, 0.3, 0.1], [acc[0] * 0.8, acc[1] * 0.8, acc[2] * 0.8], t);
    B.frame = mixc([0.72, 0.1, 0.05], [1.2, 0.05, 0.1], t);
    B.gridGlow = lerp(0.3, 0.6, t); B.frameGlow = lerp(0.5, 1.1, t);
    F.ring = mixc([1, 0.6, 0.2], acc, t);
    F.wall = mixc([1, 0.38, 0.1], [1, 0.05, 0.12], t);

    snakeHead.emissive.set(alive ? BRASS_HEAD : [0.3, 0.27, 0.24]);
    snakeHead.lineColor.set(alive ? mixc([0.25, 0.15, 0.04], acc, t) : [0.1, 0.09, 0.08]);
    snakeBody.lineColor.set(alive ? mixc([0.1, 0.06, 0.02], acc, t) : [0.08, 0.07, 0.06]);
    snakeBody.rim.set(alive ? [0.35, 0.24, 0.08] : [0.12, 0.1, 0.08]);

    // neon edges on every machine as chaos rises; accent from fx.variant
    for (const k of NEON_MATS) {
      const m = M[k], base = BASE_LINE[k];
      m.lineColor.set(mixc(base, [acc[0] * 1.6, acc[1] * 1.6, acc[2] * 1.6], t));
      m.lines = BASE_LINES[k] || (t > 0.05 ? 1 : 0);
    }
    M.tank.rim.set(mixc([0.25, 0.16, 0.06], [1.0, 0.1, 0.5], t));
    M.hang.rim.set(mixc([0.3, 0.18, 0.06], [1.0, 0.1, 0.5], t));
    M.rail.emissive.set(mixc([0.12, 0.01, 0], [0.9, 0.02, 0.08], t));
    M.wall.color[0] = M.back.color[0] = 0.95 * (1 + 0.5 * p);
    M.wall.color[1] = M.back.color[1] = lerp(0.88, 0.5, t) * (1 + 0.4 * p);
    M.wall.color[2] = M.back.color[2] = lerp(0.8, 0.9, t) * (1 + 0.4 * p);
    const lamp = mixc(AMBER, RED, t);
    setRGB(M.bulb.emissive, 0, lamp, 1.2 + 0.8 * b * (0.3 + t));
    setRGB(M.beacon.emissive, 0, RED, 0.2 + t * (1.2 + 2 * b));
    M.valve.emissive.set([0.1 + 0.6 * t * b, 0, 0]);
    return F;
  }

  // ---- layout helpers ----
  // tank: hull at (x, z) facing ry (local +z forward), turret traversed by yaw
  function tank(d, x, y, z, ry, yaw, mat, rz = 0) {
    if (rz) d.mesh('hangar:hull', d.euler(x, y, z, 0, ry, rz, 1, 1, 1), mat);
    else d.mesh('hangar:hull', d.trs(x, y, z, ry, 1, 1, 1), mat);
    const oz = -0.6, tx = x + oz * Math.sin(ry), tz = z + oz * Math.cos(ry);
    d.mesh('hangar:turret', d.trs(tx, y + 1.12, tz, ry + yaw, 1, 1, 1), mat);
  }
  // yaw that eases to a new target on every bite
  function traverse(fx, k) {
    const v = fx.variant | 0, a = (hash(v * 3.7 + k) - 0.5) * 1.1, b0 = (hash((v - 1) * 3.7 + k) - 0.5) * 1.1;
    if (fx.reducedMotion) return a;
    const e = clamp(num(fx.biteAge, Infinity) / 700, 0, 1);
    return lerp(b0, a, e * e * (3 - 2 * e));
  }
  function chain(d, x0, y0, z, len, sw) {
    const bx = x0 + Math.sin(sw) * len, by = y0 - Math.cos(sw) * len;
    d.mesh('box', d.euler(bx, by, z, 0, 0, sw, 0.14, len, 0.14), M.chain);
    return [bx, by];
  }

  const CRANES = [-26, -62];
  const SIDE_TANKS = [[-15.5, -16], [-16, -32], [-15.5, -48], [15.5, -20], [16, -36], [15.5, -52], [-16.5, -2], [16.5, -4]];
  const LAMPS = [];
  for (let z = 4; z > ZB + 10; z -= 12) LAMPS.push(z);

  function props(d) {
    const fx = d.fx, t = st.t, still = fx.reducedMotion, time = fx.time;
    // shell: window walls and pilasters
    d.mesh('plane', d.trs(-HX, 0, ZMID, Math.PI / 2, LEN, WALL_H, 1), M.wall);
    d.mesh('plane', d.trs(HX, 0, ZMID, -Math.PI / 2, LEN, WALL_H, 1), M.wall);
    d.mesh('plane', d.trs(0, 0, ZB, 0, 2 * HX, WALL_H, 1), M.back);
    d.mesh('plane', d.trs(0, 0, ZF, Math.PI, 2 * HX, WALL_H, 1), M.back);
    for (const z of COL_Z) for (const s of [-1, 1]) {
      d.mesh('box', d.trs(s * (HX - 0.9), 0, z, 0, 1.8, WALL_H, 1.6), M.column);
      d.mesh('box', d.trs(s * (HX - 2.1), RUN_Y - 1.4, z, 0, 2.2, 1.4, 1.0), M.steel);
      d.mesh('cylinder', d.trs(s * (HX - 2.0), 6, z + 0.9, 0, 0.36, 0.5, 0.36), M.beacon);
    }
    // gantry runways and the two travelling bridges
    for (const s of [-1, 1]) d.mesh('box', d.trs(s * (HX - 2.6), RUN_Y, ZMID, 0, 1.0, 1.4, LEN), M.steel);
    CRANES.forEach((z0, i) => {
      const z = z0 + (still ? 0 : Math.sin(time * 0.11 + i * 2) * 3);
      const span = 2 * (HX - 2.6);
      d.mesh('box', d.trs(0, RUN_Y + 1.4, z, 0, span, 1.6, 1.1), M.crane);
      d.mesh('box', d.trs(0, RUN_Y + 1.4, z - 2.0, 0, span, 1.6, 1.1), M.crane);
      for (const s of [-1, 1]) d.mesh('box', d.trs(s * (HX - 2.6), RUN_Y + 1.2, z - 1, 0, 1.6, 1.2, 4.2), M.crane);
      const tx = still ? (i ? 4 : -6) : Math.sin(time * 0.17 + i * 1.7) * (HX - 9);
      d.mesh('box', d.trs(tx, RUN_Y + 0.5, z - 1, 0, 2.8, 1.1, 2.6), M.steel);
      const sw = still ? 0 : 0.05 * Math.sin(time * 0.9 + i) + 0.14 * st.punch * ((fx.variant & 1) ? 1 : -1) + 0.03 * st.beat;
      if (i === 0) {
        const len = 11 + (still ? 0 : Math.sin(time * 0.3) * 2);
        const [hx, hy] = chain(d, tx - 0.3, RUN_Y + 0.5, z - 1, len, sw);
        chain(d, tx + 0.3, RUN_Y + 0.5, z - 1, len, sw);
        d.mesh('box', d.euler(hx, hy - 1.0, z - 1, 0, 0, sw, 1.0, 1.0, 0.7), M.crane);
        d.mesh('torus', d.euler(hx + Math.sin(sw) * 1.6, hy - 1.7, z - 1, Math.PI / 2, 0, 0, 1.6, 1.6, 4), M.steel);
      } else {
        // a tank hanging in a sling of four chains
        const len = 7, ty = RUN_Y + 0.5 - len - 2.6;
        for (const [ox, oz] of [[-1.3, -2.4], [1.3, -2.4], [-1.3, 2.4], [1.3, 2.4]]) chain(d, tx + ox * 0.4, RUN_Y + 0.5, z - 1 + oz * 0.4, len + 1.2, sw);
        tank(d, tx + Math.sin(sw) * len, ty, z - 1, 0.5 + sw, 0.2, M.hang, sw * 0.6);
      }
    });
    // parked tanks, all outside the board; turrets traverse on every bite
    tank(d, 0, 0, -21.5, 0, traverse(fx, 0) * 0.6, M.tank);
    SIDE_TANKS.forEach(([x, z], i) => tank(d, x, 0, z, x < 0 ? Math.PI / 2 + 0.25 : -Math.PI / 2 - 0.25, traverse(fx, i + 1), M.tank));
    // pipes along both walls, valve wheels
    for (const s of [-1, 1]) {
      d.mesh('cylinder', d.euler(s * (HX - 0.4), 2.6, ZB, Math.PI / 2, 0, 0, 0.7, LEN, 0.7), M.pipeRust);
      d.mesh('cylinder', d.euler(s * (HX - 0.5), 3.6, ZB, Math.PI / 2, 0, 0, 0.45, LEN, 0.45), M.pipeOchre);
      d.mesh('cylinder', d.euler(s * (HX - 0.45), 13.5, ZB, Math.PI / 2, 0, 0, 0.9, LEN, 0.9), M.pipeSteel);
      for (const z of [-6, -30, -54]) {
        const spin = still ? 0 : time * 0.4 + st.punch * 2 + z;
        d.mesh('torus', d.euler(s * (HX - 1.2), 2.6, z, 0, Math.PI / 2, spin, 1.2, 1.2, 4), M.valve);
      }
    }
    d.mesh('cylinder', d.euler(-HX, 9.5, -40, 0, 0, -Math.PI / 2, 0.8, 2 * HX, 0.8), M.pipeOchre);
    // rail beside the lethal edges, crates and drums along the walls
    d.mesh('hangar:rail', d.trs(0, 0, 0, 0, 1, 1, 1), M.rail);
    d.mesh('hangar:crates', d.trs(0, 0, 0, 0, 1, 1, 1), M.crates);
    // pendant lamps (beside and behind the board, never above it)
    for (const z of LAMPS) for (const s of [-1, 1]) {
      const x = s * 12.5;
      d.mesh('box', d.trs(x, 16.8, z, 0, 0.06, RUN_Y - 16.8, 0.06), M.chain);
      d.mesh('cone', d.trs(x, 16, z, 0, 1.6, 0.9, 1.6), M.shade);
      d.mesh('sphere', d.trs(x, 16, z, 0, 0.5, 0.5, 0.5), M.bulb);
    }
  }

  // ---- additive extras ----
  const SMOKE = [
    [0, -40, 46, 14, 0.1], [-9, -30, 22, 9, 0.4], [10, -28, 22, 8, 0.7], [0, -70, 50, 18, 0.9],
    [-17, -6, 12, 8, 0.2], [17, -8, 12, 8, 0.5], [-18, -24, 12, 10, 0.3], [18, -26, 12, 10, 0.8],
  ];
  const SHAFTS = [[-1, -14, 0.55], [-1, -34, 0.6], [-1, -58, 0.5], [1, -24, 0.55], [1, -46, 0.62], [-1, 2, 0.5], [1, -2, 0.5]];
  const core = [1, 0.95, 0.9];

  function glows(d) {
    const fx = d.fx, t = st.t, b = st.beat, p = st.punch, time = fx.time, still = fx.reducedMotion;
    const shaft = mixc([1, 0.72, 0.38], st.acc, t * 0.85);
    // light shafts from the high windows, leaning into the hall (always outside the board)
    const si = (0.26 + 0.12 * b + 0.35 * p) * (1 - 0.35 * t);
    for (const [s, z, k] of SHAFTS) {
      const lean = s * -(0.55 + (still ? 0 : 0.05 * Math.sin(time * 0.2 + z)));
      d.glow('plane', d.euler(s * (HX - 1), WALL_H - 4, z, 0, 0, Math.PI + lean, 5.5, 30, 1), shaft, 0, si * k * 1.6);
    }
    // pendant lamp bulbs and their cones of light
    const lamp = mixc(AMBER, RED, t);
    LAMPS.forEach((z, i) => {
      for (const s of [-1, 1]) {
        const x = s * 12.5, flick = t > 0.5 && !fx.reducedFlash ? ((fx.beatIndex + i + (s > 0 ? 1 : 0)) & 1 ? 1 : 0.35) : 1;
        d.billboard(x, 15.2, z, 2.4, 2.4, lamp, 0, (0.8 + 0.6 * b) * flick);
        d.billboard(x, 15.9, z, 3.2, -15.6, lamp, 3, (0.32 + 0.3 * b + 0.3 * p) * flick);
        d.floorGlow(x, z, 7, lamp, (0.35 + 0.3 * b) * flick);
      }
    });
    // red beacons on the pilasters: turn on and strobe as chaos rises
    if (t > 0.05) {
      COL_Z.forEach((z, i) => {
        for (const s of [-1, 1]) {
          const ph = still ? 1 : 0.5 + 0.5 * Math.sin(time * 5 + i * 1.3 + s);
          d.billboard(s * (HX - 2.0), 5.4, z + 0.9, 2.2, 2.2, RED, 0, t * (0.4 + 0.8 * ph + 1.2 * b));
        }
      });
      // neon edge beams along the crane runways
      for (const s of [-1, 1]) d.beam(s * (HX - 2.1), RUN_Y - 0.05, ZF - 2, s * (HX - 2.1), RUN_Y - 0.05, ZB + 2, 0.05, st.acc, t * (0.7 + 0.6 * b), 0.4, 0.4);
    }
    // haze
    const sm = (0.22 + 0.18 * t + 0.2 * b) * (1 + p);
    const smoke = mixc([0.75, 0.45, 0.18], [0.5, 0.05, 0.3], t);
    for (const [x, z, w, h, seed] of SMOKE) {
      const dx = still ? 0 : Math.sin(time * 0.12 + seed * 9) * 0.9;
      d.glow('plane', d.trs(x + dx, 0, z, 0, w, h, 1), smoke, 5, sm, seed, 0.9);
    }
    d.glow('floorQuad', d.trs(-18, 0.3, 0, 0, 14, 1, 40), smoke, 5, sm * 0.6, 0.71, 1);
    d.glow('floorQuad', d.trs(18, 0.3, 0, 0, 14, 1, 40), smoke, 5, sm * 0.6, 0.52, 1);
    // welding sparks flickering at the hero tank
    if (!still) {
      const fl = hash(Math.floor(time * 24));
      if (fl > 0.35) d.billboard(2.6, 1.0, -18.4, 1.6, 1.6, mixc([1, 0.85, 0.6], [0.6, 1, 1], t), 0, (fl - 0.35) * (2 + 2 * t));
    }
    // bite flash behind the board
    if (p > 0.02) d.billboard(0, -4, -36, 70, 34, mixc([1, 0.7, 0.35], st.acc, t), 0, p * 0.7);
    dotCore(d, fx);
  }

  // White core in front of the red lamp sphere, toward the camera. Steady: the board never strobes.
  function dotCore(d, fx) {
    const food = d.snap && d.snap.food;
    if (!food || !Number.isFinite(food.x) || !Number.isFinite(food.y)) return;
    const [x, z] = d.cellToWorld(food.x, food.y);
    const bob = fx.reducedMotion ? 0 : 0.03 * Math.sin(fx.time * 4.2);
    const y = 0.03 + bob + 0.17;
    let ex = d.eye[0] - x, ey = d.eye[1] - y, ez = d.eye[2] - z;
    const l = Math.hypot(ex, ey, ez) || 1, o = Math.min(0.4, l * 0.5);
    ex = (ex / l) * o; ey = (ey / l) * o; ez = (ez / l) * o;
    d.billboard(x + ex, y + ey - 0.2, z + ez, 0.4, 0.4, core, 0, 1.6);
  }

  return { frame, props, glows };
}

// ───────────────────────────── life icon ─────────────────────────────
// Same rivet as the flat look: filled = domed brass rivet; hollow = an empty rivet hole.
// (x, y) is the top-left corner of a size x size slot. Restores the context state.
export function life(ctx, x, y, size, filled, fx) {
  const t = tone(fx && fx.chaos), cx = x + size / 2, cy = y + size / 2, r = size * 0.36;
  ctx.save();
  if (filled) {
    ctx.fillStyle = 'rgba(20,10,2,0.45)'; ctx.beginPath(); ctx.arc(cx + r * 0.1, cy + r * 0.14, r * 1.04, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.35, '#d9ad55'); gr.addColorStop(1, '#5e4216');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2e2008'; ctx.lineWidth = Math.max(1, size * 0.06); ctx.stroke();
    if (t > 0.3) { ctx.strokeStyle = `rgba(30,190,255,${t * 0.9})`; ctx.lineWidth = Math.max(1, size * 0.05); ctx.beginPath(); ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2); ctx.stroke(); }
  } else {
    ctx.fillStyle = 'rgba(20,10,2,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.fill();
    const c = [lerp(150, 214, t) | 0, lerp(46, 14, t) | 0, lerp(30, 42, t) | 0];
    ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.lineWidth = Math.max(1.2, size * 0.1);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
