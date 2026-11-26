-- Comments can be edited (by the teacher, their own only) and threads resolved and reopened.
-- Both are logged (comment_edit, comment_resolve); the body before an edit is in the event.
ALTER TABLE comments ADD COLUMN edited_at TEXT;
ALTER TABLE comments ADD COLUMN resolved_at TEXT;
