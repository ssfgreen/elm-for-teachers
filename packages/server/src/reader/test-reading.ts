/** Tests only: a workspace with pupils on, a class with a reading set, and pupils signed in to it. */
import { newUlid, nowIso, type ReadingBlock } from '@edw/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { createClassService } from '../classes/service.js';
import { createClassJoinStore } from '../class-joins/store.js';
import type { AppDeps } from '../deps.js';
import { pupilCookieNames } from '../pupils/cookies.js';
import { createPupilStore } from '../pupils/store.js';
import { createReaderPromptStore } from '../reader-prompts/store.js';
import { envelopeFor, testDeps, testEnv, type TempDb } from '../test-helpers.js';

export const BASE = 'https://edw.example';
export const PUPIL_COOKIE = pupilCookieNames(BASE).signIn;

export const BLOCKS: ReadingBlock[] = [
  { id: 'b_head', type: 'heading', content: '# The **water** cycle' },
  { id: 'b_para', type: 'paragraph', content: 'Rain falls from clouds.' },
  { id: 'b_pic', type: 'image', content: '![Clouds](asset:ast_named)' },
];

export async function readerApp(t: TempDb, env: Record<string, string> = {}): Promise<{ deps: AppDeps; app: FastifyInstance }> {
  const deps: AppDeps = { ...testDeps(t.db), env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE, PUPILS: 'on', ...env }) };
  const app = await buildApp(deps);
  await app.ready();
  return { deps, app };
}

/** A class in a new workspace (pupils on unless said), with the workspace's default prompts. */
export async function classIn(deps: AppDeps, opts: { pupils?: boolean; name?: string } = {}) {
  const { session } = await deps.sessions.create('Reader teacher', { features: { pupils: opts.pupils ?? true } });
  const classes = createClassService(deps.db, deps.events);
  const env = envelopeFor(null, null, 'none');
  const y = await classes.createYearGroup(session.session_id, { name: 'Year 8' }, env);
  const cls = await classes.create(session.session_id, { year_group_id: y.id, name: opts.name ?? '8B' }, env);
  const prompts = await createReaderPromptStore(deps.db, deps.events, () => deps.loaded.config.reader.default_prompts).list(session.session_id);
  return { session, cls, prompts, env };
}

type Class = Awaited<ReturnType<typeof classIn>>;

/** A reading set straight into the table (the teacher's routes are tested in readings/). */
export async function readingIn(deps: AppDeps, c: Class, opts: { name?: string; blocks?: ReadingBlock[]; follow_ups_max?: number | null; created_at?: string; removed?: boolean } = {}): Promise<string> {
  const id = newUlid();
  const now = opts.created_at ?? nowIso();
  await deps.db.execute(
    'INSERT INTO readings (id, session_id, class_id, doc_id, name, blocks, content_hash, follow_ups_max, created_at, updated_at, removed_at) VALUES (?, ?, ?, (SELECT id FROM docs WHERE session_id = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?)',
    [id, c.session.session_id, c.cls.id, c.session.session_id, opts.name ?? 'Rain', JSON.stringify(opts.blocks ?? BLOCKS), 'sha256:x', opts.follow_ups_max ?? null, now, now, opts.removed ? now : null],
  );
  for (const [i, p] of c.prompts.entries()) {
    await deps.db.execute('INSERT INTO reading_prompts (reading_id, prompt_id, session_id, position) VALUES (?, ?, ?, ?)', [id, p.id, c.session.session_id, i]);
  }
  return id;
}

let n = 0;

/** A pupil signed in, a member of each class given; their cookie header. */
export async function pupilIn(deps: AppDeps, ...classes: Class[]) {
  const pupils = createPupilStore(deps.db);
  const pupil = await pupils.signIn({ provider: 'test', subject: `reader-${++n}`, tenant: null });
  const signIn = await pupils.startSignIn(pupil.id);
  const joins = createClassJoinStore(deps.db, deps.events);
  const members = [];
  for (const c of classes) members.push(await joins.join(pupil.id, { class_id: c.cls.id, session_id: c.session.session_id }));
  return { pupil, members, headers: { cookie: `${PUPIL_COOKIE}=${signIn.id}`, origin: BASE } };
}
