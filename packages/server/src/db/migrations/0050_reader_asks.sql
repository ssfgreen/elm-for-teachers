-- A pupil's asks in the reader (reader-asks/, #214). Kept here, never in `events`,
-- `gateway_calls` or the export (question 49, docs/rules.md).
--
-- `reader_asks`: what was asked and what it cost, with ids only. On Remove (question 91) a row
-- stays, with `member_id` set to the pupil's new `removed_pupils` id, so it has no foreign key on
-- that column (pupils/tables.ts). `cost_gbp` counts in the workspace's spend (budget/store.ts).
-- `safety_hash` is `sha256:<hex>` of the safety instruction the call ran under, never the text.
CREATE TABLE reader_asks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  reading_id TEXT NOT NULL REFERENCES readings(id),
  member_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL REFERENCES reader_prompts(id),
  parent_ask_id TEXT REFERENCES reader_asks(id),
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  cache_write_tokens INTEGER,
  cost_gbp REAL,
  config_hash TEXT NOT NULL,
  safety_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX reader_asks_member ON reader_asks(member_id);
CREATE INDEX reader_asks_session ON reader_asks(session_id, created_at);

-- The words of an ask: the passage the pupil highlighted and the reply. Deleted on Remove
-- (question 91), with the membership.
CREATE TABLE reader_ask_texts (
  ask_id TEXT PRIMARY KEY REFERENCES reader_asks(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  member_id TEXT NOT NULL REFERENCES class_members(id),
  highlighted_text TEXT NOT NULL,
  reply TEXT NOT NULL
);
CREATE INDEX reader_ask_texts_member ON reader_ask_texts(member_id);
