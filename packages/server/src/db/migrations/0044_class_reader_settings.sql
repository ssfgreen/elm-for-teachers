-- A class's settings for the pupil reader (classes/reader-settings.ts, #186): how many follow-ups
-- a pupil may ask after one answer, and each pupil's default budget in pounds (REAL, as in
-- budget_topups). NULL means config's default (`reader.follow_ups_max`, `reader.pupil_budget_gbp`),
-- read when asked. Kept to SQL PostgreSQL also accepts.
ALTER TABLE classes ADD COLUMN reader_follow_ups_max INTEGER;
ALTER TABLE classes ADD COLUMN reader_pupil_budget_gbp REAL;
