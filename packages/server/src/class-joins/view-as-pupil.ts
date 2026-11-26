/**
 * "View as pupil" (issue #215): the teacher opens /r as the class's test pupil.
 *
 *   POST /api/sessions/:sessionId/classes/:id/view-as-pupil {envelope} -> 204, with the pupil sign-in cookie
 *
 * One test pupil a class, made here and nowhere else: provider `teacher_test`, the class id as
 * the subject. No sign-in provider is ever called `teacher_test` (accounts/providers.ts), so
 * nobody can sign in as it from /r. Its membership has no number and shows as "Test pupil", so
 * the first real pupil is still Pupil 1. Repeat clicks give the same pupil and member, so the
 * per-pupil budget is not reset.
 *
 * Guards: the workspace token, then pupils on (403 `pupils_off` or `feature_off`), then the class:
 * 404 for another workspace's, 409 `class_archived`. A pupil sign-in this browser already had is
 * ended first. Logged as `class_view_as_pupil`, the class id only.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParticipant } from '../auth.js';
import { cookie, readCookie } from '../accounts/cookies.js';
import { createClassService } from '../classes/service.js';
import type { AppDeps } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { PUPIL_SIGN_IN_DAYS, pupilCookieNames } from '../pupils/cookies.js';
import { pupilsRefusal } from '../pupils/gate.js';
import { createPupilStore } from '../pupils/store.js';
import { createClassJoinStore } from './store.js';

/** The provider of every test pupil. Only this route makes one. */
export const TEST_PUPIL_PROVIDER = 'teacher_test';

const Body = z.object({ envelope: Envelope });

type Id = { Params: { sessionId: string; id: string } };

export function registerViewAsPupilRoutes(app: FastifyInstance, deps: AppDeps): void {
  const pupils = deps.pupils ?? createPupilStore(deps.db);
  const joins = deps.classJoins ?? createClassJoinStore(deps.db, deps.events);
  const classes = createClassService(deps.db, deps.events);
  const names = pupilCookieNames(deps.env.AUTH_BASE_URL);

  app.post<Id>('/api/sessions/:sessionId/classes/:id/view-as-pupil', { preHandler: requireParticipant(deps) }, async (req, reply) => {
    const { envelope } = parseOr400(Body, req.body);
    const workspace = req.session!;
    const off = pupilsRefusal(deps.env, workspace);
    if (off) return reply.code(403).send({ error: 'pupils are switched off for this workspace', code: off });
    const cls = await classes.get(workspace.session_id, req.params.id);
    if (!cls) throw notFound('class');
    if (cls.archived_at) throw conflict('that class is archived', 'class_archived');

    const pupil = await pupils.signIn({ provider: TEST_PUPIL_PROVIDER, subject: cls.id, tenant: null });
    await joins.join(pupil.id, { class_id: cls.id, session_id: workspace.session_id }, 'teacher_test');

    // As the provider callback does (pupils/routes.ts): the browser's earlier pupil sign-in ends.
    const previous = readCookie(req, names.signIn);
    if (previous) await pupils.endSignIn(previous);
    const signIn = await pupils.startSignIn(pupil.id);
    await deps.events.appendServer(workspace.session_id, 'class_view_as_pupil', { class_id: cls.id }, envelope);
    return reply
      .header('cache-control', 'no-store')
      .header('set-cookie', cookie(names.signIn, signIn.id, { path: names.signInPath, maxAge: PUPIL_SIGN_IN_DAYS * 86_400, secure: names.secure }))
      .code(204)
      .send();
  });
}
