-- Zero-retention PII moderation audit log (T2).
-- Stores only hashes, verdicts, categories and redaction counts — never blocked text.
-- Kept strictly out of research events and export bundles.

CREATE TABLE moderation_checks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('class_note', 'needs_group')),
  target_id TEXT,
  text_hash TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('allowed', 'blocked', 'error')),
  categories TEXT NOT NULL,
  redactions TEXT NOT NULL,
  model TEXT,
  policy_version TEXT NOT NULL,
  cost_gbp REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX moderation_checks_session ON moderation_checks(session_id, created_at);

ALTER TABLE classes ADD COLUMN note_check_id TEXT REFERENCES moderation_checks(id);
ALTER TABLE needs_groups ADD COLUMN check_id TEXT REFERENCES moderation_checks(id);
