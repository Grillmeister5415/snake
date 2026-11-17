// Tickets on hand (LEADERBOARD_PLAN A12): prefetch in the background, take() never waits and gives
// null at once when there is none, expiry on the server's clock, never hoarded, one owner each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTickets, TICKETS_KEY } from '../src/tickets.js';
import { ApiError } from '../src/api.js';
import { memoryStorage } from '../src/store.js';
import { startApi, newPlayer } from '../server/tests/helpers.js';
import { createApi } from '../src/api.js';
import { browserFetch, deferred } from './helpers/client-kit.js';

const HOUR = 3600000;
const SERVER_NOW = Date.parse('2026-11-18T12:00:00.000Z');

/** A fake API that answers ticket requests with `count` fresh tickets (or fails). */
function fakeApi({ skewMs = 0, ttlMs = 24 * HOUR } = {}) {
  let n = 0;
  const api = {
    requests: [],
    error: null,
    gate: null,
    async tickets(ruleset, count) {
      api.requests.push({ ruleset, count });
      if (api.gate) await api.gate.promise;
      if (api.error) throw api.error;
      const now = SERVER_NOW + skewMs;
      const tickets = [];
      for (let i = 0; i < count; i++) tickets.push({ runId: `run-${++n}`, seed: 1000 + n, expiresAt: new Date(now + ttlMs).toISOString() });
      return { ruleset, now: new Date(now).toISOString(), tickets };
    },
  };
  return api;
}

function setup({ api = fakeApi(), storage = memoryStorage(), player = 'P1', localNow = SERVER_NOW, mayRefill = () => true, onAuthLost } = {}) {
  const clock = { t: localNow };
  const state = { player };
  const t = createTickets({
    api, storage, ruleset: '1', playerId: () => state.player, now: () => clock.t, mayRefill, onAuthLost,
  });
  return { t, api, clock, state, storage };
}

test('prefetch: a small batch, refilled only when low; take() is synchronous', async () => {
  const { t, api } = setup();
  assert.equal(t.take(), null, 'nothing yet: null at once, no waiting');
  await t.refill();
  assert.deepEqual(api.requests, [{ ruleset: '1', count: 3 }]);
  assert.equal(t.count(), 3);
  await t.refill();
  assert.equal(api.requests.length, 1, 'three on hand: no request');
  const first = t.take();
  assert.ok(!(first instanceof Promise));
  assert.deepEqual(first, { runId: 'run-1', seed: 1001, expiresAt: SERVER_NOW + 24 * HOUR, playerId: 'P1' });
  assert.equal(typeof first.seed, 'number', 'the seed goes to sim.reset as a number');
  await t.refill();
  assert.equal(api.requests.length, 1, 'two on hand: still enough');
  t.take();
  await t.refill();
  assert.deepEqual(api.requests.at(-1), { ruleset: '1', count: 2 }, 'topped up to three');
  assert.equal(t.count(), 3);
});

test('exhaustion: every take() after the last ticket gives null at once', async () => {
  const { t } = setup();
  await t.refill();
  assert.ok(t.take() && t.take() && t.take());
  for (let i = 0; i < 3; i++) assert.equal(t.take(), null);
});

test('expiry is judged on the server clock, with the offset from the answer; tickets near expiry are not used', async () => {
  // The local clock runs two hours behind the server's.
  const { t, clock } = setup({ api: fakeApi({ ttlMs: 3 * HOUR }), localNow: SERVER_NOW - 2 * HOUR });
  await t.refill();
  assert.equal(t.count(), 3);
  clock.t += 1 * HOUR; // server time: 1 h after issue, 2 h left
  assert.equal(t.count(), 3);
  clock.t += 1 * HOUR + 1; // server time: just under 1 h left: too close to start a run
  assert.equal(t.count(), 0);
  assert.equal(t.take(), null);
});

test('one owner: another player\'s tickets are never handed out; a late answer for an old player is dropped', async () => {
  const api = fakeApi();
  const { t, state } = setup({ api });
  await t.refill();
  state.player = 'P2';
  assert.equal(t.take(), null);
  assert.equal(t.count(), 0);
  api.gate = deferred();
  const pending = t.refill();
  state.player = 'P3'; // the identity changed while the request was out
  api.gate.resolve();
  await pending;
  assert.equal(t.count(), 0);
  state.player = 'P2';
  assert.equal(t.count(), 0, 'those tickets were not kept for anyone');
});

test('never hoard: no refill while runs wait in the outbox; a ruleset mismatch stops asking', async () => {
  let waiting = 2;
  const { t, api } = setup({ mayRefill: () => waiting === 0 });
  await t.refill();
  assert.equal(api.requests.length, 0);
  waiting = 0;
  await t.refill();
  assert.equal(api.requests.length, 1);
  const m = setup();
  m.api.error = new ApiError('permanent', { status: 409, code: 'ruleset_mismatch' });
  await m.t.refill();
  assert.equal(m.t.mismatch, true);
  m.api.error = null;
  await m.t.refill();
  assert.equal(m.api.requests.length, 1, 'no more requests from this page');
  assert.equal(m.t.take(), null);
});

test('401 on a ticket request tells the identity; offline leaves the stock as it is', async () => {
  const lost = [];
  const { t, api } = setup({ onAuthLost: (id) => lost.push(id) });
  api.error = new ApiError('auth', { status: 401, code: 'no_session' });
  await t.refill();
  assert.deepEqual(lost, ['P1']);
  api.error = new ApiError('offline');
  await t.refill();
  assert.equal(t.count(), 0);
});

test('stored: a reload keeps the tickets; two tabs never take the same one', async () => {
  const storage = memoryStorage();
  const a = setup({ storage });
  await a.t.refill();
  const b = setup({ storage }); // a second tab (or a reload)
  const fromA = a.t.take();
  const fromB = b.t.take();
  assert.notEqual(fromA.runId, fromB.runId);
  assert.equal(JSON.parse(storage.getItem(TICKETS_KEY)).tickets.length, 1);
  // Blocked storage: kept in memory for this page.
  const m = setup({ storage: memoryStorage({ fail: true }) });
  await m.t.refill();
  assert.equal(m.t.count(), 3);
  assert.ok(m.t.take());
});

test('with the real server: tickets for the session\'s player, seeds as numbers, 30 at most kept by the server', async () => {
  const api = await startApi();
  const p = await newPlayer(api, 'TRUBEL');
  const bf = browserFetch(api);
  bf.jar.cookie = p.cookie;
  const client = createApi({ fetch: bf.fetch });
  const t = createTickets({ api: client, ruleset: '1', playerId: () => p.id, storage: memoryStorage(), now: () => api.clock.now() });
  await t.refill();
  assert.equal(t.count(), 3);
  const k = t.take();
  assert.ok(Number.isInteger(k.seed) && k.seed >= 0 && k.seed <= 0xffffffff);
  assert.match(k.runId, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE player_id = ?').get(p.id).n, 3);
  await api.stop();
});
