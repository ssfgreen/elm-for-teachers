/**
 * A workspace's drafts in a chat (#159). A draft has no passport, so it is always Ask first: the
 * teacher allows it once in each chat, with the same grants (plugin_grants, plugin_request,
 * plugin_grant) as a catalogue plugin, keyed by the draft's id. A turn reads each draft at the
 * studio as it starts, so a change in the studio shows up on the next message; one that cannot be
 * read is still listed, as unavailable.
 */
import type { PluginInfo } from '@edw/shared';
import type { Db } from '../../db/client.js';
import type { AppDeps, EventStore, ServerEnvelope } from '../../deps.js';
import { studioOrigins } from '../../env/studio.js';
import { allowInChat, chatGrants } from '../grants.js';
import type { LibraryClient } from '../library-client.js';
import { createDraftRunner, type DraftManifest, type DraftRunner } from './runner.js';
import { createDraftService, type DraftService } from './service.js';

/** A draft as a turn sees it. Never its address. */
export interface TurnDraft {
  id: string;
  name: string;
  /** Allowed by the teacher in this chat. */
  allowed: boolean;
  /** What the studio said it holds; null when it could not be read just now. */
  manifest: DraftManifest | null;
  client: LibraryClient | null;
}

export interface DraftChat {
  /** The workspace's drafts for a turn in this chat, each read at the studio (all at once). */
  forTurn(sessionId: string, threadId: string): Promise<TurnDraft[]>;
  /** The drafts as the chat's Ask first banner reads them (GET /plugins?thread_id=). */
  infos(sessionId: string, threadId: string): Promise<PluginInfo[]>;
  /** The teacher allowed a draft in a chat; null when the workspace has no such draft. */
  grant(sessionId: string, threadId: string, draftId: string, envelope: ServerEnvelope): Promise<PluginInfo | null>;
}

const DESCRIPTION = 'A plugin draft from the studio, not yet published.';

export function draftInfo(d: { id: string; name: string }, grant: string | undefined): PluginInfo {
  // Its kind is known only once the studio is read; the banner needs only the name.
  return { id: d.id, kind: 'library', name: d.name, publisher: 'Plugin studio', description: DESCRIPTION, licence: 'unknown', tags: ['draft'], trust: 'ask', available: true, allowed: grant === 'allowed', requested: grant === 'requested' };
}

/** `origins`: the studio origins allowed now (PLUGIN_STUDIO_URL); a draft from any other is left out. */
export function createDraftChat(db: Db, events: EventStore, drafts: DraftService, runner: DraftRunner, origins: readonly string[]): DraftChat {
  const grants = (sessionId: string, threadId: string) => chatGrants(db, sessionId, threadId);
  const allowedOrigin = (address: string) => {
    try {
      return origins.includes(new URL(address).origin);
    } catch {
      return false;
    }
  };
  /** The drafts with their addresses, only those from an allowed studio. */
  const withAddresses = async (sessionId: string) => {
    return (await drafts.listWithAddresses(sessionId)).filter((d) => allowedOrigin(d.address));
  };

  return {
    async forTurn(sessionId, threadId) {
      if (origins.length === 0) return [];
      const [list, granted] = await Promise.all([withAddresses(sessionId), grants(sessionId, threadId)]);
      return Promise.all(
        list.map(async (d) => {
          const manifest = await runner.read(d.address);
          return { id: d.id, name: d.name, allowed: granted.get(d.id) === 'allowed', manifest, client: manifest ? runner.client(d.address) : null };
        }),
      );
    },

    async infos(sessionId, threadId) {
      if (origins.length === 0) return [];
      const [list, granted] = await Promise.all([withAddresses(sessionId), grants(sessionId, threadId)]);
      return list.map((d) => draftInfo(d, granted.get(d.id)));
    },

    async grant(sessionId, threadId, draftId, envelope) {
      if (origins.length === 0) return null;
      const d = (await withAddresses(sessionId)).find((x) => x.id === draftId);
      if (!d) return null;
      await allowInChat(db, events, sessionId, threadId, draftId, envelope);
      return draftInfo(d, 'allowed');
    },
  };
}

/** The app's own: the studio reached with deps.studioFetch (tests give a fake). */
export const draftChatFor = (deps: Pick<AppDeps, 'db' | 'events' | 'env' | 'studioFetch'>): DraftChat =>
  createDraftChat(deps.db, deps.events, createDraftService(deps.db, deps.events), createDraftRunner(deps.studioFetch ?? fetch), studioOrigins(deps.env));
