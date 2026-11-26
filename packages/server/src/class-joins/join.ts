/**
 * Whether a typed class code lets a pupil in (issue #209): a code some class has, that class not
 * archived, and pupils allowed both on the server and in the class's workspace (pupils/gate.ts).
 * A code no class has counts against the address in the wrong-code counter it shares with the
 * access code (http/wrong-codes.ts). The code is never logged.
 */
import type { SessionService } from '../deps.js';
import type { WrongCodeCounter } from '../http/wrong-codes.js';
import type { PupilsEnv } from '../pupils/env.js';
import { pupilsRefusal, type PupilsOff } from '../pupils/gate.js';
import { normaliseClassCode } from './codes.js';
import type { ClassJoinStore, CodedClass } from './store.js';

export type JoinRefusal = 'code_unknown' | 'too_many_codes' | 'class_archived' | PupilsOff;

export type CodeCheck = { ok: true; canonical: string; cls: CodedClass } | { ok: false; reason: JoinRefusal };

/** The HTTP status for each refusal, for routes that answer in JSON. */
export const JOIN_STATUS: Record<JoinRefusal, number> = { code_unknown: 404, too_many_codes: 429, class_archived: 409, pupils_off: 403, feature_off: 403 };

export interface CodeCheckDeps {
  joins: Pick<ClassJoinStore, 'classForCode'>;
  sessions: Pick<SessionService, 'get'>;
  env: PupilsEnv;
}

/** The class a live code opens, still open to pupils, or why not. Does not count. */
export async function liveClass(deps: CodeCheckDeps, canonical: string): Promise<CodeCheck> {
  const cls = await deps.joins.classForCode(canonical);
  if (!cls) return { ok: false, reason: 'code_unknown' };
  if (cls.archived) return { ok: false, reason: 'class_archived' };
  const workspace = await deps.sessions.get(cls.session_id);
  const off = pupilsRefusal(deps.env, workspace ?? { features: { pupils: false } });
  if (off) return { ok: false, reason: off };
  return { ok: true, canonical, cls };
}

/** What a pupil typed, from address `ip`: counted when no class has it. */
export async function checkClassCode(deps: CodeCheckDeps & { counter: WrongCodeCounter }, ip: string, typed: string): Promise<CodeCheck> {
  if (deps.counter.blocked(ip)) return { ok: false, reason: 'too_many_codes' };
  const canonical = normaliseClassCode(typed);
  const check: CodeCheck = canonical ? await liveClass(deps, canonical) : { ok: false, reason: 'code_unknown' };
  if (!check.ok && check.reason === 'code_unknown') deps.counter.record(ip);
  return check;
}
