-- Pupils who sign in with Google or Microsoft on the pupil page /r (issue #179). Only the provider,
-- the subject (the provider's opaque id for the person) and the tenant are kept: never a name or
-- an email. A pupil is not a teacher account and belongs to no workspace yet (joining a class
-- comes later, #152 P2). Nothing about a pupil goes into events, the call log or the export.
CREATE TABLE pupils (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  -- Microsoft: the directory (tenant) id; Google: the Workspace domain (`hd`); null when none.
  tenant TEXT,
  created_at TEXT NOT NULL,
  last_sign_in_at TEXT,
  UNIQUE (provider, subject)
);

-- The server side of the pupil sign-in cookie, apart from the teachers' sign_ins: only a hash of
-- the cookie's id is stored.
CREATE TABLE pupil_sign_ins (
  id_hash TEXT PRIMARY KEY,
  pupil_id TEXT NOT NULL REFERENCES pupils(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX pupil_sign_ins_pupil ON pupil_sign_ins(pupil_id);
