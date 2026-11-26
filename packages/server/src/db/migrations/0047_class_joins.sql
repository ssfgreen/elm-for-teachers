-- Pupils join a class with its class code (issue #209, #152 P2a).
--
-- A class has at most one live code. It is kept plain, so the teacher can be shown it again:
-- renewing replaces it and closing deletes it, so an old code stops working at once.
CREATE TABLE class_codes (
  class_id TEXT PRIMARY KEY REFERENCES classes(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  -- Canonical form (class-joins/codes.ts): upper case, no hyphen.
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX class_codes_session ON class_codes(session_id);

-- A signed-in pupil (pupils) in a class. `role` is 'pupil', or 'teacher_test' for the teacher's
-- own "View as pupil" (at most one a class). A pupil is "Pupil <number>" in the class, the test
-- member has no number. Never a name.
CREATE TABLE class_members (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  pupil_id TEXT NOT NULL REFERENCES pupils(id),
  role TEXT NOT NULL CHECK (role IN ('pupil', 'teacher_test')),
  number INTEGER,
  joined_at TEXT NOT NULL,
  UNIQUE (class_id, pupil_id),
  UNIQUE (class_id, number)
);
CREATE INDEX class_members_pupil ON class_members(pupil_id);
CREATE INDEX class_members_session ON class_members(session_id);
CREATE UNIQUE INDEX class_members_one_test ON class_members(class_id) WHERE role = 'teacher_test';

-- What is left of a pupil a teacher removed (question 91): a new random id, the workspace, the
-- class and the day. Nothing that leads back to the pupil. Not in the export.
CREATE TABLE removed_pupils (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  removed_on TEXT NOT NULL
);
CREATE INDEX removed_pupils_session ON removed_pupils(session_id);
