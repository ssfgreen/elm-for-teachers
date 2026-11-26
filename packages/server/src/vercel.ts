/**
 * The server as one Vercel Function (see vercel.json and DEPLOY.md). Vercel serves the built
 * client from its CDN and sends every /api/* request here. The app is built once per
 * function instance (a cold start: settings, database migrations) and reused while the
 * instance stays warm; several instances may run at once (db/client.ts retries their
 * write conflicts).
 *
 * vercel.json rewrites /api/<path> to /api?__path=<path>, so the original path is put back
 * here whatever Vercel reports as the request URL.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { createDeps } from './bootstrap.js';
import { loadEnv, type Env } from './env.js';

let app: Promise<FastifyInstance> | null = null;

/** The settings as this function runs them: marked as on Vercel, so the admin password works only where VERCEL_ENV is `preview` (auth.ts). */
export function vercelEnv(env: Env): Env {
  return { ...env, ON_VERCEL: true };
}

async function start(): Promise<FastifyInstance> {
  const env = vercelEnv(loadEnv());
  const { migrationsApplied, ...deps } = await createDeps(env);
  const server = await buildApp(deps, { logger: true });
  if (migrationsApplied.length) server.log.info({ applied: migrationsApplied }, 'applied migrations');
  await server.ready();
  return server;
}

/** Puts back the path vercel.json moved into `__path`, keeping the rest of the query. */
export function originalUrl(url: string): string {
  const u = new URL(url, 'http://local');
  const path = u.searchParams.get('__path');
  if (path === null) return url;
  u.searchParams.delete('__path');
  const query = u.searchParams.toString();
  return `/api/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let server: FastifyInstance;
  try {
    server = await (app ??= start());
  } catch (err) {
    // A failed start (a missing setting, an unreachable database) is retried on the next request.
    app = null;
    console.error('server failed to start', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'server failed to start; see the function logs' }));
    return;
  }
  req.url = originalUrl(req.url ?? '/');
  server.server.emit('request', req, res);
}
