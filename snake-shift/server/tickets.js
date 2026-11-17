// Run tickets (LEADERBOARD_PLAN A11, A12, C2). A ticket is the server's permission for one ranked
// run: a run ID (the idempotency key of the later submission), a seed the browser cannot choose,
// and the ruleset. The browser fetches a few ahead of time so a run never waits for the network.
//
// A ticket can start a run until `expiresAt` (24 hours after issue). The run may then be submitted
// until expiresAt + the run's own moving time + a small margin, which is the offline grace.
// Each player holds at most `cap` unexpired tickets; asking for more retires the oldest ones, so a
// browser that lost its tickets (a reload with storage blocked) is never locked out.

import { tx } from './db.js';

export const RUN_ID = /^[A-Za-z0-9_-]{22}$/; // 16 bytes, base64url

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ clock: { now: () => number }, random: { bytes: (n: number) => Buffer }, ttlMs: number, cap: number }} opts
 */
export function createTickets(db, { clock, random, ttlMs, cap }) {
  const q = {
    insert: db.prepare('INSERT INTO tickets (run_id, player_id, seed, ruleset, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'),
    get: db.prepare('SELECT run_id, player_id, seed, ruleset, issued_at, expires_at FROM tickets WHERE run_id = ?'),
    active: db.prepare('SELECT run_id FROM tickets WHERE player_id = ? AND expires_at > ? ORDER BY issued_at ASC, rowid ASC'),
    remove: db.prepare('DELETE FROM tickets WHERE run_id = ?'),
    sweep: db.prepare('DELETE FROM tickets WHERE expires_at < ?'),
  };

  /** Issues `count` tickets for `ruleset`. Returns [{ runId, seed, expiresAt }] (expiresAt in ms). */
  function issue(playerId, ruleset, count) {
    const now = clock.now();
    return tx(db, () => {
      const active = q.active.all(playerId, now);
      const over = active.length + count - cap;
      for (let i = 0; i < over; i++) q.remove.run(active[i].run_id);
      const out = [];
      for (let i = 0; i < count; i++) {
        const runId = random.bytes(16).toString('base64url');
        const seed = random.bytes(4).readUInt32BE(0);
        q.insert.run(runId, playerId, seed, ruleset, now, now + ttlMs);
        out.push({ runId, seed, expiresAt: now + ttlMs });
      }
      return out;
    });
  }

  /** The ticket row or null: { run_id, player_id, seed, ruleset, issued_at, expires_at }. */
  function get(runId) {
    return RUN_ID.test(runId) ? q.get.get(runId) || null : null;
  }

  /** Deletes tickets whose last submission time (expires_at + graceMs) has passed. */
  function sweep(graceMs, now = clock.now()) {
    return Number(q.sweep.run(now - graceMs).changes);
  }

  return { issue, get, remove: (runId) => q.remove.run(runId), sweep };
}
