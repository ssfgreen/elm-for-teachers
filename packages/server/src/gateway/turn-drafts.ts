/**
 * A workspace's studio drafts in a turn (#159), for turn-plugins.ts. Every draft is Ask first. A
 * pedagogy draft stands in for the built-in pedagogy library for this workspace once the teacher
 * allows it in a chat (the built-in stays until then); any other draft is offered as a library.
 * A draft the studio could not give just now is still listed, as unavailable, and its tools say so. Pure, so it can be tested without a database or a studio.
 */
import type { Features, PluginOnOffer } from '@edw/shared';
import { LibraryError, type LibraryClient } from '../plugins/library-client.js';
import type { TurnDraft } from '../plugins/drafts/chat.js';
import type { CollectionSource } from '../pedagogy/source.js';
import type { LibraryOnOffer } from './tools/types.js';

/** What the model is told about a draft whose manifest has no description. */
const DRAFT_DESCRIPTION = 'A plugin draft the teacher is making in the plugin studio, not yet published.';

/** The tools of a draft that could not be read: each call says so. */
const unavailableClient: LibraryClient = {
  call: async () => {
    throw new LibraryError('the draft could not be read at the studio just now', null);
  },
};

export interface DraftsInTurn {
  /** The pedagogy draft that stands in for the built-in pedagogy library, if any. */
  pedagogy: TurnDraft | null;
  libraries: LibraryOnOffer[];
  /** Drafts on offer and not yet allowed in this chat. */
  askFirst: string[];
  onOffer: PluginOnOffer[];
}

const isPedagogy = (d: TurnDraft) => d.manifest?.collection?.kind === 'pedagogy';

export function draftsInTurn(drafts: readonly TurnDraft[], features: Pick<Features, 'plugins' | 'pedagogy'>): DraftsInTurn {
  // Drafts are plugins: with the workspace's plugins switch off, none is offered.
  const on = features.plugins ? drafts : [];
  // The first pedagogy draft, with pedagogy on; a second, or any with pedagogy off, is left out.
  const pedagogy = (features.pedagogy && on.find(isPedagogy)) || null;
  const asLibrary = on.filter((d) => !isPedagogy(d));
  const offered = [...(pedagogy ? [pedagogy] : []), ...asLibrary];
  return {
    pedagogy,
    libraries: asLibrary.map((d) => {
      const usable = d.manifest?.collection && d.client;
      return {
        id: d.id,
        name: d.name,
        description: d.manifest?.description ?? DRAFT_DESCRIPTION,
        collection: d.manifest?.collection?.id ?? '',
        client: usable ? d.client! : unavailableClient,
        draft: true,
        ...(usable ? {} : { unavailable: true }),
      };
    }),
    askFirst: offered.filter((d) => !d.allowed).map((d) => d.id),
    onOffer: offered.map((d) => ({ id: d.id, trust: 'ask', draft: true, content_hash: d.manifest?.content_hash ?? null })),
  };
}

/** The pedagogy draft as the pedagogy tools read it, once the teacher has allowed it in this chat. */
export function draftSource(d: TurnDraft): CollectionSource | null {
  return d.allowed && d.client && d.manifest?.collection ? { pluginId: d.id, name: d.name, collection: d.manifest.collection.id, client: d.client } : null;
}
