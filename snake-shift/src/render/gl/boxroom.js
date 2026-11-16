// Box-room kit (BUILD_PLAN 10), added in wave 2 by rooms-a. Rooms reach it through the kit:
//   kit.boxRoom(opts)      walls standing exactly on the lethal edges, poster sheet on their inner faces
//   kit.posterSheet(opts)  canvas: stark white/red/black posters built from the game's own phrases
//   kit.concreteSheet(o)   canvas: tileable poured concrete
//   kit.canvas(w, h)       a 2D canvas (DOM or Offscreen), or null
// Everything here is generated in code; any canvas failure returns null and callers fall back to
// plain materials. Nothing here reads or writes game state.

export const PHRASES = ['TIME BREAK', 'WRONG DECADE', 'NO EXIT', '04:37', '2088'];
const FONT = '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif';

export function makeCanvas(w, h) {
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  } catch {
    /* fall through */
  }
  return null;
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------------- concrete ----------------
export function concreteSheet({ w = 512, h = 512, seed = 3, base = '#57534f', ties = true } = {}) {
  const c = makeCanvas(w, h);
  const x = c && c.getContext('2d');
  if (!x) return null;
  const r = rng(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  // mottling: soft blobs drawn wrapped so the sheet tiles
  for (let i = 0; i < 220; i++) {
    const px = r() * w, py = r() * h, rad = 6 + r() * 70;
    const a = 0.03 + r() * 0.08;
    const tint = r() < 0.58 ? '0,0,0' : '255,255,255';
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const gx = px + ox, gy = py + oy;
        if (gx + rad < 0 || gx - rad > w || gy + rad < 0 || gy - rad > h) continue;
        const g = x.createRadialGradient(gx, gy, 0, gx, gy, rad);
        g.addColorStop(0, `rgba(${tint},${a})`);
        g.addColorStop(1, `rgba(${tint},0)`);
        x.fillStyle = g;
        x.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      }
    }
  }
  // water stains running down
  for (let i = 0; i < 46; i++) {
    const sx = r() * w, sy = r() * h * 0.7, len = 40 + r() * h * 0.6, lw = 1 + r() * 5;
    const g = x.createLinearGradient(0, sy, 0, sy + len);
    g.addColorStop(0, `rgba(0,0,0,${0.08 + r() * 0.14})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(sx, sy, lw, len);
  }
  // grain
  try {
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * 30;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
  } catch {
    /* tainted or unsupported: skip grain */
  }
  // formwork joints on the tile edges (so they repeat) and tie holes
  x.fillStyle = 'rgba(0,0,0,0.5)';
  x.fillRect(0, 0, w, 3);
  x.fillRect(0, 0, 3, h);
  x.fillStyle = 'rgba(0,0,0,0.22)';
  x.fillRect(0, h / 2 - 1, w, 2);
  if (ties) {
    for (const [tx, ty] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      x.fillStyle = 'rgba(0,0,0,0.55)';
      x.beginPath();
      x.arc(tx * w, ty * h, Math.max(3, w * 0.014), 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.12)';
      x.lineWidth = 1.5;
      x.beginPath();
      x.arc(tx * w, ty * h, Math.max(5, w * 0.022), 0, Math.PI * 2);
      x.stroke();
    }
  }
  return c;
}

// ---------------- poster sheet ----------------
const INK = { white: '#f4f1ea', red: '#e3120b', black: '#0b0909' };

function fitFont(x, text, maxW, maxH, weight = 900) {
  let size = maxH;
  x.font = `${weight} ${size}px ${FONT}`;
  const tw = x.measureText(text).width || 1;
  if (tw > maxW) size = Math.max(6, Math.floor((size * maxW) / tw));
  x.font = `${weight} ${size}px ${FONT}`;
  return size;
}

// Stencil cut: thin bars in the background colour across the lettering.
function stencilBars(x, y, h, w, bg) {
  x.fillStyle = bg;
  x.fillRect(0, y + h * 0.47, w, Math.max(2, h * 0.07));
}

function barcode(x, bx, by, bw, bh, r, ink) {
  x.fillStyle = ink;
  let cx = bx;
  while (cx < bx + bw - 2) {
    const lw = 1 + Math.floor(r() * 4);
    if (r() < 0.62) x.fillRect(cx, by, lw, bh);
    cx += lw + 1 + Math.floor(r() * 2);
  }
}

function chevron(x, cx, cy, s, dir) {
  x.save();
  x.translate(cx, cy);
  x.rotate(dir);
  x.beginPath();
  x.moveTo(-s * 0.5, -s * 0.5);
  x.lineTo(0, -s * 0.5);
  x.lineTo(s * 0.5, 0);
  x.lineTo(0, s * 0.5);
  x.lineTo(-s * 0.5, s * 0.5);
  x.lineTo(0, 0);
  x.closePath();
  x.fill();
  x.restore();
}

function stripes(x, w, h, a, b, step) {
  x.fillStyle = a;
  x.fillRect(0, 0, w, h);
  x.fillStyle = b;
  for (let i = -h; i < w + h; i += step * 2) {
    x.beginPath();
    x.moveTo(i, h);
    x.lineTo(i + step, h);
    x.lineTo(i + step + h, 0);
    x.lineTo(i + h, 0);
    x.closePath();
    x.fill();
  }
}

// One poster in local coordinates (0,0)-(pw,ph).
function drawPoster(x, pw, ph, type, r, P) {
  const pick = (a) => a[Math.floor(r() * a.length) % a.length];
  const { white: W, red: R, black: K } = INK;
  const phrase = pick(P);
  x.save();
  x.beginPath();
  x.rect(0, 0, pw, ph);
  x.clip();
  if (type === 0) {
    // big stencil words
    const [bg, fg] = pick([[K, W], [W, K], [R, K], [K, R], [W, R]]);
    x.fillStyle = bg;
    x.fillRect(0, 0, pw, ph);
    const words = phrase.split(' ');
    const lh = (ph * 0.62) / words.length;
    x.fillStyle = fg;
    x.textBaseline = 'top';
    words.forEach((wd, i) => {
      const y = ph * 0.1 + i * lh;
      const sz = fitFont(x, wd, pw * 0.88, lh * 0.95);
      x.fillText(wd, pw * 0.06, y);
      stencilBars(x, y, sz * 0.78, pw, bg);
      x.fillStyle = fg;
    });
    x.fillStyle = fg === R ? (bg === K ? W : K) : R;
    x.fillRect(pw * 0.06, ph * 0.8, pw * 0.88, ph * 0.035);
    fitFont(x, '04:37 / BUNKER / 2026', pw * 0.6, ph * 0.05, 700);
    x.fillStyle = fg;
    x.fillText('04:37 / BUNKER / 2026', pw * 0.06, ph * 0.87);
    barcode(x, pw * 0.7, ph * 0.86, pw * 0.24, ph * 0.08, r, fg);
  } else if (type === 1) {
    // hazard stripes with a label box
    stripes(x, pw, ph, R, K, Math.max(8, pw * 0.09));
    const bw = pw * 0.78, bh = ph * 0.26;
    x.fillStyle = W;
    x.fillRect((pw - bw) / 2, ph * 0.37, bw, bh);
    x.fillStyle = K;
    x.textBaseline = 'middle';
    fitFont(x, phrase, bw * 0.9, bh * 0.7);
    x.textAlign = 'center';
    x.fillText(phrase, pw / 2, ph * 0.37 + bh / 2);
    x.textAlign = 'left';
  } else if (type === 2) {
    // barcode sheet
    x.fillStyle = W;
    x.fillRect(0, 0, pw, ph);
    x.fillStyle = R;
    x.textBaseline = 'top';
    const sz = fitFont(x, '2088', pw * 0.86, ph * 0.3);
    x.fillText('2088', pw * 0.07, ph * 0.06);
    stencilBars(x, ph * 0.06, sz * 0.78, pw, W);
    barcode(x, pw * 0.07, ph * 0.45, pw * 0.86, ph * 0.3, r, K);
    x.fillStyle = K;
    fitFont(x, '2088 0437 0000 1', pw * 0.86, ph * 0.07, 700);
    x.fillText('2088 0437 0000 1', pw * 0.07, ph * 0.79);
    x.fillStyle = R;
    x.fillRect(pw * 0.07, ph * 0.9, pw * 0.86, ph * 0.04);
  } else if (type === 3) {
    // arrows
    x.fillStyle = K;
    x.fillRect(0, 0, pw, ph);
    x.fillStyle = R;
    const dir = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const s = Math.min(pw, ph) * 0.34;
    for (let i = 0; i < 3; i++) chevron(x, pw / 2 + (dir === 0 || dir === Math.PI ? (i - 1) * s * 0.62 * Math.cos(dir) : 0), ph * 0.42 + (dir === 0 || dir === Math.PI ? 0 : (i - 1) * s * 0.62 * Math.sin(dir)), s, dir);
    x.fillStyle = W;
    x.textBaseline = 'top';
    fitFont(x, phrase, pw * 0.86, ph * 0.12);
    x.fillText(phrase, pw * 0.07, ph * 0.8);
  } else if (type === 4) {
    // target
    x.fillStyle = R;
    x.fillRect(0, 0, pw, ph);
    const cx = pw / 2, cy = ph * 0.44, rad = Math.min(pw, ph) * 0.36;
    for (let i = 5; i >= 1; i--) {
      x.fillStyle = i % 2 ? K : W;
      x.beginPath();
      x.arc(cx, cy, (rad * i) / 5, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = R;
    x.fillRect(cx - rad * 1.2, cy - 2, rad * 2.4, 4);
    x.fillRect(cx - 2, cy - rad * 1.2, 4, rad * 2.4);
    x.fillStyle = K;
    x.textBaseline = 'top';
    fitFont(x, phrase, pw * 0.86, ph * 0.12);
    x.fillText(phrase, pw * 0.07, ph * 0.84);
  } else {
    // clock
    x.fillStyle = K;
    x.fillRect(0, 0, pw, ph);
    x.fillStyle = W;
    x.textBaseline = 'top';
    const sz = fitFont(x, '04:37', pw * 0.9, ph * 0.42);
    x.fillText('04:37', pw * 0.05, ph * 0.18);
    stencilBars(x, ph * 0.18, sz * 0.78, pw, K);
    x.fillStyle = R;
    x.fillRect(pw * 0.05, ph * 0.66, pw * 0.9, ph * 0.08);
    x.fillStyle = W;
    fitFont(x, phrase, pw * 0.9, ph * 0.08, 700);
    x.fillText(phrase, pw * 0.05, ph * 0.8);
  }
  // wear: scuffs, glue wrinkles, torn corner
  x.globalAlpha = 0.18;
  x.fillStyle = '#000';
  for (let i = 0; i < 5; i++) x.fillRect(r() * pw, r() * ph, 2 + r() * pw * 0.25, 1 + r() * 3);
  x.globalAlpha = 0.07;
  x.strokeStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    x.moveTo(r() * pw, 0);
    x.lineTo(r() * pw, ph);
    x.stroke();
  }
  x.globalAlpha = 1;
  x.restore();
}

// A wall-height strip of pasted posters over concrete. Tiles horizontally (posters wrap at the
// edges). Bottom band: red/black hazard stripes, which marks the lethal line at the wall base.
export function posterSheet({ w = 2048, h = 512, seed = 11, phrases = PHRASES, hazard = true, concrete = null } = {}) {
  const c = makeCanvas(w, h);
  const x = c && c.getContext('2d');
  if (!x) return null;
  const r = rng(seed);
  const P = phrases && phrases.length ? phrases : PHRASES;
  const cc = concrete || concreteSheet({ w: 512, h: 512, seed: seed + 5, base: '#4a4542' });
  if (cc) {
    for (let ox = 0; ox < w; ox += cc.width) for (let oy = 0; oy < h; oy += cc.height) x.drawImage(cc, ox, oy);
  } else {
    x.fillStyle = '#3a3634';
    x.fillRect(0, 0, w, h);
  }
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(0, 0, w, h);
  const paste = (px, py, pw, ph, type, rot) => {
    for (const ox of [0, -w, w]) {
      if (px + ox + pw * 1.2 < 0 || px + ox - pw * 0.2 > w) continue;
      x.save();
      x.translate(px + ox + pw / 2, py + ph / 2);
      x.rotate(rot);
      x.translate(-pw / 2, -ph / 2);
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.fillRect(3, 4, pw, ph); // shadow of the paper edge
      const st = r(); // same random stream for every wrapped copy
      drawPoster(x, pw, ph, type, rng(Math.floor(st * 1e9) + 1), P);
      x.restore();
    }
  };
  // layer 1: a row of large posters
  let px = r() * 30;
  let type = Math.floor(r() * 6);
  while (px < w) {
    const ph = h * (0.6 + r() * 0.24);
    const pw = Math.min(h * (0.4 + r() * 0.36), w - px + h * 0.3);
    paste(px, h * (0.05 + r() * 0.07), pw, ph, type, (r() - 0.5) * 0.04);
    type = (type + 1 + Math.floor(r() * 3)) % 6;
    px += pw * (0.82 + r() * 0.2);
  }
  // layer 2: smaller sheets pasted over the seams
  for (let i = 0; i < Math.round(w / 220); i++) {
    const pw = h * (0.24 + r() * 0.2);
    paste(r() * w, h * (0.08 + r() * 0.42), pw, pw * (1.15 + r() * 0.4), Math.floor(r() * 6), (r() - 0.5) * 0.08);
  }
  // grime: wet bottom, dark top, drips
  let g = x.createLinearGradient(0, h, 0, h * 0.68);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, h * 0.68, w, h * 0.32);
  g = x.createLinearGradient(0, 0, 0, h * 0.12);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h * 0.12);
  for (let i = 0; i < w / 40; i++) {
    const dx = r() * w, dy = r() * h * 0.5, len = 20 + r() * h * 0.5;
    g = x.createLinearGradient(0, dy, 0, dy + len);
    g.addColorStop(0, `rgba(0,0,0,${0.15 + r() * 0.3})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(dx, dy, 1 + r() * 3, len);
  }
  if (hazard) {
    const bh = Math.round(h * 0.07);
    x.save();
    x.translate(0, h - bh);
    stripes(x, w, bh, INK.black, INK.red, Math.round(bh * 0.9));
    x.restore();
    x.fillStyle = INK.white;
    x.fillRect(0, h - bh - Math.max(2, h * 0.006), w, Math.max(2, h * 0.006));
  }
  return c;
}

// ---------------- box room ----------------
// Four concrete walls whose inner faces stand exactly on the lethal edges (a hair outside, so they
// never cover a cell), with a poster sheet on every inner face and a light strip along the base.
// In the board view the near wall is left out by default: it would hide the near rows.
// opts: name, height (2.2), thick (0.5), posterTex / posterCanvas, wallTex / wallCanvas,
//       posterColor, wallColor, stripColor, capColor (rgb), seed, phrases.
// Returns { height, thick, wall, poster, strip, cap (materials, tint them per frame), draw(d, { near }) }.
export function boxRoom(kit, o = {}) {
  const { cols, rows, material } = kit;
  const name = o.name || 'boxroom';
  const H = o.height ?? 2.2, T = o.thick ?? 0.5;
  const e = 0.006; // posters this far outside the lethal edge, concrete just behind them
  const tex = (t, cv, opts) => t || (cv ? kit.texture(cv, opts) : null);
  const posterTex = tex(o.posterTex, o.posterTex ? null : o.posterCanvas || posterSheet({ seed: o.seed ?? 11, phrases: o.phrases }), { repeat: true });
  const wallTex = tex(o.wallTex, o.wallTex ? null : o.wallCanvas || concreteSheet({ seed: (o.seed ?? 11) + 2 }), { repeat: true });
  const wall = material({ color: o.wallColor || [0.75, 0.7, 0.68], mode: wallTex ? 2 : 0, tex: wallTex, uvScale: [Math.max(cols, rows) / 4, H / 4] });
  const poster = material({ color: o.posterColor || [1, 1, 1], mode: posterTex ? 2 : 0, tex: posterTex, fog: 0.5 });
  const strip = material({ color: [0, 0, 0], emissive: o.stripColor || [1, 0.1, 0.06] });
  const cap = material({ color: [0, 0, 0], emissive: o.capColor || [0.8, 0.06, 0.04] });
  // one sheet repeat covers 4·H world units (sheet aspect 4:1); each side starts at its own offset
  const sides = [
    { id: 'far', len: cols, x: 0, z: -rows / 2 - e, ry: 0, u0: 0 },
    { id: 'near', len: cols, x: 0, z: rows / 2 + e, ry: Math.PI, u0: 0.53, near: true },
    { id: 'left', len: rows, x: -cols / 2 - e, z: 0, ry: Math.PI / 2, u0: 0.29 },
    { id: 'right', len: rows, x: cols / 2 + e, z: 0, ry: -Math.PI / 2, u0: 0.77 },
  ];
  for (const s of sides) {
    s.geom = kit.addGeometry(`${name}:${s.id}`, planeUVGeo(s.u0, s.u0 + s.len / (4 * H)));
    const out = e + T / 2 + 0.002;
    const nx = Math.round(Math.sin(s.ry)) || 0, nz = Math.round(Math.cos(s.ry)) || 0; // inward normal (plane +Z after ry)
    s.cx = s.x - nx * (out - e);
    s.cz = s.z - nz * (out - e);
    s.bw = nx ? T : s.len + 2 * (T + e + 0.002);
    s.bd = nx ? s.len + 2 * (e + 0.002) : T;
    s.sx = s.x + nx * 0.003;
    s.sz = s.z + nz * 0.003;
  }
  return {
    height: H, thick: T, wall, poster, strip, cap, sides,
    draw(d, opt = {}) {
      const showNear = opt.near ?? d.view === 'pov';
      for (const s of sides) {
        if (s.near && !showNear) continue;
        d.mesh('box', d.trs(s.cx, 0, s.cz, 0, s.bw, H, s.bd), wall);
        d.mesh(s.geom, d.trs(s.x, 0, s.z, s.ry, s.len, H, 1), poster);
        d.mesh('plane', d.trs(s.sx, 0.0, s.sz, s.ry, s.len, 0.05, 1), strip);
        d.mesh('box', d.trs(s.cx, H, s.cz, 0, s.bw + 0.02, 0.06, s.bd + 0.02), cap);
      }
    },
  };
}

// local copy so this module has no import cycle with geometry.js consumers
function planeUVGeo(u0, u1) {
  return {
    pos: [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0],
    nrm: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uv: [u0, 0, u1, 0, u1, 1, u0, 1],
    idx: [0, 1, 2, 0, 2, 3],
  };
}
