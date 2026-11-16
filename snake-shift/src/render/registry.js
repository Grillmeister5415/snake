// Loads whatever modules exist, by dynamic import, and falls back to stubs.
// The game runs with only the LCD timeline present.

import { FLAT_IDS } from '../config.js';
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

function stubAudio(beat) {
  return {
    stub: true,
    unlock: noop, setMuted: noop, setTimeline: noop, setChaos: noop,
    eat: noop, cut: noop, die: noop, start: noop, stop: noop,
    beat,
  };
}

/** Wraps every audio method so a failure there can never stop the game. */
function safeAudio(a, beat) {
  const out = { stub: false, beat: a.beat || beat };
  for (const k of ['unlock', 'setMuted', 'setTimeline', 'setChaos', 'eat', 'cut', 'die', 'start', 'stop']) {
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
    try { beat = beatMod.createBeat({ bpm: 132 }); } catch (err) { console.warn('[registry] createBeat failed', err); }
  }
  if (!beat) beat = createFallbackBeat({ bpm: 132 });
  let audio = null;
  if (audioMod && typeof audioMod.createAudio === 'function') {
    try { audio = safeAudio(audioMod.createAudio(getPrefs), beat); } catch (err) { console.warn('[registry] createAudio failed', err); }
  }
  if (!audio) audio = stubAudio(beat);
  return { audio, beat: audio.beat || beat };
}

const ROOM_IDS = ['court', 'disco', 'plastic', 'bunker'];

/**
 * Canvas 2D stand-in for the rooms when WebGL is missing or `?nogl` is set (plan 6.5).
 * Resolves to { persp, rooms } or null. Room metas come from each room module (they import
 * nothing and touch no GL at load), else from persp.js FALLBACK_ROOMS. First person falls back
 * to the board view, so these rooms only offer `views: ['board']`.
 */
export async function loadPersp(grid) {
  const mod = await tryImport('./persp.js');
  if (!mod || typeof mod.createPerspRenderer !== 'function') return null;
  const fallback = mod.FALLBACK_ROOMS || {};
  const mods = await Promise.all(ROOM_IDS.map((id) => tryImport(`./gl/rooms/${id}.js`)));
  const rooms = {};
  ROOM_IDS.forEach((id, i) => {
    const meta = (mods[i] && mods[i].meta) || fallback[id];
    if (meta) rooms[id] = { ...meta, id, kind: '3d', views: ['board'] };
  });
  try {
    return { persp: mod.createPerspRenderer(grid), rooms };
  } catch (err) {
    console.warn('[registry] perspective fallback failed to start', err);
    return null;
  }
}
