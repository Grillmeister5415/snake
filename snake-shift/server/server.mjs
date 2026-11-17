// The API on its own, as the container `snake-api` runs it (deploy/compose.yaml). It serves /api/*
// and nothing else; the game's files come from Snake's Caddy, which passes /api/* on to this.
//
//   SNAKE_DB      database file (default /data/snake.sqlite)
//   SNAKE_PORT    port (default 8090)
//   SNAKE_HOST    address to listen on (default 0.0.0.0, inside the container's private network)
//   SNAKE_ORIGIN  the site's origin for the CSRF check, e.g. https://snake.online-tichu.com
//                 (required unless SNAKE_DEV=1)
//   SNAKE_DEV=1   development: cookie `ss_dev` without Secure, so plain http works
//
// On SIGTERM (docker stop) it stops taking requests, lets running checks finish for up to ten
// seconds and closes the database cleanly.

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const env = process.env;
const dev = env.SNAKE_DEV === '1';
const dbPath = env.SNAKE_DB || '/data/snake.sqlite';
const port = Number(env.SNAKE_PORT) || 8090;
const host = env.SNAKE_HOST || '0.0.0.0';
const origin = env.SNAKE_ORIGIN || null;

if (!dev && !origin) {
  console.error('[api] SNAKE_ORIGIN is not set (for example https://snake.online-tichu.com); refusing to start');
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const app = createApp({ db, dev, origin });
try {
  const swept = app.sweep();
  console.log(`[api] start-up sweep: ${JSON.stringify(swept)}`);
} catch (err) {
  console.error('[api] start-up sweep failed', err);
}

const server = createServer(async (req, res) => {
  try {
    if (await app.handle(req, res)) return;
  } catch (err) {
    console.error('[api] unhandled', err);
  }
  if (!res.headersSent) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('{"error":"not_found","message":"this server answers /api/* only"}');
  }
});
// Slow or idle clients are cut off; the proxy in front retries nothing on its own.
server.requestTimeout = 30000;
server.headersTimeout = 10000;

server.listen(port, host, () => {
  console.log(`[api] listening on ${host}:${port}, database ${dbPath}${dev ? ' (development)' : ''}`);
});

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[api] ${signal}: finishing`);
  server.close();
  await app.close(10000);
  try { db.close(); } catch (err) { console.error('[api] closing the database failed', err); }
  process.exit(0);
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
