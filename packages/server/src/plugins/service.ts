/**
 * Plugins for a workspace (docs/plugins.md): the catalogue (config `plugins`) with the teacher's
 * trust level for each, and Ask first in each chat. Every change is logged in the same
 * transaction as the write: plugin_trust_set, plugin_request, plugin_grant.
 */
import { nowIso, type PluginEntry, type PluginInfo, type PluginTrust } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { allowInChat, chatGrants } from './grants.js';

/** A plugin as a turn sees it: its entry, the workspace's trust, and whether it can be used in this chat now. */
export interface PluginState {
  entry: PluginEntry;
  trust: PluginTrust;
  /** The library server it needs, or null (a picture library needs none; a library without one is not set up). */
  url: string | null;
  available: boolean;
  /** Use freely, or Ask first and allowed in this chat. */
  allowed: boolean;
  requested: boolean;
}

export interface PluginService {
  /** Every plugin in the catalogue with this workspace's trust; with a chat, its Ask first state too. */
  states(sessionId: string, threadId?: string | null): Promise<PluginState[]>;
  /** Null for a plugin not in the catalogue. Setting the level it already has logs nothing. */
  setTrust(sessionId: string, pluginId: string, trust: PluginTrust, envelope: ServerEnvelope): Promise<PluginState | null>;
  /** The assistant asked for an Ask first plugin in a chat (already allowed or asked: nothing). */
  request(sessionId: string, threadId: string, pluginId: string, turnId: string, envelope: ServerEnvelope): Promise<void>;
  /** The teacher allowed an Ask first plugin in a chat. Null for a plugin not in the catalogue. */
  grant(sessionId: string, threadId: string, pluginId: string, envelope: ServerEnvelope): Promise<PluginState | null>;
}

/** The library server a plugin uses: its own url, else the server's LIBRARY_URL. */
export function libraryUrl(entry: PluginEntry, fallback: string | undefined): string | null {
  if (entry.kind === 'pictures') return null;
  return (entry.library?.url ?? fallback ?? null)?.replace(/\/+$/, '') ?? null;
}

/** What the Plugins screen is told: no server addresses. */
export function pluginInfo(s: PluginState, withChat: boolean): PluginInfo {
  const { id, kind, name, publisher, description, licence, homepage, tags } = s.entry;
  return {
    id,
    kind,
    name,
    publisher,
    description,
    licence,
    ...(homepage ? { homepage } : {}),
    tags,
    trust: s.trust,
    available: s.available,
    ...(withChat && s.trust === 'ask' ? { allowed: s.allowed, requested: s.requested } : {}),
  };
}

export function createPluginService(db: Db, events: EventStore, catalogue: readonly PluginEntry[], libraryFallback?: string): PluginService {
  const byId = new Map(catalogue.map((p) => [p.id, p]));

  async function states(sessionId: string, threadId?: string | null): Promise<PluginState[]> {
    const set = await db.execute('SELECT plugin_id, trust FROM plugin_settings WHERE session_id = ?', [sessionId]);
    const trustOf = new Map(set.rows.map((r) => [String(r.plugin_id), String(r.trust) as PluginTrust]));
    const grantOf = threadId ? await chatGrants(db, sessionId, threadId) : new Map<string, string>();
    return catalogue.map((entry) => {
      const trust = trustOf.get(entry.id) ?? entry.default_trust;
      const url = libraryUrl(entry, libraryFallback);
      const grant = grantOf.get(entry.id);
      return {
        entry,
        trust,
        url,
        available: entry.kind === 'pictures' || url !== null,
        allowed: trust === 'use' || (trust === 'ask' && grant === 'allowed'),
        requested: trust === 'ask' && grant === 'requested',
      };
    });
  }

  const one = async (sessionId: string, pluginId: string, threadId?: string) => (await states(sessionId, threadId)).find((s) => s.entry.id === pluginId) ?? null;

  return {
    states,

    async setTrust(sessionId, pluginId, trust, envelope) {
      const entry = byId.get(pluginId);
      if (!entry) return null;
      const before = (await one(sessionId, pluginId))!.trust;
      if (before !== trust) {
        await db.transaction(async (tx) => {
          await tx.execute({
            sql: 'INSERT INTO plugin_settings (session_id, plugin_id, trust, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (session_id, plugin_id) DO UPDATE SET trust = excluded.trust, updated_at = excluded.updated_at',
            args: [sessionId, pluginId, trust, nowIso()],
          });
          await events.appendServer(sessionId, 'plugin_trust_set', { plugin_id: pluginId, trust, before }, envelope, tx);
        });
      }
      return one(sessionId, pluginId);
    },

    async request(sessionId, threadId, pluginId, turnId, envelope) {
      await db.transaction(async (tx) => {
        const r = await tx.execute({
          sql: "INSERT INTO plugin_grants (session_id, thread_id, plugin_id, status, updated_at) VALUES (?, ?, ?, 'requested', ?) ON CONFLICT (thread_id, plugin_id) DO NOTHING",
          args: [sessionId, threadId, pluginId, nowIso()],
        });
        if (r.rowsAffected > 0) await events.appendServer(sessionId, 'plugin_request', { plugin_id: pluginId, turn_id: turnId }, { ...envelope, thread_id: threadId }, tx);
      });
    },

    async grant(sessionId, threadId, pluginId, envelope) {
      if (!byId.has(pluginId)) return null;
      // Only an Ask first plugin is allowed in a chat; at any other level this changes nothing.
      if ((await one(sessionId, pluginId))?.trust === 'ask') await allowInChat(db, events, sessionId, threadId, pluginId, envelope);
      return one(sessionId, pluginId, threadId);
    },
  };
}
