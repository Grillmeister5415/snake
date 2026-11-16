// SNAKE//SHIFT — universe ABYSSAL CATHEDRAL, −4000 M (abyss stream). Flat Canvas 2D look.
// Contract: BUILD_PLAN.md §15.3 and LEVELS_PLAN.md §3.3, §4.3, §6. A drowned cathedral in stained glass:
// a dark glass mosaic, a gothic arcade with lit lancet windows and a rose window, coral at its foot,
// slow jellyfish, light shafts from the surface and marine snow. The board is dark glass in lead lines
// inside a gold-railed band of dark glass (the lethal edge). Snake = scallop shells edged in gold with a
// lancet-shaped head; dot = a pearl. CALM universe: no flashes, no strobe, no sudden brightness of its
// own; slow drift only. fx.chaos cross-fades the own palette (0) into bioluminescent neon coral (1).
// Board cells are exact: each cell is drawn where it is, nothing joins two cells, so `breaks`, a
// three-cell snake, a null prevTail and a dead snake need no special path. Self-contained (no imports).

const TAU = Math.PI * 2;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
const mod = (a, n) => ((a % n) + n) % n;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
function norm(fx) {
  fx = fx || {};
  const rf = !!fx.reducedFlash, biteAge = Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity;
  // fx.punch is treated as a soft swell: rebuilt from biteAge as a slow bump (peak ~0.6 s, gone by 2.4 s)
  const u = biteAge / 2400, swell = fx.bite && u < 1 ? Math.sin(Math.PI * Math.sqrt(Math.max(0, u))) * (rf ? 0.4 : 1) : 0;
  return {
    time: num(fx.time), beat: Math.min(0.15, num(fx.beat)), chaos: clamp01(num(fx.chaos)), swell,
    variant: num(fx.variant) | 0, bite: fx.bite || null, biteAge, rf, rm: !!fx.reducedMotion,
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
  g.clearRect(0, 0, w, h);
  paint(g);
  slot.c = c; slot.key = key;
  return c;
}
const blit = (ctx, c, x, y, dpr) => ctx.drawImage(c, x, y, c.width / dpr, c.height / dpr);
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
function rrect(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
// Equilateral pointed arch (lancet) outline: x centre, top tip y0, bottom y1, width w.
function lancet(g, cx, y0, y1, w) {
  const r = w, h = w * 0.866, ys = y0 + h;
  g.moveTo(cx - w / 2, y1);
  g.lineTo(cx - w / 2, ys);
  g.arc(cx + w / 2, ys, r, Math.PI, Math.PI + Math.PI / 3);
  g.arc(cx - w / 2, ys, r, -Math.PI / 3, 0);
  g.lineTo(cx + w / 2, y1);
  g.closePath();
}

export const meta = {
  id: 'abyss', name: 'ABYSSAL CATHEDRAL', year: '−4000 M', kind: '2d',
  luma: 0.12, veil: '#071a26', weight: 2, calm: true,
  hud: { fg: '#f4e3b5', bg: 'rgba(3,12,22,0.78)', accent: '#e7b450', panelFg: '#f4e3b5', panelBg: 'rgba(4,16,30,0.92)' },
};

// own = dark stained glass and gold; neon = bioluminescent coral. Every colour is [r, g, b].
const OWN = {
  top: [14, 52, 70], bottom: [2, 8, 14],
  glass: [[10, 34, 56], [12, 44, 68], [11, 53, 64], [16, 40, 63], [20, 33, 74], [13, 58, 70], [8, 28, 46]],
  accent: [[29, 79, 122], [31, 107, 107], [42, 63, 134], [120, 84, 30]],
  lead: [3, 7, 11], stone: [9, 20, 26], stoneHi: [24, 50, 58],
  gold: [214, 160, 60], goldHi: [247, 217, 138], goldLo: [110, 76, 22],
  pane: [[242, 169, 59], [255, 210, 122], [228, 138, 42], [45, 111, 179], [27, 79, 143], [60, 143, 154], [36, 60, 120]],
  glow: [242, 160, 60], coral: [[226, 104, 52], [240, 150, 64], [70, 150, 132]],
  bell: [170, 205, 255], core: [255, 205, 130], shaft: [150, 220, 210], snow: [190, 220, 230],
  cell: [[11, 42, 58], [12, 39, 64], [13, 45, 56], [10, 42, 66]], facet: [70, 140, 160],
  tile: [13, 30, 72], shell: [59, 143, 214], shellHi: [170, 225, 255], rib: [40, 105, 190], edge: [230, 178, 74],
  head: [127, 230, 255], headHi: [225, 250, 255],
};
const NEON = {
  top: [10, 60, 110], bottom: [4, 4, 20],
  glass: [[11, 31, 74], [18, 42, 102], [7, 54, 79], [42, 15, 82], [10, 61, 92], [26, 16, 96], [6, 42, 64]],
  accent: [[0, 229, 255], [255, 63, 210], [124, 77, 255], [61, 255, 158]],
  lead: [2, 4, 9], stone: [7, 16, 34], stoneHi: [18, 58, 90],
  gold: [41, 243, 255], goldHi: [184, 251, 255], goldLo: [10, 107, 133],
  pane: [[255, 63, 210], [0, 229, 255], [155, 92, 255], [61, 255, 158], [255, 122, 61], [46, 168, 255], [120, 40, 200]],
  glow: [255, 63, 210], coral: [[255, 63, 210], [255, 122, 61], [61, 255, 207]],
  bell: [120, 255, 255], core: [255, 80, 220], shaft: [80, 255, 255], snow: [140, 255, 240],
  cell: [[13, 37, 82], [16, 32, 79], [11, 42, 85], [18, 34, 90]], facet: [60, 200, 255],
  tile: [26, 11, 69], shell: [24, 224, 255], shellHi: [230, 255, 255], rib: [255, 63, 210], edge: [127, 252, 255],
  head: [120, 255, 230], headHi: [240, 255, 250],
};
const DEAD = {
  tile: [26, 32, 38], shell: [125, 135, 145], shellHi: [181, 188, 196], rib: [106, 115, 124], edge: [124, 106, 74],
  head: [140, 150, 160], headHi: [200, 206, 212],
};

const K = { sc: [{}, {}], bd: [{}, {}], seg: {} };

// ───────────────────────────────── scenery ─────────────────────────────────
export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), { w, h } = L, k = smooth(fx.chaos);
  const key = [w, h, L.bx, L.by, L.bw, L.bh, dpr].join();
  ctx.save();
  blit(ctx, layer(K.sc[0], key, w, h, dpr, (g) => paintScenery(g, L, OWN)), 0, 0, dpr);
  if (k > 0.01) { ctx.globalAlpha = k; blit(ctx, layer(K.sc[1], key, w, h, dpr, (g) => paintScenery(g, L, NEON)), 0, 0, dpr); ctx.globalAlpha = 1; }
  shafts(ctx, L, fx, k);
  snow(ctx, L, fx, k);
  jellies(ctx, L, fx, k);
  ctx.restore();
}

function paintScenery(g, L, P) {
  const { w, h } = L;
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, rgb(P.top)); bg.addColorStop(1, rgb(P.bottom));
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  mosaic(g, 0, 0, w, h, Math.max(28, Math.min(70, Math.min(w, h) / 12)), P.glass, P.accent, P.lead, 0.06, 1);
  const shade = g.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(120,200,220,0.10)'); shade.addColorStop(0.45, 'rgba(0,0,0,0.25)'); shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = shade; g.fillRect(0, 0, w, h);
  arcade(g, L, P);
  rose(g, L, P);
  const fl = g.createLinearGradient(0, h * 0.78, 0, h);
  fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = fl; g.fillRect(0, h * 0.78, w, h * 0.22);
  corals(g, L, P);
  const vg = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.45, Math.hypot(w, h) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

// Stained-glass mosaic: a jittered grid split into triangles, each a pane, all set in lead.
function mosaic(g, x0, y0, w, h, s, cols, acc, lead, accP, seed) {
  const nx = Math.ceil(w / s) + 1, ny = Math.ceil(h / s) + 1, V = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const edge = i === 0 || j === 0 || i === nx || j === ny;
    const jx = edge ? 0 : (hash(seed * 31 + i * 7.3 + j * 13.1) - 0.5) * s * 0.6;
    const jy = edge ? 0 : (hash(seed * 17 + i * 3.7 + j * 5.9) - 0.5) * s * 0.6;
    V.push([x0 + i * s + jx, y0 + j * s + jy]);
  }
  const at = (i, j) => V[j * (nx + 1) + i];
  g.lineJoin = 'round';
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const tris = hash(seed + i * 1.7 + j * 9.1) < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
    tris.forEach((t, q) => {
      const r = hash(seed * 3 + i * 4.1 + j * 2.3 + q * 0.7);
      const col = r < accP ? acc[Math.floor(hash(r * 91) * acc.length)] : cols[Math.floor(r * 97) % cols.length];
      g.beginPath(); g.moveTo(t[0][0], t[0][1]); g.lineTo(t[1][0], t[1][1]); g.lineTo(t[2][0], t[2][1]); g.closePath();
      g.fillStyle = rgb(col); g.fill();
    });
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
    if (hash(seed + i * 1.7 + j * 9.1) < 0.5) { g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); } else { g.moveTo(b[0], b[1]); g.lineTo(d[0], d[1]); }
    g.strokeStyle = rgb(lead); g.lineWidth = Math.max(1.2, s * 0.07); g.stroke();
  }
}

// Gothic arcade: clustered columns, pointed arches with gold filigree, lit lancet windows in every bay.
function arcade(g, L, P) {
  const { w, h } = L, S = Math.max(120, Math.min(240, h * 0.3)), ys = h * 0.3, rise = S * 0.866;
  const n = Math.ceil(w / S / 2) + 1, xs = [];
  for (let k = -n; k <= n; k++) xs.push(w / 2 + (k + 0.5) * S);
  // windows first, columns and arches over them
  for (let k = 0; k < xs.length - 1; k++) {
    const cx = (xs[k] + xs[k + 1]) / 2, ww = S * 0.46, y0 = ys - rise * 0.55, y1 = h * 0.88;
    const gl = g.createRadialGradient(cx, (y0 + y1) / 2, 0, cx, (y0 + y1) / 2, S * 0.9);
    gl.addColorStop(0, rgb(P.glow, 0.22)); gl.addColorStop(1, rgb(P.glow, 0));
    g.fillStyle = gl; g.fillRect(cx - S, y0 - S * 0.3, 2 * S, y1 - y0 + S * 0.6);
    g.save();
    g.beginPath(); lancet(g, cx, y0, y1, ww); g.clip();
    mosaic(g, cx - ww / 2, y0, ww, y1 - y0, Math.max(9, ww / 5), P.pane, P.pane, P.lead, 0, 40 + k);
    g.restore();
    // tracery: two sub-lancets and an oculus, lead with gold edges
    const sw = ww * 0.42, oy = y0 + ww * 0.62, orad = ww * 0.2;
    g.beginPath();
    lancet(g, cx - ww * 0.24, oy + orad * 0.6, y1, sw);
    lancet(g, cx + ww * 0.24, oy + orad * 0.6, y1, sw);
    g.moveTo(cx + orad, oy); g.arc(cx, oy, orad, 0, TAU);
    g.strokeStyle = rgb(P.lead); g.lineWidth = Math.max(2, ww * 0.05); g.stroke();
    g.strokeStyle = rgb(P.gold, 0.75); g.lineWidth = Math.max(0.8, ww * 0.012); g.stroke();
    g.beginPath(); lancet(g, cx, y0, y1, ww);
    g.strokeStyle = rgb(P.stone); g.lineWidth = Math.max(3, ww * 0.11); g.stroke();
    g.strokeStyle = rgb(P.gold, 0.9); g.lineWidth = Math.max(1, ww * 0.018); g.stroke();
  }
  const cw = S * 0.13;
  for (let k = 0; k < xs.length - 1; k++) {
    // pointed arch between two columns: a stone band with a gold line on each side
    const xa = xs[k], xb = xs[k + 1];
    g.beginPath();
    g.moveTo(xa, ys); g.arc(xb, ys, S, Math.PI, Math.PI + Math.PI / 3); g.arc(xa, ys, S, -Math.PI / 3, 0);
    g.strokeStyle = rgb(P.stone); g.lineWidth = cw * 0.9; g.stroke();
    g.strokeStyle = rgb(P.stoneHi); g.lineWidth = cw * 0.5; g.stroke();
    g.strokeStyle = rgb(P.gold, 0.85); g.lineWidth = Math.max(0.8, cw * 0.06); g.stroke();
    // gold filigree dots along the arch
    for (let i = 1; i < 8; i++) {
      const a = i < 4 ? Math.PI + (i / 4) * (Math.PI / 3) : -Math.PI / 3 + ((i - 4) / 4) * (Math.PI / 3);
      const ox = i < 4 ? xb : xa, px = ox + Math.cos(a) * S, py = ys + Math.sin(a) * S;
      g.fillStyle = rgb(P.goldHi, 0.8); g.beginPath(); g.arc(px, py, Math.max(1, cw * 0.09), 0, TAU); g.fill();
    }
  }
  for (const x of xs) {
    const col = g.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
    col.addColorStop(0, rgb(P.stone)); col.addColorStop(0.45, rgb(P.stoneHi)); col.addColorStop(1, rgb(P.stone));
    g.fillStyle = col; g.fillRect(x - cw / 2, ys - 4, cw, h - ys + 4);
    g.strokeStyle = rgb(P.gold, 0.55); g.lineWidth = Math.max(0.7, cw * 0.04);
    g.beginPath();
    for (const f of [-0.25, 0, 0.25]) { g.moveTo(x + f * cw, ys + cw * 0.5); g.lineTo(x + f * cw, h); }
    g.stroke();
    g.fillStyle = rgb(P.gold); g.fillRect(x - cw * 0.65, ys - cw * 0.18, cw * 1.3, cw * 0.22);
    g.fillStyle = rgb(P.goldLo); g.fillRect(x - cw * 0.55, ys + cw * 0.04, cw * 1.1, cw * 0.12);
  }
}

// Rose window above the board, sized to the free band.
function rose(g, L, P) {
  const m = margin(L), free = L.by - m;
  const R = Math.min(free * 0.42, L.w * 0.3);
  if (R < 16) return;
  const cx = L.w / 2, cy = free * 0.5;
  const gl = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.8);
  gl.addColorStop(0, rgb(P.glow, 0.3)); gl.addColorStop(1, rgb(P.glow, 0));
  g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R * 1.8, 0, TAU); g.fill();
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  mosaic(g, cx - R, cy - R, 2 * R, 2 * R, Math.max(7, R / 6), P.pane, P.pane, P.lead, 0, 77);
  g.restore();
  g.lineWidth = Math.max(1.5, R * 0.04); g.strokeStyle = rgb(P.lead);
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, px = cx + Math.cos(a) * R * 0.66, py = cy + Math.sin(a) * R * 0.66;
    g.moveTo(px + R * 0.26, py); g.arc(px, py, R * 0.26, 0, TAU);
    g.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  g.moveTo(cx + R * 0.3, cy); g.arc(cx, cy, R * 0.3, 0, TAU);
  g.stroke();
  g.strokeStyle = rgb(P.gold, 0.8); g.lineWidth = Math.max(0.8, R * 0.012); g.stroke();
  g.beginPath(); g.arc(cx, cy, R, 0, TAU);
  g.strokeStyle = rgb(P.stone); g.lineWidth = Math.max(3, R * 0.1); g.stroke();
  g.strokeStyle = rgb(P.gold); g.lineWidth = Math.max(1, R * 0.025); g.stroke();
  g.fillStyle = rgb(P.goldHi); g.beginPath(); g.arc(cx, cy, R * 0.09, 0, TAU); g.fill();
}

// Branching coral and organ-pipe tube coral along the foot of the scene.
function corals(g, L, P) {
  const { w, h } = L, s = Math.min(w, h);
  const spots = [[0.05, 0.3, 0], [0.95, 0.28, 1], [0.2, 0.16, 2], [0.8, 0.17, 0], [0.5, 0.12, 1], [0.35, 0.1, 2], [0.65, 0.11, 0]];
  g.lineCap = 'round'; g.lineJoin = 'round';
  spots.forEach(([fx, fs, ci], i) => {
    const x = w * fx, size = s * fs, col = P.coral[ci], dark = col.map((v) => v * 0.4), lite = col.map((v) => Math.min(255, v * 1.35 + 30));
    if (i % 3 === 2) {
      // organ-pipe tubes with dark mouths and gold rims
      for (let q = 0; q < 6; q++) {
        const tw = size * (0.07 + 0.04 * hash(i * 9 + q)), th = size * (0.35 + 0.55 * hash(i * 5 + q)), tx = x + (q - 2.5) * size * 0.11;
        const gr = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
        gr.addColorStop(0, rgb(dark)); gr.addColorStop(0.45, rgb(lite)); gr.addColorStop(1, rgb(dark));
        g.fillStyle = gr; g.beginPath(); rrect(g, tx - tw / 2, h - th, tw, th + 4, tw * 0.45); g.fill();
        g.fillStyle = rgb(P.lead); g.beginPath(); g.ellipse(tx, h - th + tw * 0.3, tw * 0.36, tw * 0.16, 0, 0, TAU); g.fill();
        g.strokeStyle = rgb(P.gold, 0.7); g.lineWidth = Math.max(0.8, tw * 0.08); g.stroke();
      }
      return;
    }
    const segs = [];
    const grow = (px, py, a, len, wd, depth, sd) => {
      const bend = (hash(sd + 9) - 0.5) * 0.5;
      const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len, mx = px + Math.cos(a + bend) * len * 0.5, my = py + Math.sin(a + bend) * len * 0.5;
      segs.push([px, py, mx, my, ex, ey, wd, depth <= 0]);
      if (depth <= 0) return;
      const sp = 0.38 + hash(sd) * 0.3;
      grow(ex, ey, a - sp, len * (0.7 + hash(sd + 1) * 0.12), wd * 0.74, depth - 1, sd * 1.3 + 2);
      grow(ex, ey, a + sp, len * (0.7 + hash(sd + 2) * 0.12), wd * 0.74, depth - 1, sd * 1.7 + 5);
      if (hash(sd + 4) < 0.35) grow(ex, ey, a + (hash(sd + 6) - 0.5) * 0.4, len * 0.6, wd * 0.7, depth - 2, sd * 2.1 + 3);
    };
    grow(x, h + 2, -Math.PI / 2 + (hash(i + 3) - 0.5) * 0.3, size * 0.32, Math.max(3, size * 0.085), 5, i * 7 + 1);
    for (const [pass, colr, extra] of [[0, rgb(col, 0.18), 6], [1, rgb(dark), 2.5], [2, rgb(col), 0]]) {
      g.strokeStyle = colr;
      for (const [px, py, mx, my, ex, ey, wd] of segs) { g.lineWidth = wd + extra; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(mx, my, ex, ey); g.stroke(); }
      if (pass === 2) for (const [, , , , ex, ey, wd, tip] of segs) if (tip) { g.fillStyle = rgb(lite); g.beginPath(); g.arc(ex, ey, wd * 0.95, 0, TAU); g.fill(); }
    }
  });
}

// Light shafts from the surface: soft additive wedges that sway very slowly.
function shafts(ctx, L, fx, k) {
  const { w, h } = L, col = mix3(OWN.shaft, NEON.shaft, k), a0 = (0.06 + 0.05 * k + 0.05 * fx.swell + 0.1 * fx.beat);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const x = w * (0.14 + 0.25 * i) + Math.sin(fx.time * 0.06 + i * 1.9) * w * 0.025, sw = w * (0.04 + 0.03 * hash(i + 4)), slant = w * 0.12 * (i % 2 ? 1 : -0.6);
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, rgb(col, a0 * (0.8 + 0.4 * hash(i)))); gr.addColorStop(1, rgb(col, 0));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x - sw * 0.5, 0); ctx.lineTo(x + sw * 0.5, 0); ctx.lineTo(x + slant + sw * 1.6, h); ctx.lineTo(x + slant - sw * 1.6, h); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Marine snow: slow specks drifting down; more and greener with chaos.
function snow(ctx, L, fx, k) {
  const { w, h } = L, n = 40 + Math.round(50 * k), col = mix3(OWN.snow, NEON.snow, k);
  ctx.save(); ctx.fillStyle = rgb(col);
  for (let i = 0; i < n; i++) {
    const sp = 6 + 14 * hash(i * 2.3), y = mod(hash(i * 1.1) * h + fx.time * sp, h + 10) - 5;
    const x = hash(i * 4.7) * w + Math.sin(fx.time * 0.2 + i) * 6, s = 0.8 + 1.4 * hash(i * 6.1);
    ctx.globalAlpha = 0.18 + 0.32 * hash(i * 8.3);
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

// Jellyfish: translucent bells that rise slowly, pulse slowly and trail soft tentacles.
function jellies(ctx, L, fx, k) {
  const { w, h } = L, n = 4 + Math.round(4 * k), base = Math.min(w, h), t = fx.time;
  const bell = mix3(OWN.bell, NEON.bell, k), core = mix3(OWN.core, NEON.core, k);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const r = base * (0.03 + 0.035 * hash(i * 5.5)), period = h + 6 * r;
    const yy = mod(hash(i * 9.1) * period - t * (5 + 6 * hash(i * 3.3)), period) - 3 * r;
    const x = (0.08 + 0.84 * hash(i * 7.7)) * w + Math.sin(t * 0.15 + i * 2.1) * w * 0.03;
    const fade = smooth(Math.min(yy + 3 * r, period - yy - 3 * r) / (3 * r));
    const pulse = 1 + 0.07 * Math.sin(t * 1.3 + i * 1.7), bw = r * pulse, bh = r * 0.75 / pulse;
    if (fade <= 0.01) continue;
    ctx.globalAlpha = fade;
    const halo = ctx.createRadialGradient(x, yy, 0, x, yy, r * 2.6);
    halo.addColorStop(0, rgb(core, 0.22 + 0.1 * fx.swell)); halo.addColorStop(1, rgb(core, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, yy, r * 2.6, 0, TAU); ctx.fill();
    ctx.lineCap = 'round';
    for (let q = 0; q < 6; q++) {
      const tx = x + (q / 5 - 0.5) * bw * 1.4, len = r * (2.2 + 1.4 * hash(i * 11 + q));
      const wv = Math.sin(t * 0.9 + q * 1.3 + i) * r * 0.35;
      ctx.strokeStyle = rgb(q % 2 ? bell : core, 0.32); ctx.lineWidth = Math.max(0.8, r * (q % 2 ? 0.05 : 0.09));
      ctx.beginPath(); ctx.moveTo(tx, yy + bh * 0.1);
      ctx.quadraticCurveTo(tx + wv, yy + len * 0.5, tx - wv * 0.6, yy + len); ctx.stroke();
    }
    const bg = ctx.createRadialGradient(x, yy - bh * 0.1, 0, x, yy, bw);
    bg.addColorStop(0, rgb(core, 0.85)); bg.addColorStop(0.35, rgb(bell, 0.5)); bg.addColorStop(1, rgb(bell, 0.12));
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(x, yy + bh * 0.15, bw, bh, 0, Math.PI, TAU);
    for (let q = 0; q <= 8; q++) ctx.lineTo(x + bw - (q / 8) * 2 * bw, yy + bh * 0.15 + (q % 2 ? bh * 0.16 : 0));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgb(bell, 0.6); ctx.lineWidth = Math.max(0.7, r * 0.05); ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────────────── board ─────────────────────────────────
const margin = (L) => Math.max(8, Math.round(L.cell * 0.62));

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), m = margin(L), k = smooth(fx.chaos);
  ctx.save();
  const key = [L.w, L.h, L.cell, L.bx, L.by, L.cols, L.rows, dpr].join();
  blit(ctx, layer(K.bd[0], key, L.bw + 2 * m, L.bh + 2 * m, dpr, (g) => paintBoard(g, L, m, OWN)), L.bx - m, L.by - m, dpr);
  if (k > 0.01) { ctx.globalAlpha = k; blit(ctx, layer(K.bd[1], key, L.bw + 2 * m, L.bh + 2 * m, dpr, (g) => paintBoard(g, L, m, NEON)), L.bx - m, L.by - m, dpr); ctx.globalAlpha = 1; }
  if (fx.swell > 0.01) frameSwell(ctx, L, m, fx, k);
  ripple(ctx, L, fx, k);
  if (snap) {
    drawDot(ctx, L, snap, fx, k);
    drawSnake(ctx, L, snap, fx, k, dpr);
    deathMark(ctx, L, snap);
  }
  ctx.restore();
}

// Lethal edge: a band of dark glass diamonds between two gold rails, quatrefoil medallions at the
// corners and four-point stars at the middle of each side. Panel: dark glass tiles in lead.
function paintBoard(g, L, m, P) {
  const { bw, bh, cell, cols, rows } = L;
  g.translate(m, m);
  g.fillStyle = rgb(P.stone); g.fillRect(-m, -m, bw + 2 * m, bh + 2 * m);
  const ds = m * 0.9;
  g.lineWidth = Math.max(1, m * 0.08); g.strokeStyle = rgb(P.lead);
  const diamond = (x, y, i) => {
    g.beginPath(); g.moveTo(x, y - ds / 2); g.lineTo(x + ds / 2, y); g.lineTo(x, y + ds / 2); g.lineTo(x - ds / 2, y); g.closePath();
    g.fillStyle = rgb(P.glass[i % P.glass.length].map((v) => v * 1.5)); g.fill(); g.stroke();
  };
  let i = 0;
  for (let x = -m / 2; x <= bw + m / 2 + 0.1; x += ds) { diamond(x, -m / 2, i++); diamond(x, bh + m / 2, i++); }
  for (let y = -m / 2 + ds; y < bh + m / 2 - ds / 2; y += ds) { diamond(-m / 2, y, i++); diamond(bw + m / 2, y, i++); }
  const lw = Math.max(1.5, m * 0.12);
  g.strokeStyle = rgb(P.gold); g.lineWidth = lw; g.strokeRect(-m + lw / 2, -m + lw / 2, bw + 2 * m - lw, bh + 2 * m - lw);
  const r = Math.max(2, Math.round(m * 0.24));
  const rail = g.createLinearGradient(0, -r, 0, bh + r);
  rail.addColorStop(0, rgb(P.goldHi)); rail.addColorStop(0.5, rgb(P.gold)); rail.addColorStop(1, rgb(P.goldLo));
  g.fillStyle = rail; g.fillRect(-r, -r, bw + 2 * r, bh + 2 * r);
  g.fillStyle = rgb(P.lead); g.fillRect(-1, -1, bw + 2, bh + 2);
  // panel
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = P.cell[Math.floor(hash(x * 3.1 + y * 17.3) * P.cell.length)], px = x * cell, py = y * cell;
    g.fillStyle = rgb(c); g.fillRect(px, py, cell, cell);
    const gr = g.createRadialGradient(px + cell / 2, py + cell / 2, cell * 0.18, px + cell / 2, py + cell / 2, cell * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, hash(x * 5.3 + y * 2.9) < 0.5 ? 'rgba(0,0,0,0.45)' : rgb(P.facet, 0.18));
    g.fillStyle = gr; g.fillRect(px, py, cell, cell);
    // facet creases from the corners, stopping well short of the centre
    g.beginPath();
    for (const [ax, ay] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      g.moveTo(px + ax * cell, py + ay * cell); g.lineTo(px + (ax * 0.7 + 0.15) * cell, py + (ay * 0.7 + 0.15) * cell);
    }
    g.strokeStyle = rgb(P.facet, 0.22); g.lineWidth = Math.max(0.6, cell * 0.025); g.stroke();
  }
  const gl = Math.max(1, Math.round(cell * 0.08)), off = (gl % 2) / 2;
  g.beginPath();
  for (let x = 1; x < cols; x++) { g.moveTo(x * cell + off, 0); g.lineTo(x * cell + off, bh); }
  for (let y = 1; y < rows; y++) { g.moveTo(0, y * cell + off); g.lineTo(bw, y * cell + off); }
  g.strokeStyle = rgb(P.lead); g.lineWidth = gl; g.stroke();
  g.strokeStyle = rgb(P.facet, 0.2); g.lineWidth = Math.max(0.5, gl * 0.3); g.stroke();
  // ornaments
  const medal = (x, y) => {
    const R = m * 0.62;
    g.fillStyle = rgb(P.lead); g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    g.fillStyle = rgb(P.gold);
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(x + Math.cos(a) * R * 0.42, y + Math.sin(a) * R * 0.42, R * 0.36, 0, TAU); g.fill(); }
    g.fillStyle = rgb(P.lead); g.beginPath(); g.arc(x, y, R * 0.34, 0, TAU); g.fill();
    g.fillStyle = rgb(P.goldHi); g.beginPath(); g.arc(x, y, R * 0.2, 0, TAU); g.fill();
  };
  const star = (x, y, rot) => {
    const R = m * 0.95, rr = m * 0.2;
    g.beginPath();
    for (let q = 0; q < 8; q++) { const a = rot + q * Math.PI / 4, rad = q % 2 ? rr : (q % 4 === 0 ? R : R * 0.55); g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    g.closePath(); g.fillStyle = rgb(P.goldHi); g.fill(); g.strokeStyle = rgb(P.goldLo); g.lineWidth = 1; g.stroke();
  };
  for (const [x, y] of [[-m / 2, -m / 2], [bw + m / 2, -m / 2], [-m / 2, bh + m / 2], [bw + m / 2, bh + m / 2]]) medal(x, y);
  star(bw / 2, -m / 2, -Math.PI / 2); star(bw / 2, bh + m / 2, Math.PI / 2); star(-m / 2, bh / 2, Math.PI); star(bw + m / 2, bh / 2, 0);
}

// Soft swell on a bite: the gold rails glow up and fade back slowly (never a flash).
function frameSwell(ctx, L, m, fx, k) {
  const col = mix3(OWN.goldHi, NEON.gold, k), r = Math.max(2, Math.round(m * 0.24));
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * fx.swell;
  ctx.strokeStyle = rgb(col); ctx.lineWidth = r * 1.6;
  ctx.strokeRect(L.bx - r * 0.5, L.by - r * 0.5, L.bw + r, L.bh + r);
  ctx.restore();
}

// Bite: light runs outward through the lead lines (never across a cell centre).
function ripple(ctx, L, fx, k) {
  const b = fx.bite, age = fx.biteAge, dur = 1400;
  if (!b || !(age < dur)) return;
  const t = age / dur, c = L.cell, cx = L.bx + (X(b) + 0.5) * c, cy = L.by + (Y(b) + 0.5) * c;
  const R = fx.rm ? c * 0.9 : c * (0.6 + 5.5 * (1 - (1 - t) * (1 - t))), band = c * 1.1;
  const col = mix3(OWN.goldHi, NEON.gold, k), gl = Math.max(1, Math.round(c * 0.08)), off = (gl % 2) / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(L.bx, L.by, L.bw, L.bh); ctx.clip();
  ctx.beginPath(); ctx.arc(cx, cy, R + band / 2, 0, TAU); ctx.arc(cx, cy, Math.max(0, R - band / 2), 0, TAU, true); ctx.clip();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.pow(1 - t, 1.5) * (fx.rf ? 0.45 : 0.8);
  ctx.beginPath();
  for (let x = 1; x < L.cols; x++) { ctx.moveTo(L.bx + x * c + off, L.by); ctx.lineTo(L.bx + x * c + off, L.by + L.bh); }
  for (let y = 1; y < L.rows; y++) { ctx.moveTo(L.bx, L.by + y * c + off); ctx.lineTo(L.bx + L.bw, L.by + y * c + off); }
  ctx.strokeStyle = rgb(col); ctx.lineWidth = gl * 1.7; ctx.stroke();
  ctx.restore();
}

// Dot: a pearl with a lilac rim, a slow iridescent sheen and a soft halo kept inside its cell.
function drawDot(ctx, L, snap, fx, k) {
  const f = snap.food;
  if (!f) return;
  const c = L.cell, cx = L.bx + (X(f) + 0.5) * c, cy = L.by + (Y(f) + 0.5) * c, R = c * 0.34 * (1 + 0.04 * fx.beat);
  pearl(ctx, cx, cy, R, c * 0.5, fx.time, k);
}
function pearl(ctx, cx, cy, R, haloR, time, k) {
  const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, haloR);
  halo.addColorStop(0, rgb(mix3([255, 236, 200], [255, 90, 230], k), 0.4)); halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff5e4'); g.addColorStop(0.75, '#e6d6c9'); g.addColorStop(1, '#a995b8');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.4;
  ctx.strokeStyle = `hsl(${mod(time * 18, 360) | 0},90%,72%)`; ctx.lineWidth = Math.max(1, R * 0.16);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, time * 0.3, time * 0.3 + 2.2); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(cx - R * 0.35, cy - R * 0.42, R * 0.22, R * 0.13, -0.6, 0, TAU); ctx.fill();
}

// Scallop shell sprite: a gold-edged tile of dark glass carrying a fan shell that opens toward `d`.
// The fan's wedges alternate two bright tones and no line crosses the centre of the cell.
function shellSprite(c, dpr, d, P) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(c * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ins = Math.max(1, c * 0.05), r = c * 0.24;
  g.beginPath(); rrect(g, ins, ins, c - 2 * ins, c - 2 * ins, r); g.fillStyle = rgb(P.tile); g.fill();
  g.strokeStyle = rgb(P.edge, 0.8); g.lineWidth = Math.max(1, c * 0.04); g.stroke();
  g.translate(c / 2, c / 2); g.rotate(Math.atan2(d[1], d[0]));
  const hx = -c * 0.34, Rf = c * 0.66, A = 1.0, N = 8;
  const grad = g.createRadialGradient(hx, 0, 0, hx, 0, Rf);
  grad.addColorStop(0, rgb(P.shellHi)); grad.addColorStop(1, rgb(P.shell));
  const ribGrad = g.createRadialGradient(hx, 0, 0, hx, 0, Rf);
  ribGrad.addColorStop(0, rgb(P.shellHi)); ribGrad.addColorStop(1, rgb(P.rib));
  const pt = (a, rr) => [hx + Math.cos(a) * rr, Math.sin(a) * rr];
  const outline = new Path2D();
  outline.moveTo(hx, 0);
  for (let q = 0; q < N; q++) {
    const a0 = -A + (2 * A * q) / N, a1 = -A + (2 * A * (q + 1)) / N, am = (a0 + a1) / 2;
    const p0 = pt(a0, Rf * 0.94), p1 = pt(a1, Rf * 0.94), pm = pt(am, Rf * 1.06);
    if (q === 0) outline.lineTo(p0[0], p0[1]);
    outline.quadraticCurveTo(pm[0], pm[1], p1[0], p1[1]);
  }
  outline.closePath();
  g.save(); g.clip(outline);
  for (let q = 0; q < N; q++) {
    const a0 = -A + (2 * A * q) / N - 0.01, a1 = -A + (2 * A * (q + 1)) / N + 0.01;
    g.beginPath(); g.moveTo(hx, 0); g.arc(hx, 0, Rf * 1.2, a0, a1); g.closePath();
    g.fillStyle = q % 2 ? ribGrad : grad; g.fill();
  }
  g.restore();
  // hinge ears
  g.beginPath(); g.moveTo(hx - c * 0.04, -c * 0.16); g.lineTo(hx + c * 0.1, -c * 0.06); g.lineTo(hx + c * 0.1, c * 0.06); g.lineTo(hx - c * 0.04, c * 0.16); g.closePath();
  g.fillStyle = rgb(P.rib); g.fill();
  g.strokeStyle = rgb(P.edge); g.lineWidth = Math.max(1, c * 0.05); g.lineJoin = 'round';
  g.stroke(outline); g.stroke();
  return cv;
}
const ORIENT = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function sprites(c, dpr, which) {
  const key = c + ',' + dpr;
  if (!K.seg[which] || K.seg[which].key !== key) {
    const P = which === 'dead' ? DEAD : which === 'neon' ? NEON : OWN;
    K.seg[which] = { key, s: ORIENT.map((d) => shellSprite(c, dpr, d, P)) };
  }
  return K.seg[which].s;
}
const oIndex = (dx, dy) => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3);
const adj = (a, b) => a && b && Math.abs(X(a) - X(b)) + Math.abs(Y(a) - Y(b)) === 1;

export function drawSnake(ctx, L, snap, fxIn, kIn, dprIn) {
  const s = snap && snap.snake;
  if (!s || !s.length) return;
  const fx = fxIn && fxIn.swell !== undefined ? fxIn : norm(fxIn), k = kIn ?? smooth(fx.chaos), dpr = dprIn || dprOf(ctx);
  const c = L.cell, n = s.length, dead = snap.alive === false, br = new Set(Array.isArray(snap.breaks) ? snap.breaks : []);
  const own = sprites(c, dpr, dead ? 'dead' : 'own'), neon = !dead && k > 0.01 ? sprites(c, dpr, 'neon') : null;
  const wait = snap.waiting === 'respawn' || snap.waiting === 'start';
  ctx.save();
  for (let i = n - 1; i >= 1; i--) {
    const a = s[i], fwd = s[i - 1], back = s[i + 1];
    let o = null;
    if (!br.has(i - 1) && adj(a, fwd)) o = oIndex(X(fwd) - X(a), Y(fwd) - Y(a));
    else if (i < n - 1 && !br.has(i) && adj(a, back)) o = oIndex(X(a) - X(back), Y(a) - Y(back));
    else { const d = DIRS[snap.dir] || [0, -1]; o = oIndex(d[0], d[1]); }
    const tail = i === n - 1 && n > 2, inset = tail ? c * 0.1 : 0, sz = c - 2 * inset;
    const x = L.bx + X(a) * c + inset, y = L.by + Y(a) * c + inset;
    ctx.drawImage(own[o], x, y, sz, sz);
    if (neon) { ctx.globalAlpha = k * (0.75 + 0.25 * Math.sin(fx.time * 0.8 - i * 0.35)); ctx.drawImage(neon[o], x, y, sz, sz); ctx.globalAlpha = 1; }
  }
  drawHead(ctx, L, snap, fx, k, dead, br);
  if (wait && !dead) {
    // respawn / start: the short snake breathes gently inside its own cells
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgb(mix3(OWN.shellHi, NEON.shell, k), 0.12 + 0.1 * Math.sin(fx.time * 2.4));
    for (const p of s) { ctx.beginPath(); rrect(ctx, L.bx + X(p) * c + c * 0.08, L.by + Y(p) * c + c * 0.08, c * 0.84, c * 0.84, c * 0.24); ctx.fill(); }
  }
  ctx.restore();
}

function headDir(snap, br) {
  const s = snap.snake;
  if (s.length > 1 && !br.has(0) && adj(s[0], s[1])) return [X(s[0]) - X(s[1]), Y(s[0]) - Y(s[1])];
  return DIRS[snap.dir] || [0, -1];
}

// Head: a lancet (pointed gothic arch) of bright glass pointing where the snake goes, gold-edged,
// with a small gold trefoil at the tip and two pearl eyes. Grey with closed eyes when dead.
function drawHead(ctx, L, snap, fx, k, dead, br) {
  const h = snap.snake[0], d = headDir(snap, br), c = L.cell;
  const cx = L.bx + (X(h) + 0.5) * c, cy = L.by + (Y(h) + 0.5) * c;
  const P = dead ? DEAD : OWN, body = dead ? P.head : mix3(OWN.head, NEON.head, k), hi = dead ? P.headHi : mix3(OWN.headHi, NEON.headHi, k);
  const edge = dead ? DEAD.edge : mix3(OWN.edge, NEON.edge, k);
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(Math.atan2(d[1], d[0]) + Math.PI / 2);   // local -y = forward
  const w = c * 0.86, back = c * 0.44, tip = -c * 0.47, ys = tip + w * 0.866 * 0.62;
  const path = new Path2D();
  path.moveTo(-w / 2, back - c * 0.1);
  path.lineTo(-w / 2, ys);
  path.quadraticCurveTo(-w * 0.42, tip + c * 0.12, 0, tip);
  path.quadraticCurveTo(w * 0.42, tip + c * 0.12, w / 2, ys);
  path.lineTo(w / 2, back - c * 0.1);
  path.quadraticCurveTo(w / 2, back, w / 2 - c * 0.1, back);
  path.lineTo(-w / 2 + c * 0.1, back);
  path.quadraticCurveTo(-w / 2, back, -w / 2, back - c * 0.1);
  path.closePath();
  const g = ctx.createLinearGradient(0, tip, 0, back);
  g.addColorStop(0, rgb(hi)); g.addColorStop(1, rgb(body));
  ctx.fillStyle = g; ctx.fill(path);
  ctx.strokeStyle = rgb(edge); ctx.lineWidth = Math.max(1.2, c * 0.06); ctx.lineJoin = 'round'; ctx.stroke(path);
  // trefoil at the tip
  ctx.fillStyle = rgb(edge);
  for (let q = 0; q < 3; q++) { const a = -Math.PI / 2 + (q - 1) * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a) * c * 0.05, tip + c * 0.17 + Math.sin(a) * c * 0.05, c * 0.04, 0, TAU); ctx.fill(); }
  // eyes
  for (const sx of [-1, 1]) {
    const ex = sx * c * 0.21, ey = -c * 0.04, er = c * 0.09;
    if (dead) {
      ctx.strokeStyle = 'rgba(40,46,52,0.9)'; ctx.lineWidth = Math.max(1, c * 0.04);
      ctx.beginPath(); ctx.moveTo(ex - er, ey); ctx.lineTo(ex + er, ey); ctx.stroke();
    } else {
      ctx.fillStyle = rgb(edge); ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(ex, ey, er * 0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#071420'; ctx.beginPath(); ctx.arc(ex, ey - er * 0.2, er * 0.38, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// Death: a calm crack in the glass where the head met the obstacle (no flashing). It stays near the
// shared edge and never reaches a cell centre.
function deathMark(ctx, L, snap) {
  if (snap.alive !== false || !snap.snake || !snap.snake.length) return;
  const death = snap.death || {};
  if (death.reason === 'complete') return;
  const c = L.cell, h = snap.snake[0], dc = death.cell;
  const br = new Set(Array.isArray(snap.breaks) ? snap.breaks : []);
  const d = dc && Math.abs(X(dc) - X(h)) + Math.abs(Y(dc) - Y(h)) === 1 ? [X(dc) - X(h), Y(dc) - Y(h)] : headDir(snap, br);
  const px = L.bx + (X(h) + 0.5 + d[0] * 0.5) * c, py = L.by + (Y(h) + 0.5 + d[1] * 0.5) * c;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let q = 0; q < 5; q++) {
    const a = Math.atan2(d[1], d[0]) + Math.PI + (q - 2) * 0.55, l = c * (0.18 + 0.1 * hash(q * 3.1));
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a + 0.3) * l * 0.5, py + Math.sin(a + 0.3) * l * 0.5);
    ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
  }
  ctx.strokeStyle = 'rgba(10,14,18,0.95)'; ctx.lineWidth = Math.max(2, c * 0.08); ctx.stroke();
  ctx.strokeStyle = rgb(DEAD.edge); ctx.lineWidth = Math.max(1, c * 0.035); ctx.stroke();
  ctx.restore();
}

// ───────────────────────────────── life icon (LEVELS_PLAN §4.3) ─────────────────────────────────
// A pearl in a gold setting when filled; the empty gold setting when hollow. (x, y) is the top-left
// corner of a size × size slot.
export function life(ctx, x, y, size, filled, fx) {
  const k = smooth(num(fx && fx.chaos)), t = num(fx && fx.time), cx = x + size / 2, cy = y + size / 2, R = size * 0.36;
  ctx.save();
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.strokeStyle = rgb(mix3(OWN.gold, NEON.gold, k));
  if (filled) {
    pearl(ctx, cx, cy, R, size * 0.5, t, k);
    ctx.beginPath(); ctx.arc(cx, cy, R + ctx.lineWidth * 0.5, 0, TAU); ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(4,14,24,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(0.6, size * 0.03);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
