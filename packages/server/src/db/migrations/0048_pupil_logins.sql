-- Logins the teacher makes for pupils (issue #223, #221 A): a made-up username and password, no
-- name and no email. The password is shown once, when the batch is made; only its scrypt hash is
-- kept (pupil-logins/hash.ts). `pupil_id` is set the first time the login is used (B); a login
-- never used belongs to no pupil. After 5 wrong passwords `locked_at` is set (question 113).
CREATE TABLE pupil_logins (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pupil_id TEXT REFERENCES pupils(id),
  wrong_tries INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX pupil_logins_session ON pupil_logins(session_id);
CREATE INDEX pupil_logins_class ON pupil_logins(class_id);
