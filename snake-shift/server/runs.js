// Stored runs (LEADERBOARD_PLAN A10, C2). A submitted ticket becomes a row here, accepted with the
// server's own score or rejected with a reason, in the same transaction that deletes the ticket
// and updates the boards. The row keeps the replay's hash for idempotent retries; the replay itself
// is kept only while it can matter (see sweep).

import { tx } from './db.js';
import { ALL_TIME, weekKey } from './leaderboard.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ clock: { now: () => number }, leaderboard: ReturnType<import('./leaderboard.js').createLeaderboard>,
 *   tickets: ReturnType<import('./tickets.js').createTickets> }} deps
 */
export function createRuns(db, { clock, leaderboard, tickets }) {
  const q = {
    get: db.prepare(`SELECT run_id, player_id, ruleset, seed, issued_at, received_at, status, reject_reason,
      score, end_tick, reason, universe, lives, active_ms, replay_hash FROM runs WHERE run_id = ?`),
    insert: db.prepare(`INSERT INTO runs (run_id, player_id, ruleset, seed, issued_at, received_at, status, reject_reason,
      score, end_tick, reason, universe, lives, active_ms, replay_hash, replay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    isBest: db.prepare('SELECT 1 AS yes FROM bests WHERE board = ? AND player_id = ? AND run_id = ?'),
    dropReplays: db.prepare(`UPDATE runs SET replay = NULL WHERE replay IS NOT NULL AND received_at < ?
      AND run_id NOT IN (SELECT run_id FROM bests WHERE board IN (?, ?))`),
    dropRejected: db.prepare("DELETE FROM runs WHERE status = 'rejected' AND received_at < ?"),
  };

  /** The stored run or null. */
  function get(runId) {
    return q.get.get(runId) || null;
  }

  /** Stores an accepted run. Returns { allTime, week }: where it became the player's best. */
  function accept({ ticket, result, replayText, replayHash, receivedAt }) {
    return tx(db, () => {
      q.insert.run(
        ticket.run_id, ticket.player_id, ticket.ruleset, ticket.seed, ticket.issued_at, receivedAt, 'accepted', null,
        result.score, result.tick, result.reason, result.universe, result.lives, Math.round(result.activeMs),
        replayHash, replayText,
      );
      tickets.remove(ticket.run_id);
      return leaderboard.record(ticket.player_id, result.score, receivedAt, ticket.run_id);
    });
  }

  /** Stores a rejected run (no replay kept). The ticket is spent either way. */
  function reject({ ticket, reason, replayHash, receivedAt }) {
    tx(db, () => {
      q.insert.run(
        ticket.run_id, ticket.player_id, ticket.ruleset, ticket.seed, ticket.issued_at, receivedAt, 'rejected', reason,
        null, null, null, null, null, null, replayHash, null,
      );
      tickets.remove(ticket.run_id);
    });
  }

  /** True when this run is the player's current entry on the board. */
  function isBest(board, playerId, runId) {
    return !!q.isBest.get(board, playerId, runId);
  }

  /**
   * Retention: replays older than `keepMs` are dropped unless the run is a player's current best of
   * all time or of this week; rejected runs older than `keepMs` are deleted. Scores stay.
   */
  function sweep(keepMs, now = clock.now()) {
    const before = now - keepMs;
    const replays = Number(q.dropReplays.run(before, ALL_TIME, weekKey(now)).changes);
    const rejected = Number(q.dropRejected.run(before).changes);
    return { replays, rejected };
  }

  return { get, accept, reject, isBest, sweep };
}
