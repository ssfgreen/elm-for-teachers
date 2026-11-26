/** Tests only: a workspace with pupils on, a class in it and the class's code. */
import type { AppDeps } from '../deps.js';
import { createClassService } from '../classes/service.js';
import { envelopeFor } from '../test-helpers.js';
import { createClassJoinStore } from './store.js';

export async function classWithCode(deps: Pick<AppDeps, 'db' | 'events' | 'sessions'>, opts: { name?: string; pupils?: boolean } = {}) {
  const { session } = await deps.sessions.create('Pupils’ teacher', { features: { pupils: opts.pupils ?? true } });
  const classes = createClassService(deps.db, deps.events);
  const env = envelopeFor(null, null, 'none');
  const y = await classes.createYearGroup(session.session_id, { name: 'Year 8' }, env);
  const cls = await classes.create(session.session_id, { year_group_id: y.id, name: opts.name ?? '8B' }, env);
  const code = (await createClassJoinStore(deps.db, deps.events).setCode(session.session_id, cls.id, 'make', env)) as string;
  return { session, cls, code, env };
}
