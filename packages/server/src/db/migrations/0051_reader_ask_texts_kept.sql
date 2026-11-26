-- The words of a pupil's ask stay when the pupil is removed (Sam, 24 Nov 2026, question 105:
-- "We should keep the parts asked about. All data just not user identifying information").
-- They no longer name the membership: the ask they belong to does (`reader_asks.member_id`,
-- set to the `removed_pupils` id on Remove). The table is rebuilt without `member_id`, keeping
-- its rows. Kept to SQL PostgreSQL also accepts.
CREATE TABLE reader_ask_texts_kept (
  ask_id TEXT PRIMARY KEY REFERENCES reader_asks(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  highlighted_text TEXT NOT NULL,
  reply TEXT NOT NULL
);
INSERT INTO reader_ask_texts_kept (ask_id, session_id, highlighted_text, reply)
  SELECT ask_id, session_id, highlighted_text, reply FROM reader_ask_texts;
DROP TABLE reader_ask_texts;
ALTER TABLE reader_ask_texts_kept RENAME TO reader_ask_texts;
