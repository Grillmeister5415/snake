// Who is playing (LEADERBOARD_PLAN A3, C4, C6): the username and the server's player ID, kept on
// this browser. The server knows the player by an HttpOnly session cookie; a handle is only a
// display name, so nothing here ever claims a player by name.
//
// Local first: setHandle() and skip() change the state at once and never wait for the network.
// ensure() reconciles with the server in the background:
//   - a stored player is checked once per page load (GET /api/player); the server's handle wins
//     unless a rename is still waiting, which is then sent (PATCH)
//   - no player yet, or its session is gone (401): POST /api/player creates a new one with the
//     handle. An existing session answers with its own player instead; that player is this
//     browser's, so it is adopted and renamed to the handle
//   - a handle the server refuses (422, e.g. blocked) is remembered as `problem` and not sent again
//     until the handle changes; play goes on as local runs
// Network failures leave everything as it is for the next try.

import { normaliseHandle, validateHandle } from './handle.js';
import { openStore } from './store.js';

export const IDENTITY_KEY = 'snake-shift/identity/v1';

const EMPTY = Object.freeze({ handle: null, serverHandle: null, playerId: null, skipped: false, problem: null });

function clean(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return { ...EMPTY };
  const str = (v) => (typeof v === 'string' && v ? v : null);
  const handle = str(raw.handle);
  return {
    handle: handle && !validateHandle(handle) ? normaliseHandle(handle) : null,
    serverHandle: str(raw.serverHandle),
    playerId: str(raw.playerId),
    skipped: raw.skipped === true,
    problem: raw.problem && typeof raw.problem.reason === 'string'
      ? { reason: raw.problem.reason, kind: raw.problem.kind === 'rename' ? 'rename' : 'create' } : null,
  };
}

/**
 * @param {{ api: ReturnType<import('./api.js').createApi>, storage?: Storage|null }} deps
 * Returns the identity:
 *   get()            frozen { handle, playerId, skipped, problem, confirmed, persistent }
 *   needsUsername()  true when the first PLAY should open the USERNAME panel
 *   setHandle(raw)   { ok: true, handle } or { ok: false, reason } (local check only)
 *   skip()           no username: local, unranked runs; the player is not asked again
 *   ensure()         background reconciliation; resolves the confirmed player or null, never throws
 *   sessionLost(id)  a request for this player answered 401: the next ensure() starts a new player
 *   on(fn)           fn({ previous, playerId }) after every change
 */
export function createIdentity({ api, storage } = {}) {
  const store = openStore(IDENTITY_KEY, { storage });
  let s = clean(store.read());
  let confirmed = false; // the server confirmed this player's session during this page load
  let lost = false;      // the session of s.playerId is gone
  let inflight = null;
  let version = 0;       // bumped by every local change, so a late answer cannot undo a newer choice
  const listeners = new Set();

  function save(previous = s.playerId) {
    store.write({ v: 1, ...s });
    const snap = get();
    for (const fn of listeners) {
      try { fn({ previous, playerId: s.playerId, identity: snap }); } catch (err) { console.error(err); }
    }
  }

  function get() {
    return Object.freeze({
      handle: s.handle, playerId: s.playerId, skipped: s.skipped, problem: s.problem,
      confirmed: confirmed && !lost && !!s.playerId, persistent: store.persistent,
    });
  }

  function setHandle(raw) {
    const reason = validateHandle(raw);
    if (reason) return { ok: false, reason };
    s.handle = normaliseHandle(raw);
    s.skipped = false;
    s.problem = null;
    version++;
    save();
    return { ok: true, handle: s.handle };
  }

  function skip() {
    if (s.skipped) return;
    s.skipped = true;
    version++;
    save();
  }

  function sessionLost(playerId) {
    if (!playerId || playerId !== s.playerId || lost) return;
    lost = true;
    confirmed = false;
    save(); // listeners see the player as unusable now (no more tickets for it)
  }

  /** The server refused this handle: remember why, and fall back to the name it still has. */
  function refused(err, kind) {
    s.problem = { reason: (err.body && err.body.reason) || err.code || 'invalid', kind };
    if (kind === 'rename' && s.serverHandle) s.handle = s.serverHandle;
    save();
  }

  const isHandleError = (err) => err && err.kind === 'permanent' && err.code === 'handle_invalid';

  async function reconcile() {
    const started = version;
    const stale = () => version !== started;
    if (!s.handle) return null;

    if (s.playerId && !lost && !confirmed) {
      try {
        const p = await api.getPlayer();
        if (stale()) return null;
        const previous = s.playerId;
        const waiting = s.handle !== s.serverHandle; // a rename not yet sent
        s.playerId = p.id;
        s.serverHandle = p.handle;
        if (!waiting) s.handle = p.handle; // e.g. renamed by the admin script
        confirmed = true;
        save(previous);
      } catch (err) {
        if (err.kind !== 'auth') return null;
        lost = true;
      }
    }

    if (s.playerId && !lost && confirmed) {
      if (s.handle !== s.serverHandle && !(s.problem && s.problem.kind === 'rename')) {
        try {
          const p = await api.renamePlayer(s.handle);
          if (stale()) return null;
          s.serverHandle = p.handle;
          s.handle = p.handle;
          save();
        } catch (err) {
          if (stale()) return null;
          if (isHandleError(err)) refused(err, 'rename');
          else if (err.kind === 'auth') lost = true;
          if (!lost) return { id: s.playerId, handle: s.serverHandle };
        }
      }
      if (!lost) return { id: s.playerId, handle: s.serverHandle };
    }

    // No player, or its session is gone: a new player with this handle (never one found by name).
    if (s.problem && s.problem.kind === 'create') return null;
    try {
      const p = await api.createPlayer(s.handle);
      if (stale()) return null;
      const previous = s.playerId;
      s.playerId = p.id;
      s.serverHandle = p.handle;
      confirmed = true;
      lost = false;
      if (p.created) s.handle = p.handle;
      save(previous);
      if (!p.created && s.handle !== p.handle) {
        // The session belonged to a player this browser made before (its answer got lost, or
        // storage was cleared): keep that player and give it the name chosen now.
        try {
          const r = await api.renamePlayer(s.handle);
          if (!stale()) { s.serverHandle = r.handle; s.handle = r.handle; save(); }
        } catch (err) {
          if (!stale() && isHandleError(err)) refused(err, 'rename');
        }
      }
      return { id: s.playerId, handle: s.serverHandle };
    } catch (err) {
      if (!stale() && isHandleError(err)) refused(err, 'create');
      return null;
    }
  }

  let inflightVersion = -1;
  function ensure() {
    // A change made while a reconciliation runs makes that one stale: run again after it.
    if (inflight && inflightVersion !== version) return inflight.then(() => ensure());
    if (!inflight) {
      inflightVersion = version;
      inflight = reconcile()
        .catch((err) => { console.warn('[identity]', err); return null; })
        .finally(() => { inflight = null; });
    }
    return inflight;
  }

  return {
    get,
    /** The player ID runs may be ranked for: null without one, or once its session is known gone. */
    activePlayerId: () => (lost ? null : s.playerId),
    needsUsername: () => !s.handle && !s.skipped,
    setHandle,
    skip,
    ensure,
    sessionLost,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
