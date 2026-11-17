// Player preferences, saved locally: reduced flash, reduced motion, calmer sound, mute, best score.
// Reduced motion follows the system setting until the player sets it.
// Two local bests (LEADERBOARD_PLAN C5): `best` for normal runs (ranked or local), as it always
// was, and `practiceBest` for practice runs (?auto, ?debug, ?seed, speed overrides), so a test
// run can no longer raise the BEST a player sees. Neither is ever uploaded.

import { STORAGE_KEY } from './config.js';

export function createPrefs({ storage, matchMedia } = {}) {
  const store = storage !== undefined ? storage : (() => { try { return globalThis.localStorage; } catch { return null; } })();
  const mm = matchMedia !== undefined ? matchMedia : globalThis.matchMedia;
  let saved = {};
  try { saved = JSON.parse((store && store.getItem(STORAGE_KEY)) || '{}') || {}; } catch { saved = {}; }

  let systemRM = false;
  try { systemRM = !!(mm && mm('(prefers-reduced-motion: reduce)').matches); } catch { systemRM = false; }

  const state = {
    reducedFlash: saved.reducedFlash === true,
    reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : systemRM,
    // Calmer sound: fewer tension effects, the music stays (SOUND_PLAN 2.10). Off by default.
    reducedAudio: saved.reducedAudio === true,
    muted: saved.muted === true,
    dpad: saved.dpad === true, // on-screen direction buttons, off by default
    best: Number.isFinite(saved.best) ? saved.best : 0,
    practiceBest: Number.isFinite(saved.practiceBest) ? saved.practiceBest : 0,
  };
  let frozen = Object.freeze({ ...state });
  const listeners = new Set();

  function persist() {
    try {
      if (store) store.setItem(STORAGE_KEY, JSON.stringify({ ...saved }));
    } catch { /* private mode or blocked storage: keep going in memory */ }
  }

  return {
    get() { return frozen; },
    set(key, value) {
      if (!(key in state) || state[key] === value) return;
      state[key] = value;
      saved[key] = value;
      frozen = Object.freeze({ ...state });
      persist();
      for (const fn of listeners) { try { fn(frozen, key); } catch (e) { console.error(e); } }
    },
    /** Record a score; returns true when it is a new best. Practice runs keep their own best. */
    record(score, { practice = false } = {}) {
      const key = practice ? 'practiceBest' : 'best';
      if (score > state[key]) { this.set(key, score); return true; }
      return false;
    },
    /** The best to show next to a run of this kind. */
    bestFor({ practice = false } = {}) { return practice ? state.practiceBest : state.best; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
