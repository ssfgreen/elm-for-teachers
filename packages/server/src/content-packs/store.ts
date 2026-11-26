/**
 * Content Packs persistence (T3, migration 0054).
 * Strictly one-way: stores only link_code_hash, never the raw capability code,
 * and has no fetched_at column so GET /api/packs/:code never mutates state.
 */
import { createHash } from 'node:crypto';
import type { ContentPackKind } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Row } from '../db/types.js';

export interface ContentPackRecord {
  id: string;
  session_id: string;
  doc_id: string;
  kind: ContentPackKind;
  title: string;
  format_version: string;
  content_hash: string;
  storage_key: string;
  bytes: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface ContentPackWithZip extends ContentPackRecord {
  zip_data: Buffer | null;
}

export interface NewContentPackRow extends Omit<ContentPackRecord, 'revoked_at'> {
  link_code_hash: string;
  zip_data: Buffer | null;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function rowToPack(r: Row): ContentPackRecord {
  return {
    id: String(r.id),
    session_id: String(r.session_id),
    doc_id: String(r.doc_id),
    kind: r.kind === 'worksheet' ? 'worksheet' : 'reading',
    title: String(r.title),
    format_version: String(r.format_version),
    content_hash: String(r.content_hash),
    storage_key: String(r.storage_key),
    bytes: Number(r.bytes),
    created_at: String(r.created_at),
    expires_at: String(r.expires_at),
    revoked_at: str(r.revoked_at),
  };
}

export function hashLinkCode(rawCode: string): string {
  return createHash('sha256').update(rawCode, 'utf8').digest('hex');
}

export async function insertContentPack(db: Db, row: NewContentPackRow): Promise<ContentPackRecord> {
  await db.execute(
    `INSERT INTO content_packs
      (id, session_id, doc_id, kind, title, format_version, content_hash, storage_key, bytes, link_code_hash, zip_data, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.session_id,
      row.doc_id,
      row.kind,
      row.title,
      row.format_version,
      row.content_hash,
      row.storage_key,
      row.bytes,
      row.link_code_hash,
      row.zip_data,
      row.created_at,
      row.expires_at,
    ],
  );
  return { ...row, revoked_at: null };
}

/** Workspace packs, newest first (never exposes link_code_hash or zip bytes). */
export async function listContentPacks(db: Db, sessionId: string): Promise<ContentPackRecord[]> {
  const r = await db.execute(
    `SELECT id, session_id, doc_id, kind, title, format_version, content_hash, storage_key, bytes, created_at, expires_at, revoked_at
     FROM content_packs
     WHERE session_id = ?
     ORDER BY created_at DESC, id DESC`,
    [sessionId],
  );
  return r.rows.map(rowToPack);
}

/** Lookup by hashed capability code; read-only (never burns or mutates the row). */
export async function getContentPackByCodeHash(db: Db, codeHash: string): Promise<ContentPackWithZip | null> {
  const r = await db.execute('SELECT * FROM content_packs WHERE link_code_hash = ?', [codeHash]);
  const row = r.rows[0];
  if (!row) return null;
  const raw = row.zip_data as unknown;
  const zip_data = raw === null || raw === undefined ? null : Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
  return { ...rowToPack(row), zip_data };
}

/** Revoke a pack and wipe any inline zip bytes; returns storage_key for bucket deletion. */
export async function revokeContentPack(db: Db, sessionId: string, packId: string, now: string): Promise<{ storage_key: string } | null> {
  const r = await db.execute('SELECT storage_key, revoked_at FROM content_packs WHERE session_id = ? AND id = ?', [sessionId, packId]);
  const row = r.rows[0];
  if (!row) return null;
  const revokedAt = row.revoked_at ? String(row.revoked_at) : now;
  await db.execute('UPDATE content_packs SET revoked_at = ?, zip_data = NULL WHERE session_id = ? AND id = ?', [revokedAt, sessionId, packId]);
  return { storage_key: String(row.storage_key) };
}

/** Clear inline zip bytes on an expired or revoked pack; returns storage_key if object should be deleted. */
export async function clearExpiredContentPack(db: Db, packId: string, nowIsoStr: string): Promise<{ storage_key: string } | null> {
  const r = await db.execute('SELECT storage_key, expires_at, revoked_at FROM content_packs WHERE id = ?', [packId]);
  const row = r.rows[0];
  if (!row) return null;
  const expired = Date.parse(String(row.expires_at)) <= Date.parse(nowIsoStr);
  if (!expired && !row.revoked_at) return null;
  await db.execute('UPDATE content_packs SET zip_data = NULL WHERE id = ?', [packId]);
  return { storage_key: String(row.storage_key) };
}
