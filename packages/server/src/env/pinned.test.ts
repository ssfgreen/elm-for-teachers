/**
 * Pins what env.ts reads and what loadEnv returns with every setting set, so moving the settings
 * between files cannot drop or rename one. Imports only env.ts, as the scripts do.
 */
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENV_KEYS, findRepoRoot, loadEnv } from '../env.js';

beforeEach(() => {
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
});
afterEach(() => vi.unstubAllEnvs());

const SECRET = 'x'.repeat(32);

/** Every variable loadEnv reads, each set to a value it accepts. */
const ALL: Record<string, string> = {
  DATABASE_URL: 'file:./data/edw.db',
  DATABASE_AUTH_TOKEN: 'db-token',
  PROVIDER: 'elm',
  ELM_PROXY_BASE_URL: 'https://proxy.example',
  ELM_PROXY_API_KEY: 'elm-key',
  ELM_PROXY_CHAT_PATH: '/chat',
  ELM_PROXY_RESPONSES_PATH: '/resp',
  ADMIN_PASSWORD: 'admin-pw',
  CONSOLE_PASSWORD: 'console-pw',
  DEPLOY_ENV: 'preview',
  PORT: '4000',
  HOST: '127.0.0.1',
  CONFIG_DIR: 'cfg',
  TOOL_VERSION: '9.9.9',
  MIGRATE_ON_START: 'off',
  PUBLIC_BASE_URL: 'https://study.example.org/x',
  STUDENTS_URL: 'https://students.example.org/',
  S3_ENDPOINT: 'https://s3.example',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 's3-id',
  S3_SECRET_ACCESS_KEY: 's3-secret',
  S3_REGION: 'auto',
  LIBRARY_URL: 'https://lib.example.org',
  LIBRARY_TOKEN: 'lib-token',
  PLUGIN_STUDIO_URL: 'https://studio.example.org',
  TRUST_PROXY: '0',
  FUNCTION_LIMIT_MS: '120000',
  CRON_SECRET: 'c'.repeat(16),
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_PROJECT_PRODUCTION_URL: 'edw.vercel.app',
  VERCEL_BRANCH_URL: 'edw-git-dev.vercel.app',
  VERCEL_URL: 'edw-abc.vercel.app',
  VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass',
  NODE_ENV: 'test',
  AUTH_SECRET: SECRET,
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  MICROSOFT_CLIENT_ID: 'mid',
  MICROSOFT_CLIENT_SECRET: 'msecret',
  AUTH_MICROSOFT_CLIENT_ID: 'old-id',
  AUTH_MICROSOFT_CLIENT_SECRET: 'old-secret',
  AUTH_MICROSOFT_TENANT: 'organizations',
  AUTH_OPEN_MICROSOFT_TENANTS: 'T-1, t-2',
  AUTH_OPEN_GOOGLE_DOMAINS: 'School.example',
  AUTH_TEST_ISSUER: 'http://127.0.0.1:9999',
  AUTH_TEST_CLIENT_ID: 'tid',
  AUTH_TEST_CLIENT_SECRET: 'tsecret',
};

function setAll(except: string[] = []) {
  for (const [k, v] of Object.entries(ALL)) if (!except.includes(k)) vi.stubEnv(k, v);
}

/** The result as sorted [key, value] pairs, so the order fields are built in does not matter. */
const sorted = (o: object) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b));

describe('env settings, pinned', () => {
  it('reads exactly these variables', () => {
    expect([...ENV_KEYS].sort()).toEqual(Object.keys(ALL).sort());
  });

  it('returns every setting with every variable set', () => {
    setAll();
    const root = findRepoRoot();
    expect(sorted(loadEnv())).toEqual(
      sorted({
        ADMIN_PASSWORD: 'admin-pw',
        AUTH_BASE_URL: 'https://study.example.org',
        AUTH_MICROSOFT_TENANT: 'organizations',
        AUTH_OPEN_GOOGLE_DOMAINS: ['school.example'],
        AUTH_OPEN_MICROSOFT_TENANTS: ['t-1', 't-2'],
        AUTH_SECRET: SECRET,
        AUTH_TEST_CLIENT_ID: 'tid',
        AUTH_TEST_CLIENT_SECRET: 'tsecret',
        AUTH_TEST_ISSUER: 'http://127.0.0.1:9999',
        CONFIG_DIR: path.join(root, 'cfg'),
        CRON_SECRET: 'c'.repeat(16),
        DATABASE_AUTH_TOKEN: 'db-token',
        DATABASE_URL: `file:${path.join(root, 'data', 'edw.db')}`,
        DEPLOY_ENV: 'preview',
        ELM_PROXY_API_KEY: 'elm-key',
        ELM_PROXY_BASE_URL: 'https://proxy.example',
        ELM_PROXY_CHAT_PATH: '/chat',
        ELM_PROXY_RESPONSES_PATH: '/resp',
        FUNCTION_LIMIT_MS: 120_000,
        GOOGLE_CLIENT_ID: 'gid',
        GOOGLE_CLIENT_SECRET: 'gsecret',
        HOST: '127.0.0.1',
        LIBRARY_BYPASS_SECRET: undefined,
        LIBRARY_TOKEN: 'lib-token',
        LIBRARY_URL: 'https://lib.example.org',
        MICROSOFT_CLIENT_ID: 'mid',
        MICROSOFT_CLIENT_SECRET: 'msecret',
        MIGRATE_ON_START: false,
        NODE_ENV: 'test',
        PLUGIN_STUDIO_URL: 'https://studio.example.org',
        PORT: 4000,
        PROVIDER: 'elm',
        PUBLIC_BASE_URL: 'https://study.example.org/x',
        REPO_ROOT: root,
        S3_ACCESS_KEY_ID: 's3-id',
        S3_BUCKET: 'bucket',
        S3_ENDPOINT: 'https://s3.example',
        S3_REGION: 'auto',
        S3_SECRET_ACCESS_KEY: 's3-secret',
        STUDENTS_URL: 'https://students.example.org',
        TOOL_VERSION: '9.9.9',
        TRUST_PROXY: false,
        VERCEL_ENV: 'preview',
      }),
    );
  });

  it("with no LIBRARY_URL, returns the deployment's own library and its bypass", () => {
    setAll(['LIBRARY_URL', 'TRUST_PROXY', 'PUBLIC_BASE_URL']);
    const env = loadEnv();
    expect(env).toMatchObject({
      LIBRARY_URL: 'https://edw-git-dev.vercel.app/library',
      LIBRARY_BYPASS_SECRET: 'bypass',
      TRUST_PROXY: true,
      AUTH_BASE_URL: 'https://edw-git-dev.vercel.app',
    });
    expect(env.PUBLIC_BASE_URL).toBeUndefined();
  });

  // zod reports variables in schema order; these five keep their order across the groups.
  it('lists every bad variable in one message, in this order', () => {
    vi.stubEnv('PORT', 'x');
    vi.stubEnv('PUBLIC_BASE_URL', 'not a url');
    vi.stubEnv('TRUST_PROXY', 'maybe');
    vi.stubEnv('DEPLOY_ENV', 'staging');
    vi.stubEnv('AUTH_SECRET', 'short');
    const lines = (() => {
      try {
        loadEnv();
        return [];
      } catch (err) {
        return (err as Error).message.split('\n').slice(1).map((l) => l.trim().split(':')[0]);
      }
    })();
    expect(lines).toEqual(['DEPLOY_ENV', 'PORT', 'PUBLIC_BASE_URL', 'TRUST_PROXY', 'AUTH_SECRET']);
  });
});
