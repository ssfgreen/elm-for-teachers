-- The teacher's preferences for a workspace (shared/src/preferences.ts): a note about
-- themselves for the assistant, and the font new docs start in. Null is not set.
CREATE TABLE preferences (
  session_id TEXT PRIMARY KEY REFERENCES sessions(session_id),
  teacher_note TEXT,
  default_font TEXT,
  updated_at TEXT NOT NULL
);
