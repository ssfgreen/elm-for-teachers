-- Slow work run outside a request (jobs/): a row per job, claimed by one worker at a time.
-- Times are ISO strings, as elsewhere. Kept to SQL PostgreSQL also accepts.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  locked_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX jobs_due ON jobs (status, run_after);
