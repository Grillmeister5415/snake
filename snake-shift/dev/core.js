// Core harness: real sim, director, fx and flat renderer with two fake flat
// timelines and a fake room (drawn black), so cuts, the limiter, phrases,
// glitch, veil, inversion and the first-person HUD can be checked without
// the other streams. ?rf / ?rm switch the prefs; ?pov holds court-pov.

import { createSim } from '../src/sim.js';
import { createDirector, buildScenes } from '../src/director.js';
import { createFx, createFallbackBeat } from '../src/fx.js';
import { createAutopilot } from '../src/autopilot.js';
import { createFlatRenderer } from '../src/render/flat.js';
import * as lcd from '../src/render/timelines/lcd.js';

const q = new URLSearchParams(location.search);
const prefs = { reducedFlash: q.has('rf'), reducedMotion: q.has('rm') };

function fake(id, luma, bg, ink, accent) {
  return {
    meta: { id, name: id.toUpperCase(), year: '19xx', kind: '2d', luma, veil: bg, weight: 3, hud: { fg: ink, bg, accent, panelFg: ink, panelBg: bg } },
    scenery(ctx, L, snap, fx) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, L.w, L.h);
      ctx.fillStyle = accent;
      const n = 12;
      for (let i = 0; i < n; i++) {
        const y = ((i / n + fx.time * 0.2) % 1) * L.h;
        ctx.globalAlpha = 0.3 + fx.beat * 0.7;
        ctx.fillRect(0, y, L.w, 6 + fx.punch * 30);
      }
      ctx.globalAlpha = 1;
    },
    board(ctx, L, snap) {
      ctx.fillStyle = '#000';
      ctx.fillRect(L.bx - 4, L.by - 4, L.bw + 8, L.bh + 8);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(L.bx - 2, L.by - 2, L.bw + 4, L.bh + 4);
      ctx.fillStyle = ink;
      snap.snake.forEach((c, i) => ctx.fillRect(L.bx + c.x * L.cell + 2, L.by + c.y * L.cell + 2, L.cell - 4, L.cell - 4 - (i ? 0 : 6)));
      if (snap.food) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(L.bx + (snap.food.x + 0.5) * L.cell, L.by + (snap.food.y + 0.5) * L.cell, L.cell * 0.3, 0, 7); ctx.fill(); }
    },
  };
}

const timelines = { lcd, arcade: fake('arcade', 0.08, '#05030c', '#ffe600', '#ff2bd6'), acid: fake('acid', 0.7, '#ffb347', '#2a0040', '#00b3ff') };
const scenes = buildScenes({
  flats: Object.fromEntries(Object.entries(timelines).map(([k, m]) => [k, m.meta])),
  rooms: { court: { name: 'REALITY.EXE', year: '2088', luma: 0.25, veil: '#100828', weight: 3, views: ['board', 'pov'], hud: { accent: '#19e6ff' } } },
});
const director = createDirector({ scenes, seed: 4, prefs: () => prefs, hasGL: () => true });
const sim = createSim({ seed: 'harness' });
const ap = createAutopilot(sim);
const fxer = createFx();
const beat = createFallbackBeat();
const canvas = document.getElementById('flat');
const flat = createFlatRenderer({ canvas, invertEl: document.getElementById('invert'), cols: 16, rows: 16 });
const log = [];
let now = 0;
let inversions = 0, wasInv = false;

sim.on('ate', () => {
  if (!beat.running) beat.start();
  const c = director.onBite(sim.snapshot(), now);
  if (c) log.push({ at: Math.round(now), to: c.to, swing: c.swing });
});
sim.on('died', () => director.onDeath(sim.snapshot(), now));
sim.on('reset', () => director.reset(now));

function resize() { flat.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2)); }
addEventListener('resize', resize);
resize();
if (q.has('pov')) { director.force('court-pov', 0, false); director.lock(true); }
sim.setPaused(false);

let last = null;
let manual = false; // run() drives a synthetic clock when the page is throttled
function frame(t) {
  if (manual) return;
  requestAnimationFrame(frame);
  tickFrame(t);
}
function tickFrame(t) {
  now = t;
  const dt = last === null ? 0 : Math.min(100, t - last);
  last = t;
  for (let r = dt; r > 0; r -= 12) { ap.update(); sim.advance(Math.min(12, r)); }
  if (!sim.snapshot().alive) { sim.reset(`h${t | 0}`); ap.reset(); sim.setPaused(false); }
  const snap = sim.snapshot();
  director.update(snap, t);
  const d = director.get();
  const fx = fxer.frame({ now: t, director: d, beat, prefs });
  document.body.style.background = d.kind === '3d' ? '#101830' : '#000';
  flat.render({ snap, fx, d, timelines, glActive: d.kind === '3d' });
  const inv = document.getElementById('invert').style.display === 'block';
  if (inv && !wasInv) inversions++;
  wasInv = inv;
}
requestAnimationFrame(frame);

window.__core = {
  sim, director, prefs, log,
  get inversions() { return inversions; },
  /** Drive `ms` of synthetic time in 16 ms frames (stops the rAF loop). */
  run(ms) {
    manual = true;
    let t = last ?? 0;
    for (let i = 0; i < ms / 16; i++) { t += 16; tickFrame(t); }
    beat.setTimeSource(() => t / 1000);
    return { t, score: sim.snapshot().score, cuts: log.length };
  },
};
