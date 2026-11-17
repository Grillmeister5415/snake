// The leaderboard API as the page sees it (LEADERBOARD_PLAN C4): a thin same-origin fetch wrapper.
// The session cookie is HttpOnly and set by the server; this code never sees it. Routes and
// answers are listed in README.md ("Leaderboard API"); server/app.js is the contract.
//
// Every failure is an ApiError whose `kind` tells the caller what to do:
//   'offline'   no usable answer: network error, timeout, or no API at this address
//               (a 404 or a 2xx that is not JSON: a static server answered /api/*)
//   'transient' the server asks to try again: 429, 500, 502, 503, 504 (retryAfterMs when given)
//   'auth'      401: the session is gone
//   'permanent' any other 4xx: the same request will never succeed

export class ApiError extends Error {
  /**
   * @param {'offline'|'transient'|'auth'|'permanent'} kind
   * @param {{ status?: number, code?: string|null, message?: string, retryAfterMs?: number|null, body?: object|null }} [info]
   */
  constructor(kind, { status = 0, code = null, message = '', retryAfterMs = null, body = null } = {}) {
    super(message || code || kind);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.body = body;
  }
}

/** True for failures worth trying again later. */
export const isRetryable = (err) => !!err && (err.kind === 'offline' || err.kind === 'transient');

const TRANSIENT = new Set([429, 500, 502, 503, 504]);

/** Retry-After in ms (seconds or an HTTP date), or null. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return null;
  const s = Number(value);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/**
 * Sorts an HTTP answer into success or an ApiError (pure, for tests).
 * @param {number} status
 * @param {object|null} data the parsed JSON body, or null when it was not JSON
 * @param {number|null} retryAfterMs
 */
export function classify(status, data, retryAfterMs = null) {
  if (status >= 200 && status < 300) {
    if (data && typeof data === 'object') return null;
    return new ApiError('offline', { status, message: 'no API answer' });
  }
  const code = data && typeof data.error === 'string' ? data.error : null;
  const info = { status, code, message: (data && data.message) || '', retryAfterMs, body: data };
  if (!data && (status === 404 || status === 405)) return new ApiError('offline', { ...info, message: 'no API here' });
  if (status === 401) return new ApiError('auth', info);
  if (TRANSIENT.has(status) || status >= 500) return new ApiError('transient', info);
  return new ApiError('permanent', info);
}

/**
 * @param {{ fetch?: typeof fetch, base?: string, timeoutMs?: number, submitTimeoutMs?: number,
 *   enabled?: boolean, timers?: { setTimeout: Function, clearTimeout: Function } }} [opts]
 *   enabled: false makes every call fail as 'offline' without touching the network (?auto)
 */
export function createApi({
  fetch: fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,
  base = '', timeoutMs = 10000, submitTimeoutMs = 25000, enabled = true,
  timers = { setTimeout: (...a) => setTimeout(...a), clearTimeout: (t) => clearTimeout(t) },
} = {}) {
  async function request(method, path, body, ms = timeoutMs) {
    if (!enabled || !fetchFn) throw new ApiError('offline', { message: 'network off' });
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    const timer = timers.setTimeout(() => { timedOut = true; if (ctrl) ctrl.abort(); }, ms);
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-Snake'] = '1'; // the server's CSRF check (with the same Origin)
    try {
      let res;
      try {
        res = await fetchFn(base + path, {
          method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctrl ? ctrl.signal : undefined,
        });
      } catch {
        throw new ApiError('offline', { message: timedOut ? 'timeout' : 'network' });
      }
      const type = (res.headers && res.headers.get('content-type')) || '';
      let data = null;
      if (type.includes('application/json')) {
        try { data = await res.json(); } catch { data = null; }
      }
      if (timedOut) throw new ApiError('offline', { message: 'timeout' });
      const err = classify(res.status, data, parseRetryAfter(res.headers && res.headers.get('retry-after')));
      if (err) throw err;
      return data;
    } finally {
      timers.clearTimeout(timer);
    }
  }

  return {
    request,
    get enabled() { return enabled; },
    /** 201 { id, handle, created: true }, or 200 { ..., created: false } with an existing session. */
    createPlayer: (handle) => request('POST', '/api/player', { handle }),
    getPlayer: () => request('GET', '/api/player'),
    renamePlayer: (handle) => request('PATCH', '/api/player', { handle }),
    tickets: (ruleset, count) => request('POST', '/api/runs/tickets', { ruleset, count }),
    complete: (runId, replay) => request('POST', `/api/runs/${encodeURIComponent(runId)}/complete`, { replay }, submitTimeoutMs),
    leaderboard: (period) => request('GET', `/api/leaderboard?period=${period === 'week' ? 'week' : 'all-time'}`),
  };
}
