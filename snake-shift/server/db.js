// The database: one SQLite file, opened with Node's built-in node:sqlite (no npm packages).
// Migrations in ./migrations are numbered SQL files, applied in order at start, each in its own
// transaction, and recorded in PRAGMA user_version. They only move forward: a database that is
// newer than this code refuses to open, so an old release can never write into a newer schema.

import * as sqlite from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node 26 renamed DatabaseSync to Database (DatabaseSync stays as an alias); Node 22 has only DatabaseSync.
const Database = sqlite.Database ?? sqlite.DatabaseSync;

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/** The migration files as [{ version, name, sql }], sorted by version. */
export function listMigrations(dir = MIGRATIONS_DIR) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const m = /^(\d+)_[\w-]+\.sql$/.exec(name);
    if (!m) continue;
    out.push({ version: Number(m[1]), name, sql: readFileSync(join(dir, name), 'utf8') });
  }
  out.sort((a, b) => a.version - b.version);
  out.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`[db] migrations must be numbered 1, 2, 3...; found ${m.name}`);
  });
  return out;
}

/** Applies the missing migrations. Returns { from, to }. */
export function migrate(db, dir = MIGRATIONS_DIR) {
  const list = listMigrations(dir);
  const from = db.prepare('PRAGMA user_version').get().user_version;
  const latest = list.length;
  if (from > latest) {
    throw new Error(`[db] the database is at schema ${from}, newer than this code knows (${latest}). Deploy newer code or restore a backup.`);
  }
  for (const m of list) {
    if (m.version <= from) continue;
    tx(db, () => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
  }
  return { from, to: latest };
}

/**
 * Opens (or creates) the database at `path` (':memory:' for tests) and brings it up to date.
 * With `migrate: false` (the admin script) it changes no schema and refuses a database that is not
 * exactly at this code's version: migrating is the server's job, after deploy.sh's backup.
 * @param {string} path
 * @param {{ migrationsDir?: string, migrate?: boolean }} [opts]
 */
export function openDb(path, { migrationsDir = MIGRATIONS_DIR, migrate: doMigrate = true } = {}) {
  const db = new Database(path);
  try {
    // WAL lets the admin and backup scripts read while the server writes.
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    if (doMigrate) {
      migrate(db, migrationsDir);
    } else {
      const have = db.prepare('PRAGMA user_version').get().user_version;
      const want = listMigrations(migrationsDir).length;
      if (have !== want) {
        const hint = have < want ? 'start the server once to migrate it' : 'use the code of the release that migrated it';
        throw new Error(`[db] the database is at schema ${have}, this code expects ${want}; ${hint}`);
      }
    }
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

/** Opens a database file read-only, as it is (the backup script). */
export function openReadOnly(path) {
  const db = new Database(path, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/**
 * Copies an open database to `target` with SQLite's online backup, page by page, while the server
 * keeps working. Resolves with the number of pages copied.
 */
export function backupDb(db, target) {
  return sqlite.backup(db, target);
}

/** Runs fn inside a write transaction (BEGIN IMMEDIATE), rolled back if it throws. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/** Runs fn inside a read transaction, so several queries see one state of the data. */
export function readTx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}
