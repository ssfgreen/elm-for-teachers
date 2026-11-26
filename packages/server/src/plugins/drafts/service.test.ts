import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionRow } from '../../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../../test-helpers.js';
import { createDraftService, DRAFTS_MAX, type DraftService } from './service.js';
import type { DraftRead } from './studio.js';

let t: TempDb;
let drafts: DraftService;
let s: SessionRow;
const envelope = envelopeFor(null, null, 'none');
const at = (i: number | string) => `https://studio.example/d/code-${i}-abcdef`;
const slow = (ms: number): (() => Promise<DraftRead>) => () => new Promise((r) => setTimeout(() => r({ name: 'Slow', content_hash: null }), ms));

beforeEach(async () => {
  t = await tempDb();
  const deps = testDeps(t.db);
  drafts = createDraftService(t.db, deps.events);
  s = (await newWorkspace(deps)).session;
});

afterEach(() => t.cleanup());

describe('draft service, adds at the same time', () => {
  it(`never holds more than ${DRAFTS_MAX}, even when adds overlap while the studio is read`, async () => {
    for (let i = 0; i < DRAFTS_MAX - 1; i++) await drafts.add(s.session_id, at(i), slow(0), envelope);
    const results = await Promise.all(['a', 'b', 'c', 'd'].map((x) => drafts.add(s.session_id, at(x), slow(100), envelope)));
    expect(results.filter((r) => r !== 'full')).toHaveLength(1);
    expect(await drafts.list(s.session_id)).toHaveLength(DRAFTS_MAX);
  });

  it('gives overlapping adds of one address the one stored draft', async () => {
    const [a, b] = await Promise.all([drafts.add(s.session_id, at('x'), slow(50), envelope), drafts.add(s.session_id, at('x'), slow(100), envelope)]);
    if (a === 'full' || b === 'full') throw new Error('full');
    expect(b.draft.id).toBe(a.draft.id);
    expect([a.added, b.added]).toEqual([true, false]);
    expect((await drafts.list(s.session_id)).map((d) => d.id)).toEqual([a.draft.id]);
  });

  it('returns a stored draft when the same address was added and removed while the studio was read', async () => {
    let otherId = '';
    const read = async () => {
      const r = await drafts.add(s.session_id, at('y'), slow(0), envelope);
      if (r !== 'full') otherId = r.draft.id;
      await drafts.remove(s.session_id, otherId, envelope);
      return { name: 'Later', content_hash: null };
    };
    const r = await drafts.add(s.session_id, at('y'), read, envelope);
    if (r === 'full') throw new Error('full');
    expect((await drafts.list(s.session_id)).map((d) => d.id)).toEqual([r.draft.id]);
  });
});

describe('draft service, for a turn (#159)', () => {
  it("lists only this workspace's drafts with their addresses, oldest first", async () => {
    await drafts.add(s.session_id, at(1), slow(0), envelope);
    await drafts.add(s.session_id, at(2), slow(0), envelope);
    const listed = await drafts.listWithAddresses(s.session_id);
    expect(listed.map((d) => d.address)).toEqual([at(1), at(2)]);
    expect(listed.map((d) => ({ id: d.id, name: d.name, added_at: d.added_at }))).toEqual(await drafts.list(s.session_id));
    expect(await drafts.listWithAddresses('another-session')).toEqual([]);
  });
});
