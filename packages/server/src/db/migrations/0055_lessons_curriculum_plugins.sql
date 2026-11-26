-- Teacher onboarding lesson progress (keyed on session_id so secret-link study workspaces work),
-- federated Curriculum MCP fields (classes.curriculum_profile, class_curriculum.standard_uri),
-- and local verified plugin copies from the Education Plugin Studio (T4/T5 prep).

CREATE TABLE lesson_progress (
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  lesson_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  state_json TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (session_id, lesson_id)
);

ALTER TABLE classes ADD COLUMN curriculum_profile TEXT;
ALTER TABLE class_curriculum ADD COLUMN standard_uri TEXT;

CREATE TABLE plugin_copies (
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  passport_json TEXT,
  withdrawn_at TEXT,
  fetched_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (plugin_id, version)
);
