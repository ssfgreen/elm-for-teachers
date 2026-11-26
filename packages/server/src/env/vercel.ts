/**
 * What the server works out from the variables Vercel sets in its functions. Only env/ reads
 * these: everything else reads the settings in Env, so the same code runs off Vercel too.
 */
import { z } from 'zod';
import type { DeployEnv } from './admin.js';
import { optional } from './parse.js';

export const vercelVars = {
  /** Set by Vercel: `1` in its functions, which deployment this is, and its addresses with no scheme. */
  VERCEL: optional(z.string()),
  VERCEL_ENV: optional(z.string()),
  VERCEL_PROJECT_PRODUCTION_URL: optional(z.string()),
  VERCEL_BRANCH_URL: optional(z.string()),
  VERCEL_URL: optional(z.string()),
  /** Set by Vercel when Protection Bypass for Automation is on: lets the app call its own preview. */
  VERCEL_AUTOMATION_BYPASS_SECRET: optional(z.string()),
};

export interface VercelEnv {
  /** Set by Vercel (`production`, `preview`, `development`). The admin password works on `preview` only (auth.ts). */
  VERCEL_ENV?: string;
  /** Set by vercel.ts, the Vercel entry point, whatever VERCEL_ENV says: with no VERCEL_ENV the admin password is refused. */
  ON_VERCEL?: boolean;
}

/** The variables Vercel sets: which deployment this is, and its addresses with no scheme. */
export interface VercelVars {
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
}

/** The deployment's own address on Vercel: the production domain, or a preview's branch address. */
export function vercelHost(v: VercelVars): string | undefined {
  return v.VERCEL_ENV === 'production' ? v.VERCEL_PROJECT_PRODUCTION_URL : (v.VERCEL_BRANCH_URL ?? v.VERCEL_URL);
}

/**
 * On Vercel the library is a second function in the same deployment, at /library (vercel.json),
 * so with no LIBRARY_URL each deployment uses its own: production at the production domain, a
 * preview (the development site) at its branch address, else its own address. Only with
 * LIBRARY_TOKEN: without it that function refuses every call.
 */
export function vercelLibraryUrl(v: VercelVars, token: string | undefined): string | undefined {
  if (!token) return undefined;
  const host = vercelHost(v);
  return host ? `https://${host}/library` : undefined;
}

/** Vercel sets the forwarded address itself in its functions, where it sets VERCEL=1, so it can be trusted there. */
export function vercelTrustsProxy(v: VercelVars): boolean {
  return v.VERCEL === '1';
}

/** Where sign-in callbacks land. Never the Host header: a request could name any host. */
export function authBaseUrl(publicBase: string | undefined, v: VercelVars, port: number): string | undefined {
  if (publicBase) return new URL(publicBase).origin;
  if (v.VERCEL_ENV) {
    const host = vercelHost(v);
    return host ? `https://${host}` : undefined;
  }
  return `http://localhost:${port}`;
}

/**
 * DEPLOY_ENV as Vercel decides it: a preview is `preview`, and any other Vercel deployment is
 * `production`, including `vercel dev` (VERCEL_ENV `development`) and the Vercel function with no
 * VERCEL_ENV (`onVercel`, set by the entry point, vercel.ts). Off Vercel it is undefined, and the
 * DEPLOY_ENV setting decides.
 */
export function vercelDeployEnv(vercelEnv: string | undefined, onVercel: boolean | undefined): DeployEnv | undefined {
  if (vercelEnv === 'preview') return 'preview';
  return vercelEnv || onVercel ? 'production' : undefined;
}
