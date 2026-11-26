/**
 * What a turn may use of the workspace's plugins (docs/plugins.md): the tools offered, the
 * libraries and their clients, which plugins must ask first, and what chat_prompt records.
 * Pure, so it can be tested without a database or a model.
 */
import { ARASAAC_PLUGIN_ID, type Features, type PluginOnOffer } from '@edw/shared';
import type { LibraryClient } from '../plugins/library-client.js';
import { curriculumSource, pedagogySource, type CollectionSource } from '../pedagogy/source.js';
import type { TurnDraft } from '../plugins/drafts/chat.js';
import type { PluginState } from '../plugins/service.js';
import { draftSource, draftsInTurn } from './turn-drafts.js';
import type { AgentTool, LibraryOnOffer } from './tools/types.js';

export interface TurnPlugins {
  /** The config's tools, less any whose plugin is Off (search_pictures for ARASAAC). */
  tools: AgentTool[];
  libraries: LibraryOnOffer[];
  /** Plugins on offer that are Ask first and not allowed in this chat yet. */
  askFirst: Set<string>;
  /** For chat_prompt: each plugin on offer and its trust level. */
  onOffer: PluginOnOffer[];
  /** The pedagogy library, when on offer and allowed (used only in a class or year group chat). */
  pedagogy: CollectionSource | null;
  /** A pedagogy draft on offer and not yet allowed in this chat: a class chat asks for it, and uses the built-in meanwhile (#159). */
  pedagogyRequest: string | null;
  /** The structured curriculum (the teacher's reference: no trust level), for benchmarks in a class chat. */
  curriculum: CollectionSource | null;
}

/**
 * `features`, the workspace's switches (#64): plugins off leaves out every library and picture
 * plugin; pedagogy off, the pedagogy library; curriculum off, the structured curriculum.
 * `drafts`, the workspace's studio drafts as read for this turn (#159, turn-drafts.ts).
 */
export function turnPlugins(
  states: readonly PluginState[],
  configTools: readonly AgentTool[],
  clientFor: (url: string) => LibraryClient,
  features: Pick<Features, 'plugins' | 'pedagogy' | 'curriculum'>,
  libraryUrl?: string,
  drafts: readonly TurnDraft[] = [],
): TurnPlugins {
  const allowed = (kind: PluginState['entry']['kind']) => (kind === 'pedagogy' ? features.pedagogy : features.plugins);
  const pictures = states.find((s) => s.entry.id === ARASAAC_PLUGIN_ID);
  const picturesOff = pictures?.trust === 'off' || !features.plugins;
  const tools = configTools.filter((t) => !(t.name === 'search_pictures' && picturesOff));
  // A picture library is on offer only where the config offers its tool.
  const fromStudio = draftsInTurn(drafts, features);
  // A pedagogy draft stands in for the built-in pedagogy library once allowed in this chat; until
  // then the built-in stays (review, round 1, default (a)).
  const standIn = fromStudio.pedagogy ? draftSource(fromStudio.pedagogy) : null;
  const offered = states.filter((s) => s.trust !== 'off' && s.available && allowed(s.entry.kind) && (s.entry.kind !== 'pictures' || (s.entry.id === ARASAAC_PLUGIN_ID && tools.some((t) => t.name === 'search_pictures'))) && !(standIn && s.entry.kind === 'pedagogy'));
  const libraries = offered
    .filter((s) => s.entry.kind === 'library' && s.url && s.entry.library)
    .map((s) => ({ id: s.entry.id, name: s.entry.name, description: s.entry.description, collection: s.entry.library!.collection, client: clientFor(s.url!) }));
  return {
    tools,
    libraries: [...libraries, ...fromStudio.libraries],
    askFirst: new Set([...offered.filter((s) => s.trust === 'ask' && !s.allowed).map((s) => s.entry.id), ...fromStudio.askFirst]),
    onOffer: [...offered.map((s) => ({ id: s.entry.id, trust: s.trust })), ...fromStudio.onOffer],
    // An allowed pedagogy draft, whose built-in is left out of `offered` above.
    pedagogy: standIn ?? pedagogySource(offered.filter((s) => s.allowed), clientFor),
    pedagogyRequest: fromStudio.pedagogy && !fromStudio.pedagogy.allowed ? fromStudio.pedagogy.id : null,
    curriculum: features.curriculum ? curriculumSource(states, clientFor, libraryUrl) : null,
  };
}
