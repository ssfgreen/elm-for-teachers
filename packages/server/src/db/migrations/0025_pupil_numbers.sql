-- Each pupil gets a number in their class (1, 2, 3 …), beside the made-up label. A number is never
-- given twice in a class, so pupils who left keep theirs. Pupils already there are numbered in
-- their order in the table.
ALTER TABLE class_pupils ADD COLUMN number INTEGER NOT NULL DEFAULT 0;

UPDATE class_pupils SET number = (
  SELECT COUNT(*) FROM class_pupils AS p
  WHERE p.class_id = class_pupils.class_id
    AND (p.position < class_pupils.position OR (p.position = class_pupils.position AND p.id <= class_pupils.id))
);
