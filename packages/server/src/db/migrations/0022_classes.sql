-- Classes (docs/classes.md): the teacher's schools, and in each school year its year groups and
-- classes, with each class's pupils as made-up labels and their needs (never names). A school
-- year is a label such as 2026-27; classes change every year, so a class belongs to one. A chat
-- may be for a class or a year group (threads.class_id, threads.year_group_id), or in a project,
-- or none. Archiving sets archived_at; rows are never deleted except with their session.
-- (Replaced on 12 Nov 2026 before it ran anywhere but this branch, with Sam's agreement.)
CREATE TABLE schools (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  name TEXT NOT NULL,
  -- The demo class's fictional school: never where the teacher's own classes go.
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_schools_session ON schools(session_id);

CREATE TABLE year_groups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  school_id TEXT NOT NULL REFERENCES schools(id),
  school_year TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_year_groups_session ON year_groups(session_id);

-- starred_at: the teacher's own classes this year, shown in the sidebar.
CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  school_id TEXT NOT NULL REFERENCES schools(id),
  school_year TEXT NOT NULL,
  year_group_id TEXT NOT NULL REFERENCES year_groups(id),
  name TEXT NOT NULL,
  stage TEXT,
  subject TEXT,
  note TEXT,
  starred_at TEXT,
  copied_from TEXT REFERENCES classes(id),
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_classes_session ON classes(session_id);

-- needs is a JSON array of strings.
CREATE TABLE class_pupils (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  label TEXT NOT NULL,
  needs TEXT NOT NULL DEFAULT '[]',
  helps TEXT,
  working_at TEXT,
  note TEXT,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_class_pupils_class ON class_pupils(class_id);

ALTER TABLE threads ADD COLUMN class_id TEXT REFERENCES classes(id);
ALTER TABLE threads ADD COLUMN year_group_id TEXT REFERENCES year_groups(id);
