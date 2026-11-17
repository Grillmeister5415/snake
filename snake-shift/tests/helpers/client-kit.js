// Test kit for the page's leaderboard modules in Node: a fetch that talks to the real API server
// (server/tests/helpers.js startApi) like a same-origin browser tab with its own cookie jar, a
// scriptable fake API, and fake timers whose time moves only when the test says so.

import { httpCall } from '../../server/tests/helpers.js';

/**
 * A fetch for createApi({ fetch }) against a started API: same-origin headers on mutations and a
 * cookie jar. jar.cookie can be cleared to play a browser that lost its session cookie.
 */
export function browserFetch(api) {
  const jar = { cookie: null, calls: [] };
  async function fetchFn(path, init = {}) {
    const method = init.method || 'GET';
    const headers = { ...(init.headers || {}) };
    if (method !== 'GET') { headers.Origin = api.base; headers['Sec-Fetch-Site'] = 'same-origin'; }
    if (jar.cookie) headers.Cookie = jar.cookie;
    jar.calls.push(`${method} ${path}`);
    const res = await httpCall(api.port, method, path, headers, init.body);
    const set = res.headers['set-cookie'];
    if (set && set.length) jar.cookie = set[0].split(';')[0];
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      headers: { get: (n) => res.headers[n.toLowerCase()] ?? null },
      json: async () => JSON.parse(res.text),
    };
  }
  return { fetch: fetchFn, jar };
}

/** A promise with its resolve and reject outside. */
export function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks run. */
export async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}

/** setTimeout / clearTimeout on a clock that moves only by advance(ms). */
export function fakeTimers(start = 1_000_000) {
  let t = start;
  const queue = [];
  let seq = 0;
  return {
    now: () => t,
    setTimeout(fn, ms = 0) {
      const timer = { at: t + Math.max(0, ms), fn, seq: seq++ };
      queue.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      const i = queue.indexOf(timer);
      if (i >= 0) queue.splice(i, 1);
    },
    get pending() { return queue.length; },
    /** Runs every timer due within `ms`, in order, letting promises settle between them. */
    async advance(ms = 0) {
      const end = t + ms;
      for (;;) {
        await settle();
        queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = queue[0];
        if (!next || next.at > end) break;
        queue.shift();
        t = Math.max(t, next.at);
        next.fn();
      }
      t = end;
      await settle();
    },
  };
}
