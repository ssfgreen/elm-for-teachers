-- Frozen one-way Content Pack v1 bundles for Elm for Students (T3).
-- Strictly one-way: no fetched_at column and GET /api/packs/:code never burns the code.

CREATE TABLE content_packs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  doc_id TEXT NOT NULL REFERENCES docs(id),
  kind TEXT NOT NULL CHECK (kind IN ('reading', 'worksheet')),
  title TEXT NOT NULL,
  format_version TEXT NOT NULL DEFAULT '1',
  content_hash TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  link_code_hash TEXT NOT NULL UNIQUE,
  zip_data BLOB,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX content_packs_session ON content_packs(session_id, created_at);
CREATE INDEX content_packs_expires ON content_packs(expires_at);
