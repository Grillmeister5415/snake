// PLASTIC INTERNET, 2001 (rooms-b stream). An endless calm water plane under a blue-violet sky with
// soft clouds and a low sun with lens-flare ghosts; chrome spheres and tori, translucent-looking aqua
// slabs, iridescent pyramids and arches, floating fake interface windows far behind the board, and
// iridescent bubbles that multiply with chaos. Snake = string of chrome beads with a chrome droplet
// head; dot = glossy yellow bead. Interface: see the top of rooms/court.js.
//
// Uniform use:
//   uPal  0 ambient sky, 1 ambient ground, 2 zenith, 3 mid, 4 horizon, 5 cloud light, 6 cloud shade, 7 sun
//   uRoom 0 rgb deep water, w sky hue (accumulated, cycles faster with chaos)
//         1 x ripple amplitude, y wave speed, z punch flash, w cloud drift (accumulated)
//         2 x beat ripple, y sun + flare intensity, z water iridescence, w bite ripple
//         3 rgb shallow aqua near the board, w unused

export const meta = {
  id: 'plastic',
  name: 'PLASTIC INTERNET',
  year: '2001',
  luma: 0.55,
  veil: '#6f7fd8',
  weight: 3,
  hud: { fg: '#ffffff', bg: 'rgba(40,60,150,0.6)', accent: '#ffe14a', panelFg: '#f4fbff', panelBg: 'rgba(46,76,160,0.85)' },
};

export const glsl = {
  sky: /* glsl */ `
float plNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float plFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * plNoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}
const vec3 PL_SUN = vec3(-0.5, 0.105, -0.86);
vec3 plasticAbove(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 col = mix(uPal[4], uPal[3], smoothstep(0.0, 0.22, y));
  col = mix(col, uPal[2], smoothstep(0.18, 0.85, y));
  // soft clouds on a layer overhead
  vec2 cp = d.xz / (y + 0.22) * 0.7 + vec2(uRoom[1].w, uRoom[1].w * 0.35);
  float n = plFbm(cp);
  float cl = smoothstep(0.47, 0.72, n) * smoothstep(0.004, 0.05, y) * (1.0 - smoothstep(0.6, 0.98, y));
  float sh = plNoise(cp * 2.0 + vec2(0.4, 0.7));
  vec3 cc = mix(uPal[6], uPal[5], smoothstep(0.45, 0.85, n + 0.25 - sh * 0.3));
  col = mix(col, cc, cl * 0.9);
  // low sun, halo and flare ghosts strung toward the middle of the view
  vec3 sd = normalize(PL_SUN);
  float sa = max(dot(d, sd), 0.0);
  col += uPal[7] * (pow(sa, 900.0) * 4.0 + pow(sa, 60.0) * 0.45 + pow(sa, 7.0) * 0.14) * uRoom[2].y;
  for (int k = 1; k <= 4; k++) {
    float fk = float(k);
    vec3 gd = normalize(sd + vec3(0.17, -0.012, 0.03) * fk);
    float ga = acos(clamp(dot(d, gd), -1.0, 1.0));
    float rad = 0.012 + 0.012 * mod(fk * 1.7, 2.0);
    float ring = exp(-pow((ga - rad) * 420.0, 2.0)) * 0.5 + exp(-pow(ga / rad, 2.0) * 2.0) * 0.12;
    col += hueRotate(vec3(0.5, 0.9, 1.0), fk * 1.3 + uTime * 0.2) * ring * uRoom[2].y;
  }
  col = mix(col, uPal[4], exp(-y * 40.0) * 0.35);
  return col;
}
vec3 roomSky(vec3 d) {
  vec3 col;
  if (d.y < 0.0) {
    // chrome below the horizon sees the water mirroring the sky
    vec3 m = plasticAbove(vec3(d.x, -d.y, d.z));
    col = mix(uRoom[0].rgb, m, 0.5 + 0.45 * exp(d.y * 5.0));
  } else {
    col = plasticAbove(d);
  }
  col = hueRotate(col, uRoom[0].w);
  col += vec3(1.0, 0.94, 1.0) * uRoom[1].z * 0.4;
  return col;
}
`,
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  float fade = 1.0 / (1.0 + dist * 0.05);
  float t = uTime * uRoom[1].y;
  vec2 g = vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.3 + t * 1.6);
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 2.3 + t * 2.1) * 0.6;
  g += vec2(0.95, -0.31) * cos(dot(p, vec2(0.95, -0.31)) * 3.7 + t * 2.9) * 0.35;
  g *= uRoom[1].x;
  // a square ripple leaves the board on every beat
  vec2 e = abs(p) - uBoard;
  float r = max(e.x, e.y);
  vec2 dir = e.x > e.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y));
  float wv = r - (1.0 - uBeat) * 10.0;
  g += dir * sin(wv * 2.6) * exp(-wv * wv * 0.2) * uBeat * uRoom[2].x;
  // round ripple racing out from the last bite
  vec2 bv = p - uBite.xy;
  float bd = length(bv);
  float bw = bd - uBite.z * 13.0;
  g += bv / max(bd, 0.001) * sin(bw * 3.0) * exp(-bw * bw * 0.25) * exp(-uBite.z * 1.1) * uBite.w * uRoom[2].w;
  g *= fade;
  n = vec3(-g.x * 0.12, 1.0, -g.y * 0.12);
  vec3 col = mix(uRoom[0].rgb, uRoom[3].rgb, exp(-max(r, 0.0) * 0.1) * 0.7);
  col += hueRotate(vec3(0.12, 0.04, 0.18), dot(p, vec2(0.05, 0.08)) + uTime * 0.3) * uRoom[2].z;
  gloss = 0.78;
  return col;
}
`,
};

const TAU = Math.PI * 2;

// Chrome droplet head: a sphere (y 0..1) stretched into a nose toward local -Z, refitted to 1x1x1.
function droplet(sphere) {
  const g = sphere(28, 16, 0.5);
  for (let i = 0; i < g.pos.length; i += 3) {
    let z = g.pos[i + 2];
    let nz = g.nrm[i + 2];
    if (z < 0) {
      const k = 1.7 - 0.5 * (1 + z * 2);          // stronger stretch toward the tip
      const taper = 1 - 0.35 * (-z * 2);
      z *= k;
      g.pos[i] *= taper;
      nz /= k;
    }
    g.pos[i + 2] = (z + 0.175) / 1.35;
    const l = Math.hypot(g.nrm[i], g.nrm[i + 1], nz) || 1;
    g.nrm[i] /= l; g.nrm[i + 1] /= l; g.nrm[i + 2] = nz / l;
  }
  return g;
}

// Fake 2001 interface window, drawn once on a canvas (no fetches, no fonts beyond system ones).
function uiSheet(title, lines, accent) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#eaf6ff'); bg.addColorStop(1, '#a9c8f4');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 256);
  const tb = x.createLinearGradient(0, 0, 0, 34);
  tb.addColorStop(0, accent); tb.addColorStop(1, '#1d3fb8');
  x.fillStyle = tb; x.fillRect(0, 0, 512, 34);
  x.fillStyle = '#fff'; x.font = 'bold 20px Verdana, Tahoma, sans-serif'; x.fillText(title, 12, 24);
  for (let i = 0; i < 3; i++) {
    x.fillStyle = ['#ff5f8f', '#ffd23f', '#4fe39b'][i];
    x.beginPath(); x.arc(420 + i * 30, 17, 9, 0, TAU); x.fill();
  }
  x.fillStyle = '#123'; x.font = '22px Verdana, Tahoma, sans-serif';
  lines.forEach((s, i) => x.fillText(s, 22, 78 + i * 34));
  x.fillStyle = '#fff'; x.fillRect(22, 186, 300, 22);
  const pb = x.createLinearGradient(0, 186, 0, 208);
  pb.addColorStop(0, '#7ff3ff'); pb.addColorStop(1, '#1b8fd8');
  x.fillStyle = pb; x.fillRect(24, 188, 270, 18);
  for (const [bx, label] of [[350, 'OK'], [430, 'NEXT >']]) {
    const g = x.createLinearGradient(0, 180, 0, 214);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#8fb4ff');
    x.fillStyle = g; x.fillRect(bx, 180, 72, 32);
    x.strokeStyle = '#1d3fb8'; x.lineWidth = 2; x.strokeRect(bx, 180, 72, 32);
    x.fillStyle = '#1d3fb8'; x.font = 'bold 15px Verdana, sans-serif'; x.fillText(label, bx + 10, 202);
  }
  x.strokeStyle = '#1d3fb8'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 250);
  return c;
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
const mod = (a, n) => ((a % n) + n) % n;

const BOARD_PALETTES = [
  { grid: [0.35, 1.0, 0.95], frame: [0.7, 1.0, 1.0] },
  { grid: [1.0, 0.5, 0.9], frame: [1.0, 0.7, 0.95] },
  { grid: [1.0, 0.9, 0.3], frame: [1.0, 0.95, 0.55] },
  { grid: [0.6, 0.6, 1.0], frame: [0.8, 0.8, 1.0] },
  { grid: [0.5, 1.0, 0.6], frame: [0.75, 1.0, 0.8] },
];
// sky moods stepped by the variant: [zenith, mid, horizon]
const SKIES = [
  [[0.14, 0.18, 0.78], [0.36, 0.4, 0.98], [0.72, 0.6, 1.0]],
  [[0.22, 0.12, 0.72], [0.5, 0.34, 0.96], [0.95, 0.6, 0.9]],
  [[0.08, 0.26, 0.8], [0.3, 0.55, 1.0], [0.7, 0.85, 1.0]],
];

export function create(kit) {
  const { material, cols, rows } = kit;
  const G = kit.geometry;
  kit.addGeometry('plDrop', droplet(G.sphere));
  kit.addGeometry('plFatTorus', G.torus(0.5, 0.16, 56, 18));
  kit.addGeometry('plTorus', G.torus(0.5, 0.07, 64, 12));
  kit.addGeometry('plThin', G.torus(0.5, 0.012, 120, 6));
  const HX = cols / 2, HZ = rows / 2;

  // ---- materials ----
  const chrome = material({ color: [0.9, 0.9, 1.0], chrome: 1, rim: [0.25, 0.25, 0.4] });
  const M = {
    chrome,
    glass: material({ color: [0.35, 0.95, 1.0], chrome: 0.55, emissive: [0.03, 0.2, 0.26], rim: [0.7, 1, 1], lines: 1, lineWidth: 0.018, lineColor: [0.55, 1, 1] }),
    glassPink: material({ color: [1.0, 0.6, 0.95], chrome: 0.55, emissive: [0.2, 0.05, 0.2], rim: [1, 0.8, 1] }),
    irid: material({ color: [0.8, 0.7, 1.0], chrome: 0.7, emissive: [0.12, 0.08, 0.22], rim: [0.5, 1, 0.9], lines: 6, lineWidth: 0.02, lineColor: [0.4, 0.9, 1] }),
    globe: material({ color: [0.3, 0.8, 1.0], chrome: 0.45, emissive: [0.05, 0.18, 0.28], lines: 1, lineWidth: 0.03, lineColor: [0.7, 1, 1], uvScale: [14, 8], rim: [0.6, 1, 1] }),
    halo: material({ color: [0.9, 0.85, 1], chrome: 0.8, emissive: [0.3, 0.2, 0.45], fog: 0.4 }),
    pedestal: material({ color: [0.85, 0.85, 0.95], chrome: 0.85, lines: 1, lineWidth: 0.03, lineColor: [0.5, 0.9, 1], uvScale: [16, 1] }),
  };
  const sheets = [
    uiSheet('WELCOME.HTM', ['The future is now!', 'Loading the year 2001 ...'], '#58a6ff'),
    uiSheet('TIME_BREAK.EXE', ['Wrong decade detected.', 'Press OK to continue.'], '#ff6fd8'),
  ].map((c) => (c ? kit.texture(c) : null));
  const panels = sheets.map((tex) => material({ color: [1.15, 1.15, 1.2], emissive: [0.12, 0.12, 0.16], mode: tex ? 2 : 0, tex, twoSided: true, fog: 0.5 }));

  const snakeBody = material({ color: [0.78, 0.86, 1.0], emissive: [0.05, 0.06, 0.12], chrome: 1, rim: [0.55, 0.6, 1.0] });
  const snakeHead = material({ color: [1, 1, 1], emissive: [0.12, 0.14, 0.24], chrome: 0.92, rim: [0.7, 0.8, 1] });
  const snakeEye = material({ color: [0.02, 0.02, 0.05], emissive: [0, 0, 0] });
  const dot = material({ color: [1, 0.86, 0.12], emissive: [0.78, 0.56, 0.0], chrome: 0.28, rim: [1, 1, 0.75] });

  // ---- layout: everything outside the board (|x| > HX + 0.5 or z < -HZ - 0.5) ----
  // spheres: x, z, radius (centre sits at 0.75 r, dipping into the water)
  const spheres = [
    [-(HX + 3.6), 2.5, 1.6], [HX + 4.2, -2.5, 2.2], [-(HX + 7.5), -13, 3.0], [HX + 9.5, -21, 3.6],
    [-4.5, -HZ - 7, 1.8], [6.5, -HZ - 13, 2.6], [-(HX + 13), 7, 2.6], [HX + 12, 7.5, 2.0],
    [-22, -HZ - 34, 5.5], [26, -HZ - 42, 6.5],
  ];
  // upright glass slabs: x, z, width, height, ry
  const slabs = [
    [-(HX + 3.2), -6, 2.6, 4.2, 0.5], [HX + 3.4, -11, 3.2, 5.5, -0.4], [-9, -HZ - 4.5, 4.5, 2.8, 0.15],
    [HX + 6.5, 3, 2.4, 3.2, 0.9], [11, -HZ - 9, 5, 7.5, -0.25], [-(HX + 9), -24, 4, 9, 0.3],
  ];
  const pyramids = [[-(HX + 11), -27, 9, 7], [-3, -HZ - 22, 7, 5.5], [HX + 15, -36, 11, 8.5]];
  // bubbles: side or back, radius, rise speed, phase
  const bubbles = [];
  for (let i = 0; i < 120; i++) {
    const r = 0.35 + hash(i * 3.3) * 1.3;
    const side = hash(i * 1.9) < 0.65;
    const x = side ? (hash(i * 5.1) < 0.5 ? -1 : 1) * (HX + 1.3 + r + hash(i * 7.7) * 20) : (hash(i * 9.3) - 0.5) * 60;
    const z = side ? 9 - hash(i * 11.1) * 50 : -HZ - 1.5 - r - hash(i * 13.9) * 40;
    bubbles.push([x, z, r, 0.5 + hash(i * 17.3) * 1.3, hash(i * 19.7) * 30]);
  }

  const pal = new Float32Array(24);
  const room = new Float32Array(16);
  const tmp = [0, 0, 0];
  const F = {
    pal, room,
    board: { panel: [0.03, 0.19, 0.25], grid: [0, 0, 0], frame: [0, 0, 0], lineWidth: 0.03, band: 0.3, gridGlow: 0.7, frameGlow: 0.9 },
    snake: {
      body: snakeBody, head: snakeHead, eye: snakeEye, dot,
      bodyGeom: 'ball', headGeom: 'plDrop', dotGeom: 'ball',
      bodySize: [0.8, 0.3, 0.8], headSize: [0.86, 0.3, 0.98], dotSize: [0.44, 0.34, 0.44],
      pool: [0.4, 0.8, 1.0], dotPool: [1, 0.85, 0.2], poolIntensity: 0.28,
      segment: null,
    },
    ring: [1, 0.95, 0.5], wall: [0.12, 0.35, 0.33], beacon: [1, 0.9, 0.35], fog: [0.85, 0.78, 1.0],
  };

  let alive = true, chaos = 0, time = 0, beat = 0, lastT = null, hueAcc = 0, drift = 0;
  const BEAD = [0.05, 0.08, 0.2];
  // Chrome beads with an iridescent sheen that rolls down the string; rainbow at high chaos.
  F.snake.segment = (i, n, mat) => {
    if (!alive) { mat.emissive[0] = 0.05; mat.emissive[1] = 0.05; mat.emissive[2] = 0.06; mat.chrome = 0.35; return; }
    mat.chrome = 1;
    const s = chaos > 0.4 ? 0.06 + (chaos - 0.4) * 0.5 : 0.0;
    hueRotate(tmp, BEAD, i * 0.45 - time * 1.6);
    const k = 1 + beat * 0.8;
    mat.emissive[0] = Math.max(0, tmp[0] * k + s * (0.5 + 0.5 * Math.sin(i * 0.7 - time * 4)));
    mat.emissive[1] = Math.max(0, tmp[1] * k + s * (0.5 + 0.5 * Math.sin(i * 0.7 - time * 4 + 2.1)));
    mat.emissive[2] = Math.max(0, tmp[2] * k + s * (0.5 + 0.5 * Math.sin(i * 0.7 - time * 4 + 4.2)));
  };

  function frame(fx, snap) {
    alive = snap.alive !== false;
    chaos = fx.chaos; time = fx.time; beat = fx.beat;
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, fx.time - lastT));
    lastT = fx.time;
    hueAcc = (hueAcc + dt * (0.05 + 1.6 * fx.chaos * fx.chaos)) % TAU;
    drift = (drift + dt * (0.04 + 0.35 * fx.chaos)) % 1000;
    const v = fx.variant;
    const bp = BOARD_PALETTES[mod(v, BOARD_PALETTES.length)];
    for (let i = 0; i < 3; i++) { F.board.grid[i] = bp.grid[i] * 0.55; F.board.frame[i] = bp.frame[i]; }
    for (let i = 0; i < 3; i++) F.wall[i] = bp.grid[i] * 0.35;   // additive walls on a bright sky: keep them deep

    const sky = SKIES[mod(v, SKIES.length)];
    setRGB(pal, 0, [0.55, 0.6, 0.95]);
    setRGB(pal, 1, [0.35, 0.45, 0.75]);
    setRGB(pal, 2, sky[0]);
    setRGB(pal, 3, sky[1]);
    setRGB(pal, 4, sky[2]);
    setRGB(pal, 5, [1.0, 0.96, 1.0]);
    setRGB(pal, 6, [0.7, 0.62, 0.95]);
    setRGB(pal, 7, [1.0, 0.92, 0.8]);
    // the hue swings through cool blues, violets and magentas but never reaches yellow, so the
    // chrome beads (which mirror the sky) can never be mistaken for the yellow dot
    const hue = 1.1 * Math.sin(hueAcc) + (fx.chaos > 0.3 ? (mod(v, 3) - 1) * 0.3 : 0);
    room[0] = 0.08; room[1] = 0.2; room[2] = 0.6; room[3] = hue;
    room[4] = 0.25 + 0.9 * fx.chaos;                         // ripple amplitude
    room[5] = 0.6 + 1.2 * fx.chaos;                          // wave speed
    room[6] = fx.punch * 0.7;                                // punch flash
    room[7] = drift;                                         // cloud drift
    room[8] = 0.6 + 1.2 * fx.chaos;                          // beat ripple
    room[9] = 0.8 + 0.6 * fx.beat + 0.4 * fx.chaos;          // sun + flare ghosts
    room[10] = 0.25 + 0.8 * fx.chaos;                        // water iridescence
    room[11] = fx.reducedFlash ? 0.4 : 1.2;                  // bite ripple
    room[12] = 0.25; room[13] = 0.75; room[14] = 0.85; room[15] = 0;
    hueRotate(F.fog, sky[2], hue);

    hueRotate(M.irid.lineColor, [0.4, 0.9, 1.0], fx.time * 0.7 + v);
    const gp = 1 + fx.beat * 0.8 + fx.punch;
    M.glass.emissive[0] = 0.03 * gp; M.glass.emissive[1] = 0.2 * gp; M.glass.emissive[2] = 0.26 * gp;
    hueRotate(M.halo.emissive, [0.3, 0.2, 0.45], hue);
    snakeHead.emissive.set(alive ? [0.12, 0.14, 0.24] : [0.06, 0.06, 0.07]);
    snakeHead.chrome = alive ? 0.92 : 0.3;
    dot.emissive.set([0.78 + 0.2 * fx.beat, 0.56 + 0.2 * fx.beat, 0.0]);
    return F;
  }

  function props(d) {
    const fx = d.fx, t = fx.time, still = fx.reducedMotion;
    for (const [x, z, r] of spheres) {
      const hop = still ? 0 : fx.beat * (0.15 + 0.6 * fx.chaos) * r * 0.35;
      d.mesh('sphere', d.trs(x, 0.75 * r + hop, z, 0, 2 * r, 2 * r, 2 * r), chrome);
    }
    for (let i = 0; i < slabs.length; i++) {
      const [x, z, w, h, ry] = slabs[i];
      const bob = still ? 0.12 : 0.15 + 0.15 * Math.sin(t * 0.8 + i);
      d.mesh('box', d.trs(x, bob, z, ry, w, h, 0.35), i % 3 === 2 ? M.glassPink : M.glass);
    }
    for (let i = 0; i < pyramids.length; i++) {
      const [x, z, b, h] = pyramids[i];
      d.mesh('pyramid', d.trs(x, 0, z, 0.4 * i + (still ? 0 : t * 0.08), b, h * (1 + 0.06 * fx.beat), b), M.irid);
    }
    // arches standing half in the water
    d.mesh('plFatTorus', d.euler(HX + 7, 0, -4, Math.PI / 2, Math.PI / 2, 0, 5.2, 5.2, 5.2), M.glass);
    d.mesh('plFatTorus', d.euler(-5, 0, -HZ - 9, Math.PI / 2, 0, 0, 6, 6, 6), M.glass);
    // chrome ring, inflatable ring, wire globe with its orbit, halo on the horizon
    const spin = still ? 0.3 : t * (0.35 + 1.5 * fx.chaos);
    const bob = still ? 0 : Math.sin(t * 0.9) * 0.4;
    d.mesh('plTorus', d.euler(HX + 8, 7 + bob, -16, Math.PI / 2 - 0.2, spin, 0, 7, 7, 7), chrome);
    d.mesh('plFatTorus', d.euler(-(HX + 6.5), 0.22, 4, 0.08, spin * 0.3, 0, 4.4, 4.4, 4.4), M.glassPink);
    d.mesh('sphere', d.trs(-(HX + 12), 9 + bob, -30, spin * 0.4, 10, 10, 10), M.globe);
    d.mesh('plThin', d.euler(-(HX + 12), 9 + bob, -30, 0.45, spin * 0.5, 0.25, 16, 16, 16), M.halo);
    if (!d.mirror) d.mesh('plThin', d.euler(0, 16, -HZ - 80, Math.PI / 2 - 0.12, 0, t * 0.05, 64, 64, 64), M.halo);
    // fake interface windows floating far behind the board
    for (let i = 0; i < panels.length; i++) {
      const s = i ? 1 : -1;
      const fy = still ? 0 : Math.sin(t * 0.6 + i * 2) * 0.5;
      d.mesh('plane', d.trs(s * (13 + 3 * i), 6.5 + 2.5 * i + fy, -HZ - 30 - 8 * i, -s * 0.22, 12, 6, 1), panels[i]);
    }
  }

  const WHITE = [1, 1, 1], DOTRING = [1, 0.9, 0.3];
  function glows(d) {
    const fx = d.fx, t = fx.time, still = fx.reducedMotion;
    const burst = fx.bite && fx.biteAge < 1600 ? 24 : 0;
    const nB = Math.min(bubbles.length, 16 + Math.floor(70 * fx.chaos) + burst);
    const k0 = 0.55 + 0.5 * fx.beat;
    for (let i = 0; i < nB; i++) {
      const [x, z, r, sp, ph] = bubbles[i];
      const y = mod(ph + t * sp * (1 + fx.chaos), 16) + r * 0.4;
      const fade = Math.min(1, (16 - y) / 3);
      const wob = still ? 0 : 0.3 * Math.sin(t * 1.7 + i);
      hueRotate(tmp, [0.45, 0.9, 1.0], t * 0.9 + i * 0.7);
      d.billboard(x + wob, y - r, z, 2 * r, 2 * r, tmp, 1, k0 * fade, 0.84, 0.1);
      d.billboard(x + wob, y + 0.25 * r, z, 0.5 * r, 0.5 * r, WHITE, 0, k0 * fade * 0.7);
    }
    // twinkles on top of the chrome spheres
    for (let i = 0; i < spheres.length; i++) {
      const [x, z, r] = spheres[i];
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * (1.8 + i * 0.37) + i), 8) * (0.8 + fx.beat);
      if (tw < 0.05) continue;
      const y = 1.45 * r;
      d.billboard(x, y - 0.03 * r, z, 1.2 * r, 0.06 * r, WHITE, 0, tw);
      d.billboard(x, y - 0.6 * r, z, 0.06 * r, 1.2 * r, WHITE, 0, tw);
    }
    // the dot: a thin gold ring on the floor of its own cell and a specular highlight
    if (d.snap && d.snap.food) {
      const [x, z] = d.cellToWorld(d.snap.food.x, d.snap.food.y);
      d.ring(x, z, 1.0, DOTRING, 0.7 + 0.6 * fx.beat, 0.78, 0.07);
      d.billboard(x, 0.2, z, 0.14, 0.14, WHITE, 0, 0.9);
    }
  }

  return { frame, props, glows };
}

// Life slot (LEVELS_PLAN 4.3), plain Canvas 2D, no WebGL: a chrome bead. Filled = mirrored sphere with
// a sky-blue band, dark horizon and a hard white highlight; hollow = an empty chrome ring.
export function life(ctx, x, y, size, filled, fx) {
  const cx = x + size / 2, cy = y + size / 2, r = size * 0.4, TAU = Math.PI * 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
  if (filled) {
    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, '#f4fbff'); g.addColorStop(0.42, '#8fb6ff'); g.addColorStop(0.5, '#1c2450');
    g.addColorStop(0.62, '#4a5aa0'); g.addColorStop(1, '#e6f0ff');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(16,20,48,0.85)'; ctx.lineWidth = Math.max(1, size * 0.05); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.26, r * 0.15, -0.6, 0, TAU); ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(230,240,255,0.75)'; ctx.lineWidth = Math.max(1.2, size * 0.09); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(cx - r * 0.45, cy - r * 0.45, Math.max(0.8, r * 0.12), 0, TAU); ctx.fill();
  }
  ctx.restore();
}
