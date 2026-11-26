-- Comments on docs (shared Comment): a root anchored to a block, and its replies. Deleting
-- marks deleted_at; rows are kept for the study record.
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  doc_id TEXT NOT NULL REFERENCES docs(id),
  block_id TEXT NOT NULL,
  root_id TEXT REFERENCES comments(id),
  author TEXT NOT NULL CHECK (author IN ('teacher', 'model')),
  body TEXT NOT NULL,
  quote TEXT,
  turn_id TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_comments_doc ON comments(session_id, doc_id);
