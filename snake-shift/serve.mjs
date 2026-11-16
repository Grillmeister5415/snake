// Tiny static server for playing and developing SNAKE//SHIFT.
// It sends "no-store" on everything, so a reload always shows the latest code.
// (python's http.server sends no cache headers, and browsers then keep old modules.)
//
//   node serve.mjs            → http://localhost:4321, this computer only
//   node serve.mjs 5000       → another port
//   node serve.mjs 4321 --lan → also reachable from a phone on the same network

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.argv[2]) || 4321;
const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';

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

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403, NO_STORE).end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(301, { ...NO_STORE, Location: `${url.pathname}/${url.search}` }).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { ...NO_STORE, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { ...NO_STORE, 'Content-Type': 'text/plain' }).end('Not found');
  }
}).on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  // Not a failure worth a stack trace: most often the game is simply running already.
  console.log(`Port ${port} is already in use, so no new server was started.`);
  console.log(`If SNAKE//SHIFT is already running, just open http://localhost:${port}`);
  console.log(`To run a second one, pick another port: node serve.mjs ${port + 1}`);
}).listen(port, host, () => {
  console.log(`SNAKE//SHIFT is on http://localhost:${port}`);
});
