-- A class's readings (readings/, #187): an article set for a whole class. `blocks` is a frozen
-- copy of the source doc as it was when set (JSON: its live blocks, in order, without
-- suggestions; pictures as their asset ids), and `content_hash` a sha256 of it. Later edits to
-- the doc do not change the copy. `follow_ups_max` is null for "the same as the class". A removed
-- reading keeps its row (`removed_at`). `reading_prompts` are the library prompts it allows, in
-- the library's order when they were saved. Kept to SQL PostgreSQL also accepts.
CREATE TABLE readings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  doc_id TEXT NOT NULL REFERENCES docs(id),
  name TEXT NOT NULL,
  blocks TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  follow_ups_max INTEGER CHECK (follow_ups_max IS NULL OR (follow_ups_max >= 0 AND follow_ups_max <= 10)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);

CREATE INDEX readings_class ON readings (session_id, class_id);

CREATE TABLE reading_prompts (
  reading_id TEXT NOT NULL REFERENCES readings(id),
  prompt_id TEXT NOT NULL REFERENCES reader_prompts(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  position INTEGER NOT NULL,
  PRIMARY KEY (reading_id, prompt_id)
);
