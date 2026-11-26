/** Tests only: a class with a reading set and a signed-in pupil in it, and a provider that records what it is sent. */
import type { AgentRequest, AgentStep, ProviderAdapter, ProviderResult } from '@edw/shared';
import type { AppDeps } from '../deps.js';
import { classWithCode } from '../class-joins/test-class.js';
import { createClassJoinStore } from '../class-joins/store.js';
import { createClassService } from '../classes/service.js';
import { createPupilStore } from '../pupils/store.js';
import { createReaderPromptStore } from '../reader-prompts/store.js';
import { createReadingStore } from '../readings/store.js';
import { ProviderError } from '../gateway/errors.js';
import { envelopeFor } from '../test-helpers.js';

export const ARTICLE = ['The **Romans** built roads across Britain.', 'Their roads were straight, so soldiers could march quickly from one fort to the next.'];
export const BASE = 'http://localhost:5173';

/** Answers every call with `reply` and these counts, and keeps each request; `fail` makes the next call throw. */
export class RecordingProvider implements ProviderAdapter {
  readonly temperature = 1;
  requests: AgentRequest[] = [];
  fail = false;
  constructor(
    readonly model = 'gpt-6-sol',
    public reply = 'Roads helped soldiers move. Why do you think straight roads are quicker?',
    public counts: { input_tokens: number | null; output_tokens: number | null } = { input_tokens: 1000, output_tokens: 200 },
  ) {}
  async complete(): Promise<ProviderResult> {
    throw new Error('the reader uses respond');
  }
  async respond(request: AgentRequest): Promise<AgentStep> {
    this.requests.push(request);
    if (this.fail) throw new ProviderError('http', 'provider said 500', 500);
    return { text: this.reply, ...this.counts, provider_request_id: 'r', toolCalls: [], output: [] };
  }
}

let n = 0;

/** A pupil signed in and in the class (or its test member); the cookie to send. */
export async function pupilIn(deps: Pick<AppDeps, 'db' | 'events'>, c: { cls: { id: string }; session: { session_id: string } }, role: 'pupil' | 'teacher_test' = 'pupil') {
  const pupils = createPupilStore(deps.db);
  const pupil = await pupils.signIn({ provider: 'test', subject: `reader-${++n}`, tenant: null });
  const signIn = await pupils.startSignIn(pupil.id);
  const member = await createClassJoinStore(deps.db, deps.events).join(pupil.id, { class_id: c.cls.id, session_id: c.session.session_id }, role);
  return { pupil, member, cookie: `edw_pupil=${signIn.id}` };
}

/** A class (named `className`) with one reading of ARTICLE, the default prompts allowed, and a pupil in it. */
export async function readingWorld(deps: Pick<AppDeps, 'db' | 'events' | 'sessions' | 'threads' | 'canvas' | 'loaded'>, opts: { className?: string; follow_ups_max?: number | null } = {}) {
  const c = await classWithCode(deps, { name: opts.className ?? '8B' });
  const sid = c.session.session_id;
  const { thread, doc } = await deps.threads.create(sid, c.env);
  for (const line of [...ARTICLE].reverse()) {
    await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: line }, envelopeFor(doc, thread));
  }
  const library = createReaderPromptStore(deps.db, deps.events, () => deps.loaded.config.reader.default_prompts);
  const prompts = await library.list(sid);
  const readings = createReadingStore({ db: deps.db, events: deps.events, classes: createClassService(deps.db, deps.events), canvas: deps.canvas, prompts: (s) => library.list(s) });
  const reading = await readings.set(sid, c.cls.id, { doc_id: doc.id, prompt_ids: prompts.map((p) => p.id), follow_ups_max: opts.follow_ups_max ?? null }, c.env);
  const explain = prompts.find((p) => p.after_highlight)!;
  const followUp = prompts.find((p) => p.follow_up)!;
  const pupil = await pupilIn(deps, c);
  return { ...c, sid, reading, explain, followUp, library, readings, pupil };
}
