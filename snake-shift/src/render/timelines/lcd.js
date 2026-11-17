// 00 — 3310 Ghost, 1999 (id `lcd`). A generic monochrome LCD handheld. Calm on purpose:
// it ignores the beat and every effect, because the contrast is the joke.

export const meta = {
  id: 'lcd',
  name: '3310 GHOST',
  year: '1999',
  kind: '2d',
  luma: 0.6,
  veil: '#8f9f74',
  weight: 1,
  hud: {
    fg: '#1f2a19',
    bg: 'rgba(151, 168, 124, 0.94)',
    accent: '#1f2a19',
    panelFg: '#1f2a19',
    panelBg: 'rgba(151, 168, 124, 0.97)',
  },
};

const INK = '#1f2a19';
const SCREEN = '#97a87c';
const GHOST = 'rgba(31, 42, 25, 0.055)';

let cache = null; // { key, canvas }

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function frameMetrics(L) {
  const fs = Math.max(3, Math.round(L.cell * 0.3));
  const gap = Math.max(2, Math.round(L.cell * 0.16));
  return { fs, gap, out: fs + gap };
}

function screenRect(L) {
  const { out } = frameMetrics(L);
  const m = Math.max(12, Math.round(L.cell * 0.9)) + out;
  return { x: L.bx - m, y: L.by - m, w: L.bw + 2 * m, h: L.bh + 2 * m, m };
}

function buildScenery(L, scale) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(Math.max(1, Math.round(L.w * scale)), Math.max(1, Math.round(L.h * scale)))
    : Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(L.w * scale)), height: Math.max(1, Math.round(L.h * scale)) });
  const g = c.getContext('2d');
  g.scale(scale, scale);

  // Handheld body: dark plastic with a faint grain.
  const body = g.createLinearGradient(0, 0, 0, L.h);
  body.addColorStop(0, '#3a3e40');
  body.addColorStop(0.55, '#2a2d2f');
  body.addColorStop(1, '#1c1e20');
  g.fillStyle = body;
  g.fillRect(0, 0, L.w, L.h);
  let s = 1234567;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < (L.w * L.h) / 90; i++) g.fillRect(rnd() * L.w, rnd() * L.h, 1, 1);
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < (L.w * L.h) / 90; i++) g.fillRect(rnd() * L.w, rnd() * L.h, 1, 1);

  // Screen recess and glass.
  const S = screenRect(L);
  const lip = Math.max(6, Math.round(S.m * 0.35));
  rr(g, S.x - lip, S.y - lip, S.w + lip * 2, S.h + lip * 2, Math.round(S.m * 0.9) + lip);
  const lipG = g.createLinearGradient(0, S.y - lip, 0, S.y + S.h + lip);
  lipG.addColorStop(0, '#0f1011');
  lipG.addColorStop(1, '#2c2f31');
  g.fillStyle = lipG;
  g.fill();

  rr(g, S.x, S.y, S.w, S.h, Math.round(S.m * 0.8));
  const scr = g.createRadialGradient(S.x + S.w / 2, S.y + S.h / 2, Math.min(S.w, S.h) * 0.2, S.x + S.w / 2, S.y + S.h / 2, Math.max(S.w, S.h) * 0.75);
  scr.addColorStop(0, '#a0b184');
  scr.addColorStop(1, '#7f9264');
  g.fillStyle = scr;
  g.fill();
  g.save();
  g.clip();
  // Fine LCD sub-pixel grid.
  const step = Math.max(3, L.cell / 4);
  g.fillStyle = 'rgba(20, 30, 14, 0.05)';
  for (let x = S.x; x < S.x + S.w; x += step) g.fillRect(Math.round(x), S.y, 1, S.h);
  for (let y = S.y; y < S.y + S.h; y += step) g.fillRect(S.x, Math.round(y), S.w, 1);
  // Inner shadow from the bezel.
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = Math.max(4, S.m * 0.35);
  rr(g, S.x, S.y, S.w, S.h, Math.round(S.m * 0.8));
  g.stroke();
  // Glass reflection, static.
  const refl = g.createLinearGradient(S.x, S.y, S.x + S.w * 0.6, S.y + S.h * 0.6);
  refl.addColorStop(0, 'rgba(255,255,255,0.10)');
  refl.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  g.fillStyle = refl;
  g.fillRect(S.x, S.y, S.w, S.h);
  g.restore();

  // Speaker slots under the screen, if there is room.
  const below = L.h - (S.y + S.h + lip);
  if (below > 40) {
    const sw = Math.min(L.w * 0.3, 180), sh = Math.max(3, Math.round(L.cell * 0.14));
    const y0 = S.y + S.h + lip + Math.min(below * 0.4, 40);
    g.fillStyle = '#121314';
    for (let i = 0; i < 4; i++) {
      rr(g, L.w / 2 - sw / 2, y0 + i * sh * 2.4, sw, sh, sh / 2);
      g.fill();
    }
  }
  return c;
}

export function scenery(ctx, L, snap, fx) {
  const t = ctx.getTransform();
  const scale = Math.abs(t.a) || 1;
  const key = `${L.w}x${L.h}x${L.cell}@${scale}`;
  if (!cache || cache.key !== key) cache = { key, canvas: buildScenery(L, scale) };
  ctx.drawImage(cache.canvas, 0, 0, L.w, L.h);
}

function px(ctx, x, y, w, h) {
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function board(ctx, L, snap, fx) {
  const { cell, bx, by, bw, bh } = L;
  const { fs, gap, out } = frameMetrics(L);

  // Own panel, so scenery never shows through the cells.
  ctx.fillStyle = SCREEN;
  ctx.fillRect(bx - out - 2, by - out - 2, bw + 2 * out + 4, bh + 2 * out + 4);

  // Unlit LCD blocks: the ghost of every cell.
  const ins = Math.max(1, Math.round(cell * 0.1));
  ctx.fillStyle = GHOST;
  for (let y = 0; y < snap.rows; y++) {
    for (let x = 0; x < snap.cols; x++) px(ctx, bx + x * cell + ins, by + y * cell + ins, cell - 2 * ins, cell - 2 * ins);
  }

  // Lethal edge: a chain of small square blocks just outside the board.
  ctx.fillStyle = INK;
  const x0 = bx - out, y0 = by - out, W = bw + 2 * out, H = bh + 2 * out;
  const n = Math.max(2, Math.round((W - fs) / (fs + Math.max(1, Math.round(fs * 0.25)))) + 1);
  const sp = (W - fs) / (n - 1);
  for (let i = 0; i < n; i++) {
    px(ctx, x0 + i * sp, y0, fs, fs);
    px(ctx, x0 + i * sp, y0 + H - fs, fs, fs);
  }
  const m = Math.max(2, Math.round((H - fs) / (fs + Math.max(1, Math.round(fs * 0.25)))) + 1);
  const sq = (H - fs) / (m - 1);
  for (let i = 1; i < m - 1; i++) {
    px(ctx, x0, y0 + i * sq, fs, fs);
    px(ctx, x0 + W - fs, y0 + i * sq, fs, fs);
  }

  // Dot: a four-pixel diamond.
  if (snap.food) {
    const p = Math.max(2, Math.round(cell * 0.24));
    const cx = bx + snap.food.x * cell + cell / 2, cy = by + snap.food.y * cell + cell / 2;
    ctx.fillStyle = INK;
    px(ctx, cx - p / 2, cy - p / 2 - p, p, p);
    px(ctx, cx - p / 2 - p, cy - p / 2, p, p);
    px(ctx, cx - p / 2 + p, cy - p / 2, p, p);
    px(ctx, cx - p / 2, cy - p / 2 + p, p, p);
  }

  const snake = snap.snake || [];
  const dead = !snap.alive;
  // Gap-safe (LEVELS_PLAN 3.3): every cell is its own block, nothing joins two cells. The small tail
  // block only marks the real tail; when the body runs on off the board, its last visible cell is plain.
  const tailOn = !(snap.length > snake.length);
  const lw = Math.max(1, Math.round(cell * 0.12));
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;

  // Body (tail is a smaller block, so head, body and tail differ by shape).
  for (let i = snake.length - 1; i >= 1; i--) {
    const c = snake[i];
    const tail = i === snake.length - 1 && tailOn;
    const k = tail ? Math.max(ins, Math.round(cell * 0.22)) : ins;
    const x = bx + c.x * cell + k, y = by + c.y * cell + k, s = cell - 2 * k;
    if (dead) {
      ctx.strokeRect(Math.round(x) + lw / 2, Math.round(y) + lw / 2, Math.round(s) - lw, Math.round(s) - lw);
    } else {
      px(ctx, x, y, s, s);
    }
  }

  // Head: a block with an eye and a notched mouth facing the direction of travel.
  const h = snake[0];
  if (h) drawHead(ctx, snap, L, h, ins, lw, dead);
  bite(ctx, L, fx);
}

function drawHead(ctx, snap, L, h, ins, lw, dead) {
  const { cell, bx, by } = L;
  const hx = bx + h.x * cell + ins, hy = by + h.y * cell + ins, hs = cell - 2 * ins;
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[snap.dir] || [1, 0];
  if (dead) {
    ctx.strokeRect(Math.round(hx) + lw / 2, Math.round(hy) + lw / 2, Math.round(hs) - lw, Math.round(hs) - lw);
    ctx.beginPath();
    ctx.moveTo(hx + hs * 0.22, hy + hs * 0.22); ctx.lineTo(hx + hs * 0.78, hy + hs * 0.78);
    ctx.moveTo(hx + hs * 0.78, hy + hs * 0.22); ctx.lineTo(hx + hs * 0.22, hy + hs * 0.78);
    ctx.stroke();
  } else {
    px(ctx, hx, hy, hs, hs);
    ctx.fillStyle = SCREEN;
    const e = Math.max(2, Math.round(cell * 0.18));
    const cx = hx + hs / 2, cy = hy + hs / 2;
    const lx = d[1], ly = -d[0]; // left of travel
    // eye: forward and to the left of travel
    px(ctx, cx + d[0] * hs * 0.16 + lx * hs * 0.2 - e / 2, cy + d[1] * hs * 0.16 + ly * hs * 0.2 - e / 2, e, e);
    // mouth: a notch in the leading edge, right of travel
    const md = Math.max(2, Math.round(hs * 0.22)), mw = Math.max(2, Math.round(hs * 0.2));
    const mx = cx + d[0] * (hs / 2 - md / 2) - lx * hs * 0.16;
    const my = cy + d[1] * (hs / 2 - md / 2) - ly * hs * 0.16;
    const rw = d[0] !== 0 ? md : mw, rh = d[0] !== 0 ? mw : md;
    px(ctx, mx - rw / 2, my - rh / 2, rw, rh);
    ctx.fillStyle = INK;
  }
}

// Bite: a calm, stepped pixel burst at the bitten cell.
function bite(ctx, L, fx) {
  const { cell, bx, by, bw, bh } = L;
  if (fx && fx.bite && fx.biteAge < 360) {
    const stepN = 1 + Math.floor(fx.biteAge / 90);
    const p = Math.max(2, Math.round(cell * 0.16));
    const cx = bx + fx.bite.x * cell + cell / 2, cy = by + fx.bite.y * cell + cell / 2;
    const r = cell * (0.55 + stepN * 0.32);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.fillStyle = INK;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      px(ctx, cx + Math.cos(a) * r - p / 2, cy + Math.sin(a) * r - p / 2, p, p);
    }
    ctx.restore();
  }
}

// Life slot (LEVELS_PLAN 4.3): an LCD pixel block. Filled = a lit block with a pale bevel pixel;
// hollow = an unlit ghost block inside a block outline. Pixel-snapped, calm, ignores fx.
export function life(ctx, x, y, size, filled, fx) {
  const s = Math.max(6, Math.round(size * 0.74)), x0 = Math.round(x + (size - s) / 2), y0 = Math.round(y + (size - s) / 2);
  const t = Math.max(2, Math.round(size * 0.14));
  ctx.save();
  if (filled) {
    ctx.fillStyle = INK; ctx.fillRect(x0, y0, s, s);
    const q = Math.max(1, Math.round(s * 0.18));
    ctx.fillStyle = SCREEN; ctx.fillRect(x0 + t, y0 + t, q, q);
  } else {
    ctx.fillStyle = 'rgba(31, 42, 25, 0.12)'; ctx.fillRect(x0, y0, s, s);
    ctx.fillStyle = INK;
    ctx.fillRect(x0, y0, s, t); ctx.fillRect(x0, y0 + s - t, s, t);
    ctx.fillRect(x0, y0 + t, t, s - 2 * t); ctx.fillRect(x0 + s - t, y0 + t, t, s - 2 * t);
  }
  ctx.restore();
}
