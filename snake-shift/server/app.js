// The HALL OF SHIFTERS API (LEADERBOARD_PLAN C2): router, body limits, CSRF checks, sessions and
// errors. It answers /api/* only; serve.mjs (development) and server.mjs (the container) put it
// behind their own HTTP server. Everything time- or chance-dependent comes in through `clock` and
// `random`, so the tests can move time across a week boundary.
//
// Every answer is JSON. Errors are { error: '<code>', message, ...details } with a fitting status;
// the codes are listed in README.md ("Leaderboard API").

import { createHash, randomBytes } from 'node:crypto';
import { RULESET, RANKED_SPEED } from '../src/ruleset.js';
import { REPLAY_LIMITS, replayError, encodeReplay } from '../src/replay.js';
import { readTx, tx } from './db.js';
import { createPlayers } from './players.js';
import { createTickets, RUN_ID } from './tickets.js';
import { createRuns } from './runs.js';
import { createLeaderboard, ALL_TIME, weekKey, weekBounds } from './leaderboard.js';
import { createVerifyQueue, BusyError } from './verify-queue.js';
import { createRateLimiter, clientAddress, addressKey } from './ratelimit.js';
import { handleProblem } from './blocklist.js';

const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

export const DEFAULTS = Object.freeze({
  ticketTtlMs: 24 * HOUR,       // a ticket can start a run for a day (the offline grace)
  ticketBatchMax: 5,            // tickets per request
  ticketCap: 30,                // unexpired tickets per player; more retire the oldest
  submitSlackMs: 10 * MINUTE,   // after expiry + the run's moving time
  plausibleRatio: 0.98,         // time since issue must be at least 98% of the moving time...
  plausibleSlackMs: 1500,       // ...less 1.5 s, for clocks and rounding
  sessionTtlMs: 365 * DAY,
  sessionRefreshMs: DAY,        // a session seen again after a day is extended and its cookie re-sent
  replayKeepMs: 30 * DAY,
  smallBodyBytes: 2048,         // player and ticket requests
  replayLimits: REPLAY_LIMITS,
  verify: Object.freeze({ concurrency: 2, maxQueued: 16, sliceTicks: 1000 }),
  busyRetryAfterS: 3,
  sweepEveryMs: HOUR,           // null: no timer (tests call sweep() themselves)
  top: 10,
  rates: Object.freeze({        // token buckets: burst, then perMinute
    playerCreate: Object.freeze({ burst: 30, perMinute: 10 }),   // per address
    renameSession: Object.freeze({ burst: 10, perMinute: 2 }),
    renameAddress: Object.freeze({ burst: 30, perMinute: 10 }),
    ticketsSession: Object.freeze({ burst: 20, perMinute: 30 }),
    ticketsAddress: Object.freeze({ burst: 60, perMinute: 120 }),
    submitSession: Object.freeze({ burst: 30, perMinute: 40 }),
    submitAddress: Object.freeze({ burst: 90, perMinute: 120 }),
    boardAddress: Object.freeze({ burst: 60, perMinute: 120 }),
  }),
});

const PERIODS = Object.freeze(['all-time', 'week']);
const iso = (ms) => new Date(ms).toISOString();

class HttpError extends Error {
  constructor(status, error, message, extra = {}, headers = {}) {
    super(message);
    this.status = status;
    this.body = { error, message, ...extra };
    this.headers = headers;
  }
}
const fail = (...args) => new HttpError(...args);

function defaultLog(level, msg) {
  (level === 'error' ? console.error : console.log)(`[api] ${msg}`);
}

/** sha256 of the canonical replay text: the identity of "the same replay". */
export function replayHash(replay) {
  return createHash('sha256').update(encodeReplay(replay)).digest('hex');
}

/**
 * @param {{
 *   db: import('node:sqlite').DatabaseSync,
 *   clock?: { now: () => number },
 *   random?: { bytes: (n: number) => Buffer },
 *   dev?: boolean,        // SNAKE_DEV: cookie `ss_dev` without Secure, for plain http
 *   origin?: string|null, // the site's origin for the CSRF check; default: from the Host header
 *   log?: (level: 'info'|'error', msg: string) => void,
 *   config?: Partial<typeof DEFAULTS>,
 * }} opts
 */
export function createApp({ db, clock = { now: () => Date.now() }, random = { bytes: randomBytes }, dev = false, origin = null, log = defaultLog, config = {} }) {
  const cfg = {
    ...DEFAULTS, ...config,
    verify: { ...DEFAULTS.verify, ...(config.verify || {}) },
    rates: { ...DEFAULTS.rates, ...(config.rates || {}) },
  };
  const limits = cfg.replayLimits;
  const replayBodyBytes = limits.maxBytes + 2048;
  // The longest a run can move: no submission can come later than expiry plus this.
  const maxActiveMs = limits.maxTicks * RANKED_SPEED.startMs;
  const cookieName = dev ? 'ss_dev' : '__Host-ss';

  const players = createPlayers(db, { clock, random, sessionTtlMs: cfg.sessionTtlMs, sessionRefreshMs: cfg.sessionRefreshMs });
  const tickets = createTickets(db, { clock, random, ttlMs: cfg.ticketTtlMs, cap: cfg.ticketCap });
  const leaderboard = createLeaderboard(db, { top: cfg.top });
  const runs = createRuns(db, { clock, leaderboard, tickets });
  const queue = createVerifyQueue(cfg.verify);
  const limiter = createRateLimiter({ clock, rules: cfg.rates });
  const inFlight = new Map(); // runId -> { hash, playerId, promise }: one verification per run at a time
  const pingQ = db.prepare('SELECT 1 AS ok');

  // ------------------------------------------------------------ plumbing

  function send(res, status, body, headers = {}) {
    if (res.headersSent) return;
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end(text);
  }

  function readJson(req, limit) {
    const declared = Number(req.headers['content-length']);
    if (declared > limit) return Promise.reject(fail(413, 'too_large', `request bodies here are at most ${limit} bytes`, { limit }, { Connection: 'close' }));
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0, done = false;
      req.on('data', (c) => {
        if (done) return;
        size += c.length;
        if (size > limit) {
          done = true;
          reject(fail(413, 'too_large', `request bodies here are at most ${limit} bytes`, { limit }, { Connection: 'close' }));
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (done) return;
        done = true;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); } catch {
          reject(fail(400, 'bad_json', 'the body is not valid JSON'));
          return;
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) reject(fail(400, 'bad_request', 'the body must be a JSON object'));
        else resolve(body);
      });
      req.on('error', (err) => { if (!done) { done = true; reject(err); } });
    });
  }

  function expectedOrigin(req) {
    return origin || `${dev ? 'http' : 'https'}://${req.headers.host || ''}`;
  }

  /** Mutations: JSON, the X-Snake header, and a same-origin Origin / Sec-Fetch-Site (Part B, A13). */
  function checkMutation(req) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') throw fail(415, 'json_required', 'send Content-Type: application/json');
    if (req.headers['x-snake'] !== '1') throw fail(403, 'csrf', 'missing X-Snake: 1 header');
    const site = req.headers['sec-fetch-site'];
    const from = req.headers.origin;
    if (!site && !from) throw fail(403, 'csrf', 'missing Origin');
    if (site && site !== 'same-origin') throw fail(403, 'csrf', 'cross-site request');
    if (from && from !== expectedOrigin(req)) throw fail(403, 'csrf', 'cross-origin request');
  }

  function readCookie(req) {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of String(raw).split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === cookieName) return part.slice(i + 1).trim();
    }
    return null;
  }

  function setCookie(res, token) {
    const maxAge = Math.floor(cfg.sessionTtlMs / 1000);
    res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${dev ? '' : '; Secure'}`);
  }

  /** The request's session ({ player, key }) or null; re-sends the cookie when it was extended. */
  function session(req, res) {
    const token = readCookie(req);
    const s = token ? players.fromToken(token) : null;
    if (s && s.refresh) setCookie(res, token);
    return s;
  }

  function needSession(req, res) {
    const s = session(req, res);
    if (!s) throw fail(401, 'no_session', 'no player session; create one with POST /api/player');
    return s;
  }

  function limit(pairs) {
    const r = limiter.take(pairs);
    if (!r.ok) throw fail(429, 'rate_limited', 'too many requests; try again shortly', { retryAfter: r.retryAfter }, { 'Retry-After': String(r.retryAfter) });
  }

  function handleInvalid(reason) {
    const text = {
      empty: 'enter a username', too_short: 'at least 3 characters', too_long: 'at most 12 characters',
      bad_chars: 'only A-Z, 0-9 and _', blocked: 'that username is not allowed',
    }[reason] || 'invalid username';
    return fail(422, 'handle_invalid', text, { reason });
  }

  // ------------------------------------------------------------ routes

  function health(res) {
    try {
      pingQ.get();
      send(res, 200, { ok: true, ruleset: RULESET });
    } catch {
      send(res, 503, { ok: false, error: 'db', message: 'database unavailable' });
    }
  }

  async function createPlayer(req, res, addr) {
    checkMutation(req);
    const body = await readJson(req, cfg.smallBodyBytes);
    const s = session(req, res);
    if (s) return send(res, 200, { id: s.player.id, handle: s.player.handle, created: false });
    limit([['playerCreate', addr]]);
    const problem = handleProblem(body.handle);
    if (problem) throw handleInvalid(problem);
    const { player, token } = tx(db, () => {
      const p = players.create(body.handle);
      return { player: p, token: players.startSession(p.id) };
    });
    setCookie(res, token);
    send(res, 201, { id: player.id, handle: player.handle, created: true });
  }

  function getPlayer(req, res) {
    const s = needSession(req, res);
    send(res, 200, { id: s.player.id, handle: s.player.handle });
  }

  async function renamePlayer(req, res, addr) {
    checkMutation(req);
    const s = needSession(req, res);
    limit([['renameSession', s.key], ['renameAddress', addr]]);
    const body = await readJson(req, cfg.smallBodyBytes);
    const problem = handleProblem(body.handle);
    if (problem) throw handleInvalid(problem);
    const p = players.rename(s.player.id, body.handle);
    send(res, 200, { id: p.id, handle: p.handle });
  }

  async function issueTickets(req, res, addr) {
    checkMutation(req);
    const s = needSession(req, res);
    const body = await readJson(req, cfg.smallBodyBytes);
    if (body.ruleset !== RULESET) throw fail(409, 'ruleset_mismatch', 'this page plays other rules than the server ranks; reload', { ruleset: RULESET });
    const count = body.count === undefined ? 1 : body.count;
    if (!Number.isInteger(count) || count < 1 || count > cfg.ticketBatchMax) {
      throw fail(400, 'bad_request', `count must be a whole number from 1 to ${cfg.ticketBatchMax}`);
    }
    limit([['ticketsSession', s.key], ['ticketsAddress', addr]]);
    const issued = tickets.issue(s.player.id, RULESET, count);
    send(res, 200, {
      ruleset: RULESET,
      now: iso(clock.now()),
      tickets: issued.map((t) => ({ runId: t.runId, seed: t.seed, expiresAt: iso(t.expiresAt) })),
    });
  }

  /** The answer for a stored run, accepted (200) or rejected (422). */
  function runAnswer(res, row, duplicate) {
    if (row.status === 'rejected') {
      throw fail(422, 'replay_rejected', 'the replay does not check out', { reason: row.reject_reason, runId: row.run_id, duplicate });
    }
    const pid = row.player_id;
    const wk = weekKey(row.received_at);
    const body = readTx(db, () => {
      const all = leaderboard.entryOf(ALL_TIME, pid);
      const week = leaderboard.entryOf(wk, pid);
      return {
        runId: row.run_id,
        status: 'accepted',
        duplicate,
        score: row.score,
        tick: row.end_tick,
        reason: row.reason,
        universe: row.universe,
        lives: row.lives,
        receivedAt: iso(row.received_at),
        best: { allTime: runs.isBest(ALL_TIME, pid, row.run_id), week: runs.isBest(wk, pid, row.run_id) },
        rank: { allTime: all ? all.rank : null, week: week ? week.rank : null },
        week: weekBounds(row.received_at),
      };
    });
    send(res, 200, body);
  }

  async function verifyAndStore({ ticket, replay, hash, receivedAt }) {
    let result;
    try {
      result = await queue.run({ seed: ticket.seed, replay, limits });
    } catch (err) {
      if (err instanceof BusyError) {
        const s = cfg.busyRetryAfterS;
        throw fail(503, 'busy', 'the server is busy checking runs; try again shortly', { retryAfter: s }, { 'Retry-After': String(s) });
      }
      throw err;
    }
    if (!result.ok) {
      runs.reject({ ticket, reason: result.error, replayHash: hash, receivedAt });
      return;
    }
    // The browser cannot finish a run faster than the snake moved (A11, plausibility).
    if (receivedAt - ticket.issued_at + cfg.plausibleSlackMs < result.activeMs * cfg.plausibleRatio) {
      runs.reject({ ticket, reason: 'too_fast', replayHash: hash, receivedAt });
      return;
    }
    if (receivedAt > ticket.expires_at + result.activeMs + cfg.submitSlackMs) {
      throw fail(410, 'ticket_expired', 'this run was submitted too late to be ranked');
    }
    runs.accept({ ticket, result, replayText: encodeReplay(replay), replayHash: hash, receivedAt });
  }

  async function completeRun(req, res, addr, runId) {
    const receivedAt = clock.now(); // first receipt, before any waiting
    checkMutation(req);
    const s = needSession(req, res);
    limit([['submitSession', s.key], ['submitAddress', addr]]);
    const body = await readJson(req, replayBodyBytes);
    if (!RUN_ID.test(runId)) throw fail(404, 'ticket_unknown', 'no such ticket');
    // Only the replay is read from the body. A `score` or any other field is ignored.
    const replay = body.replay;
    const shape = replayError(replay, limits);

    const stored = runs.get(runId);
    if (stored) {
      if (stored.player_id !== s.player.id) throw fail(403, 'not_owner', 'this run belongs to another player');
      if (shape || replayHash(replay) !== stored.replay_hash) throw fail(409, 'ticket_spent', 'this ticket was already used for a different replay');
      return runAnswer(res, stored, true);
    }
    if (shape === 'too_long' || shape === 'too_many_turns' || shape === 'too_large') {
      throw fail(413, 'replay_too_large', 'the run is too long to rank', { reason: shape, limits });
    }
    if (shape) throw fail(400, 'replay_malformed', 'the replay is not in the expected format', { reason: shape });
    const hash = replayHash(replay);

    const flight = inFlight.get(runId);
    if (flight) {
      if (flight.playerId !== s.player.id) throw fail(403, 'not_owner', 'this run belongs to another player');
      if (flight.hash !== hash) throw fail(409, 'ticket_spent', 'this ticket is already being used for a different replay');
      await flight.promise;
      return runAnswer(res, runs.get(runId), true);
    }

    const ticket = tickets.get(runId);
    if (!ticket) throw fail(404, 'ticket_unknown', 'no such ticket (never issued, retired, or expired long ago)');
    if (ticket.player_id !== s.player.id) throw fail(403, 'not_owner', 'this run belongs to another player');
    if (ticket.ruleset !== RULESET) throw fail(410, 'ruleset_retired', 'this run used rules the server no longer ranks', { ruleset: RULESET });
    if (receivedAt > ticket.expires_at + maxActiveMs + cfg.submitSlackMs) throw fail(410, 'ticket_expired', 'this run was submitted too late to be ranked');

    const promise = verifyAndStore({ ticket, replay, hash, receivedAt });
    inFlight.set(runId, { hash, playerId: s.player.id, promise });
    try {
      await promise;
    } finally {
      inFlight.delete(runId);
    }
    runAnswer(res, runs.get(runId), false);
  }

  function board(req, res, addr, url) {
    const period = url.searchParams.get('period') || 'all-time';
    if (!PERIODS.includes(period)) throw fail(400, 'bad_period', 'period is all-time or week');
    limit([['boardAddress', addr]]);
    const s = session(req, res);
    const now = clock.now();
    const key = period === 'week' ? weekKey(now) : ALL_TIME;
    const bounds = period === 'week' ? weekBounds(now) : { from: null, to: null };
    const data = readTx(db, () => leaderboard.board(key, s ? s.player.id : null));
    // The own row and rival are per player, so no shared cache may keep this answer.
    send(res, 200, { period, ...bounds, generatedAt: iso(now), ...data }, { 'Cache-Control': 'private, no-store' });
  }

  // ------------------------------------------------------------ router

  const COMPLETE = /^\/api\/runs\/([^/]{1,64})\/complete$/;

  async function route(req, res, url) {
    const path = url.pathname;
    const m = req.method;
    const addr = addressKey(clientAddress(req));
    const allow = (methods) => {
      if (!methods.includes(m)) throw fail(405, 'method_not_allowed', `use ${methods.join(' or ')}`, {}, { Allow: methods.join(', ') });
    };
    if (path === '/api/health') {
      allow(['GET']);
      return health(res);
    }
    if (path === '/api/player') {
      allow(['GET', 'POST', 'PATCH']);
      if (m === 'GET') return getPlayer(req, res);
      if (m === 'POST') return createPlayer(req, res, addr);
      return renamePlayer(req, res, addr);
    }
    if (path === '/api/runs/tickets') {
      allow(['POST']);
      return issueTickets(req, res, addr);
    }
    const c = COMPLETE.exec(path);
    if (c) {
      allow(['POST']);
      return completeRun(req, res, addr, c[1]);
    }
    if (path === '/api/leaderboard') {
      allow(['GET']);
      return board(req, res, addr, url);
    }
    throw fail(404, 'not_found', 'no such API route');
  }

  /**
   * Answers a request when its path starts with /api/. Resolves true when it did, false otherwise
   * (the caller then serves its own files).
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://local'); } catch { return false; }
    if (!url.pathname.startsWith('/api/')) return false;
    const t0 = performance.now();
    const shown = url.pathname.replace(COMPLETE, '/api/runs/:id/complete');
    try {
      await route(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, err.body, err.headers);
        if (err.headers.Connection === 'close') res.on('finish', () => req.destroy());
      } else {
        log('error', `${req.method} ${shown} failed: ${err && err.stack ? err.stack : err}`);
        send(res, 500, { error: 'internal', message: 'something went wrong on the server' });
      }
    }
    // Never the query string's secrets, the cookie or the address: there are none to log here.
    log('info', `${req.method} ${shown} ${res.statusCode} ${Math.round(performance.now() - t0)}ms`);
    return true;
  }

  // ------------------------------------------------------------ upkeep

  /** Retention and expiry (C2): old tickets and sessions, old replays, idle rate-limit buckets. */
  function sweep() {
    const now = clock.now();
    const out = {
      tickets: tickets.sweep(maxActiveMs + cfg.submitSlackMs, now),
      sessions: players.sweep(now),
      ...runs.sweep(cfg.replayKeepMs, now),
    };
    limiter.prune();
    return out;
  }

  let timer = null;
  if (cfg.sweepEveryMs) {
    timer = setInterval(() => {
      try { sweep(); } catch (err) { log('error', `sweep failed: ${err && err.stack ? err.stack : err}`); }
    }, cfg.sweepEveryMs);
    timer.unref();
  }

  /** Stops the timer and lets running verifications finish (at most `timeoutMs`). Leaves the db open. */
  async function close(timeoutMs = 10000) {
    if (timer) clearInterval(timer);
    timer = null;
    await queue.close(timeoutMs);
  }

  return { handle, sweep, close, queue, cookieName, config: cfg };
}
