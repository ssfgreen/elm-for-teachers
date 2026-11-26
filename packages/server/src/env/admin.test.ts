import { describe, expect, it, vi } from 'vitest';
import { passwordAllowed } from '../auth.js';
import { loadEnv } from '../env.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: admin', () => {
  it('passes VERCEL_ENV through, and needs no admin password on Vercel, where none set means none works', () => {
    expect(() => loadEnv()).toThrow(/ADMIN_PASSWORD/);
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_BRANCH_URL', 'edw-git-development-sam.vercel.app');
    expect(loadEnv()).toMatchObject({ VERCEL_ENV: 'preview', ADMIN_PASSWORD: '' });
    expect(passwordAllowed(loadEnv())).toBe(false);
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    expect(loadEnv().VERCEL_ENV).toBe('preview');
    expect(passwordAllowed(loadEnv())).toBe(true);
  });

  it('reads DEPLOY_ENV, rejects anything else, and needs no admin password in production', () => {
    expect(loadEnv).toThrow(/ADMIN_PASSWORD/);
    vi.stubEnv('DEPLOY_ENV', 'production');
    expect(loadEnv()).toMatchObject({ DEPLOY_ENV: 'production', ADMIN_PASSWORD: '' });
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    expect(passwordAllowed(loadEnv())).toBe(false);
    vi.stubEnv('DEPLOY_ENV', 'preview');
    expect(passwordAllowed(loadEnv())).toBe(true);
    vi.stubEnv('DEPLOY_ENV', '');
    expect(loadEnv().DEPLOY_ENV).toBeUndefined();
    expect(passwordAllowed(loadEnv())).toBe(true);
    vi.stubEnv('DEPLOY_ENV', 'staging');
    expect(loadEnv).toThrow(/DEPLOY_ENV/);
  });

  it('requires ADMIN_PASSWORD, and still accepts the older CONSOLE_PASSWORD', () => {
    expect(() => loadEnv()).toThrow(/ADMIN_PASSWORD/);
    vi.stubEnv('CONSOLE_PASSWORD', 'old');
    expect(loadEnv().ADMIN_PASSWORD).toBe('old');
    vi.stubEnv('ADMIN_PASSWORD', 'new');
    expect(loadEnv().ADMIN_PASSWORD).toBe('new');
  });
});
