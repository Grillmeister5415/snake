// SNAKE//SHIFT — timeline 08: TIME WARP. Flat Canvas 2D (stream flat-a). The most intense flat timeline.
// Contract: BUILD_PLAN.md §15.3. A generated tunnel of concentric rings and polar checkerboards flows out
// from the board (we are pulled into it), with folded checker sheets orbiting, stretched era years and
// pixel fragments flying past, inversion bursts and colour splitting. The board is a black portal plate
// with a red lethal rail; it never strobes.
// Snake = the previous timeline's snake: reads fx.prev (or fx.prevTimeline / fx.from); 'arcade' and 'acid'
// reuse those skins, anything else gets this file's own neon "portal" skin. Dot = a spinning portal seed.

import { kit, drawSnake as arcadeSnake } from './arcade.js';
import { drawSnake as acidSnake, checkerSprite, warpSheet } from './acid.js';

const { TAU, X, Y, mod, frac, hash, norm, dprOf, layer, blit, headDir, rrect, frontRadii, deathMark } = kit;

export const meta = {
  id: 'timewarp', name: 'TIME WARP', year: '????', kind: '2d',
  luma: 0.45, veil: '#7a2050', weight: 1,
  hud: { fg: '#ffffff', bg: '#120018', accent: '#ff1f4b', panelFg: '#ffffff', panelBg: 'rgba(18,0,24,0.9)' },
};

const PALS = [
  { a: '#0b0b0b', b: '#f4efe4', cols: ['#ff1f4b', '#ffcc00', '#ff2bd6', '#00e5ff'] },
  { a: '#14002b', b: '#ff2bd6', cols: ['#00f0ff', '#ffe81a', '#39ff6a', '#ff5a1f'] },
  { a: '#000000', b: '#ff2a1f', cols: ['#ffffff', '#ffe81a', '#ff8a00', '#00e5ff'] },
  { a: '#001a33', b: '#ffe81a', cols: ['#ff1f4b', '#00f0ff', '#ff2bd6', '#ffffff'] },
];
const inv = (hex) => '#' + (0xffffff ^ parseInt(hex.slice(1), 16)).toString(16).padStart(6, '0');
const INV = PALS.map((p) => ({ a: inv(p.a), b: inv(p.b), cols: p.cols.map(inv) }));
const YEARS = ['1968', '1977', '1986', '1993', '1999', '2001', '2026', '2088', '04:37'];
const PORTAL = { body: '#39ff6a', core: '#d9ffe3', head: '#b8ffca', mark: '#07071c' };
const PDEAD = { body: '#3f4f46', core: '#5e6d64', head: '#56665c', mark: '#15151f' };
const K = { board: {}, sheet: {}, buf: null };
const Q = 0.5; // tunnel buffer resolution, in buffer pixels per CSS pixel

const margin = (L) => Math.max(10, Math.round(L.cell * 0.7));

// ───────────────────────────── scenery ─────────────────────────────

export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), dead = snap.alive === false, v = fx.variant;
  const live = !fx.rf && !dead;
  const pi = mod(v, PALS.length);
  const flip = live && (fx.punch > 0.55 || (mod(fx.beatIndex, 8) === 0 && fx.beat > 0.6 && fx.chaos > 0.15));
  const pal = flip ? INV[pi] : PALS[pi];
  const cx = L.bx + L.bw / 2, cy = L.by + L.bh / 2;
  const Rmin = Math.min(L.bw, L.bh) * 0.42;
  const Rmax = Math.max(Math.hypot(cx, cy), Math.hypot(L.w - cx, cy), Math.hypot(cx, L.h - cy), Math.hypot(L.w - cx, L.h - cy)) * 1.15;
  const buf = tunnel(L, fx, pal, dead, cx, cy, Rmin, Rmax);
  ctx.save();
  ctx.fillStyle = pal.a; ctx.fillRect(0, 0, L.w, L.h);
  ctx.save();
  const zoom = 1 + 0.22 * fx.punch + 0.035 * fx.beat, rot = fx.punch * 0.12 * (v & 1 ? 1 : -1);
  ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(buf, 0, 0, L.w, L.h);
  if (live && fx.chaos > 0.35) {
    const off = 2 + 9 * fx.chaos + 8 * fx.punch;
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.4;
    ctx.drawImage(buf, off, 0, L.w, L.h); ctx.drawImage(buf, -off, off * 0.5, L.w, L.h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (fx.rf) { ctx.fillStyle = 'rgba(16,0,28,0.42)'; ctx.fillRect(0, 0, L.w, L.h); }
  sheets(ctx, L, fx, pal, pi, dpr, cx, cy);
  years(ctx, fx, pal, cx, cy, Rmin, Rmax);
  fragments(ctx, fx, pal, cx, cy, Rmin, Rmax, dead);
  ctx.restore();
}

function polyR(th, r, sides, rot) {
  const seg = TAU / sides;
  return (r * Math.cos(Math.PI / sides)) / Math.cos(mod(th - rot, seg) - Math.PI / sides);
}
function ringPath(g, cx, cy, r, sides, rot) {
  g.beginPath();
  if (!sides) { g.arc(cx, cy, r, 0, TAU); return; }
  for (let i = 0; i < sides; i++) { const a = rot + (i / sides) * TAU; i ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath();
}
// Every other angular wedge from the centre out to radius r; wedge borders land on polygon vertices.
function wedgePath(g, cx, cy, r, sides, rot, M) {
  g.beginPath();
  for (let m = 0; m < M; m += 2) {
    const a0 = rot + (m / M) * TAU, a1 = rot + ((m + 1) / M) * TAU;
    g.moveTo(cx, cy);
    if (!sides) g.arc(cx, cy, r, a0, a1);
    else {
      const r0 = polyR(a0, r, sides, rot), r1 = polyR(a1 - 1e-6, r, sides, rot);
      g.lineTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0); g.lineTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1);
    }
    g.closePath();
  }
}

// Low-resolution tunnel buffer: rings flow outward from the board (we fly into it). Shape and palette
// change per bite (fx.variant); twist and speed grow with chaos.
function tunnel(L, fx, pal, dead, cx, cy, Rmin, Rmax) {
  const W = Math.max(2, Math.ceil(L.w * Q)), H = Math.max(2, Math.ceil(L.h * Q));
  if (!K.buf) K.buf = document.createElement('canvas');
  const buf = K.buf;
  if (buf.width !== W || buf.height !== H) { buf.width = W; buf.height = H; }
  const g = buf.getContext('2d');
  g.setTransform(Q, 0, 0, Q, 0, 0);
  const t = fx.time, shape = mod(fx.variant, 3), sides = shape === 1 ? 4 : shape === 2 ? 6 : 0, M = 24;
  const s = t * (dead ? 0.4 : 1.6 + 3 * fx.chaos) + fx.variant * 0.5, fs = frac(s), base = Math.floor(s);
  // circles twist into a spiral; polygons stay nested (twisted polygons shatter into shards and lose the tunnel)
  const twist = sides ? 0.012 : 0.06 + 0.16 * fx.chaos, N = 30;
  g.fillStyle = pal.a; g.fillRect(0, 0, L.w, L.h);
  for (let k = N; k >= 0; k--) {
    const d = (k + fs) / N, r = Rmin + (Rmax - Rmin) * Math.pow(d, 1.6), J = k - base;
    const rot = J * twist + t * (sides ? 0.35 : 0.2) + Math.sin(t * 0.7 + J * 0.3) * (sides ? 0.06 : 0.25) * fx.chaos;
    if (mod(J, 3) === 2) {
      g.fillStyle = pal.cols[mod(Math.floor(J / 3), 4)]; ringPath(g, cx, cy, r, sides, rot); g.fill();
    } else {
      g.fillStyle = J & 1 ? pal.a : pal.b; ringPath(g, cx, cy, r, sides, rot); g.fill();
      g.fillStyle = J & 1 ? pal.b : pal.a; wedgePath(g, cx, cy, r, sides, rot, M); g.fill();
    }
  }
  return buf;
}

// Folded checkerboards orbiting the board like flags in a vortex.
function sheets(ctx, L, fx, pal, pi, dpr, cx, cy) {
  const q = Math.max(10, Math.round(Math.min(L.w, L.h) * 0.03));
  const spr = checkerSprite(K.sheet, q, dpr, pal.a, pal.b, 8);
  const n = fx.chaos > 0.45 ? 3 : 2, R = Math.max(L.bw, L.bh) * 0.72 + Math.min(L.w, L.h) * 0.08;
  const sc = ((Math.min(L.w, L.h) * 0.42) / (8 * q)) * (1 + 0.2 * fx.punch);
  for (let i = 0; i < n; i++) {
    const a = fx.time * 0.35 + (i * TAU) / n + fx.variant * 0.9;
    warpSheet(ctx, spr, dpr, cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.85, a + Math.PI / 2 + Math.sin(fx.time) * 0.3,
      sc, fx.time * 1.6, i * 2, 10 + 30 * fx.chaos + 20 * fx.beat, 24);
  }
}

// Stretched era years flying out of the tunnel.
function years(ctx, fx, pal, cx, cy, Rmin, Rmax) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const u = fx.time * 0.22 + i / 3, p = frac(u), cyc = Math.floor(u);
    const a = hash(cyc * 3 + i * 11) * TAU, label = YEARS[Math.floor(hash(cyc * 5 + i) * YEARS.length)];
    const dist = Rmin * 0.9 + p * p * Rmax * 0.9, size = 10 + p * p * 150;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 5);
    ctx.translate(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.8);
    ctx.rotate(Math.sin(a) * 0.25); ctx.scale(2.4, 0.7);
    ctx.font = `900 ${size.toFixed(1)}px Impact, "Arial Black", sans-serif`;
    ctx.fillStyle = pal.cols[i % 4]; ctx.fillText(label, -size * 0.04, size * 0.05);
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

// Pixel fragments and streaks, stateless: every position is a function of fx.time.
function fragments(ctx, fx, pal, cx, cy, Rmin, Rmax, dead) {
  const n = 36 + Math.round(70 * fx.chaos) + (fx.punch > 0.05 ? 24 : 0), speed = dead ? 0.2 : 1 + fx.chaos;
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], streaks = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = hash(i * 1.7) * TAU, p = frac(fx.time * (0.3 + hash(i * 2.9) * 0.7) * speed + hash(i * 5.3));
    const dist = Rmin * 0.7 + p * p * Rmax, x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist, s = 1 + p * p * 18;
    if (i % 5 === 0) { const d0 = dist * 0.82; streaks.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); streaks.lineTo(x, y); }
    else paths[i % 4].rect(x - s / 2, y - s / 2, s, s);
  }
  for (let j = 0; j < 4; j++) { ctx.fillStyle = pal.cols[j]; ctx.fill(paths[j]); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.stroke(streaks); ctx.globalAlpha = 1;
}

// ───────────────────────────── board ─────────────────────────────

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), m = margin(L);
  const pal = PALS[mod(fx.variant, PALS.length)];
  ctx.save();
  const key = [L.w, L.h, L.cell, L.bx, L.by, L.cols, L.rows, dpr].join();
  blit(ctx, layer(K.board, key, L.bw + 2 * m, L.bh + 2 * m, dpr, (g) => paintBoard(g, L, m)), L.bx - m, L.by - m, dpr);
  burst(ctx, L, fx, pal);
  drawDot(ctx, L, snap, fx);
  if (fx.prev === 'arcade') arcadeSnake(ctx, L, snap, fxIn);
  else if (fx.prev === 'acid') acidSnake(ctx, L, snap, fxIn);
  else portalSnake(ctx, L, snap);
  deathMark(ctx, L, snap);
  ctx.restore();
}

// Black portal plate: checker rim, white rule, red lethal rail, inward corner arrows; navy panel, blue grid.
function paintBoard(g, L, m) {
  const { bw, bh, cell } = L;
  g.translate(m, m);
  g.fillStyle = '#000000'; g.fillRect(-m, -m, bw + 2 * m, bh + 2 * m);
  const q = Math.max(3, Math.round(m * 0.34));
  g.fillStyle = '#f4efe4'; g.beginPath();
  for (let i = 0, x = -m; x < bw + m; x += q, i++) {
    if (i & 1) { g.rect(x, -m, q, q); g.rect(x, bh + m - q, q, q); }
  }
  for (let i = 0, y = -m + q; y < bh + m - q; y += q, i++) {
    if (i & 1) { g.rect(-m, y, q, q); g.rect(bw + m - q, y, q, q); }
  }
  g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.strokeRect(-6.25, -6.25, bw + 12.5, bh + 12.5);
  g.strokeStyle = '#ff1f4b'; g.lineWidth = 4; g.strokeRect(-3, -3, bw + 6, bh + 6);
  const k = Math.max(4, m * 0.45), o = -m + q + 2;
  g.fillStyle = '#ff1f4b'; g.beginPath();
  for (const [x, y, sx, sy] of [[o, o, 1, 1], [bw - o, o, -1, 1], [o, bh - o, 1, -1], [bw - o, bh - o, -1, -1]]) {
    g.moveTo(x, y); g.lineTo(x + sx * k, y); g.lineTo(x, y + sy * k); g.closePath();
  }
  g.fill();
  g.fillStyle = '#07071c'; g.fillRect(0, 0, bw, bh);
  g.beginPath();
  for (let i = 1; i < L.cols; i++) { g.moveTo(i * cell + 0.5, 0); g.lineTo(i * cell + 0.5, bh); }
  for (let j = 1; j < L.rows; j++) { g.moveTo(0, j * cell + 0.5); g.lineTo(bw, j * cell + 0.5); }
  g.strokeStyle = '#3d3dff'; g.globalAlpha = 0.5; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
}

function burst(ctx, L, fx, pal) {
  const b = fx.bite, age = fx.biteAge;
  if (!b || !(age < 480)) return;
  const k = age / 480, c = L.cell, cx = L.bx + (X(b) + 0.5) * c, cy = L.by + (Y(b) + 0.5) * c;
  ctx.save();
  ctx.beginPath(); ctx.rect(L.bx, L.by, L.bw, L.bh); ctx.clip();
  ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
  if (fx.rm) { const r = c * 0.62; ctx.strokeStyle = '#ffffff'; ctx.strokeRect(cx - r, cy - r, 2 * r, 2 * r); ctx.restore(); return; }
  for (let j = 0; j < 4; j++) {
    const r = c * (0.5 + 2.6 * frac(k + j * 0.25));
    ctx.strokeStyle = j & 1 ? '#ff1f4b' : '#ffffff'; ctx.strokeRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  const q = Math.max(2, Math.round(c * 0.18 * (1 - k))), ease = 1 - (1 - k) ** 3;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + hash(fx.variant * 7 + i), d = c * (0.4 + 2.6 * ease);
    ctx.fillStyle = pal.cols[i % 4]; ctx.fillRect(Math.round(cx + Math.cos(a) * d - q / 2), Math.round(cy + Math.sin(a) * d - q / 2), q, q);
  }
  ctx.restore();
}

// Dot: portal seed — red ring, counter-spinning arcs, white core; stays inside its cell.
function drawDot(ctx, L, snap, fx) {
  const f = snap.food;
  if (!f) return;
  const c = L.cell, cx = L.bx + (X(f) + 0.5) * c, cy = L.by + (Y(f) + 0.5) * c, R = c * 0.4 * (1 + 0.08 * fx.beat), spin = fx.time * 3.2;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#ff1f4b'; ctx.lineWidth = Math.max(1.5, c * 0.08); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = Math.max(1.2, c * 0.07);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.68, spin, spin + 2.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.68, spin + Math.PI, spin + Math.PI + 2.2); ctx.stroke();
  ctx.strokeStyle = '#ffe81a'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.42, -spin * 1.4, -spin * 1.4 + 3.6); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, TAU); ctx.fill();
}

// Own skin: neon blocks with a pale core; head is rounded at the front and carries a chevron pointing
// the way it moves. Grey with two small X eyes when dead.
function portalSnake(ctx, L, snap) {
  const s = snap.snake;
  if (!s || !s.length) return;
  const c = L.cell, n = s.length, dead = snap.alive === false, P = dead ? PDEAD : PORTAL;
  const g = Math.max(1, Math.round(c * 0.09)), k = Math.round(c * 0.34), tl = Math.round(c * 0.17);
  ctx.save();
  // gap-safe (LEVELS_PLAN 3.3): every cell is its own block; the small tail block only marks the real tail
  const tailAt = n > 2 && !(snap.length > n) ? n - 1 : -1;
  ctx.fillStyle = P.body; ctx.beginPath();
  for (let i = 1; i < n; i++) { const t = i === tailAt ? tl : g; ctx.rect(L.bx + X(s[i]) * c + t, L.by + Y(s[i]) * c + t, c - 2 * t, c - 2 * t); }
  ctx.fill();
  ctx.fillStyle = P.core; ctx.beginPath();
  for (let i = 1; i < n; i++) ctx.rect(L.bx + X(s[i]) * c + k, L.by + Y(s[i]) * c + k, c - 2 * k, c - 2 * k);
  ctx.fill();
  const h = s[0], d = headDir(snap), p = [-d[1], d[0]], x = L.bx + X(h) * c, y = L.by + Y(h) * c, cx = x + c / 2, cy = y + c / 2;
  ctx.fillStyle = P.head; ctx.beginPath(); rrect(ctx, x + 1, y + 1, c - 2, c - 2, frontRadii(d, c * 0.42, c * 0.08)); ctx.fill();
  if (dead) {
    const r = c * 0.09; ctx.strokeStyle = P.mark; ctx.lineWidth = Math.max(1.5, c * 0.07); ctx.beginPath();
    for (const sg of [-1, 1]) {
      const ex = cx + p[0] * sg * c * 0.22 + d[0] * c * 0.1, ey = cy + p[1] * sg * c * 0.22 + d[1] * c * 0.1;
      ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = P.mark; ctx.beginPath();
    ctx.moveTo(cx + d[0] * c * 0.36, cy + d[1] * c * 0.36);
    ctx.lineTo(cx + d[0] * c * 0.04 + p[0] * c * 0.27, cy + d[1] * c * 0.04 + p[1] * c * 0.27);
    ctx.lineTo(cx + d[0] * c * 0.13, cy + d[1] * c * 0.13);
    ctx.lineTo(cx + d[0] * c * 0.04 - p[0] * c * 0.27, cy + d[1] * c * 0.04 - p[1] * c * 0.27);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Life slot (LEVELS_PLAN 4.3): an hourglass on the portal plate. Filled = red frame with neon sand in
// both bulbs; hollow = the empty glass outline. The skins it borrows (arcade, acid) keep their own icons.
export function life(ctx, x, y, size, filled, fx) {
  const cx = x + size / 2, top = y + size * 0.1, bot = y + size * 0.9, hw = size * 0.34, nk = size * 0.06, cy = y + size / 2;
  const glass = () => {
    ctx.beginPath();
    ctx.moveTo(cx - hw, top); ctx.lineTo(cx + hw, top); ctx.lineTo(cx + nk, cy); ctx.lineTo(cx + hw, bot);
    ctx.lineTo(cx - hw, bot); ctx.lineTo(cx - nk, cy); ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  glass();
  if (filled) {
    ctx.fillStyle = PORTAL.body; ctx.fill();
    ctx.fillStyle = PORTAL.core; ctx.beginPath(); ctx.moveTo(cx - hw * 0.5, top + size * 0.1); ctx.lineTo(cx + hw * 0.5, top + size * 0.1); ctx.lineTo(cx, cy - size * 0.06); ctx.closePath(); ctx.fill();
    glass(); ctx.strokeStyle = '#ff1f4b'; ctx.lineWidth = Math.max(1.2, size * 0.09); ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,31,75,0.8)'; ctx.lineWidth = Math.max(1.2, size * 0.08); ctx.stroke();
  }
  ctx.fillStyle = filled ? '#ffffff' : 'rgba(255,255,255,0.6)';
  ctx.fillRect(cx - hw - size * 0.04, top - size * 0.06, 2 * hw + size * 0.08, Math.max(1, size * 0.07));
  ctx.fillRect(cx - hw - size * 0.04, bot - size * 0.01, 2 * hw + size * 0.08, Math.max(1, size * 0.07));
  ctx.restore();
}
