-- The make kit (/make/:token): one board per workspace, the teacher's placed feature cards,
-- their own ideas and their feedback on the editor, saved whole as JSON. What they did to it
-- is logged as make_action events; the model's designs as make_design events.
CREATE TABLE make_boards (
  session_id TEXT PRIMARY KEY REFERENCES sessions(session_id),
  board TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
