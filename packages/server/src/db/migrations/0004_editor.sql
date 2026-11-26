-- Editor schema (29 Oct 2026): session -> threads -> docs -> blocks. Replaces the study
-- schema (phases, versions, injection, post-task screens), whose tables are dropped.
-- Timestamps are ISO-8601 TEXT; JSON columns are TEXT.
DROP TABLE IF EXISTS phase_timings;
DROP TABLE IF EXISTS injection_plans;
DROP TABLE IF EXISTS injection_records;
DROP TABLE IF EXISTS annotations;
DROP TABLE IF EXISTS sort_results;
DROP TABLE IF EXISTS ownership_results;
DROP TABLE IF EXISTS questionnaire_results;
DROP TABLE IF EXISTS intake_results;
DROP TABLE IF EXISTS facilitator_notes;
DROP TABLE IF EXISTS versions;
DROP TABLE IF EXISTS block_revisions;
DROP TABLE IF EXISTS blocks;
DROP TABLE IF EXISTS chat_turns;
DROP TABLE IF EXISTS gateway_calls;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS docs;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS sessions;

-- A workspace reached through a participant link. Teacher accounts will own sessions later.
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  participant_token TEXT UNIQUE NOT NULL,
  config_hash TEXT NOT NULL,
  system_prompt_hash TEXT NOT NULL,
  first_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  title TEXT NOT NULL,
  running_summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_threads_session ON threads(session_id);

CREATE TABLE docs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  name TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('teacher','model')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_docs_session ON docs(session_id);

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  doc_id TEXT NOT NULL REFERENCES docs(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('teacher','model')),
  origin_turn TEXT,
  status TEXT NOT NULL CHECK (status IN ('proposed','live','rejected','deleted')),
  version INTEGER NOT NULL,
  derived_from TEXT,
  "order" INTEGER NOT NULL,
  pending TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_blocks_session_doc ON blocks(session_id, doc_id);

CREATE TABLE block_revisions (
  block_id TEXT NOT NULL REFERENCES blocks(id),
  version INTEGER NOT NULL,
  actor TEXT NOT NULL,
  before TEXT,
  after TEXT NOT NULL,
  cause_event_id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (block_id, version)
);

CREATE TABLE events (
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  seq INTEGER NOT NULL,
  event_id TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  client_ts TEXT,
  server_ts TEXT NOT NULL,
  focus_pane TEXT,
  doc_id TEXT,
  thread_id TEXT,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE INDEX idx_events_session_kind ON events(session_id, kind);

CREATE TABLE chat_turns (
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  turn_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_id)
);
CREATE INDEX idx_chat_turns_thread ON chat_turns(thread_id, seq);

CREATE TABLE gateway_calls (
  gateway_call_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  payload TEXT NOT NULL,
  at TEXT NOT NULL
);

-- Images added to docs (markdown `![alt](asset:<asset_id>)`).
CREATE TABLE assets (
  asset_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  filename TEXT,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_assets_session ON assets(session_id)
