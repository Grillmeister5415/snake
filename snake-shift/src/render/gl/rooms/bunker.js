// BERLIN BUNKER, 2026, 04:37 — the strobe room (BUILD_PLAN 10, timeline 06).
// A box room: concrete walls plastered with a generated poster sheet stand exactly on the lethal
// edges (kit.boxRoom). In the board view the near wall is left out and the room opens into a long
// concrete hall: portal frames, speaker stacks, pipes, a crowd, a booth, smoke and red lasers.
// Snake = red light tiles, dot = red sphere with a white core. Kick-synced red strobes on fx.beat,
// laser sweeps, wall flashes on fx.punch, all scaled by fx.chaos. The board never strobes: snake,
// dot, panel and grid ignore the beat and the room light. Interface: see the top of court.js.

export const meta = {
  id: 'bunker',
  name: 'BERLIN BUNKER',
  year: '2026',
  clock: '04:37',
  luma: 0.07,
  veil: '#1c0303',
  weight: 3,
  hud: { fg: '#f4f1ea', bg: 'rgba(12,2,2,0.78)', accent: '#ff1a10', panelFg: '#f4f1ea', panelBg: 'rgba(18,2,2,0.9)' },
};

export const glsl = {
  sky: /* glsl */ `
// uPal: 2 red light, 3 haze, 4 strobe red, 5 white flash, 6 concrete dark, 7 ceiling strip
// uRoom[0] strobe, punch flash, chaos, white strobe
// uRoom[1] floor strobe, ripple, -, ceiling strips; uRoom[2] x = pillar line |x|
float bnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 roomSky(vec3 d) {
  float y = d.y;
  vec3 col;
  if (y < 0.0) {
    col = uPal[6] * 0.5 + uPal[3] * exp(y * 6.0) * 0.5;   // wet floor, for chrome
  } else {
    // coffered concrete ceiling, lit red from below, fading into haze
    vec2 c = d.xz / max(y, 0.02);
    float far = length(c);
    vec2 w = aaWidth(c * 0.5);
    float rib = gridAA(c * 0.5, 0.05, w);
    float fall = exp(-far * 0.12);
    col = uPal[6] * (0.8 - 0.4 * rib);
    col += uPal[2] * rib * 0.35 * fall;
    float strip = exp(-pow((abs(c.x) - 1.3) * 9.0, 2.0)) * step(0.35, fract(c.y * 0.3));
    col += uPal[7] * strip * uRoom[1].w * fall;
    float haze = exp(-y * 4.0);
    col = mix(col, uPal[3], haze * 0.85);
    col += uPal[3] * exp(-y * 20.0) * 0.9;
  }
  float hz = exp(-abs(y) * 3.0);
  col += uPal[4] * uRoom[0].x * (0.2 + 0.8 * hz);
  col += uPal[5] * (uRoom[0].w * (0.3 + 0.5 * hz) + uRoom[0].y * 0.3);
  return col;
}
`,
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  vec2 w = aaWidth(p);
  float joint = gridAA(p * 0.25, 0.012, w * 0.25);
  float tone = bnoise(p * 0.6) * 0.5 + bnoise(p * 2.7) * 0.3;
  vec3 col = uPal[6] * (0.55 + tone);
  col *= 1.0 - 0.75 * joint;
  // puddles: darker, mirror-glossy, trembling with the bass
  float pud = smoothstep(0.45, 0.62, bnoise(p * 0.16 + 3.1) * 0.7 + bnoise(p * 0.55 - 1.7) * 0.3);
  vec2 rp = p * 1.7 + vec2(0.0, uTime * 0.5);
  float n0 = bnoise(rp);
  n.xz += vec2(bnoise(rp + vec2(0.37, 0.0)) - n0, bnoise(rp + vec2(0.0, 0.37)) - n0) * uRoom[1].y * pud;
  col *= mix(1.0, 0.45, pud);
  gloss = mix(0.35, 0.95, pud);
  // kick strobe washing over the floor (outside the board only: the engine draws the board)
  float edge = max(abs(p.x) - uBoard.x, abs(p.y) - uBoard.y);
  col += uPal[4] * uRoom[0].x * uRoom[1].x * (0.12 + 0.3 * pud) * (0.5 + 0.5 * exp(-max(edge, 0.0) * 0.04));
  // red pools under the pillar light tubes
  float tubes = exp(-pow((abs(p.x) - uRoom[2].x) * 0.35, 2.0)) * (0.55 + 0.45 * sin(p.y * 0.483 + 1.0));
  col += uPal[2] * tubes * 0.07 * (1.0 + uRoom[0].x);
  return col;
}
`,
};

const RED = [1, 0.06, 0.035];
const WHITE = [1, 0.93, 0.9];

function setRGB(arr, i, c, k = 1) {
  arr[i * 3] = c[0] * k;
  arr[i * 3 + 1] = c[1] * k;
  arr[i * 3 + 2] = c[2] * k;
}
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- canvases (built once at startup) ----------
function speakerCanvas(kit) {
  const c = kit.canvas(256, 512);
  const x = c && c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#0c0a0a';
  x.fillRect(0, 0, 256, 512);
  const cone = (cx, cy, r) => {
    for (const [k, col] of [[1, '#1d1a19'], [0.93, '#050404'], [0.82, '#2a2524'], [0.5, '#0e0b0b'], [0.3, '#3a3231'], [0.16, '#070505']]) {
      x.fillStyle = col;
      x.beginPath();
      x.arc(cx, cy, r * k, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = 'rgba(255,40,30,0.55)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(cx, cy, r * 0.88, -2.4, -0.9);
    x.stroke();
  };
  cone(128, 150, 104);
  cone(128, 380, 104);
  x.fillStyle = '#2b2625';
  for (const [sx, sy] of [[14, 14], [242, 14], [14, 498], [242, 498], [14, 265], [242, 265]]) {
    x.beginPath();
    x.arc(sx, sy, 5, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function bannerCanvas(kit) {
  const c = kit.canvas(1024, 256);
  const x = c && c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#0b0909';
  x.fillRect(0, 0, 1024, 256);
  x.fillStyle = '#f4f1ea';
  x.textBaseline = 'top';
  x.font = '900 150px "Arial Black", Impact, Arial, sans-serif';
  const tw = x.measureText('TIME BREAK').width || 900;
  x.save();
  x.scale(Math.min(1, 960 / tw), 1);
  x.fillText('TIME BREAK', 32 / Math.min(1, 960 / tw), 20);
  x.restore();
  x.fillStyle = '#0b0909';
  x.fillRect(0, 88, 1024, 9);
  x.fillStyle = '#e3120b';
  x.fillRect(32, 190, 960, 46);
  x.fillStyle = '#0b0909';
  x.font = '900 36px "Arial Black", Impact, Arial, sans-serif';
  x.fillText('04:37   //   NO EXIT   //   2088', 48, 196);
  return c;
}

function scoreCanvas(kit) {
  const c = kit.canvas(512, 128);
  return c && c.getContext('2d') ? c : null;
}
function drawScore(c, score) {
  const x = c.getContext('2d');
  x.fillStyle = '#0b0909';
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#e3120b';
  x.lineWidth = 6;
  x.strokeRect(5, 5, 502, 118);
  x.fillStyle = '#e3120b';
  x.font = '900 26px "Arial Black", Impact, Arial, sans-serif';
  x.textBaseline = 'top';
  x.fillText('SCORE', 22, 18);
  x.fillText('04:37', 22, 84);
  x.fillStyle = '#f4f1ea';
  x.font = '900 104px "Arial Black", Impact, Arial, sans-serif';
  x.textAlign = 'right';
  x.fillText(String(Math.max(0, score | 0)).padStart(3, '0'), 492, 12);
  x.textAlign = 'left';
  x.fillStyle = '#0b0909'; // stencil bridges
  x.fillRect(150, 58, 350, 7);
}

// ---------- crowd and DJ as merged silhouettes (one draw call per row) ----------
function crowdRow(G, z, seed, n) {
  const parts = [];
  const body = G.cylinder(8, 0.8), head = G.sphere(8, 6, 0), arm = G.box();
  for (let i = 0; i < n; i++) {
    const h = hash(seed * 31 + i);
    if (h < 0.12) continue;
    const x = -12 + (24 * (i + 0.5)) / n + (hash(seed + i * 7) - 0.5) * 0.6;
    const dz = (hash(seed * 3 + i) - 0.5) * 1.6;
    const s = 0.9 + 0.25 * hash(i + seed * 11);
    parts.push({ g: body, t: [x, 0, z + dz], s: [0.62 * s, 1.25 * s, 0.5 * s] });
    parts.push({ g: head, t: [x, 1.45 * s, z + dz], s: [0.42 * s, 0.46 * s, 0.42 * s] });
    if (h > 0.55) {
      parts.push({ g: arm, t: [x - 0.27 * s, 1.1 * s, z + dz], s: [0.11, 0.8 * s, 0.11] });
      parts.push({ g: arm, t: [x + 0.27 * s, 1.1 * s, z + dz], s: [0.11, 0.8 * s, 0.11] });
    }
  }
  return G.merge(parts);
}

function djGeometry(G) {
  return G.merge([
    { g: G.box(), t: [0, 0, 0], s: [0.8, 1.55, 0.45] },
    { g: G.sphere(10, 8, 0), t: [0, 1.82, 0], s: [0.46, 0.5, 0.46] },
    { g: G.box(), t: [-0.52, 1.0, 0.1], s: [0.16, 0.55, 0.16] },
    { g: G.box(), t: [0.5, 1.3, 0.05], s: [0.16, 0.85, 0.16] },
  ]);
}

export function create(kit) {
  const { material, cols, rows } = kit;
  const G = kit.geometry;
  const hw = cols / 2, hd = rows / 2;

  // ---- textures (fallback to flat materials when a canvas is unavailable) ----
  const concreteCv = kit.concreteSheet({ seed: 21, base: '#5b5551' });
  const concreteTex = concreteCv ? kit.texture(concreteCv, { repeat: true }) : null;
  const posterCv = kit.posterSheet({ seed: 437 });
  const box = kit.boxRoom({
    name: 'bunker', height: 2.0, thick: 0.5, posterCanvas: posterCv, wallCanvas: concreteCv,
    wallColor: [0.62, 0.56, 0.54], stripColor: [1, 0.12, 0.08], capColor: [0.9, 0.05, 0.03],
  });
  const posterTex = box.poster.tex;
  const spk = speakerCanvas(kit), spkTex = spk ? kit.texture(spk, { repeat: false }) : null;
  const ban = bannerCanvas(kit), banTex = ban ? kit.texture(ban, { repeat: false }) : null;
  const scoreCv = scoreCanvas(kit);
  let scoreTex = null, lastScore = -1;
  if (scoreCv) {
    drawScore(scoreCv, 0);
    scoreTex = kit.texture(scoreCv, { repeat: false, mipmap: false });
    lastScore = 0;
  }

  // ---- geometry ----
  const HALL_LEN = 132, HALL_Z0 = 44, HALL_H = 46; // hall runs from z = +44 to z = -88; tall enough for the portrait camera
  const HX = hw + 14;                 // hall side walls
  const PX = hw + 7;                  // portal pillar line
  kit.addGeometry('bunker:hallPosters', G.planeUV(0, HALL_LEN / (4 * 4.8)));
  const ROWS_Z = [-31, -36.5, -42, -47.5];
  ROWS_Z.forEach((z, i) => kit.addGeometry(`bunker:crowd${i}`, crowdRow(G, z, i + 1, 22 - i)));
  kit.addGeometry('bunker:dj', djGeometry(G));

  // ---- materials ----
  const tint = (c, t) => material({ ...c, mode: t ? 2 : 0, tex: t });
  const M = {
    concrete: tint({ color: [0.5, 0.45, 0.43], uvScale: [1, 4] }, concreteTex),
    beam: tint({ color: [0.5, 0.45, 0.43], uvScale: [8, 1] }, concreteTex),
    hallWall: tint({ color: [0.42, 0.38, 0.36], uvScale: [24, 8] }, concreteTex),
    hallPoster: tint({ color: [0.9, 0.85, 0.85], fog: 0.6 }, posterTex),
    banner: tint({ color: [1, 1, 1] }, banTex),
    score: tint({ color: [1.1, 1.05, 1.05] }, scoreTex),
    tube: material({ color: [0, 0, 0], emissive: RED }),
    strobe: material({ color: [0.1, 0.1, 0.1], emissive: [0.3, 0.02, 0.02], lines: 1, lineWidth: 0.08, lineColor: [0.3, 0.3, 0.3] }),
    cabinet: material({ color: [0.06, 0.055, 0.055], chrome: 0.12, lines: 1, lineWidth: 0.015, lineColor: [0.25, 0.05, 0.04] }),
    cone: tint({ color: [1, 1, 1] }, spkTex),
    pipe: material({ color: [0.2, 0.08, 0.07], chrome: 0.55, lines: 6, lineWidth: 0.012, lineColor: [0.5, 0.06, 0.04] }),
    pipeRed: material({ color: [0.5, 0.04, 0.03], chrome: 0.4 }),
    crowd: material({ color: [0.03, 0.012, 0.012], rim: [0.75, 0.05, 0.03], fog: 0.4 }),
    desk: material({ color: [0.04, 0.035, 0.035], emissive: [0.05, 0, 0], lines: 1, lineWidth: 0.02, lineColor: [0.9, 0.08, 0.05] }),
    led: material({ color: [0, 0, 0], emissive: [1, 0.1, 0.06] }),
  };
  if (!posterTex) M.hallPoster.color.set([0.25, 0.05, 0.05]);
  if (!scoreTex) M.score.color.set([0.05, 0.01, 0.01]);

  // ---- snake: red light tiles; dot: red sphere (white core added in glows) ----
  const snakeBody = material({ color: [0, 0, 0], emissive: [1.2, 0.2, 0.14], lines: 1, lineWidth: 0.06, lineColor: [0.8, 0.04, 0.02] });
  const snakeHead = material({ color: [0, 0, 0], emissive: [1, 0.28, 0.2], lines: 1, lineWidth: 0.06, lineColor: [1, 0.9, 0.85] });
  const snakeEye = material({ color: [0, 0, 0], emissive: [0.02, 0, 0] });
  const dot = material({ color: [0, 0, 0], emissive: [0.95, 0.04, 0.03], rim: [0.5, 0.05, 0.03] });
  const BODY_EMIT = [1.2, 0.2, 0.14];

  // ---- per-frame output ----
  const pal = new Float32Array(24);
  const room = new Float32Array(16);
  const F = {
    pal, room,
    board: { panel: [0.014, 0.004, 0.004], grid: [0.75, 0.04, 0.03], frame: [1, 0.12, 0.08], lineWidth: 0.022, band: 0.12, gridGlow: 0.45, frameGlow: 0.7 },
    snake: {
      body: snakeBody, head: snakeHead, eye: snakeEye, dot,
      bodyGeom: 'block', headGeom: 'head', dotGeom: 'ball',
      bodySize: [0.84, 0.14, 0.84], headSize: [0.9, 0.2, 0.9], dotSize: [0.58, 0.34, 0.58],
      pool: [1, 0.05, 0.03], dotPool: [1.8, 0.2, 0.12], poolIntensity: 0.38, dotPoolBeat: 0,
      segment: null,
    },
    ring: [1, 0.3, 0.2], wall: RED, beacon: [1, 0.12, 0.08], fog: [0.2, 0.02, 0.015],
    curb: false,      // the box walls are the edge (the floor frame band shows on the open near side)
    povWalls: false,  // real concrete walls instead of the engine's energy walls
  };
  const st = { strobe: 0, white: 0, kick: 0, chaos: 0, tubeL: 0, tubeR: 0 };
  let alive = true;
  F.snake.segment = (i, n, mat) => {
    // fixed brightness ramp: the board never strobes
    const k = alive ? 1 - 0.35 * (i / Math.max(1, n - 1)) : 1;
    if (alive) {
      mat.emissive[0] = BODY_EMIT[0] * k; mat.emissive[1] = BODY_EMIT[1] * k; mat.emissive[2] = BODY_EMIT[2] * k;
    } else {
      mat.emissive[0] = 0.26; mat.emissive[1] = 0.07; mat.emissive[2] = 0.06;
    }
  };

  function frame(fx, snap) {
    alive = snap.alive !== false;
    const ch = fx.chaos;
    // kick strobe: sharp on the beat, every beat once chaos passes 0.5, accented bars below that
    const kick = Math.pow(fx.beat, 2.2);
    const accent = ch > 0.5 || fx.beatIndex % 2 === 0 ? 1 : 0.45;
    const strobe = kick * (0.45 + 0.85 * ch) * accent;
    const whiteOn = ch > 0.55 && fx.beatIndex % (ch > 0.85 ? 1 : 2) === 0;
    const white = whiteOn ? kick * (ch - 0.45) * 1.7 : 0;
    st.strobe = strobe; st.white = white; st.kick = kick; st.chaos = ch;
    // light tubes: steady at low chaos, alternate left/right on the beat when it gets wild
    const alt = ch > 0.6 ? fx.beatIndex % 2 : -1;
    st.tubeL = 0.65 + strobe * (alt === 1 ? 0.3 : 2.4);
    st.tubeR = 0.65 + strobe * (alt === 0 ? 0.3 : 2.4);

    setRGB(pal, 0, [0.55, 0.12, 0.1], 1 + strobe * 1.6 + fx.punch * 1.4);
    setRGB(pal, 1, [0.2, 0.03, 0.03], 1 + strobe);
    setRGB(pal, 2, RED);
    setRGB(pal, 3, [0.3, 0.028, 0.02], 1 + 0.35 * ch);
    setRGB(pal, 4, [1, 0.07, 0.04]);
    setRGB(pal, 5, WHITE);
    setRGB(pal, 6, [0.045, 0.034, 0.032]);
    setRGB(pal, 7, [1, 0.12, 0.08]);
    room[0] = strobe; room[1] = fx.punch; room[2] = ch; room[3] = white;
    room[4] = 0.9 + ch * 0.9;                                   // floor strobe
    room[5] = fx.reducedMotion ? 0.12 : 0.3 + 0.5 * ch;         // puddle ripple
    room[6] = 0;
    room[7] = ch > 0.4 && fx.beatIndex % 4 >= 2 ? 0.35 : 1;      // ceiling strips step on the bar
    room[8] = PX;
    setRGB(F.fog, 0, [0.2, 0.02, 0.015], 1 + strobe * 0.8);

    // wall flash on a bite (punch), red kick on the beat
    const p = fx.punch;
    // stark whites under red light: lift green/blue so paper reads white, not pink
    box.poster.color[0] = 1.3 + p * 2.6 + strobe * 1.1;
    box.poster.color[1] = 1.85 + p * 2.4 + white * 1.2;
    box.poster.color[2] = 1.85 + p * 2.4 + white * 1.2;
    box.wall.color[0] = 0.62 * (1 + p * 2 + strobe * 1.2);
    box.wall.color[1] = 0.56 * (1 + p * 1.6);
    box.wall.color[2] = 0.54 * (1 + p * 1.6);
    setRGB(box.cap.emissive, 0, [0.9, 0.05, 0.03], 1 + strobe * 2.5);
    box.cap.emissive[1] += p * 0.9 + white;
    box.cap.emissive[2] += p * 0.9 + white;
    M.hallPoster.color[0] = 0.9 * (1 + strobe * 1.4 + p);
    M.banner.color[0] = 1 + strobe * 1.5 + p;
    M.banner.color[1] = M.banner.color[2] = 1 + white + p * 0.6;
    setRGB(M.strobe.emissive, 0, [0.3, 0.02, 0.02], 1 + strobe * 9);
    M.strobe.emissive[1] += white * 4;
    M.strobe.emissive[2] += white * 4;
    M.cone.color[0] = 1 + kick * 1.2; M.cone.color[1] = M.cone.color[2] = 1 + kick * 0.2;
    setRGB(M.crowd.rim, 0, [0.75, 0.05, 0.03], 1 + strobe * 2.2);
    setRGB(M.led.emissive, 0, RED, 0.6 + 0.4 * Math.abs(Math.sin(fx.time * 9)) + strobe);

    // the snake, the dot and the board keep fixed colours: no beat in here
    snakeHead.emissive.set(alive ? [1, 0.28, 0.2] : [0.3, 0.1, 0.09]);
    snakeHead.lineColor.set(alive ? [1, 0.9, 0.85] : [0.4, 0.3, 0.3]);
    snakeBody.lineColor.set(alive ? [0.8, 0.04, 0.02] : [0.3, 0.12, 0.1]);

    const sc = Math.max(0, snap.score | 0);
    if (scoreTex && sc !== lastScore) {
      drawScore(scoreCv, sc);
      kit.updateTexture(scoreTex, scoreCv);
      lastScore = sc;
    }
    return F;
  }

  // ---- layout: everything outside the board, nothing in front of its near edge ----
  const BENTS = [-14, -27, -40, -53, -66, -79];   // portal frames with a crossbeam (behind the board)
  const SIDE_PILLARS = [-1, 12];                  // pillars only, beside the board
  const LEAN = 0.07;
  const STACKS = [[11.6, -12, 2, 2], [11.2, 2, 1, 2], [8.6, -60, 2, 3]]; // |x|, z, columns, rows
  const CW = 1.3, CH = 2.6;                        // speaker cabinet (face texture is 1:2)
  const PIPES = [[13.4, 12.0, 0.64], [13.5, 12.75, 0.48], [13.3, 13.5, 0.72], [-13.6, 12.4, 0.6], [-13.4, 13.3, 0.44]];
  const zBack = HALL_Z0 - HALL_LEN;

  function pillar(d, s, z) {
    d.mesh('box', d.euler(s * PX, 0, z, 0, 0, s * LEAN, 1.6, 19, 1.4), M.concrete);
    d.mesh('box', d.euler(s * (PX - 0.95), 1.5, z, 0, 0, s * LEAN, 0.16, 9, 0.16), s < 0 ? tubeL : tubeR);
  }
  const tubeL = material({ color: [0, 0, 0], emissive: RED });
  const tubeR = material({ color: [0, 0, 0], emissive: RED });

  function stack(d, x, z, nc, nr) {
    for (let c = 0; c < nc; c++) {
      const cx = x + (c - (nc - 1) / 2) * (CW + 0.04);
      for (let r = 0; r < nr; r++) {
        const y = r * (CH + 0.03);
        d.mesh('box', d.trs(cx, y, z, 0, CW, CH, CW), M.cabinet);
        d.mesh('plane', d.trs(cx, y + 0.05, z + CW / 2 + 0.006, 0, CW - 0.08, CH - 0.1, 1), M.cone);
      }
    }
  }

  function props(d) {
    const fx = d.fx;
    const still = fx.reducedMotion;
    setRGB(tubeL.emissive, 0, RED, st.tubeL);
    setRGB(tubeR.emissive, 0, RED, st.tubeR);
    // the box: concrete + posters standing on the lethal edges; score plate on the far wall
    box.draw(d);
    d.mesh('plane', d.trs(0, 0.72, -hd - 0.003, 0, 3.6, 0.9, 1), M.score);
    // hall shell
    for (const s of [-1, 1]) {
      d.mesh('box', d.trs(s * (HX + 0.6), 0, HALL_Z0 - HALL_LEN / 2, 0, 1.2, HALL_H, HALL_LEN), M.hallWall);
      d.mesh('bunker:hallPosters', d.trs(s * HX, 0.15, HALL_Z0 - HALL_LEN / 2, -s * Math.PI / 2, HALL_LEN, 4.8, 1), M.hallPoster);
    }
    d.mesh('box', d.trs(0, 0, zBack - 0.6, 0, 2 * HX + 2.4, HALL_H, 1.2), M.hallWall);
    d.mesh('box', d.trs(0, 0, HALL_Z0 + 0.6, 0, 2 * HX + 2.4, HALL_H, 1.2), M.hallWall);
    d.mesh('plane', d.trs(0, 7, zBack + 0.02, 0, 26, 6.5, 1), M.banner);
    d.mesh('plane', d.trs(0, 24, zBack + 0.02, 0, 38, 9.5, 1), M.banner); // seen from the high portrait camera
    // portal frames
    for (const z of BENTS) {
      pillar(d, -1, z);
      pillar(d, 1, z);
      d.mesh('box', d.trs(0, 17.2, z, 0, 2 * (PX - 0.5), 1.8, 1.4), M.beam);
      for (const x of [-8, 0, 8]) d.mesh('box', d.trs(x, 16.3, z, 0, 1.4, 0.7, 0.5), M.strobe);
    }
    for (const z of SIDE_PILLARS) { pillar(d, -1, z); pillar(d, 1, z); }
    // speaker stacks
    for (const [x, z, nc, nr] of STACKS) { stack(d, -x, z, nc, nr); stack(d, x, z, nc, nr); }
    // pipes along the ceiling edge
    for (const [x, y, dia] of PIPES) d.mesh('cylinder', d.euler(x, y, zBack, Math.PI / 2, 0, 0, dia, HALL_LEN, dia), dia > 0.6 ? M.pipeRed : M.pipe);
    // booth, DJ and crowd (they jump on the kick)
    d.mesh('box', d.trs(0, 0, -61, 0, 7, 1.15, 1.6), M.desk);
    d.mesh('box', d.trs(0, 0.9, -60.18, 0, 6.6, 0.06, 0.05), M.led);
    const hop = still ? 0 : st.kick;
    d.mesh('bunker:dj', d.trs(0, hop * 0.08, -62.4, 0, 1, 1, 1), M.crowd);
    for (let i = 0; i < ROWS_Z.length; i++) d.mesh(`bunker:crowd${i}`, d.trs(0, hop * (i % 2 ? 0.24 : 0.14), 0, 0, 1, 1, 1), M.crowd);
  }

  // ---- additive extras: smoke, strobes, lasers, the dot's white core ----
  // Smoke sheets face +z; every one sits behind the far wall or beside the board (|x| - w/2 > 9).
  const SMOKE = [
    [0, -66, 34, 12, 0.1], [-7, -56, 20, 8, 0.4], [8, -50, 20, 7, 0.7], [0, -44, 36, 6, 0.9],
    [-15.5, -6, 10, 7, 0.2], [15.5, -6, 10, 7, 0.5], [-16, -22, 12, 9, 0.3], [16, -22, 12, 9, 0.8],
    [-15, 6, 9, 5, 0.6], [15, 6, 9, 5, 0.15],
  ];
  const SMOKE_COL = [0.6, 0.07, 0.05];
  const LASER = [1, 0.05, 0.03];
  const core = [1, 0.92, 0.88];

  function glows(d) {
    const fx = d.fx, t = fx.time, ch = st.chaos, still = fx.reducedMotion;
    const pov = d.view === 'pov';
    // booth backlight and the hall strobe wash (all behind the board, hidden by it where they overlap)
    d.billboard(0, -2, -72, 46, 22, RED, 0, 0.55 + st.strobe * 0.9);
    if (st.strobe > 0.01) d.billboard(0, 0, -34, 70, 26, RED, 0, st.strobe * 0.32);
    if (st.white > 0.01) d.billboard(0, 0, -40, 60, 30, WHITE, 0, st.white * 0.4);
    // tube halos and strobe units
    for (const z of BENTS.concat(SIDE_PILLARS)) {
      d.billboard(-(PX - 1.0), 1, z, 2.2, 11, RED, 0, 0.12 + st.tubeL * 0.14);
      d.billboard(PX - 1.0, 1, z, 2.2, 11, RED, 0, 0.12 + st.tubeR * 0.14);
    }
    if (st.strobe + st.white > 0.03) {
      for (const z of BENTS) for (const x of [-8, 0, 8]) {
        d.billboard(x, 13.8, z, 5, 5, st.white > st.strobe ? WHITE : RED, 0, (st.strobe + st.white * 2) * 0.9);
      }
    }
    // smoke
    const sm = 0.2 + 0.25 * ch + st.strobe * 0.45;
    for (const [x, z, w, h, seed] of SMOKE) {
      const dx = still ? 0 : Math.sin(t * 0.13 + seed * 9) * 0.8;
      d.glow('plane', d.trs(x + dx, 0, z, 0, w, h, 1), SMOKE_COL, 5, sm, seed, 0.8 + 0.4 * ch);
    }
    d.glow('floorQuad', d.trs(0, 0.3, -24, 0, 44, 1, 28), SMOKE_COL, 5, sm * 0.8, 0.33, 1);
    d.glow('floorQuad', d.trs(-17, 0.3, 4, 0, 14, 1, 30), SMOKE_COL, 5, sm * 0.7, 0.71, 1);
    d.glow('floorQuad', d.trs(17, 0.3, 4, 0, 14, 1, 30), SMOKE_COL, 5, sm * 0.7, 0.52, 1);
    lasers(d, fx, t, ch, still, pov);
    dotCore(d, fx);
  }

  function lasers(d, fx, t, ch, still, pov) {
    const sweep = t * (0.35 + ch * 1.6);
    const jump = !still && ch > 0.45 ? fx.beatIndex + 1 : 0;
    const li = 0.7 + st.strobe * 1.1 + ch * 0.4;
    // fan from the booth, up and toward the board, fading out before the far wall
    const nFan = 4 + Math.round(ch * 8);
    for (let i = 0; i < nFan; i++) {
      const a = -1.15 + (2.3 * (i + 0.5)) / nFan + Math.sin(sweep + i * 0.9) * 0.22 + (jump ? (hash(jump * 13 + i) - 0.5) * 0.5 : 0);
      const e = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(sweep * 0.7 + i * 1.7));
      const dx = Math.sin(a) * Math.cos(e), dy = Math.sin(e), dz = Math.cos(a) * Math.cos(e);
      let L = Math.min(70, (-12 - -61) / Math.max(0.05, dz), (HX - 1 - 0) / Math.max(0.05, Math.abs(dx)));
      L = Math.min(L, (21 - 3.4) / dy);
      const col = ch > 0.7 && i % 3 === 0 ? WHITE : LASER;
      d.beam(0, 3.4, -61, dx * L, 3.4 + dy * L, -61 + dz * L, 0.02, col, li, 0.8, 0.35);
    }
    // scanners hanging from the first two portal beams, raking the floor behind the board
    const nScan = 1 + Math.round(ch * 2);
    for (const z of [BENTS[0], BENTS[1]]) {
      for (const s of [-1, 1]) {
        for (let k = 0; k < nScan; k++) {
          const ph = sweep * (1 + 0.3 * k) + s * 1.3 + z * 0.1 + (jump ? hash(jump * 7 + k + z) * 3 : 0);
          const tx = s * (3 + 9 * (0.5 + 0.5 * Math.sin(ph))), tz = z - 4 - 18 * (0.5 + 0.5 * Math.cos(ph * 0.8));
          d.beam(s * 8, 16.3, z, tx, 0.05, tz, 0.02, LASER, li * 0.9, 0.25, 0.3);
          d.floorGlow(tx, tz, 1.6, LASER, 0.5 + st.strobe);
        }
      }
    }
    // first person only: beams crossing overhead, well above the eye (and so above every cell)
    if (pov) {
      const nX = 3 + Math.round(ch * 4);
      for (let i = 0; i < nX; i++) {
        const ph = sweep * 0.8 + i * 2.1 + (jump ? hash(jump + i * 5) * 2 : 0);
        const y0 = 3.2 + i * 0.7, z0 = -24 + 40 * (0.5 + 0.5 * Math.sin(ph)), z1 = -24 + 40 * (0.5 + 0.5 * Math.sin(ph + 1.9));
        d.beam(-(HX - 1), y0, z0, HX - 1, y0 + 1.2 * Math.sin(ph * 1.3), z1, 0.02, LASER, li, 0, 0.35);
      }
    }
  }

  // White core in front of the red sphere (toward the camera), so the dot differs from the snake
  // by shape and by brightness. Steady: the board never strobes.
  function dotCore(d, fx) {
    const food = d.snap && d.snap.food;
    if (!food) return;
    const [x, z] = d.cellToWorld(food.x, food.y);
    const bob = fx.reducedMotion ? 0 : 0.03 * Math.sin(fx.time * 4.2);
    const y = 0.03 + bob + 0.17;
    let ex = d.eye[0] - x, ey = d.eye[1] - y, ez = d.eye[2] - z;
    const l = Math.hypot(ex, ey, ez) || 1;
    const o = Math.min(0.42, l * 0.5);
    ex = (ex / l) * o; ey = (ey / l) * o; ez = (ez / l) * o;
    d.billboard(x + ex, y + ey - 0.21, z + ez, 0.42, 0.42, core, 0, 1.7);
  }

  return { frame, props, glows };
}
