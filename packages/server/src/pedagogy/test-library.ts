/** For tests: the library plugins, and a fake library server that records each call. */
import { DEFAULT_PLUGINS, PluginEntry } from '@edw/shared';
import type { AppDeps } from '../deps.js';
import { LibraryError, type LibraryClient, type LibraryOp } from '../plugins/library-client.js';
import { testEnv } from '../test-helpers.js';

export const EO_PLUGIN = PluginEntry.parse({ id: 'education-scotland-eo', kind: 'library', name: 'Experiences and outcomes', publisher: 'Education Scotland', description: 'Every E&O.', licence: 'OGL', library: { collection: 'education-scotland-eo' } });
export const PEDAGOGY_PLUGIN = PluginEntry.parse({ id: 'pedagogy-scotland', kind: 'pedagogy', name: 'Pedagogy library', publisher: 'Draft', description: 'Draft pedagogy.', licence: 'Mixed', library: { collection: 'pedagogy-scotland' } });

export interface FakeCall {
  url: string;
  collection: string;
  op: LibraryOp;
  body: Record<string, unknown>;
}

/** Answers by operation; a function answer gets the body. Throws LibraryError(404) for an op with no answer. */
export function fakeLibrary(answers: Partial<Record<LibraryOp, Record<string, unknown> | ((body: Record<string, unknown>) => Record<string, unknown>)>>) {
  const calls: FakeCall[] = [];
  const clientFor = (url: string): LibraryClient => ({
    async call(collection, op, body) {
      calls.push({ url, collection, op, body });
      const a = answers[op];
      if (!a) throw new LibraryError(`no ${op} here`, 404);
      return { version: 'v1', ...(typeof a === 'function' ? a(body) : a) };
    },
  });
  return { calls, clientFor };
}

/** Deps with both library plugins on a library server, reached through `clientFor`. */
export function withLibraries(base: AppDeps, clientFor: (url: string) => LibraryClient): AppDeps {
  return { ...base, env: testEnv({ LIBRARY_URL: 'http://library.test' }), libraryClient: clientFor, loaded: { ...base.loaded, config: { ...base.loaded.config, plugins: [...DEFAULT_PLUGINS, EO_PLUGIN, PEDAGOGY_PLUGIN] } } };
}
