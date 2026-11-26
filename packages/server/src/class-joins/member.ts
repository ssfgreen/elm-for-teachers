/**
 * The one guard for routes a pupil uses inside their class (R1, R2 and later): the signed-in
 * pupil must be a member of the class, the class not archived, and pupils allowed on the server
 * and in the class's workspace (`pupilsRefusal(env, workspace)`, pupils/gate.ts). Use it after
 * `requirePupil` (auth.ts); it sets `request.member`.
 */
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { SessionRow, SessionService } from '../deps.js';
import type { PupilsEnv } from '../pupils/env.js';
import { pupilsRefusal, type PupilsOff } from '../pupils/gate.js';
import type { ClassJoinStore, Member, MemberOfClass } from './store.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireMember`: the pupil's membership of the route's class. */
    member?: Member;
  }
}

export type MemberRefusal = 'not_member' | 'class_archived' | PupilsOff;

export interface MemberDeps {
  joins: Pick<ClassJoinStore, 'member'>;
  sessions: Pick<SessionService, 'get'>;
  env: PupilsEnv;
}

export type Membership = { ok: true; member: Member; workspace: SessionRow } | { ok: false; reason: MemberRefusal };

/**
 * Whether a class the pupil is in is open to them now: not archived, and pupils allowed on the
 * server and in its workspace. The one place this is decided (`memberOf`, and /r's list).
 */
export async function classOpen(deps: Pick<MemberDeps, 'sessions' | 'env'>, m: Pick<MemberOfClass, 'session_id' | 'archived'>): Promise<{ ok: true; workspace: SessionRow } | { ok: false; reason: MemberRefusal }> {
  if (m.archived) return { ok: false, reason: 'class_archived' };
  const workspace = await deps.sessions.get(m.session_id);
  if (!workspace) return { ok: false, reason: 'not_member' };
  const off = pupilsRefusal(deps.env, workspace);
  return off ? { ok: false, reason: off } : { ok: true, workspace };
}

/** The pupil's membership of the class, if they may use it now; otherwise why not. */
export async function memberOf(deps: MemberDeps, pupilId: string, classId: string): Promise<Membership> {
  const found = await deps.joins.member(pupilId, classId);
  if (!found) return { ok: false, reason: 'not_member' };
  const open = await classOpen(deps, found);
  if (!open.ok) return open;
  return { ok: true, member: found, workspace: open.workspace };
}

/** 403 with the reason code unless the pupil may use the class named by the route's `param`. */
export function requireMember(deps: MemberDeps, param = 'classId'): preHandlerAsyncHookHandler {
  return async function (req, reply) {
    const classId = ((req.params ?? {}) as Record<string, string | undefined>)[param];
    if (!req.pupil) return reply.code(401).send({ error: 'pupil sign-in required' });
    const m = classId ? await memberOf(deps, req.pupil.id, classId) : ({ ok: false, reason: 'not_member' } as const);
    if (!m.ok) return reply.code(403).send({ error: 'not open to this pupil', code: m.reason });
    req.member = m.member;
  };
}
