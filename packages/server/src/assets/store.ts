/**
 * Image asset persistence. Bytes live in the `assets` table, or in a bucket (`storage`
 * 'bucket', see bucket.ts) once a direct upload is `ready`; listings never return bytes.
 */
import type { Executor } from '../db/types.js';
import type { Db } from '../db/client.js';

export interface AssetMeta {
  asset_id: string;
  session_id: string;
  mime: string;
  bytes: number;
  filename: string | null;
  storage: 'db' | 'bucket';
  status: 'pending' | 'ready';
  created_at: string;
}
export interface AssetRow extends AssetMeta {
  /** The image itself when stored in the database; null for a bucket image. */
  data: Buffer | null;
}

/** The bucket key of a session's image. */
export const bucketKey = (sessionId: string, assetId: string) => `sessions/${sessionId}/${assetId}`;

export async function saveAsset(tx: Executor, row: Omit<AssetRow, 'storage' | 'status'> & Partial<Pick<AssetRow, 'storage' | 'status'>>): Promise<void> {
  await tx.execute({
    sql: 'INSERT INTO assets (asset_id, session_id, mime, bytes, filename, data, storage, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    args: [row.asset_id, row.session_id, row.mime, row.bytes, row.filename, row.data, row.storage ?? 'db', row.status ?? 'ready', row.created_at],
  });
}

export async function markAssetReady(tx: Executor, assetId: string, bytes: number): Promise<void> {
  await tx.execute({ sql: "UPDATE assets SET status = 'ready', bytes = ? WHERE asset_id = ?", args: [bytes, assetId] });
}

function toMeta(r: Record<string, unknown>): AssetMeta {
  return {
    asset_id: String(r.asset_id),
    session_id: String(r.session_id),
    mime: String(r.mime),
    bytes: Number(r.bytes),
    filename: r.filename === null || r.filename === undefined ? null : String(r.filename),
    storage: r.storage === 'bucket' ? 'bucket' : 'db',
    status: r.status === 'pending' ? 'pending' : 'ready',
    created_at: String(r.created_at),
  };
}

/** The asset, only if it belongs to `sessionId`. */
export async function getAsset(db: Db, sessionId: string, assetId: string): Promise<AssetRow | null> {
  const res = await db.execute('SELECT * FROM assets WHERE asset_id = ? AND session_id = ?', [assetId, sessionId]);
  const r = res.rows[0];
  if (!r) return null;
  const raw = r.data as unknown;
  const data = raw === null || raw === undefined ? null : Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
  return { ...toMeta(r as unknown as Record<string, unknown>), data };
}

/** Metadata only, oldest first. */
export async function listAssets(db: Db, sessionId: string): Promise<AssetMeta[]> {
  const res = await db.execute(
    'SELECT asset_id, session_id, mime, bytes, filename, storage, status, created_at FROM assets WHERE session_id = ? ORDER BY created_at, asset_id',
    [sessionId],
  );
  return res.rows.map((r) => toMeta(r as unknown as Record<string, unknown>));
}
