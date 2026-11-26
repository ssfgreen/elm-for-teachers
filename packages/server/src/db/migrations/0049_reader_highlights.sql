-- A pupil's highlights on a reading (reader/, #213). Each names a block of the reading's frozen
-- copy and a range in that block's text as the reader shows it (shared/src/readerText.ts), and a
-- category or none. Kept by membership (`class_members.id`), with no foreign key, so that when a
-- teacher removes the pupil the rows stay under the pupil's `removed_pupils` id
-- (pupils/tables.ts, keep-anonymised). Not research events; not in the export.
-- "end" is quoted: it is a keyword. Kept to SQL PostgreSQL also accepts.
CREATE TABLE reader_highlights (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  reading_id TEXT NOT NULL REFERENCES readings(id),
  member_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  start INTEGER NOT NULL CHECK (start >= 0),
  "end" INTEGER NOT NULL CHECK ("end" > start),
  category TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX reader_highlights_member ON reader_highlights (member_id, reading_id);
CREATE INDEX reader_highlights_session ON reader_highlights (session_id);
