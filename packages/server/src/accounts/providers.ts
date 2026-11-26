/**
 * The sign-in providers this deployment offers, from its settings. An OpenID Connect provider is
 * an issuer address plus a client id and secret, so a third one is one more entry here. A
 * provider with no settings is not offered.
 *
 * `kind` leaves room for a second sort of provider (SAML, for RM Unify, issue #14): it would
 * be another member of `ProviderSettings` with its own start and callback in routes.ts.
 */
import type { Env } from '../env.js';

/** How a provider's claims are read (oidc.ts `reduceClaims`) and which open-door rule applies (policy.ts). */
export type ProviderFamily = 'google' | 'microsoft' | 'generic';

export interface OidcProviderSettings {
  kind: 'oidc';
  /** In the routes (`/api/auth/:id/start`) and stored on the account. */
  id: string;
  /** What the sign-in button says after "Sign in with". */
  label: string;
  family: ProviderFamily;
  /** The issuer address; discovery reads `<issuer>/.well-known/openid-configuration`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Plain http to the issuer: only the test provider, which never loads in production. */
  allowHttp?: boolean;
}

/** One kind for now. A SAML provider would be added to this union. */
export type ProviderSettings = OidcProviderSettings;

export const SCOPES = 'openid email profile';

export const GOOGLE_ISSUER = 'https://accounts.google.com';
export const microsoftIssuer = (tenant: string): string => `https://login.microsoftonline.com/${tenant}/v2.0`;

const TEST_ENVIRONMENTS = ['test', 'development'];

/** The providers set in the environment. None without AUTH_SECRET or a redirect address. */
export function providersFromEnv(env: Env): ProviderSettings[] {
  if (!env.AUTH_SECRET || !env.AUTH_BASE_URL) return [];
  const out: ProviderSettings[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    out.push({ kind: 'oidc', id: 'google', label: 'Google', family: 'google', issuer: GOOGLE_ISSUER, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET });
  }
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    out.push({
      kind: 'oidc',
      id: 'microsoft',
      label: 'Microsoft',
      family: 'microsoft',
      issuer: microsoftIssuer(env.AUTH_MICROSOFT_TENANT ?? 'organizations'),
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    });
  }
  // The fake issuer's provider only where the environment says it is not production: loadEnv
  // refuses it in production, and a preview or a server with neither setting does not load it.
  if (env.AUTH_TEST_ISSUER && TEST_ENVIRONMENTS.includes(env.NODE_ENV ?? '')) {
    out.push({
      kind: 'oidc',
      id: 'test',
      label: 'Test issuer',
      family: 'generic',
      issuer: env.AUTH_TEST_ISSUER,
      clientId: env.AUTH_TEST_CLIENT_ID ?? 'test-client',
      clientSecret: env.AUTH_TEST_CLIENT_SECRET ?? 'test-secret',
      allowHttp: true,
    });
  }
  return out;
}

/** What `GET /api/auth/providers` shows: never a client id or secret. */
export interface PublicProvider {
  id: string;
  label: string;
  kind: ProviderSettings['kind'];
}

export const publicProvider = (p: ProviderSettings): PublicProvider => ({ id: p.id, label: p.label, kind: p.kind });
