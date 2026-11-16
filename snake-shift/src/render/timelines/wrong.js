// SNAKE//SHIFT — timeline 09: THE WRONG UNIVERSE, year 'ERR'. Flat Canvas 2D (stream flat-c).
// Contract: BUILD_PLAN.md §15.3. A deliberately broken collage of the other flat timelines; it is also
// how Temporal Collisions (master prompt §6) show up in the game.
//
// How it works:
// - On load it imports its siblings (lcd, arcade, acid, timewarp, kombat, desktop) by dynamic import and
//   skips any that are missing, fail to parse or lack meta/scenery/board. It waits at most 1.5 s at the
//   top level, so the registry gets a usable module even if one sibling hangs; late ones join later.
// - scenery(): renders 1–4 sibling sceneries into offscreen buffers (same L, same snap, same fx, never
//   mutated) and composes them: torn-paper regions, a split screen whose seam two eras fight over,
//   poster sheets pasted over a base era, duplicated offset silhouettes around the edges, wrong-palette
//   strips and era tags. Layout, eras and tears are chosen per fx.variant; tears crawl with fx.time;
//   regions swap on fx.beat more often as fx.chaos rises; fx.punch rips a seam through the bitten cell.
// - board(): exactly one sibling's board(), drawn whole, chosen per fx.variant. Nothing is drawn after
//   it, so corruption touches scenery only, never a cell. If no sibling is usable, a plain fallback board.
// Extra exports (ignored by the registry): ready (Promise), eras(), boardOwner(fx), planFor(fx).
// Testing knob: import 'wrong.js?only=lcd,arcade' to restrict which siblings it tries to load.

const IDS = ['lcd', 'arcade', 'acid', 'timewarp', 'kombat', 'desktop'];
const ERA = { lcd: '1999', arcade: '1986', acid: '1968', timewarp: '????', kombat: '1993', desktop: '1995' };
const SIB = {};
const BROKEN = new Set();

const TAU = Math.PI * 2;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const frac = (x) => x - Math.floor(x);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t) => t * t * (3 - 2 * t);
const noise = (x) => { const i = Math.floor(x); const f = smooth(x - i); return hash(i) * (1 - f) + hash(i + 1) * f; };
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- sibling loading -------------------------------------------------------------------------
let only = null;
try {
  const q = new URL(import.meta.url).searchParams.get('only');
  if (q) only = q.split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9_-]+$/.test(s) && s !== 'wrong');
} catch (_) { /* no import.meta.url: load all */ }
const WANT = only || IDS;

async function loadSibling(id) {
  try {
    const m = await import(`./${id}.js`);
    if (m && m.meta && typeof m.scenery === 'function' && typeof m.board === 'function') SIB[id] = m;
    else console.info(`[wrong] sibling '${id}' has no meta/scenery/board; skipped`);
  } catch (err) {
    console.info(`[wrong] sibling '${id}' not loaded:`, err && err.message ? err.message : err);
  }
}
export const ready = Promise.all(WANT.map(loadSibling)).then(() => eras());
await Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]);

/** Usable sibling ids in a fixed order (never depends on load timing). */
export function eras() {
  const order = only ? WANT : IDS;
  return order.filter((id) => SIB[id] && !BROKEN.has(id));
}

export const meta = {
  id: 'wrong', name: 'WRONG UNIVERSE', year: 'ERR', kind: '2d',
  luma: 0.4, veil: '#4b3f5e', weight: 1,
  hud: { fg: '#f6f2ff', bg: 'rgba(22,12,34,0.84)', accent: '#ff3b6b', panelFg: '#d8ff3a', panelBg: 'rgba(26,14,44,0.9)' },
};

const PAL = ['#ff2bd6', '#39ff6a', '#00e8ff', '#ffe81a', '#ff3b1f', '#7a2bff', '#f3ead2', '#0b0b10'];
const PAPER = '#f3ead2';
const FONTS = ['bold 13px monospace', 'italic bold 15px Georgia, serif', '16px Impact, "Arial Black", sans-serif', 'bold 12px "Courier New", monospace', '900 14px "Arial Black", sans-serif'];
const PHRASES = ['WRONG DECADE', 'TIME BREAK', 'YEAR NOT FOUND', 'ERR', 'TIME IS NOT RESPONDING', '04:37'];
// Silhouette kind per era; the room eras (disco, bunker, plastic) only ever intrude as silhouettes.
const SIL_OF = { lcd: 'phone', arcade: 'cabinet', acid: 'flower', timewarp: 'hourglass', kombat: 'spark', desktop: 'cursor' };
const INTRUDERS = ['ball', 'speaker', 'sphere'];
const LAYOUTS = ['tear', 'split', 'sheets'];

// ---- the plan: everything chosen per variant, in normalised units ------------------------------
let planCache = { key: '', plan: null };
function seam(r, ang) {
  return { ax: 0.2 + 0.6 * r(), ay: 0.15 + 0.7 * r(), ang, amp: 5 + 13 * r(), seg: 9 + 12 * r(), seed: Math.floor(r() * 997), side: r() < 0.5 ? 1 : -1 };
}
function makePlan(v, list) {
  const r = rng((0x9e3779b9 ^ Math.imul(v + 1, 0x85ebca6b)) >>> 0);
  const order = list.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const n = order.length;
  const layout = n >= 2 ? LAYOUTS[(v + Math.floor(hash(Math.floor(v / 3) + 0.5) * 3)) % 3] : 'echo';
  // The board belongs to an era that is not the dominant scenery: nothing matches.
  const cands = n > 1 ? order.slice(1) : order;
  const boardId = cands.length ? cands[Math.floor(r() * cands.length)] : null;
  const seams = [];
  const ns = layout === 'tear' ? Math.min(3, Math.max(1, n - 1)) + (r() < 0.4 ? 1 : 0) : 0;
  for (let i = 0; i < ns; i++) seams.push(seam(r, (r() - 0.5) * 1.9)); // angle relative to the margins' long axis
  const sheets = [];
  if (layout === 'sheets') {
    const k = 3 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) {
      sheets.push({ u: r() < 0.5 ? 0.03 + 0.24 * r() : 0.73 + 0.24 * r(), v: 0.08 + 0.84 * r(), sw: 0.2 + 0.2 * r(), sh: 0.22 + 0.25 * r(), rot: (r() - 0.5) * 0.9, era: 1 + (i % Math.max(1, n - 1)), seed: Math.floor(r() * 997), spin: (r() - 0.5) * 0.3 });
    }
  }
  const split = { seed: r() * TAU, amp: 5 + 10 * r(), seg: 8 + 10 * r() };
  const strips = [];
  const ks = 2 + Math.floor(r() * 3);
  for (let i = 0; i < ks; i++) strips.push({ pos: r(), size: 0.015 + 0.07 * r(), vert: r() < 0.25, mode: Math.floor(r() * 5), col: PAL[Math.floor(r() * 6)], speed: (r() - 0.5) * 0.12 });
  const own = order.map((id) => SIL_OF[id] || 'spark');
  const sil = [own[Math.floor(r() * own.length)] || 'spark', INTRUDERS[Math.floor(r() * INTRUDERS.length)]];
  const echo = { dx: (6 + 10 * r()) * (r() < 0.5 ? 1 : -1), dy: (4 + 9 * r()) * (r() < 0.5 ? 1 : -1), col: Math.floor(r() * PAL.length) };
  const rip = { ang: r() * Math.PI, amp: 6 + 8 * r(), seg: 8 + 8 * r(), seed: Math.floor(r() * 997) };
  return { v, order, n, layout, boardId, seams, sheets, split, strips, sil, echo, rip, phrase: PHRASES[Math.floor(r() * PHRASES.length)], font: Math.floor(r() * FONTS.length) };
}
/** The plan for this fx.variant and the siblings that are usable right now (cached). */
export function planFor(fx) {
  const v = num(fx && fx.variant) | 0, list = eras();
  const key = v + '|' + list.join(',');
  if (planCache.key !== key) planCache = { key, plan: makePlan(v, list) };
  return planCache.plan;
}
/** Id of the sibling whose board() this variant draws, or null for the fallback board. */
export function boardOwner(fx) { return planFor(fx).boardId; }

// ---- offscreen era buffers --------------------------------------------------------------------
const BUF = {};
let stamp = 0;
function dprOf(ctx) {
  const m = ctx.getTransform ? ctx.getTransform() : null;
  return Math.max(1, Math.min(3, (m && Math.hypot(m.a, m.b)) || 1));
}
// Buffer scale: device-ish resolution, capped near 1.6 M pixels per buffer (it is a broken collage
// anyway). Siblings see a normal scaled context and cache their layers at that scale.
function bufScale(ctx, L) { return clamp(Math.sqrt(1.6e6 / Math.max(1, L.w * L.h)), 0.75, dprOf(ctx)); }
/** Renders sibling `id`'s scenery once per frame into its buffer; null if it is unusable. */
function eraBuffer(id, L, snap, fx, s) {
  const m = SIB[id];
  if (!m || BROKEN.has(id)) return null;
  const b = BUF[id] || (BUF[id] = { c: document.createElement('canvas'), g: null, stamp: -1 });
  const W = Math.max(1, Math.round(L.w * s)), H = Math.max(1, Math.round(L.h * s));
  if (b.c.width !== W || b.c.height !== H) { b.c.width = W; b.c.height = H; b.g = null; b.stamp = -1; }
  if (b.stamp === stamp) return b.c;
  const g = b.g || (b.g = b.c.getContext('2d'));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = (m.meta && m.meta.veil) || '#222';
  g.fillRect(0, 0, W, H);
  g.setTransform(s, 0, 0, s, 0, 0);
  g.save();
  try {
    m.scenery(g, L, snap, fx);
  } catch (err) {
    BROKEN.add(id);
    console.warn(`[wrong] sibling '${id}' scenery failed; dropped`, err);
    b.c.width = b.c.width; b.g = null; b.stamp = -1; // reset any state it left behind
    return null;
  }
  g.restore();
  b.stamp = stamp;
  return b.c;
}

// ---- seam geometry ----------------------------------------------------------------------------
/** Jagged line through an anchor; the low-frequency shape crawls along it with `crawl`. */
// Anchors sit in the visible margins (beside the board in landscape, above/below it in portrait) and
// the seam runs across them, so every tear shows on both sides of the board instead of hiding behind it.
function seamLine(L, s, crawl, t) {
  const D = Math.hypot(L.w, L.h) + 40;
  const u = clamp(s.ax + 0.03 * Math.sin(t * 0.21 + s.seed), 0, 1), v = clamp(s.ay + 0.03 * Math.cos(t * 0.17 + s.seed), 0, 1);
  const side = L.bx >= Math.min(L.by, L.h - L.by - L.bh);
  const inMargin = (k, lo, hi, total) => (k < 0.5 ? lo * (k / 0.5) : hi + (total - hi) * ((k - 0.5) / 0.5));
  const cx = side ? inMargin(u, L.bx, L.bx + L.bw, L.w) : v * L.w;
  const cy = side ? v * L.h : inMargin(u, L.by, L.by + L.bh, L.h);
  return jagLine(cx, cy, side ? s.ang : s.ang + Math.PI / 2, D, s.amp, s.seg, s.seed, crawl);
}
function jagLine(cx, cy, ang, D, amp, seg, seed, crawl) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const N = Math.ceil((2 * D) / seg), pts = new Array((N + 1) * 2);
  const tooth = Math.floor(crawl * 2) * 7;
  for (let k = 0; k <= N; k++) {
    const tt = -D + k * seg;
    const o = amp * 2 * (noise(k * 0.31 + crawl + seed) - 0.5) + amp * 0.55 * (hash(k + tooth + seed * 13) - 0.5);
    pts[k * 2] = cx + dx * tt - dy * o;
    pts[k * 2 + 1] = cy + dy * tt + dx * o;
  }
  return { pts, nx: -dy, ny: dx, D, cx, cy, ang };
}
function polyline(ctx, pts, ox = 0, oy = 0) {
  ctx.moveTo(pts[0] + ox, pts[1] + oy);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] + ox, pts[i + 1] + oy);
}
/** Path of everything on side `sd` (+1 / −1) of a seam line. */
function sidePath(ctx, ln, sd) {
  const { pts, nx, ny, D } = ln, F = 2 * D * sd, n = pts.length;
  ctx.beginPath();
  polyline(ctx, pts);
  ctx.lineTo(pts[n - 2] + nx * F, pts[n - 1] + ny * F);
  ctx.lineTo(pts[0] + nx * F, pts[1] + ny * F);
  ctx.closePath();
}
/** Torn-paper edge: a shadow cast on the lower sheet and a pale fibre edge on the upper one. */
function tornEdge(ctx, ln, sd, fx, paper = PAPER) {
  const { pts, nx, ny } = ln;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath(); polyline(ctx, pts, -nx * sd * 3, -ny * sd * 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 9; ctx.stroke();
  ctx.beginPath(); polyline(ctx, pts, nx * sd * 1.2, ny * sd * 1.2);
  ctx.strokeStyle = paper; ctx.lineWidth = 3.6 + 3 * fx.beat + 4 * fx.punch; ctx.stroke();
  ctx.restore();
}
function drawBuf(ctx, c, L) { if (c) ctx.drawImage(c, 0, 0, L.w, L.h); }

// ---- layouts ----------------------------------------------------------------------------------
function norm(fx) {
  fx = fx || {};
  return {
    time: num(fx.time), beat: clamp(num(fx.beat), 0, 1), beatIndex: num(fx.beatIndex) | 0, chaos: clamp(num(fx.chaos), 0, 1),
    punch: clamp(num(fx.punch), 0, 1), variant: num(fx.variant) | 0, bite: fx.bite || null,
    rf: !!fx.reducedFlash, rm: !!fx.reducedMotion,
  };
}
/** Regions swap eras on the beat; the chance per beat rises with chaos. Pure in (beatIndex, variant, chaos). */
function swapRot(f, n) {
  if (n < 2) return 0;
  const p = f.rf ? clamp((f.chaos - 0.3) * 0.3, 0, 0.2) : clamp((f.chaos - 0.08) * 1.05, 0, 0.92);
  if (p <= 0) return 0;
  for (let k = f.beatIndex; k > f.beatIndex - 16 && k >= 0; k--) {
    if (hash(k * 1.37 + f.variant * 31.7) < p) return 1 + Math.floor(hash(k * 7.7 + 0.3) * (n - 1));
  }
  return 0;
}
const crawlOf = (f) => f.time * (0.35 + 2.6 * f.chaos);

function layoutTear(ctx, L, P, f, get, tags) {
  drawBuf(ctx, get(0), L);
  P.seams.forEach((s, i) => {
    const c = get(i + 1);
    if (!c) return;
    const ln = seamLine(L, s, crawlOf(f) * (i % 2 ? -1 : 1), f.time);
    ctx.save(); sidePath(ctx, ln, s.side); ctx.clip(); drawBuf(ctx, c, L); ctx.restore();
    tornEdge(ctx, ln, s.side, f);
    tags.push({ x: ln.cx + ln.nx * s.side * 26, y: ln.cy + ln.ny * s.side * 26, rot: ln.ang, i: i + 1 });
  });
  tags.push({ x: L.w * 0.12, y: L.h * 0.9, rot: -0.1, i: 0 });
}

function layoutSplit(ctx, L, P, f, get, tags, s) {
  const cA = get(0), cB = get(1);
  drawBuf(ctx, cA, L);
  if (!cB) return;
  // The seam must cross the visible margins, not hide behind the board: landscape splits top vs
  // bottom (the fight shows left and right of the board), portrait splits left vs right.
  const vert = L.h > L.w * 1.1;
  const across = vert ? L.w : L.h, along = vert ? L.h : L.w;
  const sp = P.split, crawl = crawlOf(f);
  const push = (f.beatIndex % 2 ? 1 : -1) * f.beat * across * 0.05;
  const pos = across * (0.5 + 0.16 * Math.sin(f.time * (0.6 + 1.4 * f.chaos) + sp.seed)) + push;
  const jag = (u) => sp.amp * 2 * (noise(u / sp.seg * 0.3 + crawl + sp.seed) - 0.5) + sp.amp * 0.5 * (hash(Math.floor(u / sp.seg) + Math.floor(crawl * 2) * 5) - 0.5);
  const P2 = (a, u) => (vert ? [a, u] : [u, a]);
  // B owns everything past the seam.
  ctx.save();
  ctx.beginPath();
  for (let u = -sp.seg; u <= along + sp.seg; u += sp.seg) { const [x, y] = P2(pos + jag(u), u); u < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  { const [x1, y1] = P2(across + 50, along + 50); const [x2, y2] = P2(across + 50, -50); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.closePath(); ctx.clip(); drawBuf(ctx, cB, L); ctx.restore();
  // The front line: slices from both eras shoved into each other.
  const bw2 = Math.min(L.w, L.h) * (0.035 + 0.07 * f.chaos);
  const tick = Math.floor(f.time * (f.rf ? 1.5 : 4 + 14 * f.chaos));
  const W = cA.width, H = cA.height;
  for (let u = 0, k = 0; u < along && k < 400; k++) {
    const th = 4 + Math.floor(hash(k * 3.3 + tick * 0.71) * 18);
    const a0 = pos + jag(u + th / 2) - bw2;
    const c = hash(k * 5.1 + tick * 1.3) < 0.5 ? cA : cB;
    const j = (hash(k * 9.7 + tick * 2.1) - 0.5) * bw2 * 2;
    const [dx, dy] = P2(a0, u), dw = vert ? bw2 * 2 : th, dh = vert ? th : bw2 * 2;
    const sw = Math.max(1, dw * s), sh = Math.max(1, dh * s);
    const sx = clamp((dx + (vert ? j : 0)) * s, 0, W - sw), sy = clamp((dy + (vert ? 0 : j)) * s, 0, H - sh);
    if (sw < W && sh < H) ctx.drawImage(c, sx, sy, sw, sh, dx, dy, dw, dh);
    u += th;
  }
  // A neon front line on top, in two clashing colours.
  ctx.save();
  ctx.lineWidth = 2 + 3 * f.beat;
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath();
    for (let u = -sp.seg; u <= along + sp.seg; u += sp.seg) { const [x, y] = P2(pos + jag(u) + side * bw2, u); u < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.strokeStyle = side < 0 ? PAL[(P.echo.col + 1) % 6] : PAL[(P.echo.col + 3) % 6];
    ctx.stroke();
  }
  ctx.restore();
  const [tx, ty] = P2(pos, along * 0.08);
  tags.push({ x: tx, y: ty, rot: vert ? 0 : 0, i: -1 });
}

/** Torn rectangle outline around (0,0); jitter crawls slowly. */
function tornRect(ctx, w, h, seed, crawl) {
  const step = 9, pts = [];
  const side = (x0, y0, x1, y1, k0) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n, o = 3.5 * (hash(k0 + i + seed * 17 + Math.floor(crawl)) - 0.5) * 2;
      const nx = (y1 - y0) / len, ny = -(x1 - x0) / len;
      pts.push(x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o);
    }
  };
  side(-w / 2, -h / 2, w / 2, -h / 2, 0); side(w / 2, -h / 2, w / 2, h / 2, 100);
  side(w / 2, h / 2, -w / 2, h / 2, 200); side(-w / 2, h / 2, -w / 2, -h / 2, 300);
  ctx.beginPath(); polyline(ctx, pts); ctx.closePath();
}

function layoutSheets(ctx, L, P, f, get, tags, s) {
  drawBuf(ctx, get(0), L);
  const port = L.h > L.w * 1.1, m = Math.max(L.w, L.h), crawl = crawlOf(f);
  P.sheets.forEach((sh, i) => {
    const c = get(sh.era);
    if (!c) return;
    const cx = (port ? sh.v : sh.u) * L.w, cy = (port ? sh.u : sh.v) * L.h;
    const w = sh.sw * m * 0.55, h = sh.sh * m * 0.55;
    const rot = sh.rot + Math.sin(f.time * 0.4 + sh.seed) * sh.spin + (f.rf ? 0 : f.beat * 0.04 * (i % 2 ? 1 : -1));
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.save(); ctx.translate(6, 8); tornRect(ctx, w, h, sh.seed, crawl); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill(); ctx.restore();
    tornRect(ctx, w, h, sh.seed, crawl);
    ctx.save(); ctx.clip();
    // A poster of that era: a crop of its scenery around a focal point, squashed into the sheet.
    const W = c.width, H = c.height, fw = Math.min(W, W * (0.35 + 0.4 * hash(sh.seed))), fh = Math.min(H, fw * (h / w));
    const fxp = clamp(hash(sh.seed + 1) * W - fw / 2, 0, W - fw), fyp = clamp(hash(sh.seed + 2) * H - fh / 2, 0, H - fh);
    ctx.drawImage(c, fxp, fyp, fw, fh, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3 + 2 * f.beat; ctx.stroke();
    ctx.fillStyle = 'rgba(243,234,210,0.55)'; ctx.fillRect(-w * 0.18, -h / 2 - 7, w * 0.36, 14); // tape
    ctx.restore();
    tags.push({ x: cx - w * 0.3, y: cy + h * 0.42, rot, i: sh.era });
  });
}

function layoutEcho(ctx, L, P, f, get) {
  const c = get(0);
  drawBuf(ctx, c, L);
  if (!c) return;
  // One era only: a displaced copy of itself in the wrong palette behind a crawling tear.
  const ln = jagLine(L.w * 0.5, L.h * 0.5, P.rip.ang + 0.4, Math.hypot(L.w, L.h) + 40, P.rip.amp, P.rip.seg, P.rip.seed, crawlOf(f));
  ctx.save(); sidePath(ctx, ln, 1); ctx.clip();
  ctx.drawImage(c, 18, -12, L.w, L.h);
  ctx.globalCompositeOperation = f.rf ? 'hue' : 'difference';
  ctx.fillStyle = f.rf ? PAL[(P.echo.col) % 6] : '#ffffff';
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.restore();
  tornEdge(ctx, ln, 1, f);
}

// ---- decoration: the rip, silhouettes, wrong-palette strips, tags --------------------------------
const X = (c) => (c.x !== undefined ? c.x : c[0]);
const Y = (c) => (c.y !== undefined ? c.y : c[1]);
/** fx.punch rips a seam through the bitten cell; it gapes open on the bite and stays as a scar. */
function ripSeam(ctx, L, P, f, c) {
  if (!f.bite) return;
  const cx = L.bx + (X(f.bite) + 0.5) * L.cell, cy = L.by + (Y(f.bite) + 0.5) * L.cell;
  const g = 1.5 + 30 * f.punch;
  const ln = jagLine(cx, cy, P.rip.ang, Math.hypot(L.w, L.h) + 40, P.rip.amp, P.rip.seg, P.rip.seed, f.time * 0.15);
  const { pts, nx, ny } = ln;
  ctx.save();
  ctx.beginPath(); polyline(ctx, pts);
  for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i] + nx * g, pts[i + 1] + ny * g);
  ctx.closePath();
  if (c) { ctx.clip(); ctx.drawImage(c, nx * g * 0.5, ny * g * 0.5, L.w, L.h); } else { ctx.fillStyle = PAPER; ctx.fill(); }
  ctx.restore();
  tornEdge(ctx, ln, -1, f);
  const far = { pts: pts.map((v, i) => v + (i % 2 ? ny : nx) * g), nx, ny };
  tornEdge(ctx, far, 1, f);
}

const SIL = {};
function poly(p, a) { p.moveTo(a[0][0], a[0][1]); for (let i = 1; i < a.length; i++) p.lineTo(a[i][0], a[i][1]); p.closePath(); }
function circ(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); }
/** Original silhouettes in a 100×100 box, bottom at y = 100. Returns { p, rule }. */
function silPath(kind) {
  if (SIL[kind]) return SIL[kind];
  const p = new Path2D();
  let rule = 'evenodd';
  if (kind === 'phone') {
    p.rect(30, 14, 40, 86); p.rect(58, 0, 6, 15); p.rect(37, 23, 26, 22);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) p.rect(38 + c * 9, 53 + r * 10, 6, 5);
  } else if (kind === 'cabinet') {
    poly(p, [[24, 100], [24, 44], [18, 34], [26, 0], [76, 0], [82, 34], [76, 44], [76, 100]]); p.rect(32, 9, 36, 24); p.rect(30, 50, 40, 4);
  } else if (kind === 'flower') {
    rule = 'nonzero';
    for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; circ(p, 50 + Math.cos(a) * 19, 34 + Math.sin(a) * 19, 13); }
    circ(p, 50, 34, 12); p.rect(47, 48, 6, 52); p.ellipse(63, 78, 13, 5, -0.5, 0, TAU);
  } else if (kind === 'ball') {
    p.rect(49, 0, 2, 30); circ(p, 50, 62, 30);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) { const x = 29 + c * 6.5, y = 41 + r * 6.5; if ((r + c) % 2 && Math.hypot(x + 2.5 - 50, y + 2.5 - 62) < 25) p.rect(x, y, 5, 5); }
  } else if (kind === 'speaker') {
    p.rect(18, 4, 64, 46); p.rect(18, 52, 64, 48); circ(p, 50, 27, 15); circ(p, 50, 77, 18); circ(p, 50, 77, 6);
  } else if (kind === 'sphere') {
    circ(p, 50, 60, 36); p.ellipse(37, 45, 11, 6, -0.6, 0, TAU);
  } else if (kind === 'hourglass') {
    poly(p, [[22, 0], [78, 0], [78, 6], [54, 50], [78, 94], [78, 100], [22, 100], [22, 94], [46, 50], [22, 6]]);
  } else if (kind === 'cursor') {
    poly(p, [[22, 0], [22, 80], [40, 64], [52, 94], [64, 88], [52, 59], [76, 59]]);
  } else {
    const a = [];
    for (let i = 0; i < 24; i++) { const r = i % 2 ? 18 : 50 - (i % 4) * 3, t = (i * TAU) / 24; a.push([50 + Math.cos(t) * r, 50 + Math.sin(t) * r]); }
    poly(p, a); rule = 'nonzero';
  }
  return (SIL[kind] = { p, rule });
}
function echoSil(ctx, kind, x, y, sz, flip, P, f, copies, j) {
  const { p, rule } = silPath(kind);
  const jump = f.rf ? 0 : (hash(f.beatIndex * 1.7 + j) - 0.5) * 12 * f.chaos;
  for (let c = copies - 1; c >= 0; c--) {
    ctx.save();
    ctx.translate(x + (P.echo.dx * c + jump) * (flip ? -1 : 1), y + P.echo.dy * c - (c === 0 ? f.beat * sz * 0.05 : 0));
    if (flip) { ctx.translate(sz, 0); ctx.scale(-1, 1); }
    ctx.scale(sz / 100, sz / 100);
    ctx.globalAlpha = c === 0 ? 0.94 : Math.max(0.25, 0.85 - c * 0.1);
    ctx.fillStyle = c === 0 ? '#0b0b10' : PAL[(P.echo.col + c + (f.rf ? 0 : f.beatIndex)) % 6];
    ctx.fill(p, rule);
    ctx.restore();
  }
}
/** Duplicated, offset silhouettes in the margins: left/right in landscape, above/below in portrait. */
function silhouettes(ctx, L, P, f) {
  const copies = 3 + Math.round(f.chaos * 3);
  const left = L.bx, top = L.by, bottom = L.h - L.by - L.bh;
  if (left >= 56) {
    const sz = clamp(left * 0.72, 28, Math.min(240, L.h * 0.34));
    [0.2, 0.62].forEach((v, j) => {
      const kind = P.sil[j % P.sil.length], y = L.h * v;
      echoSil(ctx, kind, left / 2 - sz / 2, y, sz, false, P, f, copies, j);
      echoSil(ctx, kind, L.w - left / 2 - sz / 2, y + L.h * 0.08, sz, true, P, f, copies, j + 2);
    });
  } else {
    const bands = [[0, top], [L.by + L.bh, bottom]];
    bands.forEach(([y0, m], b) => {
      if (m < 36) return;
      const sz = clamp(m * 0.72, 24, Math.min(200, L.w * 0.3));
      [0.06, 0.94].forEach((u, j) => {
        const x = u < 0.5 ? L.w * u : L.w * u - sz;
        echoSil(ctx, P.sil[(j + b) % P.sil.length], x, y0 + (m - sz) / 2, sz, u > 0.5, P, f, copies, j + b * 2);
      });
    });
  }
}
const MODES = ['difference', 'exclusion', 'hue', 'color', 'multiply'];
const RF_MODES = ['hue', 'color', 'color', 'hue', 'multiply'];
/** Strips where the palette is simply wrong. More of them as chaos rises; they hop on the beat. */
function strips(ctx, L, P, f) {
  const k = Math.max(1, Math.round(1 + f.chaos * (P.strips.length - 1)));
  ctx.save();
  for (let i = 0; i < k; i++) {
    const st = P.strips[i];
    const hop = !f.rf && f.chaos > 0.45 ? hash(f.beatIndex * 3.3 + i) * 0.3 : 0;
    const pos = frac(st.pos + f.time * st.speed + hop);
    ctx.globalCompositeOperation = (f.rf ? RF_MODES : MODES)[st.mode];
    ctx.globalAlpha = f.rf ? 0.55 : 1;
    ctx.fillStyle = st.col;
    if (st.vert) ctx.fillRect(pos * L.w, 0, st.size * L.w, L.h);
    else ctx.fillRect(0, pos * L.h, L.w, st.size * L.h);
  }
  ctx.restore();
}
function drawTags(ctx, L, P, f, tags, rot) {
  const n = P.n;
  const eraAt = (i) => (n ? ERA[P.order[(((i + rot) % n) + n) % n]] || 'ERR' : 'ERR');
  ctx.save();
  ctx.textBaseline = 'middle';
  const all = tags.concat([{ x: L.w - 90, y: L.h - 18, rot: 0.04, i: -2 }]);
  all.forEach((t, k) => {
    const txt = t.i === -1 ? `TEMPORAL COLLISION ${eraAt(0)} × ${eraAt(1)}` : t.i === -2 ? P.phrase : eraAt(t.i);
    ctx.save();
    ctx.font = FONTS[(P.font + k) % FONTS.length];
    const tw = ctx.measureText(txt).width + 10;
    ctx.translate(clamp(t.x, tw / 2 + 4, L.w - tw / 2 - 4), clamp(t.y, 14, L.h - 14));
    ctx.rotate(clamp(Math.sin(t.rot) * 0.5, -0.35, 0.35));
    const dark = (k + P.v) % 2 === 0;
    ctx.fillStyle = dark ? '#0b0b10' : PAPER;
    ctx.fillRect(-tw / 2, -10, tw, 20);
    ctx.fillStyle = dark ? PAL[(P.echo.col + k) % 6] : '#0b0b10';
    ctx.fillText(txt, -tw / 2 + 5, 1);
    ctx.restore();
  });
  ctx.restore();
}

// ---- fallbacks (no usable sibling) -------------------------------------------------------------
function voidScenery(ctx, L, f) {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, '#2a1240'); g.addColorStop(1, '#0b0b10');
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = PAL[i % 6];
    ctx.fillRect(0, frac(hash(i) + f.time * 0.05 * (hash(i + 3) - 0.5)) * L.h, L.w, 2 + hash(i + 7) * 18);
  }
  ctx.globalAlpha = 1;
}
function fallbackBoard(ctx, L, snap) {
  const c = L.cell, dead = snap && snap.alive === false;
  ctx.save();
  ctx.fillStyle = '#0b0b10'; ctx.fillRect(L.bx - 6, L.by - 6, L.bw + 12, L.bh + 12);
  ctx.strokeStyle = '#ff3b6b'; ctx.lineWidth = 3; ctx.strokeRect(L.bx - 3.5, L.by - 3.5, L.bw + 7, L.bh + 7);
  ctx.fillStyle = '#1b1628'; ctx.fillRect(L.bx, L.by, L.bw, L.bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 1; x < L.cols; x++) { ctx.moveTo(L.bx + x * c + 0.5, L.by); ctx.lineTo(L.bx + x * c + 0.5, L.by + L.bh); }
  for (let y = 1; y < L.rows; y++) { ctx.moveTo(L.bx, L.by + y * c + 0.5); ctx.lineTo(L.bx + L.bw, L.by + y * c + 0.5); }
  ctx.stroke();
  const food = snap && snap.food;
  if (food) {
    const fx0 = L.bx + (X(food) + 0.5) * c, fy0 = L.by + (Y(food) + 0.5) * c, r = c * 0.36;
    ctx.fillStyle = '#ffe81a'; ctx.beginPath(); ctx.moveTo(fx0, fy0 - r); ctx.lineTo(fx0 + r, fy0); ctx.lineTo(fx0, fy0 + r); ctx.lineTo(fx0 - r, fy0); ctx.closePath(); ctx.fill();
  }
  const sn = (snap && snap.snake) || [];
  for (let i = sn.length - 1; i >= 0; i--) {
    const x = L.bx + X(sn[i]) * c, y = L.by + Y(sn[i]) * c;
    if (i === 0) {
      ctx.fillStyle = dead ? '#9a9a9a' : '#ffffff';
      ctx.beginPath(); ctx.arc(x + c / 2, y + c / 2, c * 0.46, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0b0b10'; ctx.fillRect(x + c * 0.4, y + c * 0.4, c * 0.2, c * 0.2);
    } else {
      ctx.fillStyle = dead ? '#666666' : '#d8ff3a';
      ctx.fillRect(x + 2, y + 2, c - 4, c - 4);
    }
  }
  ctx.restore();
}

// ---- the contract -----------------------------------------------------------------------------
export function scenery(ctx, L, snap, fx) {
  const f = norm(fx);
  stamp++;
  const P = planFor(fx);
  const n = P.n, s = bufScale(ctx, L), rot = swapRot(f, n);
  // Siblings always get the caller's own snap and fx objects, untouched.
  const get = (i) => (n ? eraBuffer(P.order[(((i + rot) % n) + n) % n], L, snap, fx, s) : null);
  const tags = [];
  ctx.save();
  if (!n) voidScenery(ctx, L, f);
  else {
    ctx.fillStyle = meta.veil; ctx.fillRect(0, 0, L.w, L.h);
    if (P.layout === 'tear') layoutTear(ctx, L, P, f, get, tags);
    else if (P.layout === 'split') layoutSplit(ctx, L, P, f, get, tags, s);
    else if (P.layout === 'sheets') layoutSheets(ctx, L, P, f, get, tags, s);
    else layoutEcho(ctx, L, P, f, get);
  }
  ripSeam(ctx, L, P, f, n ? get(n > 2 ? 2 : 1) : null);
  silhouettes(ctx, L, P, f);
  strips(ctx, L, P, f);
  drawTags(ctx, L, P, f, tags, rot);
  ctx.restore();
}

/** Exactly one sibling's board, whole and untouched; nothing is drawn after it. */
export function board(ctx, L, snap, fx) {
  const id = boardOwner(fx);
  if (id && SIB[id] && !BROKEN.has(id)) {
    ctx.save();
    try {
      SIB[id].board(ctx, L, snap, fx);
      ctx.restore();
      return;
    } catch (err) {
      ctx.restore();
      BROKEN.add(id);
      console.warn(`[wrong] sibling '${id}' board failed; dropped`, err);
    }
  }
  fallbackBoard(ctx, L, snap);
}
