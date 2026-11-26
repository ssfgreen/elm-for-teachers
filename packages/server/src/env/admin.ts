/** The admin password, and where this deployment sits. */
import { z } from 'zod';
import { optional, type Vars } from './parse.js';

export const adminVars = {
  /** Password for /admin outside production (auth.ts deployEnv): locally, in e2e and on a Vercel preview. CONSOLE_PASSWORD is the older name and still accepted. */
  ADMIN_PASSWORD: optional(z.string().min(1)),
  CONSOLE_PASSWORD: optional(z.string().min(1)),
  /** `production`, `preview` or `local` (the default): the admin password is refused in production. Ignored on Vercel, which says itself (auth.ts). */
  DEPLOY_ENV: optional(z.enum(['production', 'preview', 'local'])),
};

/** Where this deployment sits: the admin password is refused in `production` (auth.ts). */
export type DeployEnv = 'production' | 'preview' | 'local';

export interface AdminEnv {
  ADMIN_PASSWORD: string;
  /** The DEPLOY_ENV setting as set; unset is `local`. On Vercel, VERCEL_ENV decides instead (auth.ts deployEnv). */
  DEPLOY_ENV?: DeployEnv;
}

/** ADMIN_PASSWORD, else CONSOLE_PASSWORD. On Vercel and in production it need not be set: left empty, it never works (auth.ts). */
export function adminPassword(v: Vars<typeof adminVars> & { VERCEL_ENV?: string }): string {
  const pw = v.ADMIN_PASSWORD ?? v.CONSOLE_PASSWORD ?? (v.VERCEL_ENV || v.DEPLOY_ENV === 'production' ? '' : undefined);
  if (pw === undefined) throw new Error('Invalid environment:\n  ADMIN_PASSWORD: ADMIN_PASSWORD is required');
  return pw;
}
