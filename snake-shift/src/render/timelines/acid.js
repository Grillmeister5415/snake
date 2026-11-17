// SNAKE//SHIFT — timeline 01: ACID PARADISE, 1968. Flat Canvas 2D (stream flat-a).
// Contract: BUILD_PLAN.md §15.3. A living screen-printed poster: colour-cycling groovy bands, warped
// checkerboards, concentric targets, big flowers, a fractal crack, grain, and misregistered ink layers
// that jump on the beat. The board is a clean cream sheet inside a scalloped plum band (the lethal edge).
// Extra exports for timewarp.js: drawSnake(), checkerSprite(), warpSheet().
// Self-contained on purpose (no imports), so it loads even if a sibling file fails.

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
    biteAge: Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity, rf: !!fx.reducedFlash, rm: !!fx.reducedMotion,
  };
}
function dprOf(ctx) {
  const m = ctx.getTransform ? ctx.getTransform() : null;
  return Math.max(1, Math.min(3, (m && Math.hypot(m.a, m.b)) || 1));
}
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
// Gap-safe (LEVELS_PLAN 3.3): two cells are joined only when adjacent and not split by snap.breaks.
const joined = (snap, i) => {
  const s = snap.snake, a = s[i], b = s[i + 1];
  return !!(a && b) && !(snap.breaks && snap.breaks.includes(i)) && Math.abs(X(a) - X(b)) + Math.abs(Y(a) - Y(b)) === 1;
};
function headDir(snap) {
  const s = snap.snake;
  if (s && s.length > 1 && joined(snap, 0)) {
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
function frontRadii(d, rf, rb) {
  const [dx, dy] = d;
  return [dx < 0 || dy < 0 ? rf : rb, dx > 0 || dy < 0 ? rf : rb, dx > 0 || dy > 0 ? rf : rb, dx < 0 || dy > 0 ? rf : rb];
}

export const meta = {
  id: 'acid', name: 'ACID PARADISE', year: '1968', kind: '2d',
  luma: 0.7, veil: '#e98a5c', weight: 2,
  hud: { fg: '#3b0a45', bg: '#f7ead0', accent: '#ff2e88', panelFg: '#3b0a45', panelBg: 'rgba(247,234,208,0.94)' },
};

const C = { cream: '#f7ead0', orange: '#ff7a1a', pink: '#ff2e88', violet: '#6b2fb3', lemon: '#ffd23f', turq: '#1fc8c0', teal: '#178f8b', plum: '#3b0a45', red: '#e0115f' };
const BANDS = [
  [C.orange, C.pink, C.cream, C.turq, C.violet, C.lemon],
  [C.pink, C.lemon, C.turq, C.cream, C.orange, C.violet],
  [C.violet, C.orange, C.lemon, C.pink, C.cream, C.turq],
];
const FLOWER = [
  { petal: C.orange, inner: C.pink, heart: C.lemon, seeds: C.cream },
  { petal: C.pink, inner: C.cream, heart: C.orange, seeds: C.cream },
  { petal: C.violet, inner: C.pink, heart: C.lemon, seeds: C.orange },
  { petal: C.lemon, inner: C.orange, heart: C.pink, seeds: C.cream },
];
const FLOWERS_AT = [{ x: 0.07, y: 0.1, s: 1, d: 1 }, { x: 0.94, y: 0.88, s: 1.15, d: -1 }, { x: 0.92, y: 0.1, s: 0.72, d: -1 }, { x: 0.08, y: 0.9, s: 0.8, d: 1 }];
const LIVE = { body: C.pink, band: C.orange, line: C.lemon, edge: 'rgba(59,10,69,0.55)', ghost: 'rgba(31,200,192,0.85)' };
const DEAD = { body: '#c9b59b', band: '#a8927a', line: '#ddd0bc', edge: 'rgba(80,64,52,0.6)', ghost: 'rgba(120,110,100,0.35)' };
const K = { flower: [{}, {}, {}, {}], ghost: [{}, {}, {}, {}], checker: {}, board: {}, seg: [null, null], crack: { key: null, paths: [] }, grain: null, pat: null, patCtx: null };
const SEG = 72, COS = [], SIN = [];
for (let i = 0; i <= SEG; i++) { COS.push(Math.cos((i / SEG) * TAU)); SIN.push(Math.sin((i / SEG) * TAU)); }

const margin = (L) => Math.max(8, Math.round(L.cell * 0.55));

// ───────────────────────────── scenery ─────────────────────────────

export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), v = fx.variant, { w, h } = L;
  const pal = BANDS[mod(v, BANDS.length)];
  // misregistration: second ink layer jumps to a new offset on every beat
  const mag = fx.rf ? 2.5 : 3 + 8 * fx.chaos + 14 * fx.punch + 5 * fx.beat;
  const ma = fx.rf ? 0.8 : hash(fx.beatIndex * 7.13 + v * 1.7) * TAU;
  const mx = Math.cos(ma) * mag, my = Math.sin(ma) * mag;
  ctx.save();
  ctx.fillStyle = C.cream; ctx.fillRect(0, 0, w, h);
  bands(ctx, L, fx, pal);
  const q = Math.max(14, Math.round(Math.min(w, h) * 0.042));
  const spr = checkerSprite(K.checker, q, dpr, C.cream, mod(v, 2) ? C.violet : C.pink);
  const sc = (Math.min(w, h) * 0.5) / (9 * q), amp = 8 + 22 * fx.chaos + 14 * fx.beat + 20 * fx.punch;
  warpSheet(ctx, spr, dpr, w * 0.86, h * 0.21, 0.35 + 0.12 * Math.sin(fx.time * 0.3), sc, fx.time, 0, amp);
  warpSheet(ctx, spr, dpr, w * 0.14, h * 0.79, -0.45 + 0.12 * Math.sin(fx.time * 0.27 + 1), sc, fx.time, 2.1, amp);
  const spin = fx.rf ? Math.floor(fx.time * 0.5) : Math.floor(fx.time * 2.5) + fx.beatIndex;
  const pulse = 1 + 0.08 * fx.beat + 0.12 * fx.punch;
  const tR = Math.min(w, h) * 0.16 * pulse, hR = L.bw * 0.21 * pulse;
  target(ctx, w * 0.06, L.by + L.bh * 0.5, tR, 7, pal, spin, mx, my);
  target(ctx, w * 0.95, L.by + L.bh * 0.45, tR * 0.9, 7, pal, spin + 2, mx, my);
  target(ctx, L.bx + L.bw / 2, L.by - 2, hR, 8, pal, spin + 1, mx, my);
  target(ctx, L.bx + L.bw / 2, L.by + L.bh + 2, hR, 8, pal, spin + 3, mx, my);
  FLOWERS_AT.forEach((f, i) => {
    const R = Math.round(Math.min(w, h) * 0.2 * f.s), fp = FLOWER[mod(i + v, FLOWER.length)];
    const body = flowerSprite(K.flower[i], R, dpr, fp, false), ghost = flowerSprite(K.ghost[i], R, dpr, fp, true);
    const x = w * f.x, y = h * f.y, rot = fx.time * 0.16 * f.d + i, s = 1 + 0.08 * fx.beat + 0.18 * fx.punch;
    const sg = i & 1 ? 1 : -1;
    spun(ctx, ghost, dpr, x + mx * sg, y + my * sg, rot, s);
    spun(ctx, body, dpr, x, y, rot, s);
  });
  crack(ctx, L, fx);
  ctx.fillStyle = grain(ctx);
  ctx.translate(Math.round(mx), Math.round(my));
  ctx.fillRect(-20, -20, w + 40, h + 40);
  ctx.restore();
}

// Generated colour-cycling bands: wavy concentric rings flowing out from the board.
function bands(ctx, L, fx, pal) {
  const { w, h } = L, cx = L.bx + L.bw / 2, cy = L.by + L.bh / 2;
  const Rin = Math.min(L.bw, L.bh) * 0.42;
  const Rout = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)) + 60;
  const bw = Math.max(24, Math.min(w, h) * 0.055), s = fx.time * 0.55, fs = frac(s), base = Math.floor(s);
  const N = Math.ceil((Rout - Rin) / bw) + 2, lobes = 5 + mod(fx.variant, 3) * 2;
  const amp = bw * (0.35 + 0.5 * fx.chaos + 0.5 * fx.beat + 0.8 * fx.punch);
  const shift = fx.rf || fx.chaos < 0.35 ? 0 : fx.beatIndex;
  for (let k = N; k >= 0; k--) {
    const r0 = Rin + (k + fs) * bw, ph = fx.time * 0.9 + k * 0.5;
    ctx.beginPath();
    for (let i = 0; i < SEG; i++) {
      const r = r0 + amp * Math.sin(lobes * (i / SEG) * TAU + ph);
      i ? ctx.lineTo(cx + COS[i] * r, cy + SIN[i] * r) : ctx.moveTo(cx + COS[i] * r, cy + SIN[i] * r);
    }
    ctx.closePath();
    ctx.fillStyle = pal[mod(k - base + shift, pal.length)];
    ctx.fill();
  }
}

export function checkerSprite(slot, q, dpr, a, b, n = 9) {
  return layer(slot, [q, dpr, a, b, n].join(), n * q, n * q, dpr, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, n * q, n * q); g.fillStyle = b;
    for (let y = 0; y < n; y++) for (let x = y & 1; x < n; x += 2) g.fillRect(x * q, y * q, q, q);
  });
}

// Draws a sprite as vertical strips with sine offsets and stretch: a fabric-like folded sheet.
export function warpSheet(ctx, spr, dpr, x, y, rot, scale, t, ph, amp, strips = 32) {
  const W = spr.width, H = spr.height, sw = W / strips, k = scale / dpr, dw = W * k, dh = H * k;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  for (let i = 0; i < strips; i++) {
    const oy = amp * Math.sin(i * 0.38 + t * 1.7 + ph), hh = dh * (1 + 0.22 * Math.sin(i * 0.21 - t * 1.1 + ph));
    ctx.drawImage(spr, i * sw, 0, sw, H, -dw / 2 + i * sw * k, -hh / 2 + oy, sw * k + 0.7, hh);
  }
  ctx.restore();
}

function target(ctx, x, y, R, rings, cols, spin, ox, oy) {
  ctx.fillStyle = C.violet; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(x + ox, y + oy, R, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  for (let k = 0; k < rings; k++) {
    ctx.fillStyle = cols[mod(k + spin, cols.length)];
    ctx.beginPath(); ctx.arc(x, y, R * (1 - k / rings), 0, TAU); ctx.fill();
  }
}

function flowerSprite(slot, R, dpr, fp, ghost) {
  const S = Math.ceil(R * 2.2);
  return layer(slot, [R, dpr, ghost ? 'ghost' : fp.petal].join(), S, S, dpr, (g) => {
    g.translate(S / 2, S / 2);
    for (let i = 0; i < 8; i++) {
      g.save(); g.rotate((i / 8) * TAU);
      g.fillStyle = ghost ? C.turq : fp.petal; g.beginPath(); g.ellipse(R * 0.56, 0, R * 0.46, R * 0.25, 0, 0, TAU); g.fill();
      if (!ghost) { g.fillStyle = fp.inner; g.beginPath(); g.ellipse(R * 0.52, 0, R * 0.26, R * 0.1, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    if (ghost) return;
    g.fillStyle = fp.heart; g.beginPath(); g.arc(0, 0, R * 0.3, 0, TAU); g.fill();
    g.fillStyle = fp.seeds;
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39996, r = R * 0.235 * Math.sqrt(i / 13);
      g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.035, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 180; i++) {
      const a = hash(i * 1.7) * TAU, r = hash(i * 3.9) * R;
      g.globalAlpha = 0.25 + hash(i) * 0.5; g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 1.3, 1.3);
    }
  });
}

function spun(ctx, spr, dpr, x, y, rot, s) {
  const W = (spr.width / dpr) * s, H = (spr.height / dpr) * s;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(spr, -W / 2, -H / 2, W, H); ctx.restore();
}

// Fractal crack: branching jagged walk from a screen edge toward the board. Grows with chaos, reseeded per bite.
function crack(ctx, L, fx) {
  const level = Math.min(3, Math.floor(fx.chaos * 4));
  if (fx.chaos < 0.2 && fx.punch < 0.05) return;
  const key = [L.w, L.h, L.bx, L.by, fx.variant, level].join();
  if (K.crack.key !== key) {
    let seed = fx.variant * 97 + level * 13 + 1;
    const rnd = () => hash(seed++ * 0.731);
    const cx = L.bx + L.bw / 2, cy = L.by + L.bh / 2, side = Math.floor(rnd() * 4);
    const sx = side === 1 ? L.w : side === 3 ? 0 : rnd() * L.w, sy = side === 0 ? 0 : side === 2 ? L.h : rnd() * L.h;
    const stack = [[sx, sy, Math.atan2(cy - sy, cx - sx), 0]], paths = [], step = Math.max(10, Math.min(L.w, L.h) * 0.025);
    while (stack.length && paths.length < 3 + level * 3) {
      let [x, y, a, depth] = stack.pop();
      const pts = [[x, y]], len = (depth ? 6 : 28) + rnd() * 12;
      for (let i = 0; i < len; i++) {
        a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * step; y += Math.sin(a) * step; pts.push([x, y]);
        if (x > L.bx && x < L.bx + L.bw && y > L.by && y < L.by + L.bh) break;
        if (rnd() < 0.14 && depth < 3) stack.push([x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), depth + 1]);
      }
      paths.push(pts);
    }
    K.crack = { key, paths };
  }
  const line = (ox, oy) => { ctx.beginPath(); for (const p of K.crack.paths) p.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy))); };
  ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  line(0, 0); ctx.strokeStyle = C.plum; ctx.lineWidth = 3 + 3 * fx.punch; ctx.stroke();
  line(1.5, 1.5); ctx.strokeStyle = C.cream; ctx.lineWidth = 1.2; ctx.stroke();
}

function grain(ctx) {
  if (!K.grain) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), cols = ['rgba(59,10,69,0.22)', 'rgba(224,17,95,0.18)', 'rgba(23,143,139,0.2)', 'rgba(247,234,208,0.35)'];
    for (let i = 0; i < 700; i++) {
      g.fillStyle = cols[i % 4]; const s = hash(i * 5.1) < 0.85 ? 1 : 2;
      g.fillRect(Math.floor(hash(i * 1.31) * 128), Math.floor(hash(i * 2.77) * 128), s, s);
    }
    K.grain = c;
  }
  if (K.patCtx !== ctx) { K.pat = ctx.createPattern(K.grain, 'repeat'); K.patCtx = ctx; }
  return K.pat;
}

// ───────────────────────────── board ─────────────────────────────

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), m = margin(L);
  ctx.save();
  const key = [L.w, L.h, L.cell, L.bx, L.by, L.cols, L.rows, dpr].join();
  blit(ctx, layer(K.board, key, L.bw + 2 * m, L.bh + 2 * m, dpr, (g) => paintBoard(g, L, m)), L.bx - m, L.by - m, dpr);
  burst(ctx, L, fx);
  drawDot(ctx, L, snap, fx);
  drawSnake(ctx, L, snap, fxIn);
  deathMark(ctx, L, snap);
  ctx.restore();
}

// Lethal edge = scalloped plum band with lemon ric-rac and a turquoise rule hugging the sheet.
function paintBoard(g, L, m) {
  const { bw, bh, cell } = L;
  g.translate(m, m);
  const sr = m * 0.42, o = -m + sr, step = m * 0.95;
  g.fillStyle = C.plum;
  g.beginPath(); g.rect(o, o, bw - 2 * o, bh - 2 * o); g.fill();
  g.beginPath();
  for (let x = o; x <= bw - o + 0.1; x += step) { g.moveTo(x + sr, o); g.arc(x, o, sr, 0, TAU); g.moveTo(x + sr, bh - o); g.arc(x, bh - o, sr, 0, TAU); }
  for (let y = o; y <= bh - o + 0.1; y += step) { g.moveTo(o + sr, y); g.arc(o, y, sr, 0, TAU); g.moveTo(bw - o + sr, y); g.arc(bw - o, y, sr, 0, TAU); }
  g.fill();
  const lw = Math.max(2, Math.round(m * 0.22)), mid = (o - lw) / 2;
  g.fillStyle = C.lemon; g.beginPath();
  const dr = Math.max(1.2, m * 0.11);
  for (let x = mid; x <= bw - mid + 0.1; x += step * 0.5) { g.moveTo(x + dr, mid); g.arc(x, mid, dr, 0, TAU); g.moveTo(x + dr, bh - mid); g.arc(x, bh - mid, dr, 0, TAU); }
  for (let y = mid + step * 0.5; y < bh - mid; y += step * 0.5) { g.moveTo(mid + dr, y); g.arc(mid, y, dr, 0, TAU); g.moveTo(bw - mid + dr, y); g.arc(bw - mid, y, dr, 0, TAU); }
  g.fill();
  g.fillStyle = C.turq; g.fillRect(-lw, -lw, bw + 2 * lw, bh + 2 * lw);
  g.fillStyle = C.cream; g.fillRect(0, 0, bw, bh);
  for (let i = 0, n = Math.floor((bw * bh) / 90); i < n; i++) {
    g.fillStyle = i % 3 ? 'rgba(224,17,95,0.07)' : 'rgba(23,143,139,0.08)';
    g.fillRect(hash(i * 1.37) * bw, hash(i * 2.11 + 5) * bh, 1.4, 1.4);
  }
  const gl = Math.max(1, Math.round(cell * 0.06)), off = (gl % 2) / 2;
  g.beginPath();
  for (let i = 1; i < L.cols; i++) { g.moveTo(i * cell + off, 0); g.lineTo(i * cell + off, bh); }
  for (let j = 1; j < L.rows; j++) { g.moveTo(0, j * cell + off); g.lineTo(bw, j * cell + off); }
  g.strokeStyle = C.teal; g.globalAlpha = 0.8; g.lineWidth = gl; g.stroke(); g.globalAlpha = 1;
}

function burst(ctx, L, fx) {
  const b = fx.bite, age = fx.biteAge;
  if (!b || !(age < 600)) return;
  const k = age / 600, c = L.cell, cx = L.bx + (X(b) + 0.5) * c, cy = L.by + (Y(b) + 0.5) * c;
  ctx.save();
  ctx.beginPath(); ctx.rect(L.bx, L.by, L.bw, L.bh); ctx.clip();
  ctx.globalAlpha = 1 - k; ctx.strokeStyle = C.violet;
  if (fx.rm) { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, c * 0.7, 0, TAU); ctx.stroke(); ctx.restore(); return; }
  const ease = 1 - (1 - k) ** 2, r = c * (0.5 + 2 * ease);
  ctx.lineWidth = Math.max(2, c * 0.12 * (1 - k)); ctx.beginPath();
  for (let i = 0; i < SEG; i++) { const rr = r * (1 + 0.08 * Math.sin((i / SEG) * TAU * 8)); i ? ctx.lineTo(cx + COS[i] * rr, cy + SIN[i] * rr) : ctx.moveTo(cx + COS[i] * rr, cy + SIN[i] * rr); }
  ctx.closePath(); ctx.stroke();
  const cols = [C.pink, C.orange, C.turq];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + hash(fx.variant * 13 + i) * 0.5, d = c * (0.3 + 2.2 * ease);
    ctx.fillStyle = cols[i % 3]; ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, c * 0.18 * (1 - k * 0.5), c * 0.09, a, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Dot: a sunburst flower (rays, petals, lemon heart), kept inside its cell.
function drawDot(ctx, L, snap, fx) {
  const f = snap.food;
  if (!f) return;
  const c = L.cell, cx = L.bx + (X(f) + 0.5) * c, cy = L.by + (Y(f) + 0.5) * c;
  const R = Math.min(c * 0.49, c * 0.44 * (1 + 0.07 * fx.beat)), rot = fx.time * 0.8;
  ctx.fillStyle = C.orange; ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = rot + (i / 12) * TAU;
    ctx.moveTo(cx + Math.cos(a - 0.17) * R * 0.4, cy + Math.sin(a - 0.17) * R * 0.4);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.lineTo(cx + Math.cos(a + 0.17) * R * 0.4, cy + Math.sin(a + 0.17) * R * 0.4);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = C.pink;
  for (let i = 0; i < 6; i++) {
    const a = -rot * 0.6 + (i / 6) * TAU;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R * 0.36, cy + Math.sin(a) * R * 0.36, R * 0.24, R * 0.14, a, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = C.lemon; ctx.beginPath(); ctx.arc(cx, cy, R * 0.21, 0, TAU); ctx.fill();
  ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(cx, cy, R * 0.08, 0, TAU); ctx.fill();
}

function segSprite(c, dpr, horiz, par, P) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(c * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ins = Math.max(1, Math.round(c * 0.07)), sz = c - 2 * ins, r = sz * 0.32;
  g.fillStyle = P.ghost; g.beginPath(); rrect(g, ins + 1, ins + 1, sz, sz, r); g.fill();
  g.save(); g.beginPath(); rrect(g, ins, ins, sz, sz, r); g.fillStyle = P.body; g.fill(); g.clip();
  const wave = (off, amp, lw, col) => {
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const u = -0.1 * c + (i / 20) * 1.2 * c, vv = c / 2 + off * c + amp * c * Math.sin((u / c) * TAU + par * Math.PI);
      if (horiz) i ? g.lineTo(u, vv) : g.moveTo(u, vv); else i ? g.lineTo(vv, u) : g.moveTo(vv, u);
    }
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.stroke();
  };
  wave(0, 0.17, c * 0.24, P.band);
  wave(0.3, 0.12, c * 0.07, P.line);
  wave(-0.3, 0.12, c * 0.07, P.line);
  g.restore();
  g.strokeStyle = P.edge; g.lineWidth = Math.max(1, c * 0.045); g.beginPath(); rrect(g, ins, ins, sz, sz, r); g.stroke();
  return cv;
}

function segs(c, dpr, dead) {
  const key = [c, dpr].join(), i = dead ? 1 : 0;
  if (!K.seg[i] || K.seg[i].key !== key) {
    const P = dead ? DEAD : LIVE;
    K.seg[i] = { key, H: [segSprite(c, dpr, true, 0, P), segSprite(c, dpr, true, 1, P)], V: [segSprite(c, dpr, false, 0, P), segSprite(c, dpr, false, 1, P)] };
  }
  return K.seg[i];
}

// Snake skin: a striped illustrated worm. Rounded segments with wavy stripes, tapered tail,
// head with eye and flicking forked tongue. Sepia with an X eye when dead.
export function drawSnake(ctx, L, snap, fxIn) {
  const s = snap.snake;
  if (!s || !s.length) return;
  const fx = norm(fxIn), dpr = dprOf(ctx), c = L.cell, n = s.length, dead = snap.alive === false, S = segs(c, dpr, dead);
  ctx.save();
  // each segment's stripe runs along a joined neighbour (the one ahead, else behind, else the heading);
  // the small tail segment only when the real tail is on the board, so a cut-off body ends plainly
  const tailAt = n > 2 && !(snap.length > n) ? n - 1 : -1, hd = DIRS[snap.dir] || [1, 0];
  for (let i = n - 1; i >= 1; i--) {
    const a = s[i], b = joined(snap, i - 1) ? s[i - 1] : joined(snap, i) ? s[i + 1] : null;
    const horiz = b ? Y(a) === Y(b) : hd[1] === 0;
    const spr = (horiz ? S.H : S.V)[i & 1], x = L.bx + X(a) * c, y = L.by + Y(a) * c;
    if (i === tailAt) ctx.drawImage(spr, x + c * 0.1, y + c * 0.1, c * 0.8, c * 0.8);
    else ctx.drawImage(spr, x, y, c, c);
  }
  const P = dead ? DEAD : LIVE, h = s[0], d = headDir(snap), p = [-d[1], d[0]];
  const x = L.bx + X(h) * c, y = L.by + Y(h) * c, ins = Math.max(1, Math.round(c * 0.05)), sz = c - 2 * ins;
  const radii = frontRadii(d, sz * 0.48, sz * 0.24), cx = x + c / 2, cy = y + c / 2;
  ctx.fillStyle = P.ghost; ctx.beginPath(); rrect(ctx, x + ins + 1, y + ins + 1, sz, sz, radii); ctx.fill();
  ctx.beginPath(); rrect(ctx, x + ins, y + ins, sz, sz, radii); ctx.fillStyle = P.body; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = P.band;
  if (d[0]) ctx.fillRect(cx - d[0] * c * 0.36 - c * 0.09, y, c * 0.18, c);
  else ctx.fillRect(x, cy - d[1] * c * 0.36 - c * 0.09, c, c * 0.18);
  ctx.restore();
  ctx.strokeStyle = P.edge; ctx.lineWidth = Math.max(1, c * 0.045); ctx.beginPath(); rrect(ctx, x + ins, y + ins, sz, sz, radii); ctx.stroke();
  const ex = cx + d[0] * c * 0.12 + p[0] * c * 0.2, ey = cy + d[1] * c * 0.12 + p[1] * c * 0.2, er = c * 0.14;
  if (dead) {
    ctx.strokeStyle = C.plum; ctx.lineWidth = Math.max(1.5, c * 0.06);
    ctx.beginPath(); ctx.moveTo(ex - er, ey - er); ctx.lineTo(ex + er, ey + er); ctx.moveTo(ex + er, ey - er); ctx.lineTo(ex - er, ey + er); ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
    ctx.fillStyle = C.plum; ctx.beginPath(); ctx.arc(ex + d[0] * er * 0.35, ey + d[1] * er * 0.35, er * 0.55, 0, TAU); ctx.fill();
    const fl = Math.sin(fx.time * 7.5);
    if (fl > 0) {
      const len = c * 0.3 * fl, sx = cx + d[0] * (c / 2 - ins), sy = cy + d[1] * (c / 2 - ins), tx = sx + d[0] * len, ty = sy + d[1] * len, fk = c * 0.07;
      ctx.strokeStyle = C.red; ctx.lineWidth = Math.max(1, c * 0.055); ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(tx, ty);
      ctx.lineTo(tx + (d[0] + p[0]) * fk, ty + (d[1] + p[1]) * fk);
      ctx.moveTo(tx, ty); ctx.lineTo(tx + (d[0] - p[0]) * fk, ty + (d[1] - p[1]) * fk);
      ctx.stroke();
    }
  }
  ctx.restore();
}

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
  ctx.save(); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s); ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s);
  ctx.strokeStyle = C.cream; ctx.lineWidth = Math.max(3, c * 0.17); ctx.stroke();
  ctx.strokeStyle = C.red; ctx.lineWidth = Math.max(2, c * 0.09); ctx.stroke();
  ctx.restore();
}

// Life slot (LEVELS_PLAN 4.3): a screen-printed flower. Filled = pink petals, lemon heart, plum ink;
// hollow = the petals drawn as a plum outline only, with an empty heart.
export function life(ctx, x, y, size, filled, fx) {
  const cx = x + size / 2, cy = y + size / 2, R = size * 0.46, pr = R * 0.36, k = 6;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < k; i++) {
    const a = (i / k) * TAU - Math.PI / 2, px = cx + Math.cos(a) * (R - pr), py = cy + Math.sin(a) * (R - pr);
    ctx.moveTo(px + pr, py); ctx.arc(px, py, pr, 0, TAU);
  }
  if (filled) {
    ctx.fillStyle = C.pink; ctx.fill();
    ctx.strokeStyle = C.plum; ctx.lineWidth = Math.max(1, size * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.42, 0, TAU); ctx.fillStyle = C.lemon; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.15, 0, TAU); ctx.fillStyle = C.orange; ctx.fill();
  } else {
    ctx.strokeStyle = C.plum; ctx.globalAlpha = 0.75; ctx.lineWidth = Math.max(1.2, size * 0.07); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
