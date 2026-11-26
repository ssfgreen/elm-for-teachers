import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import { studioOrigins } from './studio.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: plugin studio', () => {
  it('is off when unset, and keeps the origins of the addresses given', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    expect(studioOrigins(loadEnv())).toEqual([]);
    vi.stubEnv('PLUGIN_STUDIO_URL', 'https://studio.example/app/, http://localhost:3000');
    expect(studioOrigins(loadEnv())).toEqual(['https://studio.example', 'http://localhost:3000']);
  });

  it('refuses an address that is not https, other than on localhost', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('PLUGIN_STUDIO_URL', 'http://studio.example');
    expect(() => loadEnv()).toThrow(/PLUGIN_STUDIO_URL/);
    vi.stubEnv('PLUGIN_STUDIO_URL', 'not a url');
    expect(() => loadEnv()).toThrow(/PLUGIN_STUDIO_URL/);
  });
});
