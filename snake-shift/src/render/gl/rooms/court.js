/* =====================================================================================
   ROOM MODULE INTERFACE  (gl stream; one new room = one new file in this folder)
   =====================================================================================
   engine.js imports rooms/<id>.js for every id in ROOM_IDS (court, disco, plastic, bunker)
   and skips a file that is missing or exports no `meta` (placeholders do that).

   export const meta = {            // same shape as a flat timeline's meta (BUILD_PLAN 15.3)
     id, name, year, luma, veil, weight, hud: { fg, bg, accent, panelFg, panelBg },
   };                                // the engine adds kind: '3d' and views: ['board', 'pov']

   export const glsl = {             // compiled into this room's sky, floor and mesh programs
     sky:   'vec3 roomSky(vec3 d) { ... }',
            //  d = normalized world direction. Must handle d.y < 0 (what chrome sees below the
            //  horizon). The sky pass passes |d.y| so below the horizon it shows the mirror image.
     floor: 'vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) { ... }',
            //  Floor pattern OUTSIDE the board (world xz `p`). Set gloss 0..1 (sky reflection and
            //  how much of the mirrored props shows) and optionally perturb n (water ripples).
            //  The engine draws the board panel, grid lines and frame band itself.
   };
   Both may use the prelude in shaders.js: uTime uBeat uPunch uChaos uVariant uBeatIndex uCutAge,
   uBite (x, z, age s, has), uPal[8] (uPal[0]/[1] are the mesh ambient sky/ground colours),
   uRoom[4] (free vec4s), uEye, uBoard, hash12, rot2, hueRotate, aaWidth, checkerAA, gridAA, PI.

   export function create(kit) -> instance        // called once after the programs compiled
     kit = { gl, m4, geometry, cols, rows, deriv, material(opts), addGeometry(name, geo),
             texture(canvas, { repeat, mipmap }) }   // texture: e.g. a poster sheet canvas
     material opts: color, emissive, lineColor, rim (rgb arrays), chrome 0..1,
                    lines (outline count per UV unit, 0 = off), lineWidth, mode (0 solid,
                    1 arcade cut-outs, 2 textured with `tex`), twoSided, uvScale [u, v], fog 0..1.
     Built-in geometry names: box/block, head, gem, pyramid, cone, cylinder, ball (base y = 0,
     1 unit), sphere, torus (centred), plane (vertical XY, y 0..1), floorQuad.

   instance = {
     frame(fx, snap, view) -> F     // every frame, before drawing; return a persistent object:
       F.pal: Float32Array(24)      // uPal[8]
       F.room: Float32Array(16)     // uRoom[4]
       F.board: { panel, grid, frame, lineWidth, band, gridGlow, frameGlow }
       F.snake: { body, head, eye, dot (materials), bodyGeom, headGeom, dotGeom,
                  bodySize, headSize, dotSize ([w, h, d]; heights clamped to 0.34),
                  pool, dotPool (rgb), poolIntensity, segment(i, n, bodyMat, fx, snap) }
       F.ring, F.wall, F.beacon: rgb for bite ring, first-person energy walls, dot beam
       F.fog: rgb horizon haze that distant floor and props fade into
       F.curb = false hides the engine's low curb; F.reflections = false skips mirrored props.
     props(d)  -> opaque set dressing, OUTSIDE the board only. Called twice per frame: first with
                  d.mirror = true (reflection under the floor), then normally. Meshes only.
     glows(d)  -> optional additive extras (depth write off). Glow calls only.
   }
   d = { view, fx, snap, mirror, eye, cols, rows, kit, trs(...), euler(...), cellToWorld(x, y),
         mesh(geomName, model, material), glow(geomName, model, rgb, mode, intensity, p1, p2),
         billboard(x, y, z, w, h, rgb, mode, intensity), floorGlow(x, z, size, rgb, intensity),
         ring(x, z, size, rgb, intensity, radius, width) }
   Glow modes: 0 soft blob, 1 ring (p1 radius 0..1, p2 width), 2 energy wall (p1/p2 grid
   cells across/up), 3 vertical beam.
   Added in wave 2 (rooms-a), all optional; see rooms/bunker.js for use:
     kit.boxRoom(opts) -> walls on the lethal edges with a poster sheet (boxroom.js); .draw(d) in props
     kit.posterSheet(o), kit.concreteSheet(o), kit.canvas(w, h), kit.updateTexture(tex, canvas)
     kit.geometry.planeUV(u0, u1, v0, v1), kit.geometry.merge([{ g, t, s }]) (one draw per crowd)
     d.beam(x0,y0,z0, x1,y1,z1, width, rgb, intensity, fade, halo) -> laser line (glow mode 4)
     glow mode 5 = smoke sheet (p1 seed, p2 density); F.povWalls = false hides the energy walls;
     F.snake.dotPoolBeat (default 0.6) sets how much the dot's floor pool pulses on the beat.
   Added by engine-ext (LEVELS_PLAN 5), all optional; dev/gl.rooms.js (xstrip, xcube) uses every one:
     ROOM_IDS also lists lane, hangar, mushroom, castle, abyss (a missing file is skipped).
     Snapshots (LEVELS_PLAN 3.3): the engine honours snap.breaks and adjacency (never interpolates across a
       break or between cells that are not neighbours), treats a null prevTail as no tail motion, draws
       every cell where it is while snap.waiting is set, and draws no dot when snap.food is null.
     instance.items(d) -> opaque meshes ON the board (the mushroom); called after snake and dot, both views,
       never mirrored. Every d.mesh drawn here adds its world bounds to the post-effects mask, so items may
       be taller than the board volume (0.46). Meshes only; glow extras belong in glows(d).
     d.segs = { n, x, z, link }: smoothed segment centres (world x, z; head = 0); link[i] = 1 when segment i
       is joined to i + 1. Draw a connection only where link is 1. d.progress: the tick fraction used
       (1 at tick 0, dead or waiting). d.protectBox(x0, y0, z0, x1, y1, z1): keep a world box effect-free.
     kit.aspect() -> canvas width / height (e.g. to pick F.camera.fovy inside frame()).
     Lane (snap.space.kind === 'lane'): board-local rows sit against an origin gliding from space.prevY0 to
       space.y0 over the tick, so snake, dot, pools, bite ring and the first-person camera move smoothly.
       d.lane (bool); d.scroll = that smooth origin (absolute row of the window's top row; 0 outside lanes);
       d.laneZ(Y) = world z of absolute lane row Y (= Y - d.scroll - rows/2 + 0.5); d.cellToWorld is
       lane-aware. Repeating props: base = Math.floor(d.scroll / P) * P, place at d.laneZ(base + k * P).
       GLSL, every room program: uLaneScroll = vec4(origin row, origin mod 256, 1 in lane space, tick
       fraction). Absolute row under world z = z + uLaneScroll.x + uBoard.y - 0.5; for floor patterns use
       p.y + uLaneScroll.y + uBoard.y with a period that divides 256 (stays precise on long runs).
     F.board.open = true: the board is a strip cols wide running to the horizon both ways. Frame bands and
       curbs on the two sides only, grid scrolls with the lane, first-person energy walls on the sides only
       (grid on absolute rows), the post mask covers the whole strip. In lane space the dot is drawn from
       snap.foodAt, so it shows on the strip ahead of the window.
     F.custom = true: the engine draws no board panel, grid, frame band, curb, snake, dot, pools, bite rings
       or energy walls, drops its board volume from the post mask, and calls instance.surface(d) instead.
     instance.surface(d) -> opaque meshes in the main pass when F.custom: the room's own board, snake, dot.
     F.camera = { eye, target, up = [0, 1, 0], fovy (vertical degrees, default 50), near = 0.1 } replaces
       the engine camera in both views while set (any room; invalid values fall back).
     F.protect = [quad, ...]: world quads the post pass keeps clean. quad = { origin, u, v, h } (corner, two
       edge vectors, h = thickness each way along the normal, default 0.5) or four corners [[x, y, z] x 4]
       in order. At most 8 volumes per frame together with item bounds; extras merge into one box.
     F.floor = false skips the floor pass and the mirrored props (e.g. a cube floating in the sky).
     createRoomRenderer option roomModules: { id: module } injects room modules (harness test rooms).
   Rules: never write game state; props stay outside the board and never in the wedge between
   the board-view camera and the near edge (|x| > cols/2 + 0.5 or z < -rows/2 - 0.5);
   nothing hangs above the board. Animate from fx.time; fx already honours both switches,
   but check fx.reducedMotion before adding positional motion of your own.
   ===================================================================================== */

export const meta = {
  id: 'court',
  name: 'REALITY.EXE',
  year: '2088',
  luma: 0.25,
  veil: '#2a0a3c',
  weight: 3,
  hud: { fg: '#fff3ff', bg: 'rgba(24,4,44,0.72)', accent: '#2ef6ff', panelFg: '#ffe9ff', panelBg: 'rgba(26,4,52,0.88)' },
};

export const glsl = {
  sky: /* glsl */ `
// uPal: 2 zenith, 3 mid, 4 horizon, 5 sun low, 6 sun high, 7 horizon glow
// uRoom[0] checker A + gloss, [1] checker B + scroll, [2] ripple, tile flash, sky hue, star warp
// uRoom[3] sun scale, stripe speed, nebula, punch flash
vec3 courtGround(vec3 d) {
  vec2 g = d.xz / max(-d.y, 0.04) * 0.6;
  float c = checkerAA(g, vec2(0.05) + abs(g) * 0.02);
  vec3 col = mix(uRoom[1].rgb, uRoom[0].rgb, c);
  return mix(col, uPal[4], exp(d.y * 7.0));
}
vec3 roomSky(vec3 d) {
  vec3 col;
  if (d.y < 0.0) {
    col = courtGround(d);
  } else {
    float y = d.y;
    col = mix(uPal[4], uPal[3], smoothstep(0.0, 0.3, y));
    col = mix(col, uPal[2], smoothstep(0.25, 0.95, y));
    float az = atan(d.x, -d.z);
    // nebula band
    float bandY = 0.45 + 0.17 * sin(az * 1.3 + 0.8);
    float band = exp(-pow((y - bandY) * 5.0, 2.0));
    float wisp = 0.5 + 0.5 * sin(az * 9.0 + y * 23.0 + sin(az * 3.0 + uTime * 0.2) * 2.0);
    col += vec3(0.55, 0.12, 0.75) * band * wisp * uRoom[3].z;
    // stars (stretch and stream when warped)
    float warp = 1.0 + uRoom[2].w * 7.0;
    vec2 sp = vec2(az * 46.0, y * 64.0 / warp + uTime * uRoom[2].w * 3.0);
    vec2 cell = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float h = hash12(cell);
    if (h > 0.88) {
      vec2 q = f - (vec2(hash12(cell + 7.1), hash12(cell + 3.3)) - 0.5) * 0.6;
      q.y /= warp;
      float s = exp(-dot(q, q) * 110.0);
      float tw = 0.55 + 0.45 * sin(uTime * (2.0 + h * 6.0) + h * 40.0);
      col += vec3(1.0, 0.86, 1.0) * s * tw * smoothstep(0.02, 0.2, y) * (h - 0.88) * 12.0;
    }
    // the giant striped sun, centre 3 degrees above the horizon, radius 13 degrees
    vec3 sd = vec3(0.0, 0.0523, -0.9986);
    float R = 0.227 * uRoom[3].x;
    float ang = acos(clamp(dot(d, sd), -1.0, 1.0));
    col += uPal[5] * exp(-max(ang - R, 0.0) * 11.0) * (0.12 + 0.6 * uBeat);
    if (ang < R + 0.01) {
      float sy = (y - sd.y) / R;
      vec3 sc = mix(uPal[5], uPal[6], smoothstep(-0.7, 0.8, sy)) * (1.0 + 0.35 * uBeat + uPunch);
      float k = fract(sy * 6.5 - uTime * uRoom[3].y);
      float gw = clamp(0.1 - sy * 0.4, 0.0, 0.85);
      float gap = gw > 0.0 ? 1.0 - smoothstep(gw - 0.05, gw + 0.02, k) : 0.0;
      float disk = 1.0 - smoothstep(R - 0.003, R + 0.003, ang);
      col = mix(col, sc, disk * (1.0 - gap));
    }
    // horizon line
    col += uPal[7] * (exp(-y * 34.0) * (0.55 + 1.1 * uBeat + uPunch) + exp(-y * 7.0) * 0.12);
  }
  col = hueRotate(col, uRoom[2].z);
  col += uPal[4] * uPunch * uRoom[3].w * 0.5;
  return col;
}
`,
  floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  vec2 q = (p + uBoard) * 0.5;               // 2-cell tiles aligned to the board corner
  q.y -= uTime * uRoom[1].w;                 // marching checker with chaos
  vec2 w = aaWidth(p) * 0.5;
  float c = checkerAA(q, w);
  vec3 A = uRoom[0].rgb * (1.0 + uBeat * uRoom[2].y);
  vec3 col = mix(uRoom[1].rgb, A, c);
  col += uPal[7] * gridAA(q, 0.015, w) * 0.35;
  // random tiles flare on the beat as chaos rises
  float tile = hash12(floor(q) + vec2(uBeatIndex * 7.0, uBeatIndex * 3.0));
  col += mix(uPal[7], vec3(0.2, 0.95, 1.0), step(0.5, fract(tile * 13.0))) * step(1.0 - 0.3 * uChaos, tile) * uBeat * 1.6 * step(0.05, uChaos);
  // shock ring from the last bite racing across the floor
  float bd = length(p - uBite.xy);
  float ring = exp(-pow((bd - uBite.z * 26.0) * 0.45, 2.0)) * exp(-uBite.z * 1.4) * uBite.w;
  col += uPal[7] * ring * uRoom[2].x * 2.5;
  // beat wave rolling out from the board
  float r = max(abs(p.x) - uBoard.x, abs(p.y) - uBoard.y);
  col += uPal[7] * exp(-pow(r - (1.0 - uBeat) * 18.0, 2.0) * 0.08) * uBeat * 0.6;
  gloss = mix(uRoom[0].w, uRoom[0].w * 0.6, c);
  return col;
}
`,
};

const TAU = Math.PI * 2;

const BOARD_PALETTES = [
  { grid: [0.15, 0.85, 1.0], frame: [0.35, 1.0, 1.0] },
  { grid: [1.0, 0.85, 0.15], frame: [1.0, 0.95, 0.3] },
  { grid: [0.55, 1.0, 0.25], frame: [0.62, 1.0, 0.3] },
  { grid: [0.85, 0.85, 1.0], frame: [1.0, 1.0, 1.0] },
  { grid: [0.65, 0.45, 1.0], frame: [0.75, 0.6, 1.0] },
  { grid: [1.0, 0.5, 0.2], frame: [1.0, 0.62, 0.25] },
];

const FOG = [0.85, 0.24, 0.62];
const NEON = [[1.0, 0.25, 0.8], [0.2, 0.95, 1.0], [1.0, 0.85, 0.2], [0.6, 1.0, 0.3]];

function setRGB(arr, i, c, k = 1) {
  arr[i * 3] = c[0] * k;
  arr[i * 3 + 1] = c[1] * k;
  arr[i * 3 + 2] = c[2] * k;
}

// Cheap hue rotation for rgb arrays (same maths as the GLSL hueRotate).
function hueRotate(out, c, a) {
  const k = 0.57735, ca = Math.cos(a), sa = Math.sin(a);
  const dot = k * (c[0] + c[1] + c[2]) * (1 - ca);
  const cx = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])];
  out[0] = c[0] * ca + cx[0] * sa + k * dot;
  out[1] = c[1] * ca + cx[1] * sa + k * dot;
  out[2] = c[2] * ca + cx[2] * sa + k * dot;
  return out;
}

export function create(kit) {
  const { material } = kit;
  kit.addGeometry('thinTorus', kit.geometry.torus(0.5, 0.006, 160, 6));
  const cols = kit.cols, rows = kit.rows;

  // ---- materials ----
  const M = {
    arcade: material({ color: [0.32, 0.07, 0.42], emissive: [0.1, 0.0, 0.16], chrome: 0.35, mode: 1, twoSided: true,
      lines: 1, lineWidth: 0.025, lineColor: [1, 0.3, 0.85], uvScale: [24, 1] }),
    arcadeBack: material({ color: [0.2, 0.04, 0.3], emissive: [0.05, 0.0, 0.1], chrome: 0.2, mode: 1, twoSided: true,
      lines: 1, lineWidth: 0.02, lineColor: [0.3, 0.8, 1], uvScale: [24, 1] }),
    beam: material({ color: [0.2, 0.05, 0.3], chrome: 0.4, lines: 1, lineWidth: 0.03, lineColor: [1, 0.35, 0.9] }),
    strip: material({ color: [0, 0, 0], emissive: [1, 0.3, 0.85] }),
    spire: material({ color: [0.12, 0.04, 0.22], chrome: 0.65, lines: 1, lineWidth: 0.04, lineColor: [0.2, 0.95, 1], uvScale: [8, 1] }),
    spireBase: material({ color: [0.15, 0.05, 0.25], chrome: 0.4, lines: 1, lineWidth: 0.05, lineColor: [1, 0.3, 0.8] }),
    ring: material({ color: [0, 0, 0], emissive: [1, 0.85, 0.2] }),
    ring2: material({ color: [0, 0, 0], emissive: [0.2, 0.9, 1] }),
    pyramid: material({ color: [0.05, 0.02, 0.1], chrome: 0.35, lines: 5, lineWidth: 0.03, lineColor: [0.2, 0.9, 1] }),
    chrome: material({ color: [0.85, 0.85, 0.95], chrome: 1 }),
    cube: material({ color: [0.04, 0.0, 0.07], chrome: 0.3, emissive: [0.08, 0.0, 0.1], lines: 1, lineWidth: 0.05, lineColor: [1, 0.25, 0.9] }),
    cubeInner: material({ color: [0, 0, 0], emissive: [0.3, 0.25, 0.0], lines: 1, lineWidth: 0.08, lineColor: [1, 0.9, 0.2] }),
    step: material({ color: [0.06, 0.02, 0.1], chrome: 0.2, lines: 1, lineWidth: 0.05, lineColor: [1, 0.85, 0.15] }),
    skyRing: material({ color: [0, 0, 0], emissive: [0.15, 0.7, 1.0], fog: 0.3 }),
    skyRing2: material({ color: [0, 0, 0], emissive: [1.0, 0.2, 0.75], fog: 0.3 }),
  };

  const snakeBody = material({ color: [0.08, 0.42, 0.58], emissive: [0.12, 0.7, 0.95], chrome: 0.3,
    lines: 1, lineWidth: 0.08, lineColor: [0.75, 1, 1], rim: [0.3, 0.6, 1] });
  const snakeHead = material({ color: [0.85, 0.95, 1], emissive: [0.6, 0.8, 0.9], chrome: 0.2,
    lines: 1, lineWidth: 0.06, lineColor: [1, 1, 1], rim: [0.5, 0.8, 1] });
  const snakeEye = material({ color: [0.02, 0.01, 0.06], emissive: [0, 0, 0] });
  const dot = material({ color: [1, 0.85, 0.1], emissive: [1, 0.72, 0.05], chrome: 0.25,
    lines: 1, lineWidth: 0.05, lineColor: [1, 1, 0.75] });
  const BODY_EMIT = [0.12, 0.7, 0.95];

  // ---- layout (all outside the board, never in front of its near edge) ----
  const spires = [
    [-21, -16, 2.2, 22], [22, -20, 2.4, 26], [-27, -40, 2.8, 30], [26, -46, 2.6, 28],
    [-18, -70, 3.0, 34], [19, -78, 3.0, 32], [-40, -95, 3.6, 40], [42, -105, 3.6, 38],
  ];
  const pyramids = [
    [-11, -13, 4, 3], [12, -15, 5, 3.6], [-16, -26, 8, 6], [17, -31, 7, 5],
    [-9.5, -38, 6, 4], [10, -44, 9, 6.5], [-32, -22, 10, 7], [33, -12, 8, 6],
  ];
  const spheres = [[11, 5.5, 1.3], [-11.5, 5, 1.0], [13, -9, 2.0], [-18, 7, 2.6], [24, -24, 3.2], [-24, -9, 2.0]];
  const CX = cols / 2 + 6.5, ZC = -50, LEN = 120;

  const pal = new Float32Array(24);
  const room = new Float32Array(16);
  const tmp = [0, 0, 0];
  const F = {
    pal, room,
    board: { panel: [0.025, 0.012, 0.055], grid: [0, 0, 0], frame: [0, 0, 0], lineWidth: 0.028, band: 0.32, gridGlow: 0.6, frameGlow: 0.9 },
    snake: {
      body: snakeBody, head: snakeHead, eye: snakeEye, dot,
      bodySize: [0.78, 0.26, 0.78], headSize: [0.88, 0.3, 0.88], dotSize: [0.58, 0.3, 0.58],
      pool: [0.1, 0.6, 1.0], dotPool: [1, 0.72, 0.1], poolIntensity: 0.32,
      segment: null,
    },
    ring: [1, 0.9, 0.45], wall: [0.3, 0.9, 1], beacon: [1, 0.82, 0.3], fog: [0.85, 0.24, 0.62],
  };

  let alive = true, chaos = 0, time = 0;
  F.snake.segment = (i, n, mat) => {
    const t = i / Math.max(1, n - 1);
    const k = alive ? 1 - 0.35 * t : 0.25;
    if (alive && chaos > 0.45) {
      hueRotate(tmp, BODY_EMIT, (chaos - 0.45) * 2.2 * (t * 4 - time * 1.5));
      mat.emissive[0] = Math.max(0.05, tmp[0]) * k;
      mat.emissive[1] = Math.max(0.05, tmp[1]) * k;
      mat.emissive[2] = Math.max(0.05, tmp[2]) * k;
    } else {
      mat.emissive[0] = (alive ? BODY_EMIT[0] : 0.3) * k;
      mat.emissive[1] = (alive ? BODY_EMIT[1] : 0.3) * k;
      mat.emissive[2] = (alive ? BODY_EMIT[2] : 0.34) * k;
    }
  };

  function frame(fx, snap) {
    alive = snap.alive !== false;
    chaos = fx.chaos;
    time = fx.time;
    const v = fx.variant;
    const bp = BOARD_PALETTES[((v % BOARD_PALETTES.length) + BOARD_PALETTES.length) % BOARD_PALETTES.length];
    for (let i = 0; i < 3; i++) {
      F.board.grid[i] = bp.grid[i] * 0.6;
      F.board.frame[i] = bp.frame[i];
    }
    F.wall = bp.frame;

    // sky + ambient palette
    setRGB(pal, 0, [0.35, 0.2, 0.55]);
    setRGB(pal, 1, [0.45, 0.08, 0.3]);
    setRGB(pal, 2, [0.03, 0.0, 0.09]);
    setRGB(pal, 3, [0.2, 0.03, 0.36]);
    setRGB(pal, 4, [0.95, 0.22, 0.6]);
    const sunAlt = v % 2 === 1 && fx.chaos > 0.2;
    setRGB(pal, 5, sunAlt ? [0.2, 0.6, 1.0] : [1.0, 0.18, 0.55]);
    setRGB(pal, 6, sunAlt ? [0.9, 1.0, 1.0] : [1.0, 0.92, 0.35]);
    setRGB(pal, 7, [1.0, 0.45, 0.85]);

    // checker: pink and black, swapped by a bite punch; hue steps on the beat at high chaos
    let A = [1.0, 0.13, 0.6], B = [0.025, 0.0, 0.04];
    if (fx.chaos > 0.6) A = hueRotate([0, 0, 0], A, (fx.beatIndex % 4) * 0.55 * (fx.chaos - 0.4));
    if (fx.punch > 0.3) { const t = A; A = B; B = t; }
    room[0] = A[0]; room[1] = A[1]; room[2] = A[2]; room[3] = 0.62;
    room[4] = B[0]; room[5] = B[1]; room[6] = B[2]; room[7] = fx.reducedMotion ? 0 : fx.chaos * 2.2;
    room[8] = fx.reducedFlash ? 0.25 : 1;                                   // bite shock ring
    room[9] = 0.35 + 0.9 * fx.chaos;                                        // tile flash on beat
    const hue = fx.chaos > 0.35 ? ((v * 1.3) % TAU) * Math.min(1, (fx.chaos - 0.35) * 3) : 0;
    room[10] = hue + (fx.chaos > 0.75 ? (fx.beatIndex % 2) * 0.35 : 0);     // sky hue
    room[11] = fx.reducedMotion ? 0 : Math.max(0, fx.chaos - 0.3) * 1.4;    // star warp
    hueRotate(F.fog, FOG, room[10]);
    room[12] = 1 + 0.08 * fx.beat + 0.14 * fx.punch;                        // sun scale
    room[13] = 0.25 + fx.chaos * 0.9;                                       // stripe scroll
    room[14] = 0.7 + 0.5 * fx.chaos;                                        // nebula
    room[15] = 1;                                                           // punch flash

    // neon accents step with the variant (and with the beat once it gets wild)
    const ni = v + (fx.chaos > 0.5 ? fx.beatIndex : 0);
    M.strip.emissive.set(NEON[ni % NEON.length]);
    M.ring.emissive.set(NEON[(ni + 2) % NEON.length]);
    M.pyramid.lineColor.set(NEON[(v + 1) % NEON.length]);
    const pulse = 1 + fx.beat * 1.2 + fx.punch;
    for (let i = 0; i < 3; i++) {
      M.pyramid.lineColor[i] *= pulse;
      M.spire.lineColor[i] = [0.2, 0.95, 1][i] * (0.8 + fx.beat);
    }

    snakeHead.emissive.set(alive ? [0.6, 0.8, 0.9] : [0.28, 0.28, 0.32]);
    snakeHead.lineColor.set(alive ? [1, 1, 1] : [0.5, 0.5, 0.55]);
    snakeBody.lineColor.set(alive ? [0.75, 1, 1] : [0.45, 0.45, 0.5]);
    dot.emissive.set([1, 0.72 + 0.2 * fx.beat, 0.05]);
    return F;
  }

  function props(d) {
    const fx = d.fx;
    const t = fx.time;
    const still = fx.reducedMotion;
    // colonnades
    for (const s of [-1, 1]) {
      d.mesh('plane', d.trs(s * CX, 0, ZC, Math.PI / 2, LEN, 8, 1), M.arcade);
      d.mesh('plane', d.trs(s * (CX + 2.2), 0, ZC, Math.PI / 2, LEN, 8, 1), M.arcadeBack);
      d.mesh('box', d.trs(s * (CX + 1.1), 8, ZC, 0, 3, 0.9, LEN), M.beam);
      d.mesh('box', d.trs(s * (CX - 0.05), 7.75, ZC, 0, 0.14, 0.14, LEN), M.strip);
      d.mesh('box', d.trs(s * (CX - 0.05), 0.0, ZC, 0, 0.14, 0.14, LEN), M.strip);
    }
    // stairs with neon edges
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        d.mesh('box', d.trs(s * (10.6 + k * 0.85), 0, -1, 0, 0.85, 0.45 * (k + 1), 6), M.step);
      }
    }
    // spires with bouncing rings
    for (let i = 0; i < spires.length; i++) {
      const [x, z, r, h] = spires[i];
      d.mesh('cylinder', d.trs(x, 0, z, 0, r * 2.6, 2.2, r * 2.6), M.spireBase);
      d.mesh('cone', d.trs(x, 2.2, z, 0, r * 2, h, r * 2), M.spire);
      const hop = still ? 0 : fx.beat * 1.2;
      const wob = still ? 0 : Math.sin(t * 1.3 + i) * 0.25;
      d.mesh('torus', d.euler(x, 2.2 + h * 0.42 + hop, z, wob, t * 0.5, 0, r * 4.4, r * 4.4, r * 4.4), i % 2 ? M.ring2 : M.ring);
      d.mesh('torus', d.euler(x, 2.2 + h * 0.66 + hop * 0.6, z, -wob, -t * 0.7, 0.2, r * 3.2, r * 3.2, r * 3.2), i % 2 ? M.ring : M.ring2);
    }
    // wireframe pyramids
    for (let i = 0; i < pyramids.length; i++) {
      const [x, z, b, h] = pyramids[i];
      d.mesh('pyramid', d.trs(x, 0, z, 0.3 * i, b, h * (1 + 0.12 * fx.beat), b), M.pyramid);
    }
    // chrome spheres hopping on the beat
    for (let i = 0; i < spheres.length; i++) {
      const [x, z, r] = spheres[i];
      const hop = still ? 0 : fx.beat * (0.25 + fx.chaos) * r * 0.5 * (i % 2 ? 1 : 0.6);
      d.mesh('sphere', d.trs(x, r + hop, z, 0, r * 2, r * 2, r * 2), M.chrome);
    }
    // floating wire cubes, spinning faster with chaos
    const spin = still ? 0.3 : t * (0.4 + fx.chaos * 2.5);
    d.mesh('box', d.euler(-13.5, 5.2, -3, spin, spin * 0.7, 0.4, 2.6, 2.6, 2.6), M.cube);
    d.mesh('box', d.euler(-13.5, 6.0, -3, -spin * 1.3, spin, 0.2, 0.9, 0.9, 0.9), M.cubeInner);
    d.mesh('box', d.euler(16, 7, -22, spin * 0.8, -spin, 0.3, 3.6, 3.6, 3.6), M.cube);
    d.mesh('box', d.euler(16, 8.2, -22, spin * 1.5, spin, 0, 1.2, 1.2, 1.2), M.cubeInner);
    // giant rings standing on the horizon
    if (!d.mirror) {
      d.mesh('thinTorus', d.euler(0, 4, -125, Math.PI / 2 - 0.1, 0, t * 0.1, 100, 100, 100), M.skyRing);
      d.mesh('thinTorus', d.euler(0, 10, -170, Math.PI / 2 + 0.3, 0.35, -t * 0.15, 170, 170, 170), M.skyRing2);
    }
  }

  const tipCol = [0.3, 0.9, 1], tipCol2 = [1, 0.3, 0.85];
  function glows(d) {
    const fx = d.fx;
    for (let i = 0; i < spires.length; i++) {
      const [x, z, r, h] = spires[i];
      d.billboard(x, 2.2 + h - 3, z, 6, 6, i % 2 ? tipCol : tipCol2, 0, 0.5 + fx.beat * 0.9);
    }
    for (const [x, z, r] of spheres) d.floorGlow(x, z, r * 4, tipCol2, 0.25 + fx.beat * 0.3);
  }

  return { frame, props, glows };
}

// Life slot (LEVELS_PLAN 4.3), plain Canvas 2D, no WebGL: a glass block. Filled = cyan glass with a
// bright rim and a diagonal glint, rim turning neon magenta as chaos rises; hollow = the bare rim.
export function life(ctx, x, y, size, filled, fx) {
  const s = size * 0.76, x0 = x + (size - s) / 2, y0 = y + (size - s) / 2, r = s * 0.16;
  const k = Math.max(0, Math.min(1, ((fx && fx.chaos) || 0) * 1.4 - 0.3));
  const rim = `rgb(${Math.round(234 + 21 * k)},${Math.round(255 - 191 * k)},${Math.round(255 - 51 * k)})`;
  const box = () => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, s, s, r) : ctx.rect(x0, y0, s, s); };
  ctx.save();
  box();
  if (filled) {
    const g = ctx.createLinearGradient(x0, y0, x0 + s, y0 + s);
    g.addColorStop(0, 'rgba(170,245,255,0.95)'); g.addColorStop(1, 'rgba(40,150,210,0.9)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1, size * 0.07); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + s * 0.2, y0 + s * 0.62); ctx.lineTo(x0 + s * 0.62, y0 + s * 0.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, size * 0.08); ctx.lineCap = 'round'; ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(46,246,255,0.1)'; ctx.fill();
    ctx.strokeStyle = 'rgba(46,246,255,0.75)'; ctx.lineWidth = Math.max(1.2, size * 0.08); ctx.stroke();
  }
  ctx.restore();
}
