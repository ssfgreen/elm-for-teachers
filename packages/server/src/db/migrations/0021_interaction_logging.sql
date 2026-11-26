-- Interaction logging (pointer, clicks, layout: shared/src/events/interactions.ts), switched on
-- per workspace in /admin and off by default. `interactions_until` is when it stops by itself
-- (null: until it is turned off).
ALTER TABLE sessions ADD COLUMN interactions_on INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN interactions_until TEXT;
