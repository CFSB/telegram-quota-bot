CREATE TABLE IF NOT EXISTS sessions (
  session_key TEXT PRIMARY KEY,
  label TEXT,
  kind TEXT NOT NULL,
  owner TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  context_used INTEGER,
  context_max INTEGER,
  five_hour_left_pct REAL,
  five_hour_reset_in_sec INTEGER,
  week_left_pct REAL,
  week_reset_in_sec INTEGER,
  thinking TEXT,
  raw_status_text TEXT
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL,
  from_snapshot_id INTEGER,
  to_snapshot_id INTEGER NOT NULL,
  delta_tokens_in INTEGER,
  delta_tokens_out INTEGER,
  delta_context INTEGER,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  pushed_at TEXT,
  push_status TEXT
);
