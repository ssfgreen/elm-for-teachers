import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { createAccountStore, type AccountStore } from './store.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let store: AccountStore;
const admin = { authorization: `Bearer ${ADMIN_PASSWORD}` };

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  store = createAccountStore(t.db, deps.sessions);
  app = await buildApp({ ...deps, accounts: store });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

describe('/api/admin/invites', () => {
  it('needs the admin password', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/invites' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/admin/invites', headers: { authorization: 'Bearer wrong' }, payload: { label: 'x' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/api/admin/invites/abc' })).statusCode).toBe(401);
  });

  it('makes an invite, shows its code once, lists it and withdraws it', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/admin/invites', headers: admin, payload: { label: 'Teacher B', email: 'b@school.example', days: 7 } });
    expect(made.statusCode).toBe(201);
    const { invite, code } = made.json();
    expect(typeof code).toBe('string');
    expect(invite).toMatchObject({ label: 'Teacher B', email: 'b@school.example', status: 'open' });
    expect(Date.parse(invite.expires_at) - Date.parse(invite.created_at)).toBe(7 * 86_400_000);

    const listed = await app.inject({ url: '/api/admin/invites', headers: admin });
    expect(listed.json().invites.map((i: { id: string }) => i.id)).toContain(invite.id);
    expect(listed.body).not.toContain(code);

    expect((await app.inject({ method: 'DELETE', url: `/api/admin/invites/${invite.id}`, headers: admin })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/invites/${invite.id}`, headers: admin })).statusCode).toBe(404);
  });

  it('refuses a bad body', async () => {
    for (const payload of [{}, { label: '' }, { label: 'x', email: 'not an email' }, { label: 'x', days: 0 }, { label: 'x', days: 365 }]) {
      expect((await app.inject({ method: 'POST', url: '/api/admin/invites', headers: admin, payload })).statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it('will not withdraw a claimed invite', async () => {
    const { code, invite } = (await app.inject({ method: 'POST', url: '/api/admin/invites', headers: admin, payload: { label: 'Claimed' } })).json();
    await store.claimInvite(code, { provider: 'google', subject: 's1', email: null, displayName: null });
    const res = await app.inject({ method: 'DELETE', url: `/api/admin/invites/${invite.id}`, headers: admin });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('invite_used');
  });
});
