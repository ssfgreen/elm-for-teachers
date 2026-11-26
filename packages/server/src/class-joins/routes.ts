/**
 * A class's code and members, for the teacher (participant token), under /api/sessions/:sessionId
 * (issue #209; the code card that uses them is P2b1):
 *   GET  /classes/:id/code                         -> { code }   (`XXXX-XXXX`, or null)
 *   POST /classes/:id/code {action, envelope}      -> { code }   action: make | renew | close
 *   GET  /classes/:id/members                      -> { members: [{ id, label, provider, joined_on }] }   (pupils only, not the test member)
 *   DELETE /classes/:id/members/:memberId {envelope} -> 204   (#220: pupils/remove.ts; 409 `test_pupil` for the test member)
 * Making or renewing a code needs pupils on (`PUPILS=on` and the workspace's `pupils` switch):
 * 403 `pupils_off` or `feature_off` otherwise; 409 `class_archived` for an archived class.
 * Closing, reading and removing a pupil work whatever the switches say, and for an archived class,
 * so a child's data can always be removed. Logged as `class_code_set` and `class_pupil_remove` (ids only).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { pupilsRefusal } from '../pupils/gate.js';
import { removeMember } from '../pupils/remove.js';
import { createClassJoinStore, memberLabel } from './store.js';

const CodeBody = z.object({ action: z.enum(['make', 'renew', 'close']), envelope: Envelope });
const RemoveBody = z.object({ envelope: Envelope });

type Id = { Params: { sessionId: string; id: string } };
type MemberId = { Params: { sessionId: string; id: string; memberId: string } };

export function registerClassJoinRoutes(app: FastifyInstance, deps: AppDeps): void {
  const joins = deps.classJoins ?? createClassJoinStore(deps.db, deps.events);
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId/classes/:id';

  app.get<Id>(`${base}/code`, guard, async (req) => {
    const code = await joins.code(req.session!.session_id, req.params.id);
    if (code === undefined) throw notFound('class');
    return { code };
  });

  app.post<Id>(`${base}/code`, guard, async (req, reply) => {
    const { action, envelope } = parseOr400(CodeBody, req.body);
    const off = action === 'close' ? null : pupilsRefusal(deps.env, req.session!);
    if (off) return reply.code(403).send({ error: 'pupils are switched off for this workspace', code: off });
    const code = await joins.setCode(req.session!.session_id, req.params.id, action, envelope);
    if (code === undefined) throw notFound('class');
    if (code === 'archived') throw conflict('that class is archived', 'class_archived');
    return { code };
  });

  app.get<Id>(`${base}/members`, guard, async (req) => {
    const sid = req.session!.session_id;
    if ((await joins.code(sid, req.params.id)) === undefined) throw notFound('class');
    const members = await joins.membersOf(sid, req.params.id);
    return { members: members.map((m) => ({ id: m.id, label: memberLabel(m), provider: m.provider, joined_on: m.joined_at.slice(0, 10) })) };
  });

  app.delete<MemberId>(`${base}/members/:memberId`, guard, async (req, reply) => {
    const { envelope } = parseOr400(RemoveBody, req.body);
    const done = await removeMember(deps.db, deps.events, req.session!.session_id, req.params.id, req.params.memberId, envelope);
    if (done === 'not_found') throw notFound('member');
    if (done === 'test_pupil') throw conflict('that is the test pupil', 'test_pupil');
    return reply.code(204).send();
  });
}
