import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { nowIso } from '@edw/shared';
import { fromSite, requireAdmin } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { buildBundle, slug } from './bundle.js';
import { zipBundle } from './zip.js';

/**
 * Admin routes:
 *   GET /api/admin/sessions/:sessionId/export       -> "<label> export.zip"
 *   GET /api/admin/sessions/:sessionId/export.json  -> { [file]: string }
 * The full bundle is for analysis, so only the admin gets it; a teacher's own download
 * (documents and chats) is made in the browser (client export/workspaceZip.ts).
 * Each download logs one `workspace_export` event in the workspace, after its bundle is built.
 *
 * They stay GETs (the e2e tests and analysis scripts read export.json with the password), but a
 * GET that writes an event must not run from a link on another site: the admin cookie is
 * SameSite=Lax, which a top-level link carries. So with the cookie the request must be a fetch
 * from this site's own page (`Sec-Fetch-Site: same-origin`, or `Origin` equal to the site's);
 * else 403 `export_from_site`. The /admin Download button fetches, so it passes. The password is
 * never sent by another site, so it needs no such check.
 */

/** With the admin cookie, only a fetch from this site's own page. Runs after `requireAdmin`. */
export function fetchedFromSite(base: string | undefined): preHandlerAsyncHookHandler {
  return async function fetchedFromSite(req, reply) {
    if (req.admin?.via !== 'account') return;
    if (req.headers['sec-fetch-site'] === 'same-origin' || fromSite(req, base)) return;
    return reply.code(403).send({ error: 'download the export from the admin page', code: 'export_from_site' });
  };
}
/**
 * The download is "<workspace name> export.zip". The plain filename is an ASCII stand-in;
 * filename* carries the real name, accents and all (RFC 6266).
 */
export function zipDisposition(label: string): string {
  const name = `${label.trim() || 'workspace'} export.zip`;
  const ascii = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || `${slug(label)} export.zip`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function registerExportRoutes(app: FastifyInstance, deps: AppDeps): void {
  const guard = { preHandler: [requireAdmin(deps), fetchedFromSite(deps.env.AUTH_BASE_URL)] };

  /**
   * Log the download in the workspace's own events (server side; the browser route refuses the kind).
   * A signed-in admin's account id goes with it; a password export names no account.
   */
  const logExport = (req: FastifyRequest, sessionId: string, format: 'zip' | 'json', files: number) => {
    const by = req.admin?.via === 'account' ? { via: 'account' as const, account_id: req.admin.account.id } : { via: 'password' as const };
    return deps.events.appendServer(sessionId, 'workspace_export', { format, ...by, files }, { client_ts: nowIso(), focus_pane: 'none', doc_id: null, thread_id: null });
  };

  const sendZip = async (req: FastifyRequest, sessionId: string, reply: FastifyReply) => {
    const { files, label } = await buildBundle(deps, sessionId);
    const zip = await zipBundle(files);
    await logExport(req, sessionId, 'zip', Object.keys(files).length);
    return reply.header('Content-Type', 'application/zip').header('Content-Disposition', zipDisposition(label)).send(Buffer.from(zip));
  };

  app.get<{ Params: { sessionId: string } }>('/api/admin/sessions/:sessionId/export', guard, (req, reply) => sendZip(req, req.params.sessionId, reply));

  app.get<{ Params: { sessionId: string } }>('/api/admin/sessions/:sessionId/export.json', guard, async (req) => {
    const { files } = await buildBundle(deps, req.params.sessionId);
    await logExport(req, req.params.sessionId, 'json', Object.keys(files).length);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(files)) out[k] = typeof v === 'string' ? v : Buffer.from(v).toString('base64');
    return out;
  });
}
