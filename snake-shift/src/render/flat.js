// Canvas 2D manager: layout, flat timelines (scenery -> glitch slices -> board),
// first-person HUD, phrase cards, reduced-flash veil and the DOM inversion overlay.
// Reads snapshots and director state only.

const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const WASD = { up: 'W', down: 'S', left: 'A', right: 'D' };
const PHRASE_FONT = '"Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif';
const HUD_BAND = 60; // DOM HUD height reserved at the top (CSS px)

/** Shared layout of plan 15.3. */
export function computeLayout(w, h, cols, rows) {
  const cell = Math.max(4, Math.floor(Math.min((0.94 * w) / cols, (0.8 * h) / rows)));
  const bw = cell * cols, bh = cell * rows;
  const bx = Math.round((w - bw) / 2);
  const by = Math.round((h - bh) * 0.6);
  return Object.freeze({ w, h, cell, bx, by, bw, bh, cols, rows });
}

function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function createFlatRenderer({ canvas, invertEl, cols, rows, onBroken = () => {} }) {
  const ctx = canvas.getContext('2d');
  let w = 1, h = 1, dpr = 1;
  let L = computeLayout(w, h, cols, rows);
  const failures = new Map();

  function resize(cssW, cssH, ratio) {
    w = Math.max(1, Math.round(cssW));
    h = Math.max(1, Math.round(cssH));
    dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    L = computeLayout(w, h, cols, rows);
  }

  function guarded(id, fn) {
    ctx.save();
    try {
      fn();
      return true;
    } catch (err) {
      const n = (failures.get(id) || 0) + 1;
      failures.set(id, n);
      if (n === 1) console.error(`[flat] timeline '${id}' failed`, err);
      if (n >= 3) onBroken(id);
      return false;
    } finally {
      ctx.restore();
    }
  }

  // Glitch slices: shred the scenery between the two phases; the board is drawn after.
  function glitch(fx) {
    if (!(fx.glitch > 0.02)) return;
    const seed = Math.floor(fx.time * 18) * 7919 + (fx.variant | 0) * 104729;
    const n = 2 + Math.floor(fx.glitch * 12);
    const maxShift = 10 + fx.glitch * 90;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n; i++) {
      const r1 = hash(seed + i * 31), r2 = hash(seed + i * 57 + 3), r3 = hash(seed + i * 91 + 7);
      const sy = Math.floor(r1 * canvas.height);
      const sh = Math.max(2, Math.floor((2 + r2 * (6 + fx.glitch * 46)) * dpr));
      const dx = Math.round((r3 - 0.5) * 2 * maxShift * dpr);
      ctx.drawImage(canvas, 0, sy, canvas.width, Math.min(sh, canvas.height - sy), dx, sy, canvas.width, Math.min(sh, canvas.height - sy));
    }
    // Colour splitting: thin misregistered bands in opposing hues.
    if (fx.split > 0.5) {
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = Math.min(0.9, 0.25 + fx.glitch * 0.6);
      for (let i = 0; i < 2 + Math.floor(fx.glitch * 4); i++) {
        const r = hash(seed + i * 13 + 99);
        const y = Math.floor(r * canvas.height);
        const hh = Math.max(1, Math.floor(fx.split * dpr * (0.6 + hash(seed + i) * 1.4)));
        ctx.fillStyle = i % 2 ? '#ff0050' : '#00f0ff';
        ctx.fillRect(Math.round((hash(seed + i * 5) - 0.5) * fx.split * 4 * dpr), y, canvas.width, hh);
      }
    }
    ctx.restore();
  }

  // Strobe on the scenery layer only (flat scenes). The board is drawn on top.
  function strobe(fx, info) {
    if (!fx.strobe) return;
    ctx.save();
    const alt = (fx.beatIndex + Math.floor(fx.now / 40)) % 2 === 0;
    ctx.fillStyle = alt ? '#ffffff' : ((info && info.hud && info.hud.accent) || '#ff2bd6');
    ctx.globalAlpha = 0.88;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function phraseCard(d, fx, info) {
    const p = d.phrase;
    if (!p) return;
    const age = fx.now - p.at;
    if (age < 0 || age > p.dur) return;
    const flatScene = info && info.kind === '2d';
    const bottom = flatScene ? L.by - 8 : Math.max(HUD_BAND + 40, h * 0.3);
    // Below the HUD row when there is room; otherwise share the row, between the HUD plates.
    const top = bottom - HUD_BAND >= 56 ? HUD_BAND : 6;
    const band = bottom - top;
    if (band < 22) return;
    const t = age / p.dur;
    const fade = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    const anim = !fx.reducedMotion;
    const pop = anim ? 1 + 0.5 * Math.pow(Math.max(0, 1 - age / 140), 2) : 1;
    ctx.save();
    let size = Math.min(band * 0.78, 140);
    ctx.font = `900 italic ${size}px ${PHRASE_FONT}`;
    const tw = ctx.measureText(p.text).width;
    const maxW = top < HUD_BAND ? Math.max(120, w - 2 * 178) : w * 0.92;
    if (tw > maxW) {
      size *= maxW / tw;
      ctx.font = `900 italic ${size}px ${PHRASE_FONT}`;
    }
    const cx = w / 2, cy = top + band / 2;
    ctx.translate(cx, cy);
    const tilt = anim ? ((hash(p.seed | 0) - 0.5) * 0.12) : 0;
    ctx.rotate(tilt);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = fade;
    const accent = (info && info.hud && info.hud.accent) || '#ff2bd6';
    if (!fx.reducedFlash) {
      const off = Math.max(2, size * 0.05) * (1 + fx.chaos);
      const jx = anim ? (hash(Math.floor(fx.now / 50)) - 0.5) * off : 0;
      ctx.fillStyle = '#00f0ff';
      ctx.fillText(p.text, -off + jx, 0);
      ctx.fillStyle = '#ff0050';
      ctx.fillText(p.text, off - jx, 0);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.09);
    ctx.strokeStyle = '#000';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = fx.reducedFlash ? '#fff' : (Math.floor(age / 90) % 2 ? accent : '#fff');
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

  function veil(d, fx) {
    const v = d.veil;
    if (!v) return;
    const age = fx.now - v.at;
    if (age < 0 || age >= v.dur) return;
    ctx.save();
    ctx.globalAlpha = v.from * (1 - age / v.dur);
    ctx.fillStyle = v.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function roundRect(x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }

  // First-person HUD: north-up minimap and left/right keycaps.
  function povHud(snap, info, touch, padSide) {
    const accent = (info && info.hud && info.hud.accent) || '#19e6ff';
    // Portrait phones have room to spare at the top: give the map more of it.
    const want = h > w * 1.2 ? w * 0.36 : Math.min(w, h) * 0.24;
    const size = Math.round(Math.max(110, Math.min(190, want)));
    const pad = 12;
    // On-screen pad at the right edge (landscape): map moves left, the pad replaces the keycaps.
    const mx = padSide ? pad + 6 : w - size - pad, my = HUD_BAND + 6;
    const c = size / snap.cols;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundRect(mx - 6, my - 6, size + 12, size + 26, 8);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(mx - 1, my - 1, size + 2, size + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < snap.rows; y++) for (let x = (y % 2); x < snap.cols; x += 2) ctx.fillRect(mx + x * c, my + y * c, c, c);
    if (snap.food) {
      ctx.fillStyle = '#ffd400';
      const fx0 = mx + (snap.food.x + 0.5) * c, fy0 = my + (snap.food.y + 0.5) * c;
      ctx.beginPath();
      ctx.moveTo(fx0, fy0 - c * 0.5); ctx.lineTo(fx0 + c * 0.5, fy0); ctx.lineTo(fx0, fy0 + c * 0.5); ctx.lineTo(fx0 - c * 0.5, fy0);
      ctx.fill();
    }
    ctx.fillStyle = '#e8f6ff';
    for (let i = snap.snake.length - 1; i >= 1; i--) {
      const s = snap.snake[i];
      ctx.fillRect(mx + s.x * c + 1, my + s.y * c + 1, c - 2, c - 2);
    }
    const hd = snap.snake[0];
    const hx = mx + (hd.x + 0.5) * c, hy = my + (hd.y + 0.5) * c;
    const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[snap.dir] || [0, -1];
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(hx + dv[0] * c * 0.75, hy + dv[1] * c * 0.75);
    ctx.lineTo(hx - dv[1] * c * 0.6 - dv[0] * c * 0.4, hy + dv[0] * c * 0.6 - dv[1] * c * 0.4);
    ctx.lineTo(hx + dv[1] * c * 0.6 - dv[0] * c * 0.4, hy - dv[0] * c * 0.6 - dv[1] * c * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 11px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('MAP  N↑', mx + size / 2, my + size + 5);

    // Keycaps at the screen edges. First person steers relative to the snake:
    // the left key always turns left, the right key always turns right.
    const k = Math.round(Math.max(48, Math.min(78, Math.min(w, h) * 0.1)));
    const ky = Math.round(h * 0.56 - k / 2);
    const caps = padSide ? [] : [
      { side: 'left', x: 12, d: 'left' },
      { side: 'right', x: w - 12 - k, d: 'right' },
    ];
    for (const cap of caps) {
      if (!cap.d) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      roundRect(cap.x - 4, ky - 22, k + 8, k + 44, 10);
      ctx.fill();
      ctx.fillStyle = '#f2f2f2';
      roundRect(cap.x, ky, k, k, 9);
      ctx.fill();
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(cap.x + 4, ky + k - 7, k - 8, 4);
      ctx.fillStyle = '#111';
      ctx.font = `900 ${Math.round(k * 0.56)}px ${PHRASE_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ARROW[cap.d], cap.x + k / 2, ky + k * 0.46);
      ctx.fillStyle = '#fff';
      ctx.font = `700 11px ui-monospace, Menlo, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(cap.side === 'left' ? '↶ LEFT' : 'RIGHT ↷', cap.x + k / 2, ky - 17);
      ctx.fillText(touch ? `${typeof touch === 'string' ? touch : 'swipe'} ${ARROW[cap.d]}` : `or ${WASD[cap.d]}`, cap.x + k / 2, ky + k + 5);
    }
    ctx.restore();
  }

  /**
   * frame: { snap, fx, d (director.get()), timelines, glActive, touch (swipe wording on keycaps) }
   */
  function render({ snap, fx, d, timelines, glActive, persp = null, touch = false, padSide = false }) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const info = d.sceneInfo;
    // A room without live WebGL draws through the 2D perspective stand-in (board view only).
    const perspScene = !!(persp && info && info.kind === '3d' && !glActive);
    const flatScene = !info || info.kind === '2d' || (!glActive && !perspScene);
    if (perspScene) {
      ctx.clearRect(0, 0, w, h);
      if (!guarded(info.timeline, () => persp.render(ctx, w, h, info, 'board', snap, fx))) {
        ctx.fillStyle = '#050308';
        ctx.fillRect(0, 0, w, h);
        guarded('lcd', () => timelines.lcd.board(ctx, L, snap, fx));
      }
    } else if (flatScene) {
      const id = info && timelines[info.timeline] ? info.timeline : 'lcd';
      const mod = timelines[id] || timelines.lcd;
      ctx.clearRect(0, 0, w, h);
      if (!guarded(id, () => mod.scenery(ctx, L, snap, fx))) {
        ctx.fillStyle = '#050308';
        ctx.fillRect(0, 0, w, h);
      }
      glitch(fx);
      strobe(fx, info);
      if (!guarded(id, () => mod.board(ctx, L, snap, fx)) && mod !== timelines.lcd) {
        guarded('lcd', () => timelines.lcd.board(ctx, L, snap, fx));
      }
    } else {
      ctx.clearRect(0, 0, w, h);
      if (info.view === 'pov') povHud(snap, info, touch, padSide);
    }
    phraseCard(d, fx, info);
    veil(d, fx);

    // Inversion impact (and, for rooms, the strobe burst) through one DOM layer.
    const inv = !fx.reducedFlash && (fx.invert || (!flatScene && fx.strobe === 1));
    if (invertEl) {
      const want = inv ? 'block' : 'none';
      if (invertEl.style.display !== want) invertEl.style.display = want;
    }
  }

  return {
    resize,
    render,
    get layout() { return L; },
    get size() { return { w, h, dpr }; },
  };
}
