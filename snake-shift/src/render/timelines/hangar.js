// SNAKE//SHIFT — universe `hangar`: RED IRON HANGAR, 1957. Flat Canvas 2D look (stream hangar).
// Contract: BUILD_PLAN.md 15.3 (meta, scenery, board) and LEVELS_PLAN.md 3.3, 4.3, 6.
// An aged drafting sheet: meshing gear drawings, a crane hook on a truss, an invented boxy tank in
// elevation, lamps, light shafts, sparks and inspection stamps in the margins (wild, on the beat).
// The board is a cream plate inside a red riveted iron band (the lethal edge); the snake is riveted
// brass plates with an arrow-nosed head, the dot a round red enamel rivet button. Chaos 0 = sepia ink
// on paper; chaos 1 = the same sheet burnt to night: cyan ink, red lamps, neon edges.
// Every cell is drawn where it is; hinges join only adjacent cells that `snap.breaks` does not split.
// Extra export: life(ctx, x, y, size, filled, fx) — a rivet, (x, y) = top-left of a size x size slot.

const TAU = Math.PI * 2;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const mod = (a, n) => ((a % n) + n) % n;
const frac = (x) => x - Math.floor(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const isCell = (c) => !!c && Number.isFinite(c.x) && Number.isFinite(c.y);
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
// own style -> neon, eased so low chaos stays sepia
const tone = (ch) => { const x = clamp((num(ch) - 0.12) / 0.78, 0, 1); return x * x * (3 - 2 * x); };

function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: clamp(num(fx.beat), 0, 1), beatIndex: num(fx.beatIndex) | 0, chaos: clamp(num(fx.chaos), 0, 1),
    punch: clamp(num(fx.punch), 0, 1), variant: num(fx.variant) | 0, bite: isCell(fx.bite) ? fx.bite : null,
    biteAge: Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity, rf: !!fx.reducedFlash, rm: !!fx.reducedMotion,
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
  g.clearRect(0, 0, w, h);
  paint(g);
  slot.c = c; slot.key = key;
  return c;
}
const blit = (ctx, c, x, y, dpr) => ctx.drawImage(c, x, y, c.width / dpr, c.height / dpr);
const adjacent = (a, b) => isCell(a) && isCell(b) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const breakSet = (snap) => new Set(Array.isArray(snap.breaks) ? snap.breaks : []);
function headDir(snap, brk) {
  const s = snap.snake;
  if (s && s.length > 1 && !brk.has(0) && adjacent(s[0], s[1])) return [s[0].x - s[1].x, s[0].y - s[1].y];
  return DIRS[snap.dir] || DIRS[snap.heading] || [1, 0];
}
function circ(g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }

export const meta = {
  id: 'hangar', name: 'RED IRON HANGAR', year: '1957', kind: '2d',
  luma: 0.55, veil: '#b89a68', weight: 3,
  hud: { fg: '#2a1a0a', bg: 'rgba(222,203,160,0.9)', accent: '#b3261a', panelFg: '#f3e6c4', panelBg: 'rgba(58,30,16,0.92)' },
};

// ───────────────────────────── palettes ─────────────────────────────
const OWN = {
  sheet: [214, 194, 150], edge: [112, 76, 38], stain: [150, 104, 52],
  panel: [234, 221, 188], grid: [96, 78, 52], major: [128, 64, 40],
  iron: [128, 30, 20], ironHi: [196, 78, 52], ironLo: [66, 14, 8], rivet: [176, 52, 34],
  lamp: [255, 176, 70], shaft: [255, 214, 150], spark: [255, 196, 96], stamp: [178, 32, 24],
};
const NEON = {
  sheet: [8, 11, 26], edge: [0, 0, 6], stain: [20, 50, 110],
  panel: [9, 15, 30], grid: [30, 190, 255], major: [255, 43, 160],
  iron: [214, 14, 42], ironHi: [255, 126, 146], ironLo: [80, 0, 14], rivet: [255, 60, 90],
  lamp: [255, 30, 52], shaft: [40, 220, 255], spark: [130, 255, 255], stamp: [255, 43, 214],
};
const INK_OWN = [[44, 66, 104], [92, 58, 28], [124, 42, 30], [34, 86, 82]];   // blue, sepia, red-brown, teal
const INK_NEON = [[25, 230, 255], [255, 43, 214], [190, 255, 70], [255, 176, 40]];
const STEP = [[25, 230, 255], [255, 43, 214], [255, 30, 52], [255, 196, 70]];
const BRASS = { body: '#b08a3e', hi: '#e8c87c', lo: '#6b4f1e', rim: '#3a290c', rivet: '#7d5c22', rivetHi: '#fff0b8', head: '#c99b45', link: '#4a3a24' };
// dead: rusted iron, a hue that stays clear of the plate at every chaos level
const IRON = { body: '#6e3a22', hi: '#8e5536', lo: '#4a2414', rim: '#1d0f08', rivet: '#3a1c0e', rivetHi: '#a0644a', head: '#7a4428', link: '#2c1a10' };

const C = { sheet: {}, board: {}, gears: [{}, {}, {}, {}] };
const margin = (L) => Math.max(6, Math.round(L.cell * 0.42));

// ───────────────────────────── layout of the margins ─────────────────────────────
// Gears are pitch circles of one common tooth pitch so meshing pairs really mesh.
function zones(L) {
  const { w, h, bx, by, bw, bh, cell } = L;
  const lw = bx, rw = w - bx - bw, th = by, bh2 = h - by - bh;
  const p = Math.max(6, cell * 0.36);
  const gear = (x, y, R) => { const N = Math.max(8, Math.round((TAU * Math.max(8, R)) / p)); return { x, y, N, R: (N * p) / TAU }; };
  const child = (g, k, a) => { const c = gear(0, 0, g.R * k), d = g.R + c.R; c.x = g.x + Math.cos(a) * d; c.y = g.y + Math.sin(a) * d; c.parent = g; c.a = a; return c; };
  const Z = { p, side: Math.min(lw, rw) > Math.max(110, w * 0.12), gears: [], hook: null, tank: null, title: null, stamps: [] };
  if (Z.side) {
    const g1 = gear(lw * 0.46, by + bh * 0.74, clamp(Math.min(lw * 0.34, bh * 0.2), 20, 150));
    const g3 = gear(bx + bw + rw * 0.56, by + bh * 0.2, clamp(Math.min(rw * 0.28, bh * 0.16), 18, 130));
    Z.gears.push(g1, child(g1, 0.56, -1.05), g3, child(g3, 0.5, 2.25));
    Z.hook = { x: lw * 0.6, len: clamp(by + bh * 0.36, 40, h * 0.5), span: lw * 0.18 };
    Z.tank = { x: bx + bw + rw * 0.1, y: by + bh * 0.66, w: Math.min(rw * 0.8, 340) };
    const tw = Math.min(rw * 0.86, 240);
    Z.title = { x: w - tw - 22, y: h - 22 - clamp(h * 0.1, 40, 80), w: tw, h: clamp(h * 0.1, 40, 80) };
    Z.stamps = [[lw * 0.5, by + bh * 0.34], [bx + bw + rw * 0.5, by + bh * 0.42], [lw * 0.42, by + bh * 0.5]];
  } else {
    const g1 = gear(w * 0.17, th * 0.52, clamp(Math.min(th * 0.3, w * 0.15), 12, 120));
    const g2 = child(g1, 0.6, -0.25);
    Z.gears.push(g1, g2, child(g2, 0.75, 0.45));
    Z.hook = { x: w * 0.84, len: clamp(th * 0.72, 16, Math.max(16, th - 16)), span: w * 0.06 };
    if (bh2 > 64) Z.tank = { x: w * 0.06, y: by + bh + bh2 * 0.66, w: w * 0.54 };
    const tw = Math.min(w * 0.32, 210), tH = clamp(bh2 * 0.42, 30, 78);
    if (bh2 > tH + 34) Z.title = { x: w - tw - 18, y: h - tH - 22, w: tw, h: tH };
    Z.stamps = [[w * 0.55, th * 0.5], [w * 0.5, by + bh + bh2 * 0.4], [w * 0.62, th * 0.62]];
  }
  return Z;
}

// ───────────────────────────── scenery ─────────────────────────────
export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), t = tone(fx.chaos), tq = Math.round(t * 8) / 8;
  const vi = mod(fx.variant, 4), Z = zones(L), pad = 18;
  ctx.save();
  // a bite jolts the whole sheet; the board, drawn afterwards, stays put
  if (!fx.rm && fx.punch > 0.02) {
    const a = hash(fx.variant * 3.1 + 0.7) * TAU, k = fx.punch * fx.punch * Math.min(12, L.cell * 0.35);
    ctx.translate(Math.cos(a) * k, Math.sin(a) * k);
  }
  const key = [L.w, L.h, L.cell, L.bx, L.by, dpr, tq, vi].join();
  blit(ctx, layer(C.sheet, key, L.w + 2 * pad, L.h + 2 * pad, dpr, (g) => { g.translate(pad, pad); paintSheet(g, L, Z, tq, vi, pad); }), -pad, -pad, dpr);
  drawShafts(ctx, L, fx, t);
  drawGears(ctx, Z, fx, t, tq, vi, dpr);
  drawHook(ctx, L, Z, fx, t);
  drawSparks(ctx, Z, fx, t);
  drawLamps(ctx, L, fx, t);
  drawShock(ctx, L, fx, t);
  drawStamp(ctx, L, Z, fx, t);
  drawNeon(ctx, L, fx, t);
  ctx.restore();
}

function paintSheet(g, L, Z, t, vi, pad) {
  const { w, h, cell, bx, by, bw, bh } = L;
  const paper = mix(OWN.sheet, NEON.sheet, t), edge = mix(OWN.edge, NEON.edge, t), stain = mix(OWN.stain, NEON.stain, t);
  const ink = mix(INK_OWN[vi], INK_NEON[vi], t), big = Math.max(w, h);
  g.fillStyle = css(paper); g.fillRect(-pad, -pad, w + 2 * pad, h + 2 * pad);
  // fibres and specks
  for (let i = 0; i < 320; i++) { g.fillStyle = css(edge, 0.05 + 0.09 * hash(i * 1.7)); g.fillRect(hash(i * 3.3) * w, hash(i * 5.1) * h, 1 + hash(i) * 2.5, 1); }
  // water stains and a mug ring
  for (let i = 0; i < 9; i++) {
    const x = hash(i * 11.1 + 2) * w, y = hash(i * 7.7 + 1) * h, r = (0.05 + 0.12 * hash(i * 2.9)) * big;
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, css(stain, 0.02)); gr.addColorStop(0.82, css(stain, 0.1 + 0.05 * hash(i))); gr.addColorStop(1, css(stain, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.strokeStyle = css(stain, 0.22); g.lineWidth = 3;
  g.beginPath(); g.arc(w * 0.88, h * 0.16, Math.min(46, big * 0.04), 0.3, TAU - 0.6); g.stroke();
  // fold creases
  g.lineWidth = 1;
  for (const [x0, y0, x1, y1] of [[w * 0.34, 0, w * 0.35, h], [0, h * 0.52, w, h * 0.51]]) {
    g.strokeStyle = css([255, 250, 235], 0.16 * (1 - t)); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = css(edge, 0.14); g.beginPath(); g.moveTo(x0 + 1, y0 + 1); g.lineTo(x1 + 1, y1 + 1); g.stroke();
  }
  // drafting grid aligned to the board
  const s = cell * 2;
  g.strokeStyle = css(ink, 0.05 + 0.1 * t); g.beginPath();
  for (let x = bx % s; x < w; x += s) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h); }
  for (let y = by % s; y < h; y += s) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); }
  g.stroke();
  // burnt, aged edges
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  vg.addColorStop(0, css(edge, 0)); vg.addColorStop(1, css(edge, 0.6));
  g.fillStyle = vg; g.fillRect(-pad, -pad, w + 2 * pad, h + 2 * pad);
  // sheet frame with zone letters and registration marks
  g.strokeStyle = css(ink, 0.75); g.lineWidth = 1.6; g.strokeRect(12.5, 12.5, w - 25, h - 25);
  g.lineWidth = 0.8; g.strokeRect(18.5, 18.5, w - 37, h - 37);
  g.fillStyle = css(ink, 0.7); g.font = '9px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const nz = Math.max(2, Math.round(w / 160));
  for (let i = 0; i < nz; i++) { const x = 18 + ((i + 0.5) * (w - 36)) / nz; g.fillText('ABCDEFGHJK'[i % 10], x, 15.5); g.fillText('ABCDEFGHJK'[i % 10], x, h - 15.5); }
  const ny = Math.max(2, Math.round(h / 160));
  for (let i = 0; i < ny; i++) { const y = 18 + ((i + 0.5) * (h - 36)) / ny; g.fillText(String(i + 1), 15.5, y); g.fillText(String(i + 1), w - 15.5, y); }
  g.beginPath();
  for (let i = 1; i < nz; i++) { const x = Math.round(18 + (i * (w - 36)) / nz) + 0.5; g.moveTo(x, 12.5); g.lineTo(x, 18.5); g.moveTo(x, h - 12.5); g.lineTo(x, h - 18.5); }
  for (let i = 1; i < ny; i++) { const y = Math.round(18 + (i * (h - 36)) / ny) + 0.5; g.moveTo(12.5, y); g.lineTo(18.5, y); g.moveTo(w - 12.5, y); g.lineTo(w - 18.5, y); }
  g.stroke();
  for (const [x, y] of [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]]) {
    g.beginPath(); g.arc(x, y, 6, 0, TAU); g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.moveTo(x, y - 10); g.lineTo(x, y + 10); g.stroke();
  }
  // crane truss along the top of the sheet
  const ty = 24, tg = clamp(h * 0.03, 8, 18);
  g.strokeStyle = css(ink, 0.6); g.lineWidth = 1.2; g.beginPath();
  g.moveTo(22, ty); g.lineTo(w - 22, ty); g.moveTo(22, ty + tg); g.lineTo(w - 22, ty + tg);
  for (let x = 22, k = 0; x < w - 22; x += tg, k++) { g.moveTo(x, k & 1 ? ty : ty + tg); g.lineTo(Math.min(w - 22, x + tg), k & 1 ? ty + tg : ty); }
  g.stroke();
  // dimension line over the board
  const dy = by - margin(L) - 12;
  if (dy > ty + tg + 10) dimension(g, bx, dy, bx + bw, dy, '16 × 16', ink, 10);
  if (Z.side) dimension(g, bx + bw + margin(L) + 12, by, bx + bw + margin(L) + 12, by + bh, '16', ink, 10);
  if (Z.tank) tankDrawing(g, Z.tank.x, Z.tank.y, Z.tank.w, ink, t);
  if (Z.title) titleBlock(g, Z.title, ink, paper);
}

function arrow(g, x, y, a, s) { g.moveTo(x, y); g.lineTo(x - Math.cos(a - 0.35) * s, y - Math.sin(a - 0.35) * s); g.moveTo(x, y); g.lineTo(x - Math.cos(a + 0.35) * s, y - Math.sin(a + 0.35) * s); }
function dimension(g, x0, y0, x1, y1, label, ink, fs) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.save(); g.strokeStyle = css(ink, 0.7); g.lineWidth = 0.9; g.beginPath();
  g.moveTo(x0, y0); g.lineTo(x1, y1); arrow(g, x1, y1, a, 7); arrow(g, x0, y0, a + Math.PI, 7);
  const nx = -Math.sin(a) * 6, ny = Math.cos(a) * 6;
  g.moveTo(x0 - nx, y0 - ny); g.lineTo(x0 + nx, y0 + ny); g.moveTo(x1 - nx, y1 - ny); g.lineTo(x1 + nx, y1 + ny);
  g.stroke();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2); g.rotate(Math.abs(a) > 1 ? -Math.PI / 2 : 0);
  g.font = `${fs}px "Courier New", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(label).width + 8;
  g.globalCompositeOperation = 'destination-out'; g.fillRect(-tw / 2, -fs * 0.6, tw, fs * 1.2); g.globalCompositeOperation = 'source-over';
  g.fillStyle = css(ink, 0.85); g.fillText(label, 0, 0);
  g.restore();
}

// An invented, boxy tracked machine in side elevation: no markings of any kind.
function tankDrawing(g, x0, yG, W, ink, t) {
  const u = W / 104;
  if (u < 1.2) return;
  g.save(); g.strokeStyle = css(ink, 0.85); g.lineWidth = Math.max(1, u * 0.45); g.lineJoin = 'round';
  const hull = [[2, -14], [2, -25], [9, -30], [80, -30], [97, -21], [95, -14]];
  const turret = [[30, -30], [33, -41], [63, -41], [67, -30]];
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x0 + x * u, yG + y * u) : g.moveTo(x0 + x * u, yG + y * u))); g.closePath(); };
  poly(hull); g.fillStyle = css(ink, 0.07 + 0.08 * t); g.fill(); g.stroke();
  // hatching on the hull side
  g.save(); poly(hull); g.clip(); g.beginPath();
  for (let x = -40; x < 110; x += 4) { g.moveTo(x0 + x * u, yG - 14 * u); g.lineTo(x0 + (x + 16) * u, yG - 30 * u); }
  g.globalAlpha = 0.25; g.lineWidth = 0.7; g.stroke(); g.restore();
  poly(turret); g.fillStyle = css(ink, 0.1 + 0.08 * t); g.fill(); g.stroke();
  g.beginPath();
  g.rect(x0 + 41 * u, yG - 44 * u, 10 * u, 3 * u);                         // hatch
  g.rect(x0 + 67 * u, yG - 37.5 * u, 33 * u, 2.6 * u);                     // barrel
  g.rect(x0 + 99 * u, yG - 38.6 * u, 5 * u, 4.8 * u);                      // muzzle block
  g.rect(x0 + 14 * u, yG - 33 * u, 12 * u, 3 * u);                         // engine deck grille
  g.stroke();
  // track run, wheels, rollers
  g.beginPath(); const r = 7 * u, xa = x0 + 4 * u, xb = x0 + 93 * u, ya = yG - 14 * u;
  g.moveTo(xa + r, ya); g.lineTo(xb - r, ya); g.arc(xb - r, ya + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(xa + r, yG); g.arc(xa + r, ya + r, r, Math.PI / 2, Math.PI * 1.5); g.stroke();
  g.beginPath();
  for (let k = 0; k < 6; k++) circ(g, x0 + (17 + k * 13.2) * u, yG - 6.6 * u, 5.2 * u);
  for (let k = 0; k < 6; k++) circ(g, x0 + (17 + k * 13.2) * u, yG - 6.6 * u, 1.4 * u);
  for (let k = 0; k < 3; k++) circ(g, x0 + (28 + k * 24) * u, yG - 15.6 * u, 1.6 * u);
  g.stroke();
  // centre line (dash-dot) and dimensions
  g.setLineDash([10, 3, 2, 3]); g.lineWidth = 0.7; g.beginPath(); g.moveTo(x0 - 4 * u, yG - 6.6 * u); g.lineTo(x0 + 100 * u, yG - 6.6 * u); g.stroke(); g.setLineDash([]);
  g.restore();
  dimension(g, x0 + 4 * u, yG + 7 * u, x0 + 93 * u, yG + 7 * u, '6 400', ink, Math.max(8, Math.min(11, u * 3.4)));
  dimension(g, x0 - 5 * u, yG, x0 - 5 * u, yG - 41 * u, '2 350', ink, Math.max(8, Math.min(11, u * 3.4)));
  g.save(); g.fillStyle = css(ink, 0.8); g.font = `${Math.round(Math.max(8, u * 3.4))}px "Courier New", monospace`; g.textAlign = 'left';
  g.fillText('ELEVATION  A', x0, yG + 20 * u); g.restore();
}

function titleBlock(g, T, ink, paper) {
  g.save();
  g.fillStyle = css(paper, 0.85); g.fillRect(T.x, T.y, T.w, T.h);
  g.strokeStyle = css(ink, 0.85); g.lineWidth = 1.4; g.strokeRect(T.x + 0.5, T.y + 0.5, T.w, T.h);
  g.lineWidth = 0.8; g.beginPath();
  g.moveTo(T.x, T.y + T.h * 0.45); g.lineTo(T.x + T.w, T.y + T.h * 0.45);
  g.moveTo(T.x, T.y + T.h * 0.72); g.lineTo(T.x + T.w, T.y + T.h * 0.72);
  g.moveTo(T.x + T.w * 0.55, T.y + T.h * 0.45); g.lineTo(T.x + T.w * 0.55, T.y + T.h);
  g.stroke();
  g.fillStyle = css(ink, 0.95); g.textBaseline = 'middle'; g.textAlign = 'left';
  const fs = Math.max(7, Math.min(16, T.h * 0.26));
  g.font = `bold ${fs}px "Courier New", monospace`;
  g.fillText('RED IRON HANGAR', T.x + 6, T.y + T.h * 0.23, T.w - 12);
  g.font = `${Math.max(7, fs * 0.62)}px "Courier New", monospace`;
  g.fillText('SHEET 16×16', T.x + 6, T.y + T.h * 0.59, T.w * 0.5);
  g.fillText('YEAR 1957', T.x + T.w * 0.55 + 5, T.y + T.h * 0.59, T.w * 0.42);
  g.fillText('SCALE 1:16', T.x + 6, T.y + T.h * 0.86, T.w * 0.5);
  g.fillText('DRG Nº 07', T.x + T.w * 0.55 + 5, T.y + T.h * 0.86, T.w * 0.42);
  g.restore();
}

// Light shafts from high windows: sweeping bands, brighter on the beat.
function drawShafts(ctx, L, fx, t) {
  const { w, h } = L, col = mix(OWN.shaft, NEON.shaft, t);
  const k = (0.08 + 0.1 * fx.beat + 0.22 * fx.punch) * (1 + 0.6 * fx.chaos);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const x0 = (frac(fx.time * (0.012 + 0.03 * fx.chaos) + i * 0.37) * 1.6 - 0.2) * w, ws = w * (0.05 + 0.05 * hash(i + 4)), lean = h * 0.5;
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, css(col, k)); gr.addColorStop(1, css(col, 0));
    ctx.fillStyle = gr; ctx.beginPath();
    ctx.moveTo(x0, 0); ctx.lineTo(x0 + ws, 0); ctx.lineTo(x0 + ws - lean, h); ctx.lineTo(x0 - lean - ws * 0.6, h); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Gear sprites (cached per slot) turned by the clock plus a ratchet kick on every beat.
function gearSprite(slot, gr, p, t, tq, vi, dpr) {
  const out = gr.R + p * 0.45, S = Math.ceil(2 * out + 16);
  return layer(slot, [gr.N, p.toFixed(2), tq, vi, dpr].join(), S, S, dpr, (g) => {
    const ink = mix(INK_OWN[vi], INK_NEON[vi], tq), c = S / 2, R = gr.R, N = gr.N;
    const tip = R + p * 0.32, root = R - p * 0.38, step = TAU / N;
    g.translate(c, c);
    g.beginPath();
    for (let k = 0; k < N; k++) {
      const a = k * step;
      g.lineTo(Math.cos(a - step * 0.3) * root, Math.sin(a - step * 0.3) * root);
      g.lineTo(Math.cos(a - step * 0.17) * tip, Math.sin(a - step * 0.17) * tip);
      g.lineTo(Math.cos(a + step * 0.17) * tip, Math.sin(a + step * 0.17) * tip);
      g.lineTo(Math.cos(a + step * 0.3) * root, Math.sin(a + step * 0.3) * root);
    }
    g.closePath();
    const holes = new Path2D(), nh = R > 30 ? 5 : 0;
    for (let k = 0; k < nh; k++) { const a = (k * TAU) / nh; holes.moveTo(Math.cos(a) * R * 0.56 + R * 0.17, Math.sin(a) * R * 0.56); holes.arc(Math.cos(a) * R * 0.56, Math.sin(a) * R * 0.56, R * 0.17, 0, TAU); }
    g.fillStyle = css(ink, 0.08 + 0.2 * tq); g.fill();
    if (tq > 0) { g.save(); g.strokeStyle = css(ink, 0.22 * tq); g.lineWidth = 6; g.stroke(); g.restore(); }
    g.strokeStyle = css(ink, 0.9); g.lineWidth = Math.max(1, p * 0.12); g.stroke();
    g.stroke(holes);
    g.beginPath(); circ(g, 0, 0, R * 0.24); circ(g, 0, 0, R * 0.1); g.stroke();
    g.fillStyle = css(ink, 0.9); g.fillRect(-R * 0.03, -R * 0.13, R * 0.06, R * 0.05);   // keyway
    g.setLineDash([3, 3]); g.lineWidth = 0.7; g.beginPath(); circ(g, 0, 0, R); g.stroke();
    g.setLineDash([8, 3, 2, 3]); g.beginPath(); g.moveTo(-tip - 4, 0); g.lineTo(tip + 4, 0); g.moveTo(0, -tip - 4); g.lineTo(0, tip + 4); g.stroke();
    g.setLineDash([]);
  });
}
function drawGears(ctx, Z, fx, t, tq, vi, dpr) {
  const ratchet = fx.rm ? 0 : (fx.beatIndex + 1 - Math.sqrt(fx.beat)) * (0.1 + 0.25 * fx.chaos);
  const base = fx.time * (0.18 + 1.3 * fx.chaos) + ratchet + fx.punch * 0.4;
  const ang = [];
  Z.gears.forEach((gr, i) => {
    let th = base;
    if (gr.parent) { const pi = Z.gears.indexOf(gr.parent), Np = gr.parent.N; th = -(ang[pi] - gr.a) * (Np / gr.N) + gr.a + Math.PI + Math.PI / gr.N; }
    else if (i > 0) th = -base * 0.8 + i;
    ang.push(th);
    const sp = gearSprite(C.gears[i] || (C.gears[i] = {}), gr, Z.p, t, tq, vi, dpr), S = sp.width / dpr;
    ctx.save(); ctx.translate(gr.x, gr.y); ctx.rotate(th); ctx.drawImage(sp, -S / 2, -S / 2, S, S); ctx.restore();
  });
  // hub lights on the beat once it gets wild
  if (t > 0.05) {
    const lamp = mix(OWN.lamp, NEON.lamp, t);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const gr of Z.gears) { ctx.fillStyle = css(lamp, t * (0.25 + 0.6 * fx.beat)); ctx.beginPath(); ctx.arc(gr.x, gr.y, gr.R * 0.2, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

// A crane trolley runs along the top truss; the hook swings on its chain and kicks on a bite.
function drawHook(ctx, L, Z, fx, t) {
  const H = Z.hook; if (!H) return;
  const ink = mix(INK_OWN[mod(fx.variant, 4)], INK_NEON[mod(fx.variant, 4)], t), ty = 24 + clamp(L.h * 0.03, 8, 18);
  const tx = H.x + (fx.rm ? 0 : Math.sin(fx.time * 0.23) * H.span);
  const sw = fx.rm ? 0 : 0.1 * Math.sin(fx.time * 1.3) + 0.04 * Math.sin(fx.time * 2.9) + fx.punch * 0.22 * (fx.variant & 1 ? 1 : -1) + fx.beat * 0.03;
  const len = Math.max(10, H.len - ty), ex = tx + Math.sin(sw) * len, ey = ty + Math.cos(sw) * len;
  ctx.save();
  ctx.strokeStyle = css(ink, 0.9); ctx.fillStyle = css(ink, 0.15 + 0.2 * t); ctx.lineWidth = 1.4;
  ctx.fillRect(tx - 14, ty - 2, 28, 10); ctx.strokeRect(tx - 14, ty - 2, 28, 10);
  ctx.beginPath(); circ(ctx, tx - 8, ty - 1, 3); circ(ctx, tx + 8, ty - 1, 3); ctx.stroke();
  const n = Math.max(2, Math.floor(len / 9)), ux = (ex - tx) / len, uy = (ey - ty - 8) / len;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = tx + ux * (i + 0.5) * 9, y = ty + 8 + uy * (i + 0.5) * 9;
    if (i & 1) { ctx.moveTo(x - ux * 4, y - uy * 4); ctx.lineTo(x + ux * 4, y + uy * 4); }
    else { ctx.save(); ctx.translate(x, y); ctx.rotate(sw); ctx.moveTo(3, 0); ctx.ellipse(0, 0, 3, 5.5, 0, 0, TAU); ctx.restore(); }
  }
  ctx.stroke();
  // hook block and hook
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(-sw);
  ctx.fillRect(-7, 0, 14, 12); ctx.strokeRect(-7, 0, 14, 12);
  ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, 20); ctx.arc(-6, 20, 6, 0, Math.PI * 0.95); ctx.stroke();
  if (t > 0.05) { ctx.strokeStyle = css(ink, 0.3 * t); ctx.lineWidth = 8; ctx.stroke(); }
  ctx.restore();
  ctx.restore();
}

// Welding sparks from the gear mesh and the hook; more with chaos, a burst on every bite.
function drawSparks(ctx, Z, fx, t) {
  const n = Math.round(fx.chaos * 26 + fx.punch * 22 + fx.beat * 4 * fx.chaos);
  if (!n || !Z.gears.length) return;
  const col = mix(OWN.spark, NEON.spark, t), g1 = Z.gears[0], g2 = Z.gears[1] || g1;
  const ex = (g1.x * g2.R + g2.x * g1.R) / (g1.R + g2.R), ey = (g1.y * g2.R + g2.y * g1.R) / (g1.R + g2.R);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineWidth = 1.6;
  ctx.strokeStyle = css(col, 0.9); ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = frac(fx.time * (0.6 + hash(i) * 0.9) + hash(i * 7.3));
    const vx = (hash(i * 3.1) - 0.5) * 220, vy = -50 - hash(i * 5.7) * 150, gy = 380;
    const x = ex + vx * p, y = ey + vy * p + gy * p * p, k = 0.035;
    ctx.moveTo(x, y); ctx.lineTo(x - vx * k, y - (vy + 2 * gy * p) * k);
  }
  ctx.stroke(); ctx.restore();
}

// Caged lamps at the sheet corners: amber work lights at chaos 0, red strobes at chaos 1.
function drawLamps(ctx, L, fx, t) {
  const { w, h } = L, col = mix(OWN.lamp, NEON.lamp, t), r = clamp(Math.min(w, h) * 0.022, 6, 14);
  const pts = [[44, 58], [w - 44, 58], [44, h - 44], [w - 44, h - 44]];
  ctx.save();
  pts.forEach(([x, y], i) => {
    const alt = t > 0.5 && !fx.rf ? ((fx.beatIndex + i) & 1 ? 1 : 0.25) : 1;
    const on = (0.3 + 0.7 * fx.beat) * alt + fx.punch * 0.6;
    ctx.globalCompositeOperation = 'lighter';
    const R = r * (3 + 4 * on + 3 * t);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, css(col, Math.min(1, 0.35 + 0.5 * on))); gr.addColorStop(1, css(col, 0));
    ctx.fillStyle = gr; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css(mix(col, [255, 255, 255], 0.4 * on)); ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(mix([40, 26, 12], [255, 255, 255], t * 0.6), 0.9); ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  });
  ctx.restore();
}

// Shock rings from the bitten cell, outside the board (the board covers its own area).
function drawShock(ctx, L, fx, t) {
  if (fx.rm || !fx.bite || !(fx.biteAge < 700)) return;
  const k = fx.biteAge / 700, c = L.cell, x = L.bx + (fx.bite.x + 0.5) * c, y = L.by + (fx.bite.y + 0.5) * c;
  const col = mix(OWN.lamp, NEON.grid, t);
  ctx.save(); ctx.strokeStyle = css(col, (1 - k) * 0.8);
  for (let i = 0; i < 3; i++) { const r = c * (2 + (k + i * 0.12) * 18); ctx.lineWidth = (1 - k) * (6 - i * 1.5) + 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  ctx.restore();
}

const STAMPS = ['PASSED', 'Nº 1957', 'INSPECTED', 'IRON OK', 'APPROVED', 'SHEET 16'];
function drawStamp(ctx, L, Z, fx, t) {
  if (!fx.bite || !(fx.biteAge < 2600) || !Z.stamps.length) return;
  const age = fx.biteAge, v = fx.variant, [x, y] = Z.stamps[mod(v, Z.stamps.length)];
  const slam = fx.rm ? 1 : 1 + 0.8 * Math.max(0, 1 - age / 130);
  const a = 0.85 * (age > 1800 ? 1 - (age - 1800) / 800 : 1) * Math.min(1, age / 40 + 0.3);
  const fs = clamp(L.cell * 0.7, 12, 30), text = STAMPS[mod(v, STAMPS.length)], col = mix(OWN.stamp, NEON.stamp, t);
  ctx.save(); ctx.translate(x, y); ctx.rotate((hash(v * 1.9) - 0.5) * 0.6); ctx.scale(slam, slam);
  ctx.font = `bold ${fs}px "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width + fs, th = fs * 1.6;
  ctx.globalAlpha = Math.max(0, a); ctx.strokeStyle = css(col); ctx.fillStyle = css(col);
  ctx.lineWidth = 3; ctx.strokeRect(-tw / 2, -th / 2, tw, th); ctx.lineWidth = 1; ctx.strokeRect(-tw / 2 + 4, -th / 2 + 4, tw - 8, th - 8);
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

// Neon edges and a scan sweep take over the sheet as chaos rises; the frame colour steps on the beat.
function drawNeon(ctx, L, fx, t) {
  if (t < 0.04) return;
  const { w, h } = L, step = fx.rf ? fx.beatIndex >> 3 : fx.beatIndex, col = STEP[mod(step + fx.variant, 4)];
  ctx.save();
  ctx.strokeStyle = css(col, t * 0.25); ctx.lineWidth = 12; ctx.strokeRect(9, 9, w - 18, h - 18);
  ctx.strokeStyle = css(col, t * (0.55 + 0.45 * fx.beat)); ctx.lineWidth = 2.5; ctx.strokeRect(9, 9, w - 18, h - 18);
  const yb = mod(fx.time * (90 + 160 * fx.chaos), h + 200) - 100;
  const gr = ctx.createLinearGradient(0, yb, 0, yb + 100);
  gr.addColorStop(0, css(NEON.grid, 0)); gr.addColorStop(0.5, css(NEON.grid, 0.14 * t)); gr.addColorStop(1, css(NEON.grid, 0));
  ctx.fillStyle = gr; ctx.fillRect(0, yb, w, 100);
  ctx.restore();
}

// ───────────────────────────── board ─────────────────────────────
export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), t = tone(fx.chaos), tq = Math.round(t * 8) / 8, m = margin(L);
  snap = snap || {};
  ctx.save();
  // steady neon halo around the iron band (outside the board)
  if (tq > 0) {
    const col = mix(OWN.iron, NEON.iron, tq);
    ctx.strokeStyle = css(col, 0.35 * tq); ctx.lineWidth = 8; ctx.strokeRect(L.bx - m - 4, L.by - m - 4, L.bw + 2 * m + 8, L.bh + 2 * m + 8);
  }
  const key = [L.w, L.h, L.cell, L.bx, L.by, L.cols, L.rows, dpr, tq].join();
  blit(ctx, layer(C.board, key, L.bw + 2 * m, L.bh + 2 * m, dpr, (g) => paintBoard(g, L, m, tq)), L.bx - m, L.by - m, dpr);
  chase(ctx, L, fx, m, tq);
  burst(ctx, L, fx, tq);
  drawDot(ctx, L, snap, fx, tq);
  drawSnake(ctx, L, snap, tq);
  deathMark(ctx, L, snap);
  ctx.restore();
}

function rivet(g, x, y, r, body, hi, rim) {
  g.fillStyle = rim; g.beginPath(); g.arc(x, y, r * 1.25, 0, TAU); g.fill();
  g.fillStyle = body; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = hi; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.42, 0, TAU); g.fill();
}
function bandRivets(L, m) {
  const pts = [], c = L.cell, o = -m / 2;
  for (let i = 0; i <= L.cols * 2; i++) { const x = (i * c) / 2; pts.push([x, o], [x, L.bh - o]); }
  for (let j = 1; j < L.rows * 2; j++) { const y = (j * c) / 2; pts.push([o, y], [L.bw - o, y]); }
  return pts;
}

function paintBoard(g, L, m, t) {
  const { bw, bh, cell, cols, rows } = L;
  const iron = mix(OWN.iron, NEON.iron, t), hi = mix(OWN.ironHi, NEON.ironHi, t), lo = mix(OWN.ironLo, NEON.ironLo, t);
  const panel = mix(OWN.panel, NEON.panel, t), grid = mix(OWN.grid, NEON.grid, t), major = mix(OWN.major, NEON.major, t);
  g.translate(m, m);
  // red iron band: the lethal edge
  g.fillStyle = css(lo); g.fillRect(-m, -m, bw + 2 * m, bh + 2 * m);
  g.fillStyle = css(iron); g.fillRect(-m + 1.5, -m + 1.5, bw + 2 * m - 3, bh + 2 * m - 3);
  g.fillStyle = css(hi, 0.55); g.fillRect(-m + 1.5, -m + 1.5, bw + 2 * m - 3, Math.max(1, m * 0.18)); g.fillRect(-m + 1.5, -m + 1.5, Math.max(1, m * 0.18), bh + 2 * m - 3);
  const r = Math.max(1.2, m * 0.22);
  for (const [x, y] of bandRivets(L, m)) rivet(g, x, y, r, css(mix(OWN.rivet, NEON.rivet, t)), css(hi), css(lo));
  // brass gussets on the corners
  const k = m * 1.6;
  g.fillStyle = css(mix([150, 112, 48], [255, 200, 90], t * 0.5));
  for (const [cx, cy, sx, sy] of [[-m, -m, 1, 1], [bw + m, -m, -1, 1], [-m, bh + m, 1, -1], [bw + m, bh + m, -1, -1]]) {
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + sx * k, cy); g.lineTo(cx, cy + sy * k); g.closePath(); g.fill();
    rivet(g, cx + sx * k * 0.3, cy + sy * k * 0.3, r, css([120, 88, 34]), css([255, 236, 170]), css([58, 40, 12]));
  }
  // cream drafting plate
  g.fillStyle = css(panel); g.fillRect(0, 0, bw, bh);
  for (let i = 0; i < 60; i++) { g.fillStyle = css(mix([150, 110, 60], [40, 80, 140], t), 0.03); g.beginPath(); g.arc(hash(i * 4.1) * bw, hash(i * 6.3) * bh, cell * (0.6 + 1.8 * hash(i * 2.2)), 0, TAU); g.fill(); }
  g.beginPath();
  for (let i = 1; i < cols; i++) if (i % 4) { g.moveTo(i * cell + 0.5, 0); g.lineTo(i * cell + 0.5, bh); }
  for (let j = 1; j < rows; j++) if (j % 4) { g.moveTo(0, j * cell + 0.5); g.lineTo(bw, j * cell + 0.5); }
  g.strokeStyle = css(grid, 0.38 + 0.2 * t); g.lineWidth = 1; g.stroke();
  g.beginPath();
  for (let i = 4; i < cols; i += 4) { g.moveTo(i * cell + 0.5, 0); g.lineTo(i * cell + 0.5, bh); }
  for (let j = 4; j < rows; j += 4) { g.moveTo(0, j * cell + 0.5); g.lineTo(bw, j * cell + 0.5); }
  g.strokeStyle = css(major, 0.5 + 0.2 * t); g.lineWidth = 1.2; g.stroke();
  // inner shadow where the plate meets the band
  g.strokeStyle = css(lo, 0.85); g.lineWidth = 2; g.strokeRect(1, 1, bw - 2, bh - 2);
}

// One rivet of the band lights up per beat and runs around the board (edge only, never a cell).
function chase(ctx, L, fx, m, t) {
  if (t < 0.25 || fx.rf) return;
  const pts = bandRivets(L, m), col = mix(OWN.lamp, NEON.grid, t), r = Math.max(1.5, m * 0.3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = css(col, 0.5 + 0.5 * fx.beat);
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { const [x, y] = pts[mod(fx.beatIndex * 3 + k * Math.floor(pts.length / 4), pts.length)]; circ(ctx, L.bx + x, L.by + y, r * (1 + fx.beat)); }
  ctx.fill(); ctx.restore();
}

// Bite burst: square rings drawn on the grid lines and rivet sparks on grid crossings, so no cell
// centre is ever covered.
function burst(ctx, L, fx, t) {
  const b = fx.bite;
  if (!b || !(fx.biteAge < 640)) return;
  const k = fx.biteAge / 640, c = L.cell, x0 = L.bx + b.x * c, y0 = L.by + b.y * c;
  const col = mix([255, 120, 30], [40, 230, 255], t);
  ctx.save(); ctx.beginPath(); ctx.rect(L.bx, L.by, L.bw, L.bh); ctx.clip();
  ctx.lineWidth = Math.max(1.5, Math.min(3, c * 0.08));
  const rings = fx.rm ? [1] : [1, 2, 3];
  for (const n of rings) {
    const on = fx.rm ? 1 - k : clamp((k * 3.2 - (n - 1)) * 2, 0, 1) * (1 - k);
    if (on <= 0) continue;
    const x = x0 - n * c, y = y0 - n * c, s = (2 * n + 1) * c;
    ctx.globalAlpha = on; ctx.strokeStyle = css(col); ctx.strokeRect(x, y, s, s);
    ctx.fillStyle = n === 1 ? '#fff6dc' : css(col);
    const q = Math.max(1.5, Math.min(c * 0.15, 5)) * (1 + 0.5 * on);
    ctx.beginPath();
    for (let i = 0; i <= 2 * n + 1; i += 1) for (const [px, py] of [[x + i * c, y], [x + i * c, y + s], [x, y + i * c], [x + s, y + i * c]]) { ctx.moveTo(px, py - q); ctx.lineTo(px + q, py); ctx.lineTo(px, py + q); ctx.lineTo(px - q, py); ctx.closePath(); }
    ctx.fill();
  }
  ctx.restore();
}

// Dot: a round red enamel rivet button in a brass collar.
function drawDot(ctx, L, snap, fx, t) {
  const f = snap.food;
  if (!isCell(f)) return;
  const c = L.cell, cx = L.bx + (f.x + 0.5) * c, cy = L.by + (f.y + 0.5) * c, R = c * 0.36 * (1 + 0.06 * fx.beat);
  const red = mix([200, 36, 26], [255, 30, 64], t);
  ctx.save();
  ctx.fillStyle = 'rgba(40,20,8,0.3)'; ctx.beginPath(); ctx.arc(cx + R * 0.12, cy + R * 0.16, R, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a6a2c'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a290c'; ctx.lineWidth = Math.max(1, c * 0.04); ctx.stroke();
  ctx.fillStyle = css(red); ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, TAU); ctx.fill();
  ctx.fillStyle = css(mix(red, [255, 255, 255], 0.45)); ctx.beginPath(); ctx.arc(cx - R * 0.3, cy - R * 0.32, R * 0.24, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx - R * 0.36, cy - R * 0.38, Math.max(1, R * 0.09), 0, TAU); ctx.fill();
  if (t > 0) { ctx.strokeStyle = css(red, 0.6 * t); ctx.lineWidth = Math.max(1, c * 0.05); ctx.beginPath(); ctx.arc(cx, cy, Math.min(c * 0.46, R * 1.22), 0, TAU); ctx.stroke(); }
  ctx.restore();
}

// Snake: riveted brass plates; hinges only between adjacent, unbroken neighbours; arrow-nosed head.
function drawSnake(ctx, L, snap, t) {
  const s = Array.isArray(snap.snake) ? snap.snake : [];
  const n = s.length;
  if (!n || !isCell(s[0])) return;
  const c = L.cell, dead = snap.alive === false, P = dead ? IRON : BRASS, brk = breakSet(snap);
  const g = Math.max(1, Math.round(c * 0.07)), bev = Math.max(1, Math.round(c * 0.1)), tailIn = Math.round(c * 0.17);
  const plates = [];
  for (let i = 1; i < n; i++) {
    if (!isCell(s[i])) continue;
    const tail = i === n - 1 && n > 2, ins = tail ? tailIn : g;
    plates.push({ x: L.bx + s[i].x * c + ins, y: L.by + s[i].y * c + ins, z: c - 2 * ins, tail });
  }
  ctx.save();
  const pass = (fill, fn) => { ctx.beginPath(); for (const p of plates) fn(p); ctx.fillStyle = fill; ctx.fill(); };
  pass('rgba(40,22,6,0.28)', (p) => ctx.rect(p.x + g, p.y + g, p.z - g, p.z - g));
  pass(P.body, (p) => ctx.rect(p.x, p.y, p.z, p.z));
  pass(P.hi, (p) => { ctx.rect(p.x, p.y, p.z, bev); ctx.rect(p.x, p.y, bev, p.z); });
  pass(P.lo, (p) => { ctx.rect(p.x, p.y + p.z - bev, p.z, bev); ctx.rect(p.x + p.z - bev, p.y, bev, p.z); });
  ctx.strokeStyle = P.rim; ctx.lineWidth = 1; ctx.beginPath();
  for (const p of plates) ctx.rect(p.x + 0.5, p.y + 0.5, p.z - 1, p.z - 1);
  ctx.stroke();
  // rivets: four per plate, two on the tail plate
  const rv = Math.max(1, c * 0.06);
  const rivs = [];
  for (const p of plates) {
    const d = p.z * 0.2;
    if (p.tail) rivs.push([p.x + p.z / 2, p.y + d], [p.x + p.z / 2, p.y + p.z - d]);
    else rivs.push([p.x + d, p.y + d], [p.x + p.z - d, p.y + d], [p.x + d, p.y + p.z - d], [p.x + p.z - d, p.y + p.z - d]);
  }
  for (const [col, rr, o] of [[P.rim, 1.3, 0], [P.rivet, 1, 0], [P.rivetHi, 0.42, -0.32]]) {
    ctx.fillStyle = col; ctx.beginPath();
    for (const [x, y] of rivs) circ(ctx, x + o * rv, y + o * rv, rv * rr);
    ctx.fill();
  }
  // hinges across the boundary between joined neighbours
  ctx.fillStyle = P.link; ctx.beginPath();
  const hl = Math.max(2, Math.round(c * 0.16)), hw = Math.max(2, Math.round(c * 0.3));
  for (let i = 0; i < n - 1; i++) {
    if (brk.has(i) || !adjacent(s[i], s[i + 1])) continue;
    const a = s[i], b = s[i + 1], mx = L.bx + (Math.max(a.x, b.x) + (a.x === b.x ? 0.5 : 0)) * c, my = L.by + (Math.max(a.y, b.y) + (a.y === b.y ? 0.5 : 0)) * c;
    if (a.y === b.y) ctx.rect(mx - hl, my - hw / 2, 2 * hl, hw); else ctx.rect(mx - hw / 2, my - hl, hw, 2 * hl);
  }
  ctx.fill();
  if (!dead && t > 0.5) {
    ctx.strokeStyle = css(NEON.grid, (t - 0.5) * 1.6); ctx.lineWidth = 1; ctx.beginPath();
    for (const p of plates) ctx.rect(p.x - 0.5, p.y - 0.5, p.z + 1, p.z + 1);
    ctx.stroke();
  }
  // head: brass arrow plate
  const h = s[0], d = headDir(snap, brk), q = [-d[1], d[0]], cx = L.bx + (h.x + 0.5) * c, cy = L.by + (h.y + 0.5) * c;
  const P2 = (u, v) => [cx + (u * d[0] + v * q[0]) * c, cy + (u * d[1] + v * q[1]) * c];
  const shape = [[-0.46, -0.44], [0.08, -0.44], [0.48, 0], [0.08, 0.44], [-0.46, 0.44]];
  ctx.beginPath(); shape.forEach(([u, v], i) => { const [x, y] = P2(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
  ctx.fillStyle = P.head; ctx.fill();
  ctx.strokeStyle = !dead && t > 0.5 ? css(NEON.grid, Math.min(1, (t - 0.5) * 2)) : P.rim; ctx.lineWidth = Math.max(1, c * 0.05); ctx.stroke();
  ctx.beginPath(); [[-0.4, -0.36], [0.06, -0.36]].forEach(([u, v], i) => { const [x, y] = P2(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(1, c * 0.06); ctx.stroke();
  const e = Math.max(1.2, c * 0.08);
  for (const sg of [-1, 1]) {
    const [ex, ey] = P2(0.04, sg * 0.24);
    if (dead) {
      ctx.strokeStyle = P.rim; ctx.lineWidth = Math.max(1.5, c * 0.06); ctx.beginPath();
      ctx.moveTo(ex - e, ey - e); ctx.lineTo(ex + e, ey + e); ctx.moveTo(ex + e, ey - e); ctx.lineTo(ex - e, ey + e); ctx.stroke();
    } else rivet(ctx, ex, ey, e, '#2a1d0a', '#fff4cc', P.rim);
  }
  ctx.restore();
}

// Static red cross on the boundary the head crashed into. Never animated.
function deathMark(ctx, L, snap) {
  const s = snap.snake;
  if (snap.alive !== false || !Array.isArray(s) || !isCell(s[0])) return;
  const death = snap.death || {};
  if (death.reason === 'complete') return;
  const c = L.cell, h = s[0], d = headDir(snap, breakSet(snap));
  const cx = L.bx + (h.x + 0.5) * c, cy = L.by + (h.y + 0.5) * c;
  let px = cx + d[0] * c * 0.5, py = cy + d[1] * c * 0.5;
  const dc = death.cell;
  if (adjacent(dc, h)) { px = cx + (dc.x - h.x) * c * 0.5; py = cy + (dc.y - h.y) * c * 0.5; }
  const k = c * 0.24;
  ctx.save();
  ctx.strokeStyle = '#1a0804'; ctx.lineWidth = Math.max(3, c * 0.16); ctx.lineCap = 'square';
  ctx.beginPath(); ctx.moveTo(px - k, py - k); ctx.lineTo(px + k, py + k); ctx.moveTo(px + k, py - k); ctx.lineTo(px - k, py + k); ctx.stroke();
  ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = Math.max(2, c * 0.09); ctx.stroke();
  ctx.restore();
}

// ───────────────────────────── life icon ─────────────────────────────
// A rivet: filled = domed brass rivet head; hollow = an empty rivet hole ring. (x, y) is the
// top-left corner of a size x size slot. Restores the context state.
export function life(ctx, x, y, size, filled, fx) {
  const t = tone(fx && fx.chaos), cx = x + size / 2, cy = y + size / 2, r = size * 0.36;
  ctx.save();
  if (filled) {
    ctx.fillStyle = 'rgba(20,10,2,0.45)'; ctx.beginPath(); ctx.arc(cx + r * 0.1, cy + r * 0.14, r * 1.04, 0, TAU); ctx.fill();
    const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.35, '#d9ad55'); gr.addColorStop(1, '#5e4216');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2e2008'; ctx.lineWidth = Math.max(1, size * 0.06); ctx.stroke();
    if (t > 0.3) { ctx.strokeStyle = css(NEON.grid, t * 0.9); ctx.lineWidth = Math.max(1, size * 0.05); ctx.beginPath(); ctx.arc(cx, cy, r * 1.22, 0, TAU); ctx.stroke(); }
  } else {
    ctx.fillStyle = 'rgba(20,10,2,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(mix([150, 46, 30], NEON.iron, t)); ctx.lineWidth = Math.max(1.2, size * 0.1);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
