import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { ADMIN_PASSWORD, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { listAssets } from './store.js';

const adminAuth = { authorization: `Bearer ${ADMIN_PASSWORD}` };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

async function newSession(): Promise<{ s: SessionRow; envelope: Record<string, unknown> }> {
  const { session, thread, doc } = await newWorkspace(deps);
  return { s: session, envelope: { client_ts: new Date().toISOString(), focus_pane: 'canvas', doc_id: doc.id, thread_id: thread.id } };
}
const upload = ({ s, envelope }: { s: SessionRow; envelope: Record<string, unknown> }, over: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/sessions/${s.session_id}/assets`,
    headers: { authorization: `Bearer ${s.participant_token}` },
    payload: { filename: 'dot.png', mime: 'image/png', data_base64: PNG.toString('base64'), envelope, ...over },
  });

describe('asset routes', () => {
  it('stores an upload, serves it back by ?token=, and records the event with the open doc', async () => {
    const w = await newSession();
    const res = await upload(w);
    expect(res.statusCode).toBe(201);
    const { asset_id, url } = res.json();
    expect(asset_id).toMatch(/^ast_/);
    expect(url).toBe(`/api/sessions/${w.s.session_id}/assets/${asset_id}`);

    const got = await app.inject({ method: 'GET', url: `${url}?token=${w.s.participant_token}` });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['cache-control']).toBe('private, max-age=3600');
    expect(Buffer.compare(got.rawPayload, PNG)).toBe(0);

    const evs = await deps.events.list(w.s.session_id, { kinds: ['asset_upload'] });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ doc_id: w.envelope.doc_id, thread_id: w.envelope.thread_id });
    expect(evs[0]!.payload).toEqual({ asset_id, mime: 'image/png', bytes: PNG.length, filename: 'dot.png' });
    const meta = await listAssets(t.db, w.s.session_id);
    expect(meta).toHaveLength(1);
    expect(meta[0]).not.toHaveProperty('data');
  });

  it('rejects other mimes (415) and oversized images (413)', async () => {
    const w = await newSession();
    expect((await upload(w, { mime: 'text/plain' })).statusCode).toBe(415);
    expect((await upload(w, { data_base64: Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString('base64') })).statusCode).toBe(413);
    expect((await upload(w, { data_base64: Buffer.alloc(5 * 1024 * 1024, 1).toString('base64') })).statusCode).toBe(201);
  });

  it('keeps an SVG cleaned, and serves it so that, opened on its own, it cannot run anything', async () => {
    const w = await newSession();
    const svg = '<svg viewBox="0 0 20 10" onload="alert(1)"><script>alert(2)</script><rect width="5" height="5"/></svg>';
    const res = await upload(w, { filename: 'star.svg', mime: 'image/svg+xml', data_base64: Buffer.from(svg).toString('base64') });
    expect(res.statusCode).toBe(201);
    const got = await app.inject({ method: 'GET', url: `${res.json().url}?token=${w.s.participant_token}` });
    expect(got.headers['content-type']).toBe('image/svg+xml');
    expect(got.headers['content-security-policy']).toContain('sandbox');
    expect(got.payload).toBe('<svg width="20" height="10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="5" height="5"/></svg>');
    expect((await upload(w, { mime: 'image/svg+xml', data_base64: Buffer.from('not a drawing').toString('base64') })).statusCode).toBe(415);
  });

  it('enforces session ownership and 404s', async () => {
    const a = await newSession();
    const b = await newSession();
    const { asset_id } = (await upload(a)).json();
    expect((await app.inject({ method: 'GET', url: `/api/sessions/${a.s.session_id}/assets/${asset_id}?token=${b.s.participant_token}` })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/sessions/${b.s.session_id}/assets/${asset_id}?token=${b.s.participant_token}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/sessions/${a.s.session_id}/assets/ast_nope?token=${a.s.participant_token}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/sessions/${a.s.session_id}/assets/${asset_id}` })).statusCode).toBe(401);
  });

  it('serves assets to admin with the password, in the header or the query', async () => {
    const w = await newSession();
    const { asset_id } = (await upload(w)).json();
    const url = `/api/admin/sessions/${w.s.session_id}/assets/${asset_id}`;
    const ok = await app.inject({ method: 'GET', url, headers: adminAuth });
    expect(ok.statusCode).toBe(200);
    expect(Buffer.compare(ok.rawPayload, PNG)).toBe(0);
    expect((await app.inject({ method: 'GET', url: `${url}?token=${ADMIN_PASSWORD}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `${url}?token=${w.s.participant_token}` })).statusCode).toBe(401);
  });

  describe('with a bucket', () => {
    /** A bucket in memory: signed URLs are recognisable strings; `put` stands in for the browser's PUT. */
    function fakeBucket() {
      const files = new Map<string, { bytes: number; contentType: string }>();
      return {
        files,
        put: (key: string, bytes: number, contentType: string) => files.set(key, { bytes, contentType }),
        presignPut: (key: string, contentType: string) => `https://bucket.test/${key}?put&type=${contentType}`,
        presignGet: (key: string) => `https://bucket.test/${key}?get`,
        head: async (key: string) => files.get(key) ?? null,
        delete: async (key: string) => void files.delete(key),
      };
    }
    async function withBucket() {
      const bucket = fakeBucket();
      await app.close();
      deps = { ...deps, bucket };
      app = await buildApp(deps);
      await app.ready();
      return bucket;
    }

    it('signs an upload, checks the file arrived, logs it, and redirects image requests to the bucket', async () => {
      const bucket = await withBucket();
      const w = await newSession();
      const info = await app.inject({ url: `/api/sessions/${w.s.session_id}`, headers: { authorization: `Bearer ${w.s.participant_token}` } });
      expect(info.json().config.uploads).toBe('bucket');
      const auth = { authorization: `Bearer ${w.s.participant_token}` };
      const res = await app.inject({ method: 'POST', url: `/api/sessions/${w.s.session_id}/assets/uploads`, headers: auth, payload: { filename: 'p.png', mime: 'image/png', bytes: 2000, envelope: w.envelope } });
      expect(res.statusCode).toBe(201);
      const { asset_id, upload } = res.json();
      const key = `sessions/${w.s.session_id}/${asset_id}`;
      expect(upload).toEqual({ method: 'PUT', url: `https://bucket.test/${key}?put&type=image/png`, headers: { 'Content-Type': 'image/png' } });
      const complete = () => app.inject({ method: 'POST', url: `/api/sessions/${w.s.session_id}/assets/${asset_id}/complete`, headers: auth, payload: { envelope: w.envelope } });
      // Not there yet, so not usable.
      expect((await complete()).statusCode).toBe(409);
      expect((await app.inject({ url: `/api/sessions/${w.s.session_id}/assets/${asset_id}?token=${w.s.participant_token}` })).statusCode).toBe(404);
      bucket.put(key, 1990, 'image/png');
      const done = await complete();
      expect(done.json()).toEqual({ asset_id, url: `/api/sessions/${w.s.session_id}/assets/${asset_id}` });
      expect((await complete()).statusCode).toBe(200);
      const evs = await deps.events.list(w.s.session_id, { kinds: ['asset_upload'] });
      expect(evs.map((e) => e.payload)).toEqual([{ asset_id, mime: 'image/png', bytes: 1990, filename: 'p.png' }]);
      const got = await app.inject({ url: `/api/sessions/${w.s.session_id}/assets/${asset_id}?token=${w.s.participant_token}` });
      expect(got.statusCode).toBe(302);
      expect(got.headers.location).toBe(`https://bucket.test/${key}?get`);
      const admin = await app.inject({ url: `/api/admin/sessions/${w.s.session_id}/assets/${asset_id}`, headers: adminAuth });
      expect(admin.statusCode).toBe(302);
    });

    it('refuses other types and oversized files, also when the stored file differs from what was declared', async () => {
      const bucket = await withBucket();
      const w = await newSession();
      const auth = { authorization: `Bearer ${w.s.participant_token}` };
      const ask = (mime: string, bytes: number) => app.inject({ method: 'POST', url: `/api/sessions/${w.s.session_id}/assets/uploads`, headers: auth, payload: { filename: null, mime, bytes, envelope: w.envelope } });
      expect((await ask('text/html', 10)).statusCode).toBe(415);
      // An SVG is cleaned on the way in, so it cannot go straight to the bucket.
      expect((await ask('image/svg+xml', 10)).statusCode).toBe(415);
      expect((await ask('image/png', 5 * 1024 * 1024 + 1)).statusCode).toBe(413);
      const { asset_id } = (await ask('image/png', 10)).json();
      bucket.put(`sessions/${w.s.session_id}/${asset_id}`, 9 * 1024 * 1024, 'image/png');
      const big = await app.inject({ method: 'POST', url: `/api/sessions/${w.s.session_id}/assets/${asset_id}/complete`, headers: auth, payload: { envelope: w.envelope } });
      expect(big.statusCode).toBe(413);
      // Another session's link cannot complete it.
      const other = await newSession();
      const cross = await app.inject({ method: 'POST', url: `/api/sessions/${other.s.session_id}/assets/${asset_id}/complete`, headers: { authorization: `Bearer ${other.s.participant_token}` }, payload: { envelope: other.envelope } });
      expect(cross.statusCode).toBe(404);
    });

    it('says direct uploads are unavailable without a bucket', async () => {
      const w = await newSession();
      const res = await app.inject({ method: 'POST', url: `/api/sessions/${w.s.session_id}/assets/uploads`, headers: { authorization: `Bearer ${w.s.participant_token}` }, payload: { filename: null, mime: 'image/png', bytes: 10, envelope: w.envelope } });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('direct_upload_unavailable');
    });
  });
});
