-- Plugins (docs/plugins.md). A workspace's trust level for a plugin, once the teacher has set
-- one (until then the catalogue's default applies).
CREATE TABLE plugin_settings (
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  plugin_id TEXT NOT NULL,
  trust TEXT NOT NULL CHECK (trust IN ('use', 'ask', 'off')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, plugin_id)
);

-- Ask first, per chat: the assistant asked to use a plugin, or the teacher allowed it.
CREATE TABLE plugin_grants (
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  plugin_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'allowed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, plugin_id)
);
