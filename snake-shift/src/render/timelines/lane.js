// SNAKE//SHIFT — universe `lane`: ACID ENDLESS LANE, 1967. Flat Canvas 2D (stream lane-2d).
// Contract: BUILD_PLAN.md §15.3, LEVELS_PLAN.md 3.3 / 3.4 / 4.3 / 6. A hand-printed sixties op-art lane:
// cream ground, orange grid, a floral worm. The side rails are the lethal edge; the top and bottom are
// open and fade out. Cells are exact; scenery and lane markings scroll smoothly from prevY0 → y0.
// Self-contained (no imports).

const TAU = Math.PI * 2;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const mod = (a, n) => ((a % n) + n) % n;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const C = {
  cream: '#f4e4c1', paper: '#ecd6aa', orange: '#e5572a', plum: '#4a1f3d', teal: '#2f9c95',
  olive: '#a8b23a', mustard: '#f0b52f', pink: '#e9738a', red: '#c8321f', ink: '#2a1020',
};

export const meta = {
  id: 'lane', name: 'ACID ENDLESS LANE', year: '1967', kind: '2d',
  luma: 0.62, veil: '#c9784a', weight: 1,
  hud: { fg: '#4a1f3d', bg: '#f4e4c1', accent: '#e5572a', panelFg: '#f4e4c1', panelBg: '#4a1f3d' },
};

function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: clamp01(num(fx.beat)), beatIndex: num(fx.beatIndex) | 0, chaos: clamp01(num(fx.chaos)),
    punch: clamp01(num(fx.punch)), variant: num(fx.variant) | 0, bite: fx.bite || null,
    biteAge: Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity, rf: !!fx.reducedFlash, rm: !!fx.reducedMotion,
  };
}
// Smooth scroll position of the window, in rows (fractional), for scenery and lane markings only.
export function scrollRows(snap) {
  const sp = (snap && snap.space) || {};
  const y0 = num(sp.y0), p0 = Number.isFinite(sp.prevY0) ? sp.prevY0 : y0;
  if (Math.abs(y0 - p0) > 2) return y0;              // a jump (space entry): no slide
  const t = clamp01(num(snap.progress, 1));
  return p0 + (y0 - p0) * t;
}
const isCell = (c) => c && Number.isFinite(c.x) && Number.isFinite(c.y);
const inBoard = (c, L) => isCell(c) && c.x >= 0 && c.y >= 0 && c.x < L.cols && c.y < L.rows;
// Gap-safe (LEVELS_PLAN 3.3): joined only when adjacent and not split by snap.breaks.
function joined(snap, i) {
  const s = snap.snake, a = s[i], b = s[i + 1];
  return isCell(a) && isCell(b) && !(snap.breaks && snap.breaks.includes(i)) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

// ---------------- inks: warm screen-print at chaos 0 → acid neon at chaos 1 ----------------
const OWN = ['#e5572a', '#4a1f3d', '#2f9c95', '#a8b23a', '#f0b52f', '#e9738a'];
const ACID = ['#ff3d00', '#7a00ff', '#00e5d4', '#b8ff00', '#ffe600', '#ff1f8f'];
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const OWN_RGB = OWN.map(hexRgb), ACID_RGB = ACID.map(hexRgb);
let inkCache = { k: -1, v: null };
function inks(chaos) {
  const k = Math.round(chaos * 20);
  if (inkCache.k === k) return inkCache.v;
  const t = k / 20, v = OWN_RGB.map((a, i) => {
    const b = ACID_RGB[i];
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  });
  inkCache = { k, v };
  return v;
}
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------------- scenery ----------------
export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), sr = scrollRows(snap), c = L.cell, ink = inks(fx.chaos);
  ctx.save();
  ctx.fillStyle = ink[1];
  ctx.fillRect(0, 0, L.w, L.h);
  bands(ctx, L, fx, sr, ink);
  flowers(ctx, L, fx, sr, ink);
  bloom(ctx, L, fx, ink);
  if (fx.punch > 0.02 && !fx.rf) sunburst(ctx, L, fx, ink);
  ctx.restore();
}
// Wavy screen-print bands that flow with the lane (world-anchored, so they scroll with the window).
function bands(ctx, L, fx, sr, ink) {
  const c = L.cell, bw = c * (0.95 - fx.chaos * 0.25), off = sr * c;
  const amp = c * (0.6 + fx.chaos * 1.6 + fx.beat * 0.4), wl = c * (2.6 - fx.chaos * 1.1);
  const n = Math.ceil(L.w / bw) + 4, step = Math.max(6, c / 3);
  const wave = (i, y) => Math.sin((y + off) / wl + i * 0.45 + fx.time * (0.5 + fx.chaos)) * amp
    + Math.sin((y + off) / (wl * 2.7) - fx.time * 0.3) * amp * 0.6 * fx.chaos;
  ctx.lineWidth = Math.max(1, c * 0.07); ctx.strokeStyle = ink[1];
  for (let i = -2; i < n; i++) {
    const x0 = i * bw;
    ctx.fillStyle = ink[mod(i + fx.variant, 6) === 1 ? 2 : mod(i + fx.variant, 6)];
    ctx.beginPath();
    for (let y = -c; y <= L.h + c; y += step) { const x = x0 + wave(i, y); if (y === -c) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (let y = L.h + c; y >= -c; y -= step) ctx.lineTo(x0 + bw * 0.62 + wave(i + 0.5, y), y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
// Punch: an op-art sunburst of alternating ink rays fans out from the bitten cell (or the centre).
function sunburst(ctx, L, fx, ink) {
  const b = fx.bite && Number.isFinite(fx.bite.x) ? fx.bite : { x: L.cols / 2, y: L.rows / 2 };
  const x = L.bx + (b.x + 0.5) * L.cell, y = L.by + (b.y + 0.5) * L.cell, R = Math.hypot(L.w, L.h), n = 28;
  const spin = fx.time * 0.8 + fx.variant * 0.37;
  ctx.globalAlpha = Math.min(1, fx.punch * 0.9);
  for (let k = 0; k < n; k += 2) {
    const a0 = spin + (k / n) * TAU, a1 = spin + ((k + 1) / n) * TAU;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R); ctx.lineTo(x + Math.cos(a1) * R, y + Math.sin(a1) * R);
    ctx.closePath(); ctx.fillStyle = ink[(k / 2 + fx.variant) % 2 ? 4 : 5]; ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// A bite blooms a giant daisy behind the board, centred on the bitten cell.
function bloom(ctx, L, fx, ink) {
  const b = fx.bite;
  if (!b || !(fx.biteAge < 700) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
  const t = Math.max(0, fx.biteAge) / 700, c = L.cell, x = L.bx + (b.x + 0.5) * c, y = L.by + (b.y + 0.5) * c;
  ctx.globalAlpha = (1 - t) * (fx.rf ? 0.35 : 1);
  daisy(ctx, x, y, c * (2 + t * 11), t * 2 + fx.variant, 12, ink[(fx.variant + 5) % 6], ink[4], ink[1], ink[1]);
  ctx.globalAlpha = 1;
}
function daisy(ctx, x, y, R, rot, k, petal, ring, eye, outline) {
  const pr = R * (k > 8 ? 0.26 : 0.34);
  ctx.beginPath();
  for (let i = 0; i < k; i++) {
    const a = rot + (i / k) * TAU;
    ctx.ellipse(x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, R * 0.4, pr, a, 0, TAU);
    ctx.closePath();
  }
  ctx.fillStyle = petal; ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(x, y, R * 0.36, 0, TAU); ctx.fillStyle = ring; ctx.fill();
  if (outline) ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, R * 0.17, 0, TAU); ctx.fillStyle = eye; ctx.fill();
}
// Giant hand-printed daisies anchored to lane rows: they drift past as the window follows the head.
function flowers(ctx, L, fx, sr, ink) {
  const c = L.cell, gap = 3.2, top = sr - L.by / c - 4, bot = sr + (L.h - L.by) / c + 4;
  ctx.lineWidth = Math.max(1, c * 0.06);
  for (let k = Math.floor(top / gap); k <= Math.ceil(bot / gap); k++) {
    for (let side = 0; side < 2; side++) {
      const h = hash(k * 7.3 + side * 91.1), h2 = hash(k * 3.1 + side * 17.7);
      const R = c * (1.1 + h2 * 1.6) * (1 + fx.beat * 0.12 + fx.punch * 0.25);
      const margin = Math.max(c * 1.2, L.bx);
      const x = side ? L.w - margin * (0.15 + h * 0.85) : margin * (0.15 + h * 0.85);
      const y = L.by + (k * gap + h2 * 1.5 - sr) * c;
      const rot = fx.time * (0.25 + fx.chaos * 1.4) * (h > 0.5 ? 1 : -1) + h * TAU;
      const pi = mod(k + side * 3 + fx.variant, 6);
      ctx.globalAlpha = 1;
      daisy(ctx, x + c * 0.12, y + c * 0.12, R, rot, 8 + (k & 1) * 4, ink[1], ink[1], ink[1], null);
      daisy(ctx, x, y, R, rot, 8 + (k & 1) * 4, pi === 1 ? '#f4e4c1' : ink[pi], ink[(pi + 4) % 6], ink[(pi + 2) % 6], ink[1]);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------- board ----------------
export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), ink = inks(fx.chaos), sr = scrollRows(snap || {});
  ctx.save();
  openEnds(ctx, L, fx, sr, ink);
  panel(ctx, L, fx, sr, ink);
  rails(ctx, L, fx, sr, ink);
  if (snap && snap.alive === false) wallHit(ctx, L, snap);
  if (snap && snap.food && inBoard(snap.food, L)) drawDot(ctx, L, snap.food, fx);
  if (snap && Array.isArray(snap.snake)) drawSnake(ctx, L, snap, fx);
  sparks(ctx, L, fx, ink);
  ctx.restore();
}

function rgba(s, a) {
  const m = s[0] === '#' ? hexRgb(s) : s.match(/\d+/g).map(Number);
  return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
}
// Grid lines of the lane between y1 and y2 (CSS px), plus the scrolling centre dashes.
function gridLines(ctx, L, y1, y2, fx) {
  const c = L.cell;
  ctx.beginPath();
  for (let i = 0; i <= L.cols; i++) { ctx.moveTo(L.bx + i * c, y1); ctx.lineTo(L.bx + i * c, y2); }
  const j0 = Math.ceil((y1 - L.by) / c), j1 = Math.floor((y2 - L.by) / c);
  for (let j = j0; j <= j1; j++) { ctx.moveTo(L.bx, L.by + j * c); ctx.lineTo(L.bx + L.bw, L.by + j * c); }
  ctx.stroke();
}
function centreDashes(ctx, L, y1, y2, sr) {
  const c = L.cell, x = L.bx + (L.cols / 2) * c, w = Math.max(2, c * 0.16);
  const r0 = Math.floor(sr + (y1 - L.by) / c) - 1, r1 = Math.ceil(sr + (y2 - L.by) / c) + 1;
  for (let r = r0; r <= r1; r++) {
    const ya = Math.max(y1, L.by + (r - sr + 0.18) * c), yb = Math.min(y2, L.by + (r - sr + 0.82) * c);
    if (yb > ya) ctx.fillRect(x - w / 2, ya, w, yb - ya);
  }
}
const GRAIN = { c: null, key: '' };
function panel(ctx, L, fx, sr, ink) {
  const c = L.cell;
  ctx.fillStyle = '#f4e4c1';
  ctx.fillRect(L.bx, L.by, L.bw, L.bh);
  // hand-printed paper: faint speckle, world-anchored so it travels with the lane
  if (GRAIN.key !== `${c}`) {
    const g = (GRAIN.c = GRAIN.c || document.createElement('canvas')); g.width = c * 4; g.height = c * 4;
    const x = g.getContext('2d'); x.fillStyle = 'rgba(74,31,61,0.05)';
    for (let i = 0; i < c * 9; i++) { const r = hash(i * 1.7) * 1.3 + 0.3; x.fillRect(hash(i * 3.3) * g.width, hash(i * 5.9) * g.height, r, r); }
    GRAIN.key = `${c}`;
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(L.bx, L.by, L.bw, L.bh); ctx.clip();
  const gy = L.by - mod(sr * c, c * 4);
  for (let y = gy; y < L.by + L.bh; y += c * 4) for (let x = L.bx; x < L.bx + L.bw; x += c * 4) ctx.drawImage(GRAIN.c, x, y);
  // lane markings: centre dashes on the middle grid line, sliding smoothly with the window
  ctx.fillStyle = rgba(ink[4], 0.85);
  centreDashes(ctx, L, L.by, L.by + L.bh, sr);
  ctx.restore();
  // the orange grid, misregistered in a second ink as chaos and the beat rise
  ctx.lineWidth = Math.max(1, c * 0.045);
  const mis = c * (0.04 + fx.chaos * 0.07) * (1 + fx.beat * (1 - fx.rf * 0.8));
  if (fx.chaos > 0.05) {
    ctx.save(); ctx.translate(mis, -mis * 0.6); ctx.strokeStyle = rgba(ink[5], 0.35 + fx.chaos * 0.4);
    gridLines(ctx, L, L.by, L.by + L.bh, fx); ctx.restore();
  }
  ctx.strokeStyle = ink[0];
  gridLines(ctx, L, L.by, L.by + L.bh, fx);
}

const fadeH = (L) => ({ t: Math.max(0, Math.min(L.by, L.cell * 3.4)), b: Math.max(0, Math.min(L.h - L.by - L.bh, L.cell * 3.4)) });
function vgrad(ctx, ya, yb, col, a0) { const g = ctx.createLinearGradient(0, ya, 0, yb); g.addColorStop(0, rgba(col, a0)); g.addColorStop(1, rgba(col, 0)); return g; }
// The open ends: the lane runs on past the board and fades out, with no rail across it.
function openEnds(ctx, L, fx, sr, ink) {
  const c = L.cell, F = fadeH(L);
  for (const end of [-1, 1]) {
    const len = end < 0 ? F.t : F.b;
    if (len < 2) continue;
    const ya = end < 0 ? L.by : L.by + L.bh, yb = ya + end * len, y1 = Math.min(ya, yb), y2 = Math.max(ya, yb);
    ctx.fillStyle = vgrad(ctx, ya, yb, '#f4e4c1', 0.92); ctx.fillRect(L.bx, y1, L.bw, y2 - y1);
    ctx.fillStyle = vgrad(ctx, ya, yb, ink[4], 0.85); centreDashes(ctx, L, y1, y2, sr);
    ctx.lineWidth = Math.max(1, c * 0.045); ctx.strokeStyle = vgrad(ctx, ya, yb, ink[0], 1);
    gridLines(ctx, L, y1, y2, fx);
    // chevrons that keep marching outward: "this goes on"
    const ph = (fx.time * (0.9 + fx.chaos * 1.5)) % 1;
    for (const col of [3, L.cols / 2, L.cols - 3]) {
      const big = col === L.cols / 2, s = c * (big ? 0.62 : 0.42);
      for (let k = 0; k < 3; k++) {
        const d = (k + ph) * c * 0.95 + c * 0.35;
        if (d > len - s * 0.4) continue;
        const cx = L.bx + col * c, cy = ya + end * d;
        ctx.globalAlpha = Math.max(0, 1 - d / len) * (big ? 1 : 0.75);
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - end * s * 0.15); ctx.lineTo(cx, cy + end * s * 0.6); ctx.lineTo(cx + s, cy - end * s * 0.15);
        ctx.lineTo(cx + s, cy - end * s * 0.6); ctx.lineTo(cx, cy + end * s * 0.05); ctx.lineTo(cx - s, cy - end * s * 0.6);
        ctx.closePath();
        ctx.fillStyle = ink[(k + fx.variant + (big ? 5 : 2)) % 6 === 1 ? 0 : (k + fx.variant + (big ? 5 : 2)) % 6]; ctx.fill();
        ctx.lineWidth = Math.max(1, c * 0.05); ctx.strokeStyle = ink[1]; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
// The lethal side edges: chunky printed rails with bolts that scroll with the lane.
function rails(ctx, L, fx, sr, ink) {
  const c = L.cell, rw = Math.max(4, Math.round(c * 0.42)), F = fadeH(L);
  const hot = fx.rf ? 0 : fx.punch;
  for (const side of [0, 1]) {
    const x = side ? L.bx + L.bw : L.bx - rw;
    for (const [ya, yb, a] of [[L.by, L.by + L.bh, 1], [L.by, L.by - F.t, 0], [L.by + L.bh, L.by + L.bh + F.b, 0]]) {
      const y1 = Math.min(ya, yb), y2 = Math.max(ya, yb);
      if (y2 - y1 < 1) continue;
      const fill = (col) => (a ? col : vgrad(ctx, ya, yb, col, 1));
      ctx.fillStyle = fill(ink[1]); ctx.fillRect(x, y1, rw, y2 - y1);
      ctx.fillStyle = fill(hot > 0.3 ? '#fff6e0' : ink[fx.beatIndex % 2 && fx.chaos > 0.5 ? 5 : 0]);
      ctx.fillRect(x + rw * 0.3, y1, rw * 0.4, y2 - y1);
      // bolts, one per lane row
      const r0 = Math.floor(sr + (y1 - L.by) / c), r1 = Math.ceil(sr + (y2 - L.by) / c);
      for (let r = r0; r <= r1; r++) {
        const by = L.by + (r - sr + 0.5) * c;
        if (by < y1 || by > y2) continue;
        ctx.globalAlpha = a ? 1 : Math.max(0, 1 - Math.abs(by - ya) / Math.max(1, y2 - y1));
        ctx.fillStyle = '#f4e4c1'; ctx.beginPath(); ctx.arc(x + rw / 2, by, rw * 0.22, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

// A wall death leaves a still, dented red star on the rail beside the head (no flashing).
function wallHit(ctx, L, snap) {
  const d = snap.death, h = snap.snake && snap.snake[0];
  if (!d || d.reason !== 'wall' || !isCell(h)) return;
  const cell = isCell(d.cell) ? d.cell : h;
  if (cell.x >= 0 && cell.x < L.cols) return;
  const c = L.cell, rw = Math.max(4, Math.round(c * 0.42));
  const x = cell.x < 0 ? L.bx - rw / 2 : L.bx + L.bw + rw / 2, y = L.by + (Math.max(0, Math.min(L.rows - 1, h.y)) + 0.5) * c, R = c * 0.42;
  ctx.beginPath();
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, r = k % 2 ? R * 0.45 : R; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fillStyle = '#c8321f'; ctx.fill(); ctx.lineWidth = Math.max(1, c * 0.05); ctx.strokeStyle = '#2a1020'; ctx.stroke();
}

// Bite burst on the board: four-petal sparks that run outward along the grid lines from the
// bitten cell's corners. They stay on the lines, so cell centres stay clean.
function sparks(ctx, L, fx, ink) {
  const b = fx.bite;
  if (!b || fx.rf || !(fx.biteAge < 520) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
  const c = L.cell, t = Math.max(0, fx.biteAge) / 520, r = c * 0.2 * (1 - t * 0.5);
  ctx.save();
  ctx.beginPath(); ctx.rect(L.bx, L.by, L.bw, L.bh); ctx.clip();
  ctx.globalAlpha = 1 - t * t;
  let n = 0;
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    for (const [dx, dy] of [[ox ? 1 : -1, 0], [0, oy ? 1 : -1]]) {
      for (const lag of [0, 0.7]) {
        const d = Math.max(0, t * 6 - lag);
        const x = L.bx + (b.x + ox + dx * d) * c, y = L.by + (b.y + oy + dy * d) * c;
        ctx.save(); ctx.translate(x, y); ctx.rotate(fx.time * 4 + n);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.ellipse(r * 0.55, 0, r * 0.55, r * 0.28, 0, 0, TAU); ctx.closePath(); }
        ctx.fillStyle = ink[[5, 4, 2, 0][n++ % 4]]; ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

// The dot: a spinning screen-print swirl lollipop, round where the worm is square.
function drawDot(ctx, L, f, fx) {
  const c = L.cell, cx = L.bx + (f.x + 0.5) * c, cy = L.by + (f.y + 0.5) * c, ink = inks(fx.chaos);
  const R = c * (0.4 + fx.beat * 0.05), arms = 5, spin = fx.time * (1.2 + fx.chaos * 3);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx + c * 0.045, cy + c * 0.045, R, 0, TAU); ctx.fillStyle = ink[1]; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = '#f4e4c1'; ctx.fill(); ctx.clip();
  for (let k = 0; k < arms; k++) {                     // curved swirl arms
    const a0 = spin + (k / arms) * TAU;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    for (let t = 0; t <= 1.001; t += 0.125) { const a = a0 + t * 2.4, r = R * 1.1 * t; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    for (let t = 1; t >= -0.001; t -= 0.125) { const a = a0 + 0.75 + t * 2.4, r = R * 1.1 * t; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.fillStyle = ink[[0, 5, 2, 4, 3][(k + fx.variant) % 5]]; ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.lineWidth = Math.max(1.2, c * 0.07); ctx.strokeStyle = ink[1]; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, TAU); ctx.fillStyle = ink[1]; ctx.fill();
}

const DEAD = ['#a0826a', '#5a4448', '#8a8c7a', '#a49470', '#b29c7a', '#a88480'];
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// The floral worm: printed segments with a daisy in each, joined by plum collars; a big round head.
function drawSnake(ctx, L, snap, fx) {
  const s = snap.snake, c = L.cell, dead = snap.alive === false, ink = dead ? DEAD : inks(fx.chaos);
  const n = s.length, sh = Math.max(1, c * 0.045), lw = Math.max(1, c * 0.06);
  ctx.lineJoin = 'round';
  // collars first, only between joined neighbours (LEVELS_PLAN 3.3)
  for (let i = 0; i < n - 1; i++) {
    if (!joined(snap, i) || !inBoard(s[i], L) || !inBoard(s[i + 1], L)) continue;
    const a = s[i], b = s[i + 1], mx = L.bx + ((a.x + b.x) / 2 + 0.5) * c, my = L.by + ((a.y + b.y) / 2 + 0.5) * c;
    const horiz = a.y === b.y, lw2 = c * 0.5, wd = c * 0.56;
    ctx.fillStyle = ink[1];
    if (horiz) ctx.fillRect(mx - lw2 / 2 + sh, my - wd / 2 + sh, lw2, wd); else ctx.fillRect(mx - wd / 2 + sh, my - lw2 / 2 + sh, wd, lw2);
    ctx.fillStyle = ink[(i + fx.variant + 4) % 6 === 1 ? 4 : (i + fx.variant + 4) % 6];
    if (horiz) ctx.fillRect(mx - lw2 / 2, my - wd / 2, lw2, wd); else ctx.fillRect(mx - wd / 2, my - lw2 / 2, wd, lw2);
    ctx.strokeStyle = ink[1]; ctx.lineWidth = lw;
    if (horiz) ctx.strokeRect(mx - lw2 / 2, my - wd / 2, lw2, wd); else ctx.strokeRect(mx - wd / 2, my - lw2 / 2, wd, lw2);
  }
  for (let i = n - 1; i >= 1; i--) {
    const a = s[i];
    if (!inBoard(a, L)) continue;
    const taper = i >= n - 2 && n > 3 ? (i === n - 1 ? 0.8 : 0.9) : 1;
    const m = c * (0.07 + (1 - taper) * 0.5), x = L.bx + a.x * c + m, y = L.by + a.y * c + m, w = c - 2 * m;
    const k = (i + fx.variant) % 6, body = k === 1 ? 2 : k, ring = (k + 3) % 6 === 1 ? 4 : (k + 3) % 6;
    rrect(ctx, x + sh, y + sh, w, w, w * 0.32); ctx.fillStyle = ink[1]; ctx.fill();          // misregistered shadow
    rrect(ctx, x, y, w, w, w * 0.32); ctx.fillStyle = ink[body]; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = ink[1]; ctx.stroke();
    ctx.beginPath(); ctx.arc(x + w / 2, y + w / 2, w * 0.36, 0, TAU); ctx.fillStyle = ink[ring]; ctx.fill(); ctx.stroke();
    const rot = dead ? 0.3 : (i % 2 ? 1 : -1) * fx.time * (0.6 + fx.chaos * 2.4);
    ctx.lineWidth = lw * 0.6;
    daisy(ctx, x + w / 2, y + w / 2, w * 0.33, rot, 6, dead ? '#d8ccb4' : '#fffaf0', ring === 4 ? ink[0] : ink[4], ink[1], ink[1]);
  }
  if (n && inBoard(s[0], L)) drawHead(ctx, L, snap, fx, ink, dead);
}
function headDir(snap) {
  const s = snap.snake;
  if (s.length > 1 && joined(snap, 0)) return [s[0].x - s[1].x, s[0].y - s[1].y];
  return DIRS[snap.dir] || DIRS.up;
}
function drawHead(ctx, L, snap, fx, ink, dead) {
  const c = L.cell, h = snap.snake[0], cx = L.bx + (h.x + 0.5) * c, cy = L.by + (h.y + 0.5) * c;
  const [dx, dy] = headDir(snap), px = -dy, py = dx, sh = Math.max(1, c * 0.07), lw = Math.max(1, c * 0.06);
  ctx.save();
  // petal ruff around the head: a flower that is also a face
  const R = c * (0.55 + (dead ? 0 : fx.beat * 0.04));
  daisy(ctx, cx + sh, cy + sh, R, fx.time * (dead ? 0 : 0.8), 10, ink[1], ink[1], ink[1], null);
  daisy(ctx, cx, cy, R, fx.time * (dead ? 0 : 0.8), 10, ink[(fx.variant + 5) % 6 === 1 ? 0 : (fx.variant + 5) % 6], ink[2], ink[2], ink[1]);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, TAU); ctx.fillStyle = ink[2]; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = ink[1]; ctx.stroke();
  // tongue: a forked flick out of the front, never further than 0.3 cell past the edge
  if (!dead) {
    const t = c * (0.38 + 0.12 * (fx.beat > 0.5 ? 1 : 0)), tx = cx + dx * (c * 0.36 + t), ty = cy + dy * (c * 0.36 + t);
    ctx.strokeStyle = '#c8321f'; ctx.lineWidth = Math.max(1.2, c * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + dx * c * 0.36, cy + dy * c * 0.36); ctx.lineTo(tx, ty);
    ctx.moveTo(tx, ty); ctx.lineTo(tx + (dx + px) * c * 0.1, ty + (dy + py) * c * 0.1);
    ctx.moveTo(tx, ty); ctx.lineTo(tx + (dx - px) * c * 0.1, ty + (dy - py) * c * 0.1); ctx.stroke();
  }
  // googly eyes looking ahead
  for (const sgn of [-1, 1]) {
    const ex = cx + dx * c * 0.1 + px * sgn * c * 0.16, ey = cy + dy * c * 0.1 + py * sgn * c * 0.16, er = c * 0.12;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = ink[1]; ctx.stroke();
    if (dead) {
      ctx.beginPath(); ctx.moveTo(ex - er * 0.6, ey - er * 0.6); ctx.lineTo(ex + er * 0.6, ey + er * 0.6);
      ctx.moveTo(ex + er * 0.6, ey - er * 0.6); ctx.lineTo(ex - er * 0.6, ey + er * 0.6); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(ex + dx * er * 0.4, ey + dy * er * 0.4, er * 0.55, 0, TAU); ctx.fillStyle = ink[1]; ctx.fill();
    }
  }
  // waiting for the first key: a dotted halo that turns on the beat
  if (snap.waiting) {
    ctx.setLineDash([c * 0.12, c * 0.1]); ctx.lineDashOffset = -fx.time * c * 0.6;
    ctx.lineWidth = Math.max(1.5, c * 0.07); ctx.strokeStyle = ink[5];
    ctx.beginPath(); ctx.arc(cx, cy, c * (0.72 + fx.beat * 0.05), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// ---------------- life icon: a flower disc ----------------
export function life(ctx, x, y, size, filled, fx) {
  const cx = x + size / 2, cy = y + size / 2, R = size * 0.46, pr = R * 0.34, k = 8;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < k; i++) {
    const a = (i / k) * TAU, px = cx + Math.cos(a) * (R - pr), py = cy + Math.sin(a) * (R - pr);
    ctx.moveTo(px + pr, py); ctx.arc(px, py, pr, 0, TAU);
  }
  ctx.lineWidth = Math.max(1, size * 0.06); ctx.strokeStyle = C.plum;
  if (filled) {
    ctx.fillStyle = C.orange; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, TAU); ctx.fillStyle = C.mustard; ctx.fill(); ctx.stroke();
  } else {
    ctx.globalAlpha = 0.8; ctx.stroke();
  }
  ctx.restore();
}
