-- A doc's font and page colour, as JSON ({"font": "lexend", "background": "cream"}); null is
-- the default look.
ALTER TABLE docs ADD COLUMN style TEXT;
