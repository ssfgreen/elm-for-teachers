import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@edw/shared';
import type { AppDeps } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { NEW_THREAD_TITLE } from './service.js';

let t: TempDb;
let deps: AppDeps;
beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());

describe('thread rename', () => {
  it('names a thread, logs thread_rename, and refuses another session\'s thread', async () => {
    const { session, thread } = await newWorkspace(deps);
    const other = await newWorkspace(deps);
    expect(thread.title).toBe(NEW_THREAD_TITLE);
    const renamed = await deps.threads.rename(session.session_id, thread.id, 'Similes for 7B', envelopeFor(null, null, 'chat'));
    expect(renamed).toMatchObject({ id: thread.id, title: 'Similes for 7B' });
    expect((await deps.threads.get(session.session_id, thread.id))?.title).toBe('Similes for 7B');
    const ev = (await deps.events.list(session.session_id, { kinds: ['thread_rename'] }))[0]!;
    expect(ev).toMatchObject({ thread_id: thread.id, focus_pane: 'chat', payload: { thread_id: thread.id, title: 'Similes for 7B' } });
    expect(await deps.threads.rename(session.session_id, other.thread.id, 'x', envelopeFor(null, null))).toBeNull();
    expect(await deps.threads.rename(session.session_id, newUlid(), 'x', envelopeFor(null, null))).toBeNull();
  });
});
