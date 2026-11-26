import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDeps } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { allowInChat, chatGrants } from './grants.js';

let t: TempDb;
let deps: AppDeps;
beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());

describe('Allow in a chat', () => {
  it('saves the grant and logs plugin_grant once, even for a double click', async () => {
    const { session, thread } = await newWorkspace(deps);
    const allow = () => allowInChat(t.db, deps.events, session.session_id, thread.id, 'd-abcd1234', envelopeFor(null, thread));
    await Promise.all([allow(), allow()]);
    await allow();
    expect((await chatGrants(t.db, session.session_id, thread.id)).get('d-abcd1234')).toBe('allowed');
    const logged = (await deps.events.list(session.session_id)).filter((e) => e.kind === 'plugin_grant');
    expect(logged.map((e) => [e.payload, e.thread_id])).toEqual([[{ plugin_id: 'd-abcd1234' }, thread.id]]);
  });
});
