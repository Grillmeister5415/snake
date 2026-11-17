-- HALL OF SHIFTERS, first schema. Times are milliseconds since 1970 (UTC), from the server's clock.
-- Migrations only ever move forward; db.js applies each one inside a transaction and records its
-- number in PRAGMA user_version.

-- A player is an opaque random ID and a display name. The name is not unique and not a login.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)), -- set by server/admin.mjs
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

-- Anonymous sessions. Only the SHA-256 of the cookie's secret is kept.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_player ON sessions (player_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- Issued and not yet used run tickets. A submission moves the ticket into runs.
CREATE TABLE tickets (
  run_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  seed INTEGER NOT NULL,
  ruleset TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX tickets_player ON tickets (player_id, issued_at);
CREATE INDEX tickets_expiry ON tickets (expires_at);

-- Every submitted ticket, accepted or rejected. The score is always the server's own.
-- replay_hash stays for idempotent retries after the replay itself has been dropped (retention).
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  ruleset TEXT NOT NULL,
  seed INTEGER NOT NULL,
  issued_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL, -- first receipt; a retry never changes it
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reject_reason TEXT,
  score INTEGER,
  end_tick INTEGER,
  reason TEXT,   -- 'wall' | 'self' | 'complete'
  universe TEXT, -- the universe the run ended in
  lives INTEGER,
  active_ms INTEGER,
  replay_hash TEXT NOT NULL,
  replay TEXT
) STRICT;
CREATE INDEX runs_player ON runs (player_id, received_at);
CREATE INDEX runs_received ON runs (received_at);

-- Each player's best accepted run per board: 'all' and one board per UTC week ('w:YYYY-MM-DD',
-- the Monday it starts). `at` is the first receipt time of that run; ties go to the earlier one.
CREATE TABLE bests (
  board TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs (run_id),
  PRIMARY KEY (board, player_id)
) STRICT;
CREATE INDEX bests_rank ON bests (board, score DESC, at, player_id);
CREATE INDEX bests_run ON bests (run_id);
