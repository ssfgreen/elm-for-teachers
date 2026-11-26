-- A workspace's plugin drafts from the plugin studio (plugins/drafts/). `address` is the draft's
-- address at the studio, `<studio>/d/<code>`: its code is a secret, so the address never leaves
-- the server. `id` is Elm's own short id, shown to the teacher; `name` is read from the studio
-- when the draft is added (a placeholder when it could not be read). Kept to SQL PostgreSQL also accepts.
CREATE TABLE plugin_drafts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  address TEXT NOT NULL,
  name TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, address)
);
