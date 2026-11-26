-- Projects (shared Project): a teacher's collection of chats, and later of reference files
-- and skills. A chat need not be in a project (threads.project_id NULL). Archiving sets
-- archived_at; rows are never deleted except with their session.
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  name TEXT NOT NULL,
  instructions TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_projects_session ON projects(session_id);
ALTER TABLE threads ADD COLUMN project_id TEXT REFERENCES projects(id);
