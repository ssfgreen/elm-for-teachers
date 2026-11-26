import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { loadClassContext } from '../classes/context.js';
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

async function makeWorkspace(features?: Record<string, boolean>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/sessions',
    headers: { authorization: `Bearer ${ADMIN_PASSWORD}` },
    payload: { label: 'Needs test', ...(features ? { features } : {}) },
  });
  expect(res.statusCode).toBe(201);
  const s = res.json().session as { session_id: string; participant_token: string };
  return { sid: s.session_id, auth: { authorization: `Bearer ${s.participant_token}` } };
}

describe('needs groups routes and assistant grounding (T1)', () => {
  it('creates, updates, attaches to classes, manages adaptations, and archives a needs group', async () => {
    const { sid, auth } = await makeWorkspace();

    const yg = await app.inject({ method: 'POST', url: `/api/sessions/${sid}/year-groups`, headers: auth, payload: { name: 'P7', envelope: env } });
    const ygId = yg.json().year_group.id as string;
    const cls = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/classes`,
      headers: auth,
      payload: { year_group_id: ygId, name: 'P7A', stage: 'Primary 7, Second level', subject: 'English', envelope: env },
    });
    const classId = cls.json().class.id as string;

    const created = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups`,
      headers: auth,
      payload: {
        name: 'Dyslexia support group',
        description: 'Learners working with longer decoding times.',
        what_helps: 'Chunked instructions, cream background, audio support.',
        class_ids: [classId],
        envelope: env,
      },
    });
    expect(created.statusCode).toBe(201);
    const groupId = created.json().group.id as string;
    expect(created.json().group.class_ids).toEqual([classId]);

    const updated = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups/${groupId}/update`,
      headers: auth,
      payload: { what_helps: 'Chunked instructions, line spacing 1.5, word banks.', envelope: env },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().group.what_helps).toContain('word banks');

    const added = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups/${groupId}/adaptations`,
      headers: auth,
      payload: {
        entry_id: 'adp-ACC-individual-spacing-background',
        title: 'Spacing and background',
        changes_goal: false,
        status: 'confirmed',
        overrides: '14pt, 1.5 spacing',
        envelope: env,
      },
    });
    expect(added.statusCode).toBe(201);
    const adaptationId = added.json().adaptation.id as string;

    // Duplicate entry_id is refused with 409.
    const dup = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups/${groupId}/adaptations`,
      headers: auth,
      payload: { entry_id: 'adp-ACC-individual-spacing-background', title: 'Spacing and background', changes_goal: false, envelope: env },
    });
    expect(dup.statusCode).toBe(409);

    // Assistant context for the class includes the linked needs group and its adaptation id.
    const classCtx = await loadClassContext(deps.db, sid, { class_id: classId }, true, { curriculum: true, adaptations: true, needsGroups: true });
    expect(classCtx?.text).toContain('### Needs groups');
    expect(classCtx?.text).toContain('Dyslexia support group');
    expect(classCtx?.text).toContain('Spacing and background');
    expect(classCtx?.focus.adaptationIds).toContain('adp-ACC-individual-spacing-background');

    // Threads can target a needs group standalone or combined with a class, never with a project.
    const standalone = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/threads`,
      headers: auth,
      payload: { needs_group_id: groupId, envelope: env },
    });
    expect(standalone.statusCode).toBe(201);
    expect(standalone.json().thread.needs_group_id).toBe(groupId);

    const standaloneCtx = await loadClassContext(deps.db, sid, standalone.json().thread, true, { curriculum: true, adaptations: true, needsGroups: true });
    expect(standaloneCtx?.text).toContain('## This needs group');
    expect(standaloneCtx?.text).toContain('Dyslexia support group');
    expect(standaloneCtx?.focus.adaptationIds).toEqual(['adp-ACC-individual-spacing-background']);

    const combined = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/threads`,
      headers: auth,
      payload: { class_id: classId, needs_group_id: groupId, envelope: env },
    });
    expect(combined.statusCode).toBe(201);
    expect(combined.json().thread.class_id).toBe(classId);
    expect(combined.json().thread.needs_group_id).toBe(groupId);

    const proj = await app.inject({ method: 'POST', url: `/api/sessions/${sid}/projects`, headers: auth, payload: { name: 'Term 1', envelope: env } });
    const badCombo = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/threads`,
      headers: auth,
      payload: { project_id: proj.json().project.id, needs_group_id: groupId, envelope: env },
    });
    expect(badCombo.statusCode).toBe(400);

    // Detach class, update and remove adaptation, archive group.
    const detached = await app.inject({ method: 'DELETE', url: `/api/sessions/${sid}/needs-groups/${groupId}/classes/${classId}`, headers: auth });
    expect(detached.statusCode).toBe(200);
    expect(detached.json().group.class_ids).toEqual([]);

    const updAdp = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups/${groupId}/adaptations/${adaptationId}/update`,
      headers: auth,
      payload: { status: 'stopped', envelope: env },
    });
    expect(updAdp.statusCode).toBe(200);
    expect(updAdp.json().adaptation.status).toBe('stopped');

    const remAdp = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups/${groupId}/adaptations/${adaptationId}/remove`,
      headers: auth,
      payload: { envelope: env },
    });
    expect(remAdp.statusCode).toBe(200);

    const archived = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups/${groupId}/archive`,
      headers: auth,
      payload: { envelope: env },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().group.archived_at).not.toBeNull();
  });

  it('refuses routes with 403 feature_off when needs_groups switch is off', async () => {
    const { sid, auth } = await makeWorkspace({ needs_groups: false });
    const res = await app.inject({ method: 'GET', url: `/api/sessions/${sid}/needs-groups`, headers: auth });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('feature_off');
  });

  it('isolates needs groups across workspaces', async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const created = await app.inject({
      method: 'POST',
      url: `/api/sessions/${a.sid}/needs-groups`,
      headers: a.auth,
      payload: { name: 'EAL beginners', envelope: env },
    });
    const id = created.json().group.id as string;
    const cross = await app.inject({
      method: 'POST',
      url: `/api/sessions/${b.sid}/needs-groups/${id}/update`,
      headers: b.auth,
      payload: { name: 'Tampered', envelope: env },
    });
    expect(cross.statusCode).toBe(404);
  });
});
