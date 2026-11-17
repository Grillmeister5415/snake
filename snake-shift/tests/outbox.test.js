// The outbox (LEADERBOARD_PLAN A4, A12): order, backoff, permanent and transient failures, 401,
// bounds, late and out-of-order answers, persistence, and no overwrite on instant retries.
// A scripted fake API answers each submission when the test says so; time is fake too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, backoffMs, OUTBOX_KEY } from '../src/outbox.js';
import { ApiError } from '../src/api.js';
import { memoryStorage } from '../src/store.js';
import { deferred, fakeTimers } from './helpers/client-kit.js';

const replay = (n = 1) => ({ v: 1, turns: [0, 0, n, 1], endTick: n + 10 });
const run = (runId, playerId = 'P1', score = 5) => ({ runId, playerId, replay: replay(), score });
const saved = (runId) => ({ runId, status: 'accepted', duplicate: false, score: 5, rank: { allTime: 3, week: 1 }, best: { allTime: true, week: true } });

/** A fake API: each complete() waits for the test to answer it. */
function fakeApi() {
  const calls = [];
  return {
    calls,
    complete(runId, body) {
      const d = deferred();
      calls.push({ runId, body, ...d });
      return d.promise;
    },
    /** The oldest unanswered call for this run. */
    call(runId) { return calls.find((c) => c.runId === runId && !c.done); },
    answer(runId, value) { const c = this.call(runId); c.done = true; c.resolve(value); },
    fail(runId, err) { const c = this.call(runId); c.done = true; c.reject(err); },
  };
}

function setup({ storage = memoryStorage(), limits, onAuthLost } = {}) {
  const timers = fakeTimers();
  const api = fakeApi();
  const events = [];
  const outbox = createOutbox({ api, storage, now: timers.now, timers, random: () => 0.5, limits, onAuthLost });
  outbox.on((e) => events.push(e));
  const states = (runId) => events.filter((e) => e.runId === runId).map((e) => e.state);
  return { timers, api, outbox, events, states, storage };
}

test('backoff: doubles from the base, capped, with jitter, and never shorter than Retry-After', () => {
  const b = { baseMs: 1000, maxMs: 8000 };
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => backoffMs(n, b, () => 0.5)), [1000, 2000, 4000, 8000, 8000, 8000]);
  assert.equal(backoffMs(1, b, () => 0), 750);
  assert.equal(backoffMs(1, b, () => 0.999), 1250);
  assert.equal(backoffMs(1, b, () => 0.5, 30000), 30000);
});

test('runs go one at a time, oldest first, each in its own task (never inside the frame that queued it)', async () => {
  const { timers, api, outbox, states } = setup();
  assert.deepEqual(outbox.enqueue(run('A')), { ok: true });
  assert.deepEqual(outbox.enqueue(run('B')), { ok: true });
  assert.deepEqual(outbox.enqueue(run('C')), { ok: true });
  assert.equal(api.calls.length, 0, 'nothing sent synchronously');
  await timers.advance(0);
  assert.deepEqual(api.calls.map((c) => c.runId), ['A'], 'one request at a time');
  assert.equal(outbox.state('A'), 'sending');
  assert.equal(outbox.state('B'), 'queued');
  api.answer('A', saved('A'));
  await timers.advance(0);
  assert.deepEqual(api.calls.map((c) => c.runId), ['A', 'B']);
  api.answer('B', saved('B'));
  await timers.advance(0);
  api.answer('C', saved('C'));
  await timers.advance(0);
  assert.deepEqual(api.calls.map((c) => c.runId), ['A', 'B', 'C']);
  assert.deepEqual(api.calls[0].body, replay(), 'the replay as recorded');
  for (const id of ['A', 'B', 'C']) {
    assert.deepEqual(states(id), ['queued', 'sending', 'saved']);
    assert.equal(outbox.state(id), null);
  }
  assert.equal(outbox.pending(), 0);
});

test('transient failures wait with backoff (and Retry-After); a reconnect tries at once; order holds', async () => {
  const { timers, api, outbox, states } = setup();
  outbox.enqueue(run('A'));
  outbox.enqueue(run('B'));
  await timers.advance(0);
  api.fail('A', new ApiError('offline', { message: 'network' }));
  await timers.advance(0);
  assert.equal(outbox.state('A'), 'waiting');
  assert.equal(api.calls.length, 1, 'B waits behind A: the server gets runs in play order');
  await timers.advance(1999);
  assert.equal(api.calls.length, 1, 'not before the backoff (2 s at try 1)');
  await timers.advance(1);
  assert.equal(api.calls.length, 2);
  api.fail('A', new ApiError('transient', { status: 503, code: 'busy', retryAfterMs: 30000 }));
  await timers.advance(10000);
  assert.equal(api.calls.length, 2, 'Retry-After 30 s beats the 4 s backoff');
  // Back online: the browser says so, the outbox tries now.
  outbox.kick();
  await timers.advance(0);
  assert.equal(api.calls.length, 3);
  api.answer('A', saved('A'));
  await timers.advance(0);
  api.answer('B', saved('B'));
  await timers.advance(0);
  assert.deepEqual(states('A'), ['queued', 'sending', 'waiting', 'sending', 'waiting', 'sending', 'saved']);
  assert.deepEqual(states('B'), ['queued', 'sending', 'saved']);
});

test('permanent failures are not retried: the run stays local and the next one goes', async () => {
  const { timers, api, outbox, events } = setup();
  outbox.enqueue(run('A'));
  outbox.enqueue(run('B'));
  outbox.enqueue(run('C'));
  await timers.advance(0);
  api.fail('A', new ApiError('permanent', { status: 422, code: 'replay_rejected', body: { reason: 'turn_refused' } }));
  await timers.advance(0);
  api.fail('B', new ApiError('permanent', { status: 410, code: 'ticket_expired' }));
  await timers.advance(0);
  api.answer('C', saved('C'));
  await timers.advance(60 * 60 * 1000);
  assert.deepEqual(api.calls.map((c) => c.runId), ['A', 'B', 'C'], 'each sent once');
  assert.deepEqual(events.filter((e) => e.state === 'rejected').map((e) => [e.runId, e.reason, e.status]),
    [['A', 'turn_refused', 422], ['B', 'ticket_expired', 410]]);
  assert.equal(outbox.pending(), 0);
});

test('401: every waiting run of that player stays local for good; other players\' runs still go', async () => {
  const lost = [];
  const { timers, api, outbox, events } = setup({ onAuthLost: (id) => lost.push(id) });
  outbox.enqueue(run('A1', 'OLD'));
  outbox.enqueue(run('A2', 'OLD'));
  outbox.enqueue(run('B1', 'NEW'));
  await timers.advance(0);
  api.fail('A1', new ApiError('auth', { status: 401, code: 'no_session' }));
  await timers.advance(0);
  assert.deepEqual(lost, ['OLD']);
  assert.deepEqual(events.filter((e) => e.state === 'local').map((e) => [e.runId, e.reason]), [['A1', 'session'], ['A2', 'session']]);
  assert.deepEqual(api.calls.map((c) => c.runId), ['A1', 'B1'], 'A2 is never sent');
  api.answer('B1', saved('B1'));
  await timers.advance(0);
  assert.equal(outbox.pending(), 0);
  // dropPlayer does the same when the identity moved to a new player.
  outbox.enqueue(run('X', 'GONE'));
  outbox.dropPlayer('GONE', 'session');
  assert.equal(outbox.state('X'), null);
});

test('bounded: a full outbox refuses new runs (and says so) instead of dropping old ones', async () => {
  const { outbox } = setup({ limits: { maxItems: 3, maxBytes: 10_000, maxAgeMs: 1e9 } });
  for (const id of ['A', 'B', 'C']) assert.equal(outbox.enqueue(run(id)).ok, true);
  assert.equal(outbox.full, true);
  assert.deepEqual(outbox.enqueue(run('D')), { ok: false, reason: 'full' });
  assert.equal(outbox.pending(), 3);
  const bytes = setup({ limits: { maxItems: 100, maxBytes: 60, maxAgeMs: 1e9 } }).outbox; // one replay is 38 bytes
  assert.equal(bytes.enqueue(run('A')).ok, true);
  assert.deepEqual(bytes.enqueue(run('B')), { ok: false, reason: 'full' }, 'by bytes too');
});

test('instant retries never overwrite a queued run; the same run ID twice is refused', async () => {
  const { timers, api, outbox } = setup();
  assert.equal(outbox.enqueue(run('A', 'P1', 7)).ok, true);
  const other = { ...run('A', 'P1', 99), replay: replay(5) };
  assert.deepEqual(outbox.enqueue(other), { ok: false, reason: 'duplicate' });
  await timers.advance(0);
  assert.deepEqual(api.calls[0].body, replay(), 'the first replay is the one sent');
  api.answer('A', saved('A'));
  await timers.advance(0);
  assert.deepEqual(outbox.enqueue(run('A')), { ok: false, reason: 'duplicate' }, 'not even after it was saved');
});

test('late and out-of-order answers carry their own run ID; a run dropped meanwhile is not resurrected', async () => {
  const { timers, api, outbox, events } = setup();
  outbox.enqueue(run('A'));
  await timers.advance(0);
  // While A is on its way, the player retried twice: B and C are queued behind it.
  outbox.enqueue(run('B'));
  outbox.enqueue(run('C'));
  await timers.advance(5000);
  assert.deepEqual(api.calls.map((c) => c.runId), ['A']);
  api.answer('A', saved('A'));
  await timers.advance(0);
  const savedEvents = events.filter((e) => e.state === 'saved');
  assert.deepEqual(savedEvents.map((e) => e.runId), ['A']);
  assert.equal(savedEvents[0].answer.runId, 'A');
  assert.equal(outbox.state('B'), 'sending');
  assert.equal(outbox.state('C'), 'queued');
  // B's player is dropped while B is on its way; its late failure changes nothing.
  outbox.dropPlayer('P1', 'session');
  api.fail('B', new ApiError('offline'));
  await timers.advance(10 * 60 * 1000);
  assert.equal(outbox.pending(), 0);
  assert.equal(events.filter((e) => e.runId === 'B' && e.state === 'waiting').length, 0);
});

test('persistence: queued runs survive a reload and are sent from the new page; finished ones are gone', async () => {
  const storage = memoryStorage();
  const a = setup({ storage });
  a.outbox.enqueue(run('A'));
  a.outbox.enqueue(run('B'));
  await a.timers.advance(0); // the write happens in its own task
  a.api.answer('A', saved('A'));
  await a.timers.advance(0);
  const stored = JSON.parse(storage.getItem(OUTBOX_KEY));
  assert.equal(stored.v, 1);
  assert.deepEqual(stored.items.map((i) => i.runId), ['B']);
  // Reload while B is on its way (its answer is lost with the page).
  const b = setup({ storage });
  assert.equal(b.outbox.pending(), 1);
  assert.equal(b.outbox.state('B'), 'queued');
  b.outbox.flush();
  await b.timers.advance(0);
  assert.deepEqual(b.api.calls.map((c) => c.runId), ['B'], 'the same run ID again: the server answers idempotently');
  // Old or foreign data never breaks loading.
  const junk = memoryStorage();
  junk.setItem(OUTBOX_KEY, JSON.stringify({ v: 1, items: [{ runId: 3 }, null, { runId: 'Z', playerId: 'P', replay: replay(), queuedAt: -4 * 86400000 }] }));
  assert.equal(setup({ storage: junk }).outbox.pending(), 0, 'malformed and too old items are dropped');
  junk.setItem(OUTBOX_KEY, '{"v":2,"items":[]}');
  assert.equal(setup({ storage: junk }).outbox.pending(), 0);
});

test('blocked storage: the outbox works in memory', async () => {
  const { timers, api, outbox } = setup({ storage: memoryStorage({ fail: true }) });
  assert.equal(outbox.persistent, false);
  outbox.enqueue(run('A'));
  await timers.advance(0);
  api.answer('A', saved('A'));
  await timers.advance(0);
  assert.equal(outbox.pending(), 0);
});

test('another tab\'s queued runs are kept when this tab writes', async () => {
  const storage = memoryStorage();
  const a = setup({ storage });
  const b = setup({ storage });
  a.outbox.enqueue(run('FROM_A'));
  b.outbox.enqueue(run('FROM_B'));
  await a.timers.advance(0);
  await b.timers.advance(0);
  const ids = JSON.parse(storage.getItem(OUTBOX_KEY)).items.map((i) => i.runId).sort();
  assert.deepEqual(ids, ['FROM_A', 'FROM_B']);
});
