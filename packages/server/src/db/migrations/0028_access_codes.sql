-- Access codes (issue #29): a link workspace can be opened by typing a short code, kept plain
-- like the participant token. Account workspaces have none. No backfill: the admin makes a code
-- for an older workspace when it needs one.
ALTER TABLE sessions ADD COLUMN access_code TEXT;
CREATE UNIQUE INDEX sessions_access_code ON sessions(access_code);
