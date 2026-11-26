import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES, DEFAULT_PLUGINS, PluginEntry, type PluginTrust } from '@edw/shared';
import type { LibraryClient } from '../plugins/library-client.js';
import type { PluginState } from '../plugins/service.js';
import { toolsByName } from './tools/index.js';
import { turnPlugins } from './turn-plugins.js';

const trails = PluginEntry.parse({ id: 'trails', kind: 'library', name: 'TRAILS', publisher: 'TRAILS', description: 'AI literacy.', licence: 'unknown', library: { collection: 'trails' } });
const state = (entry: PluginEntry, trust: PluginTrust, o: Partial<PluginState> = {}): PluginState => ({ entry, trust, url: entry.kind === 'library' ? 'https://lib.example' : null, available: true, allowed: trust === 'use', requested: false, ...o });
const client: LibraryClient = { call: async () => ({}) };
const urls: string[] = [];
const clientFor = (url: string) => {
  urls.push(url);
  return client;
};
const configTools = toolsByName(['read_document', 'edit_document', 'search_pictures']);
const names = (t: { name: string }[]) => t.map((x) => x.name);

describe('turn plugins', () => {
  it('offers pictures and a library used freely, with no asking', () => {
    const out = turnPlugins([state(DEFAULT_PLUGINS[0]!, 'use'), state(trails, 'use')], configTools, clientFor, DEFAULT_FEATURES);
    expect(names(out.tools)).toEqual(['read_document', 'edit_document', 'search_pictures']);
    expect(out.libraries.map((l) => [l.id, l.collection])).toEqual([['trails', 'trails']]);
    expect(urls.at(-1)).toBe('https://lib.example');
    expect([...out.askFirst]).toEqual([]);
    expect(out.onOffer).toEqual([{ id: 'arasaac', trust: 'use' }, { id: 'trails', trust: 'use' }]);
  });

  it('takes search_pictures away when the teacher turned pictures off, and leaves out a library that is off', () => {
    const out = turnPlugins([state(DEFAULT_PLUGINS[0]!, 'off'), state(trails, 'off')], configTools, clientFor, DEFAULT_FEATURES);
    expect(names(out.tools)).toEqual(['read_document', 'edit_document']);
    expect(out.libraries).toEqual([]);
    expect(out.onOffer).toEqual([]);
  });

  it('marks Ask first plugins not yet allowed in the chat, and not those allowed', () => {
    const out = turnPlugins([state(DEFAULT_PLUGINS[0]!, 'ask'), state(trails, 'ask', { allowed: true })], configTools, clientFor, DEFAULT_FEATURES);
    expect([...out.askFirst]).toEqual(['arasaac']);
    expect(out.libraries).toHaveLength(1);
    expect(out.onOffer).toEqual([{ id: 'arasaac', trust: 'ask' }, { id: 'trails', trust: 'ask' }]);
  });

  it('leaves out a library with no server, and pictures when the config offers no picture tool', () => {
    const out = turnPlugins([state(DEFAULT_PLUGINS[0]!, 'use'), state(trails, 'use', { available: false, url: null })], toolsByName(['read_document']), clientFor, DEFAULT_FEATURES);
    expect(out.libraries).toEqual([]);
    expect(out.onOffer).toEqual([]);
  });

  describe("with the workspace's switches (#64)", () => {
    const pedagogy = PluginEntry.parse({ id: 'pedagogy', kind: 'pedagogy', name: 'Pedagogy', publisher: 'P', description: 'P.', licence: 'unknown', library: { collection: 'pedagogy' } });
    const all = [state(DEFAULT_PLUGINS[0]!, 'use'), state(trails, 'ask'), state(pedagogy, 'use', { url: 'https://ped.example' })];
    const run = (off: Partial<typeof DEFAULT_FEATURES>) => turnPlugins(all, configTools, clientFor, { ...DEFAULT_FEATURES, ...off }, 'https://cur.example');

    it('with all on, offers pictures, the library, the pedagogy library and the curriculum', () => {
      const out = run({});
      expect(names(out.tools)).toContain('search_pictures');
      expect(out.libraries.map((l) => l.id)).toEqual(['trails']);
      expect(out.pedagogy?.pluginId).toBe('pedagogy');
      expect(out.curriculum).not.toBeNull();
    });

    it('with plugins off, offers no library or pictures and asks nothing first, but keeps the pedagogy library and the curriculum', () => {
      const out = run({ plugins: false });
      expect(names(out.tools)).toEqual(['read_document', 'edit_document']);
      expect(out.libraries).toEqual([]);
      expect([...out.askFirst]).toEqual([]);
      expect(out.onOffer).toEqual([{ id: 'pedagogy', trust: 'use' }]);
      expect(out.pedagogy?.pluginId).toBe('pedagogy');
      expect(out.curriculum).not.toBeNull();
    });

    it('with pedagogy off, has no pedagogy library and leaves the rest', () => {
      const out = run({ pedagogy: false });
      expect(out.pedagogy).toBeNull();
      expect(out.onOffer.map((o) => o.id)).toEqual(['arasaac', 'trails']);
      expect(out.libraries.map((l) => l.id)).toEqual(['trails']);
    });

    it('with curriculum off, has no curriculum and leaves the plugins', () => {
      const out = run({ curriculum: false });
      expect(out.curriculum).toBeNull();
      expect(out.libraries.map((l) => l.id)).toEqual(['trails']);
      expect(out.pedagogy?.pluginId).toBe('pedagogy');
    });
  });
});
