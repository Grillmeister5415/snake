// Two throwaway test rooms for the engine-ext harness (LEVELS_PLAN 5.6). Not shipped, not in ROOM_IDS.
// They are injected with createRoomRenderer(canvas, { roomIds, roomModules }) and show the new hooks:
//   xstrip: open scrolling strip (F.board.open, uLaneScroll, d.scroll / d.laneZ, items(d))
//   xcube:  floating cube with its own camera (F.custom, F.camera, surface(d), F.protect)

const HUD = { fg: '#ffffff', bg: 'rgba(0,0,0,0.7)', accent: '#2ef6ff', panelFg: '#ffffff', panelBg: 'rgba(0,0,0,0.85)' };
const DEG = Math.PI / 180;

// Shared sky: a dusk gradient with bright vertical bands, so the post effects have something to show.
const SKY = /* glsl */ `
vec3 roomSky(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 col = mix(vec3(0.55, 0.14, 0.42), vec3(0.04, 0.02, 0.14), smoothstep(0.0, 0.5, y));
  float band = step(0.82, fract(atan(d.x, -d.z) * 5.0 + uTime * 0.02));
  col += vec3(1.0, 0.75, 0.25) * band * smoothstep(0.02, 0.2, y) * 0.7;
  return col;
}
`;

function snakeMats(kit) {
  return {
    body: kit.material({ color: [0.2, 0.6, 0.75], emissive: [0.45, 0.85, 1.0] }),
    head: kit.material({ color: [0.3, 0.7, 0.8], emissive: [0.6, 0.95, 1.0] }),
    eye: kit.material({ color: [0, 0, 0], emissive: [0.02, 0.02, 0.05] }),
    dot: kit.material({ color: [0.9, 0.5, 0.1], emissive: [1.0, 0.62, 0.08] }),
  };
}
function basePal() {
  const pal = new Float32Array(24);
  pal.set([0.25, 0.22, 0.35, 0.18, 0.1, 0.2], 0);
  return pal;
}

// ---------------------------------------------------------------- xstrip
export const strip = {
  meta: { id: 'xstrip', name: 'TEST STRIP', year: 'TEST', luma: 0.2, veil: '#100020', weight: 0, hud: HUD },
  glsl: {
    sky: SKY,
    floor: /* glsl */ `
vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) {
  // 4-row stripes fixed to absolute lane rows (period divides 256): they travel with the lane
  float Y = p.y + uLaneScroll.y + uBoard.y;
  float k = step(0.5, fract(Y / 4.0));
  gloss = 0.15;
  return mix(vec3(0.08, 0.03, 0.12), vec3(0.32, 0.12, 0.05), k);
}
`,
  },
  create(kit) {
    const F = {
      pal: basePal(), room: new Float32Array(16), fog: [0.3, 0.1, 0.3],
      board: { open: true, panel: [0.02, 0.015, 0.05], grid: [0.12, 0.5, 0.6], frame: [1, 0.4, 0.9], band: 0.3 },
      snake: { ...snakeMats(kit), pool: [0.1, 0.5, 0.8], poolIntensity: 0.2 },
      wall: [1, 0.3, 0.8],
    };
    const pillar = kit.material({ color: [0.5, 0.35, 0.6], emissive: [0.15, 0.03, 0.1], lines: 1, lineColor: [1, 0.6, 0.2] });
    const stem = kit.material({ color: [0.9, 0.85, 0.75], emissive: [0.2, 0.15, 0.1] });
    const cap = kit.material({ color: [0.6, 0.1, 0.7], emissive: [0.7, 0.05, 0.6] });
    return {
      frame(fx, snap) { // open strip in lane space; a closed board otherwise (lets the harness test items on a closed board)
        F.board.open = !!(snap.space && snap.space.kind === 'lane');
        return F;
      },
      // repeating props: one pillar every 4 absolute rows on each side, placed with d.laneZ
      props(d) {
        const base = Math.floor(d.scroll / 4) * 4;
        for (let k = -40; k <= 12; k++) {
          const z = d.laneZ(base + k * 4);
          for (const sx of [-1, 1]) d.mesh('box', d.trs(sx * 11, 0, z, 0, 0.8, 3, 0.8), pillar);
        }
      },
      // a tall test item on snap.mushroom, taller than the engine's board volume (0.46)
      items(d) {
        const m = d.snap.mushroom;
        if (!m) return;
        const [x, z] = d.cellToWorld(m.x, m.y);
        d.mesh('cylinder', d.trs(x, 0, z, 0, 0.3, 0.7, 0.3), stem);
        d.mesh('ball', d.trs(x, 0.6, z, 0, 0.8, 0.55, 0.8), cap);
      },
    };
  },
};

// ---------------------------------------------------------------- xcube
export const cube = {
  meta: { id: 'xcube', name: 'TEST CUBE', year: 'TEST', luma: 0.2, veil: '#100020', weight: 0, hud: HUD },
  glsl: {
    sky: SKY,
    floor: 'vec3 roomFloor(vec2 p, float dist, inout float gloss, inout vec3 n) { return vec3(0.0); }\n',
  },
  create(kit) {
    const mats = snakeMats(kit);
    const body = kit.material({ color: [0.02, 0.02, 0.05], emissive: [0.01, 0.01, 0.03] });
    const grid = kit.material({ color: [0.03, 0.03, 0.06], emissive: [0.0, 0.0, 0.02], lines: 1, lineWidth: 0.03, lineColor: [0.12, 0.4, 0.5], uvScale: [16, 16] });
    const H = 8, E = 0.003;
    const F = {
      pal: basePal(), room: new Float32Array(16), fog: [0.3, 0.1, 0.3],
      custom: true, floor: false, reflections: false,
      camera: { eye: [17, 36, 25], target: [0, -0.5, 0], up: [0, 1, 0], fovy: 45 },
      // the three faces the camera sees: top (the board), front (+z), right (+x)
      protect: [
        { origin: [-H, H, -H], u: [2 * H, 0, 0], v: [0, 0, 2 * H], h: 0.5 },
        { origin: [-H, -H, H], u: [2 * H, 0, 0], v: [0, 2 * H, 0], h: 0.5 },
        [[H, -H, H], [H, -H, -H], [H, H, -H], [H, H, H]], // the corner-list form works too
      ],
    };
    return {
      frame() {
        const need = 0.34; // tan of the half angle the cube needs from this eye, with a margin
        const asp = kit.aspect();
        F.camera.fovy = (2 * Math.atan(Math.max(need, need / asp))) / DEG;
        return F;
      },
      surface(d) {
        const s = d.snap;
        d.mesh('box', d.trs(0, -H, 0, 0, 2 * H, 2 * H, 2 * H), body);
        d.mesh('floorQuad', d.trs(0, H + E, 0, 0, 2 * H, 1, 2 * H), grid);
        d.mesh('plane', d.trs(0, -H, H + E, 0, 2 * H, 2 * H, 1), grid);
        d.mesh('plane', d.trs(H + E, -H, 0, Math.PI / 2, 2 * H, 2 * H, 1), grid);
        // the top face is the board in its own frame, so the engine's smoothed layout maps straight onto it
        const g = d.segs;
        for (let i = g.n - 1; i >= 0; i--) {
          d.mesh(i ? 'block' : 'head', d.trs(g.x[i], H + 0.004, g.z[i], 0, i ? 0.78 : 0.88, 0.26, i ? 0.78 : 0.88), i ? mats.body : mats.head);
        }
        if (s.food) {
          const [x, z] = d.cellToWorld(s.food.x, s.food.y);
          d.mesh('gem', d.trs(x, H + 0.03, z, d.fx.time, 0.56, 0.3, 0.56), mats.dot);
        }
      },
      glows(d) {
        for (let i = 0; i < 6; i++) d.billboard(-30 + i * 12, 2 + (i % 3) * 6, -40, 8, 5, [0.6, 0.3, 0.8], 0, 0.6);
      },
    };
  },
};
