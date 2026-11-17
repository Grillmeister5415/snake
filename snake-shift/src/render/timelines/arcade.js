// SNAKE//SHIFT — timeline 03: ELECTRIC ARCADE, 1986. Flat Canvas 2D (stream flat-a).
// Contract: BUILD_PLAN.md §15.3. scenery() paints everything except the board; board() paints
// plate, panel, grid, lethal edge, bite burst, dot and snake, cell-exact. Pure apart from caches.
// Extra exports for timewarp.js: drawSnake() (this era's snake skin) and kit (shared helpers).

const TAU = Math.PI * 2;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
const mod = (a, n) => ((a % n) + n) % n;
const frac = (x) => x - Math.floor(x);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: num(fx.beat), beatIndex: num(fx.beatIndex) | 0, chaos: num(fx.chaos),
    punch: num(fx.punch), variant: num(fx.variant) | 0, bite: fx.bite || null,
    biteAge: Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity,
    rf: !!fx.reducedFlash, rm: !!fx.reducedMotion, prev: fx.prev || fx.prevTimeline || fx.from || null,
  };
}
function dprOf(ctx) {
  const m = ctx.getTransform ? ctx.getTransform() : null;
  return Math.max(1, Math.min(3, (m && Math.hypot(m.a, m.b)) || 1));
}
// Offscreen cache: repaint only when the key changes. Painter works in CSS pixels.
function layer(slot, key, w, h, dpr, paint) {
  if (slot.c && slot.key === key) return slot.c;
  const c = slot.c || document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(g);
  slot.c = c; slot.key = key;
  return c;
}
const blit = (ctx, c, x, y, dpr) => ctx.drawImage(c, x, y, c.width / dpr, c.height / dpr);
// Gap-safe (LEVELS_PLAN 3.3): the neck only counts when snake[0] and snake[1] are joined (no break at 0).
function headDir(snap) {
  const s = snap.snake;
  if (s && s.length > 1 && !(snap.breaks && snap.breaks[0] === 0)) {
    const dx = X(s[0]) - X(s[1]), dy = Y(s[0]) - Y(s[1]);
    if (Math.abs(dx) + Math.abs(dy) === 1) return [dx, dy];
  }
  return DIRS[snap.dir] || [1, 0];
}
function rrect(g, x, y, w, h, r) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  g.moveTo(x + a, y);
  g.arcTo(x + w, y, x + w, y + h, b);
  g.arcTo(x + w, y + h, x, y + h, c);
  g.arcTo(x, y + h, x, y, d);
  g.arcTo(x, y, x + w, y, a);
  g.closePath();
}
// Corner radii [tl, tr, br, bl]: rf on the side facing d, rb elsewhere.
function frontRadii(d, rf, rb) {
  const [dx, dy] = d;
  return [dx < 0 || dy < 0 ? rf : rb, dx > 0 || dy < 0 ? rf : rb, dx > 0 || dy > 0 ? rf : rb, dx < 0 || dy > 0 ? rf : rb];
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Static red cross on the boundary the head crashed into. Never animated.
function deathMark(ctx, L, snap) {
  if (snap.alive !== false || !snap.snake || !snap.snake.length) return;
  const death = snap.death || {};
  if (death.reason === 'complete') return;
  const c = L.cell, h = snap.snake[0], d = headDir(snap);
  const cx = L.bx + (X(h) + 0.5) * c, cy = L.by + (Y(h) + 0.5) * c;
  let px = cx + d[0] * c * 0.5, py = cy + d[1] * c * 0.5;
  const dc = death.cell;
  if (dc && Math.abs(X(dc) - X(h)) + Math.abs(Y(dc) - Y(h)) === 1) { px = cx + (X(dc) - X(h)) * c * 0.5; py = cy + (Y(dc) - Y(h)) * c * 0.5; }
  const s = c * 0.24;
  ctx.save();
  ctx.strokeStyle = '#0a0410'; ctx.lineWidth = Math.max(3, c * 0.16); ctx.lineCap = 'square';
  ctx.beginPath(); ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s); ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s); ctx.stroke();
  ctx.strokeStyle = '#ff1f3c'; ctx.lineWidth = Math.max(2, c * 0.09); ctx.stroke();
  ctx.restore();
}

export const kit = { TAU, X, Y, mod, frac, hash, num, norm, dprOf, layer, blit, headDir, rrect, frontRadii, hexA, deathMark };

export const meta = {
  id: 'arcade', name: 'ELECTRIC ARCADE', year: '1986', kind: '2d',
  luma: 0.08, veil: '#05030c', weight: 3,
  hud: { fg: '#00f0ff', bg: '#05030c', accent: '#ff2bd6', panelFg: '#ffe81a', panelBg: 'rgba(8,3,22,0.92)' },
};

const PALS = [
  { floor: '#ff2bd6', grid: '#00e8ff', mtn: '#00f0ff', mtn2: '#ff2bd6', sun: ['#fff35a', '#ffa21f', '#ff2bd6', '#8a1bff'], accent: '#00f0ff' },
  { floor: '#00e8ff', grid: '#ff2bd6', mtn: '#ff2bd6', mtn2: '#ffe81a', sun: ['#ffe81a', '#ff5a1f', '#ff1f4b', '#5a00ff'], accent: '#ffe81a' },
  { floor: '#ff1f4b', grid: '#00e8ff', mtn: '#ffe81a', mtn2: '#ff1f4b', sun: ['#ffffff', '#00f0ff', '#2b6bff', '#ff2bd6'], accent: '#ff2bd6' },
  { floor: '#39ff6a', grid: '#ff2bd6', mtn: '#00f0ff', mtn2: '#39ff6a', sun: ['#fff35a', '#ff2bd6', '#8a2bff', '#00f0ff'], accent: '#39ff6a' },
];
const STEP = ['#00f0ff', '#ff2bd6', '#ffe81a', '#ff1f4b'];
const LIVE = { body: '#ffe81a', hi: '#fff7b0', lo: '#c99f00', head: '#ffef3a', eye: '#0a0614' };
const DEAD = { body: '#4b4860', hi: '#615d78', lo: '#34313f', head: '#5a5672', eye: '#14111d' };
const C = { back: {}, front: {}, scan: {}, disc: {}, board: {} };
let sunBuf = null;

const margin = (L) => Math.max(6, Math.round(L.cell * 0.45));
const horizon = (L) => L.by + Math.round(L.bh * 0.12);
const sunRadius = (L) => Math.round(Math.max(36, Math.min(L.w * 0.4, horizon(L) - L.by * 0.15)));

// ───────────────────────────── scenery ─────────────────────────────

export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx);
  const pi = mod(fx.variant, PALS.length), pal = PALS[pi];
  const sizeKey = [L.w, L.h, L.cell, L.bx, L.by, dpr].join();
  ctx.save();
  blit(ctx, layer(C.back, sizeKey + pi, L.w, L.h, dpr, (g) => paintBack(g, L, pal)), 0, 0, dpr);
  drawStars(ctx, L, fx);
  drawSun(ctx, L, fx, pal, pi, dpr);
  drawFloor(ctx, L, fx, pal);
  blit(ctx, layer(C.front, sizeKey + pi, L.w, L.h, dpr, (g) => paintFront(g, L, pal, C.front)), 0, 0, dpr);
  drawScreens(ctx, fx, pal);
  drawDebris(ctx, L, fx);
  drawRays(ctx, L, fx, pal);
  drawBezel(ctx, L, fx);
  blit(ctx, layer(C.scan, sizeKey, L.w, L.h, dpr, (g) => paintScan(g, L)), 0, 0, dpr);
  const yb = mod(fx.time * 110, L.h + 260) - 130;
  const gr = ctx.createLinearGradient(0, yb, 0, yb + 130);
  gr.addColorStop(0, 'rgba(160,255,255,0)'); gr.addColorStop(0.5, 'rgba(160,255,255,0.07)'); gr.addColorStop(1, 'rgba(160,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, yb, L.w, 130);
  ctx.restore();
}

function paintBack(g, L, pal) {
  const { w, h } = L, hz = horizon(L);
  let gr = g.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, '#04020c'); gr.addColorStop(0.7, '#0d0526'); gr.addColorStop(1, '#2a0a44');
  g.fillStyle = gr; g.fillRect(0, 0, w, hz);
  gr = g.createLinearGradient(0, hz, 0, h);
  gr.addColorStop(0, '#12042a'); gr.addColorStop(1, '#040108');
  g.fillStyle = gr; g.fillRect(0, hz, w, h - hz);
  gr = g.createLinearGradient(0, hz - 40, 0, hz + 30);
  gr.addColorStop(0, hexA(pal.floor, 0)); gr.addColorStop(0.6, hexA(pal.floor, 0.35)); gr.addColorStop(1, hexA(pal.floor, 0));
  g.fillStyle = gr; g.fillRect(0, hz - 40, w, 70);
}

const CAB = [[0.08, 0], [0.92, 0], [0.92, 0.3], [1, 0.4], [1, 1.05], [0.88, 1.18], [0.94, 1.3], [0.94, 2.3],
  [0.06, 2.3], [0.06, 1.3], [0.12, 1.18], [0, 1.05], [0, 0.4], [0.08, 0.3]];
const SCREEN = [[0.15, 0.47], [0.85, 0.43], [0.82, 1.0], [0.18, 1.02]];

function paintFront(g, L, pal, slot) {
  const { w, h } = L, hz = horizon(L), R = sunRadius(L);
  const mh = Math.min(hz * 0.75, Math.max(40, h * 0.22));
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -10 : w + 10, x1 = w / 2 + side * R * 0.7, n = 9, pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, peak = (1 - u) * 0.85 + 0.15;
      const y = hz - mh * peak * (i % 2 ? 0.55 + 0.25 * hash(i * 9.1 + side) : 0.9 + 0.1 * hash(i * 3.3 + side));
      pts.push([x0 + (x1 - x0) * u, i === n ? hz : y]);
    }
    g.beginPath(); g.moveTo(pts[0][0], hz);
    for (const p of pts) g.lineTo(p[0], p[1]);
    g.closePath(); g.fillStyle = '#07021a'; g.fill();
    const line = (dy) => { g.beginPath(); pts.forEach((p, i) => { const y = Math.min(hz, p[1] + dy); i ? g.lineTo(p[0], y) : g.moveTo(p[0], y); }); };
    g.save(); g.shadowColor = pal.mtn; g.shadowBlur = 10; g.strokeStyle = pal.mtn; g.lineWidth = 2.5; line(0); g.stroke(); g.restore();
    g.strokeStyle = pal.mtn2; g.lineWidth = 2; line(mh * 0.18); g.stroke();
  }
  slot.screens = [];
  const side = L.bx - margin(L) - 12;
  if (side > 150) {
    const cw = Math.min(side * 0.62, 210, (h * 0.78) / 2.3), base = h - h * 0.03;
    cabinet(g, side / 2, base, cw, false, slot);
    cabinet(g, w - side / 2, base, cw, true, slot);
  }
}

function cabinet(g, cx, base, cw, mirror, slot) {
  const P = (u, v) => [cx + (mirror ? 0.5 - u : u - 0.5) * cw, base - (2.3 - v) * cw];
  const poly = (pts) => { g.beginPath(); pts.forEach(([u, v], i) => { const p = P(u, v); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath(); };
  poly(CAB); g.fillStyle = '#090316'; g.fill();
  g.save(); g.shadowColor = '#ff2bd6'; g.shadowBlur = 12; g.strokeStyle = '#ff2bd6'; g.lineWidth = 3; g.stroke();
  poly([[0.14, 0.06], [0.86, 0.06], [0.86, 0.24], [0.14, 0.24]]); g.shadowColor = '#ffe81a'; g.fillStyle = '#ffe81a'; g.fill();
  poly(SCREEN); g.shadowColor = '#00e8ff'; g.strokeStyle = '#00e8ff'; g.lineWidth = 2.5; g.stroke();
  g.restore();
  g.strokeStyle = '#00e8ff'; g.lineWidth = 2; g.beginPath();
  for (const o of [0, 0.1]) { const a = P(0.3 + o, 0.62), b = P(0.52 + o, 0.5); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  const stick = P(0.3, 1.1), stem = P(0.3, 1.18);
  g.strokeStyle = '#d0d0e0'; g.lineWidth = 2; g.beginPath(); g.moveTo(stick[0], stick[1]); g.lineTo(stem[0], stem[1]); g.stroke();
  g.fillStyle = '#ff1f3c'; g.beginPath(); g.arc(stick[0], stick[1], cw * 0.05, 0, TAU); g.fill();
  g.fillStyle = '#ffe81a';
  for (const u of [0.55, 0.68, 0.81]) { const p = P(u, 1.13); g.beginPath(); g.arc(p[0], p[1], cw * 0.035, 0, TAU); g.fill(); }
  ['#ff7a1a', '#ffe81a', '#00e8ff'].forEach((col, i) => { const p = P(0.4 + i * 0.09, 1.55); g.fillStyle = col; g.fillRect(p[0], p[1], cw * 0.05, cw * 0.42); });
  slot.screens.push(SCREEN.map(([u, v]) => P(u, v)));
}

function paintScan(g, L) {
  const { w, h } = L;
  g.fillStyle = 'rgba(0,0,0,0.32)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

function star4(ctx, x, y, s) {
  const k = s * 0.16;
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + k, y - k); ctx.lineTo(x + s, y); ctx.lineTo(x + k, y + k);
  ctx.lineTo(x, y + s); ctx.lineTo(x - k, y + k); ctx.lineTo(x - s, y); ctx.lineTo(x - k, y - k); ctx.closePath(); ctx.fill();
}

function drawStars(ctx, L, fx) {
  const n = 10 + Math.round(fx.chaos * 18), top = Math.max(24, horizon(L) - 8);
  for (let i = 0; i < n; i++) {
    const x = hash(i * 3.17 + 1) * L.w, y = 6 + hash(i * 7.31 + 2) * (top - 6);
    const tw = 0.55 + 0.45 * Math.sin(fx.time * (1.4 + hash(i) * 2.2) + i * 1.7);
    const s = (4 + hash(i + 0.5) * 11) * tw * (1 + fx.beat * 0.7 + fx.punch * 1.4);
    ctx.fillStyle = STEP[mod(i + (fx.rf ? 0 : fx.beatIndex), 4)];
    star4(ctx, x, y, s);
  }
}

function drawSun(ctx, L, fx, pal, pi, dpr) {
  const R = sunRadius(L), hz = horizon(L), cx = L.w / 2;
  const disc = layer(C.disc, [R, dpr, pi].join(), 2 * R, R, dpr, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, R);
    pal.sun.forEach((c, i) => gr.addColorStop(i / (pal.sun.length - 1), c));
    g.fillStyle = gr; g.beginPath(); g.arc(R, R, R, Math.PI, TAU); g.closePath(); g.fill();
  });
  if (!sunBuf) sunBuf = document.createElement('canvas');
  if (sunBuf.width !== disc.width || sunBuf.height !== disc.height) { sunBuf.width = disc.width; sunBuf.height = disc.height; }
  const g = sunBuf.getContext('2d'), W = sunBuf.width, H = sunBuf.height;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); g.drawImage(disc, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  const n = 7, sc = frac(fx.time * 0.45);
  for (let k = 0; k <= n; k++) {
    const u = (k + sc) / n; if (u > 1) continue;
    const y = H * (0.36 + 0.64 * u), th = H * 0.014 * (1 + 3.6 * u) * (1 + fx.punch);
    g.fillRect(0, y - th / 2, W, th);
  }
  g.globalCompositeOperation = 'source-over';
  const halo = ctx.createRadialGradient(cx, hz, R * 0.6, cx, hz, R * 1.6);
  halo.addColorStop(0, hexA(pal.sun[2], 0.35 + 0.3 * fx.beat)); halo.addColorStop(1, hexA(pal.sun[2], 0));
  ctx.fillStyle = halo; ctx.fillRect(cx - R * 1.6, hz - R * 1.6, R * 3.2, R * 1.6);
  const z = 1 + 0.05 * fx.beat + 0.08 * fx.punch, dw = 2 * R * z, dh = R * z;
  ctx.drawImage(sunBuf, cx - dw / 2, hz - dh, dw, dh);
  if (!fx.rf && fx.chaos > 0.25) {
    const off = 3 + 12 * fx.chaos + 10 * fx.punch;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + 0.25 * fx.chaos;
    ctx.drawImage(sunBuf, cx - dw / 2 - off, hz - dh, dw, dh);
    ctx.drawImage(sunBuf, cx - dw / 2 + off, hz - dh + off * 0.3, dw, dh);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}

function drawFloor(ctx, L, fx, pal) {
  const { w, h } = L, hz = horizon(L), fh = h - hz;
  if (fh < 8) return;
  const vx = w / 2, fs = frac(fx.time * (0.9 + 2.4 * fx.chaos) + fx.variant * 0.5 - fx.punch * 0.5);
  const amp = fx.rf ? 0 : Math.max(0, fx.chaos - 0.45) * 26 + fx.punch * 10;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, hz, w, fh); ctx.clip();
  ctx.beginPath();
  const S = Math.max(34, w / 13);
  for (let i = -44; i <= 44; i++) { ctx.moveTo(vx, hz); ctx.lineTo(vx + i * S, h); }
  for (let k = 0; k < 48; k++) {
    const z = 1 + (k - fs) * 0.42, y = hz + fh / z;
    if (y > h + 4) continue;
    if (y - hz < 1.2) break;
    if (amp > 0.5) {
      const a = amp / z;
      for (let i = 0; i <= 24; i++) { const x = (i * w) / 24, yy = y + a * Math.sin(x * 0.011 + fx.time * 4 + k * 0.7); i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
    } else { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  }
  const gr = ctx.createLinearGradient(0, hz, 0, h);
  gr.addColorStop(0, hexA(pal.floor, 0)); gr.addColorStop(0.18, hexA(pal.floor, 0.85)); gr.addColorStop(1, pal.floor);
  ctx.strokeStyle = gr; ctx.globalAlpha = 0.25; ctx.lineWidth = 5 * (1 + fx.beat * 0.8); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 1.3 * (1 + fx.beat * 0.7) + fx.punch * 2.5;
  ctx.strokeStyle = fx.punch > 0.35 ? '#ffffff' : gr; ctx.stroke();
  ctx.restore();
}

function drawScreens(ctx, fx, pal) {
  const sc = C.front.screens;
  if (!sc || !sc.length) return;
  ctx.fillStyle = pal.accent; ctx.globalAlpha = Math.min(1, 0.12 + 0.55 * fx.beat + 0.3 * fx.punch);
  for (const q of sc) { ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); }
  ctx.globalAlpha = 1;
}

function drawDebris(ctx, L, fx) {
  const n = Math.round(fx.chaos * 16) + (fx.punch > 0.05 ? 6 : 0);
  if (!n) return;
  const vx = L.w / 2, hz = horizon(L), big = Math.max(L.w, L.h);
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const p = frac(fx.time * (0.16 + 0.12 * hash(i * 1.3)) * (1 + fx.chaos) + hash(i * 4.1));
    const a = hash(i * 9.7) * TAU, d = p * p * big * 0.85;
    const x = vx + Math.cos(a) * d, y = hz + Math.sin(a) * d * 0.7, s = 3 + p * p * 46, r = fx.time * (1 + hash(i)) * 2 + i;
    const k = i % 3 === 0 ? 3 : 4;
    ctx.strokeStyle = STEP[i % 4]; ctx.globalAlpha = Math.min(1, p * 3);
    ctx.beginPath();
    for (let j = 0; j <= k; j++) { const aa = r + (j * TAU) / k, px = x + Math.cos(aa) * s, py = y + Math.sin(aa) * s; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawRays(ctx, L, fx, pal) {
  if (fx.punch < 0.02) return;
  const cx = L.bx + L.bw / 2, cy = L.by + L.bh / 2, r0 = Math.max(L.bw, L.bh) * 0.5, r1 = Math.hypot(L.w, L.h);
  const n = 32, rot = fx.variant * 0.37;
  ctx.globalAlpha = fx.punch; ctx.lineWidth = 2 + 7 * fx.punch;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? '#ffffff' : pal.accent; ctx.beginPath();
    for (let i = pass; i < n; i += 2) {
      const a = rot + (i / n) * TAU;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Cabinet-style bezel around the board plate; its colour steps on the beat (every 8th beat under reduced flash).
function drawBezel(ctx, L, fx) {
  const off = margin(L) + 7, step = fx.rf ? Math.floor(fx.beatIndex / 8) : fx.beatIndex;
  const col = STEP[mod(step, 4)];
  const x = L.bx - off, y = L.by - off, w = L.bw + 2 * off, h = L.bh + 2 * off;
  ctx.strokeStyle = col; ctx.globalAlpha = 0.28; ctx.lineWidth = 10; ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  if (!fx.rf && fx.chaos > 0.5) { ctx.strokeStyle = STEP[mod(step + 2, 4)]; ctx.lineWidth = 2; ctx.strokeRect(x - 8, y - 8, w + 16, h + 16); }
  ctx.fillStyle = col;
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) ctx.fillRect(px - 5, py - 5, 10, 10);
}

// ───────────────────────────── board ─────────────────────────────

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), pi = mod(fx.variant, PALS.length), pal = PALS[pi], m = margin(L);
  ctx.save();
  const key = [L.w, L.h, L.cell, L.bx, L.by, L.cols, L.rows, dpr, pi].join();
  blit(ctx, layer(C.board, key, L.bw + 2 * m, L.bh + 2 * m, dpr, (g) => paintBoard(g, L, pal, m)), L.bx - m, L.by - m, dpr);
  burst(ctx, L, fx, pal.accent);
  drawDot(ctx, L, snap, fx);
  drawSnake(ctx, L, snap, fxIn);
  deathMark(ctx, L, snap);
  ctx.restore();
}

function paintBoard(g, L, pal, m) {
  const { bw, bh, cell } = L;
  g.translate(m, m);
  g.fillStyle = '#020108'; g.fillRect(-m, -m, bw + 2 * m, bh + 2 * m);
  // lethal edge: glowing neon rail (glow painted first so the panel covers its inner half)
  g.save(); g.shadowColor = '#00f0ff'; g.shadowBlur = 12; g.strokeStyle = '#00e8ff'; g.lineWidth = 3;
  g.strokeRect(-3.5, -3.5, bw + 7, bh + 7); g.restore();
  g.fillStyle = '#06030f'; g.fillRect(0, 0, bw, bh);
  g.beginPath();
  for (let i = 1; i < L.cols; i++) { g.moveTo(i * cell + 0.5, 0); g.lineTo(i * cell + 0.5, bh); }
  for (let j = 1; j < L.rows; j++) { g.moveTo(0, j * cell + 0.5); g.lineTo(bw, j * cell + 0.5); }
  g.strokeStyle = pal.grid; g.globalAlpha = 0.36; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
  g.strokeStyle = '#00e8ff'; g.lineWidth = 3; g.strokeRect(-3.5, -3.5, bw + 7, bh + 7);
  g.strokeStyle = '#eaffff'; g.lineWidth = 1.5; g.strokeRect(-1, -1, bw + 2, bh + 2);
  // magenta corner brackets on the plate
  const k = Math.max(6, Math.round(cell * 0.8)), o = m - 1;
  g.strokeStyle = '#ff2bd6'; g.lineWidth = 2; g.beginPath();
  for (const [cx, cy, sx, sy] of [[-o, -o, 1, 1], [bw + o, -o, -1, 1], [-o, bh + o, 1, -1], [bw + o, bh + o, -1, -1]]) {
    g.moveTo(cx + sx * k, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * k);
  }
  g.stroke();
}

function burst(ctx, L, fx, accent) {
  const b = fx.bite, age = fx.biteAge;
  if (!b || !(age < 520)) return;
  const k = age / 520, c = L.cell, cx = L.bx + (X(b) + 0.5) * c, cy = L.by + (Y(b) + 0.5) * c;
  ctx.save();
  ctx.beginPath(); ctx.rect(L.bx, L.by, L.bw, L.bh); ctx.clip();
  ctx.globalAlpha = 1 - k; ctx.strokeStyle = accent; ctx.lineWidth = 2;
  if (fx.rm) { const r = c * 0.62; ctx.strokeRect(cx - r, cy - r, 2 * r, 2 * r); ctx.restore(); return; }
  const r = c * (0.55 + 1.6 * k); ctx.strokeRect(cx - r, cy - r, 2 * r, 2 * r);
  const ease = 1 - (1 - k) ** 3, q = Math.max(2, Math.round(c * 0.2 * (1 - k)));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + hash(fx.variant * 17 + i) * 0.5, d = c * (0.3 + 2.4 * ease * (0.6 + 0.4 * hash(i + fx.variant)));
    ctx.fillStyle = i & 1 ? '#ffe81a' : accent;
    ctx.fillRect(Math.round(cx + Math.cos(a) * d - q / 2), Math.round(cy + Math.sin(a) * d - q / 2), q, q);
  }
  ctx.restore();
}

// Dot: a smaller striped red square with corner glints, centred in its cell.
function drawDot(ctx, L, snap, fx) {
  const f = snap.food;
  if (!f) return;
  const c = L.cell, x = L.bx + X(f) * c, y = L.by + Y(f) * c;
  const s = Math.min(c - 6, Math.round(c * 0.56 * (1 + 0.14 * fx.beat)));
  const x0 = Math.round(x + (c - s) / 2), y0 = Math.round(y + (c - s) / 2);
  ctx.fillStyle = 'rgba(255,31,60,0.22)'; ctx.fillRect(x0 - 2, y0 - 2, s + 4, s + 4);
  ctx.fillStyle = '#ff1f3c'; ctx.fillRect(x0, y0, s, s);
  const sw = Math.max(1, Math.round(s / 8));
  ctx.fillStyle = '#6e0016'; ctx.beginPath();
  for (let k = sw; k < s - sw; k += sw * 2) ctx.rect(x0, y0 + k, s, sw);
  ctx.fill();
  ctx.strokeStyle = '#ffb3bd'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
  const q = Math.max(1, Math.round(c * 0.08)), on = fx.rf ? 1 : Math.floor(fx.time * 4) & 1;
  ctx.fillStyle = '#ffffff';
  if (on) { ctx.fillRect(x0 - q - 1, y0 - q - 1, q, q); ctx.fillRect(x0 + s + 1, y0 + s + 1, q, q); }
  else { ctx.fillRect(x0 + s + 1, y0 - q - 1, q, q); ctx.fillRect(x0 - q - 1, y0 + s + 1, q, q); }
}

// Snake skin: chunky yellow blocks; the head is larger, rounded at the front and has eyes. Grey with X eyes when dead.
export function drawSnake(ctx, L, snap, fxIn) {
  const s = snap.snake;
  if (!s || !s.length) return;
  const c = L.cell, n = s.length, dead = snap.alive === false, P = dead ? DEAD : LIVE;
  const g = Math.max(1, Math.round(c * 0.08)), b = Math.max(1, Math.round(c * 0.12)), tail = Math.round(c * 0.17);
  // every cell is its own block; the small tail block only when the real tail is on the board
  const tailAt = n > 2 && !(snap.length > n) ? n - 1 : -1;
  const cells = (fn) => { ctx.beginPath(); for (let i = 1; i < n; i++) { const ins = i === tailAt ? tail : g; fn(L.bx + X(s[i]) * c + ins, L.by + Y(s[i]) * c + ins, c - 2 * ins); } };
  ctx.save();
  if (!dead) { ctx.globalAlpha = 0.16; ctx.fillStyle = P.body; ctx.beginPath(); for (let i = 0; i < n; i++) ctx.rect(L.bx + X(s[i]) * c, L.by + Y(s[i]) * c, c, c); ctx.fill(); ctx.globalAlpha = 1; }
  cells((x, y, z) => ctx.rect(x, y, z, z)); ctx.fillStyle = P.body; ctx.fill();
  cells((x, y, z) => ctx.rect(x, y, z, b)); ctx.fillStyle = P.hi; ctx.fill();
  cells((x, y, z) => ctx.rect(x, y + z - b, z, b)); ctx.fillStyle = P.lo; ctx.fill();
  const h = s[0], d = headDir(snap), p = [-d[1], d[0]];
  const hx = L.bx + X(h) * c, hy = L.by + Y(h) * c, hi = Math.round(c * 0.03);
  ctx.fillStyle = P.head; ctx.beginPath(); rrect(ctx, hx + hi, hy + hi, c - 2 * hi, c - 2 * hi, frontRadii(d, c * 0.38, c * 0.1)); ctx.fill();
  const e = Math.max(2, Math.round(c * 0.17)), cx = hx + c / 2, cy = hy + c / 2;
  for (const sg of [-1, 1]) {
    const ex = cx + d[0] * c * 0.12 + p[0] * sg * c * 0.21, ey = cy + d[1] * c * 0.12 + p[1] * sg * c * 0.21;
    if (dead) {
      const r = e * 0.6; ctx.strokeStyle = P.eye; ctx.lineWidth = Math.max(1.5, c * 0.07);
      ctx.beginPath(); ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r); ctx.stroke();
    } else {
      ctx.fillStyle = P.eye; ctx.fillRect(Math.round(ex - e / 2), Math.round(ey - e * 0.7), e, Math.round(e * 1.4));
      const q = Math.max(1, Math.round(e * 0.4));
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(ex - q / 2 + d[0] * e * 0.25), Math.round(ey - e * 0.45 + d[1] * e * 0.25), q, q);
    }
  }
  ctx.restore();
}

// Life slot (LEVELS_PLAN 4.3): a sprite head, the snake's own front-rounded yellow block with eyes,
// facing right. Filled = lit sprite; hollow = the same outline in dim neon with no fill.
export function life(ctx, x, y, size, filled, fx) {
  const s = Math.round(size * 0.82), x0 = x + (size - s) / 2, y0 = y + (size - s) / 2, d = [1, 0];
  ctx.save();
  ctx.beginPath(); rrect(ctx, x0, y0, s, s, frontRadii(d, s * 0.42, s * 0.12));
  if (filled) {
    ctx.fillStyle = LIVE.head; ctx.fill();
    ctx.fillStyle = LIVE.lo; ctx.fillRect(x0 + s * 0.08, y0 + s * 0.82, s * 0.6, s * 0.1);
    ctx.fillStyle = LIVE.eye;
    const e = Math.max(2, Math.round(s * 0.17));
    for (const sg of [-1, 1]) ctx.fillRect(Math.round(x0 + s * 0.6 - e / 2), Math.round(y0 + s / 2 + sg * s * 0.21 - e * 0.7), e, Math.round(e * 1.4));
  } else {
    ctx.strokeStyle = hexA(LIVE.body, 0.62); ctx.lineWidth = Math.max(1.5, size * 0.1); ctx.stroke();
    ctx.fillStyle = hexA('#00f0ff', 0.55);
    const e = Math.max(1, Math.round(s * 0.12));
    for (const sg of [-1, 1]) ctx.fillRect(Math.round(x0 + s * 0.6 - e / 2), Math.round(y0 + s / 2 + sg * s * 0.21 - e / 2), e, e);
  }
  ctx.restore();
}
