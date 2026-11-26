-- Needs groups: generic or class-assigned groups of learning needs replacing per-pupil rows.
-- Holds zero pupil personal data.

CREATE TABLE needs_groups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  name TEXT NOT NULL,
  description TEXT,
  what_helps TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX needs_groups_session ON needs_groups(session_id, position);

CREATE TABLE needs_group_classes (
  needs_group_id TEXT NOT NULL REFERENCES needs_groups(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (needs_group_id, class_id)
);

CREATE INDEX needs_group_classes_class ON needs_group_classes(session_id, class_id);

CREATE TABLE needs_group_adaptations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  needs_group_id TEXT NOT NULL REFERENCES needs_groups(id),
  entry_id TEXT NOT NULL,
  title TEXT NOT NULL,
  changes_goal INTEGER NOT NULL DEFAULT 0 CHECK (changes_goal IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'trialling', 'stopped')),
  overrides TEXT,
  source_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);

CREATE INDEX needs_group_adaptations_group ON needs_group_adaptations(session_id, needs_group_id);

ALTER TABLE threads ADD COLUMN needs_group_id TEXT REFERENCES needs_groups(id);
