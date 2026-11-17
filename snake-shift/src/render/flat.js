// Canvas 2D manager: layout, flat timelines (scenery -> glitch slices -> board),
// first-person HUD, phrase cards, reduced-flash veil and the DOM inversion overlay.
// Reads snapshots and director state only.
// Space helpers (LEVELS_PLAN 4.5): cube map, dot arrow, seam slide. See notes/overlay.md.

import { cubeNet, canonToLocal, localToCanon, cubeNeighbour } from '../space.js';

const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const WASD = { up: 'W', down: 'S', left: 'A', right: 'D' };
const PHRASE_FONT = '"Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif';
const HUD_BAND = 60; // DOM HUD height reserved at the top (CSS px)

/** Shared layout of plan 15.3. */
// 2D looks that animate the respawn wait themselves; flat.js outlines the rest.
const OWN_WAIT_PULSE = new Set(['abyss', 'mushroom', 'lane', 'castle']);

export function computeLayout(w, h, cols, rows) {
  const cell = Math.max(4, Math.floor(Math.min((0.94 * w) / cols, (0.8 * h) / rows)));
  const bw = cell * cols, bh = cell * rows;
  const bx = Math.round((w - bw) / 2);
  const by = Math.round((h - bh) * 0.6);
  return Object.freeze({ w, h, cell, bx, by, bw, bh, cols, rows });
}

function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const DIR_IDX = { up: 0, right: 1, down: 2, left: 3 };
const DIR_NAMES = ['up', 'right', 'down', 'left'];
const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const FACE_N = 16;
const SLIDE_MS = 140;

const isCell = (c) => !!c && Number.isFinite(c.x) && Number.isFinite(c.y);
const spaceKind = (snap) => (snap && snap.space && snap.space.kind) || 'box';

// Breadth-first distances from the dot over all 6 x 256 cube cells (no obstacles); cached per dot.
let cubeDist = { key: '', dist: null };
function distFromCubeDot(dot) {
  const key = `${dot.f},${dot.u},${dot.v}`;
  if (cubeDist.key === key) return cubeDist.dist;
  const dist = new Int16Array(6 * 256).fill(-1);
  const queue = new Int16Array(6 * 256);
  let head = 0, tail = 0;
  const start = dot.f * 256 + dot.v * FACE_N + dot.u;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++];
    const f = (i / 256) | 0, v = ((i % 256) / FACE_N) | 0, u = i % FACE_N;
    for (let d = 0; d < 4; d++) {
      const n = cubeNeighbour(f, u, v, d);
      const j = n.f * 256 + n.v * FACE_N + n.u;
      if (dist[j] < 0) { dist[j] = dist[i] + 1; queue[tail++] = j; }
    }
  }
  cubeDist = { key, dist };
  return dist;
}

/**
 * Where the off-board dot lies, seen from the active board: { dir, at } with dir a board-local
 * direction and at the edge position in cells (x for up/down, y for left/right), or null.
 * Cube: the seam on the shortest route to the dot. Lane: up (or down when the dot is behind).
 */
export function dotHeading(snap) {
  if (!snap || snap.food || !snap.foodAt) return null;
  const sp = snap.space || {};
  const cols = snap.cols || 16, rows = snap.rows || 16;
  const hd = snap.snake && snap.snake[0];
  if (sp.kind === 'lane') {
    const fy = snap.foodAt.y, y0 = Number.isFinite(sp.y0) ? sp.y0 : 0;
    const at = Math.max(0, Math.min(cols - 1, snap.foodAt.x | 0));
    if (fy < y0) return { dir: 'up', at, dist: y0 - fy };
    if (fy >= y0 + rows) return { dir: 'down', at, dist: fy - y0 - rows + 1 };
    return null;
  }
  if (sp.kind !== 'cube' || !isCell(hd)) return null;
  const dot = snap.foodAt;
  if (!(dot.f >= 0 && dot.f < 6) || dot.f === sp.face) return null;
  const dist = distFromCubeDot(dot);
  const rot = sp.rot | 0;
  const pref = DIR_IDX[snap.dir] !== undefined ? DIR_IDX[snap.dir] : 0;
  let best = null;
  for (let k = 0; k < 4; k++) {
    const L = (pref + k) & 3; // ties go to the travel direction first
    for (let t = 0; t < FACE_N; t++) {
      const ex = L === 1 ? FACE_N - 1 : L === 3 ? 0 : t;
      const ey = L === 2 ? FACE_N - 1 : L === 0 ? 0 : t;
      const c = localToCanon(ex, ey, rot);
      const n = cubeNeighbour(sp.face, c.u, c.v, (L + rot) & 3);
      const dd = dist[n.f * 256 + n.v * FACE_N + n.u];
      if (dd < 0) continue;
      const cost = Math.abs(hd.x - ex) + Math.abs(hd.y - ey) + 1 + dd;
      if (!best || cost < best.dist) best = { dir: DIR_NAMES[L], at: t, dist: cost };
    }
  }
  return best;
}

export function createFlatRenderer({ canvas, invertEl, cols, rows, onBroken = () => {} }) {
  const ctx = canvas.getContext('2d');
  let w = 1, h = 1, dpr = 1;
  let L = computeLayout(w, h, cols, rows);
  const failures = new Map();

  function resize(cssW, cssH, ratio) {
    w = Math.max(1, Math.round(cssW));
    h = Math.max(1, Math.round(cssH));
    dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    L = computeLayout(w, h, cols, rows);
  }

  function guarded(id, fn) {
    ctx.save();
    try {
      fn();
      return true;
    } catch (err) {
      const n = (failures.get(id) || 0) + 1;
      failures.set(id, n);
      if (n === 1) console.error(`[flat] timeline '${id}' failed`, err);
      if (n >= 3) onBroken(id);
      return false;
    } finally {
      ctx.restore();
    }
  }

  // Glitch slices: shred the scenery between the two phases; the board is drawn after.
  function glitch(fx) {
    if (!(fx.glitch > 0.02)) return;
    const seed = Math.floor(fx.time * 18) * 7919 + (fx.variant | 0) * 104729;
    const n = 2 + Math.floor(fx.glitch * 12);
    const maxShift = 10 + fx.glitch * 90;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n; i++) {
      const r1 = hash(seed + i * 31), r2 = hash(seed + i * 57 + 3), r3 = hash(seed + i * 91 + 7);
      const sy = Math.floor(r1 * canvas.height);
      const sh = Math.max(2, Math.floor((2 + r2 * (6 + fx.glitch * 46)) * dpr));
      const dx = Math.round((r3 - 0.5) * 2 * maxShift * dpr);
      ctx.drawImage(canvas, 0, sy, canvas.width, Math.min(sh, canvas.height - sy), dx, sy, canvas.width, Math.min(sh, canvas.height - sy));
    }
    // Colour splitting: thin misregistered bands in opposing hues.
    if (fx.split > 0.5) {
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = Math.min(0.9, 0.25 + fx.glitch * 0.6);
      for (let i = 0; i < 2 + Math.floor(fx.glitch * 4); i++) {
        const r = hash(seed + i * 13 + 99);
        const y = Math.floor(r * canvas.height);
        const hh = Math.max(1, Math.floor(fx.split * dpr * (0.6 + hash(seed + i) * 1.4)));
        ctx.fillStyle = i % 2 ? '#ff0050' : '#00f0ff';
        ctx.fillRect(Math.round((hash(seed + i * 5) - 0.5) * fx.split * 4 * dpr), y, canvas.width, hh);
      }
    }
    ctx.restore();
  }

  // Strobe on the scenery layer only (flat scenes). The board is drawn on top.
  function strobe(fx, info) {
    if (!fx.strobe) return;
    ctx.save();
    const alt = (fx.beatIndex + Math.floor(fx.now / 40)) % 2 === 0;
    ctx.fillStyle = alt ? '#ffffff' : ((info && info.hud && info.hud.accent) || '#ff2bd6');
    ctx.globalAlpha = 0.88;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function phraseCard(d, fx, info) {
    const p = d.phrase;
    if (!p) return;
    const age = fx.now - p.at;
    if (age < 0 || age > p.dur) return;
    const flatScene = info && info.kind === '2d';
    const bottom = flatScene ? L.by - 8 : Math.max(HUD_BAND + 40, h * 0.3);
    // Below the HUD row when there is room; otherwise share the row, between the HUD plates.
    const top = bottom - HUD_BAND >= 56 ? HUD_BAND : 6;
    const band = bottom - top;
    if (band < 22) return;
    const t = age / p.dur;
    const fade = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    const anim = !fx.reducedMotion;
    const pop = anim ? 1 + 0.5 * Math.pow(Math.max(0, 1 - age / 140), 2) : 1;
    ctx.save();
    let size = Math.min(band * 0.78, 140);
    ctx.font = `900 italic ${size}px ${PHRASE_FONT}`;
    // Fit by the ink, not the advance width: the italic overhang, outline and colour split would
    // otherwise run off a phone screen.
    const m = ctx.measureText(p.text);
    const ink = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
    const tw = Math.max(m.width, ink) + size * 0.2;
    const maxW = top < HUD_BAND ? Math.max(120, w - 2 * 178) : w * 0.92;
    if (tw > maxW) {
      size *= maxW / tw;
      ctx.font = `900 italic ${size}px ${PHRASE_FONT}`;
    }
    const cx = w / 2, cy = top + band / 2;
    ctx.translate(cx, cy);
    const tilt = anim ? ((hash(p.seed | 0) - 0.5) * 0.12) : 0;
    ctx.rotate(tilt);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = fade;
    const accent = (info && info.hud && info.hud.accent) || '#ff2bd6';
    if (!fx.reducedFlash) {
      const off = Math.max(2, size * 0.05) * (1 + fx.chaos);
      const jx = anim ? (hash(Math.floor(fx.now / 50)) - 0.5) * off : 0;
      ctx.fillStyle = '#00f0ff';
      ctx.fillText(p.text, -off + jx, 0);
      ctx.fillStyle = '#ff0050';
      ctx.fillText(p.text, off - jx, 0);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.09);
    ctx.strokeStyle = '#000';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = fx.reducedFlash ? '#fff' : (Math.floor(age / 90) % 2 ? accent : '#fff');
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

  function veil(d, fx) {
    const v = d.veil;
    if (!v) return;
    const age = fx.now - v.at;
    if (age < 0 || age >= v.dur) return;
    ctx.save();
    ctx.globalAlpha = v.from * (1 - age / v.dur);
    ctx.fillStyle = v.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function roundRect(x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }

  // First-person HUD: north-up minimap and left/right keycaps.
  function povHud(snap, info, touch, padSide) {
    const accent = (info && info.hud && info.hud.accent) || '#19e6ff';
    // Portrait phones have room to spare at the top: give the map more of it.
    const want = h > w * 1.2 ? w * 0.36 : Math.min(w, h) * 0.24;
    const size = Math.round(Math.max(110, Math.min(190, want)));
    const pad = 12;
    // On-screen pad at the right edge (landscape): map moves left, the pad replaces the keycaps.
    const mx = padSide ? pad + 6 : w - size - pad, my = HUD_BAND + 6;
    const nC = snap.cols || cols, nR = snap.rows || rows;
    const c = size / nC;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundRect(mx - 6, my - 6, size + 12, size + 26, 8);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(mx - 1, my - 1, size + 2, size + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < nR; y++) for (let x = (y % 2); x < nC; x += 2) ctx.fillRect(mx + x * c, my + y * c, c, c);
    if (isCell(snap.food)) {
      ctx.fillStyle = '#ffd400';
      const fx0 = mx + (snap.food.x + 0.5) * c, fy0 = my + (snap.food.y + 0.5) * c;
      ctx.beginPath();
      ctx.moveTo(fx0, fy0 - c * 0.5); ctx.lineTo(fx0 + c * 0.5, fy0); ctx.lineTo(fx0, fy0 + c * 0.5); ctx.lineTo(fx0 - c * 0.5, fy0);
      ctx.fill();
    }
    // Each cell where it is: never joined, so breaks need no special case.
    const sn = Array.isArray(snap.snake) ? snap.snake : [];
    ctx.fillStyle = '#e8f6ff';
    for (let i = sn.length - 1; i >= 1; i--) {
      const s = sn[i];
      if (isCell(s)) ctx.fillRect(mx + s.x * c + 1, my + s.y * c + 1, c - 2, c - 2);
    }
    const hd = sn[0];
    if (isCell(hd)) {
      const hx = mx + (hd.x + 0.5) * c, hy = my + (hd.y + 0.5) * c;
      const dv = DV[snap.dir] || [0, -1];
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hx + dv[0] * c * 0.75, hy + dv[1] * c * 0.75);
      ctx.lineTo(hx - dv[1] * c * 0.6 - dv[0] * c * 0.4, hy + dv[0] * c * 0.6 - dv[1] * c * 0.4);
      ctx.lineTo(hx + dv[1] * c * 0.6 - dv[0] * c * 0.4, hy - dv[0] * c * 0.6 - dv[1] * c * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 11px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('MAP  N↑', mx + size / 2, my + size + 5);

    // Keycaps at the screen edges. First person steers relative to the snake:
    // the left key always turns left, the right key always turns right.
    const k = Math.round(Math.max(48, Math.min(78, Math.min(w, h) * 0.1)));
    const ky = Math.round(h * 0.56 - k / 2);
    const caps = padSide ? [] : [
      { side: 'left', x: 12, d: 'left' },
      { side: 'right', x: w - 12 - k, d: 'right' },
    ];
    for (const cap of caps) {
      if (!cap.d) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      roundRect(cap.x - 4, ky - 22, k + 8, k + 44, 10);
      ctx.fill();
      ctx.fillStyle = '#f2f2f2';
      roundRect(cap.x, ky, k, k, 9);
      ctx.fill();
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(cap.x + 4, ky + k - 7, k - 8, 4);
      ctx.fillStyle = '#111';
      ctx.font = `900 ${Math.round(k * 0.56)}px ${PHRASE_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ARROW[cap.d], cap.x + k / 2, ky + k * 0.46);
      ctx.fillStyle = '#fff';
      ctx.font = `700 11px ui-monospace, Menlo, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(cap.side === 'left' ? '↶ LEFT' : 'RIGHT ↷', cap.x + k / 2, ky - 17);
      ctx.fillText(touch ? `tap ${ARROW[cap.d]}` : `or ${WASD[cap.d]}`, cap.x + k / 2, ky + k + 5);
    }
    ctx.restore();
  }

  // ---- space helpers (LEVELS_PLAN 4.5) -------------------------------------------------------
  const nowOf = (fx) => (Number.isFinite(fx.now) ? fx.now : performance.now());

  const arrowSize = () => Math.max(12, Math.min(34, L.cell * 0.9));

  /**
   * Cube-map placement: the minimap corner. In the 2D look it is sized to stay off the board and
   * clear of the dot arrow; when no corner is free (near-square windows) it sits small over the
   * board's corner, on whichever side keeps the head and the dot clear (alpha 0.25 if neither does).
   */
  function cubeMapBox(padSide, flat, snap) {
    const pad = 12;
    let s, over = false;
    if (flat) {
      const room = arrowSize() + 12;
      const gutter = (w - L.bw) / 2 - 2 * pad - 6 - room;
      const sSide = Math.min(gutter / 3, (h - HUD_BAND - 40) / 4);
      const sTop = Math.min((L.by - HUD_BAND - 34 - room) / 4, (w - 2 * pad) / 3);
      s = Math.max(sSide, sTop);
      if (!(s >= 16)) { s = Math.max(16, Math.min(24, Math.min(w, h) * 0.035)); over = true; }
    } else {
      const want = h > w * 1.2 ? w * 0.36 : Math.min(w, h) * 0.24;
      s = Math.max(110, Math.min(190, want)) / 4;
    }
    s = Math.floor(Math.min(60, s));
    const at = (left) => ({ x: left ? pad + 6 : w - 3 * s - pad, y: HUD_BAND + 6, s, w: 3 * s, h: 4 * s, over, alpha: 1 });
    if (!over) return at(padSide);
    const hits = (r, c) => isCell(c) && L.bx + (c.x + 1.5) * L.cell > r.x - 6 && L.bx + (c.x - 0.5) * L.cell < r.x + r.w + 6
      && L.by + (c.y + 1.5) * L.cell > r.y - 6 && L.by + (c.y - 0.5) * L.cell < r.y + r.h + 26;
    const clear = (r) => !(snap && (hits(r, snap.snake && snap.snake[0]) || hits(r, snap.food)));
    for (const left of [padSide, !padSide]) { const r = at(left); if (clear(r)) { r.alpha = 0.85; return r; } }
    const r = at(padSide);
    r.alpha = 0.25;
    return r;
  }

  /** Unfolded cube in the current frame: current face in the middle and upright. */
  function cubeMap(snap, fx, info, box) {
    const sp = snap.space;
    const net = cubeNet(sp.face | 0, sp.rot | 0);
    const accent = (info && info.hud && info.hud.accent) || '#19e6ff';
    const { x: ox, y: oy, s } = box;
    const c = s / FACE_N;
    const byFace = new Map(net.map((e) => [e.f, e]));
    const at = (cell) => {
      const e = cell && byFace.get(cell.f);
      if (!e) return null;
      const l = canonToLocal(cell.u, cell.v, e.rot);
      return [ox + (e.gx * FACE_N + l.x) * c, oy + (e.gy * FACE_N + l.y) * c];
    };
    const dot = snap.foodAt && snap.foodAt.f !== undefined ? snap.foodAt : null;
    ctx.save();
    ctx.globalAlpha = box.alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundRect(ox - 6, oy - 6, 3 * s + 12, 4 * s + 26, 8);
    ctx.fill();
    for (const e of net) {
      const centre = e.gx === 1 && e.gy === 1;
      ctx.fillStyle = centre ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(ox + e.gx * s + 1, oy + e.gy * s + 1, s - 2, s - 2);
      if (dot && dot.f === e.f && !centre) {
        ctx.fillStyle = 'rgba(255,212,0,0.16)';
        ctx.fillRect(ox + e.gx * s + 1, oy + e.gy * s + 1, s - 2, s - 2);
      }
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + s + 0.75, oy + s + 0.75, s - 1.5, s - 1.5);
    // Body cells one by one: no joins, so breaks and seams never connect.
    const body = Array.isArray(snap.body) && snap.body.length ? snap.body : null;
    const cs = Math.max(1.5, c);
    ctx.fillStyle = '#e8f6ff';
    let headPt = null;
    if (body) {
      for (let i = body.length - 1; i >= 1; i--) {
        const p = at(body[i]);
        if (p) ctx.fillRect(p[0], p[1], cs, cs);
      }
      headPt = at(body[0]);
    } else {
      const sn = Array.isArray(snap.snake) ? snap.snake : [];
      for (let i = sn.length - 1; i >= 1; i--) if (isCell(sn[i])) ctx.fillRect(ox + s + sn[i].x * c, oy + s + sn[i].y * c, cs, cs);
      if (isCell(sn[0])) headPt = [ox + s + sn[0].x * c, oy + s + sn[0].y * c];
    }
    if (headPt) {
      const hs = Math.max(3, c * 1.9);
      ctx.fillStyle = accent;
      ctx.fillRect(headPt[0] + c / 2 - hs / 2, headPt[1] + c / 2 - hs / 2, hs, hs);
    }
    const dp = dot && at(dot);
    if (dp) {
      const pulse = fx.reducedMotion ? 1 : 1 + 0.2 * Math.sin(nowOf(fx) / 140);
      const r = Math.max(3, c * 1.6) * pulse, cx = dp[0] + c / 2, cy = dp[1] + c / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = '#ffd400';
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 11px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('CUBE', ox + 1.5 * s, oy + 4 * s + 5);
    ctx.restore();
  }

  /** Arrow with its tip at (tx, ty), pointing `dir`, `size` long. */
  function arrowShape(tx, ty, dir, size, alpha = 1) {
    const [dx, dy] = DV[dir] || DV.up;
    const px = -dy, py = dx; // across
    const head = size * 0.58, hw = size * 0.5, sw = size * 0.17;
    const pt = (a, b) => [tx - dx * a + px * b, ty - dy * a + py * b];
    const pts = [pt(0, 0), pt(head, hw), pt(head, sw), pt(size, sw), pt(size, -sw), pt(head, -sw), pt(head, -hw)];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.fillStyle = '#ffd400';
    ctx.fill();
    ctx.restore();
  }

  /** Dot arrow on the edge of rect r (board or minimap), outside it when there is room. */
  function edgeArrow(r, cellsAlong, dh, fx, maxSize, room) {
    const [dx, dy] = DV[dh.dir];
    const t = (dh.at + 0.5) / cellsAlong;
    const ex = dh.dir === 'left' ? r.x : dh.dir === 'right' ? r.x + r.w : r.x + t * r.w;
    const ey = dh.dir === 'up' ? r.y : dh.dir === 'down' ? r.y + r.h : r.y + t * r.h;
    let size = Math.min(maxSize, room - 6);
    // Bob only as far as the room allows, so the arrow never leaves the screen.
    const amp = Math.max(0, Math.min(4, room - 6 - size));
    const bob = fx.reducedMotion ? 0 : (0.5 + 0.5 * Math.sin(nowOf(fx) / 150)) * amp;
    if (size >= 10) {
      arrowShape(ex + dx * (size + 3 + bob), ey + dy * (size + 3 + bob), dh.dir, size);
    } else {
      size = Math.max(10, maxSize * 0.8); // no room outside: lie on the edge, pointing out
      arrowShape(ex + dx * (bob * 0.5), ey + dy * (bob * 0.5), dh.dir, size, 0.85);
    }
  }

  /** Dot arrow at the screen edge, for the 3D looks. `avoid` is a rect to keep clear (the map). */
  function screenArrow(dir, t, fx, avoid) {
    const size = Math.round(Math.max(18, Math.min(40, Math.min(w, h) * 0.05)));
    const m = 10, top = HUD_BAND + 8;
    const bob = fx.reducedMotion ? 0 : (0.5 + 0.5 * Math.sin(nowOf(fx) / 150)) * 5;
    const f = 0.2 + 0.6 * t;
    let x, y;
    if (dir === 'up') { x = w * f; y = top + bob; }
    else if (dir === 'down') { x = w * f; y = h - m - bob; }
    else if (dir === 'left') { x = m + bob; y = top + size + (h - top - size - m) * f; }
    else { x = w - m - bob; y = top + size + (h - top - size - m) * f; }
    if (avoid && x > avoid.x - size && x < avoid.x + avoid.w + size && y > avoid.y - size && y < avoid.y + avoid.h + size) {
      if (dir === 'up' || dir === 'down') x = (x > w / 2 ? avoid.x - size : avoid.x + avoid.w + size);
      else y = avoid.y + avoid.h + size + 4;
    }
    arrowShape(x, y, dir, size);
  }

  /**
   * frame: { snap, fx, d (director.get()), timelines, glActive, touch (swipe wording on keycaps) }
   */
  // ---- seam slide (2D look on the cube) -----------------------------------------------------
  // Every 2D cube frame copies the finished board into `last`. When a tick reports a seam crossing,
  // that copy becomes `from` and slides out while the new board slides in along the travel direction.
  const slide = { last: null, from: null, capFrame: -9, capKey: '', key: '', start: -1, dir: null };
  let frameNo = 0;
  const offscreen = () => (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'));

  function captureBoard(key) {
    const cw = Math.max(1, Math.round(L.bw * dpr)), ch = Math.max(1, Math.round(L.bh * dpr));
    if (!slide.last) slide.last = offscreen();
    if (slide.last.width !== cw || slide.last.height !== ch) { slide.last.width = cw; slide.last.height = ch; }
    const c2 = slide.last.getContext('2d');
    c2.clearRect(0, 0, cw, ch);
    c2.drawImage(canvas, Math.round(L.bx * dpr), Math.round(L.by * dpr), cw, ch, 0, 0, cw, ch);
    slide.capFrame = frameNo;
    slide.capKey = key;
  }

  /** Slide progress for this frame, or null when the board should be drawn exactly. */
  function slideNow(snap, fx, capKey) {
    const sp = snap.space;
    if (!sp || sp.kind !== 'cube') { slide.start = -1; return null; }
    const now = nowOf(fx);
    const key = `${snap.tick}|${sp.face}|${sp.rot}|${sp.entered}`;
    if (sp.entered && DV[sp.entered] && key !== slide.key) {
      slide.key = key;
      const fresh = slide.last && slide.capFrame === frameNo - 1 && slide.capKey === capKey;
      if (!fx.reducedMotion && fresh) {
        const t = slide.from; slide.from = slide.last; slide.last = t;
        slide.start = now;
        slide.dir = sp.entered;
      } else slide.start = -1; // cut
    }
    if (slide.start < 0 || fx.reducedMotion) return null;
    const age = now - slide.start;
    if (!(age >= 0 && age < SLIDE_MS)) { slide.start = -1; return null; }
    const k = age / SLIDE_MS;
    return { p: 1 - Math.pow(1 - k, 3), dir: slide.dir };
  }

  function clipRect(x, y, ww, hh) {
    ctx.beginPath();
    ctx.rect(x, y, ww, hh);
    ctx.clip();
  }

  /** Old board image out, new board in, both clipped to the board rect. */
  function drawSlid(drawBoard, sl) {
    const [dx, dy] = DV[sl.dir];
    const { bx, by, bw, bh } = L;
    const nx = dx * (1 - sl.p) * bw, ny = dy * (1 - sl.p) * bh; // new board offset
    const ox = -dx * sl.p * bw, oy = -dy * sl.p * bh;           // old board offset
    const inter = (x, y) => {
      const x0 = Math.max(bx, bx + x), y0 = Math.max(by, by + y);
      const x1 = Math.min(bx + bw, bx + bw + x), y1 = Math.min(by + bh, by + bh + y);
      return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
    };
    ctx.save();
    clipRect(...inter(nx, ny));
    ctx.translate(nx, ny);
    drawBoard();
    ctx.restore();
    ctx.save();
    clipRect(...inter(ox, oy));
    ctx.drawImage(slide.from, bx + ox, by + oy, bw, bh);
    ctx.restore();
  }

  /** Cube map and dot arrow over the current look. mode: '2d' | '3d' | 'pov'. */
  function spaceOverlay(snap, fx, info, mode, padSide) {
    const kind = spaceKind(snap);
    if (kind === 'box') return;
    let map = null;
    if (kind === 'cube' && mode !== 'pov') {
      map = cubeMapBox(padSide, mode === '2d', snap);
      cubeMap(snap, fx, info, map);
      map = { x: map.x - 6, y: map.y - 6, w: map.w + 12, h: map.h + 26 };
    }
    const dh = dotHeading(snap);
    if (!dh) return;
    if (mode === '2d') {
      const room = dh.dir === 'up' ? L.by - HUD_BAND : dh.dir === 'down' ? h - L.by - L.bh
        : dh.dir === 'left' ? L.bx : w - L.bx - L.bw;
      const along = dh.dir === 'up' || dh.dir === 'down' ? L.cols : L.rows;
      edgeArrow({ x: L.bx, y: L.by, w: L.bw, h: L.bh }, along, dh, fx, arrowSize(), room);
    } else if (mode === 'pov') {
      // First person: turn the grid direction into the screen direction relative to the heading.
      const rel = (DIR_IDX[dh.dir] - (DIR_IDX[snap.dir] || 0) + 4) & 3;
      // Side arrows sit high, above the keycaps and below the minimap (same box as povHud).
      const want = h > w * 1.2 ? w * 0.36 : Math.min(w, h) * 0.24;
      const size = Math.round(Math.max(110, Math.min(190, want)));
      const mx = padSide ? 18 : w - size - 12;
      screenArrow(DIR_NAMES[rel], rel === 1 || rel === 3 ? 0 : 0.5, fx, { x: mx - 6, y: HUD_BAND, w: size + 12, h: size + 26 });
    } else {
      screenArrow(dh.dir, (dh.at + 0.5) / (dh.dir === 'up' || dh.dir === 'down' ? L.cols : L.rows), fx, map);
    }
  }

  /**
   * Respawn wait (LEVELS_PLAN 4.4) for 2D looks that do not animate it themselves: a soft outline
   * around each snake cell that breathes slowly (steady under Reduced motion). Never a flash.
   */
  function waitHalo(snap, fx) {
    if (!snap || snap.waiting !== 'respawn' || !snap.alive || !snap.snake) return;
    const t = typeof fx.now === 'number' ? fx.now : performance.now();
    const a = fx.reducedMotion ? 0.45 : 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(t / 280));
    const c = L.cell, pad = Math.max(1.5, c * 0.12);
    ctx.save();
    ctx.lineJoin = 'round';
    for (const [col, lw] of [[`rgba(0,0,0,${a * 0.8})`, Math.max(3, c * 0.16)], [`rgba(255,255,255,${a})`, Math.max(1.5, c * 0.07)]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      for (const p of snap.snake) {
        if (p.x < 0 || p.y < 0 || p.x >= L.cols || p.y >= L.rows) continue;
        ctx.strokeRect(L.bx + p.x * c - pad, L.by + p.y * c - pad, c + 2 * pad, c + 2 * pad);
      }
    }
    ctx.restore();
  }

  function render({ snap, fx, d, timelines, glActive, persp = null, touch = false, padSide = false }) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frameNo++;
    fx = fx || {};
    const info = d.sceneInfo;
    // A room without live WebGL draws through the 2D perspective stand-in (board view only).
    const perspScene = !!(persp && info && info.kind === '3d' && !glActive);
    const flatScene = !info || info.kind === '2d' || (!glActive && !perspScene);
    if (perspScene) {
      ctx.clearRect(0, 0, w, h);
      if (!guarded(info.timeline, () => persp.render(ctx, w, h, info, 'board', snap, fx))) {
        ctx.fillStyle = '#050308';
        ctx.fillRect(0, 0, w, h);
        guarded('lcd', () => timelines.lcd.board(ctx, L, snap, fx));
      }
      spaceOverlay(snap, fx, info, '3d', padSide);
    } else if (flatScene) {
      const id = info && timelines[info.timeline] ? info.timeline : 'lcd';
      const mod = timelines[id] || timelines.lcd;
      ctx.clearRect(0, 0, w, h);
      if (!guarded(id, () => mod.scenery(ctx, L, snap, fx))) {
        ctx.fillStyle = '#050308';
        ctx.fillRect(0, 0, w, h);
      }
      glitch(fx);
      strobe(fx, info);
      const drawBoard = () => {
        if (!guarded(id, () => mod.board(ctx, L, snap, fx)) && mod !== timelines.lcd) {
          guarded('lcd', () => timelines.lcd.board(ctx, L, snap, fx));
        }
      };
      const cube = spaceKind(snap) === 'cube';
      const capKey = `${id}|${L.bw}|${L.bh}|${dpr}`;
      const sl = cube ? slideNow(snap, fx, capKey) : null;
      if (sl && slide.from) drawSlid(drawBoard, sl);
      else drawBoard();
      if (cube) captureBoard(capKey);
      if (!OWN_WAIT_PULSE.has(id)) waitHalo(snap, fx);
      spaceOverlay(snap, fx, info, '2d', padSide);
    } else {
      ctx.clearRect(0, 0, w, h);
      if (info.view === 'pov') povHud(snap, info, touch, padSide);
      spaceOverlay(snap, fx, info, info.view === 'pov' ? 'pov' : '3d', padSide);
    }
    phraseCard(d, fx, info);
    veil(d, fx);

    // Inversion impact (and, for rooms, the strobe burst) through one DOM layer.
    const inv = !fx.reducedFlash && (fx.invert || (!flatScene && fx.strobe === 1));
    if (invertEl) {
      const want = inv ? 'block' : 'none';
      if (invertEl.style.display !== want) invertEl.style.display = want;
    }
  }

  return {
    resize,
    render,
    get layout() { return L; },
    /** Cube-map rect for harnesses: (padSide, flatLook) -> { x, y, s, w, h, over }. */
    cubeMapRect: (padSide = false, flatLook = true, snap = null) => cubeMapBox(padSide, flatLook, snap),
    get size() { return { w, h, dpr }; },
  };
}
