import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: model', () => {
  it('rejects PROVIDER=elm without ELM variables', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('PROVIDER', 'elm');
    expect(() => loadEnv()).toThrow(/ELM_PROXY_BASE_URL and ELM_PROXY_API_KEY/);
    vi.stubEnv('ELM_PROXY_BASE_URL', 'https://proxy.example');
    vi.stubEnv('ELM_PROXY_API_KEY', 'k');
    expect(loadEnv().PROVIDER).toBe('elm');
  });
});
