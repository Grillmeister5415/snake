// Backup of the database with SQLite's online backup (LEADERBOARD_PLAN C2). Safe while the server
// runs: it copies a consistent state, then checks the copy.
//
//   node server/backup.mjs <target-file> [--db <file>] [--force]
//
// The database is SNAKE_DB, or --db <file>, or the development database (.data/dev.sqlite).
// It refuses to overwrite an existing file unless --force is given.
// On the droplet deploy.sh runs it before every API release (see DEPLOY.md, "Backup and restore").

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openReadOnly, backupDb } from './db.js';

const DEV_DB = fileURLToPath(new URL('../.data/dev.sqlite', import.meta.url));

const args = process.argv.slice(2);
let dbPath = process.env.SNAKE_DB || DEV_DB;
const i = args.indexOf('--db');
if (i >= 0) {
  dbPath = args[i + 1];
  args.splice(i, 2);
}
const force = args.includes('--force');
const target = args.find((a) => !a.startsWith('--'));
if (!target || !dbPath) {
  console.error('usage: node server/backup.mjs <target-file> [--db <file>] [--force]');
  process.exit(2);
}
if (resolve(target) === resolve(dbPath)) {
  console.error('the target is the database itself');
  process.exit(2);
}
if (existsSync(target) && !force) {
  console.error(`${target} exists; pass --force to overwrite it`);
  process.exit(1);
}
if (!existsSync(dbPath)) {
  console.error(`no database at ${dbPath}`);
  process.exit(1);
}

mkdirSync(dirname(resolve(target)), { recursive: true });
const src = openReadOnly(dbPath);
let pages;
try {
  pages = await backupDb(src, target);
} finally {
  src.close();
}

// Check the copy before calling it a backup.
const copy = openReadOnly(target);
const ok = copy.prepare('PRAGMA integrity_check').get().integrity_check;
const version = copy.prepare('PRAGMA user_version').get().user_version;
const count = (table) => copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const summary = version > 0 ? `players ${count('players')}, runs ${count('runs')}, tickets ${count('tickets')}` : 'empty schema';
copy.close();
if (ok !== 'ok') {
  console.error(`backup written to ${target} but the integrity check says: ${ok}`);
  process.exit(1);
}
console.log(`backup ${target}: ${pages} pages, schema ${version}, ${summary}, integrity ok`);
