import { afterAll, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/index.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, envelopeFor, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
const lines: string[] = [];
const admin = { authorization: `Bearer ${ADMIN_PASSWORD}` };

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps, { logger: true, logStream: { write: (line) => void lines.push(line) } });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

it('keeps the access code out of the events, the request log and the export', async () => {
  const made = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin, payload: { label: 'Year 8 Geography' } });
  const { session_id: sid, access_code: shown } = made.json().session as { session_id: string; access_code: string };
  const canonical = shown.replace(/-/g, '');

  // Opened by its code, a wrong code tried too, and something done in it.
  const opened = await app.inject({ method: 'POST', url: '/api/access', payload: { code: shown.toLowerCase() } });
  expect(opened.statusCode).toBe(200);
  await app.inject({ method: 'POST', url: '/api/access', payload: { code: 'ZZZZ-ZZZZ-ZZZZ' } });
  await app.inject({ url: `/api/participant?token=${opened.json().token}` });
  await app.inject({ method: 'POST', url: `/api/admin/sessions/${sid}/access-code`, headers: admin });
  const renewed = (await deps.sessions.get(sid))!.access_code!;
  const [thread] = await deps.threads.list(sid);
  const doc = (await deps.canvas.snapshot(sid)).docs[0]!;
  await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Rivers' }, envelopeFor(doc, thread!));

  const res = await app.inject({ url: `/api/admin/sessions/${sid}/export.json`, headers: admin });
  expect(res.statusCode).toBe(200);
  expect(res.body).toContain('Rivers');

  const events = JSON.stringify((await t.db.execute('SELECT * FROM events')).rows);
  expect(events).toContain('participant_open');
  const log = lines.join('');
  expect(log).toContain('/api/access');
  for (const secret of [shown, canonical, shown.toLowerCase(), renewed, renewed.replace(/-/g, '')]) {
    expect(res.body, 'export').not.toContain(secret);
    expect(events, 'events').not.toContain(secret);
    expect(log, 'log').not.toContain(secret);
  }
});
