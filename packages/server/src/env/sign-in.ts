/** Sign-in settings (accounts/providers.ts reads them); a provider with no client id is not offered. */
import { z } from 'zod';
import { list, optional, type Vars } from './parse.js';
import { authBaseUrl, type VercelVars } from './vercel.js';

export const signInVars = {
  /** Signs the short cookie that carries a sign-in's state, nonce and PKCE verifier. */
  AUTH_SECRET: optional(z.string().min(32, 'AUTH_SECRET must be at least 32 characters')),
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
  MICROSOFT_CLIENT_ID: optional(z.string()),
  MICROSOFT_CLIENT_SECRET: optional(z.string()),
  /** Deprecated names for the two above, read only when neither new name is set (microsoftClient). */
  AUTH_MICROSOFT_CLIENT_ID: optional(z.string()),
  AUTH_MICROSOFT_CLIENT_SECRET: optional(z.string()),
  /** A directory (tenant) id, or `organizations` (any work or school account, the default) or `common`. */
  AUTH_MICROSOFT_TENANT: optional(z.string().regex(/^[A-Za-z0-9.-]+$/, 'a tenant id, organizations or common')),
  /** Comma-separated tenant ids whose people may sign in without an invite. */
  AUTH_OPEN_MICROSOFT_TENANTS: optional(z.string()),
  /** Comma-separated Google Workspace domains (the `hd` claim) whose people may sign in without an invite. */
  AUTH_OPEN_GOOGLE_DOMAINS: optional(z.string()),
  /** The `test` provider, for the fake issuer in tests only: refused in production. */
  AUTH_TEST_ISSUER: optional(z.string().url()),
  AUTH_TEST_CLIENT_ID: optional(z.string()),
  AUTH_TEST_CLIENT_SECRET: optional(z.string()),
};

export interface SignInEnv {
  AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** From MICROSOFT_CLIENT_*, else the deprecated AUTH_MICROSOFT_CLIENT_* (microsoftClient). */
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  AUTH_MICROSOFT_TENANT?: string;
  AUTH_OPEN_MICROSOFT_TENANTS?: string[];
  AUTH_OPEN_GOOGLE_DOMAINS?: string[];
  AUTH_TEST_ISSUER?: string;
  AUTH_TEST_CLIENT_ID?: string;
  AUTH_TEST_CLIENT_SECRET?: string;
  /**
   * The origin sign-in redirect addresses are built on: PUBLIC_BASE_URL, else this Vercel
   * deployment's address, else http://localhost:PORT. Worked out here, never read from a request.
   */
  AUTH_BASE_URL?: string;
}

type SignInVars = Vars<typeof signInVars>;

/**
 * The Microsoft client id and secret: the MICROSOFT_CLIENT_* pair if either half is set, else the
 * deprecated AUTH_MICROSOFT_CLIENT_* pair. The two pairs are never mixed, so a half from each is a
 * half pair, and checkAuth refuses it.
 */
function microsoftClient(v: SignInVars): { prefix: string; id?: string; secret?: string } {
  if (v.MICROSOFT_CLIENT_ID || v.MICROSOFT_CLIENT_SECRET) {
    return { prefix: 'MICROSOFT_CLIENT', id: v.MICROSOFT_CLIENT_ID, secret: v.MICROSOFT_CLIENT_SECRET };
  }
  return { prefix: 'AUTH_MICROSOFT_CLIENT', id: v.AUTH_MICROSOFT_CLIENT_ID, secret: v.AUTH_MICROSOFT_CLIENT_SECRET };
}

/** Each provider's id and secret come as a pair; any provider needs AUTH_SECRET; the test one never runs in production. */
export function checkAuth(v: SignInVars & { VERCEL_ENV?: string; NODE_ENV?: string; DEPLOY_ENV?: string }): void {
  const ms = microsoftClient(v);
  const pairs = [['GOOGLE_CLIENT', v.GOOGLE_CLIENT_ID, v.GOOGLE_CLIENT_SECRET], [ms.prefix, ms.id, ms.secret]] as const;
  for (const [prefix, id, secret] of pairs) {
    if (Boolean(id) !== Boolean(secret)) throw new Error(`Invalid environment:\n  ${prefix}_*: set both ${prefix}_ID and ${prefix}_SECRET, or neither`);
  }
  if (v.AUTH_TEST_ISSUER && (v.VERCEL_ENV === 'production' || v.NODE_ENV === 'production' || v.DEPLOY_ENV === 'production')) {
    throw new Error('Invalid environment:\n  AUTH_TEST_ISSUER: the test sign-in provider is for tests and cannot run in production');
  }
  const any = v.GOOGLE_CLIENT_ID || ms.id || v.AUTH_TEST_ISSUER;
  if (any && !v.AUTH_SECRET) throw new Error('Invalid environment:\n  AUTH_SECRET: required when a sign-in provider is set');
}

type SignInInput = SignInVars & VercelVars & { PUBLIC_BASE_URL?: string; PORT: number };

/** Env carries only the chosen Microsoft pair, under the new names. */
export function signInSettings(v: SignInInput) {
  const ms = microsoftClient(v);
  return {
    MICROSOFT_CLIENT_ID: ms.id,
    MICROSOFT_CLIENT_SECRET: ms.secret,
    AUTH_OPEN_MICROSOFT_TENANTS: list(v.AUTH_OPEN_MICROSOFT_TENANTS),
    AUTH_OPEN_GOOGLE_DOMAINS: list(v.AUTH_OPEN_GOOGLE_DOMAINS),
    AUTH_BASE_URL: authBaseUrl(v.PUBLIC_BASE_URL, v, v.PORT),
  };
}
