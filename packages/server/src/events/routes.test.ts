import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SERVER_ONLY_KINDS, nowIso, newUlid } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { focusEvent, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

const post = (events: unknown[]) =>
  app.inject({
    method: 'POST',
    url: `/api/sessions/${s.session_id}/events`,
    headers: { authorization: `Bearer ${s.participant_token}` },
    payload: { session_id: s.session_id, events },
  });

/** An event of the kind with a plausible payload, so only the kind can be the reason for a refusal. */
const forged = (kind: string) => ({ event_id: newUlid(), client_ts: nowIso(), focus_pane: 'none', doc_id: null, thread_id: null, kind, payload: {} });

describe('POST /api/sessions/:id/events', () => {
  it.each(['study_seed', 'pupil_rows_scrub', 'budget_update', 'workspace_export', 'chat_response', 'proposal_shown', 'chat_stop', 'participant_open', 'interaction_logging_set', 'asset_upload', 'workspace_link', 'workspace_features_set'])('refuses %s, a kind only the server writes, and stores nothing', async (kind) => {
    expect(SERVER_ONLY_KINDS).toContain(kind);
    const before = await deps.events.lastSeq(s.session_id);
    const res = await post([focusEvent(), forged(kind)]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'server_only_kind', error: expect.stringContaining(kind) });
    expect(await deps.events.lastSeq(s.session_id)).toBe(before);
  });

  it('still takes an ordinary batch', async () => {
    const res = await post([focusEvent()]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accepted: 1 });
  });
});
