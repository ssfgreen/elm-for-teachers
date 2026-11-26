/**
 * Off until Sam decides what removal should do (13 Nov 2026): app.ts does not register these routes.
 *
 * Removing pupil rows from stored model calls after the fact (issue #16, docs/classes.md).
 * Admin (Bearer ADMIN_PASSWORD):
 *   POST /api/admin/sessions/:sessionId/scrub-pupil-rows {apply?} -> { dry_run, workspaces: [counts] }
 *   POST /api/admin/scrub-pupil-rows {apply?}                     -> the same, for every workspace with calls
 * A dry run (the default) changes nothing and returns counts only. A real run (`scrubSessions`)
 * is refused (409 `export_required`) unless an export of each workspace was taken since its last
 * model call, checked in the same transaction, or if any row line would be left (`pupil_rows_left`).
 * It rewrites the calls and logs one `pupil_rows_scrub` event per workspace: when (the event's
 * time) and how many calls, tables and rows, and the `unsure` and `leftover` counts. Never the rows.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nowIso } from '@edw/shared';
import { requireAdmin } from '../auth.js';
import { scrubPupilRows } from '../classes/pupil-scrub.js';
import type { Db } from '../db/client.js';
import type { AppDeps, EventStore } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { parseOr400 } from '../http/request.js';
import { gatewayCallPayloads, sessionsWithCalls, setGatewayCallPayload } from './history.js';
import type { DbOrTx } from '../db/run.js';

const Body = z.object({ apply: z.boolean().optional() }).optional();

export interface ScrubCounts {
  session_id: string;
  /** Calls with at least one table in them. */
  calls: number;
  tables: number;
  rows: number;
  /** Calls with a table whose end was in doubt (removed through to the closing line), or with no closing line (left alone). */
  unsure: number;
  /** Pupil row lines still in a class message whose table was removed: a real run is refused. */
  leftover: number;
}

/** Each call's payload with its tables replaced, and the counts. Reads only. */
async function plan(x: DbOrTx, sessionId: string) {
  const changed: { id: string; payload: string }[] = [];
  const counts: ScrubCounts = { session_id: sessionId, calls: 0, tables: 0, rows: 0, unsure: 0, leftover: 0 };
  for (const call of await gatewayCallPayloads(x, sessionId)) {
    const r = scrubPupilRows(JSON.parse(call.payload) as unknown);
    counts.leftover += r.leftover;
    if (r.unsure) counts.unsure += 1;
    if (!r.tables) continue;
    changed.push({ id: call.id, payload: JSON.stringify(r.payload) });
    counts.calls += 1;
    counts.tables += r.tables;
    counts.rows += r.rows;
  }
  return { changed, counts };
}

/**
 * Whether an export of the workspace was taken since its last model call (Sam: a real run
 * needs one each time). Read inside the run's transaction, so no model call can land between
 * the check and the scrub.
 */
export type ExportCheck = (x: DbOrTx, sessionId: string) => Promise<boolean>;

/**
 * Always no, so a real run is refused (the orchestrator's answer on the pull request for #16).
 * The admin export (export/routes.ts) now logs a `workspace_export` event, but this check is not
 * wired to it while the scrub stays switched off until Sam decides.
 */
export const noExportRecorded: ExportCheck = () => Promise.resolve(false);

export interface ScrubDeps {
  db: Db;
  events: EventStore;
  /** Tests stand in for the record of an export here; default `noExportRecorded`. */
  exportTaken?: ExportCheck;
}

/**
 * Counts what a real run would change in each workspace, and changes it when `apply`: in one
 * transaction, refused as a whole (409 `export_required`) if any workspace has no export since
 * its last model call, or (409 `pupil_rows_left`) if any would keep a pupil row line in a class
 * message. Each workspace scrubbed logs one `pupil_rows_scrub` event.
 */
export async function scrubSessions(deps: ScrubDeps, sessionIds: readonly string[], apply: boolean): Promise<ScrubCounts[]> {
  if (!apply) {
    const out: ScrubCounts[] = [];
    for (const id of sessionIds) out.push((await plan(deps.db, id)).counts);
    return out;
  }
  const exportTaken = deps.exportTaken ?? noExportRecorded;
  return deps.db.transaction(async (tx) => {
    const plans = [];
    for (const id of sessionIds) {
      if (!(await exportTaken(tx, id))) throw conflict(`no export of workspace ${id} is recorded since its last model call: export it first`, 'export_required');
      plans.push(await plan(tx, id));
    }
    // Every workspace that would keep a row line, by id and count only, so the researcher knows where to look.
    const left = plans.filter((p) => p.counts.leftover).map((p) => `${p.counts.session_id}: ${p.counts.leftover}`);
    if (left.length) throw conflict(`pupil row lines would be left in the stored calls of ${left.length} workspace${left.length === 1 ? '' : 's'} (${left.join(', ')})`, 'pupil_rows_left');
    for (const { changed, counts } of plans) {
      for (const c of changed) await setGatewayCallPayload(tx, c.id, c.payload);
      const { calls, tables, rows, unsure, leftover } = counts;
      await deps.events.appendServer(counts.session_id, 'pupil_rows_scrub', { calls, tables, rows, unsure, leftover }, { client_ts: nowIso(), focus_pane: 'none', doc_id: null, thread_id: null }, tx);
    }
    return plans.map((p) => p.counts);
  });
}

export function registerScrubRoutes(app: FastifyInstance, deps: AppDeps): void {
  const guard = { preHandler: requireAdmin(deps) };

  const run = async (sessionIds: string[], apply: boolean) => ({ dry_run: !apply, workspaces: await scrubSessions(deps, sessionIds, apply) });

  app.post<{ Params: { sessionId: string } }>('/api/admin/sessions/:sessionId/scrub-pupil-rows', guard, async (req) => {
    const apply = parseOr400(Body, req.body)?.apply ?? false;
    if (!(await deps.sessions.get(req.params.sessionId))) throw notFound('session');
    return run([req.params.sessionId], apply);
  });

  app.post('/api/admin/scrub-pupil-rows', guard, async (req) => {
    const apply = parseOr400(Body, req.body)?.apply ?? false;
    return run(await sessionsWithCalls(deps.db), apply);
  });
}
