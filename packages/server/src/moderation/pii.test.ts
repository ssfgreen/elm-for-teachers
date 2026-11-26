import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { scanDeterministicPii } from './deterministic.js';
import { checkTeacherTextPii, hashModerationText } from './pii.js';

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
    payload: { label: 'Moderation test' },
  });
  const s = res.json().session as { session_id: string; participant_token: string };
  return { sid: s.session_id, auth: { authorization: `Bearer ${s.participant_token}` } };
}

describe('deterministic PII scanner', () => {
  it('flags emails, UK postcodes, UK phone numbers, dates of birth, and explicit pupil names', () => {
    expect(scanDeterministicPii('Contact jane.doe@school.org.uk for help').categories).toEqual(['email']);
    expect(scanDeterministicPii('Lives near EH8 9YL').categories).toEqual(['uk_postcode']);
    expect(scanDeterministicPii('Call 07700 900123 after school').categories).toEqual(['uk_phone']);
    expect(scanDeterministicPii('DOB: 14/05/2015').categories).toEqual(['date_of_birth']);
    expect(scanDeterministicPii('Pupil: John Smith needs extra time').categories).toEqual(['pupil_name']);
    expect(scanDeterministicPii('5 learners with dyslexia, reading ages P5 to S1.').categories).toEqual([]);
  });
});

describe('pre-save PII moderation on classes and needs groups (T2)', () => {
  it('blocks PII with 422, records hash-only audit row, and never writes blocked text to DB or events', async () => {
    const { sid, auth } = await makeWorkspace();
    const yg = await app.inject({ method: 'POST', url: `/api/sessions/${sid}/year-groups`, headers: auth, payload: { name: 'P7', envelope: env } });
    const ygId = yg.json().year_group.id as string;

    const secretEmail = 'child.secret@example.org';
    const blockedClass = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/classes`,
      headers: auth,
      payload: { year_group_id: ygId, name: 'P7A', note: `Email ${secretEmail} with homework`, envelope: env },
    });
    expect(blockedClass.statusCode).toBe(422);
    expect(blockedClass.json().code).toBe('pii_detected');
    expect(blockedClass.body).not.toContain(secretEmail);

    const secretName = 'Pupil: Oliver Grant';
    const blockedGroup = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups`,
      headers: auth,
      payload: { name: 'Reading group', description: `${secretName} struggles with decoding`, envelope: env },
    });
    expect(blockedGroup.statusCode).toBe(422);
    expect(blockedGroup.json().code).toBe('pii_detected');
    expect(blockedGroup.body).not.toContain('Oliver Grant');

    // Audit rows exist with hash and categories, never the blocked text.
    const checks = (await deps.db.execute('SELECT * FROM moderation_checks WHERE session_id = ? ORDER BY created_at', [sid])).rows;
    expect(checks).toHaveLength(2);
    expect(checks.map((r) => r.verdict)).toEqual(['blocked', 'blocked']);
    expect(checks[0]?.text_hash).toBe(hashModerationText(`Email ${secretEmail} with homework`));
    const allChecksText = JSON.stringify(checks);
    expect(allChecksText).not.toContain(secretEmail);
    expect(allChecksText).not.toContain('Oliver Grant');

    // Research events table contains zero blocked text and zero moderation rows.
    const events = (await deps.db.execute('SELECT * FROM events WHERE session_id = ?', [sid])).rows;
    const allEventsText = JSON.stringify(events);
    expect(allEventsText).not.toContain(secretEmail);
    expect(allEventsText).not.toContain('Oliver Grant');
    expect(allEventsText).not.toContain('moderation');
  });

  it('allows clean text and stores note_check_id / check_id references', async () => {
    const { sid, auth } = await makeWorkspace();
    const yg = await app.inject({ method: 'POST', url: `/api/sessions/${sid}/year-groups`, headers: auth, payload: { name: 'P6', envelope: env } });
    const ygId = yg.json().year_group.id as string;

    const cls = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/classes`,
      headers: auth,
      payload: { year_group_id: ygId, name: 'P6B', note: 'Mixed attainment class; quieter after lunch.', envelope: env },
    });
    expect(cls.statusCode).toBe(201);
    const classId = cls.json().class.id as string;
    const clsRow = (await deps.db.execute('SELECT note_check_id FROM classes WHERE id = ?', [classId])).rows[0];
    expect(clsRow?.note_check_id).toBeTruthy();

    const group = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/needs-groups`,
      headers: auth,
      payload: { name: 'Dyslexia group', what_helps: 'Cream paper and chunked steps.', envelope: env },
    });
    expect(group.statusCode).toBe(201);
    const groupId = group.json().group.id as string;
    const grpRow = (await deps.db.execute('SELECT check_id FROM needs_groups WHERE id = ?', [groupId])).rows[0];
    expect(grpRow?.check_id).toBeTruthy();

    // Moderation check rows have target_id backfilled.
    const check = (await deps.db.execute('SELECT * FROM moderation_checks WHERE id = ?', [String(grpRow!.check_id)])).rows[0];
    expect(check?.verdict).toBe('allowed');
    expect(check?.target_id).toBe(groupId);
  });

  it('fails closed when a model classifier is configured without zero-retention', async () => {
    const { sid } = await makeWorkspace();
    const classify = vi.fn(async () => ({ verdict: 'allowed' as const, categories: [], model: 'mod-v1' }));

    await expect(
      checkTeacherTextPii({
        db: deps.db,
        sessionId: sid,
        targetKind: 'needs_group',
        text: 'Generic learning support note',
        zeroRetention: false,
        classifier: { classify },
      }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'pii_check_unavailable' });
    expect(classify).not.toHaveBeenCalled();

    // With zeroRetention: true, classifier runs and can block subtly-phrased PII.
    const blockClassifier = {
      classify: vi.fn(async () => ({ verdict: 'blocked' as const, categories: ['pupil_name'], model: 'mod-v1', cost_gbp: 0.0001 })),
    };
    await expect(
      checkTeacherTextPii({
        db: deps.db,
        sessionId: sid,
        targetKind: 'class_note',
        text: 'A subtle note with an unnamed trigger',
        zeroRetention: true,
        classifier: blockClassifier,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'pii_detected' });
    expect(blockClassifier.classify).toHaveBeenCalledOnce();
  });
});
