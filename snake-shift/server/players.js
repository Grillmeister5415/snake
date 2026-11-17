// Players and their anonymous sessions (LEADERBOARD_PLAN A3, C2).
// A player is an opaque random ID with a handle. The session cookie holds 32 random bytes; the
// database keeps only their SHA-256, so a copy of the database cannot be used to sign in. The
// secret is never logged and never sent back in a body.

import { createHash } from 'node:crypto';
import { normaliseHandle } from '../src/handle.js';

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url
export const PLAYER_ID = /^[A-Za-z0-9_-]{22}$/; // 16 bytes, base64url

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ clock: { now: () => number }, random: { bytes: (n: number) => Buffer },
 *   sessionTtlMs: number, sessionRefreshMs: number }} opts
 */
export function createPlayers(db, { clock, random, sessionTtlMs, sessionRefreshMs }) {
  const q = {
    insert: db.prepare('INSERT INTO players (id, handle, hidden, created_at, updated_at) VALUES (?, ?, 0, ?, ?)'),
    get: db.prepare('SELECT id, handle, hidden, created_at, updated_at FROM players WHERE id = ?'),
    rename: db.prepare('UPDATE players SET handle = ?, updated_at = ? WHERE id = ?'),
    hide: db.prepare('UPDATE players SET hidden = ?, updated_at = ? WHERE id = ?'),
    list: db.prepare(`SELECT p.id, p.handle, p.hidden, p.created_at,
      (SELECT score FROM bests WHERE board = 'all' AND player_id = p.id) AS best,
      (SELECT COUNT(*) FROM runs WHERE player_id = p.id AND status = 'accepted') AS runs
      FROM players p ORDER BY p.created_at`),
    sessionInsert: db.prepare('INSERT INTO sessions (token_hash, player_id, created_at, seen_at, expires_at) VALUES (?, ?, ?, ?, ?)'),
    sessionGet: db.prepare('SELECT token_hash, player_id, seen_at, expires_at FROM sessions WHERE token_hash = ?'),
    sessionTouch: db.prepare('UPDATE sessions SET seen_at = ?, expires_at = ? WHERE token_hash = ?'),
    sessionSweep: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  };

  /** A new player with this (already checked) handle. Returns { id, handle }. */
  function create(handle) {
    const now = clock.now();
    const id = random.bytes(16).toString('base64url');
    const h = normaliseHandle(handle);
    q.insert.run(id, h, now, now);
    return { id, handle: h };
  }

  /** { id, handle, hidden } or null. */
  function get(id) {
    if (typeof id !== 'string' || !PLAYER_ID.test(id)) return null;
    const r = q.get.get(id);
    return r ? { id: r.id, handle: r.handle, hidden: !!r.hidden } : null;
  }

  /** Renames (handle already checked). Returns the player or null when unknown. */
  function rename(id, handle) {
    const h = normaliseHandle(handle);
    const r = q.rename.run(h, clock.now(), id);
    return r.changes ? get(id) : null;
  }

  /** Hides a player from every board (true) or shows them again (false). Returns false when unknown. */
  function setHidden(id, hidden) {
    return q.hide.run(hidden ? 1 : 0, clock.now(), id).changes > 0;
  }

  /** Every player with their all-time best and number of accepted runs (admin). */
  function list() {
    return q.list.all().map((r) => ({
      id: r.id, handle: r.handle, hidden: !!r.hidden, createdAt: r.created_at, best: r.best ?? null, runs: r.runs,
    }));
  }

  /** Starts a session for a player. Returns the secret for the cookie (never store or log it). */
  function startSession(playerId) {
    const now = clock.now();
    const token = random.bytes(32).toString('base64url');
    q.sessionInsert.run(hashToken(token), playerId, now, now, now + sessionTtlMs);
    return token;
  }

  /**
   * The session behind a cookie value: { player, refresh, key } or null. `refresh` is true when the
   * session was extended just now and the cookie should be sent again. `key` identifies the session
   * for rate limits without being the secret.
   */
  function fromToken(token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    const hash = hashToken(token);
    const s = q.sessionGet.get(hash);
    const now = clock.now();
    if (!s || s.expires_at <= now) return null;
    const player = get(s.player_id);
    if (!player) return null;
    let refresh = false;
    if (now - s.seen_at >= sessionRefreshMs) {
      q.sessionTouch.run(now, now + sessionTtlMs, hash);
      refresh = true;
    }
    return { player, refresh, key: hash.slice(0, 32) };
  }

  /** Deletes expired sessions. Returns how many. */
  function sweep(now = clock.now()) {
    return Number(q.sessionSweep.run(now).changes);
  }

  return { create, get, rename, setHidden, list, startSession, fromToken, sweep };
}
