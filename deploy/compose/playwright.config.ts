/**
 * The browser tests against the compose setup (deploy/compose/e2e.yaml) instead of a server
 * Playwright starts itself. Only the fake sign-in issuer runs here; the app, the runner and the
 * database are the containers.
 */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';

const root = fileURLToPath(new URL('../..', import.meta.url));
const issuer = (Array.isArray(base.webServer) ? base.webServer : []).find((s) =>
  s.command.includes('fake-issuer'),
);
if (!issuer) throw new Error('playwright.config.ts no longer starts the fake issuer');

export default defineConfig({
  ...base,
  testDir: `${root}e2e`,
  webServer: [{ ...issuer, cwd: root }],
});
