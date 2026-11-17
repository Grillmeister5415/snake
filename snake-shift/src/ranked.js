// One run's way to the board (LEADERBOARD_PLAN A4, A9, A12, C4). Pure apart from what it is given.
//
// begin() latches at run start whether the run is ranked: no practice parameter, the simulation
// plays the canonical rules, a username with a usable server player, and a ticket on hand. The
// ticket's seed then seeds the run; otherwise it is a local run with a random seed and says why.
// Nothing here waits for the network. A run that has moved never becomes ranked later; one that is
// still waiting for its first direction may be started again on a ticket (canUpgrade).
//
// finish() runs inside the simulation's `died` listener (only there: an ordinary lost life never
// gets here). It takes the recorder's snapshot, which is cheap, and hands the run to the outbox in
// a task of its own, so encoding the replay never happens in the animation frame.
//
// Each run has a status ('playing', 'saving', 'waiting', 'saved', 'local') that changes as the
// outbox answers. Listeners get (run, status); a screen shows a status only for the run it shows.

import { createRecorder, replayError } from './replay.js';

/** Why a run is local, in words for the status line. */
export const LOCAL_REASONS = Object.freeze({
  practice: 'PRACTICE SETTINGS',
  rules: 'GAME FILES DIFFER',
  skipped: 'NO USERNAME',
  nouser: 'NO USERNAME',
  blocked: 'USERNAME NOT ACCEPTED',
  offline: 'NOT CONNECTED YET',
  mismatch: 'RELOAD TO RANK',
  zero: 'NO POINTS',
  long: 'TOO LONG TO RANK',
  full: 'SYNC QUEUE FULL',
  session: 'SESSION ENDED',
  rejected: 'NOT ACCEPTED',
  expired: 'TOO LATE TO RANK',
});

/**
 * Why a run starting now cannot be ranked, before a ticket is taken; null when it can be.
 * @param {{ practice: boolean, rulesOk: boolean, identity: { handle: string|null, skipped: boolean,
 *   problem: object|null }, playerId: string|null, mismatch: boolean }} facts
 */
export function localReason({ practice, rulesOk, identity, playerId, mismatch }) {
  if (practice) return 'practice';
  if (!rulesOk) return 'rules';
  if (!identity.handle) return identity.skipped ? 'skipped' : 'nouser';
  if (identity.problem && identity.problem.kind === 'create') return 'blocked';
  if (mismatch) return 'mismatch';
  if (!playerId) return 'offline';
  return null;
}

/**
 * True when a local run may be thrown away for a ranked one: it is local only because no ticket
 * was on hand, and nothing has happened in it yet (still waiting for the first direction, no tick,
 * no turn). The first run after choosing a username is the usual case: its ticket arrives a moment
 * after the ready screen. The player sees at most the first dot change place.
 * @param {{ ranked: boolean, reason: string|null }|null} run
 * @param {{ tick: number, waiting: string|null, turns: readonly string[] }} snap
 * @param {string} mode  main.js's mode; a pause opened from 'ready' counts as 'ready'
 */
export function canUpgrade(run, snap, mode) {
  return !!run && !run.ranked && run.reason === 'offline' && mode === 'ready'
    && snap.tick === 0 && snap.waiting === 'start' && snap.turns.length === 0;
}

/**
 * The status line for a run: { text, detail, wall }. Pure.
 *   saving  "Saving…"         waiting "Waiting to sync"
 *   saved   "Saved" (+ the rank the server confirmed; wall: a confirmed top-ten best)
 *   local   "Local run" (+ why)
 */
export function statusText(status) {
  switch (status && status.state) {
    case 'saving': return { text: 'Saving…', detail: '', wall: false };
    case 'waiting': return { text: 'Waiting to sync', detail: '', wall: false };
    case 'saved': {
      const rank = status.rank;
      return {
        text: 'Saved',
        detail: Number.isInteger(rank) ? `YOUR RANK #${rank} ALL TIME` : '',
        wall: !!status.wall,
      };
    }
    case 'local': return { text: 'Local run', detail: LOCAL_REASONS[status.reason] || '', wall: false };
    default: return { text: '', detail: '', wall: false };
  }
}

/** The status a saved answer gives: the rank only as the server confirmed it. */
export function savedStatus(answer) {
  const rank = answer && answer.rank && Number.isInteger(answer.rank.allTime) ? answer.rank.allTime : null;
  const best = !!(answer && answer.best && answer.best.allTime);
  return { state: 'saved', score: answer ? answer.score : null, rank, wall: best && rank !== null && rank <= 10 };
}

/**
 * @param {{ identity: ReturnType<import('./identity.js').createIdentity>,
 *   tickets: ReturnType<import('./tickets.js').createTickets>,
 *   outbox: ReturnType<import('./outbox.js').createOutbox>,
 *   practice: boolean, rulesOk: () => boolean, defer?: (fn: Function) => void, keep?: number }} deps
 * Returns { begin(randomSeed), attach(run, sim), finish(run, { score }), status(run), on(fn) }.
 */
export function createRanked({
  identity, tickets, outbox, practice, rulesOk,
  defer = (fn) => setTimeout(fn, 0), keep = 30,
}) {
  let counter = 0;
  const byRunId = new Map(); // runId -> run, the last `keep` ranked runs (for outbox answers)
  const listeners = new Set();

  function setStatus(run, status) {
    // 'queued' and 'sending' both read "Saving…": only a real change is passed on.
    const cur = run.status;
    if (cur && cur.state === status.state && status.state !== 'saved' && cur.reason === status.reason) return;
    run.status = Object.freeze(status);
    for (const fn of listeners) {
      try { fn(run, run.status); } catch (err) { console.error(err); }
    }
  }

  outbox.on((ev) => {
    const run = byRunId.get(ev.runId);
    if (!run || run.status.state === 'playing') return;
    if (ev.state === 'queued' || ev.state === 'sending') setStatus(run, { state: 'saving' });
    else if (ev.state === 'waiting') setStatus(run, { state: 'waiting' });
    else if (ev.state === 'saved') setStatus(run, savedStatus(ev.answer));
    else if (ev.state === 'rejected') {
      const late = ev.reason === 'too_old' || ev.reason === 'ticket_expired' || ev.status === 410;
      setStatus(run, { state: 'local', reason: late ? 'expired' : 'rejected' });
    } else if (ev.state === 'local') setStatus(run, { state: 'local', reason: ev.reason === 'session' ? 'session' : 'rejected' });
  });

  /**
   * Latches a new run. `randomSeed()` gives the seed of a local run.
   * Returns the run: { n, ranked, reason, runId, playerId, seed, practice, status }.
   */
  function begin(randomSeed) {
    const n = ++counter;
    const playerId = identity.activePlayerId();
    let reason = localReason({ practice, rulesOk: rulesOk(), identity: identity.get(), playerId, mismatch: tickets.mismatch });
    let ticket = null;
    if (!reason) {
      ticket = tickets.take();
      if (!ticket || ticket.playerId !== playerId) {
        ticket = null;
        reason = tickets.mismatch ? 'mismatch' : 'offline';
      }
    }
    const run = {
      n, ranked: !!ticket, reason, practice,
      runId: ticket ? ticket.runId : null,
      playerId: ticket ? playerId : null,
      seed: ticket ? ticket.seed : randomSeed(),
      recorder: null,
      status: Object.freeze(ticket ? { state: 'playing' } : { state: 'local', reason }),
    };
    if (run.ranked) {
      byRunId.set(run.runId, run);
      while (byRunId.size > keep) byRunId.delete(byRunId.keys().next().value);
    }
    return run;
  }

  /** Starts recording. Call right after sim.reset(run.seed), before the first direction. */
  function attach(run, sim) {
    if (run.ranked) run.recorder = createRecorder(sim);
  }

  /**
   * The run ended (the `died` event). Returns the status to show at once; the hand-over to the
   * outbox follows in its own task.
   */
  function finish(run, { score }) {
    if (!run.ranked || run.status.state !== 'playing') return run.status;
    const replay = run.recorder.snapshot();
    const overflow = run.recorder.overflow;
    run.recorder.dispose();
    if (score <= 0) { setStatus(run, { state: 'local', reason: 'zero' }); return run.status; }
    if (overflow || replay.endTick === null) { setStatus(run, { state: 'local', reason: 'long' }); return run.status; }
    setStatus(run, { state: 'saving' });
    defer(() => {
      if (replayError(replay)) { setStatus(run, { state: 'local', reason: 'long' }); return; }
      const r = outbox.enqueue({ runId: run.runId, playerId: run.playerId, replay, score });
      if (!r.ok) setStatus(run, { state: 'local', reason: r.reason === 'full' ? 'full' : 'rejected' });
    });
    return run.status;
  }

  return {
    begin,
    attach,
    finish,
    status: (run) => (run ? run.status : null),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
