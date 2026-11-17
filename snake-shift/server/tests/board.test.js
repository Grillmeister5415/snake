// The boards (LEADERBOARD_PLAN A2, A6): order, ties, one row per player, the own row in and out
// of the top ten, the next rival, hidden players, renames and the week. Fixture players are put in
// through the server's own modules, as accepted runs with chosen scores and receipt times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startApi, client, newPlayer, fakeClock, T0 } from './helpers.js';
import { createPlayers } from '../players.js';
import { createTickets } from '../tickets.js';
import { createRuns } from '../runs.js';
import { createLeaderboard, weekStart, weekKey, weekBounds } from '../leaderboard.js';

const MIN = 60000, DAY = 86400000;

function fixtures(api) {
  const { db, clock } = api;
  const random = { bytes: randomBytes };
  const players = createPlayers(db, { clock, random, sessionTtlMs: DAY, sessionRefreshMs: DAY });
  const tickets = createTickets(db, { clock, random, ttlMs: DAY, cap: 1e6 });
  const leaderboard = createLeaderboard(db);
  const runs = createRuns(db, { clock, leaderboard, tickets });
  const insert = db.prepare('INSERT INTO players (id, handle, hidden, created_at, updated_at) VALUES (?, ?, 0, 0, 0)');
  let n = 0;
  return {
    players,
    /** A fixture player; `id` (22 characters) when the order of IDs matters. */
    player(handle, id = null) {
      if (!id) return players.create(handle).id;
      insert.run(id, handle);
      return id;
    },
    /** An accepted run with this score, received at `at`. */
    run(playerId, score, at = clock.now()) {
      const [t] = tickets.issue(playerId, '1', 1);
      return runs.accept({
        ticket: tickets.get(t.runId),
        result: { score, tick: 50 + score * 10, reason: 'wall', universe: 'lcd', lives: 0, activeMs: 1000 },
        replayText: null, replayHash: `fixture-${n++}`, receivedAt: at,
      });
    },
  };
}

const rows = (body) => body.entries.map((e) => [e.rank, e.handle, e.score, e.you]);

test('week bounds: Monday 00:00 UTC to the next Monday 00:00 UTC', () => {
  const cases = [
    ['2026-11-16T00:00:00.000Z', '2026-11-16'], // Monday, the first moment
    ['2026-11-22T23:59:59.999Z', '2026-11-16'], // Sunday, the last moment
    ['2026-11-23T00:00:00.000Z', '2026-11-23'],
    ['2026-11-18T12:00:00.000Z', '2026-11-16'],
    ['2027-01-01T05:00:00.000Z', '2026-12-28'], // across the year
    ['2024-02-29T23:00:00.000Z', '2024-02-26'],
  ];
  for (const [at, monday] of cases) {
    const ms = Date.parse(at);
    assert.equal(new Date(weekStart(ms)).toISOString(), `${monday}T00:00:00.000Z`, at);
    assert.equal(weekKey(ms), `w:${monday}`);
    const b = weekBounds(ms);
    assert.equal(Date.parse(b.to) - Date.parse(b.from), 7 * DAY);
  }
});

test('an empty board, the period fields and the cache rule', async () => {
  const api = await startApi();
  const c = client(api);
  const all = await c.get('/api/leaderboard?period=all-time');
  assert.equal(all.status, 200);
  assert.equal(all.headers['cache-control'], 'private, no-store');
  assert.deepEqual(all.body, { period: 'all-time', from: null, to: null, generatedAt: new Date(T0).toISOString(), entries: [], you: null, rival: null });
  const week = await c.get('/api/leaderboard?period=week');
  assert.deepEqual([week.body.period, week.body.from, week.body.to], ['week', '2026-11-16T00:00:00.000Z', '2026-11-23T00:00:00.000Z']);
  assert.equal((await c.get('/api/leaderboard')).body.period, 'all-time', 'all-time by default');
  const bad = await c.get('/api/leaderboard?period=month');
  assert.deepEqual([bad.status, bad.body.error], [400, 'bad_period']);
  await api.stop();
});

test('order: score, then the earlier receipt of that score, then player ID; one row per player; a repeated score never improves a tie', async () => {
  const api = await startApi();
  const f = fixtures(api);
  const a = f.player('ALPHA');
  const b = f.player('BRAVO');
  const c = f.player('CHARLIE');
  const d = f.player('DELTA', 'AAAAAAAAAAAAAAAAAAAAAA');
  const e = f.player('ECHO', 'BBBBBBBBBBBBBBBBBBBBBB');
  f.run(a, 72, T0 + 1 * MIN);
  f.run(b, 68, T0 + 2 * MIN);
  f.run(c, 72, T0 + 3 * MIN);
  f.run(e, 50, T0 + 4 * MIN); // same score, same time: the smaller ID first
  f.run(d, 50, T0 + 4 * MIN);
  f.run(a, 40, T0 + 5 * MIN); // a worse run changes nothing
  const viewer = client(api);
  const board = async () => rows((await viewer.get('/api/leaderboard')).body);
  assert.deepEqual(await board(), [
    [1, 'ALPHA', 72, false], [2, 'CHARLIE', 72, false], [3, 'BRAVO', 68, false], [4, 'DELTA', 50, false], [5, 'ECHO', 50, false],
  ]);
  assert.deepEqual(f.run(c, 72, T0 + 6 * MIN), { allTime: false, week: false }, 'an equal score is not a new best');
  assert.equal((await board())[1][1], 'CHARLIE', 'still second');
  assert.deepEqual(f.run(c, 73, T0 + 7 * MIN), { allTime: true, week: true });
  assert.deepEqual((await board()).slice(0, 2), [[1, 'CHARLIE', 73, false], [2, 'ALPHA', 72, false]]);
  await api.stop();
});

test('the own row: marked inside the top ten, a separate real rank outside it, never twice', async () => {
  const api = await startApi();
  const f = fixtures(api);
  const me = await newPlayer(api, 'TRUBEL');
  for (let i = 0; i < 11; i++) f.run(f.player(`P${i}`), 10 + i, T0 + i * MIN); // scores 10..20
  f.run(me.id, 5, T0 + 20 * MIN);
  let r = (await me.get('/api/leaderboard')).body;
  assert.equal(r.entries.length, 10);
  assert.ok(r.entries.every((e) => !e.you));
  assert.deepEqual(r.entries.map((e) => e.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(r.you, { rank: 12, handle: 'TRUBEL', score: 5 });
  assert.deepEqual(r.rival, { rank: 11, handle: 'P0', score: 10, need: 6 });
  // Up into the top ten.
  f.run(me.id, 15, T0 + 30 * MIN);
  r = (await me.get('/api/leaderboard')).body;
  const mine = r.entries.filter((e) => e.you);
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0], { rank: 7, handle: 'TRUBEL', score: 15, you: true }, 'after P5 (15, earlier)');
  assert.deepEqual(r.you, { rank: 7, handle: 'TRUBEL', score: 15 });
  assert.equal(r.entries.filter((e) => e.handle === 'TRUBEL').length, 1);
  // Someone else sees no YOU marker.
  const other = (await client(api).get('/api/leaderboard')).body;
  assert.ok(other.entries.every((e) => !e.you));
  assert.equal(other.you, null);
  await api.stop();
});

test('the next rival: points to overtake, a tie needs one more, none in first place, explicit when unranked', async () => {
  const api = await startApi();
  const f = fixtures(api);
  const me = await newPlayer(api, 'TRUBEL');
  const rival = f.player('N0_FUTURE');
  f.run(rival, 72, T0 + MIN);
  f.run(me.id, 68, T0 + 2 * MIN);
  let r = (await me.get('/api/leaderboard')).body;
  assert.deepEqual(r.rival, { rank: 1, handle: 'N0_FUTURE', score: 72, need: 5 }, '68 against 72 needs 5');
  f.run(me.id, 72, T0 + 3 * MIN);
  r = (await me.get('/api/leaderboard')).body;
  assert.deepEqual(r.you, { rank: 2, handle: 'TRUBEL', score: 72 });
  assert.deepEqual(r.rival, { rank: 1, handle: 'N0_FUTURE', score: 72, need: 1 }, 'a tie needs one more');
  f.run(me.id, 73, T0 + 4 * MIN);
  r = (await me.get('/api/leaderboard')).body;
  assert.equal(r.you.rank, 1);
  assert.equal(r.rival, null, 'first place has no rival');
  // Unranked, board not full: any finished run gets in, so no rival.
  const newcomer = await newPlayer(api, 'NEWBIE');
  r = (await newcomer.get('/api/leaderboard')).body;
  assert.deepEqual([r.you, r.rival], [null, null]);
  // Unranked, board full: the tenth place, counted from zero.
  for (let i = 0; i < 8; i++) f.run(f.player(`F${i}`), 30 + i, T0 + (10 + i) * MIN);
  r = (await newcomer.get('/api/leaderboard')).body;
  assert.equal(r.entries.length, 10);
  assert.deepEqual(r.rival, { rank: 10, handle: 'F0', score: 30, need: 31 });
  assert.deepEqual((await client(api).get('/api/leaderboard')).body.rival, r.rival, 'the same for a visitor without a session');
  await api.stop();
});

test('hidden players are left out of lists and ranks; unhiding brings them back with their scores', async () => {
  const api = await startApi();
  const f = fixtures(api);
  const me = await newPlayer(api, 'TRUBEL');
  const bad = f.player('RUDE_NAME');
  f.run(bad, 99, T0 + MIN);
  f.run(me.id, 50, T0 + 2 * MIN);
  assert.equal((await me.get('/api/leaderboard')).body.you.rank, 2);
  f.players.setHidden(bad, true);
  let r = (await me.get('/api/leaderboard')).body;
  assert.deepEqual(rows(r), [[1, 'TRUBEL', 50, true]]);
  assert.equal(r.you.rank, 1);
  assert.equal(r.rival, null);
  f.players.setHidden(me.id, true);
  r = (await me.get('/api/leaderboard')).body;
  assert.deepEqual([r.entries, r.you], [[], null], 'a hidden player is not shown to themselves either');
  f.players.setHidden(me.id, false);
  f.players.setHidden(bad, false);
  assert.deepEqual(rows((await me.get('/api/leaderboard')).body), [[1, 'RUDE_NAME', 99, false], [2, 'TRUBEL', 50, true]]);
  await api.stop();
});

test('a rename keeps the rank and the records; equal handles stay separate rows', async () => {
  const api = await startApi();
  const f = fixtures(api);
  const me = await newPlayer(api, 'TRUBEL');
  const twin = f.player('TRUBEL');
  f.run(twin, 40, T0 + MIN);
  f.run(me.id, 30, T0 + 2 * MIN);
  assert.deepEqual(rows((await me.get('/api/leaderboard')).body), [[1, 'TRUBEL', 40, false], [2, 'TRUBEL', 30, true]]);
  assert.equal((await me.patch('/api/player', { handle: 'SNEK' })).status, 200);
  const r = (await me.get('/api/leaderboard')).body;
  assert.deepEqual(rows(r), [[1, 'TRUBEL', 40, false], [2, 'SNEK', 30, true]]);
  assert.deepEqual(r.you, { rank: 2, handle: 'SNEK', score: 30 });
  assert.deepEqual(r.rival, { rank: 1, handle: 'TRUBEL', score: 40, need: 11 });
  await api.stop();
});

test('this week only counts runs received this week; all time keeps every best', async () => {
  const clock = fakeClock();
  const api = await startApi({ clock });
  const f = fixtures(api);
  const me = await newPlayer(api, 'TRUBEL');
  const old = f.player('OLDTIMER');
  f.run(old, 90, Date.parse('2026-11-12T10:00:00.000Z')); // last week
  f.run(me.id, 80, Date.parse('2026-11-13T10:00:00.000Z')); // last week
  f.run(me.id, 20, Date.parse('2026-11-17T10:00:00.000Z')); // this week
  const week = (await me.get('/api/leaderboard?period=week')).body;
  assert.deepEqual(rows(week), [[1, 'TRUBEL', 20, true]]);
  assert.deepEqual(week.you, { rank: 1, handle: 'TRUBEL', score: 20 });
  const all = (await me.get('/api/leaderboard?period=all-time')).body;
  assert.deepEqual(rows(all), [[1, 'OLDTIMER', 90, false], [2, 'TRUBEL', 80, true]]);
  // Next Monday the week starts empty.
  clock.set(Date.parse('2026-11-23T00:00:00.000Z'));
  const next = (await me.get('/api/leaderboard?period=week')).body;
  assert.deepEqual([next.entries, next.you, next.from], [[], null, '2026-11-23T00:00:00.000Z']);
  await api.stop();
});

test('a score of 0 never shows: no row, no rank, no best, and an old zero row stays hidden', async () => {
  const { createSim } = await import('../../src/sim.js');
  const { RANKED_UNIVERSES, RANKED_SPEED } = await import('../../src/ruleset.js');
  const { tickets: getTickets, submit } = await import('./helpers.js');
  // A run with no turns at all: find a seed where the idle snake dies without eating.
  const idle = (seed) => {
    const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed });
    let died = null;
    sim.on('died', (e) => { died = e; });
    let activeMs = 0;
    while (!died) { activeMs += RANKED_SPEED.startMs; sim.step(); }
    return { replay: { v: 1, turns: [], endTick: died.tick }, score: died.score, activeMs };
  };
  let seed = 1, run = idle(seed);
  while (run.score !== 0) run = idle(++seed);

  const clock = fakeClock();
  const api = await startApi({ clock });
  const me = await newPlayer(api, 'ZERO_HERO');
  const [t] = await getTickets(me);
  api.db.prepare('UPDATE tickets SET seed = ? WHERE run_id = ?').run(seed, t.runId);
  clock.advance(run.activeMs + 2000);
  const r = await submit(me, t.runId, run.replay);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.score, 0);
  assert.deepEqual([r.body.best, r.body.rank], [{ allTime: false, week: false }, { allTime: null, week: null }]);
  for (const period of ['all-time', 'week']) {
    const b = (await me.get(`/api/leaderboard?period=${period}`)).body;
    assert.deepEqual([b.entries, b.you, b.rival], [[], null, null], period);
  }
  // A row with 0 written before this rule: off the list and out of everyone's rank.
  const f = fixtures(api);
  const old = f.player('OLD_ZERO', 'AAAAAAAAAAAAAAAAAAAAAA');
  const [ot] = await getTickets(me); // any stored run will do for the foreign key
  api.db.prepare('UPDATE tickets SET seed = ? WHERE run_id = ?').run(seed, ot.runId);
  clock.advance(run.activeMs + 2000);
  await submit(me, ot.runId, run.replay);
  api.db.prepare('INSERT INTO bests (board, player_id, score, at, run_id) VALUES (?, ?, 0, ?, ?)').run('all', old, T0 - DAY, ot.runId);
  const other = f.player('ONE_POINT');
  f.run(other, 1, T0 + MIN);
  const b = (await me.get('/api/leaderboard')).body;
  assert.deepEqual(rows(b), [[1, 'ONE_POINT', 1, false]]);
  assert.equal(b.you, null);
  assert.equal(f.run(old, 0, T0 + 2 * MIN).allTime, false, 'a new zero is never a best');
  await api.stop();
});
