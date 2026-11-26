/**
 * The library as a second Vercel Function beside the app's (see vercel.json and DEPLOY.md).
 * vercel.json rewrites /library/<path> to /api/library?__path=<path>, so the path is put back
 * here. The collections and plugins are read once per function instance (a cold start) and kept.
 *
 * Every request needs `Authorization: Bearer <LIBRARY_TOKEN>`, which the app sends. The
 * collections include TRAILS (all rights reserved, used with its publisher's agreement), so
 * the library is never open to the web: with no LIBRARY_TOKEN set it answers 503 to everyone.
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadCollections } from '../core/fs.js';
import type { Collection } from '../core/types.js';
import { loadPluginStore, loadPluginStoreSafely, type PluginStore } from '../plugin/store.js';
import { createLibraryHandler, send } from './http.js';

/** Puts back the path vercel.json moved into `__path`, keeping the rest of the query. */
export function originalUrl(url: string): string {
  const u = new URL(url, 'http://local');
  const path = u.searchParams.get('__path');
  if (path === null) return url;
  u.searchParams.delete('__path');
  const query = u.searchParams.toString();
  return `/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
}

/** True when the request's bearer token is the library's token, compared in constant time. */
export function authorised(header: string | undefined, token: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? '');
  if (!m?.[1]) return false;
  const given = Buffer.from(m[1]);
  const wanted = Buffer.from(token);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function createVercelHandler(opts: { token: string | undefined; load: () => ReadonlyMap<string, Collection>; loadPlugins?: () => PluginStore }) {
  let handle: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (!opts.token) return send(res, 503, { error: 'the library is not set up here (LIBRARY_TOKEN is missing)' });
    if (!authorised(req.headers.authorization, opts.token)) return send(res, 401, { error: 'the library needs its token' });
    handle ??= createLibraryHandler(opts.load(), opts.loadPlugins && loadPluginStoreSafely(opts.loadPlugins));
    req.url = originalUrl(req.url ?? '/');
    handle(req, res);
  };
}

const root = process.env.LIBRARY_COLLECTIONS ?? fileURLToPath(new URL('../../collections', import.meta.url));

export default createVercelHandler({ token: process.env.LIBRARY_TOKEN, load: () => loadCollections(root), loadPlugins: () => loadPluginStore() });
