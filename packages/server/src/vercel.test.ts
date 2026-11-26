import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { originalUrl, vercelEnv } from './vercel.js';
import { passwordAllowed } from './auth.js';
import { testEnv } from './test-helpers.js';
import { openDb } from './db/client.js';
import { createAccountStore } from './accounts/store.js';
import { createAdminStore } from './accounts/admins.js';
import type { SessionService } from './deps.js';

describe('vercelEnv', () => {
  it('refuses the admin password in the Vercel function even when VERCEL_ENV is missing', () => {
    expect(passwordAllowed(testEnv())).toBe(true);
    expect(passwordAllowed(testEnv({ VERCEL_ENV: 'production' }))).toBe(false);
    expect(passwordAllowed(vercelEnv(testEnv()))).toBe(false);
  });
});

describe('originalUrl', () => {
  it('puts back the path vercel.json moved into __path, keeping the query', () => {
    expect(originalUrl('/api?__path=health')).toBe('/api/health');
    expect(originalUrl('/api?__path=sessions%2FS1%2Fassets%2Fast_1&token=abc')).toBe('/api/sessions/S1/assets/ast_1?token=abc');
    expect(originalUrl('/api/sessions/S1')).toBe('/api/sessions/S1');
  });
});

describe('the Vercel function', () => {
  let server: Server;
  let base: string;
  let dir: string;
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'edw-vercel-'));
    vi.stubEnv('DATABASE_URL', `file:${path.join(dir, 'v.db')}`);
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('PROVIDER', 'mock');
    // No VERCEL_ENV: the function alone must refuse the password. The sign-in Origin is localhost:3000.
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('PORT', '3000');
    // Not from a local .env: links follow the forwarded host, as on Vercel.
    vi.stubEnv('PUBLIC_BASE_URL', '');
    for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'DATABASE_AUTH_TOKEN']) vi.stubEnv(k, '');
    const { default: handler } = await import('./vercel.js');
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  /** An admin account and a fresh sign-in, made straight in the function's database (migrated by now). */
  async function adminSignIn(): Promise<string> {
    const db = openDb({ url: `file:${path.join(dir, 'v.db')}` });
    const now = new Date().toISOString();
    await db.execute("INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, created_at, updated_at, access) VALUES ('adm', 'Admin', 'adm-token', 'h', 'h', ?, ?, 'account')", [now, now]);
    await db.execute("INSERT INTO accounts (id, session_id, provider, subject, created_at) VALUES ('adm-account', 'adm', 'test', 'adm', ?)", [now]);
    await createAdminStore(db).setAdmin('adm-account', true);
    const { id } = await createAccountStore(db, {} as SessionService).startSignIn({ id: 'adm-account', session_id: 'adm' });
    db.close();
    return id;
  }

  afterAll(() => {
    server.close();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the API through the rewritten URL, building the app once', async () => {
    const health = await fetch(`${base}/api?__path=health`);
    expect(await health.json()).toMatchObject({ ok: true, provider: 'mock' });
    const forwarded = { 'Content-Type': 'application/json', 'X-Forwarded-Host': 'worksheets.vercel.app', 'X-Forwarded-Proto': 'https' };
    const create = (headers: Record<string, string>) => fetch(`${base}/api?__path=admin%2Fsessions`, { method: 'POST', headers: { ...forwarded, ...headers }, body: JSON.stringify({ label: 'On Vercel' }) });
    // The function refuses the admin password; an admin signs in instead.
    expect((await create({ Authorization: 'Bearer pw' })).status).toBe(401);
    const created = await create({ Cookie: `edw_sign_in=${await adminSignIn()}`, Origin: 'http://localhost:3000' });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { participant_url: string; session: { participant_token: string; session_id: string } };
    expect(body.participant_url).toBe(`https://worksheets.vercel.app/s/${body.session.participant_token}`);
    const info = await fetch(`${base}/api?__path=sessions%2F${body.session.session_id}&token=${body.session.participant_token}`);
    expect(await info.json()).toMatchObject({ label: 'On Vercel', config: { uploads: 'inline' } });
  });
});
