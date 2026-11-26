-- Every system prompt and app config the server has run with, by the hash that sessions
-- (config_hash, system_prompt_hash) and gateway calls (system_prompt_hash) carry, so an
-- export can include the exact text a session ran under. Rows are never changed or deleted.
CREATE TABLE config_versions (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('system_prompt', 'config')),
  content TEXT NOT NULL,
  first_seen_at TEXT NOT NULL
);
