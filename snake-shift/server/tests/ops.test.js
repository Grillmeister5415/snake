// Operations (LEADERBOARD_PLAN A14, A15, C2, C7): data survives a restart, migrations only move
// forward, backup and admin scripts work on a live database, the deployment files keep the API
// private, and client addresses are read only from trusted proxies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApi, newPlayer, tickets, play, submit, fakeClock, tempDir, client } from './helpers.js';
import { openDb, listMigrations, MIGRATIONS_DIR } from '../db.js';
import { clientAddress, addressKey, isTrustedProxy, createRateLimiter } from '../ratelimit.js';
import { createVerifyQueue, BusyError } from '../verify-queue.js';

const SERVER = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const node = (script, args, env = {}) => spawnSync(process.execPath, [join(SERVER, script), ...args], {
  encoding: 'utf8', env: { ...process.env, ...env, NODE_NO_WARNINGS: '1' },
});

test('data survives an API restart: the session, the player, the board and idempotent retries', async () => {
  const dir = tempDir();
  const dbPath = join(dir, 'snake.sqlite');
  const clock = fakeClock();
  let api = await startApi({ dbPath, clock });
  const p = await newPlayer(api, 'TRUBEL');
  const [t] = await tickets(p);
  const { replay, played } = play(t, clock);
  const first = await submit(p, t.runId, replay);
  assert.equal(first.status, 200);
  await api.stop();

  api = await startApi({ dbPath, clock });
  const again = client(api);
  again.cookie = p.cookie; // the same browser after the restart
  assert.deepEqual((await again.get('/api/player')).body, { id: p.id, handle: 'TRUBEL' });
  const board = (await again.get('/api/leaderboard')).body;
  assert.deepEqual(board.you, { rank: 1, handle: 'TRUBEL', score: played.score });
  const retry = await submit(again, t.runId, replay);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.receivedAt, first.body.receivedAt);
  await api.stop();
});

test('migrations: applied once at start in order, in a transaction; a newer database is refused', () => {
  const list = listMigrations();
  assert.deepEqual(list.map((m) => m.version), list.map((_, i) => i + 1));
  const db = openDb(':memory:');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, list.length);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  db.close();

  const dir = tempDir();
  const mig = join(dir, 'migrations');
  mkdirSync(mig);
  writeFileSync(join(mig, '001_init.sql'), readFileSync(join(MIGRATIONS_DIR, '001_init.sql')));
  const file = join(dir, 'm.sqlite');
  openDb(file, { migrationsDir: mig }).close();
  // A second migration that fails halfway: nothing of it stays, the version does not move.
  writeFileSync(join(mig, '002_more.sql'), 'CREATE TABLE extra (a INTEGER); INSERT INTO no_such_table VALUES (1);');
  assert.throws(() => openDb(file, { migrationsDir: mig }), /no such table/);
  let raw = openDb(file, { migrationsDir: MIGRATIONS_DIR });
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'extra'").get().n, 0);
  raw.close();
  writeFileSync(join(mig, '002_more.sql'), 'CREATE TABLE extra (a INTEGER);');
  raw = openDb(file, { migrationsDir: mig });
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 2);
  raw.close();
  // This code knows one migration; the file is at two now.
  assert.throws(() => openDb(file), /newer than this code knows/);
  assert.throws(() => openDb(file, { migrate: false }), /schema 2, this code expects 1/);
  // Numbering must be continuous.
  writeFileSync(join(mig, '004_gap.sql'), 'SELECT 1;');
  assert.throws(() => listMigrations(mig), /numbered/);
});

test('backup and admin scripts work on the live development database', async () => {
  const dir = tempDir();
  const dbPath = join(dir, 'dev.sqlite');
  const clock = fakeClock();
  const api = await startApi({ dbPath, clock });
  const p = await newPlayer(api, 'TRUBEL');
  const [t] = await tickets(p);
  const { replay } = play(t, clock);
  assert.equal((await submit(p, t.runId, replay)).status, 200);

  // Backup while the API holds the database open.
  const target = join(dir, 'backups', 'one.sqlite');
  let r = node('backup.mjs', [target, '--db', dbPath]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /schema 1, players 1, runs 1, tickets 0, integrity ok/);
  const copy = openDb(target, { migrate: false });
  assert.equal(copy.prepare('SELECT handle FROM players').get().handle, 'TRUBEL');
  copy.close();
  r = node('backup.mjs', [target, '--db', dbPath]);
  assert.equal(r.status, 1, 'no silent overwrite');
  assert.match(r.stderr, /--force/);
  assert.equal(node('backup.mjs', [target, '--force'], { SNAKE_DB: dbPath }).status, 0);

  // Admin: list, rename (same rules), hide, unhide.
  r = node('admin.mjs', ['--db', dbPath, 'list']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`${p.id}  TRUBEL\\s+no\\s+\\d+\\s+1`));
  r = node('admin.mjs', ['rename', p.id, 'sh1t_head'], { SNAKE_DB: dbPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /blocked/);
  r = node('admin.mjs', ['rename', p.id, 'clean_name'], { SNAKE_DB: dbPath });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /TRUBEL -> CLEAN_NAME/);
  assert.equal((await p.get('/api/leaderboard')).body.you.handle, 'CLEAN_NAME');
  assert.equal(node('admin.mjs', ['hide', p.id], { SNAKE_DB: dbPath }).status, 0);
  assert.deepEqual((await client(api).get('/api/leaderboard')).body.entries, []);
  assert.equal(node('admin.mjs', ['unhide', p.id], { SNAKE_DB: dbPath }).status, 0);
  assert.equal((await client(api).get('/api/leaderboard')).body.entries.length, 1);
  r = node('admin.mjs', ['hide', 'AAAAAAAAAAAAAAAAAAAAAA'], { SNAKE_DB: dbPath });
  assert.equal(r.status, 1);
  assert.equal(node('admin.mjs', ['nonsense'], { SNAKE_DB: dbPath }).status, 2);
  await api.stop();
});

test('deployment files: the API is private, pinned, unprivileged and limited; Caddy keeps its route and headers', () => {
  const compose = readFileSync(join(REPO, 'deploy/compose.yaml'), 'utf8');
  // The block of one service: from its name to the next line at the same indentation.
  const block = (name) => {
    const m = new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n)+)`, 'm').exec(compose);
    assert.ok(m, `service ${name}`);
    return m[1].split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  };
  const apiSvc = block('snake-api');
  assert.match(apiSvc, /^    image: node:\d+\.\d+\.\d+-alpine$/m, 'an exact Node version');
  assert.match(apiSvc, /^    user: '1000:1000'$/m);
  assert.match(apiSvc, /^    read_only: true$/m);
  assert.match(apiSvc, /^    cap_drop: \[ALL\]$/m);
  assert.doesNotMatch(apiSvc, /cap_add/);
  assert.match(apiSvc, /no-new-privileges:true/);
  assert.match(apiSvc, /^    mem_limit: /m);
  assert.match(apiSvc, /^    pids_limit: /m);
  assert.match(apiSvc, /\/api\/health/);
  assert.match(apiSvc, /^    networks:\n      - snake-internal\n/m, 'only the private network');
  assert.doesNotMatch(apiSvc, /caddy-edge/);
  assert.doesNotMatch(apiSvc, /^    ports:/m, 'no published port');
  assert.match(apiSvc, /- snake-api-data:\/data$/m);
  assert.match(apiSvc, /- \.\/api:\/srv\/api:ro$/m);
  assert.match(apiSvc, /SNAKE_ORIGIN: https:\/\/snake\.online-tichu\.com/);
  const web = block('snake');
  assert.match(web, /^    container_name: snake$/m, 'the name Tichu\'s Caddy uses');
  assert.match(web, /^    networks:\n      - caddy-edge\n      - snake-internal\n/m);
  assert.match(web, /'127\.0\.0\.1:8791:8080'/);
  assert.doesNotMatch(compose, /aliases/, 'no network alias on caddy-edge');
  assert.match(compose, /^  caddy-edge:\n    external: true$/m);
  assert.match(compose, /^  snake-internal:\n    internal: true$/m);
  assert.match(compose, /^  snake-api-data:\n    external: true$/m);

  const caddy = readFileSync(join(REPO, 'deploy/Caddyfile'), 'utf8');
  assert.match(caddy, /^:8080 \{$/m);
  assert.ok(caddy.includes(`Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'"`), 'the CSP is unchanged');
  for (const h of ['Strict-Transport-Security "max-age=15552000"', 'X-Content-Type-Options "nosniff"', 'Referrer-Policy "no-referrer"', '-Server']) {
    assert.ok(caddy.includes(h), h);
  }
  assert.match(caddy, /handle \/api\/\* \{[\s\S]*?max_size \d+KB[\s\S]*?reverse_proxy snake-api:8090[\s\S]*?\n\t\}/);
  assert.match(caddy, /header \?Cache-Control "no-store"/, 'API answers keep their own Cache-Control');
  assert.equal(caddy.match(/Cache-Control "no-cache"/g).length, 1, 'no-cache only for the files');
  assert.match(caddy, /handle \{[\s\S]*root \* \/srv\/current[\s\S]*header Cache-Control "no-cache"[\s\S]*file_server/);
  assert.match(caddy, /trusted_proxies static private_ranges/);

  const deploy = readFileSync(join(REPO, 'deploy/deploy.sh'), 'utf8');
  assert.match(deploy, /--exclude=\/server\/tests\//, 'tests are not shipped');
  assert.match(deploy, /"\$GAME\/server" "\$GAME\/src" "\$GAME\/package.json" "\$HOST:snake\/api\/releases\/\$REL\/"/);
  const commands = deploy.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(commands, /docker network (create|rm)/, 'never creates or removes a network');
  assert.doesNotMatch(commands, /\/opt\/tichu|unser-jahr/, 'never touches the other projects (outside comments)');
});

test('client addresses: X-Forwarded-For only through trusted private proxies, read from the right', () => {
  const req = (remote, xff) => ({ socket: { remoteAddress: remote }, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } });
  // Straight from the internet: the header is the visitor's own words and is ignored.
  assert.equal(clientAddress(req('203.0.113.5', '1.2.3.4')), '203.0.113.5');
  // Through Tichu's Caddy (on caddy-edge) and Snake's Caddy (on snake-internal).
  assert.equal(clientAddress(req('172.18.0.3', '198.51.100.7, 172.20.0.2')), '198.51.100.7');
  assert.equal(clientAddress(req('::ffff:172.18.0.3', 'spoofed, 6.6.6.6, 198.51.100.7, 172.20.0.2')), '198.51.100.7', 'only the hop a trusted proxy saw');
  assert.equal(clientAddress(req('172.18.0.3', '2001:db8::1, 172.20.0.2')), '2001:db8::1');
  assert.equal(clientAddress(req('172.18.0.3', 'garbage, 172.20.0.2')), '172.20.0.2');
  assert.equal(clientAddress(req('127.0.0.1')), '127.0.0.1', 'development');
  assert.equal(clientAddress(req('10.0.0.9', '10.0.0.5, 172.20.0.2')), '10.0.0.5', 'a LAN phone in development');
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.20', '::1', 'fd12:3456::1', '::ffff:192.168.0.2']) {
    assert.equal(isTrustedProxy(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '203.0.113.5', '2001:db8::1', 'fe80::1', '', 'nonsense']) {
    assert.equal(isTrustedProxy(ip), false, ip);
  }
  assert.equal(addressKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64', 'IPv6 by its /64');
  assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(addressKey('::ffff:1.2.3.4'), '1.2.3.4');
});

test('rate limiter: takes from every bucket or from none; a clock step back drains nothing', () => {
  const clock = fakeClock(0);
  const rl = createRateLimiter({ clock, rules: { a: { burst: 2, perMinute: 60 }, b: { burst: 5, perMinute: 60 } } });
  assert.equal(rl.take([['a', 'x'], ['b', 'y']]).ok, true);
  assert.equal(rl.take([['a', 'x'], ['b', 'y']]).ok, true);
  const no = rl.take([['a', 'x'], ['b', 'y']]);
  assert.deepEqual(no, { ok: false, retryAfter: 1 });
  clock.set(-50000);
  assert.equal(rl.take([['b', 'y']]).ok, true, 'b had 3 left, and the step back took none');
  clock.set(1000);
  assert.equal(rl.take([['a', 'x']]).ok, true);
  clock.set(120000);
  rl.prune();
  assert.equal(rl.size, 0, 'full buckets are forgotten');
});

test('verify queue: bounded, busy when full, closes cleanly', async () => {
  const gate = [];
  const q = createVerifyQueue({
    concurrency: 1, maxQueued: 1, sliceTicks: 1, pause: (fn) => gate.push(fn),
    verifier: () => { let n = 0; return { run: () => (++n >= 3 ? { ok: true, n } : null) }; },
  });
  const a = q.run({});
  const b = q.run({});
  await assert.rejects(q.run({}), BusyError);
  assert.deepEqual([q.active, q.queued], [1, 1]);
  const closing = q.close(1000);
  await assert.rejects(q.run({}), /shutting down/);
  while (gate.length) gate.shift()();
  assert.deepEqual(await a, { ok: true, n: 3 });
  assert.deepEqual(await b, { ok: true, n: 3 });
  await closing;
  // A verifier that throws rejects only its own job.
  const q2 = createVerifyQueue({ verifier: () => { throw new Error('boom'); } });
  await assert.rejects(q2.run({}), /boom/);
  assert.equal(q2.active, 0);
});

test('development: serve.mjs answers the API and files from one process, and --no-api only files', async () => {
  // A temporary database instead of the developer's .data/dev.sqlite.
  const dbFile = join(tempDir(), 'dev.sqlite');
  let port = 0;
  const { spawn } = await import('node:child_process');
  const game = fileURLToPath(new URL('../../', import.meta.url));
  const start = (args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(game, 'serve.mjs'), String(port), ...args], { env: { ...process.env, NODE_NO_WARNINGS: '1', SNAKE_DB: dbFile } });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('SNAKE//SHIFT is on')) resolve(child);
      if (out.includes('already in use')) resolve(null);
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error(`serve.mjs did not start: ${out}`)), 10000).unref();
  });
  // serve.mjs takes no port 0, so try a few random ones.
  const run = async (args) => {
    for (let i = 0; i < 5; i++) {
      if (!port || i) port = 43000 + Math.floor(Math.random() * 2000);
      const child = await start(args);
      if (child) return child;
    }
    throw new Error('no free port found');
  };
  const get = async (path) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
  };
  let child = await run([]);
  try {
    const h = await get('/api/health');
    assert.deepEqual([h.status, JSON.parse(h.text).ok], [200, true]);
    assert.equal((await get('/index.html')).status, 200);
    assert.equal((await get('/.data/dev.sqlite')).status, 404, 'the database is never served');
  } finally {
    child.kill('SIGINT');
  }
  await new Promise((r) => child.on('exit', r));
  child = await run(['--no-api']);
  try {
    const h = await get('/api/health');
    assert.equal(h.status, 404, 'files only');
    assert.equal(h.type, 'text/plain');
  } finally {
    child.kill('SIGINT');
  }
  await new Promise((r) => child.on('exit', r));
  assert.ok(existsSync(dbFile), 'the database the API used');
});
