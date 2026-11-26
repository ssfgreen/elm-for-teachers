/**
 * The teacher's pupil logins for a class (issue #223), with the participant token, under
 * /api/sessions/:sessionId/classes/:id:
 *   POST   /logins {count, envelope}  -> { logins: [{ id, username, password }] }   1 to 40
 *   GET    /logins                    -> { logins: [{ id, username, used, label, locked }] }
 *   DELETE /logins/:loginId           -> { ok: true }   only a login never used (409 `login_used`)
 *   POST   /logins/:loginId/password {envelope} -> { login: { id, username, password } }   (#246)
 * The make and new-password responses are the only ones that ever hold a password, and are not
 * cached. Both need pupils on (403 `pupils_off` or `feature_off`), and a class not archived (409
 * `class_archived`). Listing and deleting work whatever the switches say. Logged as
 * `pupil_logins_made` (ids, count) and `pupil_password_reset` (class id).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { pupilsRefusal } from '../pupils/gate.js';
import { newPassword } from './regenerate.js';
import { createPupilLoginStore, MAX_LOGINS_A_BATCH } from './store.js';

const MakeBody = z.object({ count: z.number().int().min(1).max(MAX_LOGINS_A_BATCH), envelope: Envelope });
const PasswordBody = z.object({ envelope: Envelope });

type Id = { Params: { sessionId: string; id: string } };
type LoginId = { Params: { sessionId: string; id: string; loginId: string } };

export function registerPupilLoginRoutes(app: FastifyInstance, deps: AppDeps): void {
  const logins = deps.pupilLogins ?? createPupilLoginStore(deps.db, deps.events);
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId/classes/:id/logins';

  app.post<Id>(base, guard, async (req, reply) => {
    const { count, envelope } = parseOr400(MakeBody, req.body);
    const off = pupilsRefusal(deps.env, req.session!);
    if (off) return reply.code(403).send({ error: 'pupils are switched off for this workspace', code: off });
    const made = await logins.make(req.session!.session_id, req.params.id, count, envelope);
    if (made === undefined) throw notFound('class');
    if (made === 'archived') throw conflict('that class is archived', 'class_archived');
    reply.header('Cache-Control', 'no-store');
    return { logins: made };
  });

  app.post<LoginId>(`${base}/:loginId/password`, guard, async (req, reply) => {
    const { envelope } = parseOr400(PasswordBody, req.body);
    const off = pupilsRefusal(deps.env, req.session!);
    if (off) return reply.code(403).send({ error: 'pupils are switched off for this workspace', code: off });
    const made = await newPassword(deps.db, deps.events, req.session!.session_id, req.params.id, req.params.loginId, envelope);
    if (made === undefined) throw notFound('login');
    if (made === 'archived') throw conflict('that class is archived', 'class_archived');
    reply.header('Cache-Control', 'no-store');
    return { login: made };
  });

  app.get<Id>(base, guard, async (req) => {
    const list = await logins.listForClass(req.session!.session_id, req.params.id);
    if (list === undefined) throw notFound('class');
    return { logins: list.map((l) => ({ id: l.id, username: l.username, used: l.used_at !== null, label: l.label, locked: l.locked })) };
  });

  app.delete<LoginId>(`${base}/:loginId`, guard, async (req) => {
    const done = await logins.remove(req.session!.session_id, req.params.id, req.params.loginId);
    if (done === undefined) throw notFound('login');
    if (done === 'used') throw conflict('that login has been used', 'login_used');
    return { ok: true };
  });
}
