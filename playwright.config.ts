/**
 * Browser checks of the core teacher flow, against the built server with the mock provider.
 * Run `pnpm build` first, then `pnpm e2e`. CI installs its own Chromium; elsewhere set
 * PW_CHROMIUM_PATH to use a browser that is already installed.
 */
import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3950;
/** The library server (library/), so the curriculum picker and the pedagogy library work as deployed: over HTTP. */
const LIBRARY_PORT = 3951;
/** The fake OpenID Connect issuer (e2e/fake-issuer.mjs), so sign-in can be tried without Google or Microsoft. */
const ISSUER_PORT = 3952;
/** A stand-in plugin studio (e2e/fake-studio.mjs), so drafts are on and can be added. */
const STUDIO_PORT = 3953;
const dbDir = mkdtempSync(join(tmpdir(), "edw-e2e-"));

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: "pnpm --filter @edw/library serve",
      url: `http://127.0.0.1:${LIBRARY_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PORT: String(LIBRARY_PORT) },
    },
    {
      command: "node e2e/fake-issuer.mjs",
      url: `http://127.0.0.1:${ISSUER_PORT}/.well-known/openid-configuration`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PORT: String(ISSUER_PORT) },
    },
    {
      command: "node e2e/fake-studio.mjs",
      url: `http://127.0.0.1:${STUDIO_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { PORT: String(STUDIO_PORT) },
    },
    {
      command: "node packages/server/dist/index.js",
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        DATABASE_URL: `file:${join(dbDir, "e2e.db")}`,
        DATABASE_AUTH_TOKEN: "",
        PROVIDER: "mock",
        ELM_PROXY_BASE_URL: "",
        ELM_PROXY_API_KEY: "",
        ADMIN_PASSWORD: "e2e-password",
        CONSOLE_PASSWORD: "",
        PORT: String(PORT),
        HOST: "127.0.0.1",
        PUBLIC_BASE_URL: `http://127.0.0.1:${PORT}`,
        LIBRARY_URL: `http://127.0.0.1:${LIBRARY_PORT}`,
        // The test sign-in provider loads only with NODE_ENV test or development (docs/HANDOVER.md 4a15).
        NODE_ENV: "test",
        AUTH_SECRET: "e2e-only-auth-secret-not-for-any-real-site",
        AUTH_TEST_ISSUER: `http://127.0.0.1:${ISSUER_PORT}`,
        PLUGIN_STUDIO_URL: `http://127.0.0.1:${STUDIO_PORT}`,
      },
    },
  ],
});
