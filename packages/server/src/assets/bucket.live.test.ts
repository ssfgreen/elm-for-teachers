/**
 * The whole image path against a real S3-compatible server, not a fake: skipped unless
 * EDW_S3_TEST=1 and the S3_* settings point at a bucket. Locally:
 *   docker run -d -p 127.0.0.1:7070:7070 --entrypoint sh versity/versitygw:v1.0.13 \
 *     -c 'mkdir -p /data/b && exec /app/versitygw --access K --secret S --region auto posix /data'
 *   EDW_S3_TEST=1 S3_ENDPOINT=http://127.0.0.1:7070 S3_BUCKET=b S3_ACCESS_KEY_ID=K S3_SECRET_ACCESS_KEY=S npx vitest run src/assets/bucket.live.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { bucketFromEnv } from './bucket.js';

const bucket = bucketFromEnv(process.env);
const enabled = process.env.EDW_S3_TEST === '1' && bucket !== null;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe.skipIf(!enabled)('images in a real bucket', () => {
  let t: TempDb;
  let deps: AppDeps;
  let app: FastifyInstance;
  beforeAll(async () => {
    t = await tempDb();
    deps = { ...testDeps(t.db), bucket };
    app = await buildApp(deps);
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    t.cleanup();
  });

  it('upload: signed URL, PUT to the bucket, server check, logged; fetch: redirect to the stored bytes', async () => {
    const { session, thread, doc } = await newWorkspace(deps);
    const auth = { authorization: `Bearer ${session.participant_token}` };
    const envelope = { client_ts: new Date().toISOString(), focus_pane: 'canvas', doc_id: doc.id, thread_id: thread.id };
    const asked = await app.inject({ method: 'POST', url: `/api/sessions/${session.session_id}/assets/uploads`, headers: auth, payload: { filename: 'dot.png', mime: 'image/png', bytes: PNG.length, envelope } });
    expect(asked.statusCode).toBe(201);
    const { asset_id, upload } = asked.json();
    // What the browser does.
    const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: PNG });
    expect(put.status).toBe(200);
    const done = await app.inject({ method: 'POST', url: `/api/sessions/${session.session_id}/assets/${asset_id}/complete`, headers: auth, payload: { envelope } });
    expect(done.statusCode).toBe(200);
    expect((await deps.events.list(session.session_id, { kinds: ['asset_upload'] }))[0]?.payload).toMatchObject({ asset_id, bytes: PNG.length, mime: 'image/png' });
    // What an <img> does.
    const img = await app.inject({ url: `/api/sessions/${session.session_id}/assets/${asset_id}?token=${session.participant_token}` });
    expect(img.statusCode).toBe(302);
    const fetched = await fetch(img.headers.location as string);
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('will not accept an upload that never reached the bucket', async () => {
    const { session, thread, doc } = await newWorkspace(deps);
    const auth = { authorization: `Bearer ${session.participant_token}` };
    const envelope = { client_ts: new Date().toISOString(), focus_pane: 'canvas', doc_id: doc.id, thread_id: thread.id };
    const { asset_id } = (await app.inject({ method: 'POST', url: `/api/sessions/${session.session_id}/assets/uploads`, headers: auth, payload: { filename: null, mime: 'image/png', bytes: 10, envelope } })).json();
    const done = await app.inject({ method: 'POST', url: `/api/sessions/${session.session_id}/assets/${asset_id}/complete`, headers: auth, payload: { envelope } });
    expect(done.statusCode).toBe(409);
  });
});
