// The boards (LEADERBOARD_PLAN A6): one best run per player per board, ordered by score (high
// first), then by the first receipt time of that score (earlier first), then by player ID. Ranks
// count 1, 2, 3... without gaps. A repeated equal score never replaces the earlier one, so it
// never improves a tie. Hidden players are left out of every list and every rank.
//
// Boards: 'all' (all time) and one per UTC week, keyed by the Monday 00:00 UTC that starts it.
// A run belongs to the week of its first receipt by the server; the browser's clock is never used.
//
// A score of 0 never enters a board: nothing was achieved, and a wall of zeros would only push
// real runs around. Such a run is stored (it spent its ticket) but has no rank and is no best.

const DAY = 86400000;
export const ALL_TIME = 'all';

/** Monday 00:00 UTC of the week that contains `ms`. */
export function weekStart(ms) {
  const d = new Date(ms);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - sinceMonday * DAY;
}

/** The board key of the week that contains `ms`, e.g. 'w:2026-11-16'. */
export function weekKey(ms) {
  return `w:${new Date(weekStart(ms)).toISOString().slice(0, 10)}`;
}

/** { from, to } of the week that contains `ms`, as ISO strings (to = the next Monday 00:00 UTC). */
export function weekBounds(ms) {
  const from = weekStart(ms);
  return { from: new Date(from).toISOString(), to: new Date(from + 7 * DAY).toISOString() };
}

// "Ahead of (score, at, id)" in board order.
const AHEAD = '(b.score > ? OR (b.score = ? AND (b.at < ? OR (b.at = ? AND b.player_id < ?))))';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ top?: number }} [opts]
 */
export function createLeaderboard(db, { top = 10 } = {}) {
  const getBest = db.prepare('SELECT score FROM bests WHERE board = ? AND player_id = ?');
  const upsert = db.prepare(`INSERT INTO bests (board, player_id, score, at, run_id) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (board, player_id) DO UPDATE SET score = excluded.score, at = excluded.at, run_id = excluded.run_id`);
  // Every read also skips score 0, so a zero stored before that rule existed stays off the boards.
  const topQ = db.prepare(`SELECT b.player_id AS pid, p.handle, b.score FROM bests b JOIN players p ON p.id = b.player_id
    WHERE b.board = ? AND p.hidden = 0 AND b.score > 0 ORDER BY b.score DESC, b.at ASC, b.player_id ASC LIMIT ?`);
  const ownQ = db.prepare(`SELECT b.score, b.at, b.run_id, p.handle, p.hidden FROM bests b JOIN players p ON p.id = b.player_id
    WHERE b.board = ? AND b.player_id = ?`);
  const aheadQ = db.prepare(`SELECT COUNT(*) AS n FROM bests b JOIN players p ON p.id = b.player_id
    WHERE b.board = ? AND p.hidden = 0 AND b.score > 0 AND ${AHEAD}`);
  const aboveQ = db.prepare(`SELECT p.handle, b.score FROM bests b JOIN players p ON p.id = b.player_id
    WHERE b.board = ? AND p.hidden = 0 AND b.score > 0 AND ${AHEAD} ORDER BY b.score ASC, b.at DESC, b.player_id DESC LIMIT 1`);

  /**
   * Enters an accepted run on the all-time board and on its week's board. Call inside the
   * transaction that stores the run. Returns { allTime, week }: true where it became the best.
   * A score of 0 is never entered (and so never a best).
   */
  function record(playerId, score, at, runId) {
    const out = {};
    for (const [name, board] of [['allTime', ALL_TIME], ['week', weekKey(at)]]) {
      const cur = getBest.get(board, playerId);
      out[name] = score > 0 && (!cur || score > cur.score);
      if (out[name]) upsert.run(board, playerId, score, at, runId);
    }
    return out;
  }

  /** The player's entry on a board: { rank, handle, score, runId }, or null (none, hidden, or 0). */
  function entryOf(board, playerId) {
    if (!playerId) return null;
    const own = ownQ.get(board, playerId);
    if (!own || own.hidden || !(own.score > 0)) return null;
    const ahead = aheadQ.get(board, own.score, own.score, own.at, own.at, playerId).n;
    return { rank: ahead + 1, handle: own.handle, score: own.score, runId: own.run_id };
  }

  /**
   * One board as the API answers it (call inside a read transaction):
   *   entries: [{ rank, handle, score, you }] the top `top`
   *   you:     { rank, handle, score } or null when the player has no entry here
   *   rival:   { rank, handle, score, need } or null
   * The rival is the entry right above the player, and `need` the points to pass it (a tie needs
   * one more, because the earlier score wins). First place has no rival. A player without an entry
   * gets the last place of a full top list as the rival, with `need` counted from zero; with room
   * left in the list there is no rival, since any finished run gets in.
   */
  function board(boardKey, playerId) {
    const rows = topQ.all(boardKey, top);
    const entries = rows.map((r, i) => ({ rank: i + 1, handle: r.handle, score: r.score, you: !!playerId && r.pid === playerId }));
    const own = entryOf(boardKey, playerId);
    let rival = null;
    if (own && own.rank > 1) {
      const ownRow = ownQ.get(boardKey, playerId);
      const above = aboveQ.get(boardKey, own.score, own.score, ownRow.at, ownRow.at, playerId);
      if (above) rival = { rank: own.rank - 1, handle: above.handle, score: above.score, need: above.score - own.score + 1 };
    } else if (!own && entries.length >= top) {
      const last = entries[entries.length - 1];
      rival = { rank: last.rank, handle: last.handle, score: last.score, need: last.score + 1 };
    }
    const you = own ? { rank: own.rank, handle: own.handle, score: own.score } : null;
    return { entries, you, rival };
  }

  return { record, entryOf, board };
}
