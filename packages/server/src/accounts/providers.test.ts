import { describe, expect, it } from 'vitest';
import { testEnv } from '../test-helpers.js';
import { microsoftIssuer, providersFromEnv } from './providers.js';

const base = { AUTH_SECRET: 'x'.repeat(32), AUTH_BASE_URL: 'https://edw.example' };
const ids = (env: Parameters<typeof testEnv>[0]) => providersFromEnv(testEnv({ ...base, ...env })).map((p) => p.id);

describe('providersFromEnv', () => {
  it('offers a provider only with its client id and secret, and none without AUTH_SECRET', () => {
    expect(ids({})).toEqual([]);
    const google = { GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'gs' };
    expect(ids(google)).toEqual(['google']);
    expect(ids({ ...google, MICROSOFT_CLIENT_ID: 'm', MICROSOFT_CLIENT_SECRET: 'ms' })).toEqual(['google', 'microsoft']);
    expect(ids({ ...google, AUTH_SECRET: undefined })).toEqual([]);
  });

  it('uses the organizations authority for Microsoft unless a tenant is set', () => {
    const ms = { MICROSOFT_CLIENT_ID: 'm', MICROSOFT_CLIENT_SECRET: 'ms' };
    expect(providersFromEnv(testEnv({ ...base, ...ms }))[0]?.issuer).toBe(microsoftIssuer('organizations'));
    expect(providersFromEnv(testEnv({ ...base, ...ms, AUTH_MICROSOFT_TENANT: 'abc' }))[0]?.issuer).toBe(microsoftIssuer('abc'));
  });

  it('loads the test provider only where NODE_ENV says test or development', () => {
    const fake = { AUTH_TEST_ISSUER: 'http://127.0.0.1:9999' };
    expect(ids({ ...fake, NODE_ENV: 'test' })).toEqual(['test']);
    expect(ids({ ...fake, NODE_ENV: 'development' })).toEqual(['test']);
    expect(ids({ ...fake, NODE_ENV: 'production' })).toEqual([]);
    expect(ids({ ...fake, NODE_ENV: undefined })).toEqual([]);
  });
});
