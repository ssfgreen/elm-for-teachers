-- Images may live in an S3-compatible bucket (R2, S3, B2) instead of the database:
-- `storage` says where, `data` is empty for bucket images, and a bucket upload is
-- `pending` until the browser has put the file there and the server has checked it.
CREATE TABLE assets_v2 (
  asset_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  filename TEXT,
  data BLOB,
  storage TEXT NOT NULL DEFAULT 'db' CHECK (storage IN ('db', 'bucket')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready')),
  created_at TEXT NOT NULL
);
INSERT INTO assets_v2 (asset_id, session_id, mime, bytes, filename, data, storage, status, created_at)
  SELECT asset_id, session_id, mime, bytes, filename, data, 'db', 'ready', created_at FROM assets;
DROP TABLE assets;
ALTER TABLE assets_v2 RENAME TO assets;
CREATE INDEX idx_assets_session ON assets(session_id);
