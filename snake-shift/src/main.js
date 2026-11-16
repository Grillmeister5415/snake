// SNAKE//SHIFT entry: loop, wiring, debug switches.
// One-way flow: input -> sim -> events -> director -> renderers/audio/UI.

import { GRID, parseOptions } from './config.js';
import { createSim } from './sim.js';
import { createDirector, buildScenes } from './director.js';
import { createFx, createQuality } from './fx.js';
import { createPrefs } from './prefs.js';
import { createInput, steerFor } from './input.js';
import { createUI } from './ui.js';
import { createAutopilot } from './autopilot.js';
import { randomSeed, hashSeed } from './rng.js';
import { createFlatRenderer } from './render/flat.js';
import { loadTimelines, loadEngine, loadSound, loadPersp } from './render/registry.js';

const opts = parseOptions(location.search);
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const glCanvas = $('gl');
const flatCanvas = $('flat');
const invertEl = $('invert');

const prefs = createPrefs();
let mode = 'loading'; // loading | title | ready | playing | paused | over
let settingsFromReady = false; // settings opened before the first move: resume returns to ready
// Touch devices get swipe hints from the start; any touch anywhere (PLAY included) confirms it.
let touchSeen = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();

const nextSeed = () => (opts.seed !== null ? opts.seed : randomSeed());

const ui = createUI({
  prefs,
  onPlay: () => play(),
  onAgain: () => again(),
  onPauseToggle: () => togglePause(),
  onMuteToggle: () => toggleMute(),
  onSettings: () => {
    if (mode === 'playing') togglePause();
    else if (mode === 'paused') ui.showPaused(true);
    else if (mode === 'ready') { settingsFromReady = true; mode = 'paused'; ui.showPaused(true); } // before the first move
  },
});

const [timelines, engine, sound] = await Promise.all([
  loadTimelines(),
  opts.nogl ? Promise.resolve(null) : loadEngine(glCanvas, { cols: GRID.cols, rows: GRID.rows }),
  loadSound(() => prefs.get()),
]);
const { audio, beat } = sound;

if (!timelines.lcd) {
  ui.error('LCD timeline failed to load.');
  throw new Error('lcd timeline missing');
}

const flatMetas = Object.fromEntries(Object.entries(timelines).map(([id, m]) => [id, m.meta]));
const hasGL = () => !!engine && !(typeof engine.lost === 'function' && engine.lost());
// Without WebGL, rooms come back as a Canvas 2D perspective stand-in (board view only).
const fallback = engine ? null : await loadPersp({ cols: GRID.cols, rows: GRID.rows });
const persp = fallback ? fallback.persp : null;
const scenes = buildScenes({ flats: flatMetas, rooms: engine ? engine.rooms : (fallback ? fallback.rooms : {}) });
const director = createDirector({
  scenes,
  seed: opts.seed !== null ? hashSeed(opts.seed) ^ 0x5bd1e995 : randomSeed(),
  prefs: () => prefs.get(),
  hasGL: () => hasGL() || !!persp,
});
const sim = createSim({ cols: GRID.cols, rows: GRID.rows, speed: opts.speed, seed: nextSeed() });
const fxer = createFx();
const flat = createFlatRenderer({
  canvas: flatCanvas, invertEl, cols: GRID.cols, rows: GRID.rows,
  onBroken: (id) => { console.warn(`[main] disabling timeline '${id}'`); director.disable(id, performance.now()); },
});
const autopilot = opts.auto ? createAutopilot(sim) : null;

if (opts.debug) console.info(`[snake-shift] scenes: ${scenes.map((s) => s.id).join(', ')}${engine ? '' : persp ? ' (rooms in 2D perspective)' : ' (no rooms)'}; audio ${audio.stub ? 'stub' : 'loaded'}`);

// ---------- sim events -> director, audio, UI ----------
let frameNow = performance.now();
let overTimer = 0;

function applyLock() {
  if (opts.scene && director.has(opts.scene)) {
    director.force(opts.scene, frameNow, false);
    if (opts.lock) director.lock(true);
  }
}

sim.on('reset', () => {
  director.reset(frameNow);
  applyLock();
  ui.setScore(0, false);
});

const sceneById = new Map(scenes.map((s) => [s.id, s]));

sim.on('ate', ({ score }) => {
  const snap = sim.snapshot();
  const cut = director.onBite(snap, frameNow);
  const d = director.get();
  // Audio order requested by the audio stream: chaos, timeline, cut, bite.
  audio.setChaos(d.chaos);
  if (cut) {
    cutLog.push({ at: Math.round(frameNow), from: cut.from, to: cut.to, swing: cut.swing, reset: !!cut.reset, score });
    if (cutLog.length > 500) cutLog.shift();
    const target = sceneById.get(cut.to);
    audio.setTimeline(target ? target.timeline : cut.to);
    if (!cut.reset) audio.cut({ swing: cut.swing }); // Total Reset is a silent snap
  }
  if (score === 1 || !beat.running) {
    audio.start(); // starts the beat clock and the rhythm
    if (!beat.running) { try { beat.start(); } catch (e) { console.warn(e); } }
  }
  audio.eat(score);
  ui.setScore(score, true);
});

sim.on('died', () => {
  const snap = sim.snapshot();
  director.onDeath(snap, frameNow);
  audio.die();
  try { beat.stop(); } catch (e) { console.warn(e); }
  audio.stop();
  const isNew = prefs.record(snap.score);
  mode = 'over';
  clearTimeout(overTimer);
  overTimer = setTimeout(() => {
    if (mode !== 'over') return;
    ui.showOver({ score: snap.score, best: prefs.get().best, isNew });
    if (opts.auto) overTimer = setTimeout(() => { if (mode === 'over') again(); }, 1400);
  }, 650);
});

// ---------- flow ----------
function play() {
  if (mode !== 'title') return;
  audio.unlock();
  audio.setMuted(prefs.get().muted);
  startRun();
}

function startRun() {
  clearTimeout(overTimer);
  settingsFromReady = false;
  sim.reset(nextSeed());
  if (autopilot) autopilot.reset();
  mode = 'ready';
  ui.showReady(touchSeen);
  if (opts.auto) begin(null);
}

function again() {
  if (mode !== 'over') return;
  ui.hideOver();
  startRun();
}

function begin(dir) {
  if (dir) sim.queueTurn(dir);
  sim.setPaused(false);
  mode = 'playing';
  ui.showPlaying();
}

function togglePause() {
  if (mode === 'playing') {
    sim.setPaused(true);
    mode = 'paused';
    ui.showPaused(true);
    if (beat.running) audio.stop();
  } else if (mode === 'paused' && settingsFromReady) {
    settingsFromReady = false;
    mode = 'ready';
    ui.showPaused(false);
  } else if (mode === 'paused') {
    sim.setPaused(false);
    mode = 'playing';
    ui.showPaused(false);
    if (sim.snapshot().score > 0) audio.start();
  }
}

function toggleMute() {
  const m = !prefs.get().muted;
  prefs.set('muted', m);
  audio.setMuted(m);
}

createInput({
  stage,
  pad: $('dpad'),
  onDir: (dir, source) => {
    if (source === 'swipe' || source === 'button') touchSeen = true;
    if (opts.auto) return;
    if (mode === 'ready') begin(dir);
    else if (mode === 'playing') {
      // First person steers relative to the snake's heading; board views use grid directions.
      const snap = sim.snapshot();
      const turn = steerFor(dir, director.get().view, snap.heading || snap.dir);
      if (turn) sim.queueTurn(turn);
    }
  },
  onPause: () => {
    if (mode === 'playing' || mode === 'paused') togglePause();
  },
  onConfirm: () => {
    if (mode === 'title') play();
    else if (mode === 'over') again();
    else if (mode === 'paused') togglePause();
  },
  onMute: () => toggleMute(),
});
document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') touchSeen = true; }, { passive: true, capture: true });
window.addEventListener('keydown', (e) => { if (e.code && e.code.startsWith('Arrow')) touchSeen = false; }, { capture: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing' && !opts.auto) togglePause();
});

// ---------- sizing ----------
const quality = createQuality();
function resize() {
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  // Quality scaling lowers the canvas resolution on slow devices (never below half a CSS pixel).
  const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2) * quality.scale);
  flat.resize(w, h, dpr);
  // Touch buttons go in the larger margin the board leaves: under it (portrait) or beside it.
  const L = flat.layout;
  const below = h - (L.by + L.bh) - 14, side = L.bx - 20;
  const room = Math.max(below, side);
  document.documentElement.dataset.dpad = below >= side ? 'bottom' : 'side';
  document.documentElement.style.setProperty('--dpad-k', `${Math.max(44, Math.min(78, Math.floor((room - 8) / 3)))}px`);
  if (engine && typeof engine.resize === 'function') {
    try { engine.resize(w, h, dpr); } catch (e) { console.warn('[main] engine.resize failed', e); }
  }
}
window.addEventListener('resize', resize);
resize();

// ---------- loop ----------
let last = null;
let lastShowing = null;
let lastFx = null;
let glFailures = 0;

let manualClock = false; // ?debug run(ms) drives a synthetic clock instead of rAF
let invertFrames = 0;
const cutLog = [];

function rafFrame(t) {
  if (manualClock) return;
  requestAnimationFrame(rafFrame);
  if (last !== null && !document.hidden && quality.sample(t - last)) {
    resize();
    if (opts.debug) console.info(`[main] slow frames: canvas resolution x${quality.scale}`);
  }
  frame(t);
}

function frame(t) {
  frameNow = t;
  const dt = last === null ? 0 : Math.min(100, Math.max(0, t - last));
  last = t;

  if (mode === 'playing') {
    if (autopilot) {
      for (let rem = dt; rem > 0; rem -= 12) {
        autopilot.update();
        sim.advance(Math.min(12, rem));
      }
    } else {
      sim.advance(dt);
    }
  }

  const snap = sim.snapshot();
  director.update(snap, t);
  const d = director.get();
  if (d.showing !== lastShowing) {
    lastShowing = d.showing;
    ui.setScene(d.sceneInfo);
    audio.setTimeline(d.timeline);
  }
  const p = prefs.get();
  const fx = fxer.frame({ now: t, director: d, beat, prefs: p });
  lastFx = fx;

  let glActive = false;
  if (d.kind === '3d' && hasGL()) {
    try {
      engine.render(d.timeline, d.view, snap, fx);
      glActive = true;
      glFailures = 0;
    } catch (err) {
      if (++glFailures === 1) console.error('[main] room render failed', err);
      if (glFailures >= 3) director.disable(d.timeline, t);
    }
  }
  const glVis = glActive ? 'visible' : 'hidden';
  if (glCanvas.style.visibility !== glVis) glCanvas.style.visibility = glVis;
  const padSide = p.dpad && document.documentElement.dataset.dpad === 'side';
  flat.render({ snap, fx, d, timelines, glActive, persp, touch: p.dpad ? 'tap' : touchSeen, padSide });
  if (invertEl.style.display === 'block') invertFrames++;
}

// ---------- debug ----------
if (opts.debug) {
  window.__ss = {
    sim, director, engine, persp, timelines, scenes, prefs, audio, beat, flat,
    get fx() { return lastFx; },
    quality,
    get mode() { return mode; },
    force: (id) => director.force(id, frameNow),
    lock: (on = true) => director.lock(on),
    cuts: cutLog,
    get invertFrames() { return invertFrames; },
    /** Drive `ms` of synthetic time in 16 ms frames; stops the rAF loop (reload to resume). */
    run(ms) {
      manualClock = true;
      let t = last ?? 0;
      for (let i = 0; i < ms / 16; i++) {
        t += 16;
        frame(t);
        if (mode === 'over' && opts.auto) again(); // timers do not fire inside a synchronous run
      }
      return { t, mode, score: sim.snapshot().score, cuts: cutLog.length };
    },
    /**
     * Play through the real input path on the synthetic clock: arrow keydowns, or touch
     * pointer swipes on the stage ({ swipe: true }). Eats `target` dots by BFS, then
     * steers into a wall. Returns what was seen (scenes, phrases, first person, flashes).
     */
    drive({ swipe = false, target = 12, maxMs = 120000 } = {}) {
      const V = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const send = (d) => {
        if (!swipe) { window.dispatchEvent(new KeyboardEvent('keydown', { code: `Arrow${d[0].toUpperCase()}${d.slice(1)}`, bubbles: true })); return; }
        const r = stage.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const ev = (type, k) => stage.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x + V[d][0] * k, clientY: y + V[d][1] * k }));
        ev('pointerdown', 0); ev('pointermove', 12); ev('pointermove', 40); ev('pointerup', 40);
      };
      const choose = (s) => {
        const occ = new Set(s.snake.slice(0, -1).map((c) => `${c.x},${c.y}`));
        const ok = (x, y) => x >= 0 && y >= 0 && x < s.cols && y < s.rows && !occ.has(`${x},${y}`);
        const h = s.snake[0];
        const q = [], seen = new Set();
        for (const d of Object.keys(V)) {
          const x = h.x + V[d][0], y = h.y + V[d][1];
          if (d !== OPP[s.dir] && ok(x, y)) { q.push([x, y, d]); seen.add(`${x},${y}`); }
        }
        for (let i = 0; i < q.length; i++) {
          const [x, y, d] = q[i];
          if (s.food && x === s.food.x && y === s.food.y) return d;
          for (const v of Object.values(V)) {
            const k = `${x + v[0]},${y + v[1]}`;
            if (ok(x + v[0], y + v[1]) && !seen.has(k)) { seen.add(k); q.push([x + v[0], y + v[1], d]); }
          }
        }
        return q.length ? q[0][2] : s.dir;
      };
      const log = { modes: [mode], scenes: [], phrases: [], povFrames: 0, glFrames: 0, invertFrames: 0, strobeFrames: 0 };
      if (mode === 'ready') send(choose(sim.snapshot()));
      log.modes.push(mode);
      let lastTick = -1, t = 0, lastPhrase = null;
      while (t < maxMs && mode === 'playing') {
        const s = sim.snapshot();
        if (s.tick !== lastTick) {
          lastTick = s.tick;
          const want = s.score >= target ? (s.dir === 'up' || s.dir === 'down' ? s.dir : 'up') : choose(s);
          if (want !== s.dir) send(want);
        }
        this.run(16); t += 16;
        const d = director.get();
        if (log.scenes[log.scenes.length - 1] !== d.showing) log.scenes.push(d.showing);
        if (d.phrase && d.phrase !== lastPhrase) { lastPhrase = d.phrase; log.phrases.push(d.phrase.text); }
        if (d.view === 'pov') log.povFrames++;
        if (glCanvas.style.visibility === 'visible') log.glFrames++;
        if (invertEl.style.display === 'block') log.invertFrames++;
        if (lastFx && lastFx.strobe) log.strobeFrames++;
      }
      log.modes.push(mode);
      const s = sim.snapshot();
      return { ...log, score: s.score, death: s.death, ms: t, cuts: cutLog.slice(-60) };
    },
  };
}

// ---------- start ----------
mode = 'title';
ui.ready();
if (opts.auto) {
  ui.showTitle();
  play();
} else {
  ui.showTitle();
}
applyLock();
requestAnimationFrame(rafFrame);
