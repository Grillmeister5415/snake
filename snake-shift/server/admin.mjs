// Command-line administration (LEADERBOARD_PLAN A0): no web page, just this script on the database.
//
//   node server/admin.mjs list                  every player: id, handle, hidden, best, runs
//   node server/admin.mjs rename <id> <handle>  give a player another handle (same rules as the form)
//   node server/admin.mjs hide <id>             leave a player out of every board
//   node server/admin.mjs unhide <id>           show them again (their scores were kept)
//
// The database is SNAKE_DB, or --db <file>, or the development database (.data/dev.sqlite).
// On the droplet: docker exec snake-api node /srv/api/current/server/admin.mjs list
// It works while the server runs. It never migrates: the schema must match this code.

import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createPlayers } from './players.js';
import { handleProblem } from './blocklist.js';
import { normaliseHandle } from '../src/handle.js';

const DEV_DB = fileURLToPath(new URL('../.data/dev.sqlite', import.meta.url));

function usage(code = 2) {
  console.error('usage: node server/admin.mjs [--db <file>] list | rename <id> <handle> | hide <id> | unhide <id>');
  process.exit(code);
}

const args = process.argv.slice(2);
let dbPath = process.env.SNAKE_DB || DEV_DB;
const i = args.indexOf('--db');
if (i >= 0) {
  if (!args[i + 1]) usage();
  dbPath = args[i + 1];
  args.splice(i, 2);
}
const [cmd, id, handle] = args;
if (!cmd) usage();

let db;
try {
  db = openDb(dbPath, { migrate: false });
} catch (err) {
  console.error(`cannot open ${dbPath}: ${err.message}`);
  process.exit(1);
}
const players = createPlayers(db, { clock: { now: () => Date.now() }, random: null, sessionTtlMs: 0, sessionRefreshMs: 0 });

function need(player) {
  if (!player) {
    console.error(`no player with id ${id}`);
    process.exit(1);
  }
  return player;
}

switch (cmd) {
  case 'list': {
    const rows = players.list();
    console.log(['ID'.padEnd(22), 'HANDLE'.padEnd(12), 'HIDDEN', 'BEST'.padStart(6), 'RUNS'.padStart(5), 'CREATED'].join('  '));
    for (const r of rows) {
      console.log([
        r.id, r.handle.padEnd(12), (r.hidden ? 'yes' : 'no').padEnd(6), String(r.best ?? '-').padStart(6),
        String(r.runs).padStart(5), new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      ].join('  '));
    }
    console.log(`${rows.length} player${rows.length === 1 ? '' : 's'} in ${dbPath}`);
    break;
  }
  case 'rename': {
    if (!id || handle === undefined) usage();
    const before = need(players.get(id));
    const problem = handleProblem(handle);
    if (problem) {
      console.error(`"${handle}" cannot be used: ${problem}`);
      process.exit(1);
    }
    players.rename(id, handle);
    console.log(`renamed ${id}: ${before.handle} -> ${normaliseHandle(handle)}`);
    break;
  }
  case 'hide':
  case 'unhide': {
    if (!id) usage();
    need(players.get(id));
    players.setHidden(id, cmd === 'hide');
    console.log(`${id} is now ${cmd === 'hide' ? 'hidden from' : 'shown on'} the boards`);
    break;
  }
  default:
    usage();
}
db.close();
