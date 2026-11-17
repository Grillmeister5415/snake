// The page's identity (LEADERBOARD_PLAN A3, A15): the client modules talking to the real API
// server over HTTP, with a cookie jar per "browser" and storage that works, fails, or is wiped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, play } from '../server/tests/helpers.js';
import { createApi } from '../src/api.js';
import { createIdentity, IDENTITY_KEY } from '../src/identity.js';
import { memoryStorage } from '../src/store.js';
import { browserFetch } from './helpers/client-kit.js';

/** One browser tab: its fetch (with a cookie jar), its storage, its api and identity. */
function tab(api, { storage = memoryStorage(), jar = null } = {}) {
  const bf = browserFetch(api);
  if (jar) bf.jar.cookie = jar.cookie;
  const bodies = [];
  const fetch = (path, init) => { if (init && init.body) bodies.push(JSON.parse(init.body)); return bf.fetch(path, init); };
  const client = createApi({ fetch });
  const identity = createIdentity({ api: client, storage });
  return { client, identity, storage, jar: bf.jar, calls: bf.jar.calls, bodies };
}

test('first time: no username, then one chosen; the player is created in the background and remembered', async () => {
  const api = await startApi();
  const t = tab(api);
  assert.equal(t.identity.needsUsername(), true);
  assert.deepEqual(t.identity.setHandle('  trubel '), { ok: true, handle: 'TRUBEL' });
  assert.equal(t.identity.needsUsername(), false);
  assert.equal(t.identity.get().playerId, null, 'saved locally at once, before any answer');
  assert.equal(t.calls.length, 0, 'setHandle itself sends nothing');
  const p = await t.identity.ensure();
  assert.equal(p.handle, 'TRUBEL');
  const id = t.identity.get();
  assert.equal(id.playerId, p.id);
  assert.equal(id.confirmed, true);
  assert.equal(id.persistent, true);
  assert.deepEqual(t.calls, ['POST /api/player']);
  const stored = JSON.parse(t.storage.getItem(IDENTITY_KEY));
  assert.deepEqual([stored.v, stored.handle, stored.playerId, stored.skipped], [1, 'TRUBEL', p.id, false]);
  assert.ok(t.bodies.every((b) => !('id' in b) && !('playerId' in b)), 'a player ID is never sent as ownership');
  // Invalid names never leave the page.
  for (const [raw, reason] of [['', 'empty'], ['ab', 'too_short'], ['abcdefghijklm', 'too_long'], ['no spaces', 'bad_chars'], ['ÄRGER', 'bad_chars']]) {
    assert.deepEqual(t.identity.setHandle(raw), { ok: false, reason }, raw);
  }
  assert.equal(t.identity.get().handle, 'TRUBEL', 'a refused name changes nothing');
  await api.stop();
});

test('returning player: the stored player is checked once (GET), never created again', async () => {
  const api = await startApi();
  const a = tab(api);
  a.identity.setHandle('TRUBEL');
  const first = await a.identity.ensure();
  // A reload: same storage, same cookie.
  const b = tab(api, { storage: a.storage, jar: a.jar });
  assert.equal(b.identity.needsUsername(), false);
  assert.equal(b.identity.get().handle, 'TRUBEL');
  const again = await b.identity.ensure();
  assert.deepEqual(again, first);
  await b.identity.ensure();
  assert.deepEqual(b.calls, ['GET /api/player'], 'checked once per page load');
  await api.stop();
});

test('rename: same player, same records and rank; the server name wins after an admin rename', async () => {
  const api = await startApi();
  const t = tab(api);
  t.identity.setHandle('TRUBEL');
  const p = await t.identity.ensure();
  const { tickets } = await t.client.tickets('1', 1);
  const { replay } = play(tickets[0], api.clock);
  const saved = await t.client.complete(tickets[0].runId, replay);
  assert.equal(saved.rank.allTime, 1);
  t.identity.setHandle('snek');
  assert.equal(t.identity.get().handle, 'SNEK', 'shown at once');
  await t.identity.ensure();
  assert.equal(t.calls.at(-1), 'PATCH /api/player');
  assert.equal(t.identity.get().playerId, p.id, 'same player');
  const board = await t.client.leaderboard('all-time');
  assert.deepEqual(board.entries, [{ rank: 1, handle: 'SNEK', score: saved.score, you: true }]);
  // Renamed elsewhere (the admin script): a reload takes the server's name.
  api.db.prepare('UPDATE players SET handle = ? WHERE id = ?').run('CLEAN_NAME', p.id);
  const r = tab(api, { storage: t.storage, jar: t.jar });
  await r.identity.ensure();
  assert.equal(r.identity.get().handle, 'CLEAN_NAME');
  await api.stop();
});

test('duplicate handles: two browsers with the same name are two players, each with its own YOU', async () => {
  const api = await startApi();
  const a = tab(api);
  const b = tab(api);
  a.identity.setHandle('TRUBEL');
  b.identity.setHandle('TRUBEL');
  const pa = await a.identity.ensure();
  const pb = await b.identity.ensure();
  assert.notEqual(pa.id, pb.id, 'never merged by name');
  for (const [t, other] of [[a, b], [b, a]]) {
    const { tickets } = await t.client.tickets('1', 1);
    const { replay } = play(tickets[0], api.clock, { crashAfter: t === a ? 300 : 900 });
    await t.client.complete(tickets[0].runId, replay);
    assert.ok(other);
  }
  const ba = await a.client.leaderboard('all-time');
  const bb = await b.client.leaderboard('all-time');
  assert.equal(ba.entries.length, 2);
  assert.ok(ba.entries.every((e) => e.handle === 'TRUBEL'));
  assert.equal(ba.entries.filter((e) => e.you).length, 1);
  assert.notDeepEqual(ba.entries.map((e) => e.you), bb.entries.map((e) => e.you), 'each sees YOU on its own row');
  await api.stop();
});

test('a name the server refuses: remembered as a problem, not sent again until it changes', async () => {
  const api = await startApi();
  const t = tab(api);
  assert.equal(t.identity.setHandle('sh1t_head').ok, true, 'the page cannot know the blocklist');
  assert.equal(await t.identity.ensure(), null);
  assert.deepEqual(t.identity.get().problem, { reason: 'blocked', kind: 'create' });
  assert.equal(t.identity.get().playerId, null);
  const n = t.calls.length;
  assert.equal(await t.identity.ensure(), null);
  assert.equal(t.calls.length, n, 'not sent again');
  t.identity.setHandle('CLEAN');
  assert.equal(t.identity.get().problem, null);
  assert.equal((await t.identity.ensure()).handle, 'CLEAN');
  // A refused rename keeps the player and goes back to the name the server has.
  t.identity.setHandle('N4ZI_FAN');
  await t.identity.ensure();
  const id = t.identity.get();
  assert.deepEqual([id.handle, id.problem], ['CLEAN', { reason: 'blocked', kind: 'rename' }]);
  await api.stop();
});

test('blocked storage: the identity lives in memory, play goes on, nothing is promised', async () => {
  const api = await startApi();
  const blocked = memoryStorage({ fail: true });
  const t = tab(api, { storage: blocked });
  assert.equal(t.identity.get().persistent, false);
  assert.equal(t.identity.setHandle('MEMORY').ok, true);
  assert.equal(t.identity.get().handle, 'MEMORY');
  const p = await t.identity.ensure();
  assert.equal(p.handle, 'MEMORY');
  assert.equal(t.identity.get().playerId, p.id);
  // A page with no localStorage at all behaves the same.
  const none = createIdentity({ api: t.client, storage: null });
  none.skip();
  assert.deepEqual([none.get().skipped, none.get().persistent, none.needsUsername()], [true, false, false]);
  await api.stop();
});

test('skip: local runs only, never asked again (also after a reload), no network', async () => {
  const api = await startApi();
  const t = tab(api);
  t.identity.skip();
  assert.equal(t.identity.needsUsername(), false);
  assert.equal(await t.identity.ensure(), null);
  assert.equal(t.calls.length, 0);
  const reload = tab(api, { storage: t.storage });
  assert.equal(reload.identity.needsUsername(), false);
  assert.equal(reload.identity.get().skipped, true);
  // "Set username" later ends the skip.
  reload.identity.setHandle('LATECOMER');
  assert.equal(reload.identity.get().skipped, false);
  assert.equal((await reload.identity.ensure()).handle, 'LATECOMER');
  await api.stop();
});

test('a lost session: a new player is created for the remembered name, never another player taken over', async () => {
  const api = await startApi();
  const t = tab(api);
  t.identity.setHandle('TRUBEL');
  const first = await t.identity.ensure();
  const twin = tab(api);
  twin.identity.setHandle('TRUBEL'); // someone else with the same name
  const other = await twin.identity.ensure();
  // The cookie is gone (cleared, expired); the page reloads with its stored player.
  const changes = [];
  const r = tab(api, { storage: t.storage });
  r.identity.on((e) => changes.push(e));
  const p = await r.identity.ensure();
  assert.deepEqual(r.calls, ['GET /api/player', 'POST /api/player']);
  assert.notEqual(p.id, first.id);
  assert.notEqual(p.id, other.id);
  assert.equal(p.handle, 'TRUBEL');
  assert.ok(changes.some((c) => c.previous === first.id && c.playerId === p.id), 'listeners hear about the new player');
  // During a page's life: a request answered 401 for the current player.
  r.jar.cookie = null;
  r.identity.sessionLost(p.id);
  assert.equal(r.identity.activePlayerId(), null, 'no more ranked runs for that player');
  const p2 = await r.identity.ensure();
  assert.notEqual(p2.id, p.id);
  assert.equal(r.identity.activePlayerId(), p2.id);
  await api.stop();
});

test('storage wiped but the cookie kept: the session player is this browser\'s, adopted and renamed', async () => {
  const api = await startApi();
  const t = tab(api);
  t.identity.setHandle('FIRSTNAME');
  const p = await t.identity.ensure();
  const fresh = tab(api, { jar: t.jar }); // new storage, same cookie
  fresh.identity.setHandle('SECONDNAME');
  const q = await fresh.identity.ensure();
  assert.equal(q.id, p.id, 'the same player');
  assert.equal(q.handle, 'SECONDNAME');
  assert.deepEqual(fresh.calls, ['POST /api/player', 'PATCH /api/player']);
  await api.stop();
});

test('a change while a request is on its way wins over the late answer', async () => {
  const api = await startApi();
  const t = tab(api);
  t.identity.setHandle('FIRST');
  const pending = t.identity.ensure();
  t.identity.setHandle('SECOND');
  await pending;
  await t.identity.ensure();
  assert.equal(t.identity.get().handle, 'SECOND');
  assert.equal((await t.client.getPlayer()).handle, 'SECOND');
  await api.stop();
});

test('offline: nothing changes, the next ensure() tries again', async () => {
  let up = false;
  const api = await startApi();
  const real = browserFetch(api);
  const client = createApi({ fetch: (p, i) => (up ? real.fetch(p, i) : Promise.reject(new TypeError('Failed to fetch'))) });
  const identity = createIdentity({ api: client, storage: memoryStorage() });
  identity.setHandle('PATIENT');
  assert.equal(await identity.ensure(), null);
  assert.equal(identity.get().playerId, null);
  assert.equal(identity.get().problem, null);
  up = true;
  assert.equal((await identity.ensure()).handle, 'PATIENT');
  await api.stop();
});
