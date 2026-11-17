// Development only: fills a running development server's board with fixture players, through the
// real API, so the leaderboard can be looked at with ten-plus real rows. Never point it at the
// live site. Each player gets its own session, one ticket and one real autopilot run that ends
// near a chosen score; the runs are verified by the server like any other.
//
//   node serve.mjs 4787                         (in another terminal; development database)
//   node dev/seed-board.mjs http://localhost:4787
//
// It waits until the longest run could have been played (the server's plausibility check), so it
// takes about as long as that run: a minute or two.

import { createSim } from '../src/sim.js';
import { createAutopilot } from '../src/autopilot.js';
import { createRecorder, verifyReplay } from '../src/replay.js';
import { RANKED_UNIVERSES, RANKED_SPEED, RULESET } from '../src/ruleset.js';

const base = (process.argv[2] || 'http://localhost:4321').replace(/\/$/, '');
const host = new URL(base).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error('seed-board: development servers only (localhost).');
  process.exit(2);
}

// Fixture handles and the score each run stops near. Two are the full 12 characters.
const FIXTURES = [
  ['ACID_GRANNY', 61], ['DOT_GOBLIN', 54], ['N0_FUTURE', 47], ['DISCO_WORM', 41], ['PIXEL_WIZARD', 36],
  ['LCD_LORD', 30], ['BYTE_VIPER', 26], ['NEON_MOTH', 21], ['VOID_PILOT', 17], ['LASER_BANDIT', 12],
  ['GHOST_LOOP', 8], ['CRT_RONIN', 5],
];

function client() {
  let cookie = null;
  return async (method, path, body) => {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') { headers['X-Snake'] = '1'; headers.Origin = base; }
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
    return data;
  };
}

/** An autopilot run on this seed that stops steering once it reaches `target`, then crashes. */
function playTo(seed, target) {
  const sim = createSim({ universes: RANKED_UNIVERSES, speed: RANKED_SPEED, seed: 1 });
  sim.reset(seed);
  const rec = createRecorder(sim);
  const ap = createAutopilot(sim);
  let died = null;
  sim.on('died', (e) => { died = e; });
  sim.queueTurn('up');
  sim.setPaused(false);
  for (let i = 0; i < 200000 && !died; i++) {
    const s = sim.snapshot();
    // The cube has no walls, so the autopilot keeps going there until the run moves on.
    if (s.score < target || s.space.kind === 'cube') ap.update();
    else if (s.space.kind === 'lane' && (s.heading || s.dir) === 'up') sim.queueTurn('left');
    sim.step();
  }
  return { replay: rec.snapshot(), score: died ? died.score : null };
}

const runs = [];
for (const [handle, target] of FIXTURES) {
  const call = client();
  const p = await call('POST', '/api/player', { handle });
  const { tickets } = await call('POST', '/api/runs/tickets', { ruleset: RULESET, count: 1 });
  const t = tickets[0];
  const { replay, score } = playTo(t.seed, target);
  const v = verifyReplay({ seed: t.seed, replay });
  if (!v.ok) throw new Error(`${handle}: replay does not verify (${v.error})`);
  runs.push({ call, handle, id: p.id, runId: t.runId, replay, score, activeMs: v.activeMs, issued: Date.now() });
  console.log(`${handle.padEnd(12)} score ${String(score).padStart(3)}, moving time ${(v.activeMs / 1000).toFixed(1)} s`);
}

const wait = Math.max(...runs.map((r) => r.activeMs + 1500 - (Date.now() - r.issued)));
if (wait > 0) {
  console.log(`waiting ${(wait / 1000).toFixed(0)} s, as long as the longest run would take to play...`);
  await new Promise((r) => setTimeout(r, wait));
}
for (const r of runs) {
  const a = await r.call('POST', `/api/runs/${r.runId}/complete`, { replay: r.replay });
  console.log(`${r.handle.padEnd(12)} saved: score ${a.score}, rank ${a.rank.allTime}`);
}
const board = await client()('GET', '/api/leaderboard?period=all-time');
console.log(`\nboard: ${board.entries.map((e) => `${e.rank}. ${e.handle} ${e.score}`).join(', ')}`);
