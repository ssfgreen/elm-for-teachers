-- A Word reference file's blocks (JSON, as "Upload .docx" makes them), so the model can open
-- it as an editable doc keeping its tables and lists. NULL for other files and older uploads.
ALTER TABLE reference_files ADD COLUMN blocks TEXT;
