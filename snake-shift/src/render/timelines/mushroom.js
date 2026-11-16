// SNAKE//SHIFT — universe MUSHROOM LAND, 1991. Flat Canvas 2D (stream mushroom, levels wave 1).
// Contracts: BUILD_PLAN.md §15.3 (flat timeline), LEVELS_PLAN.md §3.3 (breaks), §3.5 (mushroom), §4.3 (life icon).
// Everything is pixel art drawn into small low-resolution buffers and upscaled nearest-neighbour.
//   scenery(): banded dusk sky, pixel sun, drifting block clouds, terraced cubic hills with moss mantles and
//              waterfalls, giant stepped toadstools that bounce on the beat, a fern-and-toadstool frame around
//              the board, rising spores. Blends from its own 16-colour palette to neon as fx.chaos rises.
//   board():   navy board at R board-pixels per cell, cream rail as the lethal edge, coral/cream checker snake
//              (inset blocks, full notched head with eyes, small tail), magenta spore-orb dot, and the life
//              mushroom: a tall bell cap in mint and gold bands on a cream stem. Cells are exact.
// Pure apart from caches. Original designs only.

const TAU = Math.PI * 2;
const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const R = 10;   // board pixels per cell
const M = 4;    // rail width in board pixels

function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: clamp(num(fx.beat), 0, 1), beatIndex: num(fx.beatIndex) | 0, chaos: clamp(num(fx.chaos), 0, 1),
    punch: clamp(num(fx.punch), 0, 1), variant: num(fx.variant) | 0, bite: fx.bite && Number.isFinite(fx.bite.x) ? fx.bite : null,
    biteAge: Number.isFinite(fx.biteAge) ? fx.biteAge : Infinity, rf: !!fx.reducedFlash, rm: !!fx.reducedMotion,
  };
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// own pixel style -> neon: nothing below chaos 0.15, fully neon from 0.9
export const neonMix = (chaos) => smooth(0.15, 0.9, chaos);

export const meta = {
  id: 'mushroom', name: 'MUSHROOM LAND', year: '1991', kind: '2d',
  luma: 0.22, veil: '#1c1a5a', weight: 0.9, rules: 'box', mushrooms: true,
  hud: { fg: '#f6e7c8', bg: '#0c1040', accent: '#7ff0c8', panelFg: '#f6e7c8', panelBg: 'rgba(12,16,64,0.92)' },
};

// ───────────────────────────── palettes ─────────────────────────────

// Board palette: own -> neon, mixed by chaos. The board stays the same across variants (crisp).
const BOARD_OWN = {
  panel: '#101a5e', grid: '#1f2d82', gridDot: '#3b4fb4', railInk: '#0a0a28', rail: '#f6e7c8', railHi: '#ffffff', railShade: '#9a86d8',
  a: '#e8583f', b: '#f6e7c8', ink: '#3a0f22', eye: '#ffffff', pupil: '#0a0a28',
  dot: '#ff4fd0', dotHi: '#ffd0f4', dotDark: '#a01a8a', dotInk: '#3a0630',
  mint: '#7ff0c8', gold: '#f4c84a', mInk: '#0e3a3a', mHi: '#e8fff6', stem: '#f6e7c8', stemShade: '#c8b48a',
};
const BOARD_NEON = {
  panel: '#0b0838', grid: '#24127a', gridDot: '#2bd8ff', railInk: '#05010f', rail: '#ff4fd8', railHi: '#ffffff', railShade: '#2bf0ff',
  a: '#ff3f8a', b: '#d8fff6', ink: '#2a0030', eye: '#ffffff', pupil: '#05010f',
  dot: '#ff5ae8', dotHi: '#ffffff', dotDark: '#b0128a', dotInk: '#2a0026',
  mint: '#5affc8', gold: '#ffe14a', mInk: '#003a30', mHi: '#ffffff', stem: '#f0fff8', stemShade: '#9ad8c8',
};
const DEAD = { a: '#5c5878', b: '#8f8aa8', ink: '#22203a', eye: '#8f8aa8', pupil: '#22203a' };
const BO = {}, BN = {};
for (const k in BOARD_OWN) { BO[k] = hex(BOARD_OWN[k]); BN[k] = hex(BOARD_NEON[k]); }

const BPAL = new Map();
function boardPal(q) {
  let p = BPAL.get(q);
  if (!p) { p = {}; for (const k in BO) p[k] = css(lerp3(BO[k], BN[k], q)); BPAL.set(q, p); }
  return p;
}

// ───────────────────────────── sprites (R x R board pixels) ─────────────────────────────

const BODY = ['..........', '.oooooooo.', '.oaaabbbo.', '.oaaabbbo.', '.oaaabbbo.', '.obbbaaao.', '.obbbaaao.', '.obbbaaao.', '.oooooooo.', '..........'];
const TAIL = ['..........', '..........', '..oooooo..', '..oaabbo..', '..oaabbo..', '..obbaao..', '..obbaao..', '..oooooo..', '..........', '..........'];
// head points right (+x); rotated for the other directions
const HEAD = ['..oooooo..', '.oaaaaaao.', 'oabbawwaao', 'oabbawkaao', 'oaaaaaaaao', 'oaaaaaaaao', 'oabbawkaao', 'oabbawwaao', '.oaaaaaao.', '..oooooo..'];
const HEAD_DEAD = ['..oooooo..', '.oaaaaaao.', 'oabbaaaaao', 'oabbakkaao', 'oaaaaaaaao', 'oaaaaaaaao', 'oabbakkaao', 'oabbaaaaao', '.oaaaaaao.', '..oooooo..'];
// life mushroom: tall bell cap, gold tip, mint and gold bands, gold rim, gill shade, cream stem. No face, no spots.
const MUSH = ['....oo....', '...oggo...', '..omhmmo..', '..oggggo..', '.ommmmmmo.', '.ommmmmmo.', 'oggggggggo', '.oodssdoo.', '...osso...', '...osso...'];
// HUD life icon: the same bell toadstool at 8 x 8
const LIFE = ['...oo...', '..oggo..', '.ommmmo.', '.oggggo.', 'ommmmmmo', 'oggggggo', '..osso..', '..osso..'];

function rotRows(rows, q) {   // q quarter turns clockwise (screen y down): right -> down -> left -> up
  let r = rows;
  for (let k = 0; k < q; k++) {
    const h = r.length, w = r[0].length, out = [];
    for (let y = 0; y < w; y++) { let s = ''; for (let x = 0; x < h; x++) s += r[h - 1 - x][y]; out.push(s); }
    r = out;
  }
  return r;
}
function paintRows(g, rows, map, ox = 0, oy = 0, px = 1) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = map[row[x]];
      if (col) { g.fillStyle = col; g.fillRect(ox + x * px, oy + y * px, px, px); }
    }
  }
}
function spriteOf(rows, map) { const c = mk(rows[0].length, rows.length); paintRows(c.getContext('2d'), rows, map); return c; }
const DOT = (() => {   // round spore orb, generated
  const rows = [];
  for (let y = 0; y < R; y++) {
    let s = '';
    for (let x = 0; x < R; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      s += d > 4.3 ? '.' : d > 3.3 ? 'o' : Math.hypot(x - 3.2, y - 3.1) < 1.3 ? 'h' : x + y > 10 ? 'd' : 'p';
    }
    rows.push(s);
  }
  return rows;
})();

const SPR = new Map();
function sprites(q, dead) {
  const key = q + (dead ? 'd' : 'a');
  let S = SPR.get(key);
  if (S) return S;
  const P = boardPal(q), D = dead ? DEAD : P;
  const sm = (a, b) => ({ o: D.ink, a, b, w: D.eye, k: D.pupil });
  const headRows = dead ? HEAD_DEAD : HEAD;
  S = {
    body: [spriteOf(BODY, sm(D.a, D.b)), spriteOf(BODY, sm(D.b, D.a))],
    tail: [spriteOf(TAIL, sm(D.a, D.b)), spriteOf(TAIL, sm(D.b, D.a))],
    head: { right: spriteOf(headRows, sm(D.a, D.b)), down: spriteOf(rotRows(headRows, 1), sm(D.a, D.b)),
      left: spriteOf(rotRows(headRows, 2), sm(D.a, D.b)), up: spriteOf(rotRows(headRows, 3), sm(D.a, D.b)) },
    dot: spriteOf(DOT, { o: P.dotInk, p: P.dot, h: P.dotHi, d: P.dotDark }),
    mush: spriteOf(MUSH, { o: P.mInk, g: P.gold, m: P.mint, h: P.mHi, d: P.stemShade, s: P.stem }),
    ink: D.ink, a: D.a,
  };
  if (SPR.size > 40) SPR.clear();
  SPR.set(key, S);
  return S;
}

// ───────────────────────────── mushroom life tracking ─────────────────────────────
// The snapshot (§3.3) has no age for the mushroom. Use mushroom.ttl / .left / .expires or snap.mushroomLeft when the
// rules provide one; otherwise track the spawn tick here. Shared with rooms/mushroom.js, so whichever look is showing
// keeps the clock right. Returns ticks left (fractional), Infinity when unknown.
const MT = { key: null, born: 0 };
export function mushroomLeft(snap) {
  const m = snap && snap.mushroom;
  if (!m) { MT.key = null; return Infinity; }
  const prog = clamp(num(snap.progress, 0), 0, 1);
  for (const k of ['ttl', 'left', 'ticksLeft']) if (Number.isFinite(m[k])) return m[k] - prog;
  if (Number.isFinite(snap.mushroomLeft)) return snap.mushroomLeft - prog;
  const t = num(snap.tick);
  if (Number.isFinite(m.expires)) return m.expires - t - prog;
  const key = X(m) + ',' + Y(m);
  if (MT.key !== key || t < MT.born) { MT.key = key; MT.born = t; }
  return 80 - (t - MT.born) - prog;
}
// 1 while fresh, easing down to 0.3 over the last 20 ticks; never blinks.
export function mushroomFade(snap) { return 0.3 + 0.7 * smooth(0, 20, mushroomLeft(snap)); }

// ───────────────────────────── board ─────────────────────────────

const BS = { key: '', c: null };   // static board layer
const BW = { c: null, g: null };   // working buffer

function paintStatic(g, cols, rows, P) {
  const W = cols * R + 2 * M, H = rows * R + 2 * M;
  // rail: ink outline, cream bricks with seams, lavender inner shadow
  g.fillStyle = P.railInk; g.fillRect(0, 0, W, H);
  g.fillStyle = P.rail; g.fillRect(1, 1, W - 2, H - 2);
  g.fillStyle = P.railShade; g.fillRect(M - 1, M - 1, W - 2 * M + 2, H - 2 * M + 2);
  g.fillStyle = P.railInk;
  for (let x = 3; x < W - 2; x += 6) { g.fillRect(x, 1, 1, M - 2); g.fillRect(x + 3, H - M + 1, 1, M - 2); }
  for (let y = 3; y < H - 2; y += 6) { g.fillRect(1, y, M - 2, 1); g.fillRect(W - M + 1, y + 3, M - 2, 1); }
  // panel and grid (grid on cell edges only, so cell centres stay one colour)
  g.fillStyle = P.panel; g.fillRect(M, M, cols * R, rows * R);
  g.fillStyle = P.grid;
  for (let i = 1; i < cols; i++) g.fillRect(M + i * R, M, 1, rows * R);
  for (let j = 1; j < rows; j++) g.fillRect(M, M + j * R, cols * R, 1);
  g.fillStyle = P.gridDot;
  for (let i = 1; i < cols; i++) for (let j = 1; j < rows; j++) g.fillRect(M + i * R, M + j * R, 1, 1);
}

const adj = (a, b) => Math.abs(X(a) - X(b)) + Math.abs(Y(a) - Y(b)) === 1;
function breakSet(snap) { const b = snap.breaks; return b && b.length ? new Set(b) : null; }

function headDir(snap, br) {
  const s = snap.snake;
  if (s.length > 1 && !(br && br.has(0)) && adj(s[0], s[1])) {
    const dx = X(s[0]) - X(s[1]), dy = Y(s[0]) - Y(s[1]);
    return dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
  }
  return DIRS[snap.dir] ? snap.dir : 'right';
}

function drawSnakeLow(g, snap, fx, S, cols, rows) {
  const s = snap.snake || [], n = s.length;
  if (!n) return;
  const br = breakSet(snap), on = (c) => X(c) >= 0 && Y(c) >= 0 && X(c) < cols && Y(c) < rows;
  // bridges between joined neighbours: 4 board pixels across, drawn under the blocks
  for (let i = 0; i + 1 < n; i++) {
    const a = s[i], b = s[i + 1];
    if ((br && br.has(i)) || !adj(a, b) || !on(a) || !on(b)) continue;
    const ax = M + X(a) * R, ay = M + Y(a) * R, dx = X(b) - X(a), dy = Y(b) - Y(a);
    if (dx) {
      const x0 = dx > 0 ? ax + 6 : ax - 6;
      g.fillStyle = S.ink; g.fillRect(x0, ay + 3, 10, 4);
      g.fillStyle = S.a; g.fillRect(x0, ay + 4, 10, 2);
    } else {
      const y0 = dy > 0 ? ay + 6 : ay - 6;
      g.fillStyle = S.ink; g.fillRect(ax + 3, y0, 4, 10);
      g.fillStyle = S.a; g.fillRect(ax + 4, y0, 2, 10);
    }
  }
  for (let i = n - 1; i >= 1; i--) {
    const c = s[i];
    if (!on(c)) continue;
    const tail = i === n - 1 && n > 2;
    g.drawImage((tail ? S.tail : S.body)[i & 1], M + X(c) * R, M + Y(c) * R);
  }
  const h = s[0];
  if (!on(h)) return;
  const hd = headDir(snap, br), hx = M + X(h) * R, hy = M + Y(h) * R;
  g.drawImage(S.head[hd], hx, hy);
  // forked tongue on the beat (alive only), two pixels past the front edge
  if (snap.alive !== false && fx.beat > 0.55 && !fx.rf) {
    const d = DIRS[hd];
    g.fillStyle = '#ff2a6a';
    if (d[0]) { const tx = d[0] > 0 ? hx + R : hx - 2; g.fillRect(tx, hy + 4, 2, 2); g.fillRect(tx + d[0], hy + 3, 1, 1); g.fillRect(tx + d[0], hy + 6, 1, 1); }
    else { const ty = d[1] > 0 ? hy + R : hy - 2; g.fillRect(hx + 4, ty, 2, 2); g.fillRect(hx + 3, ty + d[1], 1, 1); g.fillRect(hx + 6, ty + d[1], 1, 1); }
  }
}

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), cols = L.cols || 16, rows = L.rows || 16;
  const q = Math.round(neonMix(fx.chaos) * 8) / 8, P = boardPal(q);
  const W = cols * R + 2 * M, H = rows * R + 2 * M;
  const key = [cols, rows, q].join();
  if (BS.key !== key || !BS.c) {
    BS.c = mk(W, H); paintStatic(BS.c.getContext('2d'), cols, rows, P); BS.key = key;
    BW.c = mk(W, H); BW.g = BW.c.getContext('2d');
  }
  const g = BW.g, dead = snap.alive === false, S = sprites(q, dead), A = sprites(q, false);
  g.globalAlpha = 1;
  g.drawImage(BS.c, 0, 0);
  // the rail glints on the beat: a cream run chases round it
  if (fx.beat > 0.05) {
    g.globalAlpha = 0.55 * fx.beat; g.fillStyle = P.railHi;
    const per = 2 * (W + H), k = mod(fx.beatIndex * 23, per);
    for (let i = 0; i < 4; i++) {
      const p = mod(k + (i * per) / 4, per);
      if (p < W) g.fillRect(p, 1, 6, 1); else if (p < W + H) g.fillRect(W - 2, p - W, 1, 6);
      else if (p < 2 * W + H) g.fillRect(2 * W + H - p, H - 2, 6, 1); else g.fillRect(1, per - p, 1, 6);
    }
    g.globalAlpha = 1;
  }
  // dot: spore orb, with corner sparkles on the beat (inside its own cell)
  const f = snap.food;
  if (f && X(f) >= 0 && Y(f) >= 0 && X(f) < cols && Y(f) < rows) {
    const fx0 = M + X(f) * R, fy0 = M + Y(f) * R;
    g.drawImage(A.dot, fx0, fy0);
    if (fx.beat > 0.4) {
      g.fillStyle = P.dotHi;
      g.fillRect(fx0 + 8, fy0 + 1, 1, 1); g.fillRect(fx0 + 1, fy0 + 8, 1, 1);
      if (fx.beat > 0.75) { g.fillRect(fx0 + 8, fy0, 1, 1); g.fillRect(fx0 + 9, fy0 + 1, 1, 1); }
    }
  }
  // life mushroom: gentle one-pixel hop and drifting spores; fades (never blinks) as it nears expiry
  const m = snap.mushroom;
  if (m && X(m) >= 0 && Y(m) >= 0 && X(m) < cols && Y(m) < rows) {
    const mx = M + X(m) * R, my = M + Y(m) * R;
    g.globalAlpha = mushroomFade(snap);
    const hop = fx.rm ? 0 : Math.sin(fx.time * 2.3) > 0.4 ? -1 : 0;
    g.drawImage(A.mush, mx, my + hop);
    if (!fx.rm) {
      for (let k = 0; k < 2; k++) {
        const ph = (fx.time * 0.9 + k * 0.5) % 1;
        g.fillStyle = k ? P.gold : P.mHi;
        g.fillRect(mx + (k ? 8 : 1), my + 3 - Math.floor(ph * 4), 1, 1);
      }
    }
    g.globalAlpha = 1;
  }
  drawSnakeLow(g, snap, fx, S, cols, rows);
  // respawn: the short snake breathes gently while waiting for a key
  if (snap.waiting === 'respawn' && !dead && snap.snake) {
    g.globalAlpha = 0.28 * (0.5 + 0.5 * Math.sin(fx.time * 4)); g.fillStyle = '#ffffff';
    for (const c of snap.snake) if (X(c) >= 0 && Y(c) >= 0 && X(c) < cols && Y(c) < rows) g.fillRect(M + X(c) * R + 2, M + Y(c) * R + 2, R - 4, R - 4);
    g.globalAlpha = 1;
  }
  const s = L.cell / R;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(BW.c, L.bx - M * s, L.by - M * s, W * s, H * s);
  ctx.imageSmoothingEnabled = true;
  biteBurst(ctx, L, fx, P);
  ctx.restore();
}

// Bite: eight square sparks fly out between the neighbouring cell centres; gone after 450 ms.
function biteBurst(ctx, L, fx, P) {
  if (!fx.bite || fx.biteAge > 450) return;
  const t = fx.biteAge / 450, c = L.cell, cx = L.bx + (fx.bite.x + 0.5) * c, cy = L.by + (fx.bite.y + 0.5) * c;
  const sz = Math.max(2, Math.round(c * 0.16 * (1 - t))), r = c * (0.45 + 0.9 * t);
  ctx.globalAlpha = 1 - t;
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * (TAU / 8);
    ctx.fillStyle = i & 1 ? P.mint : P.dotHi;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r - sz / 2), Math.round(cy + Math.sin(a) * r - sz / 2), sz, sz);
  }
  ctx.globalAlpha = 1;
}

// ───────────────────────────── HUD life icon (§4.3) ─────────────────────────────
// (x, y) is the top-left of a size x size slot. Filled: the bell toadstool in mint and gold. Hollow: outline only.
export function life(ctx, x, y, size, filled, fx) {
  const px = Math.max(1, Math.floor(size / 8)), o = Math.round((size - px * 8) / 2);
  const q = Math.round(neonMix(fx && Number.isFinite(fx.chaos) ? fx.chaos : 0) * 8) / 8, P = boardPal(q);
  ctx.save();
  const map = filled ? { o: P.mInk, g: P.gold, m: P.mint, s: P.stem }
    : { o: '#c8c0f0', g: 'rgba(200,192,240,0.12)', m: 'rgba(200,192,240,0.12)', s: 'rgba(200,192,240,0.12)' };
  paintRows(ctx, LIFE, map, Math.round(x) + o, Math.round(y) + o, px);
  ctx.restore();
}

// ───────────────────────────── scenery ─────────────────────────────

// Four own palettes (one per bite, cycling) and two neon ones. Sixteen-ish colours each, 1991 style.
const OWN = [
  { sky: ['#0b1040', '#1a1f6b', '#3a2f8f', '#6a4fb8', '#b07ad0'], sun: '#f6d36b', sunHi: '#fff2b0', hillA: '#4a3f9a', hillB: '#6a4fb0', hillS: '#2c2470',
    moss: '#3c9a3c', mossHi: '#8bd448', mossD: '#1f5a2a', water: '#5aa8ff', waterHi: '#d8f4ff', cloud: '#f6e7c8', cloudS: '#a99ad8',
    capA: '#e0533f', capAH: '#ff8a5a', capB: '#7a5cc8', capBH: '#b49af0', capC: '#2fb8a8', capCH: '#7ff0c8', band: '#f6e7c8',
    stem: '#f2e2c0', stemS: '#c0a880', gill: '#8a6a5a', fern: '#3c8a3a', fernHi: '#8bd448', ground: '#0e1446', ground2: '#2a2470', dither: '#5a4ab0', coral: '#ff6a5a', ink: '#0a0a28' },
  { sky: ['#12307e', '#2a52c0', '#4a80e0', '#78b4f0', '#c8ecff'], sun: '#fff2a0', sunHi: '#ffffff', hillA: '#2f6a9a', hillB: '#3f8ab0', hillS: '#1f4a7a',
    moss: '#46a83c', mossHi: '#a8e05a', mossD: '#1f6a2a', water: '#8ad0ff', waterHi: '#ffffff', cloud: '#ffffff', cloudS: '#b8c8f0',
    capA: '#f2a03a', capAH: '#ffd27a', capB: '#e0533f', capBH: '#ff9a7a', capC: '#7a5cc8', capCH: '#c0a8ff', band: '#fff4dc',
    stem: '#fff0d0', stemS: '#d0b890', gill: '#9a7a6a', fern: '#2f8a4a', fernHi: '#9ae07a', ground: '#14286a', ground2: '#2a4a9a', dither: '#3a6ac0', coral: '#ff7a5a', ink: '#0a1430' },
  { sky: ['#1c0a36', '#3e1764', '#6a2584', '#b0478f', '#ff9aa8'], sun: '#ffd0a0', sunHi: '#fff4e0', hillA: '#5a2a6a', hillB: '#7a3a80', hillS: '#3a1848',
    moss: '#5aa83c', mossHi: '#c8f05a', mossD: '#2a5a2a', water: '#9ab8ff', waterHi: '#f0f4ff', cloud: '#ffd8e0', cloudS: '#c08ab8',
    capA: '#2fb8a8', capAH: '#8af0d8', capB: '#f4c84a', capBH: '#fff09a', capC: '#e0533f', capCH: '#ff9a7a', band: '#fff0f4',
    stem: '#fae6d6', stemS: '#c89a9a', gill: '#8a5a6a', fern: '#4a9a4a', fernHi: '#b8e86a', ground: '#1a0c3a', ground2: '#3a1a5a', dither: '#7a3a9a', coral: '#ffb04a', ink: '#120620' },
  { sky: ['#04142a', '#0a2a4a', '#145a6a', '#2a8a7a', '#8ad0a0'], sun: '#e8f8d0', sunHi: '#ffffff', hillA: '#1a4a5a', hillB: '#2a6a6a', hillS: '#0a2a3a',
    moss: '#3cb05a', mossHi: '#9af07a', mossD: '#1a5a3a', water: '#6ae0f0', waterHi: '#e0ffff', cloud: '#e0f4e8', cloudS: '#8ab8b0',
    capA: '#ff7a5a', capAH: '#ffb89a', capB: '#b06ae0', capBH: '#e0b0ff', capC: '#f4c84a', capCH: '#fff09a', band: '#f0fff0',
    stem: '#eef6dc', stemS: '#a8b890', gill: '#5a7a6a', fern: '#2a9a5a', fernHi: '#8af0a0', ground: '#04182a', ground2: '#0a3a4a', dither: '#1a6a7a', coral: '#ff8a7a', ink: '#020a14' },
];
const NEON = [
  { sky: ['#05010f', '#12032e', '#2a0656', '#6a0a8a', '#ff2bd6'], sun: '#ff4fd8', sunHi: '#ffe81a', hillA: '#1a0640', hillB: '#260a5a', hillS: '#0c0224',
    moss: '#39ff6a', mossHi: '#c8ff5a', mossD: '#0a8a3a', water: '#2bf0ff', waterHi: '#ffffff', cloud: '#ff8af0', cloudS: '#2bb8ff',
    capA: '#ff2bd6', capAH: '#ff9af0', capB: '#2bf0ff', capBH: '#c8ffff', capC: '#ffe81a', capCH: '#fff6a0', band: '#ffffff',
    stem: '#d8fff8', stemS: '#7a5aff', gill: '#ff2bd6', fern: '#1aff8a', fernHi: '#c8ff5a', ground: '#06021a', ground2: '#1a0640', dither: '#5a0aa0', coral: '#ff3b6a', ink: '#000000' },
  { sky: ['#000814', '#001a3a', '#003a6a', '#0a6a9a', '#2bf0ff'], sun: '#2bf0ff', sunHi: '#ffffff', hillA: '#0a1a40', hillB: '#10265a', hillS: '#040a20',
    moss: '#ff2bd6', mossHi: '#ffb0f0', mossD: '#8a0a7a', water: '#ff8af0', waterHi: '#ffffff', cloud: '#2bf0ff', cloudS: '#ff2bd6',
    capA: '#ffe81a', capAH: '#fff6a0', capB: '#39ff6a', capBH: '#c8ffc8', capC: '#ff2bd6', capCH: '#ff9af0', band: '#ffffff',
    stem: '#f0f8ff', stemS: '#2b8aff', gill: '#2bf0ff', fern: '#ff2bd6', fernHi: '#ffb0f0', ground: '#000814', ground2: '#0a1a40', dither: '#003a8a', coral: '#ffe81a', ink: '#000000' },
];
const OWNR = OWN.map(rgbSet), NEONR = NEON.map(rgbSet);
function rgbSet(p) { const o = {}; for (const k in p) o[k] = Array.isArray(p[k]) ? p[k].map(hex) : hex(p[k]); return o; }
const SPAL = new Map();
function scenePal(v, q) {
  const key = mod(v, 4) * 100 + mod(v, 2) * 10 + Math.round(q * 8);
  let p = SPAL.get(key);
  if (p) return p;
  const a = OWNR[mod(v, 4)], b = NEONR[mod(v, 2)], t = Math.round(q * 8) / 8;
  p = {};
  for (const k in a) p[k] = Array.isArray(a[k][0]) ? a[k].map((c, i) => css(lerp3(c, b[k][i], t))) : css(lerp3(a[k], b[k], t));
  if (SPAL.size > 80) SPAL.clear();
  SPAL.set(key, p);
  return p;
}

const LOW = { c: null, g: null, w: 0, h: 0, P: 0 };
const LAY = { key: '', v: null };
const DITHER = new Map();
function lowBuf(L) {
  const P = Math.max(2, Math.round(Math.min(L.w, L.h) / 190)), w = Math.ceil(L.w / P) + 1, h = Math.ceil(L.h / P) + 1;
  if (!LOW.c || LOW.w !== w || LOW.h !== h || LOW.P !== P) { LOW.c = mk(w, h); LOW.g = LOW.c.getContext('2d'); Object.assign(LOW, { w, h, P }); }
  LOW.g.imageSmoothingEnabled = false;
  return LOW;
}
function dither(g, col) {   // 2x2 checker pattern in one colour, transparent elsewhere
  let p = DITHER.get(col);
  if (!p) {
    const c = mk(2, 2), q = c.getContext('2d');
    q.fillStyle = col; q.fillRect(0, 0, 1, 1); q.fillRect(1, 1, 1, 1);
    p = g.createPattern(c, 'repeat');
    if (DITHER.size > 120) DITHER.clear();
    DITHER.set(col, p);
  }
  return p;
}
const R0 = (v) => Math.round(v);

// Layout in low-res pixels, rebuilt only when the canvas or board size changes.
function layoutOf(W, H, b) {
  const key = [W, H, R0(b.x), R0(b.y), R0(b.w)].join();
  if (LAY.key === key) return LAY.v;
  const land = b.x > W * 0.14;
  const hz = R0(land ? H * 0.62 : Math.max(H * 0.2, b.y + 3));
  const hills = [];
  const nh = land ? 9 : 6;
  for (let i = 0; i < nh; i++) {
    const far = i % 2 === 0;
    const cx = ((i + 0.5) / nh + (hash(i * 3.7) - 0.5) * 0.08) * W;
    const w0 = W * (land ? 0.16 : 0.32) * (0.7 + 0.6 * hash(i * 5.1)) * (far ? 1.15 : 0.9);
    const tiers = 3 + Math.floor(hash(i * 7.9) * 3), th = Math.max(4, R0((land ? H * 0.07 : hz * 0.12) * (0.8 + 0.5 * hash(i * 9.3)) * (far ? 1.1 : 0.85)));
    hills.push({ cx, w0, tiers, th, far, fall: !far && hash(i * 11.7) > 0.35, seed: i * 13.1 });
  }
  hills.sort((a, c) => (c.far ? 1 : 0) - (a.far ? 1 : 0));
  const stools = [];
  if (land) {
    const sideW = b.x - 4;
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const x = s < 0 ? sideW * (k ? 0.72 : 0.28) : W - sideW * (k ? 0.72 : 0.28);
      const capW = Math.max(12, R0(sideW * (k ? 0.62 : 0.8)));
      stools.push({ x, base: R0(H * (k ? 0.86 : 0.97)), h: R0(H * (k ? 0.42 : 0.56)), capW, kind: k + (s > 0 ? 2 : 0) });
    }
  } else {
    for (let k = 0; k < 3; k++) {
      const x = W * [0.16, 0.84, 0.5][k], capW = R0(W * [0.34, 0.3, 0.22][k]);
      stools.push({ x, base: R0(b.y - 2 - (k === 2 ? hz * 0.18 : 0)), h: R0((b.y - 2) * [0.62, 0.7, 0.38][k]), capW, kind: k });
    }
    for (let k = 0; k < 2; k++) {
      const top = b.y + b.h + 4, room = H - top;
      if (room > 14) stools.push({ x: W * (k ? 0.78 : 0.26), base: H + 1, h: R0(room * 0.62), capW: R0(W * 0.26), kind: k + 2 });
    }
  }
  const clouds = [];
  for (let i = 0; i < 6; i++) clouds.push({ x: hash(i * 2.3) * W, y: R0((land ? H * 0.05 : hz * 0.04) + hash(i * 4.1) * (land ? H * 0.3 : hz * 0.42)), w: R0(W * (0.08 + 0.08 * hash(i * 6.7))), sp: 1.5 + 3 * hash(i * 8.3) });
  const v = { land, hz, hills, stools, clouds };
  LAY.key = key; LAY.v = v;
  return v;
}

function sky(g, W, hz, p, fx, q) {
  const n = p.sky.length, bh = hz / n;
  for (let i = 0; i < n; i++) {
    const y0 = R0(i * bh), y1 = R0((i + 1) * bh);
    g.fillStyle = p.sky[i]; g.fillRect(0, y0, W, y1 - y0 + 1);
    if (i + 1 < n) { g.fillStyle = dither(g, p.sky[i + 1]); g.fillRect(0, y1 - 2, W, 2); }
  }
  // stars in the upper bands, twinkling on the beat
  g.fillStyle = p.band;
  for (let i = 0; i < 46; i++) {
    const x = R0(hash(i * 1.37) * W), y = R0(hash(i * 2.91) * hz * 0.55);
    if (hash(i * 3.3 + fx.beatIndex * 0.71) < 0.25 + 0.4 * (1 - fx.beat)) continue;
    g.fillRect(x, y, 1, 1);
    if (fx.beat > 0.6 && i % 5 === 0) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
  // neon: a synth grid of rails sinking into the horizon
  if (q > 0.05) {
    g.globalAlpha = q * (0.45 + 0.4 * fx.beat); g.fillStyle = p.moss;
    for (let k = 0; k < 7; k++) { const y = R0(hz - (hz * 0.6) * Math.pow(0.62, k + mod(fx.time * 0.6, 1))); g.fillRect(0, y, W, 1); }
    g.globalAlpha = 1;
  }
  // horizon flare on the beat
  g.globalAlpha = 0.25 * fx.beat; g.fillStyle = p.sky[n - 1]; g.fillRect(0, hz - R0(hz * 0.18), W, R0(hz * 0.18)); g.globalAlpha = 1;
}

function sun(g, W, H, lay, p, fx, q) {
  const r = Math.max(6, R0(lay.land ? H * 0.11 : lay.hz * 0.2)), cx = R0(lay.land ? W * 0.83 : W * 0.66), cy = R0(lay.land ? H * 0.2 : lay.hz * 0.3);
  for (let dy = -r; dy <= r; dy++) {
    const hw = R0(Math.sqrt(r * r - dy * dy));
    // own: solid disc with a bright cap; neon: sliced synth sun
    if (q > 0.3 && dy > -r * 0.2 && mod(dy + R0(fx.time * 4), 5) < 1 + (dy / r) * 2) continue;
    g.fillStyle = dy < -r * 0.45 ? p.sunHi : p.sun;
    g.fillRect(cx - hw, cy + dy, hw * 2, 1);
  }
}

function clouds(g, W, lay, p, fx) {
  for (const c of lay.clouds) {
    const w = c.w, h = Math.max(3, R0(w * 0.28)), x = R0(mod(c.x + fx.time * c.sp, W + w * 2) - w), y = c.y;
    g.fillStyle = p.cloudS; g.fillRect(x, y + h - 1, w, 2);
    g.fillStyle = p.cloud;
    g.fillRect(x, y, w, h - 1);
    g.fillRect(x + R0(w * 0.15), y - R0(h * 0.6), R0(w * 0.35), R0(h * 0.6));
    g.fillRect(x + R0(w * 0.45), y - R0(h * 0.9), R0(w * 0.3), R0(h * 0.9));
  }
}

function hills(g, W, lay, p, fx) {
  const hz = lay.hz;
  for (const hl of lay.hills) {
    let top = hz;
    for (let j = 0; j < hl.tiers; j++) {
      const w = R0(hl.w0 * (1 - j * 0.2)), x = R0(hl.cx - w / 2), y = hz - (j + 1) * hl.th;
      if (w < 4) break;
      top = y;
      g.fillStyle = hl.far ? p.hillA : p.hillB; g.fillRect(x, y, w, hl.th);
      g.fillStyle = p.hillS; g.fillRect(x + R0(w * 0.72), y, w - R0(w * 0.72), hl.th);
      for (let bx = x + 5; bx < x + w - 1; bx += 6) g.fillRect(bx, y + 2, 1, hl.th - 2);   // cube seams
      // moss mantle with drips
      g.fillStyle = p.moss; g.fillRect(x - 1, y, w + 2, 2);
      g.fillStyle = fx.beat > 0.5 ? p.band : p.mossHi; g.fillRect(x, y, w, 1);
      g.fillStyle = p.mossD;
      for (let k = 0; k < w; k += 3) { const d = Math.floor(hash(hl.seed + j * 7 + k) * 4); if (d) g.fillRect(x + k, y + 2, 1, d); }
    }
    if (hl.fall) {   // waterfall from the top tier's left lip down to the ground, streaks running down
      const x = R0(hl.cx - hl.w0 * 0.25), y0 = top + 2, len = hz + 3 - y0, wd = Math.max(2, R0(hl.w0 * 0.07));
      g.fillStyle = p.water; g.fillRect(x, y0, wd, len);
      g.fillStyle = p.waterHi;
      const sp = 22 + 40 * fx.chaos;
      for (let yy = 0; yy < len; yy++) if (mod(yy - R0(fx.time * sp) + (x & 3), 6) === 0) g.fillRect(x + (yy & 1), y0 + yy, Math.max(1, wd - 2), 1);
      for (let k = -2; k <= wd + 1; k++) if (hash(k + fx.beatIndex * 3.1 + x) > 0.4) g.fillRect(x + k, hz + 1 + Math.floor(hash(k * 3 + fx.beatIndex) * 3), 1, 1);
    }
  }
}

function ground(g, W, H, lay, p, fx) {
  const hz = lay.hz;
  g.fillStyle = p.ground; g.fillRect(0, hz, W, H - hz);
  g.fillStyle = dither(g, p.dither);
  for (let i = 0; i < 14; i++) {
    const x = R0(hash(i * 5.3) * W), y = R0(hz + 3 + hash(i * 7.1) * (H - hz)), w = R0(10 + hash(i * 9.7) * W * 0.12), h = R0(3 + hash(i * 4.4) * 8);
    g.fillRect(x - (x & 1), y - (y & 1), w, h);
  }
  // shimmering pool lines just under the horizon
  g.fillStyle = p.water;
  for (let k = 0; k < 4; k++) { const y = hz + 2 + k * 3, o = R0(mod(fx.time * (6 + k * 3), 12)); for (let x = -12 + o; x < W; x += 12) g.fillRect(x, y, 5 - k, 1); }
}

const CAPS = ['capA', 'capB', 'capC'];
function toadstool(g, st, i, p, fx, q) {
  const cycle = q > 0.6 && !fx.rf ? fx.beatIndex : 0;
  const ck = CAPS[mod(st.kind + fx.variant + cycle, 3)], cap = p[ck], capH = p[ck + 'H'];
  const bounce = fx.rm ? 0 : R0(fx.beat * 2 + fx.punch * 3), squash = fx.rm ? 0 : R0(fx.punch * st.capW * 0.12);
  const capW = st.capW + squash, capHgt = Math.max(4, R0(st.capW * 0.42)), sw = Math.max(2, R0(st.capW * 0.2));
  const sway = fx.rm ? 0 : R0(Math.sin(fx.time * 1.1 + i * 1.7) * 1.2);
  const capBot = st.base - st.h - bounce, x = R0(st.x);
  // stem with a skirt ring and a shaded side
  g.fillStyle = p.stem; g.fillRect(x - (sw >> 1), capBot, sw, st.base - capBot);
  g.fillStyle = p.stemS; g.fillRect(x + (sw >> 1) - Math.max(1, R0(sw * 0.3)), capBot, Math.max(1, R0(sw * 0.3)), st.base - capBot);
  g.fillRect(x - (sw >> 1) - 1, capBot + R0(st.h * 0.22), sw + 2, 2);
  // gills under the cap
  g.fillStyle = p.gill; g.fillRect(x - R0(capW * 0.4) + sway, capBot - 1, R0(capW * 0.8), 2);
  g.fillStyle = p.stemS; for (let k = -R0(capW * 0.4); k < R0(capW * 0.4); k += 2) g.fillRect(x + k + sway, capBot - 1, 1, 2);
  // stepped dome: four terraces; pattern follows the bite (bands / rim / shine)
  const pat = mod(fx.variant + st.kind, 3), steps = 4, sh = Math.max(1, R0(capHgt / steps));
  for (let j = 0; j < steps; j++) {
    const w = R0(capW * (1 - j * 0.2)), y = capBot - 1 - (j + 1) * sh;
    g.fillStyle = pat === 0 ? (j % 2 ? capH : cap) : cap;
    g.fillRect(x - (w >> 1) + sway, y, w, sh);
  }
  if (pat === 1) { g.fillStyle = p.band; g.fillRect(x - (capW >> 1) + sway, capBot - 1 - sh, capW, Math.max(1, sh >> 1)); }
  if (pat === 2) { g.fillStyle = capH; for (let j = 1; j < steps; j++) { const w = R0(capW * (1 - j * 0.2)); g.fillRect(x - (w >> 1) + 1 + sway, capBot - 1 - (j + 1) * sh, Math.max(1, R0(w * 0.18)), 1); } }
  g.fillStyle = p.ink; g.fillRect(x - (capW >> 1) + sway, capBot - 1, capW, 1);
  return { x: x + sway, y: capBot - capHgt * 0.5, r: capW * 0.7, col: cap };
}

// Frame of ferns and little toadstools hugging the rail.
function frame(g, b, p, fx) {
  const x0 = R0(b.x), y0 = R0(b.y), x1 = R0(b.x + b.w), y1 = R0(b.y + b.h), T = Math.max(3, R0(b.cell * 0.9));
  g.fillStyle = dither(g, p.dither);
  g.fillRect(x0 - T, y0 - T, x1 - x0 + 2 * T, T); g.fillRect(x0 - T, y1, x1 - x0 + 2 * T, T);
  g.fillRect(x0 - T, y0, T, y1 - y0); g.fillRect(x1, y0, T, y1 - y0);
  // ferns hang down both sides: a stalk with leaflets that sway
  const step = Math.max(5, R0(b.cell * 1.6));
  for (const side of [-1, 1]) {
    for (let y = y0 - T + 2, k = 0; y < y1 + T - 4; y += step, k++) {
      const bx = side < 0 ? x0 - 2 - (k % 2) * 2 : x1 + 1 + (k % 2) * 2, len = Math.max(4, R0(step * 1.1));
      const sw = fx.rm ? 0 : Math.sin(fx.time * 1.6 + k + side) * 1.5;
      for (let j = 0; j < len; j++) {
        const xx = R0(bx + side * -0.5 + sw * (j / len)), yy = y + j;
        g.fillStyle = p.fern; g.fillRect(xx, yy, 1, 1);
        if (j % 2 === 0 && j < len - 1) { g.fillStyle = j % 4 ? p.fern : p.fernHi; g.fillRect(xx - 2, yy + 1, 2, 1); g.fillRect(xx + 1, yy + 1, 2, 1); }
      }
    }
  }
  // little toadstools along top and bottom, hopping in turns on the beat
  const n = Math.max(4, Math.floor((x1 - x0) / Math.max(6, b.cell * 2)));
  for (const top of [true, false]) {
    for (let i = 0; i <= n; i++) {
      const x = R0(x0 + ((x1 - x0) * i) / n), hop = !fx.rm && (i + (top ? 0 : 1) + fx.beatIndex) % 2 === 0 ? R0(fx.beat * 2) : 0;
      const w = 3 + ((i * 7) % 3) * 2, base = top ? y0 - 1 : y1 + T, hgt = Math.max(3, R0(T * 0.8)) - (top ? 0 : 1);
      const ck = CAPS[mod(i + fx.variant, 3)];
      g.fillStyle = p.stem; g.fillRect(x - 1, base - hgt + 2 - hop, 2, hgt - 2);
      g.fillStyle = p[ck]; g.fillRect(x - (w >> 1), base - hgt - hop, w, 2); g.fillRect(x - (w >> 1) + 1, base - hgt - 1 - hop, w - 2, 1);
      g.fillStyle = p[ck + 'H']; g.fillRect(x - (w >> 1) + 1, base - hgt - hop, 1, 1);
    }
  }
}

function spores(g, W, H, p, fx, q) {
  const n = R0(26 + 80 * q), cols = [p.capAH, p.capCH, p.sunHi];
  for (let i = 0; i < n; i++) {
    if (hash(i * 4.7 + fx.beatIndex * 0.37) < 0.15) continue;
    const sp = 6 + 14 * hash(i * 1.9) + 20 * q, x = R0(hash(i * 3.1) * W + Math.sin(fx.time * 0.8 + i) * 2);
    const y = R0(H - mod(hash(i * 5.3) * H + fx.time * sp, H + 4));
    g.fillStyle = cols[i % 3];
    const s = q > 0.5 && fx.beat > 0.5 && i % 3 === 0 ? 2 : 1;
    g.fillRect(x, y, s, s);
  }
}

export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), q = neonMix(fx.chaos), p = scenePal(fx.variant, q);
  const B = lowBuf(L), g = B.g, P = B.P, W = B.w, H = B.h;
  const s = L.cell / R, rail = M * s;
  const b = { x: (L.bx - rail) / P, y: (L.by - rail) / P, w: (L.bw + 2 * rail) / P, h: (L.bh + 2 * rail) / P, cell: L.cell / P };
  const lay = layoutOf(W, H, b);
  sky(g, W, lay.hz, p, fx, q);
  sun(g, W, H, lay, p, fx, q);
  clouds(g, W, lay, p, fx);
  hills(g, W, lay, p, fx);
  ground(g, W, H, lay, p, fx);
  const glows = [];
  lay.stools.forEach((st, i) => glows.push(toadstool(g, st, i, p, fx, q)));
  frame(g, b, p, fx);
  spores(g, W, H, p, fx, q);
  // bite: a square pixel shock ring rolls out under the board
  if (fx.bite && fx.biteAge < 700) {
    const t = fx.biteAge / 700, cx = (L.bx + (fx.bite.x + 0.5) * L.cell) / P, cy = (L.by + (fx.bite.y + 0.5) * L.cell) / P, r = R0(4 + t * Math.max(W, H) * 0.7);
    g.fillStyle = p.capAH; g.globalAlpha = 1 - t;
    g.fillRect(R0(cx - r), R0(cy - r), 2 * r, 2); g.fillRect(R0(cx - r), R0(cy + r), 2 * r, 2);
    g.fillRect(R0(cx - r), R0(cy - r), 2, 2 * r); g.fillRect(R0(cx + r), R0(cy - r), 2, 2 * r + 2);
    g.globalAlpha = 1;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(B.c, 0, 0, W * P, H * P);
  ctx.imageSmoothingEnabled = true;
  // neon: soft halos behind the caps and a beat-pumped haze (a handful of gradients only)
  if (q > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    for (const gl of glows) {
      const x = gl.x * P, y = gl.y * P, r = gl.r * P * (1.2 + 0.3 * fx.beat);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, gl.col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = q * (0.3 + 0.35 * fx.beat); ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (fx.punch > 0.02) {
    ctx.fillStyle = q > 0.5 ? (fx.variant % 2 ? '#2bf0ff' : '#ff2bd6') : '#f6e7c8';
    ctx.globalAlpha = fx.punch * 0.5; ctx.fillRect(0, 0, L.w, L.h); ctx.globalAlpha = 1;
  }
  ctx.restore();
}
