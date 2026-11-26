/**
 * Ask first in a chat (docs/plugins.md): which plugins the teacher allowed, or the assistant asked
 * for, in a thread (`plugin_grants`), and the teacher's Allow. Used for catalogue plugins
 * (service.ts) and studio drafts (drafts/chat.ts), whose plugin_id is the draft's id.
 */
import { nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';

/** Each plugin's grant in a chat: `requested` or `allowed`. */
export async function chatGrants(db: Db, sessionId: string, threadId: string): Promise<Map<string, string>> {
  const r = await db.execute('SELECT plugin_id, status FROM plugin_grants WHERE session_id = ? AND thread_id = ?', [sessionId, threadId]);
  return new Map(r.rows.map((row) => [String(row.plugin_id), String(row.status)]));
}

/**
 * The teacher allowed a plugin in a chat: saved and logged as plugin_grant, unless it is allowed
 * already. Checked in the same transaction, so a double click logs it once.
 */
export async function allowInChat(db: Db, events: EventStore, sessionId: string, threadId: string, pluginId: string, envelope: ServerEnvelope): Promise<void> {
  await db.transaction(async (tx) => {
    const r = await tx.execute({ sql: 'SELECT status FROM plugin_grants WHERE thread_id = ? AND plugin_id = ?', args: [threadId, pluginId] });
    if (r.rows[0] && String(r.rows[0].status) === 'allowed') return;
    await tx.execute({
      sql: "INSERT INTO plugin_grants (session_id, thread_id, plugin_id, status, updated_at) VALUES (?, ?, ?, 'allowed', ?) ON CONFLICT (thread_id, plugin_id) DO UPDATE SET status = 'allowed', updated_at = excluded.updated_at",
      args: [sessionId, threadId, pluginId, nowIso()],
    });
    await events.appendServer(sessionId, 'plugin_grant', { plugin_id: pluginId }, { ...envelope, thread_id: threadId }, tx);
  });
}
