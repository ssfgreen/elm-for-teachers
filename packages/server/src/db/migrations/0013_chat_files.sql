-- Files added to a chat with "+" (context for the model), as well as to a project: a reference
-- file now belongs to a project or to a chat (thread), never both. SQLite can't drop NOT NULL,
-- so the table is rebuilt (it is new and small). The pages are set aside first and put back
-- after, so with foreign keys enforced no page ever points at a missing file.
CREATE TABLE reference_files_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  project_id TEXT REFERENCES projects(id),
  thread_id TEXT REFERENCES threads(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  pages INTEGER NOT NULL,
  chars INTEGER NOT NULL,
  est_tokens INTEGER NOT NULL,
  storage_key TEXT,
  summary TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready')),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK ((project_id IS NULL) <> (thread_id IS NULL))
);
INSERT INTO reference_files_new (id, session_id, project_id, thread_id, name, mime, bytes, pages, chars, est_tokens, storage_key, summary, status, created_at, deleted_at)
  SELECT id, session_id, project_id, NULL, name, mime, bytes, pages, chars, est_tokens, storage_key, summary, status, created_at, deleted_at FROM reference_files;
CREATE TABLE reference_pages_old AS SELECT file_id, session_id, page, text FROM reference_pages;
DROP TABLE reference_pages;
DROP TABLE reference_files;
ALTER TABLE reference_files_new RENAME TO reference_files;
CREATE TABLE reference_pages (
  file_id TEXT NOT NULL REFERENCES reference_files(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (file_id, page)
);
INSERT INTO reference_pages (file_id, session_id, page, text) SELECT file_id, session_id, page, text FROM reference_pages_old;
DROP TABLE reference_pages_old;
CREATE INDEX idx_reference_files_project ON reference_files(session_id, project_id);
CREATE INDEX idx_reference_files_thread ON reference_files(session_id, thread_id);
