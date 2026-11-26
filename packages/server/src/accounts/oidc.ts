/**
 * OpenID Connect through openid-client v6: authorisation code with PKCE, a state and a nonce.
 * The ID token's signature is checked against the issuer's keys; the library checks its issuer (for a
 * multi-tenant Entra authority, against the token's `tid`), audience, expiry and nonce;
 * `reduceClaims` then keeps only what an account needs.
 *
 * Privacy: claims, subjects and emails never go into an error message or a log line here.
 */
import * as client from 'openid-client';
import type { Identity } from './store.js';
import { SCOPES, microsoftIssuer, type OidcProviderSettings } from './providers.js';

/** What the state cookie carries between start and callback. */
export interface Checks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface OidcProvider {
  settings: OidcProviderSettings;
  /** Where to send the browser to sign in. */
  authorizationUrl(redirectUri: string, checks: Checks): Promise<URL>;
  /** Swap the callback's code for a checked ID token; its claims, or a thrown error. */
  finish(callbackUrl: URL, checks: Checks): Promise<Record<string, unknown>>;
}

export interface OidcOptions {
  /** Replaces fetch for every call to the issuer (tests point a real issuer address at the fake one). */
  fetch?: typeof fetch;
  /** What to ask the provider for: teachers' `openid email profile` (SCOPES) by default; pupils `openid` only (pupils/). */
  scope?: string;
}

export function newChecks(): Checks {
  return { state: client.randomState(), nonce: client.randomNonce(), codeVerifier: client.randomPKCECodeVerifier() };
}

export function createOidcProvider(settings: OidcProviderSettings, opts: OidcOptions = {}): OidcProvider {
  // Discovery once per function instance; a failure is tried again on the next sign-in.
  let config: Promise<client.Configuration> | null = null;
  const configuration = (): Promise<client.Configuration> => {
    config ??= client
      .discovery(new URL(settings.issuer), settings.clientId, undefined, client.ClientSecretPost(settings.clientSecret), {
        ...(opts.fetch ? { [client.customFetch]: opts.fetch as client.CustomFetch } : {}),
        // The library trusts an ID token from the token endpoint without checking its signature
        // (TLS vouches for it); check it against the issuer's published keys as well.
        execute: settings.allowHttp ? [client.enableNonRepudiationChecks, client.allowInsecureRequests] : [client.enableNonRepudiationChecks],
        timeout: 10,
      })
      .catch((err: unknown) => {
        config = null;
        throw err;
      });
    return config;
  };

  return {
    settings,
    async authorizationUrl(redirectUri, checks) {
      return client.buildAuthorizationUrl(await configuration(), {
        redirect_uri: redirectUri,
        scope: opts.scope ?? SCOPES,
        response_type: 'code',
        state: checks.state,
        nonce: checks.nonce,
        code_challenge: await client.calculatePKCECodeChallenge(checks.codeVerifier),
        code_challenge_method: 'S256',
        // Always let the person choose the account (a shared school laptop).
        prompt: 'select_account',
      });
    },
    async finish(callbackUrl, checks) {
      const tokens = await client.authorizationCodeGrant(await configuration(), callbackUrl, {
        pkceCodeVerifier: checks.codeVerifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error('no ID token');
      return claims as Record<string, unknown>;
    },
  };
}

/** An identity and what the open-door rules (policy.ts) look at. */
export interface SignedInIdentity extends Identity {
  /** Microsoft: the directory (tenant) id. */
  tenant: string | null;
  /** Google: the Workspace domain (`hd`), never the email's domain. */
  domain: string | null;
  /**
   * The provider vouches for the email. Microsoft only with `xms_edov` (the email's domain is
   * verified); its `email` claim is otherwise whatever the tenant typed in. Nothing matches an
   * invite by email today: the invite link is what ties a person to a workspace.
   */
  emailVerified: boolean;
}

export class ClaimsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimsError';
  }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const yes = (v: unknown): boolean => v === true || v === 1 || v === 'true' || v === '1';

/** Reduce checked ID token claims to an identity. Throws ClaimsError (with no claim values in it). */
export function reduceClaims(settings: Pick<OidcProviderSettings, 'id' | 'family'>, claims: Record<string, unknown>): SignedInIdentity {
  const subject = text(claims.sub);
  if (!subject) throw new ClaimsError('the token has no subject');
  const base = { provider: settings.id, subject, displayName: text(claims.name), tenant: null, domain: null };
  switch (settings.family) {
    case 'google':
      return { ...base, email: text(claims.email), emailVerified: yes(claims.email_verified), domain: text(claims.hd)?.toLowerCase() ?? null };
    case 'microsoft': {
      const tid = text(claims.tid);
      if (!tid) throw new ClaimsError('the token has no tenant');
      // Belt and braces beside the library's own check: a token names its own tenant as issuer.
      if (claims.iss !== microsoftIssuer(tid)) throw new ClaimsError('the token issuer does not match its tenant');
      // The tenant controls both: `email` is what its admin typed in, `preferred_username` the
      // sign-in name. Stored for display only; never used to find or match an account.
      const upn = text(claims.preferred_username);
      const email = text(claims.email) ?? (upn?.includes('@') ? upn : null);
      return { ...base, email, emailVerified: email !== null && yes(claims.xms_edov), tenant: tid.toLowerCase() };
    }
    case 'generic':
      return { ...base, email: text(claims.email), emailVerified: yes(claims.email_verified) };
  }
}
