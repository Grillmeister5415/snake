// Run tickets on hand (LEADERBOARD_PLAN A12, C4). A ticket is the server's permission for one
// ranked run: a run ID and a seed. A few are fetched ahead, while a menu is open, so starting a
// run never waits: take() is synchronous and returns a ticket or null at once.
//
// Tickets are kept in storage (when it works) so a reload does not throw them away; take() reads
// storage each time, so two tabs never start runs on the same ticket. Each ticket belongs to the
// player it was fetched for. Expiry is judged on the server's clock: the offset between the
// server's `now` and the local clock is taken from the answer that brought the tickets.
//
// The server keeps at most 30 live tickets per player and retires the oldest beyond that, which
// could retire the ticket of a run still waiting in the outbox. So only a small batch is kept, and
// the caller's mayRefill() says no while finished runs are still waiting to be sent.

import { openStore } from './store.js';

export const TICKETS_KEY = 'snake-shift/tickets/v1';

/**
 * @param {{ api: ReturnType<import('./api.js').createApi>, ruleset: string, playerId: () => string|null,
 *   storage?: Storage|null, now?: () => number, target?: number, low?: number, minLeftMs?: number,
 *   mayRefill?: () => boolean, onAuthLost?: (playerId: string) => void }} deps
 *   target: tickets kept on hand; low: refill at or below this many
 *   minLeftMs: a ticket closer to its expiry than this is not used to start a run
 * Returns { take(), count(), refill(), clear(), get mismatch() }.
 */
export function createTickets({
  api, ruleset, playerId, storage, now = () => Date.now(), target = 3, low = 1,
  minLeftMs = 60 * 60 * 1000, mayRefill = () => true, onAuthLost = () => {},
}) {
  const store = openStore(TICKETS_KEY, { storage });
  let mismatch = false; // the server ranks other rules than this page: no tickets until a reload
  let inflight = null;

  function read() {
    const raw = store.read();
    if (!raw || raw.v !== 1 || !Array.isArray(raw.tickets)) return { v: 1, playerId: null, offset: 0, tickets: [] };
    const tickets = raw.tickets.filter((t) => t && typeof t.runId === 'string' && Number.isInteger(t.seed) && t.seed >= 0
      && Number.isFinite(t.expiresAt));
    return { v: 1, playerId: typeof raw.playerId === 'string' ? raw.playerId : null, offset: Number(raw.offset) || 0, tickets };
  }

  /** The stored tickets of `pid` that may still start a run, oldest first. */
  function usable(st, pid) {
    if (!pid || st.playerId !== pid) return [];
    const serverNow = now() + st.offset;
    return st.tickets.filter((t) => t.expiresAt - serverNow >= minLeftMs);
  }

  /** A ticket for the current player, removed from the stock; or null. Never waits. */
  function take() {
    const pid = playerId();
    if (!pid || mismatch) return null;
    const st = read();
    const ok = usable(st, pid);
    if (!ok.length) {
      if (st.tickets.length) store.write({ ...st, tickets: [] }); // only stale ones were left
      return null;
    }
    const [t, ...rest] = ok;
    store.write({ ...st, tickets: rest });
    return { runId: t.runId, seed: t.seed, expiresAt: t.expiresAt, playerId: pid };
  }

  function count() {
    return usable(read(), playerId()).length;
  }

  async function fill() {
    const pid = playerId();
    if (!pid || mismatch || !mayRefill()) return;
    const have = count();
    if (have > low) return;
    try {
      const r = await api.tickets(ruleset, Math.max(1, target - have));
      if (playerId() !== pid) return; // the player changed meanwhile: whose tickets these are is unclear
      const offset = Date.parse(r.now) - now();
      const fresh = (r.tickets || []).map((t) => ({ runId: t.runId, seed: t.seed, expiresAt: Date.parse(t.expiresAt) }));
      const st = read();
      const kept = st.playerId === pid ? st.tickets : [];
      store.write({ v: 1, playerId: pid, offset: Number.isFinite(offset) ? offset : 0, tickets: [...kept, ...fresh] });
    } catch (err) {
      if (err && err.code === 'ruleset_mismatch') mismatch = true;
      else if (err && err.kind === 'auth') onAuthLost(pid);
    }
  }

  /** Tops the stock up in the background. Resolves when done; never throws. */
  function refill() {
    if (!inflight) inflight = fill().catch(() => {}).finally(() => { inflight = null; });
    return inflight;
  }

  return {
    take,
    count,
    refill,
    /** Forgets every ticket (the player changed). */
    clear() { store.write({ v: 1, playerId: null, offset: 0, tickets: [] }); },
    get mismatch() { return mismatch; },
  };
}
