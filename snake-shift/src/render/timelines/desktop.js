// SNAKE//SHIFT — timeline 10: DESKTOP ERROR, 1995. Flat Canvas 2D (stream flat-b).
// Contract: BUILD_PLAN.md §15.3. scenery() paints the desktop, icons, taskbar and the pile of error
// dialogs (always outside the board window); board() paints the app window, grid, lethal edge,
// snake (a trail of dragged windows), dot (a desktop icon) and the bite zoom. Pure apart from caches.
// Generic mid-90s look only: no real operating-system names, logos or icons.

const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
const mod = (a, n) => ((a % n) + n) % n;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: num(fx.beat), beatIndex: num(fx.beatIndex) | 0, chaos: Math.max(0, Math.min(1, num(fx.chaos))),
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

export const meta = {
  id: 'desktop', name: 'DESKTOP ERROR', year: '1995', kind: '2d',
  luma: 0.45, veil: '#3f8a88', weight: 2,
  // A wall or self crash here shows the blue crash screen below instead of the director's
  // inversion, strobe, veil and LIFE LOST card (director.js reads this flag).
  crashScreen: true,
  hud: { fg: '#000000', bg: '#c0c0c0', accent: '#000080', panelFg: '#000000', panelBg: 'rgba(192,192,192,0.97)' },
};

// Window-chrome greys and the per-variant accent (title bars, desktop tint).
const G = { face: '#c0c0c0', hi: '#ffffff', lite: '#dfdfdf', shade: '#808080', dark: '#000000', text: '#000000' };
const ACC = [
  { bar: '#000080', bar2: '#1084d0', desk: '#008080' },
  { bar: '#800000', bar2: '#d04010', desk: '#007878' },
  { bar: '#006000', bar2: '#30a050', desk: '#0a7f86' },
  { bar: '#600080', bar2: '#b040d0', desk: '#00807a' },
];
const DEAD_BAR = ['#808080', '#a8a8a8'];
const C = { desk: {}, board: {}, task: {} };
const FONT = (px, bold) => `${bold ? 'bold ' : ''}${px}px "MS Sans Serif", Tahoma, Verdana, Arial, sans-serif`;

// 3D bevel: raised (out) or sunken (in), two pixel rings like 90s chrome.
function bevel(g, x, y, w, h, out = true, face = G.face) {
  g.fillStyle = face; g.fillRect(x, y, w, h);
  const a = out ? G.hi : G.dark, b = out ? G.dark : G.hi, a2 = out ? G.lite : G.shade, b2 = out ? G.shade : G.lite;
  g.fillStyle = a; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
  g.fillStyle = b; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
  if (w > 4 && h > 4) {
    g.fillStyle = a2; g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2);
    g.fillStyle = b2; g.fillRect(x + 1, y + h - 2, w - 2, 1); g.fillRect(x + w - 2, y + 1, 1, h - 2);
  }
}
function titleBar(g, x, y, w, h, c1, c2) {
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}

// ───────────────────────────── board ─────────────────────────────

const BOARD_BG = '#06121a', GRID = '#163844';
const frameM = (L) => Math.max(4, Math.round(L.cell * 0.22));
const titleH = (L) => Math.max(14, Math.min(26, Math.round(L.cell * 0.62)));
// Whole app-window rectangle in CSS px (frame + title bar + client): scenery keeps dialogs out of it.
export function windowRect(L) {
  const m = frameM(L), th = titleH(L);
  return { x: L.bx - m, y: L.by - m - th, w: L.bw + 2 * m, h: L.bh + 2 * m + th, m, th };
}

function paintBoard(g, L, a) {
  const r = windowRect(L), ox = r.x, oy = r.y;
  bevel(g, 0, 0, r.w, r.h, true);
  titleBar(g, 3, 3, r.w - 6, r.th - 2, a.bar, a.bar2);
  const fs = Math.max(9, Math.round(r.th * 0.62));
  g.font = FONT(fs, true); g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.fillText(L.w < 520 ? 'SNAKE.EXE' : 'SNAKE.EXE - [ untitled timeline ]', 7, 3 + (r.th - 2) / 2 + 0.5);
  const bs = r.th - 6;
  for (let i = 0; i < 3; i++) {
    const x = r.w - 5 - (i + 1) * (bs + 2) - (i > 0 ? 2 : 0), y = 5;
    bevel(g, x, y, bs, bs - 2, true);
    g.fillStyle = '#000';
    if (i === 0) { g.lineWidth = 1.6; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + bs - 4, y + bs - 5); g.moveTo(x + bs - 4, y + 3); g.lineTo(x + 3, y + bs - 5); g.stroke(); }
    else if (i === 1) { g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x + 3.5, y + 2.5, bs - 7, bs - 7); g.fillRect(x + 3, y + 2, bs - 6, 2); }
    else g.fillRect(x + 3, y + bs - 6, bs - 7, 2);
  }
  // sunken client area = the board panel
  bevel(g, L.bx - ox - 2, L.by - oy - 2, L.bw + 4, L.bh + 4, false, BOARD_BG);
  g.fillStyle = BOARD_BG; g.fillRect(L.bx - ox, L.by - oy, L.bw, L.bh);
  g.fillStyle = GRID;
  const c = L.cell;
  for (let i = 1; i < L.cols; i++) for (let y = 0; y < L.bh; y += 2) g.fillRect(L.bx - ox + i * c, L.by - oy + y, 1, 1);
  for (let j = 1; j < L.rows; j++) for (let x = 0; x < L.bw; x += 2) g.fillRect(L.bx - ox + x, L.by - oy + j * c, 1, 1);
}

export function board(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), a = ACC[mod(fx.variant, ACC.length)];
  const r = windowRect(L);
  ctx.save();
  const key = [L.w, L.h, L.cell, L.bx, L.by, L.cols, L.rows, dpr, mod(fx.variant, ACC.length)].join();
  blit(ctx, layer(C.board, key, r.w, r.h, dpr, (g) => paintBoard(g, L, a)), r.x, r.y, dpr);
  lethalEdge(ctx, L, fx);
  zoomRects(ctx, L, fx);
  drawDot(ctx, L, snap, fx);
  drawSnake(ctx, L, snap, fx, a);
  ctx.restore();
  crashScreen(ctx, L, snap, fxIn, a);
}

// ───────────────────────────── crash screen ─────────────────────────────
// A wall or self crash in this universe (not inside Reality.exe, which borrows this board): a
// steady blue full-stage stop screen for the whole respawn wait, and on the final crash until the
// next run. Shows the board edge, the dot and the snake where they are; the text never covers the
// snake, the cells ahead of it or the dot. Hard cut in; under Reduced flash it fades in over 200 ms.

const CRASH_BLUE = '#0000aa';
const CRASH_HUD = 104;          // DOM HUD band plus room for the hint when it sits at the top (d-pad)
const CRASH_FOOT = 56;          // the hint pill at the bottom
const CRASH_FADE_MS = 200;
const CRASH_CAUSE = {
  wall: ['STOP 0437:WALL', 'The edge of the decade was reached.'],
  self: ['STOP 0437:TAIL', 'Tail is not a valid direction.'],
};
const MONO = (px) => `bold ${px}px "Courier New", Courier, monospace`;

/** Is this snapshot on the crash screen? Pure: only `snap` and the raw `fx`. */
export function crashShowing(snap, fx) {
  if (!snap || !fx || fx.universe !== 'desktop') return false;
  const d = snap.death;
  if (!d || !CRASH_CAUSE[d.reason]) return false;
  return snap.waiting === 'respawn' || snap.alive === false;
}

/** The crash text, paragraph by paragraph ('' = blank line). */
export function crashLines(snap) {
  const [code, cause] = CRASH_CAUSE[snap.death.reason];
  const n = Math.max(0, num(snap.lives) | 0);
  const last = snap.alive === false
    ? 'NO LIVES REMAINING \u2014 THE TIMELINE HAS BEEN CLOSED'
    : n === 1 ? '1 REMAINING \u2014 LAST LIFE' : `LIFE LOST \u2014 ${n} REMAINING`;
  return ['SNAKE.EXE \u2014 SYSTEM TIME FAULT', '', code, cause, '', last];
}

// Board cells the text must leave clear: the snake, up to four cells ahead of the head, the dot.
function keepClear(L, snap) {
  const c = L.cell, m = Math.max(4, Math.round(c * 0.25)), out = [];
  const add = (x, y) => {
    if (x < 0 || y < 0 || x >= L.cols || y >= L.rows) return;
    out.push({ x: L.bx + x * c - m, y: L.by + y * c - m, w: c + 2 * m, h: c + 2 * m });
  };
  const s = snap.snake || [];
  for (const p of s) add(X(p), Y(p));
  if (s.length) {
    const d = headDir(snap);
    for (let k = 1; k <= 4; k++) add(X(s[0]) + d[0] * k, Y(s[0]) + d[1] * k);
  }
  if (snap.food) add(X(snap.food), Y(snap.food));
  return out;
}

const hits = (r, list) => list.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);

function wrapLines(ctx, paras, maxW) {
  const out = [];
  for (const p of paras) {
    if (!p) { out.push(''); continue; }
    let line = '';
    for (const wd of p.split(' ')) {
      const t = line ? `${line} ${wd}` : wd;
      if (line && ctx.measureText(t).width > maxW) { out.push(line); line = wd; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/**
 * Where the text goes: the largest font (shrinking to 10 px) whose block fits between the HUD band
 * and the hint without touching the kept-clear cells. Top-left first, then down the left side,
 * then the right side. On the final crash the centred game-over panel is avoided too when it can be.
 */
export function crashLayout(ctx, L, snap) {
  const paras = crashLines(snap);
  const clear = keepClear(L, snap);
  const panel = snap.alive === false ? (() => {
    const pw = Math.min(560, L.w - 32), ph = Math.min(320, L.h * 0.5);
    return [{ x: (L.w - pw) / 2, y: (L.h - ph) / 2, w: pw, h: ph }];
  })() : [];
  const pad = Math.max(16, Math.round(L.w * 0.03));
  // The hint and d-pad are hidden on the final crash, so its text may use the bottom strip.
  const top = CRASH_HUD, bottom = L.h - (snap.alive === false ? 12 : CRASH_FOOT);
  const big = Math.max(12, Math.min(24, Math.round(Math.min(L.w, L.h) * 0.034)));
  let fallback = null;
  for (const avoid of panel.length ? [[...clear, ...panel], clear] : [clear]) {
    for (let fs = big; fs >= 10; fs--) {
      ctx.font = MONO(fs);
      const lines = wrapLines(ctx, paras, L.w - 2 * pad);
      const lh = Math.round(fs * 1.35);
      const bw = Math.ceil(Math.max(...lines.map((t) => ctx.measureText(t).width))), bh = lines.length * lh;
      if (top + bh > bottom) continue;
      const xs = [pad, Math.max(pad, L.w - pad - bw)];
      for (const x of xs) {
        for (let y = top; y + bh <= bottom; y += Math.max(4, Math.round(lh / 2))) {
          const r = { x, y, w: bw, h: bh };
          if (!hits(r, avoid)) return { fs, lh, lines, x, y };
        }
      }
      if (!fallback || fs < fallback.fs) fallback = { fs, lh, lines, x: pad, y: top };
    }
  }
  return fallback;
}

function crashScreen(ctx, L, snap, fxIn, a) {
  if (!crashShowing(snap, fxIn)) return;
  const fx = norm(fxIn);
  const age = Number.isFinite(fxIn.crashAge) ? fxIn.crashAge : Infinity;
  const alpha = fx.rf ? Math.max(0, Math.min(1, age / CRASH_FADE_MS)) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = CRASH_BLUE;
  ctx.fillRect(0, 0, L.w, L.h);
  // board edge: a thin dashed white outline (steady)
  ctx.globalAlpha = Math.max(alpha, 0.35);
  ctx.setLineDash([6, 5]); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(L.bx + 0.5, L.by + 0.5, L.bw - 1, L.bh - 1);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // the dot and the snake where they are; steady (no beat lift or blink on this screen)
  const calm = { ...fx, beat: 0, punch: 0, bite: null, biteAge: Infinity };
  drawDot(ctx, L, snap, calm);
  drawSnake(ctx, L, snap, calm, a);
  // text
  const lay = crashLayout(ctx, L, snap);
  if (lay) {
    ctx.globalAlpha = alpha;
    ctx.font = MONO(lay.fs); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    // the stop slips sideways for a moment on a few lines (never under Reduced motion or flash)
    const k = !fx.rf && !fx.rm && age < CRASH_FADE_MS ? 1 - age / CRASH_FADE_MS : 0;
    lay.lines.forEach((t, i) => {
      if (!t) return;
      const off = k && (i === 0 || i === 2) ? Math.round(k * lay.fs * 0.5 * (i === 0 ? 1 : -1)) : 0;
      ctx.fillText(t, lay.x + off, lay.y + i * lay.lh);
    });
  }
  ctx.restore();
}

// Lethal edge: marching-ants selection rectangle on the boundary (dashed = shape cue, not only colour).
function lethalEdge(ctx, L, fx) {
  ctx.save();
  ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#ffffff'; ctx.lineDashOffset = 0; ctx.strokeRect(L.bx + 0.5, L.by + 0.5, L.bw - 1, L.bh - 1);
  ctx.strokeStyle = '#ff2020'; ctx.lineDashOffset = -5 - ((fx.time * 18) % 10);
  ctx.strokeRect(L.bx + 0.5, L.by + 0.5, L.bw - 1, L.bh - 1);
  ctx.restore();
}

// Bite: the 90s window "zoom" outlines, growing from the bitten cell to the whole board.
function zoomRects(ctx, L, fx) {
  if (!fx.bite || fx.biteAge > 520) return;
  const c = L.cell, x0 = L.bx + X(fx.bite) * c, y0 = L.by + Y(fx.bite) * c;
  ctx.save();
  ctx.setLineDash([2, 2]); ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    const t = fx.biteAge / 420 - k * 0.12;
    if (t <= 0 || t >= 1) continue;
    const e = 1 - (1 - t) * (1 - t);
    const x = x0 + (L.bx - x0) * e, y = y0 + (L.by - y0) * e, w = c + (L.bw - c) * e, h = c + (L.bh - c) * e;
    ctx.strokeStyle = k % 2 ? '#000' : '#fff';
    ctx.globalAlpha = 1 - t * 0.6;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }
  ctx.restore();
}

// Dot: a yellow desktop folder with a clock stamped on it; the selection box blinks on the beat.
function drawDot(ctx, L, snap, fx) {
  const f = snap.food;
  if (!f) return;
  const c = L.cell, x = L.bx + X(f) * c, y = L.by + Y(f) * c;
  const p = Math.max(1, Math.round(c * 0.1)), w = c - 2 * p, h = Math.round(w * 0.78);
  const lift = Math.round(fx.beat * c * 0.06), fy = y + Math.round((c - h) / 2) - lift, fxp = x + p;
  ctx.save();
  if (fx.beat > 0.5) { ctx.fillStyle = 'rgba(0,0,128,0.55)'; ctx.fillRect(x, y, c, c); }
  const tab = Math.max(2, Math.round(h * 0.18));
  ctx.fillStyle = '#000';
  ctx.fillRect(fxp - 1, fy - 1, Math.round(w * 0.45) + 2, tab + 2);
  ctx.fillRect(fxp - 1, fy + tab - 1, w + 2, h - tab + 2);
  ctx.fillStyle = '#c8a000'; ctx.fillRect(fxp, fy, Math.round(w * 0.45), tab + 1);
  ctx.fillStyle = '#ffe14d'; ctx.fillRect(fxp, fy + tab, w, h - tab);
  ctx.fillStyle = '#fff6b0'; ctx.fillRect(fxp, fy + tab, w, Math.max(1, Math.round(h * 0.1)));
  // clock face on the folder: the hand sweeps with time
  const cx = fxp + w / 2, cy = fy + tab + (h - tab) * 0.55, rr = Math.max(2, (h - tab) * 0.32);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, c / 28);
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const an = fx.time * 4;
  ctx.strokeStyle = '#a00000'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an) * rr * 0.8, cy + Math.sin(an) * rr * 0.8);
  ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - rr * 0.55); ctx.stroke();
  ctx.restore();
}

// Gap-safe (LEVELS_PLAN 3.3): the neck only counts when no break splits snake[0] from snake[1].
function headDir(snap) {
  const s = snap.snake;
  if (s.length > 1 && !(snap.breaks && snap.breaks[0] === 0)) { const dx = X(s[0]) - X(s[1]), dy = Y(s[0]) - Y(s[1]); if (Math.abs(dx) + Math.abs(dy) === 1) return [dx, dy]; }
  return DIRS[snap.dir] || [1, 0];
}

// Snake: every body cell is a small inset window (title bar, no buttons); the head is a full-cell
// window with a close box, a white client area and a drag cursor. Dead: greyed out, no flashing.
export function drawSnake(ctx, L, snap, fxIn, accent) {
  const s = snap.snake;
  if (!s || !s.length) return;
  const fx = fxIn && fxIn.time !== undefined && fxIn.rf !== undefined ? fxIn : norm(fxIn);
  const a = accent || ACC[mod(fx.variant, ACC.length)];
  const c = L.cell, dead = snap.alive === false;
  const b1 = dead ? DEAD_BAR[0] : a.bar, b2 = dead ? DEAD_BAR[1] : a.bar2;
  const p = Math.max(1, Math.round(c * 0.1)), tb = Math.max(3, Math.round(c * 0.24)), wv = c - 2 * p;
  ctx.save();
  // XOR-style drag outline where the tail just was: only while moving, and only behind the real tail
  const t = snap.prevTail, last = s[s.length - 1];
  if (!dead && !snap.waiting && t && !snap.grew && s.length > 1 && !(snap.length > s.length) && Math.abs(X(t) - X(last)) + Math.abs(Y(t) - Y(last)) === 1) {
    const x = L.bx + X(t) * c, y = L.by + Y(t) * c;
    ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.strokeStyle = '#9fb7c0';
    ctx.strokeRect(x + p + 0.5, y + p + 0.5, wv - 1, wv - 1); ctx.setLineDash([]);
  }
  for (let i = s.length - 1; i >= 1; i--) {
    const x = L.bx + X(s[i]) * c + p, y = L.by + Y(s[i]) * c + p;
    bevel(ctx, x, y, wv, wv, true, dead ? '#a4a4a4' : G.face);
    titleBar(ctx, x + 2, y + 2, wv - 4, tb, b1, b2);
    if (c >= 16) { ctx.fillStyle = dead ? '#c8c8c8' : '#fff'; ctx.fillRect(x + 4, y + 2 + (tb >> 1), Math.round(wv * 0.38), 1); }
    if (c >= 20 && !dead) { ctx.fillStyle = G.shade; ctx.fillRect(x + 4, y + tb + 5, wv - 8, 1); ctx.fillRect(x + 4, y + tb + 8, Math.round((wv - 8) * 0.6), 1); }
  }
  drawHead(ctx, L, snap, s[0], c, dead, b1, b2);
  ctx.restore();
}

function drawHead(ctx, L, snap, h, c, dead, b1, b2) {
  const x = L.bx + X(h) * c, y = L.by + Y(h) * c, d = headDir(snap);
  const tb = Math.max(4, Math.round(c * 0.3));
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 2, y + 2, c, c);   // drop shadow: the head sits above the pile
  bevel(ctx, x, y, c, c, true);
  titleBar(ctx, x + 2, y + 2, c - 4, tb, b1, b2);
  const bs = Math.max(3, tb - 2), cbx = x + c - 3 - bs, cby = y + 3;
  bevel(ctx, cbx, cby, bs, bs, true);
  ctx.strokeStyle = dead ? G.shade : '#000'; ctx.lineWidth = Math.max(1, c / 24);
  ctx.beginPath(); ctx.moveTo(cbx + 1.5, cby + 1.5); ctx.lineTo(cbx + bs - 1.5, cby + bs - 1.5); ctx.moveTo(cbx + bs - 1.5, cby + 1.5); ctx.lineTo(cbx + 1.5, cby + bs - 1.5); ctx.stroke();
  // client area
  const cx0 = x + 3, cy0 = y + tb + 3, cw = c - 6, ch = c - tb - 6;
  ctx.fillStyle = dead ? '#d4d4d4' : '#ffffff'; ctx.fillRect(cx0, cy0, cw, ch);
  ctx.fillStyle = G.shade; ctx.fillRect(cx0, cy0, cw, 1); ctx.fillRect(cx0, cy0, 1, ch);
  const mx = cx0 + cw / 2, my = cy0 + ch / 2, k = Math.min(cw, ch) * 0.34;
  if (dead) {
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = Math.max(1.5, c / 14);
    ctx.beginPath(); ctx.moveTo(mx - k, my - k); ctx.lineTo(mx + k, my + k); ctx.moveTo(mx + k, my - k); ctx.lineTo(mx - k, my + k); ctx.stroke();
  } else {
    // facing chevron, pushed toward the front of the window
    const fxp = mx + d[0] * k * 0.6, fyp = my + d[1] * k * 0.6, px = -d[1], py = d[0];
    ctx.fillStyle = b1;
    ctx.beginPath();
    ctx.moveTo(fxp + d[0] * k, fyp + d[1] * k);
    ctx.lineTo(fxp + px * k, fyp + py * k);
    ctx.lineTo(fxp - px * k, fyp - py * k);
    ctx.closePath(); ctx.fill();
    cursor(ctx, x + c / 2 + d[0] * c * 0.5, y + c / 2 + d[1] * c * 0.5, Math.max(7, c * 0.42));
  }
}

// Generic arrow pointer, tip at (x, y).
function cursor(g, x, y, s) {
  g.save();
  g.translate(Math.round(x), Math.round(y)); g.scale(s / 16, s / 16);
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(0, 13); g.lineTo(3.2, 10); g.lineTo(5.6, 15.2); g.lineTo(7.6, 14.3); g.lineTo(5.3, 9.3); g.lineTo(9.4, 9.3); g.closePath();
  g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#000'; g.stroke();
  g.restore();
}

// ───────────────────────────── scenery ─────────────────────────────

const taskH = (L) => Math.max(22, Math.min(32, Math.round(L.h * 0.038)));
const ICONS = [['monitor', 'My Machine'], ['bin', 'Recycler'], ['hourglass', 'TIME.EXE'], ['folder', '1993'], ['page', 'README.TXT'], ['folder', 'yesterday']];

// Generic 32-unit desktop icons drawn from boxes (no real-world icon is copied).
function icon(g, kind, x, y, s) {
  const u = s / 32;
  g.save(); g.translate(x, y); g.scale(u, u);
  g.lineWidth = 1.5 / Math.max(u, 0.5); g.strokeStyle = '#000';
  const box = (bx, by, bw, bh, f) => { g.fillStyle = f; g.fillRect(bx, by, bw, bh); g.strokeRect(bx, by, bw, bh); };
  if (kind === 'monitor') { box(3, 3, 26, 19, '#c0c0c0'); box(6, 6, 20, 13, '#000080'); g.fillStyle = '#00c0c0'; g.fillRect(8, 8, 9, 2); box(12, 22, 8, 3, '#808080'); box(6, 25, 20, 4, '#c0c0c0'); }
  else if (kind === 'bin') { box(7, 5, 18, 3, '#d0d0d0'); box(9, 8, 14, 21, '#e0e0e0'); g.beginPath(); for (const lx of [13, 16, 19]) { g.moveTo(lx, 11); g.lineTo(lx, 26); } g.stroke(); }
  else if (kind === 'hourglass') { box(7, 3, 18, 3, '#806040'); box(7, 26, 18, 3, '#806040'); g.fillStyle = '#ffe680'; g.beginPath(); g.moveTo(9, 6); g.lineTo(23, 6); g.lineTo(16, 16); g.lineTo(23, 26); g.lineTo(9, 26); g.lineTo(16, 16); g.closePath(); g.fill(); g.stroke(); }
  else if (kind === 'page') { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(7, 3); g.lineTo(20, 3); g.lineTo(26, 9); g.lineTo(26, 29); g.lineTo(7, 29); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#000'; for (let ly = 12; ly < 27; ly += 4) g.fillRect(10, ly, 13, 1.5); }
  else { box(3, 7, 11, 4, '#c8a000'); box(3, 10, 26, 18, '#ffe14d'); g.fillStyle = '#fff6b0'; g.fillRect(4, 11, 24, 2); }
  g.restore();
}

function paintDesk(g, L, a) {
  g.fillStyle = a.desk; g.fillRect(0, 0, L.w, L.h);
  // faint dither so the teal reads as a 256-colour wallpaper
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < L.h; y += 4) for (let x = (y >> 2) % 2 ? 2 : 0; x < L.w; x += 4) g.fillRect(x, y, 1, 1);
  const s = Math.max(22, Math.min(32, Math.round(Math.min(L.w, L.h) * 0.045))), step = s + 30;
  const fs = Math.max(9, Math.round(s * 0.34));
  g.font = FONT(fs); g.textAlign = 'center'; g.textBaseline = 'top';
  const portrait = L.w < L.h;
  ICONS.forEach(([k, label], i) => {
    const x = portrait ? 10 + i * (step + 6) : 14, y = portrait ? 10 : 12 + i * (step + 6);
    if (x + s > L.w) return;
    icon(g, k, x + 10, y, s);
    const tw = g.measureText(label).width + 4;
    g.fillStyle = i === 2 ? '#000080' : a.desk; g.fillRect(x + 10 + s / 2 - tw / 2, y + s + 3, tw, fs + 3);
    g.fillStyle = '#fff'; g.fillText(label, x + 10 + s / 2, y + s + 4);
  });
  g.textAlign = 'left';
  // taskbar
  const th = taskH(L), ty = L.h - th;
  bevel(g, 0, ty, L.w, th, true);
  g.fillStyle = G.hi; g.fillRect(0, ty + 1, L.w, 1);
  const bh = th - 6, fsz = Math.max(9, Math.round(bh * 0.55));
  g.font = FONT(fsz, true); g.textBaseline = 'middle';
  const rw = Math.round(g.measureText('RUN').width + bh + 14);
  bevel(g, 3, ty + 3, rw, bh, true);
  g.fillStyle = '#108010'; g.fillRect(8, ty + 6, bh - 6, bh - 6);
  g.fillStyle = '#ffe14d'; g.fillRect(8 + (bh - 6) / 2, ty + 6, (bh - 6) / 2, (bh - 6) / 2);
  g.fillStyle = '#000'; g.fillText('RUN', 8 + bh, ty + 3 + bh / 2 + 0.5);
  g.font = FONT(fsz);
  const tasks = ['SNAKE.EXE', 'Time.exe (Not Responding)', 'decade_1995.tmp'];
  let tx = rw + 9; const trayW = Math.round(fsz * 7.5);
  for (const t of tasks) {
    const w = Math.min(Math.round(L.w * 0.26), Math.round(g.measureText(t).width + 16));
    if (tx + w > L.w - trayW - 6) break;
    bevel(g, tx, ty + 3, w, bh, t !== 'SNAKE.EXE', t === 'SNAKE.EXE' ? G.lite : G.face);
    g.save(); g.beginPath(); g.rect(tx + 4, ty + 3, w - 8, bh); g.clip();
    g.fillStyle = '#000'; g.fillText(t, tx + 6, ty + 3 + bh / 2 + 0.5); g.restore();
    tx += w + 3;
  }
  bevel(g, L.w - trayW - 3, ty + 3, trayW, bh, false);
}

// Error dialogs. Index 0 is the headline and is always shown, on top of the pile.
const MSGS = [
  ['Time Error', 'Time is not responding.', ['Wait', 'Shift'], 'stop'],
  ['SNAKE.EXE', 'Not enough memory to remember 1993.', ['OK'], 'warn'],
  ['1995', 'The decade could not be found.', ['Retry', 'Ignore'], 'stop'],
  ['Error', 'Snake has eaten past the end of the file.', ['OK'], 'info'],
  ['Warning', 'Cannot delete NOW: it is still in use.', ['OK', 'Cancel'], 'warn'],
  ['Clock', 'The clock has stopped. Keep playing?', ['Yes', 'Yes'], 'info'],
  ['Disk', 'Disk full of yesterday.', ['Abort', 'Retry', 'Shift'], 'stop'],
  ['TIME.EXE', 'A dot was found where no dot should be.', ['OK'], 'warn'],
  ['Error 0437', 'This timeline will be closed.', ['Close'], 'stop'],
  ['Notice', 'Press any key to reality.', ['OK'], 'info'],
  ['SNAKE.EXE', 'Tail is not a valid direction.', ['OK'], 'stop'],
  ['System', 'The future is read-only.', ['Retry'], 'warn'],
];
const MAX_DIALOGS = 26;
const DLG = {};   // cached dialog bitmaps
let PLACE = { key: '', list: [] };

function dlgSize(L) { const w = Math.round(Math.max(150, Math.min(280, L.w * 0.24))); return [w, Math.round(w * 0.46)]; }

function glyph(g, kind, x, y, s) {
  g.save(); g.lineWidth = Math.max(1, s / 16); g.strokeStyle = '#000';
  if (kind === 'warn') {
    g.fillStyle = '#ffe000'; g.beginPath(); g.moveTo(x + s / 2, y); g.lineTo(x + s, y + s * 0.92); g.lineTo(x, y + s * 0.92); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#000'; g.fillRect(x + s * 0.45, y + s * 0.3, s * 0.1, s * 0.35); g.fillRect(x + s * 0.45, y + s * 0.72, s * 0.1, s * 0.1);
  } else {
    g.fillStyle = kind === 'stop' ? '#e00000' : '#1040e0';
    g.beginPath(); g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = Math.max(1.5, s / 9);
    if (kind === 'stop') { const k = s * 0.22; g.beginPath(); g.moveTo(x + s / 2 - k, y + s / 2 - k); g.lineTo(x + s / 2 + k, y + s / 2 + k); g.moveTo(x + s / 2 + k, y + s / 2 - k); g.lineTo(x + s / 2 - k, y + s / 2 + k); g.stroke(); }
    else { g.fillRect(x + s * 0.44, y + s * 0.42, s * 0.12, s * 0.36); g.fillRect(x + s * 0.44, y + s * 0.2, s * 0.12, s * 0.12); }
  }
  g.restore();
}

function paintDialog(g, i, w, h, active) {
  const [title, msg, btns, kind] = MSGS[i % MSGS.length];
  const th = Math.max(13, Math.round(w * 0.075)), fs = Math.max(9, Math.round(th * 0.72));
  bevel(g, 0, 0, w, h, true);
  titleBar(g, 3, 3, w - 6, th, active ? '#000080' : '#808080', active ? '#1084d0' : '#b5b5b5');
  g.font = FONT(fs, true); g.textBaseline = 'middle'; g.fillStyle = active ? '#fff' : '#d8d8d8';
  g.fillText(title, 6, 3 + th / 2 + 0.5);
  const bs = th - 4; bevel(g, w - 5 - bs, 5, bs, bs - 1, true);
  g.strokeStyle = '#000'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(w - 3 - bs, 7); g.lineTo(w - 7, 3 + bs); g.moveTo(w - 7, 7); g.lineTo(w - 3 - bs, 3 + bs); g.stroke();
  const is = Math.round(h * 0.3), ix = 10, iy = th + 10;
  glyph(g, kind, ix, iy, is);
  g.font = FONT(fs); g.fillStyle = '#000'; g.textBaseline = 'top';
  const tx = ix + is + 10, maxW = w - tx - 8, words = msg.split(' '), lines = [];
  let line = '';
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t; }
  lines.push(line);
  lines.slice(0, 3).forEach((ln, k) => g.fillText(ln, tx, iy + k * (fs + 3)));
  const bw = Math.round(w * 0.24), bh = Math.round(fs * 1.9), gap = 6, total = btns.length * bw + (btns.length - 1) * gap;
  let bx = Math.round((w - total) / 2); const by = h - bh - 8;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  btns.forEach((b, k) => {
    if (k === 0) { g.fillStyle = '#000'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2); }
    bevel(g, bx, by, bw, bh, true); g.fillStyle = '#000'; g.fillText(b, bx + bw / 2, by + bh / 2 + 0.5);
    bx += bw + gap;
  });
  g.textAlign = 'left';
}

// Stable spots for the pile, all outside the board window: dialog i keeps its spot as chaos rises.
function placements(L, dw, dh) {
  const key = [L.w, L.h, L.cell, L.bx, L.by, dw].join();
  if (PLACE.key === key) return PLACE.list;
  const r = windowRect(L), pad = 6, list = [];
  const x0 = -dw * 0.25, x1 = L.w - dw * 0.75, y0 = -dh * 0.15, y1 = L.h - taskH(L) - dh * 0.85;
  for (let i = 0; i < MAX_DIALOGS; i++) {
    let spot = null;
    // the headline dialog (i = 0) must sit fully on screen; the rest may hang off the edges
    const ax = i ? x0 : 4, bx = i ? x1 : L.w - dw - 4, ay = i ? y0 : 4, by = i ? y1 : L.h - taskH(L) - dh - 4;
    for (let t = 0; t < (i ? 16 : 40) && !spot; t++) {
      const x = Math.round(ax + (bx - ax) * hash(i * 31.7 + t * 7.31 + 0.2)), y = Math.round(ay + (by - ay) * hash(i * 17.3 + t * 3.17 + 0.9));
      if (x + dw < r.x - pad || x > r.x + r.w + pad || y + dh < r.y - pad || y > r.y + r.h + pad) spot = { x, y };
    }
    list.push(spot);
  }
  PLACE = { key, list };
  return list;
}

function dialogBitmap(i, w, h, dpr, active) {
  const slot = DLG[i] || (DLG[i] = {});
  return layer(slot, [w, h, dpr, active].join(), w, h, dpr, (g) => paintDialog(g, i, w, h, active));
}

function drawDialogs(ctx, L, fx, dpr) {
  const [dw, dh] = dlgSize(L), spots = placements(L, dw, dh);
  const n = Math.min(MAX_DIALOGS, 2 + Math.round(fx.chaos * 18) + Math.min(5, fx.variant >> 2));
  const order = [];
  for (let i = 1; i < n; i++) order.push(i);
  order.push(0);
  for (const i of order) {
    const s = spots[i];
    if (!s) continue;
    const bmp = dialogBitmap(i, dw, dh, dpr, i === 0 || (i + fx.beatIndex) % 7 === 0);
    const sh = fx.beat * (2 + fx.chaos * 9);
    const jx = Math.round((hash(i * 3.1 + fx.beatIndex) - 0.5) * sh), jy = Math.round((hash(i * 5.7 + fx.beatIndex) - 0.5) * sh);
    // a few dialogs are being "dragged" and leave the stuck-redraw smear of the era
    if (i % 4 === 1 && fx.chaos > 0.3) {
      const K = Math.round(4 + fx.chaos * 16), t = fx.time;
      for (let k = K; k >= 0; k--) {
        const tt = t * 0.9 - k * 0.07;
        const ox = Math.sin(tt * 0.8 + i) * dw * 0.6, oy = Math.sin(tt * 1.3 + i * 2) * dh * 0.7;
        blit(ctx, bmp, Math.round(s.x + ox), Math.round(s.y + oy), dpr);
      }
      continue;
    }
    blit(ctx, bmp, s.x + jx, s.y + jy, dpr);
  }
}

// Seven-segment LED digits (score counter in the tray).
const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
function led(ctx, str, x, y, h) {
  const w = h * 0.55, t = Math.max(1.5, h * 0.12);
  ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, str.length * (w + 3) + 3, h + 4);
  for (let k = 0; k < str.length; k++) {
    const m = SEG[str.charCodeAt(k) - 48] || 0, ox = x + k * (w + 3);
    const segs = [[ox + t, y, w - 2 * t, t], [ox + w - t, y + t, t, h / 2 - t], [ox + w - t, y + h / 2, t, h / 2 - t], [ox + t, y + h - t, w - 2 * t, t], [ox, y + h / 2, t, h / 2 - t], [ox, y + t, t, h / 2 - t], [ox + t, y + h / 2 - t / 2, w - 2 * t, t]];
    segs.forEach((r, b) => { ctx.fillStyle = m & (1 << b) ? '#ff2020' : '#3a0000'; ctx.fillRect(r[0], r[1], r[2], r[3]); });
  }
}

function tray(ctx, L, fx, snap) {
  const th = taskH(L), ty = L.h - th, bh = th - 6, fsz = Math.max(9, Math.round(bh * 0.55)), trayW = Math.round(fsz * 7.5);
  const x = L.w - trayW - 3;
  // the clock starts at 04:37 and races as chaos rises
  const mins = 4 * 60 + 37 + Math.floor(fx.time * (0.02 + fx.chaos * fx.chaos * 30));
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
  const blink = Math.floor(fx.time * 2) % 2 === 0 || fx.chaos > 0.6;
  ctx.font = FONT(fsz); ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  ctx.fillText(hh + (blink ? ':' : ' ') + mm, x + trayW - 6, ty + 3 + bh / 2 + 0.5);
  ctx.textAlign = 'left';
  led(ctx, String(Math.max(0, num(snap && snap.score)) % 1000).padStart(3, '0'), x + 5, ty + 6, bh - 6);
}

export function scenery(ctx, L, snap, fxIn) {
  const fx = norm(fxIn), dpr = dprOf(ctx), ai = mod(fx.variant, ACC.length), a = ACC[ai];
  ctx.save();
  blit(ctx, layer(C.desk, [L.w, L.h, dpr, ai].join(), L.w, L.h, dpr, (g) => paintDesk(g, L, a)), 0, 0, dpr);
  if (fx.beat > 0.02) { ctx.fillStyle = `rgba(255,255,255,${(fx.beat * 0.1).toFixed(3)})`; ctx.fillRect(0, 0, L.w, L.h - taskH(L)); }
  waitCursors(ctx, L, fx);
  drawDialogs(ctx, L, fx, dpr);
  tray(ctx, L, fx, snap);
  glitch(ctx, L, fx);
  timeFault(ctx, L, fx);
  ctx.restore();
}

// Wandering pointers and spinning hourglasses; more of them as chaos rises.
function waitCursors(ctx, L, fx) {
  const n = Math.round(1 + fx.chaos * 14), s = Math.max(12, Math.min(22, L.cell * 0.6));
  for (let i = 0; i < n; i++) {
    const x = (0.5 + 0.45 * Math.sin(fx.time * (0.3 + hash(i) * 0.5) + i * 2.1)) * L.w;
    const y = (0.5 + 0.45 * Math.sin(fx.time * (0.25 + hash(i + 9) * 0.4) + i * 1.3)) * (L.h - taskH(L));
    if (i % 2) cursor(ctx, x, y, s);
    else {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.floor(fx.time * 6 + i) * (Math.PI / 4)); icon(ctx, 'hourglass', -s / 2, -s / 2, s); ctx.restore();
    }
  }
}

// Horizontal tear: bands of the scenery copied sideways on the beat (the board is drawn after, untouched).
function glitch(ctx, L, fx) {
  if (fx.rf || fx.rm) return;
  const n = Math.floor(fx.chaos * 4 + fx.beat * fx.chaos * 6 + (fx.punch > 0.3 ? 3 : 0));
  if (!n) return;
  const cv = ctx.canvas, k = cv.width / L.w, seed = fx.beatIndex * 13 + Math.floor(fx.time * 8);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(hash(seed + i * 3.3) * L.h), hgt = 3 + Math.floor(hash(seed + i * 5.1) * 26);
    const dx = Math.round((hash(seed + i * 7.7) - 0.5) * 90 * (fx.chaos + fx.punch));
    ctx.drawImage(cv, 0, y * k, cv.width, hgt * k, dx, y, L.w, hgt);
  }
}

// Bite impact: a blue "time fault" screen behind the board (0 under reduced flash, since punch is 0).
function timeFault(ctx, L, fx) {
  if (fx.punch < 0.05) return;
  ctx.fillStyle = '#0000aa'; ctx.globalAlpha = Math.min(1, fx.punch * 1.1); ctx.fillRect(0, 0, L.w, L.h);
  const fs = Math.max(11, Math.round(Math.min(L.w, L.h) * 0.026));
  ctx.font = `bold ${fs}px "Courier New", monospace`; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffffff';
  const lines = ['TIME FAULT 0437:1995', '', 'The current decade has been halted.', '* Press any key to shift timelines.', '* Press CTRL+ALT+DEL to lose your score.'];
  lines.forEach((ln, i) => ctx.fillText(ln, Math.round(L.w * 0.04), Math.round(L.h * 0.06) + i * fs * 1.4));
  ctx.globalAlpha = 1;
}

// Life slot (LEVELS_PLAN 4.3): a tiny window. Filled = bevelled window with a title bar and a white
// client area; hollow = the dotted XOR drag outline of a window that is not there.
export function life(ctx, x, y, size, filled, fx) {
  const w = Math.round(size * 0.86), h = Math.round(size * 0.74), x0 = Math.round(x + (size - w) / 2), y0 = Math.round(y + (size - h) / 2);
  const tb = Math.max(3, Math.round(h * 0.26)), a = ACC[mod(num(fx && fx.variant), ACC.length)];
  ctx.save();
  if (filled) {
    bevel(ctx, x0, y0, w, h, true);
    titleBar(ctx, x0 + 2, y0 + 2, w - 4, tb, a.bar, a.bar2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + 2, y0 + tb + 3, w - 4, h - tb - 5);
    if (size >= 18) { ctx.fillStyle = G.hi; ctx.fillRect(x0 + w - tb, y0 + 3, tb - 3, tb - 2); }
  } else {
    ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.strokeStyle = G.dark;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    ctx.beginPath(); ctx.moveTo(x0 + 1, y0 + tb + 1.5); ctx.lineTo(x0 + w - 1, y0 + tb + 1.5); ctx.stroke();
  }
  ctx.restore();
}
