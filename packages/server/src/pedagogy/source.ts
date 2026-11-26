/**
 * Where the app reaches the pedagogy library and the experiences and outcomes: collections on a
 * library server, over HTTP only (docs/plugins.md). The pedagogy library is a plugin of kind
 * `pedagogy`; the curriculum picker uses the experiences and outcomes collection whatever its
 * trust level, since that is the teacher's own browsing, not the assistant's.
 */
import type { PluginState } from '../plugins/service.js';
import type { LibraryClient } from '../plugins/library-client.js';

/** The E&O collection (framework `cfe-eo`), as markdown. */
export const EO_COLLECTION = 'education-scotland-eo';
/** The structured curriculum the picker reads: outcomes by area, organiser and level, and benchmarks. */
export const CURRICULUM_COLLECTION = 'cfe-curriculum';

export interface CollectionSource {
  pluginId: string;
  name: string;
  collection: string;
  client: LibraryClient;
}

const sourceOf = (s: PluginState, clientFor: (url: string) => LibraryClient): CollectionSource => ({ pluginId: s.entry.id, name: s.entry.name, collection: s.entry.library!.collection, client: clientFor(s.url!) });

/** The pedagogy library on offer: the first pedagogy plugin set up here and not Off. */
export function pedagogySource(states: readonly PluginState[], clientFor: (url: string) => LibraryClient, opts: { evenIfOff?: boolean } = {}): CollectionSource | null {
  const s = states.find((x) => x.entry.kind === 'pedagogy' && x.available && x.url && x.entry.library && (opts.evenIfOff || x.trust !== 'off'));
  return s ? sourceOf(s, clientFor) : null;
}

/** The experiences and outcomes collection, when a library plugin set up here holds it. */
export function outcomesSource(states: readonly PluginState[], clientFor: (url: string) => LibraryClient): CollectionSource | null {
  const s = states.find((x) => x.entry.kind === 'library' && x.available && x.url && x.entry.library?.collection === EO_COLLECTION);
  return s ? sourceOf(s, clientFor) : null;
}

/**
 * The structured curriculum: on the E&O plugin's library server, else LIBRARY_URL. It is the
 * teacher's own reference, not a plugin for the assistant, so it needs no trust level.
 */
export function curriculumSource(states: readonly PluginState[], clientFor: (url: string) => LibraryClient, libraryUrl: string | undefined): CollectionSource | null {
  const url = outcomesSource(states, clientFor) ? states.find((x) => x.entry.library?.collection === EO_COLLECTION)!.url : (libraryUrl?.replace(/\/+$/, '') ?? null);
  return url ? { pluginId: CURRICULUM_COLLECTION, name: 'The curriculum', collection: CURRICULUM_COLLECTION, client: clientFor(url) } : null;
}
