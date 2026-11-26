-- A font or page colour the model suggested for a doc and the teacher has not decided on, as
-- JSON ({"style": {"background": "green"}, "turn_id": "..."}); null when there is none.
ALTER TABLE docs ADD COLUMN proposed_style TEXT;
