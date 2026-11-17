// SNAKE//SHIFT entry: loop, wiring, debug switches.
// One-way flow: input -> sim -> events -> director -> renderers/audio/UI.
// The simulation picks the universe (and its rules); the director picks only the look.
// HALL OF SHIFTERS (LEADERBOARD_PLAN): identity, tickets, outbox, run status and the two menu
// overlays live in their own modules; this file only wires them to the game flow. Nothing in
// play(), startRun() or again() waits for the network.

import { GRID, parseOptions, practiceParams } from './config.js';
import { createSim } from './sim.js';
import { createDirector, buildUniverses, simUniverses } from './director.js';
import { createFx, createQuality } from './fx.js';
import { createPrefs } from './prefs.js';
import { createInput, steerFor } from './input.js';
import { createUI } from './ui.js';
import { createAutopilot, chooseDir } from './autopilot.js';
import { createPressure } from './pressure.js';
import { randomSeed, hashSeed } from './rng.js';
import { createFlatRenderer } from './render/flat.js';
import { loadTimelines, loadRoomModules, loadEngine, loadSound, loadPersp } from './render/registry.js';
import { RULESET, sameRules } from './ruleset.js';
import { createApi } from './api.js';
import { createIdentity } from './identity.js';
import { createTickets } from './tickets.js';
import { createOutbox } from './outbox.js';
import { createRanked, statusText, canUpgrade } from './ranked.js';
import { createNav } from './nav.js';
import { createBoard } from './board.js';
import { createUsername } from './username.js';

const opts = parseOptions(location.search);
// Practice runs (A9): any practice parameter in the address, by raw presence. Never ranked.
const practice = practiceParams(location.search).length > 0;
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const glCanvas = $('gl');
const flatCanvas = $('flat');
const invertEl = $('invert');

const prefs = createPrefs();
let overRect = null; // game-over panel rectangle in stage px, for a scene's crash screen
let run = null;      // the run being played (ranked.begin)
let shownRun = null; // the run the game-over panel shows; answers for any other run never touch it
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
  onBoard: (origin, opener) => openBoard(origin, opener),
  onMenu: () => toTitle(),
  onIdentity: (origin, opener) => openUsername(origin, opener, 'change'),
});

// ---------- leaderboard: identity, tickets, outbox (LEADERBOARD_PLAN C4) ----------
// ?auto never touches the network (Part B 4): every call fails at once as offline.
const api = createApi({ enabled: !opts.auto });
const identity = createIdentity({ api });
const outbox = createOutbox({ api, onAuthLost: (id) => identity.sessionLost(id) });
const tickets = createTickets({
  api, ruleset: RULESET, playerId: () => identity.activePlayerId(),
  // Never hoard (the server retires the oldest beyond 30): none for practice, none while runs wait.
  mayRefill: () => !practice && outbox.pending(identity.activePlayerId()) === 0,
  onAuthLost: (id) => identity.sessionLost(id),
});
const nav = createNav();
const board = createBoard({
  api,
  who: () => { const id = identity.get(); return { playerId: identity.activePlayerId(), hasUsername: !!id.handle }; },
  onBack: () => closeOverlay(),
  onMain: (origin) => {
    closeOverlay({ focus: origin === 'pause' });
    if (origin === 'title') play();
    else if (origin === 'over') again();
  },
  onSetUsername: (opener) => openUsername('board', opener, 'change'),
  announce: (t) => ui.announce(t),
});
const username = createUsername({
  onSubmit: (handle, formMode) => {
    identity.setHandle(handle);
    const from = closeOverlay({ focus: formMode !== 'first' });
    if (formMode === 'first' && from && from.origin === 'title') startFirstRun();
    sync();
  },
  onSkip: () => {
    identity.skip();
    closeOverlay({ focus: false });
    startFirstRun();
  },
  onBack: () => closeOverlay(),
});
identity.on(({ previous, playerId }) => {
  // A new player (the old session was gone): the old player's waiting runs stay local for good.
  if (previous && previous !== playerId) { outbox.dropPlayer(previous, 'session'); tickets.clear(); board.forget(); }
  ui.setIdentity(identity.get());
});
ui.setIdentity(identity.get());

/** Background upkeep while a menu is open: session, waiting runs, then a few tickets. */
function sync() {
  if (opts.auto) return;
  identity.ensure().then(() => outbox.flush()).then(() => tickets.refill()).then(upgradeWaitingRun);
}

/**
 * A ticket arrived while a local run still waits for its first direction: start that run again
 * on the ticket, so it counts (the first run after choosing a username). Nothing has moved yet.
 */
function upgradeWaitingRun() {
  if (!run) return; // also while the game is still loading: there is no simulation yet
  const waitingMode = mode === 'paused' && pausedFrom === 'ready' ? 'ready' : mode;
  if (!canUpgrade(run, sim.snapshot(), waitingMode) || tickets.count() === 0) return;
  const next = ranked.begin(nextSeed);
  if (!next.ranked) return; // the ticket went elsewhere (another tab): the waiting run stays as it is
  run = next;
  sim.reset(run.seed);
  ranked.attach(run, sim);
}
window.addEventListener('online', () => { if (!opts.auto) { outbox.kick(); sync(); } });
sync(); // tickets arrive while the timelines load

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
// Musical pressure (SOUND_PLAN 2.4): evaluated after each advance, at most once per tick or turn change.
const pressure = createPressure();
let pressureTick = -1;
let pressureTurns = null;
let spaceKind = 'box';
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
  pressureTick = -1;
  pressureTurns = null;
  spaceKind = snap.space.kind;
  audio.setGameplay({ stepMs: snap.stepMs, startMs: sim.speed.startMs, capMs: sim.speed.capMs, score: snap.score, length: snap.length, clear: true });
  // A new run starts in its own universe (LCD); a reset fires no sim shift, so tell the engine here.
  audio.shift({ to: snap.universe.id, look: director.get().look || '2d' });
  audio.setLives(snap.lives);
  ui.setScore(snap.score, false);
  ui.setLives(snap.lives, snap.maxLives, null);
});

/**
 * Bite audio and HUD, once the universe and look of this bite are known.
 * Audio order (notes/audio.md): setGameplay → [setLives, lifeGained] → bite.
 */
function finishBite(e, cut, clear = false) {
  const d = director.get();
  const look = cut ? cut.look : (d.look || '2d');
  const prevLook = cut && cut.prevLook ? cut.prevLook : look;
  const to = cut ? cut.to : d.universe;
  const from = e.from || to;
  audio.setGameplay({ stepMs: e.stepMs, score: e.score, length: e.length, clear });
  if (e.lifeGained) {
    audio.setLives(e.lives);
    audio.lifeGained();
  }
  audio.bite({
    score: e.score, kind: e.kind, from, to, look, prevLook, held: !!e.held,
    reset: !!(cut && cut.reset), swing: !!(cut && cut.swing), lifeGained: !!e.lifeGained,
  });
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
  if (e.lifeGained || e.kind === 'mushroom') ui.setLives(snap.lives, snap.maxLives, e.lifeGained ? 'gain' : null);
  pendingBite = {
    score: e.score, from: snap.universe.id, cut, held: !!e.held, kind: e.kind, lifeGained: !!e.lifeGained,
    lives: snap.lives, length: snap.length, stepMs: snap.stepMs,
  };
  if (e.held) flushBite();
});

sim.on('shift', (e) => {
  const snap = sim.snapshot();
  logEvent('shift', { from: e.from, to: e.to, index: e.index, reset: !!e.reset });
  const cut = director.onShift(e, snap, frameNow);
  logCut(cut, snap.score, e.reset ? 'reset' : 'shift');
  // A new space kind makes the old pressure meaningless.
  const spaceChanged = snap.space.kind !== spaceKind;
  spaceKind = snap.space.kind;
  if (pendingBite) {
    const b = pendingBite;
    pendingBite = null;
    finishBite({ ...b, from: e.from }, cut || { from: e.from, to: e.to, look: director.get().look, swing: false }, spaceChanged);
  } else {
    // Not a bite (debug lock): the kit follows the universe, no bite sound, no impact.
    if (spaceChanged) audio.setGameplay({ clear: true });
    audio.shift({ from: e.from, to: e.to, look: cut ? cut.look : '2d' });
  }
});

sim.on('lifeLost', (e) => {
  flushBite();
  const snap = sim.snapshot();
  logEvent('lifeLost', { lives: e.lives, reason: e.death && e.death.reason });
  director.onLifeLost(e, snap, frameNow);
  ui.setCrash(director.get().crash);
  audio.setGameplay({ clear: true });
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
  ui.setCrash(director.get().crash);
  audio.setGameplay({ clear: true });
  audio.setLives(0);
  audio.die();
  if (beat.running) { try { beat.stop(); } catch (err) { console.warn(err); } }
  ui.setLives(0, snap.maxLives, 'loss');
  // The run's result goes to the outbox in a task of its own; the local best is updated at once.
  const ended = run;
  ranked.finish(ended, { score: snap.score });
  const isNew = prefs.record(snap.score, { practice });
  // A crash screen keeps its text clear of the panel that arrives in 650 ms: measure it now.
  overRect = director.get().crash
    ? measureOver({ score: snap.score, best: prefs.bestFor({ practice }), isNew, status: statusView(ranked.status(ended)) })
    : null;
  mode = 'over';
  clearTimeout(overTimer);
  overTimer = setTimeout(() => {
    if (mode !== 'over') return;
    shownRun = ended;
    const st = ranked.status(ended);
    ui.showOver({ score: snap.score, best: prefs.bestFor({ practice }), isNew, status: statusView(st) });
    if (st.state === 'saved' || st.state === 'waiting') announceStatus(st); // answered before the panel came
    if (opts.auto) overTimer = setTimeout(() => { if (mode === 'over') again(); }, 1400);
    else sync();
  }, 650);
});

// ---------- run status on game over (A4) ----------
const ranked = createRanked({
  identity, tickets, outbox, practice,
  rulesOk: () => sameRules(simUniverses(universes), sim.speed),
});
const statusView = (st) => {
  const t = statusText(st);
  return { state: st.state, text: t.detail ? `${t.text} \u00b7 ${t.detail}` : t.text, detail: t.detail, wall: t.wall };
};
/** The one polite announcement for a finished save or a failure (A8). */
function announceStatus(st) {
  const v = statusView(st);
  if (st.state === 'saved') ui.announce(v.wall ? `Saved. ${v.detail.toLowerCase()}. You made the wall.` : v.detail ? `Saved. ${v.detail.toLowerCase()}.` : 'Saved.');
  else if (st.state === 'waiting') ui.announce('Waiting to sync.');
  else if (st.state === 'local') ui.announce(`Not saved: ${v.detail.toLowerCase() || 'local run'}.`);
}
ranked.on((r, st) => {
  if (r !== shownRun || mode !== 'over') return;
  ui.setRunStatus(statusView(st));
  if (overRect) overRect = measureOver(); // the status line may have changed the panel's height
  announceStatus(st);
});
outbox.on((ev) => {
  if (ev.state !== 'saved') return;
  if (board.isOpen) board.refresh();
  tickets.refill().then(upgradeWaitingRun);
});

// ---------- flow ----------
function play() {
  if (mode !== 'title' || nav.overlay !== 'none') return;
  // The first PLAY asks for a username once (A0, C6); ?auto never does.
  if (!opts.auto && identity.needsUsername()) { openUsername('title', $('btn-play'), 'first'); return; }
  startFirstRun();
}

/** Leaves the title for a run, inside the user gesture that asked for it (audio unlock). */
function startFirstRun() {
  if (mode !== 'title') return;
  audio.unlock();
  audio.setMuted(prefs.get().muted);
  startRun();
}

/** The game-over panel's rectangle relative to the stage (the canvas). */
function measureOver(data = null) {
  const r = ui.measureOver(data), s = stage.getBoundingClientRect();
  return { x: r.x - s.left, y: r.y - s.top, w: r.w, h: r.h };
}

function startRun() {
  clearTimeout(overTimer);
  ui.setCrash(false);
  overRect = null;
  pausedFrom = null;
  shownRun = null;
  // Ranked or local is decided here, once (A9): a ticket's seed, or a random one.
  run = ranked.begin(nextSeed);
  sim.reset(run.seed); // waiting 'start'
  ranked.attach(run, sim);
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

/** [ MENU ] on game over: back to the title. Audio stays stopped; the next PLAY starts afresh. */
function toTitle() {
  if (mode !== 'over' || nav.overlay !== 'none') return;
  clearTimeout(overTimer);
  shownRun = null;
  ui.setCrash(false);
  overRect = null;
  ui.hideOver();
  mode = 'title';
  ui.showTitle();
  sync();
}

// ---------- menu overlays (A5): the leaderboard and the USERNAME form ----------
const PRIMARY = { title: 'btn-play', pause: 'btn-resume', over: 'btn-again' };

function openBoard(origin, opener) {
  if (nav.overlay !== 'none') return;
  nav.open('board', { origin, opener });
  ui.setCovered(true);
  board.open({ origin });
  sync(); // a menu is open: a good moment for tickets
}

function openUsername(origin, opener, formMode) {
  if (nav.has('username')) return;
  if (nav.overlay === 'board') { board.el.panel.setAttribute('inert', ''); board.el.panel.classList.add('is-covered'); }
  nav.open('username', { origin, opener });
  ui.setCovered(true);
  const id = identity.get();
  $('username-note').textContent = id.persistent ? 'Saved on this browser.' : 'This browser is not keeping data: the name lasts until you leave.';
  username.open({
    mode: formMode,
    current: formMode === 'change' ? id.handle : null,
    problem: id.problem ? id.problem.reason : null,
    focusField: !touchSeen,
  });
}

/**
 * Closes the top overlay and goes back where it was opened from. The game mode and pausedFrom
 * are never touched here, so a paused run stays paused. Returns the closed entry.
 */
function closeOverlay({ focus = true } = {}) {
  const entry = nav.close();
  if (!entry) return null;
  if (entry.kind === 'board') board.close(); else username.close();
  if (nav.overlay === 'board') {
    board.el.panel.removeAttribute('inert');
    board.el.panel.classList.remove('is-covered');
    board.rerender();
    if (focus) (entry.opener && entry.opener.isConnected ? entry.opener : board.el.heading).focus({ preventScroll: true });
    return entry;
  }
  ui.setCovered(false);
  if (focus) {
    const o = entry.opener;
    const visible = o && o.isConnected && !o.closest('[hidden]') && o.getClientRects().length;
    const target = visible ? o : $(PRIMARY[entry.origin]);
    if (target) target.focus({ preventScroll: true });
  }
  return entry;
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
  ui.setCrash(false);
  audio.respawned();
  mode = 'playing';
  ui.showPlaying();
}

function togglePause() {
  if (mode === 'playing') {
    sim.setPaused(true);
    mode = 'paused';
    ui.showPaused(true);
    audio.setGameplay({ clear: true });
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

let usedGesture; // the swipe gesture that already turned the snake in first person, or started the run
createInput({
  stage,
  pad: $('dpad'),
  // Every global key asks the mode and the open overlay first (nav.routeKey).
  state: () => ({ mode, overlay: nav.overlay }),
  onBack: () => closeOverlay(),
  onDir: (dir, source, gesture) => {
    if (source === 'swipe' || source === 'button') touchSeen = true;
    if (opts.auto) return;
    if (mode === 'ready') { usedGesture = gesture; begin(dir); }
    else if (mode === 'respawn') { usedGesture = gesture; respawn(dir); }
    else if (mode === 'playing') {
      // First person steers relative to the snake's heading; board views use grid directions.
      const snap = sim.snapshot();
      const view = director.get().view;
      // First person: one swipe is one turn, however far the finger keeps moving. (Left is relative
      // there, so a second direction from the same drag would turn the snake again.)
      const swipe = view === 'pov' && gesture !== undefined;
      if (swipe && gesture === usedGesture) return;
      const turn = steerFor(dir, view, snap.heading || snap.dir);
      if (turn && sim.queueTurn(turn) && swipe) usedGesture = gesture;
    }
  },
  // First person on a phone: a tap on the left or right half of the screen turns that way.
  onTap: (x) => {
    touchSeen = true;
    if (opts.auto || mode !== 'playing' || director.get().view !== 'pov') return;
    const r = stage.getBoundingClientRect();
    const snap = sim.snapshot();
    const turn = steerFor(x < r.left + r.width / 2 ? 'left' : 'right', 'pov', snap.heading || snap.dir);
    if (turn) sim.queueTurn(turn);
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
  if (overRect) overRect = measureOver();
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
    if (mode === 'playing') {
      const ps = sim.snapshot();
      if (ps.tick !== pressureTick || ps.turns !== pressureTurns) {
        pressureTick = ps.tick;
        pressureTurns = ps.turns;
        audio.setGameplay({ pressure: pressure.evaluate(ps).danger });
      }
    }
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
  const fx = fxer.frame({ now: t, director: d, beat, prefs: p, snap, panel: overRect });
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
    /** The musical pressure estimate for the current snapshot (a copy). */
    get pressure() { return { ...createPressure().evaluate(sim.snapshot()) }; },
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
if (opts.auto) play(); // straight in: no username step, no network (Part B 4)
requestAnimationFrame(rafFrame);
