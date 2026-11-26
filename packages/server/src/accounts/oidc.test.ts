import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeIssuer, type FakeIssuer } from './fake-issuer.js';
import { createOidcProvider, newChecks, reduceClaims, type OidcProvider } from './oidc.js';
import { microsoftIssuer, type OidcProviderSettings } from './providers.js';

const REDIRECT = 'http://localhost:5173/api/auth/test/callback';

/** Start a sign-in and follow the issuer's redirect back: the callback address it sends the browser to. */
async function callbackFor(provider: OidcProvider, checks = newChecks(), fetcher: typeof fetch = fetch): Promise<URL> {
  const authorize = await provider.authorizationUrl(REDIRECT, checks);
  const res = await fetcher(authorize, { redirect: 'manual' });
  return new URL(res.headers.get('location')!);
}

describe('against the fake issuer', () => {
  let issuer: FakeIssuer;
  let provider: OidcProvider;
  beforeAll(async () => {
    issuer = await startFakeIssuer();
    const settings: OidcProviderSettings = { kind: 'oidc', id: 'test', label: 'Test', family: 'generic', issuer: issuer.url, clientId: issuer.clientId, clientSecret: issuer.clientSecret, allowHttp: true };
    provider = createOidcProvider(settings);
  });
  afterAll(() => issuer.close());

  it('asks for openid email profile with PKCE, and returns checked claims', async () => {
    const checks = newChecks();
    issuer.next({ claims: { sub: 'abc', email: 'a@school.example' } });
    const back = await callbackFor(provider, checks);
    const asked = issuer.authorizeRequests.at(-1)!;
    expect(asked.searchParams.get('scope')).toBe('openid email profile');
    expect(asked.searchParams.get('code_challenge_method')).toBe('S256');
    expect(asked.searchParams.get('redirect_uri')).toBe(REDIRECT);
    const claims = await provider.finish(back, checks);
    expect(claims).toMatchObject({ sub: 'abc', email: 'a@school.example' });
  });

  it('asks for only the scope it is given (pupils: openid), and teachers keep theirs', async () => {
    const pupil = createOidcProvider(provider.settings, { scope: 'openid' });
    const checks = newChecks();
    issuer.next({ claims: { sub: 'pupil-1' } });
    const back = await callbackFor(pupil, checks);
    expect(issuer.authorizeRequests.at(-1)!.searchParams.get('scope')).toBe('openid');
    expect(await pupil.finish(back, checks)).toMatchObject({ sub: 'pupil-1' });
    await callbackFor(provider);
    expect(issuer.authorizeRequests.at(-1)!.searchParams.get('scope')).toBe('openid email profile');
  });

  it('signs in the person named by a fake_sub cookie, so browser tests side by side are different people', async () => {
    const withCookie: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), cookie: 'other=1; fake_sub=teacher-42' } });
    const checks = newChecks();
    const back = await callbackFor(provider, checks, withCookie);
    expect(await provider.finish(back, checks)).toMatchObject({ sub: 'teacher-42' });
    // Without the cookie, the usual person; and `next` still wins over the cookie.
    const plain = newChecks();
    expect(await provider.finish(await callbackFor(provider, plain), plain)).toMatchObject({ sub: 'fake-subject' });
    issuer.next({ claims: { sub: 'chosen' } });
    const chosen = newChecks();
    expect(await provider.finish(await callbackFor(provider, chosen, withCookie), chosen)).toMatchObject({ sub: 'chosen' });
  });

  it('refuses a state that does not match', async () => {
    const back = await callbackFor(provider);
    await expect(provider.finish(back, { ...newChecks(), state: 'other' })).rejects.toThrow();
  });

  it('refuses a nonce that does not match', async () => {
    const checks = newChecks();
    issuer.next({ nonce: 'someone-elses' });
    const back = await callbackFor(provider, checks);
    await expect(provider.finish(back, checks)).rejects.toThrow();
  });

  it('refuses a token for another audience', async () => {
    const checks = newChecks();
    issuer.next({ aud: 'another-app' });
    await expect(provider.finish(await callbackFor(provider, checks), checks)).rejects.toThrow();
  });

  it('refuses a token signed with a key the issuer does not publish', async () => {
    const checks = newChecks();
    issuer.next({ unknownKey: true });
    await expect(provider.finish(await callbackFor(provider, checks), checks)).rejects.toThrow();
  });

  it('refuses an expired token', async () => {
    const checks = newChecks();
    issuer.next({ expiresIn: -600 });
    await expect(provider.finish(await callbackFor(provider, checks), checks)).rejects.toThrow();
  });
});

describe('a multi-tenant Entra authority', () => {
  let issuer: FakeIssuer;
  let provider: OidcProvider;
  // The fake stands in for login.microsoftonline.com: the provider's settings name the real address.
  let toFake: typeof fetch;
  const TENANT = '11111111-2222-3333-4444-555555555555';
  beforeAll(async () => {
    issuer = await startFakeIssuer({ issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0' });
    toFake = (input, init) => fetch(String(input instanceof Request ? input.url : input).replace('https://login.microsoftonline.com/organizations/v2.0', issuer.url), init);
    const settings: OidcProviderSettings = { kind: 'oidc', id: 'microsoft', label: 'Microsoft', family: 'microsoft', issuer: microsoftIssuer('organizations'), clientId: issuer.clientId, clientSecret: issuer.clientSecret, allowHttp: true };
    provider = createOidcProvider(settings, { fetch: toFake });
  });
  afterAll(() => issuer.close());

  it('accepts a token whose issuer is its own tid', async () => {
    const checks = newChecks();
    issuer.next({ claims: { tid: TENANT } });
    const claims = await provider.finish(await callbackFor(provider, checks, toFake), checks);
    expect(reduceClaims(provider.settings, claims)).toMatchObject({ provider: 'microsoft', tenant: TENANT });
  });

  it('refuses a token whose issuer names another tenant than its tid', async () => {
    const checks = newChecks();
    issuer.next({ claims: { tid: TENANT, iss: microsoftIssuer('99999999-0000-0000-0000-000000000000') } });
    await expect(provider.finish(await callbackFor(provider, checks, toFake), checks)).rejects.toThrow();
  });
});

describe('reduceClaims', () => {
  const ms = { id: 'microsoft', family: 'microsoft' } as const;
  const tid = 'aaaa';

  it('keeps the subject, email and name, and the Google Workspace domain from hd', () => {
    expect(reduceClaims({ id: 'google', family: 'google' }, { sub: 's', email: 'p@x.org', email_verified: true, name: 'P', hd: 'X.org' })).toEqual({
      provider: 'google', subject: 's', email: 'p@x.org', displayName: 'P', emailVerified: true, domain: 'x.org', tenant: null,
    });
    // A personal Gmail account has no hd: no domain, whatever the email says.
    expect(reduceClaims({ id: 'google', family: 'google' }, { sub: 's', email: 'p@gmail.com', email_verified: true }).domain).toBeNull();
  });

  it('trusts a Microsoft email only when the token says its domain is verified (xms_edov)', () => {
    const iss = microsoftIssuer(tid);
    expect(reduceClaims(ms, { sub: 's', tid, iss, email: 'p@x.org' }).emailVerified).toBe(false);
    expect(reduceClaims(ms, { sub: 's', tid, iss, email: 'p@x.org', xms_edov: true }).emailVerified).toBe(true);
    expect(reduceClaims(ms, { sub: 's', tid, iss, preferred_username: 'p@x.org' }).email).toBe('p@x.org');
  });

  it('refuses a Microsoft token with no tid, or whose issuer is not its tid', () => {
    expect(() => reduceClaims(ms, { sub: 's', iss: microsoftIssuer(tid) })).toThrow(/no tenant/);
    expect(() => reduceClaims(ms, { sub: 's', tid, iss: microsoftIssuer('bbbb') })).toThrow(/does not match/);
  });

  it('refuses a token with no subject, and never puts claim values in the message', () => {
    try {
      reduceClaims(ms, { email: 'secret@x.org', tid, iss: microsoftIssuer(tid) });
      expect.fail('should throw');
    } catch (err) {
      expect(String(err)).not.toContain('secret@x.org');
    }
  });
});
