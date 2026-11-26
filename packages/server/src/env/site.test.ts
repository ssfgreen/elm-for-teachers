import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { findRepoRoot, loadEnv } from '../env.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: site', () => {
  it('applies defaults', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    const env = loadEnv();
    const root = findRepoRoot();
    expect(env).toMatchObject({
      PROVIDER: 'mock',
      PORT: 3000,
      HOST: '0.0.0.0',
      ELM_PROXY_CHAT_PATH: '/chat/completions',
      TOOL_VERSION: '0.1.0',
      ADMIN_PASSWORD: 'pw',
    });
    // Participant links follow the admin request origin unless PUBLIC_BASE_URL is set.
    expect(env.PUBLIC_BASE_URL).toBeUndefined();
    expect(env.CONFIG_DIR).toBe(path.join(root, 'config'));
    expect(env.DATABASE_URL).toBe(`file:${path.join(root, 'data', 'edw.db')}`);
    expect(env.DATABASE_AUTH_TOKEN).toBeUndefined();
  });

  it('accepts PUBLIC_BASE_URL and rejects a malformed one', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('PUBLIC_BASE_URL', 'https://study.example.org');
    expect(loadEnv().PUBLIC_BASE_URL).toBe('https://study.example.org');
    vi.stubEnv('PUBLIC_BASE_URL', 'not a url');
    expect(() => loadEnv()).toThrow(/PUBLIC_BASE_URL/);
  });
});
