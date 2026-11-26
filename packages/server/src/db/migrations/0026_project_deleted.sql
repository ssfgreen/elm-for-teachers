-- Deleting a project (the teacher types DELETE) hides it and its chats from the teacher. The rows
-- are kept, as deleted docs are, so the research export still has them.
ALTER TABLE projects ADD COLUMN deleted_at TEXT;
