-- Reference files (shared ReferenceFile): read-only files in a project that the model can
-- consult. The browser converts each to text in pages; the text is here, one row a page, and
-- the original (when a bucket is configured) at storage_key. Deleting sets deleted_at; rows
-- are kept for the study record. The table is not called "references": that is SQL keyword.
CREATE TABLE reference_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  project_id TEXT NOT NULL REFERENCES projects(id),
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
  deleted_at TEXT
);
CREATE INDEX idx_reference_files_project ON reference_files(session_id, project_id);
CREATE TABLE reference_pages (
  file_id TEXT NOT NULL REFERENCES reference_files(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (file_id, page)
);
