/** Where the server listens and what it tells visitors about itself. */
import path from 'node:path';
import { z } from 'zod';
import { emptyToUndefined, optional, type Vars } from './parse.js';
import { vercelTrustsProxy, type VercelVars } from './vercel.js';

export const siteVars = {
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(3000)),
  HOST: z.preprocess(emptyToUndefined, z.string().default('0.0.0.0')),
  CONFIG_DIR: optional(z.string()),
  TOOL_VERSION: z.preprocess(emptyToUndefined, z.string().default('0.1.0')),
  PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Optional origin of Elm for Students, used to build Content Pack import links. */
  STUDENTS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /**
   * Trust the first X-Forwarded-For entry as the visitor's address: only behind a proxy that
   * replaces any X-Forwarded-For the visitor sent. One that appends to it or passes it through lets
   * a visitor choose their address. Unset, it is on where Vercel says so (VERCEL=1), else off.
   */
  TRUST_PROXY: optional(z.enum(['true', 'false', '1', '0'], { message: 'true or false' })),
  /** How long a request may run before the platform stops it (vercel.json's maxDuration). */
  FUNCTION_LIMIT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(300_000)),
  NODE_ENV: optional(z.string()),
};

export interface SiteEnv {
  PORT: number;
  HOST: string;
  CONFIG_DIR: string;
  TOOL_VERSION: string;
  /** Origin for participant links; when unset, links follow the origin the admin request came from. */
  PUBLIC_BASE_URL: string | undefined;
  /** Optional origin for Elm for Students import links. */
  STUDENTS_URL?: string;
  /** Whether X-Forwarded-For names the visitor (http/wrong-codes.ts). */
  TRUST_PROXY?: boolean;
  /** How long a request may run; the turn's checks keep inside it (gateway/turn-checks.ts). */
  FUNCTION_LIMIT_MS?: number;
  /** `test` or `development` is needed for the test sign-in provider (accounts/providers.ts). */
  NODE_ENV?: string;
}

export function siteSettings(v: Vars<typeof siteVars> & VercelVars, root: string) {
  return {
    PUBLIC_BASE_URL: v.PUBLIC_BASE_URL,
    STUDENTS_URL: v.STUDENTS_URL ? v.STUDENTS_URL.replace(/\/+$/, '') : undefined,
    TRUST_PROXY: v.TRUST_PROXY === undefined ? vercelTrustsProxy(v) : v.TRUST_PROXY === 'true' || v.TRUST_PROXY === '1',
    CONFIG_DIR: v.CONFIG_DIR ? path.resolve(root, v.CONFIG_DIR) : path.join(root, 'config'),
  };
}
