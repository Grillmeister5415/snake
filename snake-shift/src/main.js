// SNAKE//SHIFT entry: loop, wiring, debug switches.
// One-way flow: input -> sim -> events -> director -> renderers/audio/UI.
// The simulation picks the universe (and its rules); the director picks only the look.

import { GRID, parseOptions } from './config.js';
import { createSim } from './sim.js';
import { createDirector, buildUniverses, simUniverses } from './director.js';
import { createFx, createQuality } from './fx.js';
import { createPrefs } from './prefs.js';
import { createInput, steerFor } from './input.js';
import { createUI } from './ui.js';
import { createAutopilot, chooseDir } from './autopilot.js';
import { randomSeed, hashSeed } from './rng.js';
import { createFlatRenderer } from './render/flat.js';
import { loadTimelines, loadRoomModules, loadEngine, loadSound, loadPersp } from './render/registry.js';

const opts = parseOptions(location.search);
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const glCanvas = $('gl');
const flatCanvas = $('flat');
const invertEl = $('invert');

const prefs = createPrefs();
let mode = 'loading'; // loading | title | ready | playing | paused | respawn | over
let pausedFrom = null; // settings opened while waiting ('ready' or 'respawn'): resume returns there
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
    else if (mode === 'ready' || mode === 'respawn') { pausedFrom = mode; mode = 'paused'; ui.showPaused(true); }
  },
});

const [timelines, roomMods, engine, sound] = await Promise.all([
  loadTimelines(),
  loadRoomModules(),
  opts.nogl ? Promise.resolve(null) : loadEngine(glCanvas, { cols: GRID.cols, rows: GRID.rows }),
  loadSound(() => prefs.get()),
]);
const { audio, beat } = sound;

if (!timelines.lcd) {
  ui.error('LCD timeline failed to load.');
  throw new Error('lcd timeline missing');
}

const metas = (mods) => Object.fromEntries(Object.entries(mods).map(([id, m]) => [id, m.meta]));
const hasGL = () => !!engine && !(typeof engine.lost === 'function' && engine.lost());
// Without WebGL, the four built rooms come back as a Canvas 2D perspective stand-in (board view
// only) and the new universes show only their 2D look.
const fallback = engine ? null : await loadPersp({ cols: GRID.cols, rows: GRID.rows }, roomMods);
const persp = fallback ? fallback.persp : null;
const universes = buildUniverses({
  flats: metas(timelines),
  rooms: metas(roomMods),
  glRooms: engine ? engine.rooms : null,
  perspRooms: fallback ? fallback.rooms : null,
});
const uById = new Map(universes.map((u) => [u.id, u]));
const director = createDirector({
  universes,
  seed: opts.seed !== null ? hashSeed(opts.seed) ^ 0x5bd1e995 : randomSeed(),
  prefs: () => prefs.get(),
  hasGL,
});
const start = {};
if (opts.score !== null) start.score = opts.score;
if (opts.lives !== null) start.lives = opts.lives;
if (opts.universe && uById.has(opts.universe)) start.universe = opts.universe;
const sim = createSim({ universes: simUniverses(universes), speed: opts.speed, seed: nextSeed(), start });
const fxer = createFx();
const flat = createFlatRenderer({
  canvas: flatCanvas, invertEl, cols: GRID.cols, rows: GRID.rows,
  onBroken: (id) => {
    if (id === 'lcd') return; // the last resort stays
    const kind = director.get().kind === '2d' ? '2d' : '3d';
    console.warn(`[main] disabling the ${kind} look of '${id}'`);
    director.disable(id, frameNow, kind);
  },
});
const autopilot = opts.auto ? createAutopilot(sim) : null;

/** The current universe's life() icon: from the look on screen first, then the other module. */
function lifeIconFor(d) {
  const id = d.timeline;
  const t = timelines[id] && typeof timelines[id].life === 'function' ? timelines[id].life : null;
  const r = roomMods[id] && typeof roomMods[id].life === 'function' ? roomMods[id].life : null;
  return d.kind === '2d' ? (t || r) : (r || t);
}

if (opts.debug) {
  const desc = universes.map((u) => `${u.id}[${u.looks.join('/')}]`).join(', ');
  console.info(`[snake-shift] universes: ${desc}${engine ? '' : persp ? ' (rooms in 2D perspective)' : ' (no rooms)'}; audio ${audio.stub ? 'stub' : 'loaded'}`);
}

// ---------- sim events -> director, audio, UI (audio order: notes/audio.md) ----------
let frameNow = performance.now();
let overTimer = 0;
let respawnAt = -Infinity;
let pendingBite = null; // an `ate` whose shift (if any) has not come yet
const cutLog = [];
const eventLog = [];

function logCut(cut, score, kind) {
  if (!cut) return;
  cutLog.push({ at: Math.round(frameNow), from: cut.from, to: cut.to, look: cut.look, held: cut.held, swing: cut.swing, reset: !!cut.reset, score, kind });
  if (cutLog.length > 500) cutLog.shift();
}
function logEvent(type, e) {
  if (!opts.debug) return;
  eventLog.push({ type, at: Math.round(frameNow), ...e });
  if (eventLog.length > 500) eventLog.shift();
}

sim.on('reset', () => {
  const snap = sim.snapshot();
  director.reset(frameNow, snap);
  pendingBite = null;
  audio.setScore(snap.score);
  audio.setLives(snap.lives);
  ui.setScore(snap.score, false);
  ui.setLives(snap.lives, snap.maxLives, null);
});

/** Bite audio and HUD, once the universe and look of this bite are known. */
function finishBite(e, cut) {
  const d = director.get();
  const look = cut ? cut.look : (d.look || '2d');
  const to = cut ? cut.to : d.universe;
  const from = e.from || to;
  audio.shift({ from, to, look, swing: !!(cut && cut.swing) });
  audio.eat(e.score);
  ui.setScore(e.score, true);
}

/** An `ate` that no `shift` followed (held bite, or nowhere to go): close it now. */
function flushBite() {
  if (!pendingBite) return;
  const e = pendingBite;
  pendingBite = null;
  finishBite(e, e.cut || null);
}

sim.on('ate', (e) => {
  flushBite();
  const snap = sim.snapshot();
  logEvent('ate', { kind: e.kind, score: e.score, held: e.held, lifeGained: e.lifeGained });
  const cut = director.onAte(e, snap, frameNow);
  logCut(cut, e.score, 'flip');
  audio.setScore(e.score);
  if (e.lifeGained) {
    audio.setLives(snap.lives);
    audio.lifeGained();
  }
  if (e.lifeGained || e.kind === 'mushroom') ui.setLives(snap.lives, snap.maxLives, e.lifeGained ? 'gain' : null);
  pendingBite = { score: e.score, from: snap.universe.id, cut };
  if (e.held) flushBite();
});

sim.on('shift', (e) => {
  const snap = sim.snapshot();
  logEvent('shift', { from: e.from, to: e.to, index: e.index, reset: !!e.reset });
  const cut = director.onShift(e, snap, frameNow);
  logCut(cut, snap.score, e.reset ? 'reset' : 'shift');
  if (pendingBite) {
    const b = pendingBite;
    pendingBite = null;
    finishBite({ ...b, from: e.from }, cut || { from: e.from, to: e.to, look: director.get().look, swing: false });
  } else {
    // Not a bite (debug lock): the kit follows the universe without a drop.
    audio.shift({ from: e.from, to: e.to, look: cut ? cut.look : '2d', swing: false });
  }
});

sim.on('lifeLost', (e) => {
  flushBite();
  const snap = sim.snapshot();
  logEvent('lifeLost', { lives: e.lives, reason: e.death && e.death.reason });
  director.onLifeLost(e, snap, frameNow);
  audio.setLives(e.lives);
  audio.lifeLost();
  ui.setLives(e.lives, snap.maxLives, 'loss');
  mode = 'respawn';
  respawnAt = frameNow;
  ui.showRespawn(touchSeen);
});

sim.on('died', (e) => {
  flushBite();
  const snap = sim.snapshot();
  logEvent('died', { score: e.score, reason: e.death && e.death.reason });
  director.onDeath(snap, frameNow);
  audio.setLives(0);
  audio.die();
  if (beat.running) { try { beat.stop(); } catch (err) { console.warn(err); } }
  ui.setLives(0, snap.maxLives, 'loss');
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
  pausedFrom = null;
  sim.reset(nextSeed()); // waiting 'start'
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

/** First direction key of a run (waiting 'start'). */
function begin(dir) {
  if (dir) sim.queueTurn(dir);
  sim.setPaused(false);
  audio.start(); // the run opens on 3310 Ghost clicks
  if (!beat.running) { try { beat.start(); } catch (e) { console.warn(e); } }
  mode = 'playing';
  ui.showPlaying();
}

/** First direction key after a lost life (waiting 'respawn'). */
function respawn(dir) {
  if (dir) {
    const snap = sim.snapshot();
    const turn = steerFor(dir, director.get().view, snap.heading || snap.dir);
    if (turn) sim.queueTurn(turn);
  }
  sim.setPaused(false);
  audio.respawned();
  mode = 'playing';
  ui.showPlaying();
}

function togglePause() {
  if (mode === 'playing') {
    sim.setPaused(true);
    mode = 'paused';
    ui.showPaused(true);
    audio.stop();
  } else if (mode === 'paused' && pausedFrom) {
    mode = pausedFrom; // still waiting for the first direction key
    pausedFrom = null;
    ui.showPaused(false);
    if (mode === 'respawn') ui.showRespawn(touchSeen); else ui.showReady(touchSeen);
  } else if (mode === 'paused') {
    sim.setPaused(false);
    mode = 'playing';
    ui.showPaused(false);
    audio.start();
    if (!beat.running) { try { beat.start(); } catch (e) { console.warn(e); } }
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
    else if (mode === 'respawn') respawn(dir);
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
      for (let rem = dt; rem > 0 && mode === 'playing'; rem -= 12) {
        autopilot.update();
        sim.advance(Math.min(12, rem));
      }
    } else {
      sim.advance(dt);
    }
    flushBite();
  } else if (mode === 'respawn' && opts.auto && t - respawnAt > 700) {
    respawn(null);
  }

  const snap = sim.snapshot();
  const look = director.update(snap, t);
  if (look && look.from === look.to && look.look !== look.prevLook) audio.setLook(look.look); // first-person fallback
  const d = director.get();
  if (d.showing !== lastShowing) {
    lastShowing = d.showing;
    ui.setScene(d.sceneInfo);
    ui.setLifeIcon(lifeIconFor(d));
  }
  const p = prefs.get();
  const fx = fxer.frame({ now: t, director: d, beat, prefs: p, snap });
  lastFx = fx;

  let glActive = false;
  const u = uById.get(d.timeline);
  if (d.kind === '3d' && hasGL() && u && u.gl) {
    try {
      engine.render(d.timeline, d.view, snap, fx);
      glActive = true;
      glFailures = 0;
    } catch (err) {
      if (++glFailures === 1) console.error('[main] room render failed', err);
      if (glFailures >= 3) director.disable(d.timeline, t, '3d');
    }
  }
  const glVis = glActive ? 'visible' : 'hidden';
  if (glCanvas.style.visibility !== glVis) glCanvas.style.visibility = glVis;
  const padSide = p.dpad && document.documentElement.dataset.dpad === 'side';
  flat.render({ snap, fx, d, timelines, glActive, persp, touch: p.dpad ? 'tap' : touchSeen, padSide });
  ui.frame(fx, snap);
  if (invertEl.style.display === 'block') invertFrames++;
}

// ---------- debug (only with ?debug) ----------
if (opts.debug) {
  const seen = new Map(); // universe id -> Set of looks shown
  const TURN = { up: ['left', 'right'], right: ['up', 'down'], down: ['right', 'left'], left: ['down', 'up'] }; // [left turn, right turn]
  const KEY = (d) => `Arrow${d[0].toUpperCase()}${d.slice(1)}`;
  window.__ss = {
    sim, director, engine, persp, timelines, roomMods, universes, prefs, audio, beat, flat, ui,
    get fx() { return lastFx; },
    get snap() { return sim.snapshot(); },
    get d() { return director.get(); },
    quality,
    get mode() { return mode; },
    cuts: cutLog,
    events: eventLog,
    seen,
    get invertFrames() { return invertFrames; },
    /** Hold one universe (debug lock), or release with null. */
    lock: (id = null) => { director.lock(!!id); return sim.lockUniverse(id); },
    /** Hold one look ('2d' | '3d' | 'pov'), or release with null. */
    look: (l = null) => director.setLook(l, frameNow),
    /** Drive `ms` of synthetic time in 16 ms frames; stops the rAF loop (reload to resume). */
    run(ms) {
      manualClock = true;
      let t = last ?? 0;
      for (let i = 0; i < ms / 16; i++) {
        t += 16;
        frame(t);
        const d = director.get();
        if (!seen.has(d.timeline)) seen.set(d.timeline, new Set());
        seen.get(d.timeline).add(d.look);
        if (mode === 'over' && opts.auto) { clearTimeout(overTimer); again(); } // timers do not fire inside a synchronous run
      }
      const s = sim.snapshot();
      return { t, mode, score: s.score, lives: s.lives, universe: s.universe.id, look: director.get().look, cuts: cutLog.length };
    },
    /** Which universes and looks have been on screen since load. */
    seenLooks() { return Object.fromEntries([...seen].map(([k, v]) => [k, [...v].sort()])); },
    /**
     * Play through the real input path on the synthetic clock: arrow keydowns, or touch pointer
     * swipes on the stage ({ swipe: true }). Eats `target` food by the autopilot's search, resumes
     * after lost lives by key, then steers into a wall. Returns what was seen.
     */
    drive({ swipe = false, target = 12, maxMs = 120000 } = {}) {
      const V = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const send = (d) => {
        if (!swipe) { window.dispatchEvent(new KeyboardEvent('keydown', { code: KEY(d), bubbles: true })); return; }
        const r = stage.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const ev = (type, k) => stage.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x + V[d][0] * k, clientY: y + V[d][1] * k }));
        ev('pointerdown', 0); ev('pointermove', 12); ev('pointermove', 40); ev('pointerup', 40);
      };
      // A grid direction as the key the player would press in the current view.
      const press = (want, s) => {
        if (director.get().view !== 'pov') return send(want);
        const h = s.heading || s.dir;
        if (want === TURN[h][0]) send('left');
        else if (want === TURN[h][1]) send('right');
      };
      const log = { modes: [mode], scenes: [], phrases: [], respawns: 0, povFrames: 0, glFrames: 0, invertFrames: 0, strobeFrames: 0 };
      if (mode === 'ready') send(chooseDir(sim.snapshot()) || 'up');
      log.modes.push(mode);
      let lastTick = -1, t = 0, lastPhrase = null;
      while (t < maxMs && (mode === 'playing' || mode === 'respawn')) {
        const s = sim.snapshot();
        if (mode === 'respawn') {
          this.run(200); t += 200;
          send(chooseDir(sim.snapshot()) || s.dir);
          log.respawns++;
          continue;
        }
        if (s.tick !== lastTick) {
          lastTick = s.tick;
          let want;
          if (s.score >= target) {
            want = s.universe.rules === 'lane' ? (s.dir === 'left' || s.dir === 'right' ? s.dir : 'left')
              : (s.dir === 'up' || s.dir === 'down' ? s.dir : 'up');
          } else want = chooseDir(s) || s.dir;
          if (want !== s.dir) press(want, s);
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
      return { ...log, score: s.score, lives: s.lives, death: s.death, ms: t, cuts: cutLog.slice(-60) };
    },
  };
}

// ---------- start ----------
// Debug holds (only with ?debug; parseOptions drops them otherwise): a universe, a look.
if (opts.lock && opts.universe && uById.has(opts.universe)) {
  director.lock(true);
  sim.lockUniverse(opts.universe);
}
if (opts.look) director.setLook(opts.look, frameNow);
mode = 'title';
ui.ready();
ui.showTitle();
if (opts.auto) play();
requestAnimationFrame(rafFrame);
