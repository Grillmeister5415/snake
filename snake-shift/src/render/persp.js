// SNAKE//SHIFT — Canvas 2D stand-in for the 3D rooms when WebGL is missing (plan §6.5, stream flat-c).
//
// Wired by flat.js (a room scene without live WebGL). Safe with LEVELS_PLAN 3.3 snapshots: every cell is
// its own block (breaks never bridged), null food draws no gem, waiting === 'respawn' pulses gently.
// Original wiring notes:
//
//   import { createPerspRenderer } from './render/persp.js';
//   const persp = createPerspRenderer({ cols, rows });
//   // every frame a room scene is showing, on the 2D canvas (ctx already scaled to CSS pixels):
//   persp.render(ctx, cssW, cssH, roomMeta, view, snap, fx);
//   // roomMeta: the room's meta ({ hud: { fg, bg, accent, panelFg, panelBg }, ... }); null is fine.
//   // view: 'board' | 'pov'. 'pov' falls back to the board view here (no near-plane clipping needed).
//
// Room metas without WebGL: the engine never resolves, so there is no `rooms` list. Either import each
// `gl/rooms/<id>.js` just for its meta, or use FALLBACK_ROOMS below (ids from §15.3, hud colours guessed).
//
// What it draws: sky gradient and a striped sun tinted from roomMeta.hud, a floor grid fading to the
// horizon, the bright lethal-edge band, the dark board panel with grid lines, the snake as low blocks
// (cell-exact: head 0.34 tall with a direction chevron, body 0.26, tail smaller) and the dot as a
// gem. Camera = the engine's board-view camera of plan §6.3: vertical FOV 66°, pitch 24° down, near
// edge at 55° depression, H the smallest value ≥ 15 where the near edge fits 94% of the width,
// z = rows/2 + 0.9 + H / tan 55°. Screen-up is grid-up; no yaw. Reads snap and fx only, writes nothing.
// Extra methods for harnesses: camera(w, h, fx), cellPoint(w, h, x, y, height, fx), colors(roomMeta).

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const FALLBACK_ROOMS = {
  court: { id: 'court', name: 'REALITY.EXE', year: '2088', kind: '3d', hud: { fg: '#fff3ff', bg: 'rgba(24,4,44,0.72)', accent: '#2ef6ff', panelFg: '#ffe9ff', panelBg: 'rgba(26,4,52,0.88)' } },
  disco: { id: 'disco', name: 'DISCO INFERNO', year: '1977', kind: '3d', hud: { fg: '#ffe9c2', bg: 'rgba(40,6,20,0.8)', accent: '#ff3fa4', panelFg: '#ffd23a', panelBg: 'rgba(44,8,28,0.9)' } },
  plastic: { id: 'plastic', name: 'PLASTIC INTERNET', year: '2001', kind: '3d', hud: { fg: '#0b2a5a', bg: 'rgba(200,236,255,0.8)', accent: '#2f7bff', panelFg: '#ffe03a', panelBg: 'rgba(220,244,255,0.9)' } },
  bunker: { id: 'bunker', name: 'BERLIN BUNKER', year: '2026', kind: '3d', hud: { fg: '#ff2a2a', bg: 'rgba(8,4,4,0.85)', accent: '#ff2a2a', panelFg: '#f0e6e6', panelBg: 'rgba(14,6,6,0.92)' } },
};

// ---- colour helpers ----------------------------------------------------------------------------
function rgbOf(c, d) {
  if (typeof c !== 'string') return d;
  let m = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let s = m[1];
    if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])] : d;
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const shade = (c, k) => c.map((v) => clamp(Math.round(v * k), 0, 255));
const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const BLACK = [0, 0, 0], WHITE = [255, 255, 255];

let palCache = { key: null, pal: null };
/** Flat colours derived from roomMeta.hud. Top faces are flat fills, so harnesses can sample them. */
export function colorsFor(roomMeta) {
  const hud = (roomMeta && roomMeta.hud) || {};
  const key = [hud.fg, hud.bg, hud.accent, hud.panelFg].join('|');
  if (palCache.key === key) return palCache.pal;
  const fg = rgbOf(hud.fg, [255, 240, 255]), bg = rgbOf(hud.bg, [24, 6, 44]);
  const accent = rgbOf(hud.accent, [46, 246, 255]), pfg = rgbOf(hud.panelFg, [255, 230, 120]);
  const dark = luma(bg) < 0.5 ? bg : mix(fg, BLACK, 0.4); // keep the sky dark even for pale HUDs
  const panel = mix(dark, BLACK, 0.62);
  let body = mix(fg, accent, 0.5);
  if (luma(body) < 0.45) body = mix(body, WHITE, 0.45);
  const head = luma(fg) > 0.55 ? fg : mix(fg, WHITE, 0.6);
  let dot = [255, 207, 58];
  if (Math.abs(luma(dot) - luma(body)) < 0.08 && Math.abs(dot[2] - body[2]) < 60) dot = [255, 70, 90];
  const pal = {
    skyTop: mix(dark, BLACK, 0.45), skyLow: mix(accent, dark, 0.55), haze: mix(accent, pfg, 0.3),
    sunA: mix(pfg, WHITE, 0.2), sunB: accent, floorFar: mix(accent, dark, 0.72), floorNear: mix(dark, BLACK, 0.55),
    floorLine: accent, panel, grid: mix(panel, fg, 0.16), edge: accent, edgeLine: mix(accent, WHITE, 0.55),
    head, body, tail: mix(body, panel, 0.15), dot, dead: [118, 114, 124], deadHead: [168, 164, 174],
  };
  palCache = { key, pal };
  return pal;
}

// ---- camera: the engine's board view (plan §6.3), with the same punch / cut zoom ------------------
function boardCamera(cols, rows, w, h, fx) {
  const aspect = w / Math.max(1, h);
  const p = 24 * DEG, dep = 55 * DEG;
  let tanY = Math.tan(33 * DEG);
  const tanX0 = tanY * aspect;
  const cp = Math.cos(p), sp = Math.sin(p), td = Math.tan(dep);
  const need = (cols / 2 + 0.6) / (0.94 * tanX0);
  const H = Math.max(15, (need - 0.9 * cp) / (cp / td + sp));
  const eye = [0, H, rows / 2 + 0.9 + H / td];
  if (fx && !fx.reducedMotion) tanY *= 1 - 0.045 * clamp(num(fx.punch), 0, 1) + 0.1 * Math.exp(-num(fx.cutAge, Infinity) / 110);
  const tanX = tanY * aspect;
  // basis(yaw 0, pitch −p): f = (0, −sp, −cp), r = (1, 0, 0), u = (0, cp, −sp)
  const hw = w / 2, hh = h / 2;
  const cam = {
    eye, tanX, tanY, cp, sp, w, h, near: 0.5,
    toCam(x, y, z) {
      const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
      return [dx, dy * cp - dz * sp, -dy * sp - dz * cp];
    },
    screen(c) { return [hw + (c[0] / c[2] / tanX) * hw, hh - (c[1] / c[2] / tanY) * hh]; },
    proj(x, y, z) { return cam.screen(cam.toCam(x, y, z)); },
    /** Screen y of a direction `elev` radians above the horizontal. */
    elevY(elev) { return hh - (Math.tan(elev + p) / tanY) * hh; },
  };
  return cam;
}

function fillPoly(ctx, pts, style) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}
/** World segment on the floor plane, clipped at the near plane. */
function seg(ctx, cam, a, b) {
  let A = cam.toCam(a[0], a[1], a[2]), B = cam.toCam(b[0], b[1], b[2]);
  if (A[2] < cam.near && B[2] < cam.near) return;
  if (A[2] < cam.near || B[2] < cam.near) {
    const t = (cam.near - A[2]) / (B[2] - A[2]);
    const C = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, cam.near];
    if (A[2] < cam.near) A = C; else B = C;
  }
  const p = cam.screen(A), q = cam.screen(B);
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
}

// ---- backdrop ------------------------------------------------------------------------------------
function backdrop(ctx, cam, pal, f, w, h) {
  const hy = cam.elevY(0);
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, hy));
  sky.addColorStop(0, css(pal.skyTop)); sky.addColorStop(1, css(pal.skyLow));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, Math.max(0, hy) + 1);
  // Sun: centre 3° above the horizon, radius about 13°, with retro cut stripes in its lower half.
  const sy = cam.elevY(3 * DEG), r = ((cam.elevY(-10 * DEG) - cam.elevY(16 * DEG)) / 2) * (1 + 0.035 * f.beat);
  if (hy > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, hy); ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - r, 0, sy + r);
    sg.addColorStop(0, css(pal.sunA)); sg.addColorStop(1, css(pal.sunB));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(w / 2, sy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = css(pal.skyLow);
    for (let i = 0; i < 6; i++) {
      const y0 = sy + r * (0.08 + i * 0.16), th = r * (0.025 + i * 0.018);
      ctx.fillRect(w / 2 - r, y0 + ((f.time * r * 0.05) % (r * 0.16)), r * 2, th);
    }
    const hz = ctx.createLinearGradient(0, hy - h * 0.08, 0, hy);
    hz.addColorStop(0, css(pal.haze, 0)); hz.addColorStop(1, css(pal.haze, 0.55 + 0.25 * f.beat));
    ctx.fillStyle = hz; ctx.fillRect(0, hy - h * 0.08, w, h * 0.08);
    ctx.restore();
  }
  // Floor and its room grid, fading into haze at the horizon.
  const fy = Math.max(0, hy);
  const fl = ctx.createLinearGradient(0, fy, 0, h);
  fl.addColorStop(0, css(pal.floorFar)); fl.addColorStop(1, css(pal.floorNear));
  ctx.fillStyle = fl; ctx.fillRect(0, fy, w, h - fy);
  ctx.save();
  ctx.strokeStyle = css(pal.floorLine, 0.22 + 0.3 * f.beat);
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Wide and deep enough that the grid meets the haze at the horizon instead of ending in a trapezoid.
  const zNear = cam.eye[2] - 1, zFar = -420, xs = 260;
  for (let x = -xs; x <= xs; x += 2) seg(ctx, cam, [x, 0, zFar], [x, 0, zNear]);
  const scroll = (f.time * 0.6) % 2;
  for (let z = zFar + scroll; z <= zNear; z += z < -60 ? 6 : 2) seg(ctx, cam, [-xs, 0, z], [xs, 0, z]);
  ctx.stroke();
  const fog = ctx.createLinearGradient(0, fy, 0, fy + h * 0.1);
  fog.addColorStop(0, css(pal.floorFar, 1)); fog.addColorStop(1, css(pal.floorFar, 0));
  ctx.fillStyle = fog; ctx.fillRect(0, fy, w, h * 0.1);
  ctx.restore();
}

// ---- board ---------------------------------------------------------------------------------------
function rectPts(cam, x0, z0, x1, z1) {
  return [cam.proj(x0, 0, z0), cam.proj(x1, 0, z0), cam.proj(x1, 0, z1), cam.proj(x0, 0, z1)];
}
function boardBase(ctx, cam, pal, f, cols, rows) {
  const hx = cols / 2, hz = rows / 2;
  // Lethal edge: a bright band just outside the board, then a hard line exactly on the edge.
  const o = rectPts(cam, -hx - 0.42, -hz - 0.42, hx + 0.42, hz + 0.42), i = rectPts(cam, -hx - 0.08, -hz - 0.08, hx + 0.08, hz + 0.08);
  ctx.beginPath();
  o.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
  i.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
  ctx.fillStyle = css(mix(pal.edge, WHITE, 0.25 * f.beat)); ctx.fill('evenodd');
  fillPoly(ctx, rectPts(cam, -hx, -hz, hx, hz), css(pal.panel));
  ctx.beginPath();
  for (let x = 0; x <= cols; x++) seg(ctx, cam, [x - hx, 0, -hz], [x - hx, 0, hz]);
  for (let y = 0; y <= rows; y++) seg(ctx, cam, [-hx, 0, y - hz], [hx, 0, y - hz]);
  ctx.strokeStyle = css(pal.grid); ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); const e = rectPts(cam, -hx, -hz, hx, hz);
  e.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
  ctx.strokeStyle = css(pal.edgeLine); ctx.lineWidth = 2; ctx.stroke();
}
function biteRing(ctx, cam, pal, f, fx, wx, wz) {
  const age = num(fx.biteAge, Infinity);
  if (!fx.bite || !(age < 450)) return;
  const k = age / 450, r = f.rm ? 0.7 : 0.35 + 1.7 * k;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) { const a = (i / 28) * TAU, p = cam.proj(wx + Math.cos(a) * r, 0.02, wz + Math.sin(a) * r); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
  ctx.strokeStyle = css(pal.edgeLine, (1 - k) * 0.9); ctx.lineWidth = 3 * (1 - k) + 1; ctx.stroke();
  ctx.restore();
}
/** Low block on a cell; faces drawn back to front. Returns the top-face colour. */
function block(ctx, cam, wx, wz, inset, hgt, col) {
  const x0 = wx - 0.5 + inset, x1 = wx + 0.5 - inset, z0 = wz - 0.5 + inset, z1 = wz + 0.5 - inset;
  const P = cam.proj;
  if (cam.eye[0] < x0) fillPoly(ctx, [P(x0, 0, z0), P(x0, 0, z1), P(x0, hgt, z1), P(x0, hgt, z0)], css(shade(col, 0.5)));
  if (cam.eye[0] > x1) fillPoly(ctx, [P(x1, 0, z0), P(x1, 0, z1), P(x1, hgt, z1), P(x1, hgt, z0)], css(shade(col, 0.5)));
  fillPoly(ctx, [P(x0, 0, z1), P(x1, 0, z1), P(x1, hgt, z1), P(x0, hgt, z1)], css(shade(col, 0.66)));
  fillPoly(ctx, [P(x0, hgt, z0), P(x1, hgt, z0), P(x1, hgt, z1), P(x0, hgt, z1)], css(col));
}
function chevron(ctx, cam, wx, wz, hgt, d, col) {
  const [dx, dz] = d, px = -dz, pz = dx, y = hgt + 0.001, P = cam.proj;
  fillPoly(ctx, [P(wx + dx * 0.3, y, wz + dz * 0.3), P(wx - dx * 0.12 + px * 0.24, y, wz - dz * 0.12 + pz * 0.24), P(wx - dx * 0.02, y, wz - dz * 0.02), P(wx - dx * 0.12 - px * 0.24, y, wz - dz * 0.12 - pz * 0.24)], css(col));
}
function deadCross(ctx, cam, wx, wz, hgt) {
  const P = cam.proj, y = hgt + 0.001, s = 0.22;
  ctx.save();
  ctx.beginPath();
  let a = P(wx - s, y, wz - s), b = P(wx + s, y, wz + s); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  a = P(wx + s, y, wz - s); b = P(wx - s, y, wz + s); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = '#1a1018'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}
function gem(ctx, cam, pal, f, wx, wz) {
  const P = cam.proj, bob = 0.05 * Math.sin(f.time * 3.2), cy = 0.4 + bob, r = 0.25, t = 0.3;
  ctx.save();
  // Glow pool on the floor, kept inside the dot's own cell.
  const g0 = P(wx, 0.01, wz), g1 = P(wx + 0.45, 0.01, wz);
  const rr = Math.max(2, Math.abs(g1[0] - g0[0]));
  const gr = ctx.createRadialGradient(g0[0], g0[1], 0, g0[0], g0[1], rr);
  gr.addColorStop(0, css(pal.dot, 0.55 + 0.35 * f.beat)); gr.addColorStop(1, css(pal.dot, 0));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(g0[0], g0[1], rr, rr * 0.55, 0, 0, TAU); ctx.fill();
  const top = P(wx, cy + t, wz), bot = P(wx, cy - t, wz), l = P(wx - r, cy, wz), rt = P(wx + r, cy, wz), fr = P(wx, cy, wz + r);
  fillPoly(ctx, [top, l, bot, rt], css(shade(pal.dot, 0.6)));
  fillPoly(ctx, [top, l, fr], css(mix(pal.dot, WHITE, 0.35)));
  fillPoly(ctx, [top, fr, rt], css(pal.dot));
  fillPoly(ctx, [bot, l, fr], css(shade(pal.dot, 0.72)));
  fillPoly(ctx, [bot, fr, rt], css(shade(pal.dot, 0.55)));
  ctx.restore();
}
const okCell = (c) => !!c && Number.isFinite(X(c)) && Number.isFinite(Y(c));
function breakSet(snap) {
  return new Set(Array.isArray(snap && snap.breaks) ? snap.breaks : []);
}
function headDir(snap, breaks) {
  const s = snap.snake;
  // Across a break the next cell is not the neck: fall back to the heading.
  if (s && s.length > 1 && !(breaks && breaks.has(0)) && okCell(s[0]) && okCell(s[1])) {
    const dx = X(s[0]) - X(s[1]), dy = Y(s[0]) - Y(s[1]);
    if (Math.abs(dx) + Math.abs(dy) === 1) return [dx, dy];
  }
  return DIRS[snap.dir] || [1, 0];
}
const HEAD_H = 0.34, BODY_H = 0.26, TAIL_H = 0.18;

export function createPerspRenderer({ cols, rows }) {
  const wxOf = (x) => x - cols / 2 + 0.5, wzOf = (y) => y - rows / 2 + 0.5;
  return {
    cols, rows,
    camera: (w, h, fx) => boardCamera(cols, rows, w, h, fx || {}),
    /** Screen point of cell (x, y) at `height` world units, for harness checks. */
    cellPoint(w, h, x, y, height = 0, fx) { return boardCamera(cols, rows, w, h, fx || {}).proj(wxOf(x), height, wzOf(y)); },
    colors: colorsFor,
    heights: { head: HEAD_H, body: BODY_H, tail: TAIL_H },
    render(ctx, w, h, roomMeta, view, snap, fx) {
      fx = fx || {};
      const f = { time: num(fx.time), beat: clamp(num(fx.beat), 0, 1), rm: !!fx.reducedMotion };
      const pal = colorsFor(roomMeta);
      const cam = boardCamera(cols, rows, w, h, fx); // 'pov' falls back to the board view
      ctx.save();
      backdrop(ctx, cam, pal, f, w, h);
      boardBase(ctx, cam, pal, f, cols, rows);
      if (okCell(fx.bite)) biteRing(ctx, cam, pal, f, fx, wxOf(X(fx.bite)), wzOf(Y(fx.bite)));
      // Painter's order: far rows first; inside a row, outer cells before inner ones.
      // Every cell is its own block (never joined), so breaks and gaps need no bridging.
      const items = [];
      const sn = (snap && Array.isArray(snap.snake)) ? snap.snake : [];
      const dead = snap && snap.alive === false;
      const brk = breakSet(snap);
      sn.forEach((c, i) => { if (okCell(c)) items.push({ x: X(c), y: Y(c), i }); });
      if (snap && okCell(snap.food)) items.push({ x: X(snap.food), y: Y(snap.food), i: -1 });
      const cx = (cols - 1) / 2;
      items.sort((a, b) => a.y - b.y || Math.abs(b.x - cx) - Math.abs(a.x - cx));
      const d = snap ? headDir(snap, brk) : [1, 0];
      // Respawn wait: the short snake breathes gently (LEVELS_PLAN 4.4).
      const pulse = snap && snap.waiting === 'respawn' && !f.rm ? 1 + 0.18 * (0.5 + 0.5 * Math.sin(num(fx.now, f.time * 1000) / 180)) : 1;
      for (const it of items) {
        const wx = wxOf(it.x), wz = wzOf(it.y);
        if (it.i === -1) { gem(ctx, cam, pal, f, wx, wz); continue; }
        if (it.i === 0) {
          block(ctx, cam, wx, wz, 0.06, HEAD_H * pulse, dead ? pal.deadHead : pal.head);
          if (dead) deadCross(ctx, cam, wx, wz, HEAD_H * pulse);
          else chevron(ctx, cam, wx, wz, HEAD_H * pulse, d, shade(pal.head, 0.25));
        } else if ((it.i === sn.length - 1 && sn.length > 2) || brk.has(it.i)) {
          // The tail, and the last cell before a break, end their run as a low tail block.
          block(ctx, cam, wx, wz, 0.2, TAIL_H * pulse, dead ? pal.dead : pal.tail);
        } else {
          block(ctx, cam, wx, wz, 0.1, BODY_H * pulse, dead ? pal.dead : pal.body);
        }
      }
      ctx.restore();
    },
  };
}
