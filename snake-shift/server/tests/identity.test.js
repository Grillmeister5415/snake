// Players, sessions, handles and request checks (LEADERBOARD_PLAN A3, A13, C2, Part B 14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, client, newPlayer, fakeClock, httpCall } from './helpers.js';
import { isBlocked, handleProblem } from '../blocklist.js';
import { allSuggestions } from '../../src/handle.js';

const DAY = 86400000;

test('first visit: a player and an anonymous session; the secret only in an HttpOnly cookie', async () => {
  const api = await startApi();
  const c = client(api);
  const r = await c.post('/api/player', { handle: '  trubel ' });
  assert.equal(r.status, 201);
  assert.deepEqual(Object.keys(r.body).sort(), ['created', 'handle', 'id']);
  assert.equal(r.body.handle, 'TRUBEL');
  assert.equal(r.body.created, true);
  assert.match(r.body.id, /^[A-Za-z0-9_-]{22}$/);
  const set = r.headers['set-cookie'];
  assert.equal(set.length, 1);
  assert.match(set[0], /^ss_dev=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Strict$/, 'development: no Secure, so plain http works');
  const token = c.cookie.split('=')[1];
  assert.equal(r.headers['cache-control'], 'no-store');
  // The returning player.
  const g = await c.get('/api/player');
  assert.equal(g.status, 200);
  assert.deepEqual(g.body, { id: r.body.id, handle: 'TRUBEL' });
  assert.equal(g.headers['set-cookie'], undefined, 'not re-sent within a day');
  const again = await c.post('/api/player', { handle: 'SOMEONE_ELSE' });
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { id: r.body.id, handle: 'TRUBEL', created: false }, 'a valid session wins over a new create');
  // The secret never shows up in a body or a log line, and neither does an address.
  for (const line of api.logs) {
    assert.ok(!line.includes(token), 'no session secret in logs');
    assert.ok(!line.includes('127.0.0.1'), 'no address in logs');
  }
  const stored = api.db.prepare('SELECT token_hash FROM sessions').all();
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0].token_hash, token, 'only a hash is stored');
  assert.match(stored[0].token_hash, /^[0-9a-f]{64}$/);
  await api.stop();
});

test('production cookie: __Host-ss, Secure, host-only; the origin must be the configured one', async () => {
  const api = await startApi({ dev: false, origin: 'https://snake.online-tichu.com' });
  const wrong = client(api); // sends Origin: http://127.0.0.1:<port>
  const bad = await wrong.post('/api/player', { handle: 'TRUBEL' });
  assert.equal(bad.status, 403);
  assert.equal(bad.body.error, 'csrf');
  const c = client(api, { origin: 'https://snake.online-tichu.com' });
  const r = await c.post('/api/player', { handle: 'TRUBEL' });
  assert.equal(r.status, 201);
  assert.match(r.headers['set-cookie'][0], /^__Host-ss=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Strict; Secure$/);
  assert.ok(!/Domain=/i.test(r.headers['set-cookie'][0]));
  assert.equal((await c.get('/api/player')).status, 200);
  // A development cookie name means nothing in production.
  const dev = await httpCall(api.port, 'GET', '/api/player', { Cookie: `ss_dev=${c.cookie.split('=')[1]}` });
  assert.equal(dev.status, 401);
  await api.stop();
});

test('no session: 401 everywhere that needs one; a lost or expired session makes a new player, never takes one over', async () => {
  const clock = fakeClock();
  const api = await startApi({ clock });
  const anon = client(api);
  assert.equal((await anon.get('/api/player')).status, 401);
  assert.equal((await anon.get('/api/player')).body.error, 'no_session');
  assert.equal((await anon.patch('/api/player', { handle: 'ABC' })).status, 401);
  assert.equal((await anon.post('/api/runs/tickets', { ruleset: '1', count: 1 })).status, 401);
  assert.equal((await anon.post('/api/runs/AAAAAAAAAAAAAAAAAAAAAA/complete', { replay: {} })).status, 401);
  anon.cookie = 'ss_dev=not-a-token';
  assert.equal((await anon.get('/api/player')).status, 401);

  const a = await newPlayer(api, 'TRUBEL');
  // Refreshed after a day: the cookie comes again.
  clock.advance(2 * DAY);
  const g = await a.get('/api/player');
  assert.equal(g.status, 200);
  assert.ok(g.headers['set-cookie'], 'extended and re-sent');
  // A year without a visit: the session is gone; creating again gives a new player.
  clock.advance(366 * DAY);
  assert.equal((await a.get('/api/player')).status, 401);
  const re = await a.post('/api/player', { handle: 'TRUBEL' });
  assert.equal(re.status, 201);
  assert.notEqual(re.body.id, a.id, 'a new player, not the old one');
  await api.stop();
});

test('duplicate handles are separate players; rename keeps the player', async () => {
  const api = await startApi();
  const a = await newPlayer(api, 'TRUBEL');
  const b = await newPlayer(api, 'trubel');
  assert.notEqual(a.id, b.id);
  const r = await a.patch('/api/player', { handle: 'n0_future' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { id: a.id, handle: 'N0_FUTURE' });
  assert.deepEqual((await a.get('/api/player')).body, { id: a.id, handle: 'N0_FUTURE' });
  assert.deepEqual((await b.get('/api/player')).body, { id: b.id, handle: 'TRUBEL' });
  await api.stop();
});

test('handles are checked on the server too: the rule and the blocklist, on create and rename', async () => {
  const api = await startApi({ config: { rates: { renameSession: { burst: 100, perMinute: 10 } } } });
  const c = client(api);
  const cases = [
    ['AB', 'too_short'], ['ABCDEFGHIJKLM', 'too_long'], ['DOT GOBLIN', 'bad_chars'], ['<script>', 'bad_chars'],
    ['', 'empty'], [null, 'empty'], [12345, 'empty'],
    ['SHIT', 'blocked'], ['sh1t_lord', 'blocked'], ['XX_NAZI_XX', 'blocked'], ['F_U_C_K', 'blocked'], ['B1TCH', 'blocked'],
    ['5HIT', 'blocked'], ['HITL3R', 'blocked'], ['WICHSER', 'blocked'], ['N4ZI', 'blocked'],
  ];
  for (const [handle, reason] of cases) {
    const r = await c.post('/api/player', { handle });
    assert.equal(r.status, 422, JSON.stringify(handle));
    assert.equal(r.body.error, 'handle_invalid');
    assert.equal(r.body.reason, reason, JSON.stringify(handle));
  }
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM players').get().n, 0, 'nothing was created');
  const p = await newPlayer(api, 'TRUBEL');
  for (const [handle, reason] of cases) {
    const r = await p.patch('/api/player', { handle });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, reason);
    if (r.status !== 422) break;
  }
  assert.equal((await p.get('/api/player')).body.handle, 'TRUBEL', 'unchanged');
  await api.stop();
});

test('blocklist: inside longer handles, with digits for letters, but not ordinary words', () => {
  for (const h of ['SHIT', 'BIGSHIT', 'SH_IT', 'SH1T', '5H1T', 'XNAZIX', 'N4Z1', 'HITLER88', 'F0TZE', 'KKK_FAN', 'RAP15T']) {
    assert.equal(isBlocked(h), true, h);
  }
  for (const h of ['TRUBEL', 'N0_FUTURE', 'DOT_GOBLIN', 'GRAPE_APE', 'PEACOCK', 'CLASSIC', 'SHIITAKE', 'ASSASSIN', 'HITMAN', 'SNAKE_1337']) {
    assert.equal(isBlocked(h), false, h);
  }
  for (const h of allSuggestions()) assert.equal(handleProblem(h), null, `suggestion ${h}`);
});

test('mutations need JSON, X-Snake and a same-origin Origin or Sec-Fetch-Site', async () => {
  const api = await startApi();
  const c = client(api);
  const body = { handle: 'TRUBEL' };
  const tries = [
    [{ 'X-Snake': null }, 403, 'csrf'],
    [{ 'X-Snake': '0' }, 403, 'csrf'],
    [{ 'Content-Type': 'text/plain' }, 415, 'json_required'],
    [{ 'Content-Type': 'application/x-www-form-urlencoded' }, 415, 'json_required'],
    [{ Origin: 'https://evil.example' }, 403, 'csrf'],
    [{ Origin: 'null' }, 403, 'csrf'],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 403, 'csrf'],
    [{ 'Sec-Fetch-Site': 'same-site' }, 403, 'csrf'],
    [{ Origin: null, 'Sec-Fetch-Site': null }, 403, 'csrf'],
  ];
  for (const [headers, status, error] of tries) {
    const r = await c.post('/api/player', body, headers);
    assert.equal(r.status, status, JSON.stringify(headers));
    assert.equal(r.body.error, error);
  }
  // Either signal alone is enough when it is right.
  const onlySite = await client(api).post('/api/player', body, { Origin: null });
  assert.equal(onlySite.status, 201);
  const onlyOrigin = await client(api).post('/api/player', body, { 'Sec-Fetch-Site': null });
  assert.equal(onlyOrigin.status, 201);
  assert.equal((await client(api).post('/api/player', body, { 'Content-Type': 'application/json; charset=utf-8' })).status, 201);
  await api.stop();
});

test('bodies, routes and methods: limits and clear errors', async () => {
  const api = await startApi();
  const c = client(api);
  const big = await c.post('/api/player', { handle: 'TRUBEL', pad: 'x'.repeat(5000) });
  assert.equal(big.status, 413);
  assert.equal(big.body.error, 'too_large');
  assert.equal((await c.post('/api/player', '{not json')).body.error, 'bad_json');
  assert.equal((await c.post('/api/player', '[1,2]')).body.error, 'bad_request');
  assert.equal((await c.post('/api/player', 'null')).body.error, 'bad_request');
  const nf = await c.get('/api/nothing');
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error, 'not_found');
  const m = await c.call('DELETE', '/api/player');
  assert.equal(m.status, 405);
  assert.equal(m.headers.allow, 'GET, POST, PATCH');
  const h = await c.get('/api/health');
  assert.equal(h.status, 200);
  assert.deepEqual(h.body, { ok: true, ruleset: '1' });
  assert.equal(h.headers['cache-control'], 'no-store');
  assert.equal(h.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(h.headers['x-content-type-options'], 'nosniff');
  // Paths outside /api/ are not the API's business.
  assert.equal((await c.get('/index.html')).text, 'static');
  await api.stop();
});

test('rate limits: renames and new players are limited per session and per address, and come back', async () => {
  const clock = fakeClock();
  const api = await startApi({ clock, config: { rates: { renameSession: { burst: 3, perMinute: 2 }, playerCreate: { burst: 2, perMinute: 1 } } } });
  const p = await newPlayer(api, 'TRUBEL');
  for (let i = 0; i < 3; i++) assert.equal((await p.patch('/api/player', { handle: `NAME_${i}` })).status, 200);
  const r = await p.patch('/api/player', { handle: 'NAME_X' });
  assert.equal(r.status, 429);
  assert.equal(r.body.error, 'rate_limited');
  assert.equal(r.headers['retry-after'], '30');
  assert.equal(r.body.retryAfter, 30);
  clock.advance(30000);
  assert.equal((await p.patch('/api/player', { handle: 'NAME_X' })).status, 200);
  // One address: the first player above used one creation, one more is left.
  assert.equal((await client(api).post('/api/player', { handle: 'ANOTHER' })).status, 201);
  assert.equal((await client(api).post('/api/player', { handle: 'THIRD' })).status, 429);
  await api.stop();
});
