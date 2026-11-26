import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@edw/shared';
import { verifyContentPackFiles } from '@edw/shared/node';
import { buildApp } from '../app.js';
import type { Bucket } from '../assets/bucket.js';
import { saveAsset } from '../assets/store.js';
import type { AppDeps } from '../deps.js';
import { JOB_KINDS } from '../jobs/kinds.js';
import { runFor } from '../jobs/runner.js';
import { ADMIN_PASSWORD, tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { exportContentPack } from './service.js';
import { unpackContentZip } from './zip.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;

const env = { client_ts: '2026-11-26T10:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => {
  t = await tempDb();
  deps = { ...testDeps(t.db), env: testEnv({ STUDENTS_URL: 'https://students.example.org' }) };
  app = await buildApp(deps);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  t.cleanup();
});

async function makeDocWithImage() {
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/sessions',
    headers: { authorization: `Bearer ${ADMIN_PASSWORD}` },
    payload: { label: 'Pack test' },
  });
  const s = created.json().session as { session_id: string; participant_token: string };
  const auth = { authorization: `Bearer ${s.participant_token}` };
  const snap = await deps.canvas.snapshot(s.session_id);
  const docId = snap.docs[0]!.id;
  const assetId = newUlid();
  await saveAsset(deps.db, {
    asset_id: assetId,
    session_id: s.session_id,
    mime: 'image/png',
    bytes: PNG_1X1.byteLength,
    filename: 'diagram.png',
    data: PNG_1X1,
    created_at: '2026-11-26T10:00:00.000Z',
  });
  const first = await deps.canvas.structural(s.session_id, { command: 'insert', doc_id: docId, after: 'start', type: 'heading', content: '# Water cycle' }, env);
  const firstId = first.changes.blocks[0]!.id;
  await deps.canvas.structural(s.session_id, { command: 'insert', doc_id: docId, after: firstId, type: 'image', content: `![Water diagram](asset:${assetId})` }, env);
  return { sid: s.session_id, docId, auth };
}

describe('one-way Content Pack v1 routes (T3)', () => {
  it('exports a valid Content Pack v1 zip, never burns the link on GET, and supports listing and revocation', async () => {
    const { sid, docId, auth } = await makeDocWithImage();

    const exported = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/docs/${docId}/content-packs`,
      headers: auth,
      payload: { kind: 'reading', title: 'Water cycle reading', envelope: env },
    });
    expect(exported.statusCode).toBe(201);
    const body = exported.json() as {
      pack_id: string;
      content_hash: string;
      download_url: string;
      import_url: string;
      expires_at: string;
    };
    expect(body.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(body.import_url).toContain('https://students.example.org/import?pack=');

    const code = body.download_url.split('/api/packs/')[1]!;
    expect(code).toBeTruthy();

    // Multiple GETs succeed (resilient to Safe Links / email pre-fetchers) and never mutate the row.
    const firstGet = await app.inject({ method: 'GET', url: `/api/packs/${code}` });
    expect(firstGet.statusCode).toBe(200);
    expect(firstGet.headers['cache-control']).toBe('no-store');
    expect(firstGet.headers['x-content-pack-hash']).toBe(body.content_hash);
    const secondGet = await app.inject({ method: 'GET', url: `/api/packs/${code}` });
    expect(secondGet.statusCode).toBe(200);

    const files = await unpackContentZip(new Uint8Array(firstGet.rawPayload));
    const verified = verifyContentPackFiles(files);
    expect(verified.manifest.pack_id).toBe(body.pack_id);
    expect(verified.manifest.content_hash).toBe(body.content_hash);
    expect(verified.assets.size).toBe(1);

    // Listing never leaks link_code_hash or raw zip bytes.
    const listed = await app.inject({ method: 'GET', url: `/api/sessions/${sid}/content-packs`, headers: auth });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().packs).toHaveLength(1);
    expect(listed.body).not.toContain('link_code_hash');
    expect(listed.body).not.toContain(code);

    // Revoking immediately turns GET into 410 and clears inline zip_data.
    const rev = await app.inject({ method: 'DELETE', url: `/api/sessions/${sid}/content-packs/${body.pack_id}`, headers: auth });
    expect(rev.statusCode).toBe(200);
    const afterRevoke = await app.inject({ method: 'GET', url: `/api/packs/${code}` });
    expect(afterRevoke.statusCode).toBe(410);

    // Unknown codes return 404.
    const unknown = await app.inject({ method: 'GET', url: '/api/packs/does-not-exist' });
    expect(unknown.statusCode).toBe(404);
  });

  it('returns 302 to a 60 s presigned URL when backed by a bucket, and deletes bucket object on revoke and expiry', async () => {
    const { sid, docId } = await makeDocWithImage();
    const deleted: string[] = [];
    const uploaded: { url: string; bytes: number }[] = [];
    const bucket: Bucket = {
      presignPut: (key) => `https://bucket.example/put/${key}`,
      presignGet: (key, seconds = 60) => `https://bucket.example/get/${key}?exp=${seconds}`,
      head: async () => null,
      delete: async (key) => {
        deleted.push(key);
      },
    };
    const bucketDeps: AppDeps = { ...deps, bucket };
    const bucketApp = await buildApp(bucketDeps);
    await bucketApp.ready();

    try {
      const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        uploaded.push({ url: String(url), bytes: (init?.body as Buffer)?.byteLength ?? 0 });
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch;

      const exported = await exportContentPack(bucketDeps, {
        sessionId: sid,
        docId,
        kind: 'worksheet',
        origin: 'https://teachers.example.org',
        fetchImpl: fakeFetch,
      });
      expect(uploaded).toHaveLength(1);

      const code = exported.download_url.split('/api/packs/')[1]!;
      const redir = await bucketApp.inject({ method: 'GET', url: `/api/packs/${code}` });
      expect(redir.statusCode).toBe(302);
      expect(redir.headers.location).toBe(`https://bucket.example/get/packs/${exported.pack_id}.zip?exp=60`);
      expect(redir.headers['cache-control']).toBe('no-store');

      // Fast-forward past 7-day expiry: GET returns 410 and expire_content_pack job deletes the bucket object.
      const future = new Date(Date.parse(exported.expires_at) + 60_000);
      await deps.db.execute('UPDATE content_packs SET expires_at = ? WHERE id = ?', ['2020-01-01T00:00:00.000Z', exported.pack_id]);
      const expiredGet = await bucketApp.inject({ method: 'GET', url: `/api/packs/${code}` });
      expect(expiredGet.statusCode).toBe(410);

      const tally = await runFor(deps.db, 5000, { kinds: JOB_KINDS, bucket, now: () => future });
      expect(tally.done).toBeGreaterThanOrEqual(1);
      expect(deleted).toContain(`packs/${exported.pack_id}.zip`);
    } finally {
      await bucketApp.close();
    }
  });
});
