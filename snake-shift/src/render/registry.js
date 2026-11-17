// Loads whatever modules exist, by dynamic import, and falls back to stubs.
// The game runs with only the LCD timeline present. A flat timeline and a room with the
// same id are one universe (LEVELS_PLAN 2.1); director.js buildUniverses() joins them.

import { FLAT_IDS, ROOM_IDS, OLD_ROOMS } from '../config.js';
import { createFallbackBeat } from '../fx.js';

async function tryImport(path) {
  try {
    return await import(path);
  } catch (err) {
    console.info(`[registry] ${path} not loaded:`, err && err.message ? err.message : err);
    return null;
  }
}

function validTimeline(id, mod) {
  return !!(mod && mod.meta && typeof mod.scenery === 'function' && typeof mod.board === 'function');
}

/** Resolves to { [id]: module } for every flat timeline that loaded and looks valid. */
export async function loadTimelines(ids = FLAT_IDS) {
  const mods = await Promise.all(ids.map((id) => tryImport(`./timelines/${id}.js`)));
  const out = {};
  ids.forEach((id, i) => {
    const m = mods[i];
    if (validTimeline(id, m)) {
      out[id] = m;
    } else if (m) {
      console.warn(`[registry] timeline '${id}' is missing meta, scenery() or board(); skipped`);
    }
  });
  return out;
}

/**
 * Resolves to { [id]: module } for every room module that loaded and exports a meta.
 * Room modules import nothing and touch no GL at load, so this works without WebGL:
 * it gives the metas (names, weights, HUD colours) and the life() icons on every device.
 */
export async function loadRoomModules(ids = ROOM_IDS) {
  const mods = await Promise.all(ids.map((id) => tryImport(`./gl/rooms/${id}.js`)));
  const out = {};
  ids.forEach((id, i) => { if (mods[i] && mods[i].meta) out[id] = mods[i]; });
  return out;
}

/** Resolves to the room renderer of plan 15.3, or null. */
export async function loadEngine(canvas, grid) {
  const mod = await tryImport('./gl/engine.js');
  if (!mod || typeof mod.createRoomRenderer !== 'function') return null;
  try {
    const r = await mod.createRoomRenderer(canvas, grid);
    if (!r || typeof r.render !== 'function') return null;
    if (!r.rooms || !Object.keys(r.rooms).length) return null;
    return r;
  } catch (err) {
    console.warn('[registry] room renderer failed to start', err);
    return null;
  }
}

const noop = () => {};
const AUDIO_METHODS = [
  'unlock', 'setMuted', 'setTimeline', 'setChaos', 'eat', 'cut', 'die', 'start', 'stop',
  // LEVELS_PLAN 7.5
  'setScore', 'shift', 'setLook', 'setLives', 'lifeLost', 'lifeGained', 'respawned',
  // SOUND_PLAN 2.3; debug() for the harness and ?debug checks
  'setGameplay', 'bite', 'debug',
];

function stubAudio(beat) {
  const out = { stub: true, beat };
  for (const k of AUDIO_METHODS) out[k] = noop;
  return out;
}

/** Wraps every audio method so a failure there can never stop the game. */
function safeAudio(a, beat) {
  const out = { stub: false, beat: a.beat || beat };
  for (const k of AUDIO_METHODS) {
    const fn = typeof a[k] === 'function' ? a[k].bind(a) : noop;
    out[k] = (...args) => {
      try { return fn(...args); } catch (err) { console.warn(`[audio] ${k} failed`, err); return undefined; }
    };
  }
  return out;
}

/** Resolves to { audio, beat }. beat always has the createBeat() shape. */
export async function loadSound(getPrefs) {
  const [audioMod, beatMod] = await Promise.all([tryImport('../audio.js'), tryImport('../beat.js')]);
  let beat = null;
  if (beatMod && typeof beatMod.createBeat === 'function') {
    try { beat = beatMod.createBeat({ bpm: 112 }); } catch (err) { console.warn('[registry] createBeat failed', err); }
  }
  if (!beat) beat = createFallbackBeat({ bpm: 112 });
  let audio = null;
  if (audioMod && typeof audioMod.createAudio === 'function') {
    try { audio = safeAudio(audioMod.createAudio(getPrefs), beat); } catch (err) { console.warn('[registry] createAudio failed', err); }
  }
  if (!audio) audio = stubAudio(beat);
  const b = audio.beat || beat;
  if (typeof b.setBpm !== 'function') b.setBpm = noop;
  return { audio, beat: b };
}

/**
 * Canvas 2D stand-in for the four built rooms when WebGL is missing or `?nogl` is set (plan 6.5).
 * Resolves to { persp, rooms } or null. Room metas come from the loaded room modules, else from
 * persp.js FALLBACK_ROOMS. First person falls back to the board view (`views: ['board']`).
 * New universes get no stand-in: without WebGL they show only their 2D look (LEVELS_PLAN 4.1).
 */
export async function loadPersp(grid, roomMods = {}) {
  const mod = await tryImport('./persp.js');
  if (!mod || typeof mod.createPerspRenderer !== 'function') return null;
  const fallback = mod.FALLBACK_ROOMS || {};
  const rooms = {};
  for (const id of OLD_ROOMS) {
    const meta = (roomMods[id] && roomMods[id].meta) || fallback[id];
    if (meta) rooms[id] = { ...meta, id, kind: '3d', views: ['board'] };
  }
  try {
    return { persp: mod.createPerspRenderer(grid), rooms };
  } catch (err) {
    console.warn('[registry] perspective fallback failed to start', err);
    return null;
  }
}
