/**
 * Whether pupils may use a pupil route. Only `PUPILS=on` on the server lets them in (unset is off,
 * so a server that was never told stays shut); a route that
 * concerns a workspace also needs that workspace's `pupils` switch on (shared/src/features.ts),
 * which only an admin turns on. Until pupils join classes (#152 P2) no pupil route concerns a
 * workspace, so signing in needs only `PUPILS=on`, and the pupil page says so.
 */
import type { Features } from '@edw/shared';
import type { PupilsEnv } from './env.js';

/** Why pupils are refused: the reason code a refusal carries. */
export type PupilsOff = 'pupils_off' | 'feature_off';

/** Null when pupils may go on; otherwise why not. Pass the workspace's switches when the route concerns one. */
export function pupilsRefusal(env: PupilsEnv, workspace?: { features: Pick<Features, 'pupils'> }): PupilsOff | null {
  if (env.PUPILS !== 'on') return 'pupils_off';
  if (workspace && !workspace.features.pupils) return 'feature_off';
  return null;
}
