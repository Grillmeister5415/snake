// SNAKE//SHIFT room renderer: hand-written WebGL 1, no libraries.
// Contract (BUILD_PLAN 15.3):
//   createRoomRenderer(canvas, { cols, rows }) -> Promise<null | { rooms, resize, render, lost }>
// Extra options in the same object: roomIds (override the room list), breakShaders (test the null path),
// post: false (no post-effects pass), postMode: 'copy' (exact antialiased board, costlier; see post.js).
// render() reads the optional fx.split / fx.glitch for the post pass; it is off under fx.reducedFlash.
// The renderer only reads `snap` and `fx`; it never writes game state.
// The room module interface is documented at the top of rooms/court.js.

import * as m4 from './m4.js';
import { createProgram, uploadMesh, textureFromCanvas, updateTextureFromCanvas, whiteTexture, ATTR } from './glutil.js';
import * as BOX from './boxroom.js';
import * as GEO from './geometry.js';
import * as S from './shaders.js';
import { createPost } from './post.js';

export const ROOM_IDS = ['court', 'disco', 'plastic', 'bunker'];

const DEG = Math.PI / 180;
const CAM_YAW = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
const MESH_RY = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 };
const FLOOR_HALF = 3000;
const SEG_MAX_H = 0.34;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const v3 = (a, d) => Float32Array.from(a && a.length >= 3 ? a : d);

const DEF = {
  panel: [0.02, 0.012, 0.05], grid: [0.1, 0.8, 0.95], frame: [0.3, 1, 1],
  fog: [0.8, 0.25, 0.6], pool: [0.1, 0.7, 1], dotPool: [1, 0.8, 0.2], ring: [1, 0.9, 0.4], wall: [0.2, 0.9, 1], beacon: [1, 0.85, 0.3],
};

export async function createRoomRenderer(canvas, opts = {}) {
  try {
    return await build(canvas, opts || {});
  } catch (e) {
    console.warn('[gl] 3D disabled:', e);
    return null;
  }
}

async function build(canvas, opts) {
  const cols = opts.cols | 0 || 16;
  const rows = opts.rows | 0 || 16;
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const attrs = {
    alpha: false, antialias: true, depth: true, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  };
  let gl = null;
  try {
    gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  } catch {
    gl = null;
  }
  if (!gl) return null;

  let isLost = false;
  if (canvas.addEventListener) {
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); isLost = true; });
  }

  const deriv = !!gl.getExtension('OES_standard_derivatives');
  const broken = opts.breakShaders ? '\n#error forced shader failure\n' : '';

  const glowProg = createProgram(gl, S.GLOW_VS, S.glowFS() + broken, 'glow');
  if (!glowProg) return null;

  // Post-effects pass (post.js). opts.post === false turns it off; debug.post toggles it live.
  let post = null;
  try { post = createPost(gl); } catch { post = null; }
  // mode 'buffer': the room draws into an offscreen buffer (no MSAA there); 'copy': the room draws to the
  // antialiased screen, which is then copied (board bit-identical, but the copy costs more).
  const postDbg = { enabled: opts.post !== false, mode: opts.postMode === 'copy' ? 'copy' : 'buffer', zero: false, active: false, params: null };
  const postTaps = new Float32Array(16);
  let pxScale = 1;

  // ---- geometry ----
  const meshes = {};
  for (const [k, fn] of Object.entries(GEO.LIBRARY)) meshes[k] = uploadMesh(gl, fn());
  const vbo = (arr) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    return b;
  };
  const triBuf = vbo([-1, -1, 3, -1, -1, 3]);
  const F = FLOOR_HALF;
  const floorBuf = vbo([-F, -F, F, -F, F, F, -F, -F, F, F, -F, F]);
  const white = whiteTexture(gl);

  function material(o = {}) {
    return {
      color: v3(o.color, [1, 1, 1]),
      emissive: v3(o.emissive, [0, 0, 0]),
      lineColor: v3(o.lineColor, [0, 0, 0]),
      rim: v3(o.rim, [0, 0, 0]),
      chrome: num(o.chrome, 0),
      lines: num(o.lines, 0),
      lineWidth: num(o.lineWidth, 0.04),
      mode: num(o.mode, o.tex ? 2 : 0),
      twoSided: !!o.twoSided,
      uvScale: Float32Array.from(o.uvScale || [1, 1]),
      fog: num(o.fog, 1),
      tex: o.tex || null,
    };
  }

  const kit = {
    gl, m4, geometry: GEO, cols, rows, deriv, material,
    addGeometry(name, g) { meshes[name] = uploadMesh(gl, g); return name; },
    texture(cv, o) { return textureFromCanvas(gl, cv, o); },
    // Added in wave 2 (rooms-a), all optional for rooms:
    updateTexture(t, cv) { return updateTextureFromCanvas(gl, t, cv); },
    canvas: (w, h) => BOX.makeCanvas(w, h),
    posterSheet: (o) => BOX.posterSheet(o),
    concreteSheet: (o) => BOX.concreteSheet(o),
    boxRoom: (o) => BOX.boxRoom(kit, o),
  };

  // ---- rooms ----
  const loaded = {};
  const rooms = {};
  for (const id of opts.roomIds || ROOM_IDS) {
    let mod;
    try {
      mod = await import(`./rooms/${id}.js`);
    } catch {
      continue; // missing room: skip
    }
    if (!mod || !mod.meta || !mod.glsl || typeof mod.create !== 'function') continue; // placeholder
    const progs = {
      sky: createProgram(gl, S.SKY_VS, S.skyFS(deriv, mod.glsl) + broken, `${id}/sky`),
      floor: createProgram(gl, S.FLOOR_VS, S.floorFS(deriv, mod.glsl) + broken, `${id}/floor`),
      mesh: createProgram(gl, S.MESH_VS, S.meshFS(deriv, mod.glsl) + broken, `${id}/mesh`),
    };
    if (!progs.sky || !progs.floor || !progs.mesh) {
      console.warn(`[gl] room "${id}" skipped: shader failure`);
      continue;
    }
    let inst;
    try {
      inst = mod.create(kit);
    } catch (e) {
      console.warn(`[gl] room "${id}" skipped:`, e);
      continue;
    }
    loaded[id] = { id, progs, inst };
    rooms[id] = Object.freeze({ ...mod.meta, id, kind: '3d', views: ['board', 'pov'] });
  }
  const firstId = Object.keys(loaded)[0];
  if (!firstId) return null;

  // ---- per-frame state ----
  const VP = m4.create(), VM = m4.create(), PM = m4.create(), BEAM = m4.create();
  const M = m4.create(), MM = m4.create(), BB = m4.create(), LOC = m4.create(), HEADM = m4.create();
  const MIRROR = m4.create();
  MIRROR[5] = -1;
  const cam = { view: 'board', eye: [0, 15, 20], b: m4.basis(0, -24 * DEG), tanX: 1, tanY: 1 };
  const st = { view: null, yaw: 0, lastNow: 0 };
  const maxSeg = cols * rows + 4;
  const segX = new Float32Array(maxSeg), segZ = new Float32Array(maxSeg);
  const uFx = new Float32Array(4), uFx2 = new Float32Array(4), uBite = new Float32Array(4);
  let enabledAttrs = 0;
  let cur = null;
  let room = null;
  let F0 = null;

  const cellX = (x) => x - cols / 2 + 0.5;
  const cellZ = (y) => y - rows / 2 + 0.5;

  function setAttribs(n) {
    for (let i = 0; i < 3; i++) {
      if (i < n && !(enabledAttrs & (1 << i))) gl.enableVertexAttribArray(i);
      if (i >= n && enabledAttrs & (1 << i)) gl.disableVertexAttribArray(i);
    }
    enabledAttrs = (1 << n) - 1;
  }

  function resize(cssW, cssH, dpr = 1) {
    const w = Math.max(1, cssW | 0), h = Math.max(1, cssH | 0);
    let s = Math.min(Math.max(dpr || 1, 0.5), 2);
    const maxPx = 3.2e6; // keep fill cost sane on big screens
    if (w * h * s * s > maxPx) s = Math.sqrt(maxPx / (w * h));
    pxScale = s;
    canvas.width = Math.max(1, Math.round(w * s));
    canvas.height = Math.max(1, Math.round(h * s));
  }

  function normFx(f) {
    f = f || {};
    return {
      now: num(f.now, typeof performance !== 'undefined' ? performance.now() : Date.now()),
      time: num(f.time, 0),
      beat: clamp(num(f.beat, 0), 0, 1),
      beatIndex: num(f.beatIndex, 0) | 0,
      chaos: clamp(num(f.chaos, 0), 0, 1),
      punch: clamp(num(f.punch, 0), 0, 1),
      variant: num(f.variant, 0) | 0,
      bite: f.bite && Number.isFinite(f.bite.x) ? f.bite : null,
      biteAge: typeof f.biteAge === 'number' ? f.biteAge : Infinity,
      cutAge: num(f.cutAge, 1e9),
      reducedFlash: !!f.reducedFlash,
      reducedMotion: !!f.reducedMotion,
    };
  }

  // Smooth snake positions, BUILD_PLAN 6.3. Returns segment count; head is index 0.
  function layout(snap) {
    const s = (snap && snap.snake) || [];
    const n = Math.min(s.length, maxSeg);
    if (!n) return 0;
    const a = snap.tick === 0 || !snap.alive ? 1 : clamp(num(snap.progress, 1), 0, 1);
    const h0 = s[1] || s[0];
    segX[0] = cellX(h0.x + (s[0].x - h0.x) * a);
    segZ[0] = cellZ(h0.y + (s[0].y - h0.y) * a);
    for (let i = 1; i < n; i++) {
      const c = s[i];
      if (snap.grew) {
        segX[i] = cellX(c.x);
        segZ[i] = cellZ(c.y);
      } else {
        const from = i < n - 1 ? s[i + 1] : snap.prevTail || c;
        segX[i] = cellX(from.x + (c.x - from.x) * a);
        segZ[i] = cellZ(from.y + (c.y - from.y) * a);
      }
    }
    return n;
  }

  function boardCamera(fx) {
    const aspect = canvas.width / canvas.height;
    const p = 24 * DEG, dep = 55 * DEG;
    let tanY = Math.tan(33 * DEG);
    const tanX0 = tanY * aspect;
    const cp = Math.cos(p), sp = Math.sin(p), td = Math.tan(dep);
    const need = (cols / 2 + 0.6) / (0.94 * tanX0); // forward depth at which the near edge fits 94% of the width
    const H = Math.max(15, (need - 0.9 * cp) / (cp / td + sp));
    cam.eye[0] = 0;
    cam.eye[1] = H;
    cam.eye[2] = rows / 2 + 0.9 + H / td;
    cam.b = m4.basis(0, -p); // no yaw in the board view, ever
    if (!fx.reducedMotion) tanY *= 1 - 0.045 * fx.punch + 0.1 * Math.exp(-fx.cutAge / 110);
    cam.tanY = tanY;
    cam.tanX = tanY * aspect;
    cam.near = 0.5;
  }

  function povCamera(fx, snap) {
    const aspect = canvas.width / canvas.height;
    const target = CAM_YAW[snap && snap.dir] ?? 0;
    if (st.view !== 'pov' || fx.reducedMotion) {
      st.yaw = target;
    } else {
      const dt = clamp((fx.now - st.lastNow) / 1000, 0, 0.1);
      let d = target - st.yaw;
      d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      st.yaw += d * (1 - Math.exp(-dt / 0.06));
    }
    cam.eye[0] = segX[0];
    cam.eye[1] = 0.95;
    cam.eye[2] = segZ[0];
    cam.b = m4.basis(st.yaw, -14 * DEG);
    let tanX = 1; // 90 degrees horizontal
    let tanY = tanX / aspect;
    const capY = Math.tan(50 * DEG); // portrait: cap the vertical FOV at 100 degrees
    if (tanY > capY) { tanY = capY; tanX = tanY * aspect; }
    if (!fx.reducedMotion) {
      const k = 1 - 0.06 * fx.punch;
      tanX *= k;
      tanY *= k;
    }
    cam.tanX = tanX;
    cam.tanY = tanY;
    cam.near = 0.05;
  }

  function setRoomUniforms(p, Fr, fx) {
    const u = p.u;
    gl.useProgram(p.prog);
    cur = p;
    if (u.uFx) gl.uniform4fv(u.uFx, uFx);
    if (u.uFx2) gl.uniform4fv(u.uFx2, uFx2);
    if (u.uBite) gl.uniform4fv(u.uBite, uBite);
    if (u.uPal && Fr.pal) gl.uniform3fv(u.uPal, Fr.pal);
    if (u.uRoom && Fr.room) gl.uniform4fv(u.uRoom, Fr.room);
    if (u.uEye) gl.uniform3fv(u.uEye, cam.eye);
    if (u.uBoard) gl.uniform2f(u.uBoard, cols / 2, rows / 2);
    if (u.uPix) gl.uniform1f(u.uPix, (2 * cam.tanY) / canvas.height);
    if (u.uFog) gl.uniform3fv(u.uFog, Fr.fog || DEF.fog);
    if (u.uViewProj) gl.uniformMatrix4fv(u.uViewProj, false, VP);
  }

  function useMesh() {
    if (cur === room.progs.mesh) return;
    gl.useProgram(room.progs.mesh.prog);
    cur = room.progs.mesh;
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  function useGlow() {
    if (cur === glowProg) return;
    gl.useProgram(glowProg.prog);
    cur = glowProg;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
  }

  function bindMesh(mesh) {
    setAttribs(3);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(ATTR.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
    gl.vertexAttribPointer(ATTR.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv);
    gl.vertexAttribPointer(ATTR.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
  }

  const d = {
    kit, cols, rows, view: 'board', mirror: false, fx: null, snap: null, eye: cam.eye, m: M,
    trs: (tx, ty, tz, ry, sx, sy, sz) => m4.trs(M, tx, ty, tz, ry, sx, sy, sz),
    euler: (tx, ty, tz, rx, ry, rz, sx, sy, sz) => m4.euler(M, tx, ty, tz, rx, ry, rz, sx, sy, sz),
    cellToWorld: (x, y) => [cellX(x), cellZ(y)],
    mesh(name, model, mat) {
      const mesh = meshes[name];
      if (!mesh || !mat) return;
      useMesh();
      const u = cur.u;
      if (d.mirror) model = m4.multiply(MM, MIRROR, model);
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniform3fv(u.uColor, mat.color);
      gl.uniform3fv(u.uEmissive, mat.emissive);
      if (u.uLineCol) gl.uniform3fv(u.uLineCol, mat.lineColor);
      if (u.uRim) gl.uniform3fv(u.uRim, mat.rim);
      gl.uniform4f(u.uMat, mat.chrome, mat.lines, mat.lineWidth, mat.mode);
      gl.uniform4f(u.uMat2, mat.twoSided ? 1 : 0, mat.uvScale[0], mat.uvScale[1], mat.fog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mat.mode === 2 && mat.tex ? mat.tex : white);
      bindMesh(mesh);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    },
    glow(name, model, color, mode = 0, intensity = 1, p1 = 0, p2 = 0) {
      const mesh = meshes[name];
      if (!mesh || d.mirror || intensity <= 0) return;
      useGlow();
      const u = glowProg.u;
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniform3fv(u.uColor, color);
      gl.uniform4f(u.uGlow, mode, intensity, p1, p2);
      bindMesh(mesh);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    },
    // Camera-facing (around Y) quad standing on (x, y, z).
    billboard(x, y, z, w, h, color, mode = 0, intensity = 1, p1 = 0, p2 = 0) {
      const ry = Math.atan2(cam.eye[0] - x, cam.eye[2] - z);
      d.glow('plane', m4.trs(BB, x, y, z, ry, w, h, 1), color, mode, intensity, p1, p2);
    },
    floorGlow(x, z, size, color, intensity = 1) {
      d.glow('floorQuad', m4.trs(BB, x, 0.012, z, 0, size, 1, size), color, 0, intensity);
    },
    ring(x, z, size, color, intensity, radius, width) {
      d.glow('floorQuad', m4.trs(BB, x, 0.015, z, 0, size, 1, size), color, 1, intensity, radius, width);
    },
    // Laser line from (x0,y0,z0) to (x1,y1,z1): camera-facing strip, at least ~minPx pixels wide.
    // fade 0..1 dims it toward the far end; halo is the soft glow around the hard core.
    beam(x0, y0, z0, x1, y1, z1, width, color, intensity = 1, fade = 0, halo = 0.35, minPx = 6) {
      if (d.mirror || intensity <= 0) return;
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      if (dx * dx + dy * dy + dz * dz < 1e-8) return;
      const pix = (2 * cam.tanY) / Math.max(1, canvas.height);
      const N = 4;
      for (let i = 0; i < N; i++) {
        const a = i / N, b = (i + 1) / N;
        const ax = x0 + dx * a, ay = y0 + dy * a, az = z0 + dz * a;
        const cx = cam.eye[0] - (ax + dx / (2 * N)), cy = cam.eye[1] - (ay + dy / (2 * N)), cz = cam.eye[2] - (az + dz / (2 * N));
        let sx = dy * cz - dz * cy, sy = dz * cx - dx * cz, sz = dx * cy - dy * cx;
        const sl = Math.hypot(sx, sy, sz);
        if (sl < 1e-9) continue;
        const w = Math.max(width, Math.hypot(cx, cy, cz) * pix * minPx);
        sx *= w / sl; sy *= w / sl; sz *= w / sl;
        BEAM[0] = sx; BEAM[1] = sy; BEAM[2] = sz; BEAM[3] = 0;
        BEAM[4] = dx / N; BEAM[5] = dy / N; BEAM[6] = dz / N; BEAM[7] = 0;
        BEAM[8] = 0; BEAM[9] = 0; BEAM[10] = 0; BEAM[11] = 0;
        BEAM[12] = ax; BEAM[13] = ay; BEAM[14] = az; BEAM[15] = 1;
        d.glow('plane', BEAM, color, 4, intensity * (1 - fade * (a + b) * 0.5), halo, 0);
      }
    },
  };

  const curbMat = material({ color: [0.05, 0.05, 0.08], emissive: [0.3, 1, 1], lines: 1, lineWidth: 0.08, lineColor: [1, 1, 1] });

  function drawCurb(Fr) {
    const fc = (Fr.board && Fr.board.frame) || DEF.frame;
    curbMat.emissive.set(fc);
    const t = 0.3, h = 0.1;
    d.mesh('box', d.trs(0, 0, -rows / 2 - t / 2, 0, cols + 2 * t, h, t), curbMat);
    d.mesh('box', d.trs(0, 0, rows / 2 + t / 2, 0, cols + 2 * t, h, t), curbMat);
    d.mesh('box', d.trs(-cols / 2 - t / 2, 0, 0, 0, t, h, rows), curbMat);
    d.mesh('box', d.trs(cols / 2 + t / 2, 0, 0, 0, t, h, rows), curbMat);
  }

  function drawSnake(Fr, snap, fx, n, view) {
    const sn = Fr.snake || {};
    const body = sn.body, headMat = sn.head || body;
    if (body && n > 1) {
      const bs = sn.bodySize || [0.78, 0.26, 0.78];
      const geom = sn.bodyGeom || 'block';
      for (let i = n - 1; i >= 1; i--) {
        if (sn.segment) sn.segment(i, n, body, fx, snap);
        d.mesh(geom, d.trs(segX[i], 0.004, segZ[i], 0, bs[0], Math.min(bs[1], SEG_MAX_H), bs[2]), body);
      }
    }
    if (n > 0 && view !== 'pov' && headMat) {
      const hs = sn.headSize || [0.88, 0.3, 0.88];
      const hh = Math.min(hs[1], 0.3);
      const ry = MESH_RY[snap.dir] ?? 0;
      m4.trs(HEADM, segX[0], 0.004, segZ[0], ry, hs[0], hh, hs[2]);
      d.mesh(sn.headGeom || 'head', HEADM, headMat);
      if (sn.eye) {
        for (const side of [-1, 1]) {
          m4.trs(LOC, side * 0.22, 1, -0.14, 0, 0.2, 0.11, 0.18);
          d.mesh('box', m4.multiply(M, HEADM, LOC), sn.eye);
        }
      }
    }
  }

  function drawDot(Fr, snap, fx) {
    const sn = Fr.snake || {};
    if (!snap.food || !sn.dot) return;
    const x = cellX(snap.food.x), z = cellZ(snap.food.y);
    const ds = sn.dotSize || [0.56, 0.3, 0.56];
    const bob = fx.reducedMotion ? 0 : 0.03 * Math.sin(fx.time * 4.2);
    const spin = fx.reducedMotion ? 0.6 : fx.time * 1.8;
    d.mesh(sn.dotGeom || 'gem', d.trs(x, 0.03 + bob, z, spin, ds[0], Math.min(ds[1], SEG_MAX_H), ds[2]), sn.dot);
  }

  function drawGlows(Fr, snap, fx, n, view) {
    const sn = Fr.snake || {};
    const pool = sn.pool || DEF.pool;
    for (let i = view === 'pov' ? 1 : 0; i < n; i++) d.floorGlow(segX[i], segZ[i], 1.55, pool, sn.poolIntensity ?? 0.3);
    if (snap.food) {
      const x = cellX(snap.food.x), z = cellZ(snap.food.y);
      d.floorGlow(x, z, 2.2, sn.dotPool || DEF.dotPool, 0.7 + num(sn.dotPoolBeat, 0.6) * fx.beat);
      if (view === 'pov') d.billboard(x, 0, z, 1.1, 9, Fr.beacon || DEF.beacon, 3, 1.3 + 0.7 * fx.beat);
    }
    if (fx.bite && fx.biteAge < 900) {
      const x = cellX(fx.bite.x), z = cellZ(fx.bite.y);
      const t = fx.biteAge / 900;
      const rc = Fr.ring || DEF.ring;
      // in first person the bite happens under the camera: keep the floor shock ring, drop the beam
      const near = view === 'pov' && Math.hypot(x - cam.eye[0], z - cam.eye[2]) < 2.5;
      const k = near ? 0.45 : 1;
      d.ring(x, z, 10, rc, (1 - t) * (1 - t) * 2.4 * k, t * 0.95, 0.05 + 0.06 * t);
      const t2 = Math.min(1, fx.biteAge / 450);
      if (!near) d.ring(x, z, 4, rc, (1 - t2) * 2, t2 * 0.9, 0.12);
      if (!near && fx.biteAge < 350) d.billboard(x, 0, z, 1.6, 7, rc, 3, (1 - fx.biteAge / 350) * 1.6);
    }
    if (view === 'pov' && Fr.povWalls !== false) {
      const wc = Fr.wall || DEF.wall;
      const wi = 0.85 + 0.35 * fx.beat;
      const h = 2.6;
      d.glow('plane', m4.trs(BB, 0, 0, -rows / 2, 0, cols, h, 1), wc, 2, wi, cols, h);
      d.glow('plane', m4.trs(BB, 0, 0, rows / 2, 0, cols, h, 1), wc, 2, wi, cols, h);
      d.glow('plane', m4.trs(BB, -cols / 2, 0, 0, Math.PI / 2, rows, h, 1), wc, 2, wi, rows, h);
      d.glow('plane', m4.trs(BB, cols / 2, 0, 0, Math.PI / 2, rows, h, 1), wc, 2, wi, rows, h);
    }
  }

  // ---- post-effects pass ----
  // Strengths from fx; the game's own `split` (CSS px) and `glitch` (0..1) win when present.
  // null means: draw straight to the screen (reduced flash, everything calm, or no buffer).
  const MASK_PAD = 0.62, MASK_H = 0.46;
  function postParams(fx, raw) {
    if (!post || !postDbg.enabled || fx.reducedFlash || !post.ok) return null;
    if (postDbg.zero) return { split: 0, kick: 0, glitch: 0, glow: 0, seed: 0, beat: 0, chaos: 0 }; // harness: pass with no effect
    raw = raw || {};
    const pulse = Math.max(fx.punch, fx.beat);
    const split = (Number.isFinite(raw.split) ? clamp(raw.split, 0, 30) : fx.chaos * 7 * (0.3 + 0.7 * pulse)) * pxScale;
    const kick = fx.punch * (4 + 10 * fx.chaos) * pxScale;
    const glitch = Number.isFinite(raw.glitch) ? clamp(raw.glitch, 0, 1)
      : clamp(fx.chaos * (0.22 + 0.78 * Math.max(fx.punch, fx.beat * 0.45)), 0, 1);
    const glow = clamp(fx.chaos * (0.5 + 0.5 * fx.beat) + 0.4 * fx.punch, 0, 1.2);
    if (split < 0.25 && kick < 0.25 && glitch < 0.004 && glow < 0.01) return null;
    const seed = Math.floor(fx.time * 16) % 4096;
    return { split, kick, glitch, glow, seed, beat: fx.beat, chaos: fx.chaos };
  }

  // Copy the finished frame, then one full-screen pass over it; the board volume is discarded.
  function finishPost(pp, buffered) {
    const W = canvas.width, H = canvas.height;
    if (buffered) post.end();
    else if (!post.capture(W, H)) { postDbg.active = false; postDbg.params = null; return; }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const pr = post.prog, u = pr.u;
    gl.useProgram(pr.prog);
    const { f, r, u: up } = cam.b;
    if (u.uEye) gl.uniform3fv(u.uEye, cam.eye);
    if (u.uCamF) gl.uniform3f(u.uCamF, f[0], f[1], f[2]);
    if (u.uCamR) gl.uniform3f(u.uCamR, r[0] * cam.tanX, r[1] * cam.tanX, r[2] * cam.tanX);
    if (u.uCamU) gl.uniform3f(u.uCamU, up[0] * cam.tanY, up[1] * cam.tanY, up[2] * cam.tanY);
    if (u.uBoxMin) gl.uniform3f(u.uBoxMin, -cols / 2 - MASK_PAD, -0.02, -rows / 2 - MASK_PAD);
    if (u.uBoxMax) gl.uniform3f(u.uBoxMax, cols / 2 + MASK_PAD, MASK_H, rows / 2 + MASK_PAD);
    const rad = H * (0.006 + 0.01 * Math.min(1, pp.glow));
    for (let i = 0; i < 8; i++) {
      const a = i * 2.39996 + 0.5, rr = rad * Math.sqrt((i + 0.5) / 8);
      postTaps[2 * i] = (Math.cos(a) * rr) / W;
      postTaps[2 * i + 1] = (Math.sin(a) * rr) / H;
    }
    if (u.uTex) gl.uniform1i(u.uTex, 0);
    if (u.uKeep) gl.uniform1f(u.uKeep, buffered ? 1 : 0);
    if (u.uRes) gl.uniform2f(u.uRes, W, H);
    if (u.uAmt) gl.uniform4f(u.uAmt, pp.split, pp.glitch, pp.glow, pp.kick);
    if (u.uSeed) gl.uniform4f(u.uSeed, pp.seed, pp.beat, pp.chaos, 0);
    if (u.uTap) gl.uniform2fv(u.uTap, postTaps);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, post.tex);
    setAttribs(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, white); // leave no copy bound for the next frame's draws
    gl.enable(gl.DEPTH_TEST);
    cur = null;
  }

  function render(roomId, view, snap, fxIn) {
    if (isLost || gl.isContextLost()) { isLost = true; return; }
    room = loaded[roomId] || loaded[firstId];
    view = view === 'pov' ? 'pov' : 'board';
    const fx = normFx(fxIn);
    snap = snap || { snake: [], alive: true, tick: 0 };
    const Fr = room.inst.frame(fx, snap, view) || {};
    F0 = Fr;
    const n = layout(snap);

    if (view === 'pov') povCamera(fx, snap);
    else boardCamera(fx);
    st.view = view;
    st.lastNow = fx.now;
    cam.view = view;
    m4.view(VM, cam.eye, cam.b);
    m4.perspective(PM, cam.tanX, cam.tanY, cam.near, 9000);
    m4.multiply(VP, PM, VM);

    uFx[0] = fx.time % 3600; uFx[1] = fx.beat; uFx[2] = fx.punch; uFx[3] = fx.chaos;
    uFx2[0] = fx.variant; uFx2[1] = fx.beatIndex; uFx2[2] = Math.min(fx.cutAge / 1000, 1e4); uFx2[3] = fx.reducedMotion ? 1 : 0;
    if (fx.bite) {
      uBite[0] = cellX(fx.bite.x); uBite[1] = cellZ(fx.bite.y); uBite[2] = Math.min(fx.biteAge / 1000, 1e4); uBite[3] = 1;
    } else {
      uBite[0] = 0; uBite[1] = 0; uBite[2] = 1e4; uBite[3] = 0;
    }
    d.view = view; d.fx = fx; d.snap = snap; d.mirror = false;
    gl.useProgram(glowProg.prog);
    gl.uniformMatrix4fv(glowProg.u.uViewProj, false, VP);
    gl.uniform1f(glowProg.u.uGTime, uFx[0]);

    const pp = postParams(fx, fxIn);
    const buffered = !!pp && postDbg.mode === 'buffer' && post.begin(canvas.width, canvas.height);
    const usePost = !!pp && (buffered || postDbg.mode === 'copy');
    postDbg.active = usePost;
    postDbg.params = usePost ? pp : null;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. sky (no depth)
    const P = room.progs;
    setRoomUniforms(P.sky, Fr, fx);
    const { f, r, u } = cam.b;
    gl.uniform3f(P.sky.u.uCamF, f[0], f[1], f[2]);
    gl.uniform3f(P.sky.u.uCamR, r[0] * cam.tanX, r[1] * cam.tanX, r[2] * cam.tanX);
    gl.uniform3f(P.sky.u.uCamU, u[0] * cam.tanY, u[1] * cam.tanY, u[2] * cam.tanY);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    setAttribs(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    // 2. mirrored props (seen through the glossy floor)
    setRoomUniforms(P.mesh, Fr, fx);
    gl.uniform1i(P.mesh.u.uTex, 0);
    useMeshState();
    if (room.inst.props && Fr.reflections !== false) {
      d.mirror = true;
      room.inst.props(d);
      d.mirror = false;
    }

    // 3. floor (board panel, grid, frame band, room pattern, sky reflection)
    setRoomUniforms(P.floor, Fr, fx);
    const B = Fr.board || {};
    gl.uniform3fv(P.floor.u.uPanel, B.panel || DEF.panel);
    gl.uniform3fv(P.floor.u.uGrid, B.grid || DEF.grid);
    gl.uniform3fv(P.floor.u.uFrame, B.frame || DEF.frame);
    gl.uniform4f(P.floor.u.uBoardStyle, num(B.lineWidth, 0.03), num(B.band, 0.3), num(B.gridGlow, 0.5), num(B.frameGlow, 0.8));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    setAttribs(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);

    // 4. opaque meshes: props, curb, snake, dot
    cur = null;
    useMesh();
    if (room.inst.props) room.inst.props(d);
    if (Fr.curb !== false) drawCurb(Fr);
    drawSnake(Fr, snap, fx, n, view);
    drawDot(Fr, snap, fx);

    // 5. additive glows (depth write off)
    gl.useProgram(glowProg.prog);
    cur = glowProg;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    if (room.inst.glows) room.inst.glows(d);
    drawGlows(Fr, snap, fx, n, view);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if (usePost) finishPost(pp, buffered);
  }

  function useMeshState() {
    cur = room.progs.mesh;
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  return {
    rooms,
    resize,
    render,
    lost: () => isLost || gl.isContextLost(),
    // Not part of the contract: harness and debugging helpers.
    debug: {
      gl,
      canvas,
      cellToWorld: (x, y) => [cellX(x), cellZ(y)],
      camera: () => ({ view: cam.view, eye: cam.eye.slice(), tanX: cam.tanX, tanY: cam.tanY, yaw: st.yaw }),
      frame: () => F0,
      // Post pass: post.enabled = false draws direct; post.mode 'buffer' | 'copy'; post.zero runs the pass at
      // zero strength (harness); post.active / post.params describe the last frame.
      post: postDbg,
      postSize: () => (post ? post.size : [0, 0]),
      // World point -> canvas pixel (origin top-left) using the last rendered camera.
      project(x, y, z) {
        const c = m4.project(VP, x, y, z);
        if (c[3] <= 0) return { visible: false };
        const nx = c[0] / c[3], ny = c[1] / c[3];
        return {
          x: (nx * 0.5 + 0.5) * canvas.width,
          y: (1 - (ny * 0.5 + 0.5)) * canvas.height,
          visible: Math.abs(nx) <= 1 && Math.abs(ny) <= 1,
        };
      },
    },
  };
}
