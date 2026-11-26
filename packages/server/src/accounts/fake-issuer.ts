/**
 * A fake OpenID Connect issuer for tests (node:http, its own RSA key). It approves every
 * authorisation request at once and redirects back with a code; the token endpoint checks the
 * client secret, the code, the redirect address and the PKCE verifier, then signs an ID token.
 *
 * A `fake_sub` cookie on the authorisation request names the person signing in (default
 * `fake-subject`). `next(...)` changes what the next login gets, so a test can ask for a token signed with an
 * unknown key, for another audience, with another nonce, or with other claims. Never use this
 * outside tests: the `test` provider that points at it is refused in production (env/sign-in.ts).
 */
import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeLogin {
  /** Claims merged into the ID token (sub, email, name, tid, hd, iss, ...). */
  claims?: Record<string, unknown>;
  /** Sign with a key the issuer does not publish. */
  unknownKey?: boolean;
  /** Put this audience in the token instead of the client id. */
  aud?: string;
  /** Put this nonce in the token instead of the one asked for. */
  nonce?: string;
  /** Seconds until the token expires (negative: already expired). */
  expiresIn?: number;
  /** Send this error back to the callback instead of a code (e.g. `access_denied`). */
  error?: string;
}

export interface FakeIssuerOptions {
  clientId?: string;
  clientSecret?: string;
  /**
   * The issuer it names in its discovery document and tokens; default its own address. A
   * template with `{tenantid}` imitates a multi-tenant Entra authority (tokens then name the tid).
   */
  issuer?: string;
  port?: number;
}

export interface FakeIssuer {
  /** Its own address, e.g. http://127.0.0.1:41234 */
  url: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** What the next login gets (once). */
  next(login: FakeLogin): void;
  /** Every authorisation request it was sent, newest last. */
  readonly authorizeRequests: URL[];
  close(): Promise<void>;
}

interface Pending {
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string | null;
  login: FakeLogin;
}

const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

function sign(claims: Record<string, unknown>, key: KeyObject, kid: string): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = b64url(JSON.stringify(claims));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${b64url(sig)}`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function clientFrom(req: IncomingMessage, form: URLSearchParams): { id: string | null; secret: string | null } {
  const h = req.headers.authorization;
  if (h?.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').map((x) => decodeURIComponent(x));
    return { id: id ?? null, secret: secret ?? null };
  }
  return { id: form.get('client_id'), secret: form.get('client_secret') };
}

export async function startFakeIssuer(opts: FakeIssuerOptions = {}): Promise<FakeIssuer> {
  const clientId = opts.clientId ?? 'test-client';
  const clientSecret = opts.clientSecret ?? 'test-secret';
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomBytes(6).toString('hex');
  const jwk = { ...key.publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };
  const pending = new Map<string, Pending>();
  const authorizeRequests: URL[] = [];
  let queued: FakeLogin = {};
  let url = '';
  let issuer = '';

  const server: Server = createServer((req, res) => {
    void (async () => {
      const u = new URL(req.url ?? '/', url);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (u.pathname === '/.well-known/openid-configuration') {
        return json(200, {
          issuer,
          authorization_endpoint: `${url}/authorize`,
          token_endpoint: `${url}/token`,
          jwks_uri: `${url}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
          scopes_supported: ['openid', 'email', 'profile'],
        });
      }
      if (u.pathname === '/jwks') return json(200, { keys: [jwk] });
      if (u.pathname === '/authorize') {
        authorizeRequests.push(u);
        // A browser test's own person: a `fake_sub` cookie names the subject (cookies ignore the port,
        // so a test sets it for this host), and tests running side by side are different people.
        const sub = /(?:^|;\s*)fake_sub=([A-Za-z0-9_-]{1,64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
        const login: FakeLogin = sub ? { ...queued, claims: { sub, ...queued.claims } } : queued;
        queued = {};
        const redirectUri = u.searchParams.get('redirect_uri') ?? '';
        const back = new URL(redirectUri);
        const state = u.searchParams.get('state');
        if (state !== null) back.searchParams.set('state', state);
        if (login.error) {
          back.searchParams.set('error', login.error);
        } else {
          const code = randomBytes(16).toString('base64url');
          pending.set(code, {
            clientId: u.searchParams.get('client_id') ?? '',
            redirectUri,
            challenge: u.searchParams.get('code_challenge') ?? '',
            nonce: u.searchParams.get('nonce'),
            login,
          });
          back.searchParams.set('code', code);
        }
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      if (u.pathname === '/token' && req.method === 'POST') {
        const form = new URLSearchParams(await readBody(req));
        const client = clientFrom(req, form);
        if (client.id !== clientId || client.secret !== clientSecret) return json(401, { error: 'invalid_client' });
        const code = form.get('code') ?? '';
        const p = pending.get(code);
        pending.delete(code);
        if (!p || p.clientId !== clientId || p.redirectUri !== form.get('redirect_uri')) return json(400, { error: 'invalid_grant' });
        const verifier = form.get('code_verifier') ?? '';
        if (b64url(createHash('sha256').update(verifier).digest()) !== p.challenge) return json(400, { error: 'invalid_grant', error_description: 'pkce' });
        const now = Math.floor(Date.now() / 1000);
        const claims: Record<string, unknown> = {
          iss: issuer.replace('{tenantid}', String(p.login.claims?.tid ?? '')),
          aud: p.login.aud ?? clientId,
          sub: 'fake-subject',
          iat: now,
          exp: now + (p.login.expiresIn ?? 300),
          ...(p.nonce !== null || p.login.nonce ? { nonce: p.login.nonce ?? p.nonce } : {}),
          ...p.login.claims,
        };
        const id_token = sign(claims, (p.login.unknownKey ? stranger : key).privateKey, kid);
        return json(200, { access_token: randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 300, id_token });
      }
      json(404, { error: 'not_found' });
    })().catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  issuer = opts.issuer ?? url;

  return {
    url,
    issuer,
    clientId,
    clientSecret,
    next(login) {
      queued = login;
    },
    authorizeRequests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
