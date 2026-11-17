// Finished ranked runs on their way to the server (LEADERBOARD_PLAN A4, A12, C4). Independent of
// the game screens: the game hands a run over and goes on; answers come back as events tagged
// with the run ID, and whoever shows a run decides whether an event is still theirs.
//
// - The run ID is the idempotency key. A run already queued is never replaced (an instant retry
//   produces a new run with its own ID; it never overwrites the old one).
// - One request at a time, oldest first, so the server receives runs in the order they were played.
// - Transient failures (offline, timeout, 429, 5xx) wait with exponential backoff and jitter, at
//   least as long as Retry-After asks. A reconnect (kick) tries again at once.
// - Permanent failures (422 replay_rejected, 410 expired, 409, 403, ...) are not retried: the run
//   stays local. A 401 means the session is gone: every run of that player stays local for good.
// - Bounded by count and bytes; a full outbox refuses new runs ('full') instead of dropping old ones.
// - Kept in storage when it works (versioned key), in memory otherwise. Writing it is deferred to
//   its own task, never done inside the animation frame that ended the run.

import { isRetryable } from './api.js';
import { encodeReplay } from './replay.js';
import { openStore } from './store.js';

export const OUTBOX_KEY = 'snake-shift/outbox/v1';
const DAY = 86400000;
export const OUTBOX_LIMITS = Object.freeze({ maxItems: 20, maxBytes: 2 * 1024 * 1024, maxAgeMs: 3 * DAY });
export const BACKOFF = Object.freeze({ baseMs: 2000, maxMs: 5 * 60 * 1000 });

/** Wait before try number `tries` (1, 2, ...): base * 2^(tries-1), capped, with +-25% jitter. */
export function backoffMs(tries, { baseMs, maxMs } = BACKOFF, random = Math.random, retryAfterMs = null) {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, tries - 1));
  const wait = Math.round(exp * (0.75 + random() * 0.5));
  return Math.max(wait, retryAfterMs || 0);
}

/**
 * @param {{ api: ReturnType<import('./api.js').createApi>, storage?: Storage|null, now?: () => number,
 *   timers?: { setTimeout: Function, clearTimeout: Function }, random?: () => number,
 *   limits?: typeof OUTBOX_LIMITS, backoff?: typeof BACKOFF, onAuthLost?: (playerId: string) => void }} deps
 * Returns:
 *   enqueue({ runId, playerId, replay, score })  { ok: true } | { ok: false, reason: 'duplicate'|'full' }
 *   flush()      sends what is due; resolves when idle (never throws)
 *   kick()       a reconnect: everything is due now, then flush()
 *   state(runId) 'queued' | 'sending' | 'waiting' | null (not in the outbox)
 *   pending(playerId?)  runs waiting (for that player)
 *   dropPlayer(playerId, reason)  that player's runs stay local
 *   on(fn)       fn({ runId, state, ...}) with state 'queued' | 'sending' | 'saved' (answer) |
 *                'waiting' (error) | 'rejected' (reason) | 'local' (reason)
 *   full, persistent
 */
export function createOutbox({
  api, storage, now = () => Date.now(),
  timers = { setTimeout: (...a) => setTimeout(...a), clearTimeout: (t) => clearTimeout(t) },
  random = Math.random, limits = OUTBOX_LIMITS, backoff = BACKOFF, onAuthLost = () => {},
}) {
  const store = openStore(OUTBOX_KEY, { storage });
  const listeners = new Set();
  const removed = new Set(); // handled here: a merge with storage must not bring them back
  const states = new Map();  // runId -> 'queued' | 'sending' | 'waiting'
  let items = load();
  let flushing = null;
  let timer = null, timerAt = Infinity;
  let persistTimer = null;
  let attempts = 0;

  function valid(it) {
    return it && typeof it.runId === 'string' && typeof it.playerId === 'string' && it.replay && typeof it.replay === 'object'
      && Number.isFinite(it.queuedAt);
  }

  function load() {
    const raw = store.read();
    if (!raw || raw.v !== 1 || !Array.isArray(raw.items)) return [];
    const t = now();
    const out = [];
    for (const it of raw.items) {
      if (!valid(it) || t - it.queuedAt > limits.maxAgeMs) continue;
      if (out.some((o) => o.runId === it.runId)) continue;
      out.push({ runId: it.runId, playerId: it.playerId, replay: it.replay, score: it.score | 0, queuedAt: it.queuedAt,
        bytes: it.bytes | 0, tries: it.tries | 0, nextAt: 0, attempt: 0 });
    }
    for (const it of out) states.set(it.runId, 'queued');
    return out;
  }

  function emit(ev) {
    for (const fn of listeners) {
      try { fn(ev); } catch (err) { console.error(err); }
    }
  }

  const totalBytes = () => items.reduce((n, it) => n + it.bytes, 0);

  function persistNow() {
    persistTimer = null;
    // Keep runs another tab queued meanwhile; never bring back one this tab has finished.
    const stored = store.read();
    const mine = new Set(items.map((it) => it.runId));
    const foreign = stored && stored.v === 1 && Array.isArray(stored.items)
      ? stored.items.filter((it) => valid(it) && !mine.has(it.runId) && !removed.has(it.runId)) : [];
    const strip = ({ runId, playerId, replay, score, queuedAt, bytes, tries }) => ({ runId, playerId, replay, score, queuedAt, bytes, tries });
    store.write({ v: 1, items: [...foreign, ...items.map(strip)] });
  }

  function persist() {
    if (persistTimer === null) persistTimer = timers.setTimeout(persistNow, 0);
  }

  function arm(at) {
    if (timer !== null && timerAt <= at) return;
    if (timer !== null) timers.clearTimeout(timer);
    timerAt = at;
    timer = timers.setTimeout(() => { timer = null; timerAt = Infinity; flush(); }, Math.max(0, at - now()));
  }

  function remove(item) {
    items = items.filter((it) => it !== item);
    removed.add(item.runId);
    states.delete(item.runId);
    persist();
  }

  function enqueue({ runId, playerId, replay, score }) {
    if (states.has(runId) || removed.has(runId)) return { ok: false, reason: 'duplicate' };
    const bytes = encodeReplay(replay).length;
    if (items.length >= limits.maxItems || totalBytes() + bytes > limits.maxBytes) return { ok: false, reason: 'full' };
    const item = { runId, playerId, replay, score: score | 0, queuedAt: now(), bytes, tries: 0, nextAt: 0, attempt: 0 };
    items.push(item);
    states.set(runId, 'queued');
    persist();
    emit({ runId, state: 'queued' });
    arm(now()); // its own task: never inside the frame that ended the run
    return { ok: true };
  }

  async function send(item) {
    const attempt = ++attempts;
    item.attempt = attempt;
    states.set(item.runId, 'sending');
    emit({ runId: item.runId, state: 'sending' });
    try {
      const answer = await api.complete(item.runId, item.replay);
      const current = items.includes(item) && item.attempt === attempt;
      if (current) remove(item);
      // Saved on the server either way; whoever shows this run decides what to do with it.
      emit({ runId: item.runId, state: 'saved', answer });
    } catch (err) {
      if (!items.includes(item) || item.attempt !== attempt) return; // dropped meanwhile: nothing to do
      if (isRetryable(err)) {
        item.tries += 1;
        item.nextAt = now() + backoffMs(item.tries, backoff, random, err.retryAfterMs);
        states.set(item.runId, 'waiting');
        persist();
        emit({ runId: item.runId, state: 'waiting', error: err.kind });
      } else if (err.kind === 'auth') {
        dropPlayer(item.playerId, 'session');
        onAuthLost(item.playerId);
      } else {
        remove(item);
        emit({ runId: item.runId, state: 'rejected', reason: (err.body && err.body.reason) || err.code || 'rejected', status: err.status });
      }
    }
  }

  async function drain() {
    for (;;) {
      const item = items[0];
      if (!item) return;
      if (now() - item.queuedAt > limits.maxAgeMs) {
        remove(item);
        emit({ runId: item.runId, state: 'rejected', reason: 'too_old' });
        continue;
      }
      if (item.nextAt > now()) { arm(item.nextAt); return; }
      await send(item);
    }
  }

  function flush() {
    if (!flushing) {
      flushing = drain().catch((err) => console.warn('[outbox]', err)).finally(() => { flushing = null; });
    }
    return flushing;
  }

  function dropPlayer(playerId, reason = 'session') {
    const gone = items.filter((it) => it.playerId === playerId);
    if (!gone.length) return;
    for (const it of gone) remove(it);
    for (const it of gone) emit({ runId: it.runId, state: 'local', reason });
  }

  return {
    enqueue,
    flush,
    kick() {
      for (const it of items) it.nextAt = 0;
      return flush();
    },
    state: (runId) => states.get(runId) || null,
    pending: (playerId = null) => items.filter((it) => playerId === null || it.playerId === playerId).length,
    dropPlayer,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get full() { return items.length >= limits.maxItems || totalBytes() >= limits.maxBytes; },
    get persistent() { return store.persistent; },
  };
}
