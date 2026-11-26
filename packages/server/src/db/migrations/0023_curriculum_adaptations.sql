-- A class's curriculum (docs/classes.md, C.4) and the library adaptations chosen for each pupil
-- (library/pedagogy-sample/HANDOFF.md, layer 4). A curriculum item keeps its code and text as
-- picked, and the library version, so a later change to the library does not change the class.
-- owner_kind is 'class' for now ('year_group' later). An adaptation names a library entry by id
-- only: nothing here is ever written back to the library. Removing sets removed_at.
CREATE TABLE class_curriculum (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  owner_kind TEXT NOT NULL DEFAULT 'class',
  owner_id TEXT NOT NULL,
  framework TEXT NOT NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  source_version TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX idx_class_curriculum_owner ON class_curriculum(owner_id);

CREATE TABLE pupil_adaptations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  pupil_id TEXT NOT NULL REFERENCES class_pupils(id),
  entry_id TEXT NOT NULL,
  title TEXT NOT NULL,
  changes_goal INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  overrides TEXT,
  source_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX idx_pupil_adaptations_pupil ON pupil_adaptations(pupil_id);
