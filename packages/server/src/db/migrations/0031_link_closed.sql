-- Closing a workspace's link (issue #44): when the admin closed it, or null while it works. A
-- closed link workspace answers to no token and no code until the admin issues a new link.
ALTER TABLE sessions ADD COLUMN link_closed_at TEXT;
