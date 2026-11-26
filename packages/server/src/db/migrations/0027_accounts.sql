-- Teacher accounts (issue #15). A workspace is reached by its link ('link') or belongs to one
-- account that signs in ('account'). The email, name and provider subject live only in
-- `accounts` and `account_invites`: never in events, gateway calls or the export.
ALTER TABLE sessions ADD COLUMN access TEXT NOT NULL DEFAULT 'link' CHECK (access IN ('link', 'account'));

-- One account, one workspace.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(session_id),
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL,
  last_sign_in_at TEXT,
  notice_version TEXT,
  notice_accepted_at TEXT,
  UNIQUE (provider, subject)
);

-- The server side of the sign-in cookie: only a hash of the cookie's id is stored.
CREATE TABLE sign_ins (
  id_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sign_ins_account ON sign_ins(account_id);

-- An invite is claimed once; only a hash of its code is stored. `session_id` is the workspace
-- it made, set when it is claimed.
CREATE TABLE account_invites (
  code_hash TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  session_id TEXT REFERENCES sessions(session_id)
);
