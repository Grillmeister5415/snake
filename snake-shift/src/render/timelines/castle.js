// SNAKE//SHIFT — CASTLE CUBE, ONCE. Flat Canvas 2D look of the cube universe (stream castle-2d).
// Contract: BUILD_PLAN.md §15.3, LEVELS_PLAN.md 3.3 / 3.4 / 6. The board is the current face of the
// cube only: a soft watercolour wash, four open seams drawn as soft doorways (never walls), a
// ribbon-and-flower serpent, a berry dot, and a storybook border of gardens, towers and clouds.
// Self-contained on purpose (no imports), so it loads even if a sibling file fails.

const TAU = Math.PI * 2;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: clamp01(num(fx.beat)), beatIndex: num(fx.beatIndex) | 0, chaos: clamp01(num(fx.chaos)),
    punch: clamp01(num(fx.punch)), variant: num(fx.variant) | 0, bite: fx.bite || null,
    biteAge: Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity, rf: !!fx.reducedFlash, rm: !!fx.reducedMotion,
  };
}
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
  return DIRS[snap.dir] || [0, -1];
}
const faceOf = (snap) => { const sp = snap && snap.space; return sp && sp.kind === 'cube' ? (num(sp.face) | 0) % 6 : 0; };

export const meta = {
  id: 'castle', name: 'CASTLE CUBE', year: 'ONCE', kind: '2d',
  luma: 0.78, veil: '#e9dcef', weight: 1,
  hud: { fg: '#5a3a6e', bg: '#fbf3e6', accent: '#e8558f', panelFg: '#5a3a6e', panelBg: 'rgba(251,243,230,0.94)' },
};

// Six faces, six washes: each face is tinted a little differently so arriving on a new one reads.
const FACES = [
  { wash: '#fbe6ea', tint: '#f3b8c8', ink: '#c2577d', name: 'rose', neon: '#ff7ab8' },
  { wash: '#e4f4e6', tint: '#a8dcb4', ink: '#4f9a66', name: 'mint', neon: '#4dffa6' },
  { wash: '#e3eefb', tint: '#a9c8f0', ink: '#4f78b8', name: 'sky', neon: '#5fb0ff' },
  { wash: '#fbf4d8', tint: '#f0dc8c', ink: '#b6902c', name: 'lemon', neon: '#ffe14d' },
  { wash: '#eee6f8', tint: '#d4c2f0', ink: '#7a5bb4', name: 'lilac', neon: '#c08aff' },
  { wash: '#fcebdc', tint: '#f5c39c', ink: '#c27a42', name: 'peach', neon: '#ffa060' },
];
const C = { cream: '#fbf3e6', plum: '#5a3a6e', rose: '#e8558f', leaf: '#5fae6e', berry: '#7b2a6e', gold: '#f2b84a', sky: '#bcd8f4' };

// colour helpers for the pastel → glossy neon blend driven by chaos
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const SKY = [['#a9cdf2', '#3d6bff'], ['#f3ddec', '#ff4fb0'], ['#fbf1e2', '#ffd23f']];
const RAINBOW = ['#ff5a8a', '#ff9f43', '#ffe14d', '#5fd38a', '#4fb0ff', '#9a6ad8'];
const S = { cloud: {} };

export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), { w, h } = L, k = fx.chaos, dpr = dprOf(ctx);
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  SKY.forEach(([p, n], i) => g.addColorStop(i / 2, mix(p, n, k * 0.85)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  sun(ctx, w * 0.84, h * 0.13, Math.min(w, h) * 0.09, fx);
  if (k > 0.2) {
    // a glossy rainbow arcs behind everything as chaos rises
    ctx.globalAlpha = Math.min(0.7, (k - 0.2) * 1.2);
    const R = Math.max(w, h) * 0.62, lw = R * 0.045;
    RAINBOW.forEach((col, i) => {
      ctx.strokeStyle = col; ctx.lineWidth = lw + 1;
      ctx.beginPath(); ctx.arc(w * 0.5, h * 1.05, R - i * lw, Math.PI, TAU); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  const spr = cloudSprite(dpr, k > 0.5);
  const n = 9, speed = 10 + 40 * k;
  for (let i = 0; i < n; i++) {
    const sc = (0.45 + hash(i + 2) * 0.7) * Math.max(0.6, Math.min(w, h) / 700) * (1 + 0.06 * fx.beat);
    const cw = 220 * sc, ch = 110 * sc;
    const x = ((hash(i) * (w + cw) + fx.time * speed * (0.4 + hash(i + 9))) % (w + cw)) - cw;
    const y = hash(i + 3) * h * 0.92 - ch * 0.4;
    ctx.drawImage(spr, x, y, cw, ch);
  }
  islands(ctx, L, fx);
  garden(ctx, L, fx);
  petals(ctx, L, fx);
  if (fx.punch > 0) {
    ctx.fillStyle = `rgba(255,236,246,${0.45 * fx.punch})`; ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
function sun(ctx, x, y, r, fx) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(fx.time * (0.2 + fx.chaos * 0.8));
  const rays = 12, len = r * (1.5 + 0.5 * fx.beat + 0.6 * fx.punch);
  ctx.fillStyle = fx.chaos > 0.5 ? 'rgba(255,90,170,0.55)' : 'rgba(255,214,120,0.55)';
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU, b = a + TAU / rays / 2.6;
    ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.lineTo(Math.cos((a + b) / 2) * len, Math.sin((a + b) / 2) * len); ctx.lineTo(Math.cos(b) * r * 0.9, Math.sin(b) * r * 0.9);
  }
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#fffbe0'); g.addColorStop(0.7, mix('#ffe58a', '#ffd23f', fx.chaos)); g.addColorStop(1, mix('#f6c75a', '#ff6fb0', fx.chaos));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.restore();
}
function cloudSprite(dpr, glossy) {
  const slot = S.cloud;
  return layer(slot, [dpr, glossy].join(), 220, 110, dpr, (g) => {
    const puffs = [[60, 70, 34], [100, 52, 44], [148, 62, 36], [180, 78, 24], [36, 84, 22], [110, 84, 30]];
    g.fillStyle = glossy ? 'rgba(255,214,240,0.95)' : 'rgba(208,196,232,0.55)';
    g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y + 6); g.arc(x, y + 6, r, 0, TAU); } g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill();
    g.fillStyle = glossy ? 'rgba(255,255,255,1)' : 'rgba(255,250,240,0.9)';
    g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x - r * 0.1 + r * 0.45, y - r * 0.35); g.arc(x - r * 0.1, y - r * 0.35, r * 0.45, 0, TAU); } g.fill();
  });
}
const BLOOMS = [['#ff8fb8', '#fff3a8'], ['#fffaf2', '#f2b84a'], ['#b79cf0', '#fff3a8'], ['#ffb27a', '#7b2a6e'], ['#8fc8ff', '#fffaf2']];
const bloom = (i, v) => BLOOMS[(i + v) % BLOOMS.length];
// floating garden islands: lilac rock, grass cap, slender towers with cone roofs, vines and a waterfall
function islands(ctx, L, fx) {
  const { w, h } = L, k = fx.chaos, land = w > h * 1.1, u = Math.min(w, h) / 600;
  const spots = land ? [[0.12, 0.3, 1.1], [0.88, 0.5, 0.9], [0.1, 0.72, 0.6]] : [[0.24, 0.13, 0.9], [0.76, 0.24, 0.75]];
  spots.forEach(([px, py, sc], i) => {
    const x = px * w, y = py * h + Math.sin(fx.time * 0.8 + i * 2) * 8 * u, s = sc * u;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (i === 0) {
      // waterfall spilling off the edge
      ctx.fillStyle = mix('#cfe8ff', '#5ff0ff', k); ctx.fillRect(34, 2, 12, 120);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let j = 0; j < 6; j++) ctx.fillRect(36, ((j * 22 + fx.time * 60) % 120) + 2, 8, 6);
    }
    ctx.fillStyle = mix('#b9a3c9', '#6a3cff', k);
    ctx.beginPath(); ctx.moveTo(-70, 0); ctx.bezierCurveTo(-60, 40, -20, 88, 4, 96); ctx.bezierCurveTo(20, 70, 60, 40, 70, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,58,110,0.25)'; ctx.lineWidth = 2;
    for (const yy of [18, 38, 58]) { ctx.beginPath(); ctx.moveTo(-60 + yy * 0.6, yy); ctx.lineTo(56 - yy * 0.6, yy + 4); ctx.stroke(); }
    ctx.strokeStyle = mix('#5fae6e', '#3dff9a', k); ctx.lineWidth = 2.5;
    for (let j = 0; j < 5; j++) { const vx = -50 + j * 22; ctx.beginPath(); ctx.moveTo(vx, 4); ctx.quadraticCurveTo(vx + 6 * Math.sin(fx.time + j), 30, vx, 44 + (j % 3) * 14); ctx.stroke(); }
    ctx.fillStyle = mix('#8fd09a', '#3dff9a', k); ctx.beginPath(); ctx.ellipse(0, 0, 74, 14, 0, 0, TAU); ctx.fill();
    const towers = i === 0 ? [[-30, 70, 14], [0, 100, 18], [30, 60, 13]] : i === 1 ? [[-18, 80, 15], [16, 58, 12]] : [[0, 56, 13]];
    towers.forEach(([tx, th, tw], j) => {
      const roof = bloom(j + i, fx.variant)[0];
      ctx.fillStyle = mix('#fbf3e6', '#ffffff', k); ctx.fillRect(tx - tw / 2, -th, tw, th);
      ctx.strokeStyle = 'rgba(90,58,110,0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(tx - tw / 2, -th, tw, th);
      ctx.fillStyle = '#5a3a6e'; ctx.beginPath(); ctx.ellipse(tx, -th * 0.6, tw * 0.16, tw * 0.28, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = mix(roof, '#ff2e88', k * 0.6);
      ctx.beginPath(); ctx.moveTo(tx - tw * 0.75, -th); ctx.lineTo(tx, -th - tw * 1.9); ctx.lineTo(tx + tw * 0.75, -th); ctx.closePath(); ctx.fill();
      const fl = Math.sin(fx.time * 4 + j + i) * 3;
      ctx.fillStyle = bloom(j + 2, fx.variant)[0];
      ctx.beginPath(); ctx.moveTo(tx, -th - tw * 1.9); ctx.quadraticCurveTo(tx + 10, -th - tw * 1.9 - 4 + fl, tx + 22, -th - tw * 1.9 + fl); ctx.lineTo(tx, -th - tw * 1.9 + 7); ctx.fill();
    });
    for (let j = 0; j < 7; j++) { const [pc, hc] = bloom(j, fx.variant); flower(ctx, -60 + j * 20, -2 - (j % 2) * 4, 7 * (1 + 0.15 * fx.beat), fx.time + j, pc, hc); }
    ctx.restore();
  });
}
// rolling garden along the bottom: two hills, an arched bridge, swaying flowers that bounce on the beat
function garden(ctx, L, fx) {
  const { w, h } = L, k = fx.chaos, u = Math.min(w, h) / 600;
  const hill = (y0, amp, ph, col) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y0 + Math.sin(x / (w * 0.18) + ph) * amp);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  };
  hill(h * 0.84, 18 * u, 1, mix('#bfe3b4', '#22d48a', k));
  // stone bridge over the back hill
  const bx = w * 0.2, by = h * 0.84, bw2 = 90 * u;
  ctx.strokeStyle = mix('#d9c7b0', '#ffd23f', k); ctx.lineWidth = 9 * u;
  ctx.beginPath(); ctx.arc(bx, by + 10 * u, bw2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,58,110,0.3)'; ctx.lineWidth = 2;
  for (let j = 1; j < 6; j++) { const a = Math.PI * (1.1 + j * 0.8 / 6); ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * (bw2 - 4 * u), by + 10 * u + Math.sin(a) * (bw2 - 4 * u)); ctx.lineTo(bx + Math.cos(a) * (bw2 + 4 * u), by + 10 * u + Math.sin(a) * (bw2 + 4 * u)); ctx.stroke(); }
  hill(h * 0.92, 12 * u, 3, mix('#9fd49a', '#00c97a', k));
  const n = Math.max(8, Math.round(w / (46 * u)));
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (w / n) + (hash(i) - 0.5) * 20 * u, base = h * 0.95 + hash(i + 4) * h * 0.04;
    const st = (40 + hash(i + 7) * 50) * u * (1 + 0.12 * fx.beat), sw = Math.sin(fx.time * 1.6 + i) * 8 * u * (1 + k);
    ctx.strokeStyle = mix('#5fae6e', '#3dff9a', k); ctx.lineWidth = 2.5 * u;
    ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x, base - st * 0.6, x + sw, base - st); ctx.stroke();
    const [pc, hc] = bloom(i, fx.variant);
    flower(ctx, x + sw, base - st, (9 + hash(i + 2) * 6) * u * (1 + 0.2 * fx.beat + 0.3 * fx.punch), fx.time * 0.5 + i, k > 0.5 ? mix(pc, '#ff2e88', (k - 0.5)) : pc, hc);
  }
}
// petals drift through the sky; a bite throws a ring of them out from the board
function petals(ctx, L, fx) {
  const { w, h } = L, n = 14 + Math.round(30 * fx.chaos), u = Math.min(w, h) / 600;
  for (let i = 0; i < n; i++) {
    const x = (hash(i * 3.3) * w + Math.sin(fx.time * 0.9 + i) * 30 + fx.time * 20) % w, y = (hash(i * 7.1) * h + fx.time * (25 + hash(i) * 30)) % h;
    ctx.fillStyle = bloom(i, fx.variant)[0];
    ctx.beginPath(); ctx.ellipse(x, y, 5 * u, 2.6 * u, fx.time * 2 + i, 0, TAU); ctx.fill();
  }
  if (fx.punch > 0.02) {
    const cx = L.bx + L.bw / 2, cy = L.by + L.bh / 2, R = Math.max(L.bw, L.bh) * (0.55 + 0.6 * (1 - fx.punch));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + fx.variant;
      flower(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 10 * u * (0.6 + fx.punch), a, bloom(i, fx.variant)[0], '#fff3a8');
    }
  }
}

function dprOf(ctx) {
  const m = ctx.getTransform ? ctx.getTransform() : null;
  return Math.max(1, Math.min(3, (m && Math.hypot(m.a, m.b)) || 1));
}
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
const K = { panel: [{}, {}, {}, {}, {}, {}], sat: [{}, {}, {}, {}, {}, {}] };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), f = faceOf(snap), F = FACES[f], dpr = dprOf(ctx), { bx, by, bw, bh } = L;
  ctx.save();
  const key = [bw, bh, L.cell, dpr].join();
  blit(ctx, layer(K.panel[f], key, bw, bh, dpr, (g) => paintPanel(g, L, F, f)), bx, by, dpr);
  if (fx.chaos > 0.01) {
    // glossier and more saturated with chaos: a uniform saturated glaze plus a soft diagonal sheen
    ctx.globalAlpha = fx.chaos * 0.3;
    ctx.fillStyle = F.neon; ctx.fillRect(bx, by, bw, bh);
    ctx.globalAlpha = 1;
    const sh = ctx.createLinearGradient(bx, by, bx + bw, by + bh), p = (fx.time * 0.08) % 1;
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(Math.max(0, p - 0.08), 'rgba(255,255,255,0)');
    sh.addColorStop(p, `rgba(255,255,255,${0.16 * fx.chaos})`);
    sh.addColorStop(Math.min(1, p + 0.08), 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(bx, by, bw, bh);
  }
  doors(ctx, L, snap, fx, f, F);
  drawDot(ctx, L, snap, fx);
  drawSnake(ctx, L, snap, fx);
  biteRing(ctx, L, fx);
  ctx.restore();
}

// Neighbour faces come from the rules' cube helpers, loaded tolerantly; without them a fixed guess is used.
let SP = null;
import('../../space.js').then((m) => { SP = m; }).catch(() => {});
function neighbourFace(f, rot, d) {
  try { if (SP && SP.cubeFaceNeighbours) return SP.cubeFaceNeighbours(f)[(d + rot) & 3] % 6; } catch (e) { /* fall through */ }
  return (f + 1 + d) % 6;
}
const ENTER_EDGE = { up: 2, down: 0, left: 1, right: 3 };   // crossing heading up arrives through the bottom edge
// The four seams are open doorways, never walls: light from the next face spills through each one,
// a flowering garland swags above it, a soft stitched seam marks the fold, and towers stand at the corners.
function doors(ctx, L, snap, fx, f, F) {
  const { bx, by, bw, bh, cell } = L, m = Math.max(10, Math.round(cell * 0.8)), sp = snap.space || {};
  const rot = num(sp.rot) | 0, arrive = sp.kind === 'cube' && sp.entered ? ENTER_EDGE[sp.entered] : -1;
  const glowIn = arrive >= 0 ? 1 - clamp01(num(snap.progress)) : 0;
  ctx.save();
  for (let d = 0; d < 4; d++) {
    const N = FACES[neighbourFace(f, rot, d)];
    const [x0, y0, x1, y1] = d === 0 ? [bx, by, bx, by - m] : d === 2 ? [bx, by + bh, bx, by + bh + m] : d === 1 ? [bx + bw, by, bx + bw + m, by] : [bx, by, bx - m, by];
    const g = ctx.createLinearGradient(x0, y0, x1, y1), a = 0.85 + 0.15 * fx.beat + (d === arrive ? 0.3 * glowIn : 0);
    g.addColorStop(0, rgba(N.tint, Math.min(1, 0.9 * a))); g.addColorStop(0.5, rgba(N.wash, 0.6 * a)); g.addColorStop(1, rgba(N.wash, 0));
    ctx.fillStyle = g;
    if (d % 2 === 0) ctx.fillRect(bx, Math.min(y0, y1), bw, m); else ctx.fillRect(Math.min(x0, x1), by, m, bh);
    // an arch of light pours out through the middle of the doorway
    const len = d % 2 === 0 ? bw : bh, mx = d % 2 === 0 ? bx + bw / 2 : x0, my = d % 2 === 0 ? y0 : by + bh / 2;
    ctx.save(); ctx.translate(mx, my); ctx.rotate([Math.PI, -Math.PI / 2, 0, Math.PI / 2][d]); ctx.scale(len * 0.42, m * 1.6);
    const ag = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    ag.addColorStop(0, `rgba(255,255,255,${0.75 * a})`); ag.addColorStop(0.6, rgba(N.tint, 0.35 * a)); ag.addColorStop(1, rgba(N.tint, 0));
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI); ctx.fill(); ctx.restore();
    if (d === arrive && glowIn > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 * glowIn})`;
      if (d % 2 === 0) ctx.fillRect(bx, Math.min(y0, y1) + (d === 0 ? m * 0.5 : 0), bw, m * 0.5); else ctx.fillRect(Math.min(x0, x1) + (d === 3 ? m * 0.5 : 0), by, m * 0.5, bh);
    }
  }
  // soft stitched seam on the fold: dashes, never a solid rail
  ctx.setLineDash([Math.max(2, cell * 0.18), Math.max(3, cell * 0.22)]);
  ctx.lineDashOffset = -fx.time * cell * 0.6;
  ctx.strokeStyle = rgba(F.ink, 0.45); ctx.lineWidth = Math.max(1, cell * 0.05);
  ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
  ctx.setLineDash([]);
  garlands(ctx, L, m, fx, F);
  for (const [tx, ty] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) tower(ctx, tx, ty, m, fx, F);
  ctx.restore();
}
// garland swags just outside each doorway: leafy arcs with blossoms at the hooks
function garlands(ctx, L, m, fx, F) {
  const { bx, by, bw, bh } = L, sw = 4, sag = m * (0.22 + 0.08 * fx.beat), off = m * 0.72;
  const runs = [[bx, by - off, bx + bw, by - off, 1], [bx, by + bh + off, bx + bw, by + bh + off, -1], [bx - off, by, bx - off, by + bh, 1], [bx + bw + off, by, bx + bw + off, by + bh, -1]];
  ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1, s] of runs) {
    const vert = x0 === x1;
    ctx.strokeStyle = '#5fae6e'; ctx.lineWidth = Math.max(1.5, m * 0.09);
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let k = 1; k <= sw; k++) {
      const ax = x0 + ((x1 - x0) * (k - 0.5)) / sw, ay = y0 + ((y1 - y0) * (k - 0.5)) / sw;
      const ex = x0 + ((x1 - x0) * k) / sw, ey = y0 + ((y1 - y0) * k) / sw;
      ctx.quadraticCurveTo(ax + (vert ? s * sag * 2 : 0), ay + (vert ? 0 : s * sag * 2), ex, ey);
    }
    ctx.stroke();
    for (let k = 0; k <= sw; k++) {
      const hx = x0 + ((x1 - x0) * k) / sw, hy = y0 + ((y1 - y0) * k) / sw;
      flower(ctx, hx, hy, m * 0.26, fx.time * 0.7 + k, k % 2 ? '#ffd1e3' : '#fffaf2', k % 2 ? '#f2b84a' : F.ink, 5);
    }
  }
}
// a small storybook tower at a corner: round body, window, cone roof and a waving pennant
function tower(ctx, x, y, m, fx, F) {
  const w = m * 0.62, h = m * 0.9, sway = Math.sin(fx.time * 3 + x * 0.01) * 0.3;
  ctx.save(); ctx.translate(x, y + h * 0.35);
  ctx.fillStyle = '#fbf3e6'; ctx.strokeStyle = rgba(F.ink, 0.9); ctx.lineWidth = Math.max(1, m * 0.06);
  ctx.beginPath(); ctx.rect(-w / 2, -h * 0.6, w, h * 0.6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a3a6e'; ctx.beginPath(); ctx.ellipse(0, -h * 0.34, w * 0.13, w * 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = F.ink; ctx.beginPath(); ctx.moveTo(-w * 0.62, -h * 0.58); ctx.lineTo(0, -h * 1.25); ctx.lineTo(w * 0.62, -h * 0.58); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a3a6e'; ctx.beginPath(); ctx.moveTo(0, -h * 1.25); ctx.lineTo(0, -h * 1.5); ctx.stroke();
  ctx.fillStyle = '#e8558f'; ctx.beginPath(); ctx.moveTo(0, -h * 1.5); ctx.quadraticCurveTo(w * 0.4, -h * (1.47 + sway * 0.1), w * 0.8, -h * 1.42); ctx.lineTo(0, -h * 1.36); ctx.fill();
  ctx.restore();
}

// A faint painted emblem marks each face: heart, leaf, moon, star, crown, swirl (kept faint so cells stay exact).
function emblem(g, x, y, R, f, F) {
  g.save(); g.translate(x, y);
  g.fillStyle = rgba(F.ink, 0.06); g.strokeStyle = rgba(F.ink, 0.06); g.lineWidth = R * 0.16; g.lineCap = 'round';
  g.beginPath();
  if (f === 0) {
    g.moveTo(0, R * 0.8); g.bezierCurveTo(-R * 1.2, -R * 0.1, -R * 0.6, -R * 1.0, 0, -R * 0.35); g.bezierCurveTo(R * 0.6, -R * 1.0, R * 1.2, -R * 0.1, 0, R * 0.8); g.fill();
  } else if (f === 1) {
    g.moveTo(0, -R); g.quadraticCurveTo(R * 0.9, 0, 0, R); g.quadraticCurveTo(-R * 0.9, 0, 0, -R); g.fill();
    g.beginPath(); g.moveTo(0, -R * 0.8); g.lineTo(0, R * 1.15); g.stroke();
  } else if (f === 2) {
    g.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, true); g.arc(R * 1.5167, 0, R * 1.8166, 2.558, 3.725, false); g.closePath(); g.fill();
  } else if (f === 3) {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.42 : R; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
  } else if (f === 4) {
    g.moveTo(-R, R * 0.5); g.lineTo(-R, -R * 0.5); g.lineTo(-R * 0.5, 0); g.lineTo(0, -R * 0.8); g.lineTo(R * 0.5, 0); g.lineTo(R, -R * 0.5); g.lineTo(R, R * 0.5); g.closePath(); g.fill();
  } else {
    for (let a = 0; a < TAU * 2.2; a += 0.12) { const r = R * 0.12 + (a / (TAU * 2.2)) * R * 0.85; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.stroke();
  }
  g.restore();
}

// Watercolour wash: soft pigment blooms, paper grain and barely visible seams between tiles.
function paintPanel(g, L, F, f) {
  const { bw, bh, cell } = L;
  g.fillStyle = F.wash; g.fillRect(0, 0, bw, bh);
  for (let i = 0; i < 26; i++) {
    const x = hash(i * 3.1 + f * 17) * bw, y = hash(i * 5.7 + f * 29) * bh, r = cell * (1.6 + hash(i + f * 7) * 3.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = i % 3 ? F.tint : '#ffffff';
    gr.addColorStop(0, rgba(col, i % 3 ? 0.12 : 0.2)); gr.addColorStop(0.7, rgba(col, i % 3 ? 0.045 : 0.06)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const px = x * cell, py = y * cell, h = hash(x * 31 + y * 17 + f);
    const gr = g.createRadialGradient(px + cell * 0.45, py + cell * 0.42, cell * 0.12, px + cell / 2, py + cell / 2, cell * 0.75);
    gr.addColorStop(0, `rgba(255,255,255,${0.05 + 0.04 * h})`); gr.addColorStop(0.7, 'rgba(255,255,255,0)'); gr.addColorStop(1, rgba(F.ink, 0.07));
    g.fillStyle = gr; g.fillRect(px, py, cell, cell);
  }
  emblem(g, bw / 2, bh / 2, cell * 3.4, f, F);
  g.globalAlpha = 0.5;
  for (let i = 0, n = Math.floor((bw * bh) / 70); i < n; i++) {
    g.fillStyle = i % 2 ? rgba(F.ink, 0.08) : 'rgba(255,255,255,0.35)';
    g.fillRect(hash(i * 1.37 + f) * bw, hash(i * 2.11 + 5 + f) * bh, 1.2, 1.2);
  }
  g.globalAlpha = 1;
}

function drawDot(ctx, L, snap, fx) {
  const f = snap.food;
  if (!f) return;
  const c = L.cell, cx = L.bx + (X(f) + 0.5) * c, cy = L.by + (Y(f) + 0.5) * c;
  ctx.save();
  ctx.fillStyle = 'rgba(90,58,110,0.18)'; ctx.beginPath(); ctx.ellipse(cx, cy + c * 0.3, c * 0.3, c * 0.09, 0, 0, TAU); ctx.fill();
  ctx.translate(cx, cy + c * 0.04); ctx.scale(c * (1 + 0.07 * fx.beat), c * (1 + 0.07 * fx.beat));
  berry(ctx, 0.35, fx.chaos);
  ctx.restore();
}
// A bramble berry: a cluster of drupelets, two leaves and a tiny blossom (unit size, centred).
function berry(ctx, R, chaos = 0, hollow = false) {
  const d = R * 0.38, pts = [[0, 0]];
  for (let k = 0; k < 6; k++) pts.push([Math.cos(k * TAU / 6 + 0.3) * d * 1.55, Math.sin(k * TAU / 6 + 0.3) * d * 1.55]);
  const body = chaos > 0.5 ? '#a0185e' : '#7b2a6e', hi = chaos > 0.5 ? '#ff6fb0' : '#c46aa8';
  if (hollow) {
    ctx.strokeStyle = '#7b2a6e'; ctx.lineWidth = R * 0.12; ctx.globalAlpha = 0.8;
    ctx.beginPath(); for (const [x, y] of pts.slice(1)) { ctx.moveTo(x + d, y); ctx.arc(x, y, d, 0, TAU); } ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    for (const [x, y] of pts) {
      const g = ctx.createRadialGradient(x - d * 0.35, y - d * 0.4, d * 0.1, x, y, d * 1.05);
      g.addColorStop(0, hi); g.addColorStop(0.55, body); g.addColorStop(1, '#3e0f3a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, d * 1.02, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x - d * 0.35, y - d * 0.38, d * 0.2, 0, TAU); ctx.fill();
    }
  }
  ctx.fillStyle = '#4f9a5e';
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sg * R * 0.32, -R * 0.98, R * 0.36, R * 0.15, sg * 0.5, 0, TAU); ctx.fill(); }
  flower(ctx, 0, -R * 1.02, R * 0.32, 0.4, '#fffaf2', '#f2b84a');
}
// Bite: a crisp ring of petals inside the bitten cell only, so the board stays exact.
function biteRing(ctx, L, fx) {
  if (!fx.bite || fx.biteAge > 450) return;
  const c = L.cell, k = fx.biteAge / 450, cx = L.bx + (X(fx.bite) + 0.5) * c, cy = L.by + (Y(fx.bite) + 0.5) * c;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, c * 0.07 * (1 - k));
  ctx.beginPath(); ctx.arc(cx, cy, c * (0.3 + 0.17 * k), 0, TAU); ctx.stroke();
  for (let j = 0; j < 6; j++) {
    const a = j * TAU / 6 + k * 2, r = c * (0.28 + 0.16 * k);
    flower(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c * 0.08, a, '#ffd1e3', '#f2b84a', 4);
  }
  ctx.restore();
}

// Ribbon palettes: live (shifted by variant), dead (faded linen, no flashing).
const RIBBONS = [
  { hem: '#9c2a5e', band: '#e8558f', satin: '#ff9cc0', head: '#c8306f', petal: '#fffaf2', heart: '#f2b84a', leaf: '#4f9a5e' },
  { hem: '#6a3a9c', band: '#9a6ad8', satin: '#c8a8f4', head: '#7d46c0', petal: '#fff6fb', heart: '#ff7aa8', leaf: '#4f9a5e' },
  { hem: '#b04a1e', band: '#f0784a', satin: '#ffb48e', head: '#d2582a', petal: '#fffaf0', heart: '#7b2a6e', leaf: '#3f8c52' },
];
// the ribbon never matches its own face: lilac skips the violet ribbon, peach skips the coral one
function ribbonFor(face, variant) {
  let p = ((variant % 3) + 3) % 3;
  if ((face === 4 && p === 1) || (face === 5 && p === 2)) p = 0;
  return RIBBONS[p];
}
const DEAD = { hem: '#7d7078', band: '#b7a9b1', satin: '#ddd3d8', head: '#9a8c95', petal: '#e9e2dc', heart: '#a8998f', leaf: '#8f9a8c' };
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// one band piece: a disc at the centre plus a strip to every joined neighbour's shared edge
function band(ctx, cx, cy, c, half, links, tailDir) {
  ctx.beginPath();
  ctx.moveTo(cx + half, cy); ctx.arc(cx, cy, half, 0, TAU);
  for (const [dx, dy] of links) {
    if (dx) ctx.rect(dx > 0 ? cx : cx - c / 2, cy - half, c / 2, 2 * half);
    else ctx.rect(cx - half, dy > 0 ? cy : cy - c / 2, 2 * half, c / 2);
  }
  if (tailDir) {
    // swallowtail: the real end of the ribbon is cut with a V notch
    const [dx, dy] = tailDir, px = -dy, py = dx, e = c * 0.44, n = c * 0.2;
    ctx.moveTo(cx + px * half, cy + py * half);
    ctx.lineTo(cx + dx * e + px * half, cy + dy * e + py * half);
    ctx.lineTo(cx + dx * (e - n), cy + dy * (e - n));
    ctx.lineTo(cx + dx * e - px * half, cy + dy * e - py * half);
    ctx.lineTo(cx - px * half, cy - py * half);
    ctx.closePath();
  }
  ctx.fill();
}
function flower(ctx, x, y, r, rot, petal, heart, k = 5) {
  ctx.fillStyle = petal; ctx.beginPath();
  for (let j = 0; j < k; j++) {
    const a = rot + (j / k) * TAU, px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.55;
    ctx.moveTo(px + r * 0.45, py); ctx.arc(px, py, r * 0.45, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = heart; ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, TAU); ctx.fill();
}
function leaves(ctx, x, y, c, horiz, col) {
  ctx.fillStyle = col;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    const ax = horiz ? x + sgn * c * 0.12 : x, ay = horiz ? y : y + sgn * c * 0.12;
    ctx.ellipse(ax, ay, c * (horiz ? 0.13 : 0.07), c * (horiz ? 0.07 : 0.13), sgn * 0.6, 0, TAU);
    ctx.fill();
  }
}

function drawSnake(ctx, L, snap, fx) {
  const s = snap.snake;
  if (!s || !s.length) return;
  const c = L.cell, n = s.length, dead = snap.alive === false, P = dead ? DEAD : ribbonFor(faceOf(snap), fx.variant);
  const half = c * 0.3, realTail = !(snap.length > n) && n > 1;
  ctx.save();
  const links = [];
  for (let i = 0; i < n; i++) {
    const a = s[i], l = [];
    if (i > 0 && joined(snap, i - 1)) l.push([X(s[i - 1]) - X(a), Y(s[i - 1]) - Y(a)]);
    if (i < n - 1 && joined(snap, i)) l.push([X(s[i + 1]) - X(a), Y(s[i + 1]) - Y(a)]);
    links.push(l);
  }
  const tailDir = (i) => (i === n - 1 && realTail && links[i].length === 1 ? [-links[i][0][0], -links[i][0][1]] : null);
  // pass 1: hem; pass 2: ribbon; pass 3: satin stripe; pass 4: flowers and leaves
  for (const [col, hw] of [[P.hem, half + Math.max(1, c * 0.05)], [P.band, half], [P.satin, half * 0.26]]) {
    ctx.fillStyle = col;
    for (let i = n - 1; i >= 1; i--) band(ctx, L.bx + (X(s[i]) + 0.5) * c, L.by + (Y(s[i]) + 0.5) * c, c, hw, links[i], col === P.satin ? null : tailDir(i));
  }
  for (let i = n - 1; i >= 1; i--) {
    const cx = L.bx + (X(s[i]) + 0.5) * c, cy = L.by + (Y(s[i]) + 0.5) * c, l = links[i];
    const horiz = l.length ? l[0][0] !== 0 : true;
    if (i % 2) flower(ctx, cx, cy, c * 0.26, i * 0.7 + (dead ? 0 : fx.time * 0.6), P.petal, P.heart);
    else { leaves(ctx, cx, cy, c, horiz, P.leaf); ctx.fillStyle = P.heart; ctx.beginPath(); ctx.arc(cx, cy, c * 0.07, 0, TAU); ctx.fill(); }
  }
  drawHead(ctx, L, snap, fx, P, dead, links[0]);
  ctx.restore();
}

// Head: a teardrop bud pointing forward, a satin bow at the neck, a crown flower and two eyes.
function drawHead(ctx, L, snap, fx, P, dead, link) {
  const c = L.cell, h = snap.snake[0], d = headDir(snap), cx = L.bx + (X(h) + 0.5) * c, cy = L.by + (Y(h) + 0.5) * c;
  if (link.length) {
    ctx.fillStyle = P.hem; band(ctx, cx, cy, c, c * 0.3 + Math.max(1, c * 0.05), link);
    ctx.fillStyle = P.band; band(ctx, cx, cy, c, c * 0.3, link);
  }
  if (snap.waiting && !dead) {
    const r = c * (0.56 + 0.04 * Math.sin(fx.time * 5));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(2, c * 0.09);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.setLineDash([c * 0.16, c * 0.1]); ctx.lineDashOffset = -fx.time * c * 0.5;
    ctx.strokeStyle = P.hem; ctx.lineWidth = Math.max(1.2, c * 0.045); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(Math.atan2(d[1], d[0])); ctx.scale(c, c);
  // bow at the neck (behind the head)
  ctx.fillStyle = P.satin; ctx.strokeStyle = P.hem; ctx.lineWidth = 0.04;
  for (const sg of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(-0.38, sg * 0.2, 0.17, 0.1, sg * -0.9, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // bud body
  ctx.beginPath();
  ctx.moveTo(0.48, 0);
  ctx.bezierCurveTo(0.42, 0.3, 0.16, 0.43, -0.1, 0.41);
  ctx.bezierCurveTo(-0.36, 0.39, -0.44, 0.2, -0.44, 0);
  ctx.bezierCurveTo(-0.44, -0.2, -0.36, -0.39, -0.1, -0.41);
  ctx.bezierCurveTo(0.16, -0.43, 0.42, -0.3, 0.48, 0);
  ctx.closePath();
  ctx.fillStyle = P.head; ctx.fill();
  ctx.lineWidth = 0.05; ctx.strokeStyle = P.hem; ctx.stroke();
  // satin sheen along the crown
  ctx.fillStyle = rgba(P.satin, 0.55); ctx.beginPath(); ctx.ellipse(-0.05, -0.2, 0.26, 0.07, 0.15, 0, TAU); ctx.fill();
  // knot of the bow
  ctx.fillStyle = P.heart; ctx.beginPath(); ctx.arc(-0.4, 0, 0.075, 0, TAU); ctx.fill();
  // crown flower on top of the head
  flower(ctx, -0.24, 0, 0.15, dead ? 0.3 : fx.time * 0.8, P.petal, P.heart);
  // eyes
  for (const sg of [-1, 1]) {
    const ex = 0.2, ey = sg * 0.19;
    if (dead) {
      ctx.strokeStyle = '#4a3a44'; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(ex - 0.07, ey - 0.07); ctx.lineTo(ex + 0.07, ey + 0.07); ctx.moveTo(ex + 0.07, ey - 0.07); ctx.lineTo(ex - 0.07, ey + 0.07); ctx.stroke();
    } else {
      ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.arc(ex, ey, 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2348'; ctx.beginPath(); ctx.arc(ex + 0.03, ey, 0.062, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex + 0.045, ey - 0.025, 0.022, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,150,180,0.55)'; ctx.beginPath(); ctx.arc(ex - 0.08, sg * 0.3, 0.05, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// Life slot (LEVELS_PLAN 4.3): a berry. Filled = plum berry with a leaf; hollow = an outline.
export function life(ctx, x, y, size, filled, fx) {
  ctx.save();
  ctx.translate(x + size / 2, y + size * 0.58); ctx.scale(size, size);
  berry(ctx, 0.3, fx ? num(fx.chaos) : 0, !filled);
  ctx.restore();
}
