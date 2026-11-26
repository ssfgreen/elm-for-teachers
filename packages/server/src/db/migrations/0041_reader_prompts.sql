-- The teacher's prompt library for the pupil reader (reader-prompts/, #177): a row per prompt, in
-- the teacher's order (`position`). `label` is the button pupils see; `instruction` is the hidden
-- text that goes to the model. `source` is 'default' for config's defaults, put in when the
-- library is first opened, and 'teacher' for the teacher's own. A removed prompt keeps its row
-- with `removed_at`, so the defaults are put in once only. Kept to SQL PostgreSQL also accepts.
CREATE TABLE reader_prompts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  label TEXT NOT NULL,
  instruction TEXT NOT NULL,
  after_highlight INTEGER NOT NULL CHECK (after_highlight IN (0, 1)),
  follow_up INTEGER NOT NULL CHECK (follow_up IN (0, 1)),
  position INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('default', 'teacher')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);

CREATE INDEX reader_prompts_session ON reader_prompts (session_id, position);
