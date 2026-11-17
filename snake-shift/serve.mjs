// Tiny static server for playing and developing SNAKE//SHIFT.
// It sends "no-store" on everything, so a reload always shows the latest code.
// (python's http.server sends no cache headers, and browsers then keep old modules.)
// It also answers the leaderboard API (/api/*) in the same process, with a development database
// in .data/dev.sqlite (not in git) and development cookies that work over plain http.
//
//   node serve.mjs            → http://localhost:4321, this computer only
//   node serve.mjs 5000       → another port
//   node serve.mjs 4321 --lan → also reachable from a phone on the same network
//   node serve.mjs --no-api   → files only, as before the leaderboard (to try the offline paths)

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a))) || 4321;
const host = args.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const withApi = !args.includes('--no-api');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const NO_STORE = { 'Cache-Control': 'no-store' };

// The API loads only when asked for, so `--no-api` never touches node:sqlite.
let api = null, db = null;
if (withApi) {
  process.env.SNAKE_DEV = '1';
  const { openDb } = await import('./server/db.js');
  const { createApp } = await import('./server/app.js');
  // SNAKE_DB picks another database file (the tests use a temporary one).
  const dbFile = process.env.SNAKE_DB || join(root, '.data', 'dev.sqlite');
  mkdirSync(dirname(dbFile), { recursive: true });
  db = openDb(dbFile);
  api = createApp({ db, dev: true });
}

createServer(async (req, res) => {
  try {
    if (api && await api.handle(req, res)) return;
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403, NO_STORE).end('Forbidden');
      return;
    }
    // Nothing hidden, such as the development database in .data/ (the live site does the same).
    if (rel.split('/').some((p) => p.startsWith('.'))) throw new Error('hidden');
    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(301, { ...NO_STORE, Location: `${url.pathname}/${url.search}` }).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { ...NO_STORE, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    if (res.headersSent) return;
    res.writeHead(404, { ...NO_STORE, 'Content-Type': 'text/plain' }).end('Not found');
  }
}).on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  // Not a failure worth a stack trace: most often the game is simply running already.
  console.log(`Port ${port} is already in use, so no new server was started.`);
  console.log(`If SNAKE//SHIFT is already running, just open http://localhost:${port}`);
  console.log(`To run a second one, pick another port: node serve.mjs ${port + 1}`);
  if (db) db.close();
  process.exit(0);
}).listen(port, host, () => {
  console.log(`SNAKE//SHIFT is on http://localhost:${port}`);
  console.log(api ? `Leaderboard API on /api/* (development database ${process.env.SNAKE_DB || '.data/dev.sqlite'})` : 'Files only: no leaderboard API (--no-api)');
});

// Close the database cleanly on Ctrl+C, so its write-ahead log is folded back into the file.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (api) await api.close(2000);
    if (db) db.close();
    process.exit(0);
  });
}
