-- Admins (issue #30). An admin is an account that signs in with Google or Microsoft and has
-- this flag. The first one is set by scripts/admin.mjs; after that, admins set it in /admin.
ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
