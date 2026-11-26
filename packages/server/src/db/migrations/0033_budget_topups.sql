-- Top-ups to a workspace's budget (issue #51): an admin's "Add £10" on /admin. A workspace's
-- budget is config limits.budget_gbp plus the sum of its top-ups. Rows are only ever added; there
-- is no undo. Each one is also logged as a budget_update event.
CREATE TABLE budget_topups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  amount_gbp REAL NOT NULL,
  at TEXT NOT NULL,
  via TEXT NOT NULL
);
CREATE INDEX idx_budget_topups_session ON budget_topups(session_id);
