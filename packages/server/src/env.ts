/**
 * The server's settings, read once from process.env (and .env). Each group's variables, its part of
 * Env, its checks and what it works out live in env/; this file joins them. The scripts load it as
 * dist/env.js.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { adminPassword, adminVars, type AdminEnv } from './env/admin.js';
import { bucketVars, checkBucket, type BucketEnv } from './env/bucket.js';
import { databaseSettings, databaseVars, type DatabaseEnv } from './env/database.js';
import { jobsVars, type JobsEnv } from './env/jobs.js';
import { librarySettings, libraryVars, type LibraryEnv } from './env/library.js';
import { checkModel, modelVars, type ModelEnv } from './env/model.js';
import { omit } from './env/parse.js';
import { findRepoRoot } from './env/repo-root.js';
import { checkAuth, signInSettings, signInVars, type SignInEnv } from './env/sign-in.js';
import { siteSettings, siteVars, type SiteEnv } from './env/site.js';
import { studioVars, type StudioEnv } from './env/studio.js';
import { vercelVars, type VercelEnv } from './env/vercel.js';
import { pupilsVars, type PupilsEnv } from './pupils/env.js';

export { findRepoRoot };
export type { DeployEnv } from './env/admin.js';

const EnvSchema = z.object({
  ...databaseVars,
  ...modelVars,
  ...adminVars,
  ...siteVars,
  ...bucketVars,
  ...libraryVars,
  ...studioVars,
  ...jobsVars,
  ...vercelVars,
  ...signInVars,
  ...pupilsVars,
});

/** Every variable loadEnv reads, so tests can empty them all. */
export const ENV_KEYS: readonly string[] = Object.keys(EnvSchema.shape);

export interface Env extends DatabaseEnv, ModelEnv, AdminEnv, SiteEnv, BucketEnv, LibraryEnv, StudioEnv, JobsEnv, VercelEnv, SignInEnv, PupilsEnv {
  REPO_ROOT: string;
}

/** Raw variables Env does not carry: the old password name, Vercel's own, the deprecated Microsoft pair. */
const DROPPED = [
  'CONSOLE_PASSWORD', 'VERCEL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL', 'VERCEL_URL',
  'VERCEL_AUTOMATION_BYPASS_SECRET', 'AUTH_MICROSOFT_CLIENT_ID', 'AUTH_MICROSOFT_CLIENT_SECRET',
] as const;

export function loadEnv(): Env {
  const root = findRepoRoot();
  dotenv.config({ path: path.join(root, '.env') });

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const v = parsed.data;
  // The checks run in this order, so the first one that fails names the problem.
  checkAuth(v);
  const password = adminPassword(v);
  checkBucket(v);
  checkModel(v);
  const e = omit(v, DROPPED);
  return {
    ...e,
    // Present (as undefined) when unset, as it was before the groups moved to env/.
    VERCEL_ENV: v.VERCEL_ENV,
    ADMIN_PASSWORD: password,
    ...databaseSettings(v, root),
    ...siteSettings(v, root),
    ...librarySettings(v),
    ...signInSettings(v),
    REPO_ROOT: root,
  };
}
