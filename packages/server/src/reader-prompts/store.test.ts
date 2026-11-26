import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReaderPromptFields } from '@edw/shared';
import type { AppDeps, SessionRow } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { createReaderPromptStore, type ReaderPromptStore } from './store.js';

const envelope = envelopeFor(null, null, 'none');
const defaults: ReaderPromptFields[] = [
  { label: 'One', instruction: 'First.', after_highlight: true, follow_up: false },
  { label: 'Two', instruction: 'Second.', after_highlight: false, follow_up: true },
];
const mine: ReaderPromptFields = { label: 'Mine', instruction: 'Mine.', after_highlight: false, follow_up: false };

let t: TempDb;
let deps: AppDeps;
let store: ReaderPromptStore;
let s: SessionRow;

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  store = createReaderPromptStore(t.db, deps.events, () => defaults);
  s = (await newWorkspace(deps)).session;
});

afterEach(() => t.cleanup());

const adds = async () => (await deps.events.list(s.session_id)).filter((e) => e.kind === 'reader_prompt_add');

describe('reader prompt store', () => {
  it('puts the defaults in once when two first reads overlap', async () => {
    const [a, b] = await Promise.all([store.list(s.session_id), store.list(s.session_id)]);
    expect(a.map((p) => p.label)).toEqual(['One', 'Two']);
    expect(b).toEqual(a);
    expect(await adds()).toHaveLength(2);
  });

  it('puts the defaults in before a first write, so a new prompt goes after them', async () => {
    const p = await store.add(s.session_id, mine, envelope);
    if (p === 'full') throw new Error('full');
    expect((await store.list(s.session_id)).map((x) => x.label)).toEqual(['One', 'Two', 'Mine']);
    expect((await adds()).map((e) => e.payload)).toEqual((await store.list(s.session_id)).map((x) => ({ prompt_id: x.id })));
    const sources = (await t.db.execute('SELECT source FROM reader_prompts WHERE session_id = ? ORDER BY position', [s.session_id])).rows.map((r) => r.source);
    expect(sources).toEqual(['default', 'default', 'teacher']);
  });

  it('logs nothing for a reorder that moves nothing, and keeps each workspace to its own prompts', async () => {
    const before = await store.list(s.session_id);
    expect(await store.reorder(s.session_id, before.map((p) => p.id), envelope)).toEqual(before);
    expect((await deps.events.list(s.session_id)).filter((e) => e.kind === 'reader_prompt_reorder')).toEqual([]);
    const other = (await newWorkspace(deps, 'B')).session;
    expect(await store.remove(other.session_id, before[0]!.id, envelope)).toBe(false);
    expect(await store.edit(other.session_id, before[0]!.id, { label: 'x' }, envelope)).toBeNull();
  });

  it('cannot edit a removed prompt', async () => {
    const [first] = await store.list(s.session_id);
    await store.remove(s.session_id, first!.id, envelope);
    expect(await store.edit(s.session_id, first!.id, { label: 'Back' }, envelope)).toBeNull();
    expect(await store.remove(s.session_id, first!.id, envelope)).toBe(false);
  });
});
