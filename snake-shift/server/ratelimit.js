// Rate limits (LEADERBOARD_PLAN A13, Part B 15): token buckets in memory, per session and per client
// address. They allow a quick burst (die, retry, die again) and refill steadily. A restart forgets
// them, which is fine for limits this size.
//
// The client address: requests come through two proxies (Tichu's Caddy, then Snake's), and each
// adds the address it saw to X-Forwarded-For. The header is read only when the direct peer is a
// trusted proxy (a private or loopback address), and then from the right, skipping trusted hops,
// so a value the browser made up is never believed. Addresses are never stored or logged.

import { isIP } from 'node:net';

/** Expands an IPv6 address to its eight groups, or returns null. */
function v6Groups(ip) {
  const [head, tail] = ip.split('::');
  if (ip.split('::').length > 2) return null;
  const a = head ? head.split(':') : [];
  const b = tail !== undefined && tail ? tail.split(':') : [];
  // An IPv4 tail (::ffff:1.2.3.4) counts as two groups.
  const fix = (parts) => parts.flatMap((p) => (p.includes('.') ? ['0', '0'] : [p]));
  const A = fix(a), B = fix(b);
  const fill = tail !== undefined ? 8 - A.length - B.length : 0;
  if (fill < 0) return null;
  const groups = [...A, ...Array(fill).fill('0'), ...B].map((g) => parseInt(g || '0', 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

/** Plain form of an address: IPv4-mapped IPv6 becomes IPv4, IPv6 lower case. */
export function normaliseIp(raw) {
  let ip = String(raw || '').trim();
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return ip.toLowerCase();
}

/** True for loopback and private ranges: the only peers whose X-Forwarded-For is read. */
export function isTrustedProxy(raw) {
  const ip = normaliseIp(raw);
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (v === 6) {
    const g = v6Groups(ip);
    if (!g) return false;
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    return (g[0] & 0xfe00) === 0xfc00; // fc00::/7, unique local
  }
  return false;
}

/**
 * The client's address as the rate limiter should see it.
 * @param {import('node:http').IncomingMessage} req
 */
export function clientAddress(req) {
  let addr = normaliseIp(req.socket && req.socket.remoteAddress);
  if (!isTrustedProxy(addr)) return addr;
  const xff = req.headers['x-forwarded-for'];
  if (!xff) return addr;
  const hops = String(xff).split(',').map(normaliseIp);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i];
    if (!isIP(hop)) return addr; // garbage: keep the last address a trusted proxy vouched for
    addr = hop;
    if (!isTrustedProxy(hop)) return hop;
  }
  return addr;
}

/** The rate-limit key for an address: IPv6 by its /64 network, which one household usually holds. */
export function addressKey(raw) {
  const ip = normaliseIp(raw);
  if (isIP(ip) === 6) {
    const g = v6Groups(ip);
    if (g) return g.slice(0, 4).map((x) => x.toString(16)).join(':') + '::/64';
  }
  return ip || 'unknown';
}

/**
 * Token buckets. `rules` is { [name]: { burst, perMinute } }.
 *   take([[rule, key], ...]) -> { ok, retryAfter } takes one token from every bucket, or none at all
 *     when one of them is empty; retryAfter is in whole seconds.
 *   prune() forgets buckets that are full again.
 * @param {{ clock: { now: () => number }, rules: Record<string, { burst: number, perMinute: number }>, maxKeys?: number }} opts
 */
export function createRateLimiter({ clock, rules, maxKeys = 50000 }) {
  const buckets = new Map();

  function bucket(rule, key, now) {
    const r = rules[rule];
    if (!r) throw new Error(`[ratelimit] unknown rule ${rule}`);
    const k = `${rule}|${key}`;
    let b = buckets.get(k);
    if (!b) {
      if (buckets.size >= maxKeys) prune(true);
      b = { tokens: r.burst, at: now, rule };
      buckets.set(k, b);
    } else {
      // A clock that steps back (NTP) must not drain the bucket.
      b.tokens = Math.min(r.burst, b.tokens + (Math.max(0, now - b.at) * r.perMinute) / 60000);
      b.at = Math.max(b.at, now);
    }
    return b;
  }

  function take(pairs) {
    const now = clock.now();
    const list = pairs.map(([rule, key]) => bucket(rule, key, now));
    let wait = 0;
    for (const b of list) {
      if (b.tokens < 1) wait = Math.max(wait, ((1 - b.tokens) * 60000) / rules[b.rule].perMinute);
    }
    if (wait > 0) return { ok: false, retryAfter: Math.max(1, Math.ceil(wait / 1000)) };
    for (const b of list) b.tokens -= 1;
    return { ok: true, retryAfter: 0 };
  }

  function prune(hard = false) {
    const now = clock.now();
    for (const [k, b] of buckets) {
      const r = rules[b.rule];
      if (b.tokens + (Math.max(0, now - b.at) * r.perMinute) / 60000 >= r.burst) buckets.delete(k);
    }
    // Still too many (a flood of addresses): start over rather than grow without bound.
    if (hard && buckets.size >= maxKeys) buckets.clear();
  }

  return { take, prune, get size() { return buckets.size; } };
}
