// Tickets and run submission (LEADERBOARD_PLAN A10 to A12, C2): the server's own score, idempotent
// retries, conflicts, owners, expiry, plausibility, limits and bounded verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, client, newPlayer, fakeClock, tickets, play, submit, T0 } from './helpers.js';
import { REPLAY_LIMITS } from '../../src/replay.js';
import { RANKED_SPEED } from '../../src/ruleset.js';

const HOUR = 3600000, DAY = 24 * HOUR;
const MAX_ACTIVE = REPLAY_LIMITS.maxTicks * RANKED_SPEED.startMs;

test('tickets: up to five, a server seed each, a day to start; wrong rules and bad counts are refused', async () => {
  const clock = fakeClock();
  const api = await startApi({ clock });
  const p = await newPlayer(api);
  const r = await p.post('/api/runs/tickets', { ruleset: '1', count: 3 });
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.body.ruleset, '1');
  assert.equal(r.body.now, new Date(T0).toISOString());
  assert.equal(r.body.tickets.length, 3);
  for (const t of r.body.tickets) {
    assert.deepEqual(Object.keys(t).sort(), ['expiresAt', 'runId', 'seed']);
    assert.match(t.runId, /^[A-Za-z0-9_-]{22}$/);
    assert.ok(Number.isInteger(t.seed) && t.seed >= 0 && t.seed <= 0xffffffff);
    assert.equal(t.expiresAt, new Date(T0 + DAY).toISOString());
  }
  assert.equal(new Set(r.body.tickets.map((t) => t.runId)).size, 3);
  assert.equal((await p.post('/api/runs/tickets', { ruleset: '1' })).body.tickets.length, 1, 'count defaults to 1');
  const mismatch = await p.post('/api/runs/tickets', { ruleset: '0', count: 1 });
  assert.equal(mismatch.status, 409);
  assert.deepEqual([mismatch.body.error, mismatch.body.ruleset], ['ruleset_mismatch', '1']);
  for (const count of [0, 6, 1.5, '2', null]) {
    const bad = await p.post('/api/runs/tickets', { ruleset: '1', count });
    assert.equal(bad.status, 400, String(count));
  }
  await api.stop();
});

test('tickets: at most 30 unexpired per player; asking for more retires the oldest', async () => {
  const api = await startApi();
  const p = await newPlayer(api);
  const all = [];
  for (let i = 0; i < 7; i++) all.push(...(await tickets(p, 5)));
  const live = api.db.prepare('SELECT run_id FROM tickets').all().map((r) => r.run_id);
  assert.equal(live.length, 30);
  assert.deepEqual(new Set(live), new Set(all.slice(5).map((t) => t.runId)), 'the five oldest are gone');
  const { replay } = play(all[0], api.clock);
  const r = await submit(p, all[0].runId, replay);
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'ticket_unknown');
  await api.stop();
});

test('a real run: the server replays it and stores its own score, never the one sent', async () => {
  const api = await startApi();
  const p = await newPlayer(api, 'TRUBEL');
  const [t] = await tickets(p);
  const { replay, played } = play(t, api.clock);
  const r = await submit(p, t.runId, replay, { score: 99999, tick: 1, lives: 5 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers['cache-control'], 'no-store');
  const receivedAt = new Date(api.clock.now()).toISOString();
  assert.deepEqual(r.body, {
    runId: t.runId, status: 'accepted', duplicate: false,
    score: played.score, tick: played.tick, reason: played.reason, universe: played.universe, lives: played.lives,
    receivedAt,
    best: { allTime: true, week: true },
    rank: { allTime: 1, week: 1 },
    week: { from: '2026-11-16T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z' },
  });
  const row = api.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(t.runId);
  assert.equal(row.score, played.score);
  assert.equal(row.status, 'accepted');
  assert.equal(row.ruleset, '1');
  assert.equal(row.seed, t.seed);
  assert.ok(row.replay.startsWith('{"v":1,"turns":['));
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n, 0, 'the ticket is spent');
  const board = await p.get('/api/leaderboard?period=all-time');
  assert.deepEqual(board.body.entries, [{ rank: 1, handle: 'TRUBEL', score: played.score, you: true }]);
  await api.stop();
});

test('idempotent: the same replay again answers the stored result with the first receipt time; another replay is a conflict', async () => {
  const api = await startApi();
  const p = await newPlayer(api);
  const [t, t2] = await tickets(p, 2);
  const { replay } = play(t, api.clock);
  const first = await submit(p, t.runId, replay);
  assert.equal(first.status, 200);
  api.clock.advance(5 * 60000);
  const again = await submit(p, t.runId, JSON.parse(JSON.stringify(replay)));
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.receivedAt, first.body.receivedAt);
  assert.deepEqual({ ...again.body, duplicate: false }, first.body);
  // Same content in another key order is the same replay.
  const reordered = { endTick: replay.endTick, turns: replay.turns, v: 1 };
  assert.equal((await submit(p, t.runId, reordered)).body.duplicate, true);
  // Different content for a spent ticket.
  const other = play(t2, null).replay;
  const conflict = await submit(p, t.runId, other);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'ticket_spent');
  assert.equal((await submit(p, t.runId, { v: 1, turns: [0], endTick: 1 })).status, 409, 'even a malformed one');
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
  await api.stop();
});

test('forged replays are rejected for good, malformed ones refused without spending the ticket', async () => {
  const api = await startApi();
  const p = await newPlayer(api);
  const [a, b] = await tickets(p, 2);
  const { replay } = play(a, api.clock);
  // A later end tick (claiming the run went on) does not match the real death.
  const forged = { ...replay, endTick: replay.endTick + 300 };
  const r = await submit(p, a.runId, forged);
  assert.equal(r.status, 422);
  assert.deepEqual([r.body.error, r.body.reason, r.body.duplicate], ['replay_rejected', 'ended_early', false]);
  const again = await submit(p, a.runId, forged);
  assert.deepEqual([again.status, again.body.reason, again.body.duplicate], [422, 'ended_early', true]);
  assert.equal((await submit(p, a.runId, replay)).status, 409, 'the ticket is spent by the forgery');
  const board = await p.get('/api/leaderboard');
  assert.deepEqual(board.body.entries, [], 'nothing on the board');

  // Malformed: refused, but the ticket stays usable.
  const real = play(b, api.clock).replay;
  for (const [bad, reason] of [
    [undefined, 'malformed'], [{ v: 1, turns: [0], endTick: 5 }, 'malformed'], [{ v: 9, turns: [], endTick: 5 }, 'version'],
    [{ v: 1, turns: [5, 0, 1, 1], endTick: 9 }, 'turn_order'], [{ v: 1, turns: [9, 0], endTick: 9 }, 'turn_after_end'],
  ]) {
    const m = await submit(p, b.runId, bad);
    assert.equal(m.status, 400, JSON.stringify(bad));
    assert.deepEqual([m.body.error, m.body.reason], ['replay_malformed', reason]);
  }
  assert.equal((await submit(p, b.runId, real)).status, 200, 'still usable');
  await api.stop();
});

test('a run sent faster than the snake could move is rejected', async () => {
  const api = await startApi();
  const p = await newPlayer(api);
  const [t] = await tickets(p);
  const { replay } = play(t, null); // the clock does not move: zero seconds for a whole run
  const r = await submit(p, t.runId, replay);
  assert.equal(r.status, 422);
  assert.equal(r.body.reason, 'too_fast');
  await api.stop();
});

test('owners, unknown tickets, expiry and retired rules', async () => {
  const clock = fakeClock();
  const api = await startApi({ clock });
  const a = await newPlayer(api, 'ALICE');
  const b = await newPlayer(api, 'BOB');
  const [t1, t2, t3] = await tickets(a, 3);
  const { replay } = play(t1, clock);
  const stolen = await submit(b, t1.runId, replay);
  assert.deepEqual([stolen.status, stolen.body.error], [403, 'not_owner']);
  assert.equal((await submit(a, t1.runId, replay)).status, 200);
  assert.deepEqual([(await submit(b, t1.runId, replay)).status], [403], 'not even the stored answer');
  for (const id of ['AAAAAAAAAAAAAAAAAAAAAA', 'short', 'x'.repeat(64)]) {
    const u = await submit(a, id, replay);
    assert.deepEqual([u.status, u.body.error], [404, 'ticket_unknown'], id);
  }
  // t2: played, then sent long after even the longest possible run could have ended.
  const late = play(t2, null).replay;
  clock.set(T0 + DAY + MAX_ACTIVE + 10 * 60000 + 1);
  const exp = await submit(a, t2.runId, late);
  assert.deepEqual([exp.status, exp.body.error], [410, 'ticket_expired']);
  // t3: within that outer bound, but later than expiry + this run's own moving time + 10 minutes.
  const r3 = play(t3, null);
  clock.set(T0 + DAY + Math.ceil(r3.activeMs) + 10 * 60000 + 1000);
  const exp3 = await submit(a, t3.runId, r3.replay);
  assert.deepEqual([exp3.status, exp3.body.error], [410, 'ticket_expired']);
  // A ticket of rules the server no longer ranks.
  api.db.prepare("INSERT INTO tickets (run_id, player_id, seed, ruleset, issued_at, expires_at) VALUES ('OLDRULESOLDRULESOLDRUL', ?, 5, '0', ?, ?)")
    .run(a.id, clock.now() - HOUR, clock.now() + HOUR);
  const old = await submit(a, 'OLDRULESOLDRULESOLDRUL', replay);
  assert.deepEqual([old.status, old.body.error, old.body.ruleset], [410, 'ruleset_retired', '1']);
  await api.stop();
});

test('limits: an oversized replay or body is refused with its own code', async () => {
  const api = await startApi({ config: { replayLimits: { maxTicks: 100000, maxTurns: 60000, maxBytes: 300 } } });
  const p = await newPlayer(api);
  const [t] = await tickets(p);
  const { replay } = play(t, api.clock, { crashAfter: 600 });
  const r = await submit(p, t.runId, replay);
  assert.equal(r.status, 413);
  assert.deepEqual([r.body.error, r.body.reason], ['replay_too_large', 'too_large']);
  const body = await submit(p, t.runId, replay, { pad: 'x'.repeat(4000) });
  assert.deepEqual([body.status, body.body.error], [413, 'too_large']);
  const long = await submit(p, t.runId, { v: 1, turns: [], endTick: 100001 });
  assert.deepEqual([long.status, long.body.reason], [413, 'too_long']);
  await api.stop();
});

test('bounded verification: a full queue answers 503 busy (transient), the API keeps answering meanwhile', async () => {
  const held = [];
  let open = false;
  const pause = (fn) => (open ? setImmediate(fn) : held.push(fn));
  const api = await startApi({ config: { verify: { concurrency: 1, maxQueued: 1, sliceTicks: 20, pause } } });
  const p = await newPlayer(api);
  const ts = await tickets(p, 3);
  const runs = ts.map((t) => play(t, api.clock));
  const first = submit(p, ts[0].runId, runs[0].replay);
  const second = submit(p, ts[1].runId, runs[1].replay);
  while (api.app.queue.active < 1 || api.app.queue.queued < 1) await new Promise((r) => setTimeout(r, 2));
  // One is being checked (stopped between two slices), one waits: the third does not fit.
  const third = await submit(p, ts[2].runId, runs[2].replay);
  assert.equal(third.status, 503);
  assert.equal(third.body.error, 'busy');
  assert.equal(third.headers['retry-after'], '3');
  // Meanwhile everything else still answers.
  assert.equal((await p.get('/api/health')).status, 200);
  assert.equal((await p.get('/api/leaderboard')).status, 200);
  assert.equal((await p.get('/api/player')).status, 200);
  // The same run sent again while it is being checked waits for that check (no second one).
  const dup = submit(p, ts[0].runId, runs[0].replay);
  open = true;
  while (held.length) held.shift()();
  const [r1, r2, rd] = await Promise.all([first, second, dup]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(rd.status, 200);
  assert.equal(r1.body.duplicate, false);
  assert.equal(rd.body.duplicate, true);
  assert.equal(rd.body.score, r1.body.score);
  // Busy was not a verdict: the third goes through on a retry.
  const retry = await submit(p, ts[2].runId, runs[2].replay);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, false);
  assert.equal(api.app.queue.active + api.app.queue.queued, 0);
  await api.stop();
});

test('the week: a run belongs to the UTC week of its first receipt, also when retried after Monday 00:00', async () => {
  const clock = fakeClock(Date.parse('2026-11-22T23:40:00.000Z')); // a Sunday
  const api = await startApi({ clock });
  const p = await newPlayer(api, 'TRUBEL');
  const [t] = await tickets(p);
  const { replay, played } = play(t, null);
  clock.set(Date.parse('2026-11-22T23:59:59.999Z'));
  const first = await submit(p, t.runId, replay);
  assert.equal(first.status, 200);
  assert.equal(first.body.receivedAt, '2026-11-22T23:59:59.999Z');
  assert.deepEqual(first.body.week, { from: '2026-11-16T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z' });
  assert.deepEqual(first.body.rank, { allTime: 1, week: 1 });
  // The answer was lost; the browser retries after midnight.
  clock.set(Date.parse('2026-11-23T00:00:00.001Z'));
  const retry = await submit(p, t.runId, replay);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.receivedAt, '2026-11-22T23:59:59.999Z', 'the first receipt time stays');
  assert.deepEqual(retry.body.week, first.body.week, 'still last week');
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM bests').get().n, 2, 'all-time and last week only');
  // This week's board is empty; the all-time board has the run.
  const week = await p.get('/api/leaderboard?period=week');
  assert.equal(week.body.from, '2026-11-23T00:00:00.000Z');
  assert.equal(week.body.to, '2026-11-30T00:00:00.000Z');
  assert.deepEqual([week.body.entries, week.body.you], [[], null]);
  const all = await p.get('/api/leaderboard?period=all-time');
  assert.deepEqual(all.body.you, { rank: 1, handle: 'TRUBEL', score: played.score });
  assert.deepEqual([all.body.from, all.body.to], [null, null]);
  // A new run on Monday counts for the new week.
  const [t2] = await tickets(p);
  const monday = await submit(p, t2.runId, play(t2, clock).replay);
  assert.equal(monday.status, 200);
  assert.equal(monday.body.week.from, '2026-11-23T00:00:00.000Z');
  assert.equal(monday.body.best.week, true);
  assert.equal((await p.get('/api/leaderboard?period=week')).body.you.score, monday.body.score);
  await api.stop();
});

test('retention: old replays go unless they are a best, expired tickets and sessions go, retries still work', async () => {
  const clock = fakeClock();
  const api = await startApi({ clock });
  const p = await newPlayer(api);
  const [a, b, c] = await tickets(p, 3);
  const ra = play(a, clock, { crashAfter: 900 });
  const sa = await submit(p, a.runId, ra.replay);
  const rb = play(b, clock, { crashAfter: 100 });
  const sb = await submit(p, b.runId, rb.replay);
  assert.equal(sa.status, 200);
  assert.equal(sb.status, 200);
  const [hi, lo] = sa.body.score >= sb.body.score ? [a, b] : [b, a];
  clock.advance(31 * DAY);
  const swept = api.app.sweep();
  assert.equal(swept.replays, 1);
  assert.equal(swept.tickets, 1, 'the unused ticket');
  const kept = api.db.prepare('SELECT run_id, replay IS NOT NULL AS has FROM runs').all();
  assert.deepEqual(Object.fromEntries(kept.map((r) => [r.run_id, !!r.has])), { [hi.runId]: true, [lo.runId]: false });
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n, 0);
  void c;
  // The dropped replay can still be retried idempotently: its hash stayed.
  const loReplay = lo === a ? ra.replay : rb.replay;
  const retry = await submit(p, lo.runId, loReplay);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  clock.advance(400 * DAY);
  assert.equal(api.app.sweep().sessions, 1);
  await api.stop();
});
