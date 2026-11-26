import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES, DEFAULT_PLUGINS, PluginEntry, type PluginTrust } from '@edw/shared';
import type { TurnDraft } from '../plugins/drafts/chat.js';
import type { LibraryClient } from '../plugins/library-client.js';
import type { PluginState } from '../plugins/service.js';
import { libraryCatalogue } from './context-messages.js';
import { toolsByName } from './tools/index.js';
import { turnPlugins } from './turn-plugins.js';

const pedagogy = PluginEntry.parse({ id: 'pedagogy', kind: 'pedagogy', name: 'Pedagogy', publisher: 'P', description: 'P.', licence: 'unknown', library: { collection: 'pedagogy-scotland' } });
const state = (entry: PluginEntry, trust: PluginTrust): PluginState => ({ entry, trust, url: entry.kind === 'pictures' ? null : 'https://lib.example', available: true, allowed: trust === 'use', requested: false });
const catalogue = [state(DEFAULT_PLUGINS[0]!, 'use'), state(pedagogy, 'use')];
const client: LibraryClient = { call: async () => ({}) };
const draftClient: LibraryClient = { call: async () => ({ from: 'draft' }) };
const HASH = `sha256:${'c'.repeat(64)}`;
const draft = (o: Partial<TurnDraft> & { kind?: 'library' | 'pedagogy' | null }): TurnDraft => {
  const { kind = 'library', ...rest } = o;
  return { id: 'd-notes001', name: 'Simile notes', allowed: false, manifest: { content_hash: HASH, collection: kind ? { id: 'notes', kind } : null, description: 'Similes for P5.' }, client: draftClient, ...rest };
};
const run = (drafts: TurnDraft[], features = DEFAULT_FEATURES) => turnPlugins(catalogue, toolsByName(['read_document', 'search_pictures']), () => client, features, undefined, drafts);

describe('studio drafts in a turn (#159)', () => {
  it('offers a draft as a library, Ask first until allowed, and marks it in chat_prompt with its content hash', () => {
    const out = run([draft({})]);
    expect(out.libraries.map((l) => [l.id, l.collection, l.draft, l.unavailable])).toEqual([['d-notes001', 'notes', true, undefined]]);
    expect(out.libraries[0]!.client).toBe(draftClient);
    expect([...out.askFirst]).toEqual(['d-notes001']);
    expect(out.onOffer).toEqual([{ id: 'arasaac', trust: 'use' }, { id: 'pedagogy', trust: 'use' }, { id: 'd-notes001', trust: 'ask', draft: true, content_hash: HASH }]);
    expect(libraryCatalogue(out.libraries, out.askFirst)).toContain("- Simile notes (id: d-notes001; a draft from the teacher's plugin studio; Ask first: not allowed in this chat yet): Similes for P5.");
    expect([...run([draft({ allowed: true })]).askFirst]).toEqual([]);
  });

  it('shows a draft the studio could not give as unavailable, with no content hash, and its tools say so', async () => {
    const out = run([draft({ manifest: null, client: null })]);
    expect(out.libraries[0]).toMatchObject({ id: 'd-notes001', unavailable: true });
    await expect(out.libraries[0]!.client.call('notes', 'search', {})).rejects.toThrow('could not be read');
    expect(out.onOffer.at(-1)).toEqual({ id: 'd-notes001', trust: 'ask', draft: true, content_hash: null });
    expect(libraryCatalogue(out.libraries, out.askFirst)).toContain('unavailable just now');
  });

  it('lets a pedagogy draft stand in for the built-in pedagogy library once allowed in the chat, the built-in staying until then', () => {
    const allowed = run([draft({ id: 'd-ped00001', name: 'My pedagogy', kind: 'pedagogy', allowed: true })]);
    expect(allowed.pedagogy).toEqual({ pluginId: 'd-ped00001', name: 'My pedagogy', collection: 'notes', client: draftClient });
    expect(allowed.onOffer.map((o) => o.id)).toEqual(['arasaac', 'd-ped00001']);
    expect(allowed.libraries).toEqual([]);
    expect(allowed.pedagogyRequest).toBeNull();
    // Not yet allowed: the built-in stays meanwhile, and a class chat asks for the draft.
    const asking = run([draft({ id: 'd-ped00001', kind: 'pedagogy' })]);
    expect(asking.pedagogy?.pluginId).toBe('pedagogy');
    expect(asking.onOffer.map((o) => o.id)).toEqual(['arasaac', 'pedagogy', 'd-ped00001']);
    expect(asking.pedagogyRequest).toBe('d-ped00001');
    expect([...asking.askFirst]).toEqual(['d-ped00001']);
    // Without a draft, the built-in is there as before.
    expect(run([]).pedagogy?.pluginId).toBe('pedagogy');
  });

  it('takes only the first pedagogy draft, none with pedagogy off, and no draft with plugins off', () => {
    const two = [draft({ id: 'd-ped00001', kind: 'pedagogy', allowed: true }), draft({ id: 'd-ped00002', kind: 'pedagogy', allowed: true })];
    expect(run(two).onOffer.filter((o) => o.draft).map((o) => o.id)).toEqual(['d-ped00001']);
    const pedOff = run(two, { ...DEFAULT_FEATURES, pedagogy: false });
    expect(pedOff.pedagogy).toBeNull();
    expect(pedOff.onOffer.filter((o) => o.draft)).toEqual([]);
    const off = run([draft({}), draft({ id: 'd-ped00001', kind: 'pedagogy' })], { ...DEFAULT_FEATURES, plugins: false });
    expect(off.libraries).toEqual([]);
    expect(off.onOffer.filter((o) => o.draft)).toEqual([]);
    expect(off.pedagogy?.pluginId).toBe('pedagogy');
  });
});
