// SNAKE//SHIFT — timeline 04: PIXEL KOMBAT, 1993. Flat Canvas 2D (stream flat-b).
// Contract: BUILD_PLAN.md §15.3. scenery() draws a fictional 16-bit street arena into a low-res
// offscreen buffer (sky, rooftops, graffiti brick wall, neon, crowd, rain, wet street, two original
// background fighters) and upscales it nearest-neighbour; then a fight-HUD and bite pop-ups at full
// resolution. board() stays crisp: steel-framed mat, spiked lethal edge, green block snake with a face,
// red orb, hit spark. Fighters are atmosphere only and never stand on the board. Pure apart from caches.

const TAU = Math.PI * 2;
const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
const mod = (a, n) => ((a % n) + n) % n;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: num(fx.beat), beatIndex: num(fx.beatIndex) | 0, chaos: clamp(num(fx.chaos), 0, 1),
    punch: num(fx.punch), variant: num(fx.variant) | 0, bite: fx.bite || null,
    biteAge: Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity, rf: !!fx.reducedFlash, rm: !!fx.reducedMotion,
  };
}
function dprOf(ctx) {
  const m = ctx.getTransform ? ctx.getTransform() : null;
  return Math.max(1, Math.min(3, (m && Math.hypot(m.a, m.b)) || 1));
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
// Cached layer in CSS px (board) — repaint only when the key changes.
function layer(slot, key, w, h, dpr, paint) {
  if (slot.c && slot.key === key) return slot.c;
  const c = slot.c || document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(g);
  slot.c = c; slot.key = key;
  return c;
}
const blit = (ctx, c, x, y, dpr) => ctx.drawImage(c, x, y, c.width / dpr, c.height / dpr);

export const meta = {
  id: 'kombat', name: 'PIXEL KOMBAT', year: '1993', kind: '2d',
  luma: 0.2, veil: '#2a1438', weight: 3,
  hud: { fg: '#ffd21f', bg: '#14081f', accent: '#ff3b1f', panelFg: '#ffe9a8', panelBg: 'rgba(20,8,31,0.94)' },
};

// Per-variant palette: sky bands and neon colours step on every bite.
const PALS = [
  { sky: ['#1a0b2e', '#3b1259', '#7a1f6b', '#c23a5c', '#ff7a3d'], neon: ['#ff2bd6', '#2bf0ff', '#ffe81a'], accent: '#ff3b1f' },
  { sky: ['#06122e', '#0f2d5c', '#1f5a8a', '#3fa0b0', '#a8ffd8'], neon: ['#39ff6a', '#ff2b5a', '#2bb8ff'], accent: '#39ff6a' },
  { sky: ['#1e0606', '#4a0f12', '#8a1f1a', '#d0451f', '#ffc23d'], neon: ['#2bf0ff', '#ff2bd6', '#fff35a'], accent: '#ffd21f' },
  { sky: ['#0a0418', '#24124a', '#4a1f8a', '#8a3fd0', '#ff8af0'], neon: ['#ffe81a', '#39ff6a', '#ff3b1f'], accent: '#ff2bd6' },
];
const LIVE = { body: '#3fbf3f', body2: '#33a833', hi: '#9af59a', lo: '#1c6e1c', ink: '#082808', head: '#5fe05f' };
const DEAD = { body: '#5d6b5d', body2: '#566356', hi: '#7f8c7f', lo: '#3c463c', ink: '#161c16', head: '#6b786b' };
const C = { board: {}, sky: {}, far: {}, wall: {}, street: {} };
let LOW = null;   // low-res buffer { c, g, w, h, P }

// ───────────────────────────── board ─────────────────────────────

const margin = (L) => Math.max(5, Math.round(L.cell * 0.32));

function paintBoard(g, L, m, pal) {
  const W = L.bw + 2 * m, H = L.bh + 2 * m, c = L.cell;
  // steel frame
  g.fillStyle = '#0c0812'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4a4458'; g.fillRect(1, 1, W - 2, H - 2);
  g.fillStyle = '#7a7490'; g.fillRect(1, 1, W - 2, 1); g.fillRect(1, 1, 1, H - 2);
  g.fillStyle = '#2a2436'; g.fillRect(1, H - 2, W - 2, 1); g.fillRect(W - 2, 1, 1, H - 2);
  // spikes on all four sides, pointing in: the lethal edge reads by shape
  const s = Math.max(3, m - 2), step = Math.max(6, Math.round(c / 2));
  const spike = (bx, by, tx, ty, ox, oy) => {
    g.fillStyle = '#d8d8ea'; g.beginPath(); g.moveTo(bx - ox, by - oy); g.lineTo(tx, ty); g.lineTo(bx + ox, by + oy); g.closePath(); g.fill();
    g.fillStyle = '#8a8aa4'; g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.lineTo(bx + ox, by + oy); g.closePath(); g.fill();
  };
  const hw = Math.max(2, step * 0.4);
  for (let x = m + step / 2; x < W - m; x += step) { spike(x, m - s, x, m, hw, 0); spike(x, H - m + s, x, H - m, hw, 0); }
  for (let y = m + step / 2; y < H - m; y += step) { spike(m - s, y, m, y, 0, hw); spike(W - m + s, y, W - m, y, 0, hw); }
  // rivets
  g.fillStyle = '#b8b2cc';
  for (const [rx, ry] of [[2, 2], [W - 4, 2], [2, H - 4], [W - 4, H - 4]]) g.fillRect(rx, ry, 2, 2);
  // mat: two close darks in a checker, grid on cell borders
  g.fillStyle = '#17101f'; g.fillRect(m, m, L.bw, L.bh);
  g.fillStyle = '#1d1528';
  for (let j = 0; j < L.rows; j++) for (let i = (j % 2); i < L.cols; i += 2) g.fillRect(m + i * c, m + j * c, c, c);
  g.fillStyle = '#2b2040';
  for (let i = 1; i < L.cols; i++) g.fillRect(m + i * c, m, 1, L.bh);
  for (let j = 1; j < L.rows; j++) g.fillRect(m, m + j * c, L.bw, 1);
  g.fillStyle = pal.accent; g.globalAlpha = 0.85;
  g.fillRect(m - 1, m - 1, L.bw + 2, 1); g.fillRect(m - 1, m + L.bh, L.bw + 2, 1);
  g.fillRect(m - 1, m - 1, 1, L.bh + 2); g.fillRect(m + L.bw, m - 1, 1, L.bh + 2);
  g.globalAlpha = 1;
}

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), pi = mod(fx.variant, PALS.length), pal = PALS[pi], m = margin(L);
  ctx.save();
  const key = [L.w, L.h, L.cell, L.bx, L.by, L.cols, L.rows, dpr, pi].join();
  blit(ctx, layer(C.board, key, L.bw + 2 * m, L.bh + 2 * m, dpr, (g) => paintBoard(g, L, m, pal)), L.bx - m, L.by - m, dpr);
  drawDot(ctx, L, snap, fx);
  drawSnake(ctx, L, snap, fx);
  hitSpark(ctx, L, fx);
  ctx.restore();
}

// Dot: a red orb with a hard highlight and a pulsing ring on the beat.
function drawDot(ctx, L, snap, fx) {
  const f = snap.food;
  if (!f) return;
  const c = L.cell, cx = L.bx + (X(f) + 0.5) * c, cy = L.by + (Y(f) + 0.5) * c, r = c * 0.36;
  ctx.save();
  ctx.fillStyle = '#2a0006'; ctx.beginPath(); ctx.arc(cx, cy, r + Math.max(1, c / 18), 0, TAU); ctx.fill();
  const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  gr.addColorStop(0, '#ff8a6a'); gr.addColorStop(0.45, '#ff2420'); gr.addColorStop(1, '#8a0010');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  const hs = Math.max(2, Math.round(c * 0.1));
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(cx - r * 0.5), Math.round(cy - r * 0.55), hs, hs);
  if (fx.beat > 0.05) {
    ctx.strokeStyle = '#ff5a3d'; ctx.globalAlpha = fx.beat * 0.8; ctx.lineWidth = Math.max(1, c / 16);
    ctx.beginPath(); ctx.arc(cx, cy, r + c * 0.1 * (1 - fx.beat) + 2, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function headDir(snap) {
  const s = snap.snake;
  if (s.length > 1) { const dx = X(s[0]) - X(s[1]), dy = Y(s[0]) - Y(s[1]); if (Math.abs(dx) + Math.abs(dy) === 1) return [dx, dy]; }
  return DIRS[snap.dir] || [1, 0];
}

// Snake: bevelled 16-bit green blocks chained by short bridges; the head is a full block with a face.
export function drawSnake(ctx, L, snap, fxIn) {
  const s = snap.snake;
  if (!s || !s.length) return;
  const fx = fxIn && fxIn.rf !== undefined ? fxIn : norm(fxIn);
  const c = L.cell, dead = snap.alive === false, P = dead ? DEAD : LIVE;
  const p = Math.max(1, Math.round(c * 0.09)), u = Math.max(1, Math.round(c / 9)), w = c - 2 * p;
  ctx.save();
  // bridges first, so blocks sit on top of them
  const bw = Math.round(c * 0.46);
  ctx.fillStyle = P.lo;
  for (let i = 1; i < s.length; i++) {
    const a = s[i], b = s[i - 1], dx = X(b) - X(a), dy = Y(b) - Y(a);
    if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
    const mx = L.bx + (X(a) + 0.5 + dx * 0.5) * c, my = L.by + (Y(a) + 0.5 + dy * 0.5) * c;
    if (dx) ctx.fillRect(Math.round(mx - p - 1), Math.round(my - bw / 2), 2 * p + 2, bw);
    else ctx.fillRect(Math.round(mx - bw / 2), Math.round(my - p - 1), bw, 2 * p + 2);
  }
  for (let i = s.length - 1; i >= 1; i--) {
    const x = L.bx + X(s[i]) * c + p, y = L.by + Y(s[i]) * c + p;
    ctx.fillStyle = P.ink; ctx.fillRect(x, y, w, w);
    ctx.fillStyle = i % 2 ? P.body : P.body2; ctx.fillRect(x + 1, y + 1, w - 2, w - 2);
    ctx.fillStyle = P.hi; ctx.fillRect(x + 1, y + 1, w - 2, u); ctx.fillRect(x + 1, y + 1, u, w - 2);
    ctx.fillStyle = P.lo; ctx.fillRect(x + 1, y + w - 1 - u, w - 2, u); ctx.fillRect(x + w - 1 - u, y + 1, u, w - 2);
    if (c >= 14) { ctx.fillStyle = P.lo; ctx.fillRect(x + Math.round(w * 0.25), y + Math.round(w * 0.3), u, u); ctx.fillRect(x + Math.round(w * 0.62), y + Math.round(w * 0.62), u, u); }
  }
  drawHead(ctx, L, snap, fx, P, dead, u);
  ctx.restore();
}

function drawHead(ctx, L, snap, fx, P, dead, u) {
  const c = L.cell, h = snap.snake[0], d = headDir(snap), x = L.bx + X(h) * c, y = L.by + Y(h) * c;
  const cx = x + c / 2, cy = y + c / 2, px = -d[1], py = d[0];
  // tongue flick on the beat, out of the front edge (alive only)
  if (!dead && fx.beat > 0.35) {
    const L0 = c * 0.5, L1 = c * (0.5 + 0.28 * fx.beat), tw = Math.max(1, Math.round(c / 14));
    ctx.fillStyle = '#ff2a4a';
    const tx = cx + d[0] * L0, ty = cy + d[1] * L0;
    ctx.fillRect(Math.round(Math.min(tx, cx + d[0] * L1) - (d[0] ? 0 : tw / 2)), Math.round(Math.min(ty, cy + d[1] * L1) - (d[1] ? 0 : tw / 2)),
      d[0] ? Math.round(L1 - L0) : tw, d[1] ? Math.round(L1 - L0) : tw);
  }
  ctx.fillStyle = P.ink; ctx.fillRect(x, y, c, c);
  ctx.fillStyle = P.head; ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
  ctx.fillStyle = P.hi; ctx.fillRect(x + 1, y + 1, c - 2, u); ctx.fillRect(x + 1, y + 1, u, c - 2);
  ctx.fillStyle = P.lo; ctx.fillRect(x + 1, y + c - 1 - u, c - 2, u); ctx.fillRect(x + c - 1 - u, y + 1, u, c - 2);
  // eyes near the front edge, pupils looking ahead; X eyes when dead
  const es = Math.max(3, Math.round(c * 0.22)), ps = Math.max(1, Math.round(es * 0.5));
  for (const side of [-1, 1]) {
    const ex = cx + d[0] * c * 0.16 + px * side * c * 0.22, ey = cy + d[1] * c * 0.16 + py * side * c * 0.22;
    const ox = Math.round(ex - es / 2), oy = Math.round(ey - es / 2);
    if (dead) {
      ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1, c / 16);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + es, oy + es); ctx.moveTo(ox + es, oy); ctx.lineTo(ox, oy + es); ctx.stroke();
    } else {
      ctx.fillStyle = P.ink; ctx.fillRect(ox - 1, oy - 1, es + 2, es + 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ox, oy, es, es);
      ctx.fillStyle = '#000000';
      ctx.fillRect(Math.round(ex - ps / 2 + d[0] * (es - ps) / 2), Math.round(ey - ps / 2 + d[1] * (es - ps) / 2), ps, ps);
    }
  }
  // mouth along the front edge with two fangs
  const mx = cx + d[0] * c * 0.38, my = cy + d[1] * c * 0.38, ml = c * 0.3, mt = Math.max(1, u);
  ctx.fillStyle = P.ink;
  ctx.fillRect(Math.round(mx - Math.abs(px) * ml - (d[0] ? mt / 2 : 0)), Math.round(my - Math.abs(py) * ml - (d[1] ? mt / 2 : 0)), d[0] ? mt : Math.round(2 * ml), d[1] ? mt : Math.round(2 * ml));
  if (!dead) {
    ctx.fillStyle = '#ffffff';
    const fs = Math.max(1, Math.round(c * 0.08));
    for (const side of [-1, 1]) ctx.fillRect(Math.round(mx + px * side * ml * 0.6 - fs / 2 + d[0] * fs * 0.5), Math.round(my + py * side * ml * 0.6 - fs / 2 + d[1] * fs * 0.5), fs, fs);
  }
}

// Bite: a jagged hit spark plus pixel debris (outlines and alpha only, softened under reduced flash).
function hitSpark(ctx, L, fx) {
  if (!fx.bite || fx.biteAge > 360) return;
  const c = L.cell, t = fx.biteAge / 360, cx = L.bx + (X(fx.bite) + 0.5) * c, cy = L.by + (Y(fx.bite) + 0.5) * c;
  const r = c * (0.5 + 1.4 * t), k = fx.rf ? 0.3 : 1;
  ctx.save();
  ctx.globalAlpha = (1 - t) * k;
  ctx.strokeStyle = '#fff35a'; ctx.lineWidth = Math.max(1.5, c / 10);
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU + fx.variant, rr = i % 2 ? r * 0.45 : r;
    const qx = cx + Math.cos(a) * rr, qy = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy);
  }
  ctx.stroke();
  const ds = Math.max(2, Math.round(c / 7));
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) {
    const a = hash(i + fx.variant * 9) * TAU, rr = c * (0.4 + 2.2 * t) * (0.6 + 0.4 * hash(i * 3 + fx.variant));
    ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), ds, ds);
  }
  ctx.restore();
}

// ───────────────────────────── scenery ─────────────────────────────

// Where the fighters stand (CSS px): beside the board when there is room, else in the band above it.
export function stage(L) {
  const m = margin(L), side = L.bx - m;
  if (side >= L.cell * 3) {
    const fh = Math.min(L.bh * 0.6, side * 1.4);
    return { mode: 'side', fh, feet: L.by + L.bh * 0.82, xs: [side / 2, L.w - side / 2], horizon: L.by + L.bh * 0.42 };
  }
  const top = L.by - m, fh = clamp(top * 0.62, 24, L.w * 0.36), feet = top - 6;
  return { mode: 'top', fh, feet, xs: [L.w * 0.2, L.w * 0.8], horizon: feet - fh * 0.22 };
}

function lowBuffer(L) {
  const P = Math.max(2, Math.round(Math.min(L.w, L.h) / 200)), w = Math.ceil(L.w / P) + 2, h = Math.ceil(L.h / P) + 2;
  if (!LOW || LOW.w !== w || LOW.h !== h || LOW.P !== P) {
    const c = canvas(w, h), g = c.getContext('2d');
    LOW = { c, g, w, h, P };
  }
  LOW.g.imageSmoothingEnabled = false;
  return LOW;
}

function cachedLow(slot, key, w, h, paint) {
  if (slot.c && slot.key === key) return slot.c;
  const c = canvas(w, h), g = c.getContext('2d');
  g.imageSmoothingEnabled = false; paint(g, c.width, c.height);
  slot.c = c; slot.key = key;
  return c;
}

// Sky: hard colour bands with a dither row between them, stars, a big pale moon.
function paintSky(g, w, h, pal) {
  const n = pal.sky.length, bh = Math.ceil((h * 0.9) / n);
  for (let i = 0; i < n; i++) { g.fillStyle = pal.sky[i]; g.fillRect(0, i * bh, w, bh + 1); }
  g.fillRect(0, n * bh, w, h);
  for (let i = 1; i < n; i++) { g.fillStyle = pal.sky[i - 1]; for (let x = i % 2; x < w; x += 2) g.fillRect(x, i * bh, 1, 1); }
  g.fillStyle = '#ffffff';
  for (let i = 0; i < w * 0.35; i++) { const x = Math.floor(hash(i * 1.7) * w), y = Math.floor(hash(i * 2.3 + 4) * h * 0.45); g.globalAlpha = 0.4 + 0.6 * hash(i); g.fillRect(x, y, 1, 1); }
  g.globalAlpha = 1;
  const mr = Math.max(4, Math.round(h * 0.1)), mx = Math.round(w * 0.7), my = Math.round(h * 0.22);
  g.fillStyle = '#ffe9c8'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
  g.fillStyle = 'rgba(160,110,140,0.55)'; g.fillRect(mx - mr * 0.4, my - mr * 0.2, mr * 0.3, mr * 0.3); g.fillRect(mx + mr * 0.2, my + mr * 0.3, mr * 0.25, mr * 0.2);
}

// Far skyline: dark blocks with lit windows, water towers and antennas (wider than the screen for parallax).
function paintFar(g, w, h) {
  let x = 0, k = 0;
  while (x < w) {
    const bw = 7 + Math.floor(hash(k * 3.1) * 16), bh = Math.round(h * (0.22 + hash(k * 5.7) * 0.4)), y = h - bh;
    g.fillStyle = k % 2 ? '#150b22' : '#1c0f2c'; g.fillRect(x, y, bw, bh);
    g.fillStyle = '#2a1a3e'; g.fillRect(x, y, bw, 1);
    for (let wy = y + 3; wy < h - 2; wy += 3) for (let wx = x + 2; wx < x + bw - 1; wx += 3) {
      const r = hash(wx * 0.37 + wy * 1.91);
      if (r > 0.72) { g.fillStyle = r > 0.93 ? '#5af0ff' : '#ffd25a'; g.fillRect(wx, wy, 1, 1); }
    }
    if (hash(k * 9.3) > 0.6) { g.fillStyle = '#120a1c'; g.fillRect(x + 2, y - 5, 5, 3); g.fillRect(x + 2, y - 2, 1, 2); g.fillRect(x + 6, y - 2, 1, 2); }
    else if (hash(k * 4.4) > 0.5) { g.fillStyle = '#120a1c'; g.fillRect(x + (bw >> 1), y - 7, 1, 7); g.fillStyle = '#ff2b2b'; g.fillRect(x + (bw >> 1), y - 8, 1, 1); }
    x += bw + (hash(k * 7.7) > 0.7 ? 2 : 0); k++;
  }
}

const GRAF = ['#ff5ad0', '#6aff5a', '#4ab0ff', '#ffd21f', '#ff6a2a', '#c07aff'];
// Brick wall with a shutter door, pipes, posters and abstract graffiti (no lettering from real games).
function paintWall(g, w, h, seed) {
  g.fillStyle = '#4a2026'; g.fillRect(0, 0, w, h);
  for (let y = 2, row = 0; y < h; y += 3, row++) {
    g.fillStyle = '#26101a'; g.fillRect(0, y, w, 1);
    for (let x = row % 2 ? -3 : 0; x < w; x += 7) {
      g.fillStyle = '#26101a'; g.fillRect(x, y - 2, 1, 2);
      const r = hash(x * 0.71 + y * 3.3);
      if (r > 0.8) { g.fillStyle = r > 0.92 ? '#62303a' : '#3a161e'; g.fillRect(x + 1, y - 2, 6, 2); }
    }
  }
  // ledge
  g.fillStyle = '#1a0c16'; g.fillRect(0, 0, w, 3); g.fillStyle = '#7a4a5a'; g.fillRect(0, 0, w, 1);
  // shutter doors and pipes
  for (let k = 0; k < 3; k++) {
    const dw = Math.round(h * 0.9), dx = Math.round(((k + 0.3 + hash(k + seed) * 0.4) / 3) * w), dh = Math.round(h * 0.62), dy = h - dh;
    if (k === 1) {
      g.fillStyle = '#4a4a5a'; g.fillRect(dx, dy, dw, dh);
      g.fillStyle = '#2e2e3a'; for (let y = dy + 1; y < h; y += 2) g.fillRect(dx, y, dw, 1);
      g.fillStyle = '#1a1a22'; g.fillRect(dx - 1, dy - 2, dw + 2, 2);
    } else {
      g.fillStyle = '#2a2a34'; g.fillRect(dx, 3, 2, h - 3); g.fillStyle = '#5a5a6a'; g.fillRect(dx, 3, 1, h - 3);
    }
  }
  // graffiti: blobs with outlines, highlights and drips; zigzags; stars
  const n = Math.round(w / 18);
  for (let i = 0; i < n; i++) {
    const t = hash(i * 13.1 + seed), cx = Math.round(hash(i * 7.9 + seed) * w), cy = Math.round(h * (0.35 + hash(i * 3.3 + seed) * 0.4));
    const col = GRAF[Math.floor(hash(i * 5.1 + seed) * GRAF.length)], sz = 3 + Math.round(hash(i * 2.2) * h * 0.14);
    if (t < 0.45) {
      const parts = 3 + Math.floor(hash(i) * 3), pts = [];
      for (let k = 0; k < parts; k++) pts.push([cx + (k - parts / 2) * sz * 0.8, cy + (hash(i * 9 + k) - 0.5) * sz * 0.6, sz * (0.6 + 0.4 * hash(i + k * 4))]);
      g.fillStyle = '#0a0410'; for (const [px, py, r] of pts) { g.beginPath(); g.arc(px, py, r + 1, 0, TAU); g.fill(); }
      g.fillStyle = col; for (const [px, py, r] of pts) { g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill(); }
      g.fillStyle = '#ffffff'; for (const [px, py, r] of pts) g.fillRect(Math.round(px - r * 0.4), Math.round(py - r * 0.5), 1, 1);
      g.fillStyle = col; for (let k = 0; k < parts; k++) if (hash(i * 4 + k) > 0.5) g.fillRect(Math.round(pts[k][0]), Math.round(pts[k][1] + pts[k][2]), 1, 2 + Math.round(hash(k + i) * 5));
    } else if (t < 0.75) {
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
      for (let k = 0; k < 6; k++) { const px = cx + k * sz * 0.5, py = cy + (k % 2 ? -sz * 0.4 : sz * 0.4); k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    } else {
      g.fillStyle = col; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, r = k % 2 ? sz * 0.4 : sz; k ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
  }
  // grime at the foot of the wall
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 3, w, 3);
}

// Street: asphalt, curb, lane dashes, puddles that catch the sky colour.
function paintStreet(g, w, h, pal) {
  for (let y = 0; y < h; y++) { const t = y / h; g.fillStyle = t < 0.08 ? '#3a3046' : y % 3 === 0 ? '#120d1a' : '#17111f'; g.fillRect(0, y, w, 1); }
  g.fillStyle = '#5a4a66'; g.fillRect(0, Math.round(h * 0.08), w, 1);
  const ly = Math.round(h * 0.45);
  g.fillStyle = '#8a7a50'; for (let x = 0; x < w; x += 14) g.fillRect(x, ly, 7, 1);
  for (let i = 0; i < Math.round(w / 40); i++) {
    const px = hash(i * 3.7) * w, py = h * (0.2 + hash(i * 8.1) * 0.7), rw = 6 + hash(i) * 18;
    g.fillStyle = pal.sky[2]; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(px, py, rw, rw * 0.22, 0, 0, TAU); g.fill();
    g.fillStyle = pal.sky[4]; g.globalAlpha = 0.5; g.fillRect(Math.round(px - rw * 0.4), Math.round(py), Math.round(rw * 0.5), 1);
  }
  g.globalAlpha = 1;
}

// ── fighters: two original designs built from rotated blocks (no pixel maps, nothing borrowed).
// A: lanky street brawler, teal mohawk, orange bomber jacket, chrome prosthetic forearm, purple pants.
// B: stocky dock worker in a yellow rain hood and coat, round cyan goggles, big blue mitts.
const INK = '#0a0410';
const FIGHTERS = [
  { bulk: 1, tall: 1.05, skin: '#b5764a', top: '#ff8a1f', top2: '#c05a10', fore: '#a8b0c4', fist: '#d8dcec', legs: '#5a2a8a', boot: '#f0f0f0', fistS: 2.6, kind: 'mohawk' },
  { bulk: 1.45, tall: 0.92, skin: '#e0b090', top: '#ffd21f', top2: '#c89a10', fore: '#ffd21f', fist: '#2b5aff', legs: '#2a7a3a', boot: '#1a1a1a', fistS: 3.8, kind: 'hood' },
];
// Angles from straight down; positive swings toward the side the fighter faces. [upper, lower].
const POSES = {
  idle: { fa: [0.9, 2.5], ba: [0.5, 2.2], fl: [0.35, 0.05], bl: [-0.35, -0.05], lean: 0.06 },
  upper: { fa: [2.9, 3.1], ba: [0.4, 1.9], fl: [0.25, 0], bl: [-0.25, 0], lean: -0.12 },
  kick: { fa: [0.8, 2.4], ba: [-0.6, 1.2], fl: [1.65, 1.6], bl: [-0.15, -0.05], lean: -0.3 },
  flex: { fa: [1.6, 3.0], ba: [-1.6, -3.0], fl: [0.45, 0.1], bl: [-0.45, -0.1], lean: 0 },
  jab: { fa: [1.55, 1.6], ba: [0.6, 2.4], fl: [0.45, 0.05], bl: [-0.4, -0.1], lean: 0.22 },
};
const POSE_SETS = [['upper', 'kick', 'jab'], ['flex', 'jab', 'kick']];

function blend(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => v + (b[key][i] - v) * k) : a[key] + (b[key] - a[key]) * k;
  return o;
}
function seg(g, x0, y0, a, len, wid, col, face) {
  const dx = Math.sin(a) * face, dy = Math.cos(a);
  g.save(); g.translate(x0, y0); g.rotate(Math.atan2(dy, dx) - Math.PI / 2);
  g.fillStyle = INK; g.fillRect(-wid / 2 - 1, -1, wid + 2, len + 2);
  g.fillStyle = col; g.fillRect(-wid / 2, 0, wid, len);
  g.restore();
  return [x0 + dx * len, y0 + dy * len];
}
function box(g, x, y, w, h, col) { g.fillStyle = INK; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, Math.round(w) + 2, Math.round(h) + 2); g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

// Draws one fighter with feet at (x, feet) in low-res px; u = px per unit (≈40 units tall). Returns the front fist.
function fighter(g, D, x, feet, u, face, P, bob) {
  u *= D.tall;
  const thigh = 9 * u, shin = 9 * u, torso = 12 * u, B = D.bulk;
  const legH = (l) => Math.cos(l[0]) * thigh + Math.cos(l[1]) * shin;
  const hx = x, hy = feet - Math.max(legH(P.fl), legH(P.bl)) + bob * u;
  const nx = hx + Math.sin(P.lean) * face * torso, ny = hy - Math.cos(P.lean) * torso;
  const sF = [nx + face * 1.6 * u * B, ny + 1.2 * u], sB = [nx - face * 1.6 * u * B, ny + 1.2 * u];
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(x, feet + 1, 7 * u * B, 1.6 * u, 0, 0, TAU); g.fill();
  const arm = (s, A, front) => {
    const e = seg(g, s[0], s[1], A[0], 6.5 * u, 3 * u * B, D.top2, face);
    const h = seg(g, e[0], e[1], A[1], 6 * u, 2.6 * u * B, front ? D.fore : D.top2, face);
    const fs = D.fistS * u; box(g, h[0] - fs / 2, h[1] - fs / 2, fs, fs, D.fist);
    return h;
  };
  const leg = (l, col) => {
    const k = seg(g, hx, hy, l[0], thigh, 3.8 * u * B, col, face);
    const a = seg(g, k[0], k[1], l[1], shin, 3.2 * u * B, col, face);
    box(g, a[0] - (face > 0 ? 1 : 3.5) * u * B, a[1] - 1.5 * u, 4.5 * u * B, 2.4 * u, D.boot);
  };
  arm(sB, P.ba, false);
  leg(P.bl, D.legs);
  // torso (and a coat tail for the hood design)
  if (D.kind === 'hood') box(g, hx - 4.2 * u * B, hy - 1 * u, 8.4 * u * B, 6 * u, D.top2);
  seg(g, hx, hy, Math.PI - P.lean, torso, 6.4 * u * B, D.top, face);
  box(g, hx - 3.4 * u * B, hy - 1.6 * u, 6.8 * u * B, 1.6 * u, INK);
  leg(P.fl, D.legs);
  // head
  const hw = 6 * u, hh = 7 * u, hxl = nx - hw / 2 + face * 0.6 * u, hyt = ny - hh - 0.6 * u;
  if (D.kind === 'hood') {
    box(g, hxl - 0.8 * u, hyt - 0.8 * u, hw + 1.6 * u, hh + 1.2 * u, D.top);
    box(g, face > 0 ? hxl + hw - 3.6 * u : hxl + 0.4 * u, hyt + 2 * u, 3.2 * u, 4 * u, D.skin);
    box(g, face > 0 ? hxl + hw - 2.8 * u : hxl + 0.4 * u, hyt + 2.2 * u, 2.4 * u, 1.8 * u, '#5af0ff');
  } else {
    box(g, hxl, hyt, hw, hh, D.skin);
    box(g, hxl + hw / 2 - face * 1.2 * u - 1 * u, hyt - 3.6 * u, 2 * u, 4.2 * u, '#2bf0d0');
    g.fillStyle = INK; g.fillRect(Math.round(face > 0 ? hxl + hw - 2 * u : hxl + 1 * u), Math.round(hyt + 2.4 * u), Math.max(1, Math.round(u)), Math.max(1, Math.round(u)));
    g.fillStyle = '#7a3a1a'; g.fillRect(Math.round(hxl + (face > 0 ? hw * 0.35 : hw * 0.25)), Math.round(hyt + hh - 2 * u), Math.round(hw * 0.4), Math.max(1, Math.round(0.6 * u)));
  }
  return arm(sF, P.fa, true);
}

// ── per-frame arena parts (all in low-res px)
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function digits(g, str, x, y) { for (let k = 0; k < str.length; k++) { const b = DIG[str.charCodeAt(k) - 48]; if (!b) continue; for (let i = 0; i < 15; i++) if (b[i] === '1') g.fillRect(x + k * 4 + (i % 3), y + Math.floor(i / 3), 1, 1); } }

function neon(g, fx, pal, wx, wy, wh, ww) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const sw = Math.max(12, Math.round(wh * 0.62)), sh = Math.max(7, Math.round(wh * 0.3));
    const x = Math.round(wx + ww * (0.08 + 0.25 * i)), y = Math.round(wy + wh * (0.12 + 0.08 * (i % 2)));
    const step = fx.chaos > 0.45 ? fx.beatIndex : 0, col = pal.neon[(i + step) % pal.neon.length];
    const dead = hash(Math.floor(fx.time * 14) + i * 7) < 0.08 + fx.chaos * 0.3 && fx.beat < 0.6;
    out.push({ x, y, w: sw, h: sh, col, on: !dead });
    if (dead) { g.fillStyle = '#2a1a2e'; g.fillRect(x, y, sw, 1); continue; }
    g.globalAlpha = 0.28 + fx.beat * 0.3; g.fillStyle = col; g.fillRect(x - 2, y - 2, sw + 4, sh + 4);
    g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 1; g.fillStyle = col;
    const kind = (i + (fx.variant >> 1)) % 4;
    if (kind === 0) { g.strokeRect(x + 0.5, y + 0.5, sw - 1, sh - 1); g.fillStyle = '#ffffff'; digits(g, '1993', x + Math.max(1, (sw - 15) >> 1), y + Math.max(1, (sh - 5) >> 1)); }
    else if (kind === 1) { g.beginPath(); g.moveTo(x, y + sh / 2); g.lineTo(x + sw * 0.7, y + sh / 2); g.moveTo(x + sw * 0.5, y + 1); g.lineTo(x + sw - 1, y + sh / 2); g.lineTo(x + sw * 0.5, y + sh - 1); g.stroke(); }
    else if (kind === 2) { g.beginPath(); g.moveTo(x + sw * 0.6, y); g.lineTo(x + sw * 0.3, y + sh * 0.55); g.lineTo(x + sw * 0.6, y + sh * 0.45); g.lineTo(x + sw * 0.4, y + sh); g.stroke(); g.beginPath(); g.arc(x + sw * 0.5, y + sh / 2, sh * 0.7, 0, TAU); g.stroke(); }
    else { for (let k = 0; k < 3; k++) g.fillRect(x + k * Math.round(sw / 3), y + ((k + fx.beatIndex) % 2 ? 0 : sh - 2), Math.round(sw / 3) - 2, 2); g.strokeRect(x + 0.5, y + 0.5, sw - 1, sh - 1); }
  }
  return out;
}

const SHIRTS = ['#3a2a5a', '#5a1a2a', '#1a3a4a', '#4a4a1a', '#2a4a2a', '#6a3a1a'];
const SKINS = ['#e0b090', '#b5764a', '#7a4a2a', '#f0c8a0', '#9a6a40'];
function crowd(g, fx, lw, hz, off) {
  const jump = fx.biteAge < 600 ? 1 - fx.biteAge / 600 : 0;
  for (let row = 0; row < 2; row++) {
    const base = hz - (row ? 3 : 0), n = Math.ceil(lw / 5) + 4;
    for (let i = 0; i < n; i++) {
      const id = i + row * 97, x = Math.round(mod(i * 5 + row * 2 + off, n * 5) - 8);
      const bob = Math.round(Math.max(0, Math.sin(fx.time * (6 + hash(id) * 4) + id)) * (0.5 + fx.chaos * 1.6) + fx.beat * 1.4 + jump * 3 * hash(id * 3));
      const y = base - 6 - bob, dark = row ? 0.55 : 0;
      g.fillStyle = SHIRTS[id % SHIRTS.length]; g.fillRect(x, y + 3, 4, 5 + bob);
      g.fillStyle = SKINS[id % SKINS.length]; g.fillRect(x + 1, y, 3, 3);
      if (jump > 0.1 && hash(id * 7) > 0.35) { g.fillRect(x - 1, y - 3, 1, 4); g.fillRect(x + 4, y - 3, 1, 4); }
      if (dark) { g.fillStyle = `rgba(10,4,16,${dark})`; g.fillRect(x - 1, y - 3, 6, 11 + bob); }
    }
  }
}

function reflections(g, fx, signs, hz, lh) {
  const len = Math.round((lh - hz) * 0.6);
  for (const s of signs) {
    if (!s.on) continue;
    g.fillStyle = s.col;
    for (let k = 2; k < len; k += 1) {
      const a = 0.45 * (1 - k / len) * (0.55 + 0.45 * Math.sin(k * 1.3 + fx.time * 5));
      if (a <= 0.03) continue;
      g.globalAlpha = a;
      g.fillRect(Math.round(s.x + s.w * 0.2 + Math.sin(k * 0.7 + fx.time * 4)), hz + k, Math.round(s.w * 0.6), 1);
    }
  }
  g.globalAlpha = 1;
}

function rain(g, fx, lw, lh, hz) {
  const n = Math.round(40 + fx.chaos * 260), t = fx.time;
  g.fillStyle = '#a8c0ff'; g.globalAlpha = 0.45;
  for (let i = 0; i < n; i++) {
    const v = 150 + 70 * hash(i * 1.9);
    const x = Math.round(mod(hash(i * 1.3) * lw * 1.4 - t * v * 0.25, lw + 12) - 6), y = Math.round(mod(hash(i * 2.9) * lh + t * v, lh + 6) - 3);
    g.fillRect(x, y, 1, 3); g.fillRect(x - 1, y + 3, 1, 2);
    if (y > hz + 4 && hash(i * 5.3 + Math.floor(t * 9)) > 0.93) { g.fillRect(x - 2, y + 5, 1, 1); g.fillRect(x + 1, y + 5, 1, 1); }
  }
  g.globalAlpha = 1;
}

function lightning(g, fx, lw, hz) {
  if (fx.chaos < 0.5 || fx.beat < 0.8 || fx.beatIndex % 4) return;
  g.fillStyle = '#ffffff'; g.globalAlpha = 0.35 * fx.beat; g.fillRect(0, 0, lw, hz); g.globalAlpha = 1;
  let x = Math.round(lw * (0.2 + 0.6 * hash(fx.beatIndex))), y = 0;
  g.fillStyle = '#f0f4ff';
  while (y < hz * 0.6) { const nx = x + Math.round((hash(x + y * 3 + fx.beatIndex) - 0.5) * 6); g.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 1, 1); g.fillRect(nx, y, 1, 3); x = nx; y += 3; }
}

// Both fighters idle on the beat and strike a pose for ~650 ms after each bite.
function fighters(g, fx, st, P, shakeX) {
  const u = st.fh / P / 40, age = fx.biteAge;
  const k = age < 650 ? (age < 90 ? age / 90 : 1 - Math.max(0, (age - 380) / 270)) : 0;
  for (let i = 0; i < 2; i++) {
    const face = i ? -1 : 1, set = POSE_SETS[i], name = set[mod(fx.variant + i, set.length)];
    const idle = POSES.idle, sway = Math.sin(fx.time * 4.4 + i * 1.3) * 0.08 + fx.beat * 0.18 * (fx.beatIndex % 2 ? 1 : -1);
    const base = { ...idle, fa: [idle.fa[0] + sway, idle.fa[1]], ba: [idle.ba[0] - sway, idle.ba[1]] };
    const pose = k > 0 ? blend(base, POSES[name], k) : base;
    const bob = fx.beat * 1.4 + Math.abs(Math.sin(fx.time * 4.4 + i)) * 0.6;
    const x = st.xs[i] / P + 1 + shakeX * (i ? -1 : 1), feet = st.feet / P + 1;
    const fist = fighter(g, FIGHTERS[i], x, feet, u, face, pose, bob);
    if (k > 0.3) spark(g, fist[0], fist[1], u * (2 + 4 * k), fx.variant + i);
  }
}
function spark(g, x, y, r, seed) {
  g.fillStyle = '#fff35a';
  for (let a = 0; a < 8; a++) {
    const an = (a / 8) * TAU + seed, rr = r * (a % 2 ? 0.55 : 1);
    for (let s = 0.35; s <= 1; s += 0.2) g.fillRect(Math.round(x + Math.cos(an) * rr * s), Math.round(y + Math.sin(an) * rr * s), 1, 1);
  }
  g.fillStyle = '#ffffff'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
}

// Fight HUD (full resolution): SNAKE vs TIME bars and the score in the round box.
function hud(ctx, L, fx, snap, pal) {
  const hb = clamp(Math.round(L.h * 0.024), 9, 16), pad = Math.round(clamp(L.w * 0.03, 8, 40)), y = Math.round(hb * 0.8);
  const box = Math.round(hb * 3), cx = L.w / 2, bw = Math.round(cx - pad - box / 2 - 8);
  const score = Math.max(0, num(snap && snap.score)), alive = !snap || snap.alive !== false;
  const hpS = alive ? 1 : 0, hpT = 1 - (score % 8) / 8, lag = fx.biteAge < 700 ? Math.min(1, hpT + (1 / 8) * (1 - fx.biteAge / 700)) : hpT;
  const frame = fx.chaos > 0.4 && fx.beat > 0.6 ? pal.accent : '#ffd21f';
  const bar = (x, w, v, trail, flip, label) => {
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, hb + 4);
    ctx.fillStyle = frame; ctx.fillRect(x - 1, y - 1, w + 2, hb + 2);
    ctx.fillStyle = '#3a0010'; ctx.fillRect(x, y, w, hb);
    const tw = Math.round(w * trail), vw = Math.round(w * v);
    ctx.fillStyle = '#ff2a1a'; ctx.fillRect(flip ? x + w - tw : x, y, tw, hb);
    ctx.fillStyle = fx.punch > 0.5 && flip ? '#ffffff' : '#ffe14d'; ctx.fillRect(flip ? x + w - vw : x, y, vw, hb);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(flip ? x + w - vw : x, y, vw, Math.max(1, hb >> 2));
    ctx.font = `bold ${Math.round(hb * 0.95)}px "Courier New", monospace`; ctx.textBaseline = 'top';
    ctx.textAlign = flip ? 'right' : 'left'; ctx.fillStyle = '#000'; ctx.fillText(label, (flip ? x + w : x) + 1, y + hb + 5);
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, flip ? x + w : x, y + hb + 4);
  };
  bar(pad, bw, hpS, hpS, false, 'SNAKE');
  bar(L.w - pad - bw, bw, hpT, lag, true, 'TIME');
  ctx.fillStyle = '#000'; ctx.fillRect(cx - box / 2 - 2, y - 4, box + 4, box * 0.62 + 4);
  ctx.fillStyle = '#1a0a24'; ctx.fillRect(cx - box / 2, y - 2, box, box * 0.62);
  ctx.font = `bold ${Math.round(box * 0.5)}px "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd21f'; ctx.fillText(String(score % 100).padStart(2, '0'), cx, y - 2 + box * 0.31);
  ctx.textAlign = 'left';
  return y + hb + 4 + hb;
}

const POPS = ['BITE!', 'COMBO', 'TIME HIT!', 'PERFECT!', 'SNAKE WINS', 'CHAIN BITE'];
function popText(ctx, L, fx, snap, st, top) {
  if (!fx.bite || fx.biteAge > 820) return;
  const a = fx.biteAge, s = a < 120 ? 2.2 - 1.2 * (a / 120) : 1, al = a > 600 ? 1 - (a - 600) / 220 : 1;
  let word = POPS[mod(fx.variant, POPS.length)];
  if (word === 'COMBO') word = 'COMBO x' + Math.max(1, num(snap && snap.score));
  const side = st.mode === 'side', size = Math.round(side ? clamp((L.bx - margin(L)) * 0.14, 18, 52) : clamp(L.w * 0.085, 18, 40));
  const x = side ? st.xs[mod(fx.variant, 2)] : L.w / 2, y = side ? Math.max(top + size, st.feet - st.fh - size * 0.6) : top + size * 0.9;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(((fx.variant % 3) - 1) * 0.06);
  ctx.globalAlpha = Math.max(0, al);
  ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.16); ctx.strokeStyle = '#1a0006'; ctx.strokeText(word, 0, 0);
  const gr = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  gr.addColorStop(0, '#fff6a0'); gr.addColorStop(0.5, '#ffb21f'); gr.addColorStop(1, '#ff2a1a');
  ctx.fillStyle = gr; ctx.fillText(word, 0, 0);
  ctx.restore();
}

const SCAN = {};
function paintScan(g, L) { g.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < L.h; y += 3) g.fillRect(0, y, L.w, 1); }

export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), pi = mod(fx.variant, PALS.length), pal = PALS[pi];
  const B = lowBuffer(L), g = B.g, P = B.P, st = stage(L), lw = B.w, lh = B.h;
  const hz = clamp(Math.round(st.horizon / P) + 1, 8, lh - 4), wallH = Math.max(10, Math.round(hz * 0.42)), wallTop = hz - wallH;
  const sizeKey = [lw, lh, P, hz].join(), t = fx.time;
  const camX = Math.sin(t * 0.35) * 8 * (1 + fx.chaos) + Math.sin(t * 1.7) * 2 * fx.chaos;
  const sh = fx.punch * (2 + fx.chaos * 4), tk = Math.floor(t * 50);
  const sx = Math.round((hash(tk) - 0.5) * 2 * sh), sy = Math.round((hash(tk + 7) - 0.5) * 2 * sh);

  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.drawImage(cachedLow(C.sky, sizeKey + 's' + pi, lw, hz + 2, (q, w, h) => paintSky(q, w, h, pal)), 0, 0);
  lightning(g, fx, lw, hz);
  const far = cachedLow(C.far, sizeKey, lw + 80, Math.max(8, Math.round(hz * 0.75)), paintFar);
  g.drawImage(far, Math.round(-40 - camX * 0.3), wallTop + 4 - far.height + Math.round(far.height * 0.25));
  const wall = cachedLow(C.wall, sizeKey, lw + 120, wallH, (q, w, h) => paintWall(q, w, h, 3));
  const wx = Math.round(-60 - camX * 0.6);
  g.drawImage(wall, wx, wallTop);
  const signs = neon(g, fx, pal, wx, wallTop, wallH, wall.width);
  crowd(g, fx, lw, hz, camX * 0.85);
  g.drawImage(cachedLow(C.street, sizeKey + 't' + pi, lw, lh - hz, (q, w, h) => paintStreet(q, w, h, pal)), 0, hz);
  reflections(g, fx, signs, hz, lh);
  fighters(g, fx, st, P, sx);
  rain(g, fx, lw, lh, hz);

  ctx.save();
  ctx.fillStyle = '#0a0710'; ctx.fillRect(0, 0, L.w, L.h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(B.c, (sx - 1) * P, (sy - 1) * P, lw * P, lh * P);
  ctx.imageSmoothingEnabled = true;
  blit(ctx, layer(SCAN, [L.w, L.h, dpr].join(), L.w, L.h, dpr, (q) => paintScan(q, L)), 0, 0, dpr);
  if (fx.punch > 0.02) {
    ctx.fillStyle = fx.chaos > 0.5 && fx.variant % 2 ? '#ff2a1a' : '#ffffff';
    ctx.globalAlpha = fx.punch * 0.55; ctx.fillRect(0, 0, L.w, L.h); ctx.globalAlpha = 1;
  }
  const top = hud(ctx, L, fx, snap, pal);
  popText(ctx, L, fx, snap, st, top);
  ctx.restore();
}
