-- A class's own safety instruction for the pupil reader (classes/reader-settings.ts, #195). NULL
-- means config's `reader.safety_instruction`, read when asked, so a class that has not chosen
-- follows config. Kept to SQL PostgreSQL also accepts.
ALTER TABLE classes ADD COLUMN reader_safety_instruction TEXT;
