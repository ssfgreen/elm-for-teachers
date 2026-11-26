/**
 * A workspace's plugin drafts from the studio: add, list, remove. The address holds the draft's
 * secret code, so only `addressOf` and `listWithAddresses` (for the server's own use) return it;
 * what the client sees is the id, the name and when it was added. Adding and removing are logged
 * in the same transaction as the write (plugin_draft_add, plugin_draft_remove), without the address.
 */
import { nowIso, type PluginDraft } from '@edw/shared';
import type { Db } from '../../db/client.js';
import type { EventStore, ServerEnvelope } from '../../deps.js';
import { newDraftId } from './address.js';
import type { DraftRead } from './studio.js';

/** At most this many drafts in a workspace. */
export const DRAFTS_MAX = 20;

/** A draft as the teacher sees it: never its address. */
export type DraftInfo = PluginDraft;

export interface DraftService {
  /** The workspace's drafts, oldest first. */
  list(sessionId: string): Promise<DraftInfo[]>;
  /**
   * Add a draft at a checked address (address.ts); `read` gives its name. One already added is
   * returned as it is, with `added: false`, and nothing logged. 'full' at DRAFTS_MAX.
   */
  add(sessionId: string, address: string, read: () => Promise<DraftRead>, envelope: ServerEnvelope): Promise<{ draft: DraftInfo; added: boolean } | 'full'>;
  /** Remove one of this workspace's drafts; false when it has no such draft. */
  remove(sessionId: string, draftId: string, envelope: ServerEnvelope): Promise<boolean>;
  /** The draft's address, for the server only (a turn using it, #159); null when it has no such draft. */
  addressOf(sessionId: string, draftId: string): Promise<string | null>;
  /** Every draft with its address, in one query, for the server only (a turn, #159). Oldest first. */
  listWithAddresses(sessionId: string): Promise<(DraftInfo & { address: string })[]>;
}

const info = (r: Record<string, unknown>): DraftInfo => ({ id: String(r.id), name: String(r.name), added_at: String(r.created_at) });

export function createDraftService(db: Db, events: EventStore): DraftService {
  const byAddress = async (sessionId: string, address: string) =>
    (await db.execute('SELECT id, name, created_at FROM plugin_drafts WHERE session_id = ? AND address = ?', [sessionId, address])).rows[0];

  return {
    async list(sessionId) {
      const r = await db.execute('SELECT id, name, created_at FROM plugin_drafts WHERE session_id = ? ORDER BY created_at, id', [sessionId]);
      return r.rows.map((row) => info(row));
    },

    async add(sessionId, address, read, envelope) {
      const had = await byAddress(sessionId, address);
      if (had) return { draft: info(had), added: false };
      // Checked again below; this one keeps a full workspace from calling the studio.
      const count = Number((await db.execute('SELECT COUNT(*) AS n FROM plugin_drafts WHERE session_id = ?', [sessionId])).rows[0]?.n ?? 0);
      if (count >= DRAFTS_MAX) return 'full';
      // Read outside the transaction: the studio may be slow. Then look again, count and insert in
      // one transaction, so overlapping adds cannot pass the limit or return a draft never stored.
      const { name, content_hash } = await read();
      return db.transaction(async (tx) => {
        const now = (await tx.execute({ sql: 'SELECT id, name, created_at FROM plugin_drafts WHERE session_id = ? AND address = ?', args: [sessionId, address] })).rows[0];
        if (now) return { draft: info(now), added: false };
        const n = Number((await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM plugin_drafts WHERE session_id = ?', args: [sessionId] })).rows[0]?.n ?? 0);
        if (n >= DRAFTS_MAX) return 'full' as const;
        const draft = { id: newDraftId(), name, added_at: nowIso() };
        await tx.execute({
          sql: 'INSERT INTO plugin_drafts (id, session_id, address, name, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          args: [draft.id, sessionId, address, name, content_hash, draft.added_at],
        });
        await events.appendServer(sessionId, 'plugin_draft_add', { draft_id: draft.id, name, content_hash }, envelope, tx);
        return { draft, added: true };
      });
    },

    async remove(sessionId, draftId, envelope) {
      return db.transaction(async (tx) => {
        const r = await tx.execute({ sql: 'SELECT name FROM plugin_drafts WHERE session_id = ? AND id = ?', args: [sessionId, draftId] });
        const row = r.rows[0];
        if (!row) return false;
        await tx.execute({ sql: 'DELETE FROM plugin_drafts WHERE session_id = ? AND id = ?', args: [sessionId, draftId] });
        await events.appendServer(sessionId, 'plugin_draft_remove', { draft_id: draftId, name: String(row.name) }, envelope, tx);
        return true;
      });
    },

    async listWithAddresses(sessionId) {
      const r = await db.execute('SELECT id, name, created_at, address FROM plugin_drafts WHERE session_id = ? ORDER BY created_at, id', [sessionId]);
      return r.rows.map((row) => ({ ...info(row), address: String(row.address) }));
    },

    async addressOf(sessionId, draftId) {
      const r = await db.execute('SELECT address FROM plugin_drafts WHERE session_id = ? AND id = ?', [sessionId, draftId]);
      return r.rows[0] ? String(r.rows[0].address) : null;
    },
  };
}
