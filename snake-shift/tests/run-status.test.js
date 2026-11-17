// A run's way to the board (LEADERBOARD_PLAN A4, A9, A12, C5): practice by raw URL parameters,
// eligibility latched at run start, exactly one submission per finished run (none for a lost
// life), the status line, late answers for an earlier run, the two local bests, and the API's
// sorting of answers into transient, permanent, auth and offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practiceParams, parseOptions } from '../src/config.js';
import { createRanked, localReason, statusText, savedStatus } from '../src/ranked.js';
import { createOutbox } from '../src/outbox.js';
import { createPrefs } from '../src/prefs.js';
import { createApi, classify, parseRetryAfter, ApiError } from '../src/api.js';
import { createSim } from '../src/sim.js';
import { RANKED_UNIVERSES, RANKED_SPEED, sameRules } from '../src/ruleset.js';
import { STORAGE_KEY } from '../src/config.js';
import { memoryStorage } from '../src/store.js';
import { deferred, fakeTimers, settle } from './helpers/client-kit.js';

// ---------------------------------------------------------------- practice and eligibility

test('practice: any practice parameter by raw presence, whatever its value; nogl stays eligible', () => {
  const practice = (q) => practiceParams(q).length > 0;
  for (const q of ['', '?', '?nogl', '?nogl=1', '?Seed=1', '?reducedFlash=1', '?utm_source=x']) assert.equal(practice(q), false, q);
  for (const q of [
    '?auto', '?debug', '?seed=42', '?seed=', '?start=120', '?start=abc', '?ramp=2', '?cap=60',
    '?universe=lcd', '?scene=lane-pov', '?lock', '?look=pov', '?score=50', '?lives=5',
    '?nogl&cap=95', '?se%65d=1', '?debug=0', '?x=1&lives',
  ]) assert.equal(practice(q), true, q);
  // Overrides that parseOptions ignores (no ?debug) or reads as the default still count.
  assert.equal(parseOptions('?universe=lane').universe, null);
  assert.equal(practice('?universe=lane'), true);
  assert.equal(parseOptions('?start=abc').speed.startMs, 150);
  assert.equal(practice('?start=abc'), true);
  assert.deepEqual(practiceParams('?cap=1&debug&nogl'), ['debug', 'cap']);
});

test('eligibility: every reason a run starts local, in order; none for a full ranked setup', () => {
  const ok = { practice: false, rulesOk: true, identity: { handle: 'TRUBEL', skipped: false, problem: null }, playerId: 'P', mismatch: false };
  assert.equal(localReason(ok), null);
  assert.equal(localReason({ ...ok, practice: true }), 'practice');
  assert.equal(localReason({ ...ok, rulesOk: false }), 'rules');
  assert.equal(localReason({ ...ok, identity: { handle: null, skipped: true, problem: null } }), 'skipped');
  assert.equal(localReason({ ...ok, identity: { handle: null, skipped: false, problem: null } }), 'nouser');
  assert.equal(localReason({ ...ok, identity: { ...ok.identity, problem: { reason: 'blocked', kind: 'create' } } }), 'blocked');
  assert.equal(localReason({ ...ok, identity: { ...ok.identity, problem: { reason: 'blocked', kind: 'rename' } } }), null, 'a refused rename keeps the player');
  assert.equal(localReason({ ...ok, playerId: null }), 'offline');
  assert.equal(localReason({ ...ok, mismatch: true }), 'mismatch');
  // Accessibility switches and renderers are not part of the rules: the table and speed are.
  const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 1 });
  assert.equal(sameRules(sim.universes.map(({ id, rules, mushrooms, rare, room, weight }) => ({ id, rules, mushrooms, rare, room, weight })), sim.speed), true);
});

// ---------------------------------------------------------------- the run lifecycle

function rig({ ticketsOnHand = 5, practice = false, rulesOk = true, handle = 'TRUBEL', playerId = 'P1' } = {}) {
  const timers = fakeTimers();
  let n = 0, left = ticketsOnHand;
  const identity = {
    get: () => ({ handle, skipped: !handle, problem: null }),
    activePlayerId: () => playerId,
  };
  const tickets = { mismatch: false, take: () => (left-- > 0 ? { runId: `run-${++n}`, seed: 7000 + n, playerId } : null) };
  const api = { calls: [], complete(runId, replay) { const d = deferred(); api.calls.push({ runId, replay, ...d }); return d.promise; } };
  const outbox = createOutbox({ api, storage: memoryStorage(), now: timers.now, timers, random: () => 0.5 });
  const enqueued = [];
  const realEnqueue = outbox.enqueue;
  outbox.enqueue = (item) => { enqueued.push(item); return realEnqueue(item); };
  const ranked = createRanked({ identity, tickets, outbox, practice, rulesOk: () => rulesOk, defer: (fn) => timers.setTimeout(fn, 0) });
  const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 1 });
  let current = null;
  // Wired like main.js: the `died` listener (registered once, before any recorder) finishes the run.
  sim.on('died', (e) => ranked.finish(current, { score: e.score }));
  const start = () => {
    current = ranked.begin(() => 99);
    sim.reset(current.seed);
    ranked.attach(current, sim);
    return current;
  };
  return { timers, ranked, sim, start, api, outbox, enqueued };
}

/** Plays until the run ends: eats `eat` dots by steering at them, then straight into walls. */
function playOut(sim, { eat = 2 } = {}) {
  const lost = [];
  sim.on('lifeLost', (e) => lost.push(e.lives));
  sim.queueTurn('up');
  sim.setPaused(false);
  for (let i = 0; i < 5000 && sim.snapshot().alive; i++) {
    const s = sim.snapshot();
    if (s.waiting === 'respawn') sim.setPaused(false);
    if (s.score < eat && s.food) {
      const h = s.snake[0], f = s.food;
      const want = f.x > h.x ? 'right' : f.x < h.x ? 'left' : f.y > h.y ? 'down' : 'up';
      sim.queueTurn(want);
    }
    sim.advance(16.7);
  }
  return lost;
}

test('a ranked run: the ticket seeds it, lost lives submit nothing, the end submits exactly once', async () => {
  const { start, sim, timers, enqueued, api } = rig();
  const run = start();
  assert.deepEqual([run.ranked, run.runId, run.seed, sim.snapshot().seed], [true, 'run-1', 7001, 7001]);
  const lost = playOut(sim, { eat: 2 });
  assert.ok(lost.length >= 2, 'lives were lost along the way');
  assert.equal(sim.snapshot().alive, false);
  assert.equal(run.status.state, 'saving', 'Saving… at once');
  assert.equal(enqueued.length, 0, 'handed over in a task of its own');
  await timers.advance(0);
  assert.equal(enqueued.length, 1, 'exactly one submission');
  assert.equal(enqueued[0].runId, 'run-1');
  assert.equal(enqueued[0].replay.endTick, sim.snapshot().tick);
  assert.equal(api.calls.length, 1);
  api.calls[0].resolve({ runId: 'run-1', score: 2, rank: { allTime: 4, week: 2 }, best: { allTime: true, week: true } });
  await timers.advance(0);
  assert.deepEqual(run.status, { state: 'saved', score: 2, rank: 4, wall: true });
  // A second died event for the same run (cannot happen, but) never submits again.
  assert.equal(start().runId, 'run-2');
});

test('local runs: practice, no ticket, and a score of 0 are never submitted; a local run stays local', async () => {
  for (const [opts, reason] of [[{ practice: true }, 'practice'], [{ ticketsOnHand: 0 }, 'offline'], [{ rulesOk: false }, 'rules'], [{ handle: null }, 'skipped']]) {
    const { start, sim, timers, enqueued } = rig(opts);
    const run = start();
    assert.deepEqual([run.ranked, run.reason, run.seed], [false, reason, 99], reason);
    playOut(sim);
    await timers.advance(1000);
    assert.equal(enqueued.length, 0, reason);
    assert.deepEqual(run.status, { state: 'local', reason });
  }
  const { start, sim, timers, enqueued } = rig();
  const run = start();
  playOut(sim, { eat: 0 });
  assert.equal(sim.snapshot().score, 0);
  await timers.advance(1000);
  assert.equal(enqueued.length, 0, 'score 0 is not submitted');
  assert.deepEqual(run.status, { state: 'local', reason: 'zero' });
});

test('instant retries: slow, out-of-order and failed answers only ever touch their own run', async () => {
  const { start, sim, timers, ranked, api } = rig();
  // What main.js does with the game-over panel: it shows one run and ignores every other.
  let shown = null;
  const panel = [];
  ranked.on((r, st) => { if (r === shown) panel.push(`${r.runId}:${statusText(st).text}`); });
  const A = start();
  playOut(sim, { eat: 1 });
  shown = A;
  const B = start(); // AGAIN at once, before A's answer
  shown = null;
  playOut(sim, { eat: 2 });
  shown = B;
  await timers.advance(0);
  assert.deepEqual(api.calls.map((c) => c.runId), ['run-1']);
  assert.deepEqual(panel, [], 'B already read Saving…; the hand-over changes nothing on screen');
  const C = start(); // and again
  shown = null;
  // A's answer arrives while C is being played: nothing is shown.
  api.calls[0].resolve({ runId: 'run-1', score: 1, rank: { allTime: 9, week: 1 }, best: { allTime: true, week: true } });
  await timers.advance(0);
  assert.deepEqual(panel, []);
  assert.equal(A.status.state, 'saved');
  assert.equal(B.status.state, 'saving');
  assert.equal(C.status.state, 'playing');
  // B fails (offline), then C ends; C's panel shows only C.
  api.calls[1].reject(new ApiError('offline'));
  await timers.advance(0);
  assert.equal(B.status.state, 'waiting');
  playOut(sim, { eat: 3 });
  shown = C;
  await timers.advance(0);
  assert.equal(C.status.state, 'saving');
  await timers.advance(5000); // B is retried first (order), then C
  assert.deepEqual(api.calls.map((c) => c.runId), ['run-1', 'run-2', 'run-2']);
  api.calls[2].resolve({ runId: 'run-2', score: 2, rank: { allTime: 5, week: 1 }, best: { allTime: true, week: true } });
  await timers.advance(0);
  api.calls[3].resolve({ runId: 'run-3', score: 3, rank: { allTime: 3, week: 1 }, best: { allTime: true, week: true } });
  await timers.advance(0);
  assert.deepEqual(panel, ['run-3:Saved'], 'the panel saw only its own run');
  assert.deepEqual([A.status.rank, B.status.rank, C.status.rank], [9, 5, 3]);
});

test('status line text: Saving…, Saved with a confirmed rank, Waiting to sync, Local run with why', () => {
  assert.deepEqual(statusText({ state: 'saving' }), { text: 'Saving…', detail: '', wall: false });
  assert.deepEqual(statusText({ state: 'waiting' }), { text: 'Waiting to sync', detail: '', wall: false });
  assert.deepEqual(statusText(savedStatus({ score: 9, rank: { allTime: 12, week: 3 }, best: { allTime: true, week: true } })),
    { text: 'Saved', detail: 'YOUR RANK #12 ALL TIME', wall: false });
  assert.equal(statusText(savedStatus({ score: 9, rank: { allTime: 10 }, best: { allTime: true } })).wall, true, 'a confirmed top-ten best');
  assert.equal(statusText(savedStatus({ score: 9, rank: { allTime: 3 }, best: { allTime: false } })).wall, false, 'not this run');
  assert.deepEqual(statusText(savedStatus({ score: 0, rank: { allTime: null }, best: { allTime: false } })),
    { text: 'Saved', detail: '', wall: false }, 'no rank shown unless the server gave one');
  assert.deepEqual(statusText({ state: 'local', reason: 'skipped' }), { text: 'Local run', detail: 'NO USERNAME', wall: false });
  assert.equal(statusText({ state: 'local', reason: 'expired' }).detail, 'TOO LATE TO RANK');
  assert.equal(statusText({ state: 'playing' }).text, '');
});

test('a run that went offline stays queued and is saved when the network returns', async () => {
  const { start, sim, timers, api } = rig();
  const run = start();
  playOut(sim, { eat: 1 });
  await timers.advance(0);
  api.calls[0].reject(new ApiError('offline'));
  await timers.advance(0);
  assert.equal(run.status.state, 'waiting');
  await timers.advance(2000);
  api.calls[1].reject(new ApiError('transient', { status: 503 }));
  await timers.advance(4000);
  api.calls[2].resolve({ runId: 'run-1', score: 1, rank: { allTime: 2 }, best: { allTime: true } });
  await timers.advance(0);
  assert.equal(run.status.state, 'saved');
});

// ---------------------------------------------------------------- local bests (C5)

test('local best: old saves keep loading; practice runs get their own best and never raise BEST', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ best: 42, muted: true, reducedFlash: true }));
  const prefs = createPrefs({ storage, matchMedia: () => ({ matches: false }) });
  assert.deepEqual([prefs.get().best, prefs.get().practiceBest, prefs.get().muted], [42, 0, true]);
  assert.equal(prefs.record(80, { practice: true }), true, 'a new practice best');
  assert.equal(prefs.get().best, 42, 'BEST untouched by practice');
  assert.equal(prefs.bestFor({ practice: true }), 80);
  assert.equal(prefs.bestFor(), 42);
  assert.equal(prefs.record(41), false);
  assert.equal(prefs.record(43), true);
  const again = createPrefs({ storage, matchMedia: () => ({ matches: false }) });
  assert.deepEqual([again.get().best, again.get().practiceBest, again.get().reducedFlash], [43, 80, true]);
  const blocked = createPrefs({ storage: memoryStorage({ fail: true }), matchMedia: () => ({ matches: false }) });
  assert.equal(blocked.record(5), true, 'blocked storage: kept in memory');
});

// ---------------------------------------------------------------- the API wrapper

test('api: answers sorted into success, offline, transient, auth and permanent', () => {
  assert.equal(classify(200, { ok: 1 }), null);
  assert.equal(classify(201, { id: 'x' }), null);
  assert.equal(classify(200, null).kind, 'offline', 'a 2xx that is not JSON: something else answers /api');
  assert.equal(classify(404, null).kind, 'offline', 'no API here (static server)');
  assert.equal(classify(404, { error: 'ticket_unknown' }).kind, 'permanent');
  assert.equal(classify(401, { error: 'no_session' }).kind, 'auth');
  for (const s of [429, 500, 502, 503, 504]) assert.equal(classify(s, null).kind, 'transient', String(s));
  const e = classify(422, { error: 'replay_rejected', reason: 'turn_refused' });
  assert.deepEqual([e.kind, e.code, e.body.reason], ['permanent', 'replay_rejected', 'turn_refused']);
  assert.equal(classify(413, null).kind, 'permanent');
  assert.equal(classify(409, { error: 'ruleset_mismatch' }).code, 'ruleset_mismatch');
  assert.equal(parseRetryAfter('3'), 3000);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(new Date(10000).toUTCString(), 4000), 6000);
});

test('api: same-origin requests with the CSRF header on mutations; network errors, timeouts and ?auto are offline', async () => {
  const seen = [];
  const ok = (body) => ({ status: 200, headers: { get: (n) => (n === 'content-type' ? 'application/json' : null) }, json: async () => body });
  const api = createApi({ fetch: async (url, init) => { seen.push({ url, ...init }); return ok({ fine: true }); } });
  await api.tickets('1', 3);
  await api.leaderboard('week');
  await api.complete('abc_-', { v: 1 });
  assert.equal(seen[0].url, '/api/runs/tickets');
  assert.deepEqual([seen[0].method, seen[0].credentials, seen[0].headers['X-Snake'], seen[0].headers['Content-Type']], ['POST', 'same-origin', '1', 'application/json']);
  assert.deepEqual(JSON.parse(seen[0].body), { ruleset: '1', count: 3 });
  assert.equal(seen[1].url, '/api/leaderboard?period=week');
  assert.equal(seen[1].headers['X-Snake'], undefined, 'GET carries no body and no CSRF header');
  assert.equal(seen[2].url, '/api/runs/abc_-/complete');

  const down = createApi({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(down.getPlayer(), (e) => e.kind === 'offline');
  // A request that never answers is cut off by the timeout.
  const timers = { setTimeout: (fn) => setImmediate(fn), clearTimeout: (t) => clearImmediate(t) };
  const hang = createApi({ timers, fetch: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  await assert.rejects(hang.getPlayer(), (e) => e.kind === 'offline' && e.message === 'timeout');
  let called = false;
  const auto = createApi({ enabled: false, fetch: async () => { called = true; return ok({}); } });
  await assert.rejects(auto.leaderboard('all-time'), (e) => e.kind === 'offline');
  await settle();
  assert.equal(called, false, '?auto never touches the network');
});

// ---------------------------------------------------------------- a waiting run may still be ranked

test('canUpgrade: only a run that is local for want of a ticket and has not moved', async () => {
  const { canUpgrade } = await import('../src/ranked.js');
  const waiting = { tick: 0, waiting: 'start', turns: [] };
  const local = { ranked: false, reason: 'offline' };
  assert.equal(canUpgrade(local, waiting, 'ready'), true);
  assert.equal(canUpgrade(null, waiting, 'ready'), false);
  assert.equal(canUpgrade({ ranked: true, reason: null }, waiting, 'ready'), false, 'already ranked');
  for (const reason of ['practice', 'rules', 'skipped', 'nouser', 'blocked', 'mismatch']) {
    assert.equal(canUpgrade({ ranked: false, reason }, waiting, 'ready'), false, reason);
  }
  for (const mode of ['title', 'playing', 'paused', 'respawn', 'over']) assert.equal(canUpgrade(local, waiting, mode), false, mode);
  assert.equal(canUpgrade(local, { tick: 1, waiting: null, turns: [] }, 'ready'), false, 'a tick was played');
  assert.equal(canUpgrade(local, { tick: 0, waiting: 'start', turns: ['up'] }, 'ready'), false, 'a turn is queued');
  assert.equal(canUpgrade(local, { tick: 0, waiting: 'respawn', turns: [] }, 'ready'), false);
  // A fresh simulation is in exactly that state.
  const s = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 7 }).snapshot();
  assert.equal(canUpgrade(local, s, 'ready'), true);
});
