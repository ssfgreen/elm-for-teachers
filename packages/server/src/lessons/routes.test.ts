import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;

const env = { client_ts: '2026-11-26T10:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  t.cleanup();
});

async function makeWorkspace() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/sessions',
    headers: { authorization: `Bearer ${ADMIN_PASSWORD}` },
    payload: { label: 'Lesson test' },
  });
  const s = res.json().session as { session_id: string; participant_token: string };
  return { sid: s.session_id, auth: { authorization: `Bearer ${s.participant_token}` } };
}

describe('lesson progress routes & curriculum/plugin schema prep (T4/T5)', () => {
  it('stores and retrieves onboarding lesson progress keyed on session_id', async () => {
    const { sid, auth } = await makeWorkspace();

    const initial = await app.inject({ method: 'GET', url: `/api/sessions/${sid}/lessons`, headers: auth });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().lessons).toEqual([]);

    const started = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/lessons/getting-started`,
      headers: auth,
      payload: { status: 'in_progress', state: { step: 2 }, envelope: env },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().lesson.completed_at).toBeNull();
    expect(started.json().lesson.state).toEqual({ step: 2 });

    const done = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/lessons/getting-started`,
      headers: auth,
      payload: { status: 'completed', envelope: env },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().lesson.completed_at).toBeTruthy();
    expect(done.json().lesson.state).toEqual({ step: 2 });

    const listed = await app.inject({ method: 'GET', url: `/api/sessions/${sid}/lessons`, headers: auth });
    expect(listed.json().lessons).toHaveLength(1);

    const badId = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${sid}/lessons/BAD%20ID`,
      headers: auth,
      payload: { status: 'in_progress', envelope: env },
    });
    expect(badId.statusCode).toBe(400);
  });

  it('persists nullable curriculum_profile on classes and standard_uri on class_curriculum', async () => {
    const { sid, auth } = await makeWorkspace();
    const yg = await app.inject({ method: 'POST', url: `/api/sessions/${sid}/year-groups`, headers: auth, payload: { name: 'P7', envelope: env } });
    const ygId = yg.json().year_group.id as string;

    const profile = { jurisdiction: 'scotland', framework: 'cfe', level: 'second', mcp_endpoint: 'https://curriculum.example.org/mcp' };
    const cls = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/classes`,
      headers: auth,
      payload: { year_group_id: ygId, name: 'P7C', curriculum_profile: profile, envelope: env },
    });
    expect(cls.statusCode).toBe(201);
    expect(cls.json().class.curriculum_profile).toEqual(profile);
    const classId = cls.json().class.id as string;

    const picked = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/classes/${classId}/curriculum`,
      headers: auth,
      payload: {
        status: 'now',
        items: [{ code: 'LIT 2-16a', text: 'To show my understanding across different areas of learning.', standard_uri: 'urn:uuid:11111111-2222-3333-4444-555555555555' }],
        envelope: env,
      },
    });
    expect(picked.statusCode).toBe(201);
    expect(picked.json().items[0].standard_uri).toBe('urn:uuid:11111111-2222-3333-4444-555555555555');
  });
});
