// Test helpers: the API on a real HTTP server (127.0.0.1, a free port), a fake clock, and a small
// client with its own cookie jar that sends what a same-origin browser fetch sends.

import { after } from 'node:test';
import { createServer, request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { verifyReplay } from '../../src/replay.js';
import { playLikeBrowser } from '../../tests/helpers/browser-run.js';

export const T0 = Date.parse('2026-11-18T12:00:00.000Z'); // a Wednesday

/** A clock the test moves by hand. */
export function fakeClock(start = T0) {
  let t = start;
  return { now: () => t, set(v) { t = v; }, advance(ms) { t += ms; return t; } };
}

/** A fresh temporary folder for database files. */
export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'snake-api-test-'));
}

/**
 * Starts the API. Options go to createApp; `db` reuses an open database, `dbPath` opens one.
 * Returns { app, db, base, port, logs, stop({ closeDb }) }.
 */
export async function startApi({ db = null, dbPath = ':memory:', clock = fakeClock(), dev = true, origin = null, config = {} } = {}) {
  const database = db || openDb(dbPath);
  const logs = [];
  const app = createApp({
    db: database, clock, dev, origin, log: (level, msg) => logs.push(`${level} ${msg}`), config: { sweepEveryMs: null, ...config },
  });
  const server = createServer(async (req, res) => {
    if (!(await app.handle(req, res))) { res.writeHead(404); res.end('static'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  let stopped = null;
  const api = {
    app, db: database, port, base: `http://127.0.0.1:${port}`, logs, clock,
    /** Idempotent; a failed test's servers are stopped after the file's tests. */
    stop({ closeDb = true } = {}) {
      if (!stopped) {
        stopped = (async () => {
          server.closeAllConnections();
          await new Promise((r) => server.close(r));
          await app.close(200);
          if (closeDb) database.close();
        })();
      }
      return stopped;
    },
  };
  running.add(api);
  return api;
}

const running = new Set();
after(async () => {
  for (const api of running) await api.stop();
});

/** One HTTP request; resolves { status, headers, text, body } (body = parsed JSON or null). */
export function httpCall(port, method, path, headers = {}, payload = undefined) {
  return new Promise((resolve, reject) => {
    const h = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== null && v !== undefined));
    if (payload !== undefined) h['Content-Length'] = Buffer.byteLength(payload);
    // A new connection each time (agent: false). Node's default agent keeps sockets alive, and the
    // server closes an idle one after 5 s; a test that blocks the loop longer (play() under the
    // load of the whole suite) then wrote into a closing socket and got ECONNRESET.
    const req = request({ host: '127.0.0.1', port, method, path, headers: h, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, body });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/**
 * A browser on the site: same-origin headers on mutations and its own cookie.
 * `call(method, path, body, headers)`: headers set to null are left out.
 */
export function client(api, { origin = api.base } = {}) {
  let cookie = null;
  const c = {
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
    async call(method, path, body = undefined, headers = {}) {
      const base = {};
      if (body !== undefined) base['Content-Type'] = 'application/json';
      if (method !== 'GET') { base['X-Snake'] = '1'; base.Origin = origin; base['Sec-Fetch-Site'] = 'same-origin'; }
      if (cookie) base.Cookie = cookie;
      const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
      const res = await httpCall(api.port, method, path, { ...base, ...headers }, payload);
      const set = res.headers['set-cookie'];
      if (set && set.length) cookie = set[0].split(';')[0];
      return res;
    },
    get: (path, headers) => c.call('GET', path, undefined, headers),
    post: (path, body, headers) => c.call('POST', path, body, headers),
    patch: (path, body, headers) => c.call('PATCH', path, body, headers),
  };
  return c;
}

/** A client with a new player. */
export async function newPlayer(api, handle = 'TRUBEL') {
  const c = client(api);
  const r = await c.post('/api/player', { handle });
  if (r.status !== 201) throw new Error(`player not created: ${r.status} ${r.text}`);
  c.id = r.body.id;
  return c;
}

/** Fetches tickets; returns the list. */
export async function tickets(c, count = 1) {
  const r = await c.post('/api/runs/tickets', { ruleset: '1', count });
  if (r.status !== 200) throw new Error(`tickets: ${r.status} ${r.text}`);
  return r.body.tickets;
}

/**
 * Plays a real run on a ticket's seed, like the browser, and moves the clock on by the time the
 * run took (so the plausibility check is met). Returns { replay, played, activeMs }.
 */
export function play(ticket, clock, { crashAfter = 400, waitMs = 2000 } = {}) {
  const { replay, played } = playLikeBrowser({ seed: ticket.seed, crashAfter });
  const { activeMs } = verifyReplay({ seed: ticket.seed, replay });
  if (clock) clock.advance(Math.ceil(activeMs) + waitMs);
  return { replay, played, activeMs };
}

/** Submits a replay for a ticket. */
export function submit(c, runId, replay, extra = {}) {
  return c.post(`/api/runs/${runId}/complete`, { replay, ...extra });
}
