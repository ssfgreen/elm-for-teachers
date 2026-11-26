-- Per-workspace feature switches (issue #62): JSON of the switches that differ from the default
-- (shared/src/features.ts), null when all are on. Existing workspaces read as all on.
ALTER TABLE sessions ADD COLUMN features TEXT;
