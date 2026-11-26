/** POST /api/pupil/readings/:readingId/asks (#214): what reaches the model, and every refusal before it. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LoadedConfig } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { cookieNames } from '../accounts/cookies.js';
import { createAccountStore } from '../accounts/store.js';
import { spendGbp } from '../budget/store.js';
import { createReaderSettingsStore } from '../classes/reader-settings.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { BASE, pupilIn, readingWorld, RecordingProvider } from './test-reading.js';

let t: TempDb;
let deps: AppDeps;
let provider: RecordingProvider;
let app: FastifyInstance;

beforeAll(async () => {
  t = await tempDb();
  provider = new RecordingProvider();
  deps = { ...testDeps(t.db, provider), env: testEnv({ AUTH_BASE_URL: BASE, PUPILS: 'on' }) };
  app = await buildApp(deps);
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});
beforeEach(() => {
  provider.requests = [];
  provider.fail = false;
});

type World = Awaited<ReturnType<typeof readingWorld>>;
const PASSAGE = 'roads were straight';

/** An ask as `cookie` (the world's pupil by default), through `on` (the shared app by default). */
const ask = (w: World, body: Record<string, unknown>, opts: { cookie?: string; on?: FastifyInstance; reading?: string } = {}) =>
  (opts.on ?? app).inject({ method: 'POST', url: `/api/pupil/readings/${opts.reading ?? w.reading.id}/asks`, headers: { origin: BASE, cookie: opts.cookie ?? w.pupil.cookie }, payload: body });
const first = (w: World, extra: Record<string, unknown> = {}, opts = {}) => ask(w, { prompt_id: w.explain.id, highlighted_text: PASSAGE, ...extra }, opts);
const outcome = (r: { statusCode: number; json(): { code?: string } }) => [r.statusCode, r.json().code];

/** An app over the same database with another config or environment. */
async function appWith(over: { loaded?: LoadedConfig; env?: Partial<AppDeps['env']> }) {
  return buildApp({ ...deps, ...(over.loaded ? { loaded: over.loaded } : {}), env: { ...deps.env, ...over.env } });
}

describe('an ask', () => {
  it('answers with the reply and the follow-ups left, from one call on reader.model under the class’s safety instruction', async () => {
    const w = await readingWorld(deps, { className: '8B Sunflowers' });
    const r = await first(w);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ask: { id: expect.any(String), reply: provider.reply, follow_ups_left: 3 } });
    expect(provider.requests).toHaveLength(1);
    const sent = provider.requests[0]!;
    expect([sent.model, sent.tools, sent.instructions]).toEqual(['gpt-6-luna', [], deps.loaded.config.reader.safety_instruction]);
    const text = JSON.stringify(sent);
    expect(text).toContain('Romans built roads across Britain.');
    expect(text).toContain(w.explain.instruction);
    for (const never of ['8B Sunflowers', 'Pupil 1', w.pupil.member.id, w.pupil.pupil.id, w.cls.id, w.sid, '"test"']) expect(text).not.toContain(never);

    await createReaderSettingsStore(t.db, deps.events, () => deps.loaded.config.reader).set(w.sid, w.cls.id, { safety_instruction: 'Our own: be gentle.' }, w.env);
    expect((await first(w)).statusCode).toBe(200);
    expect(provider.requests[1]!.instructions).toBe('Our own: be gentle.');
  });

  it('a follow-up carries the chain, up to the limit in force, then 409', async () => {
    const w = await readingWorld(deps, { follow_ups_max: 1 });
    const a = (await first(w)).json().ask;
    const b = await ask(w, { prompt_id: w.followUp.id, highlighted_text: PASSAGE, parent_ask_id: a.id });
    expect(b.json().ask.follow_ups_left).toBe(0);
    expect(provider.requests[1]!.input.map((m) => (m as { role: string }).role)).toEqual(['user', 'assistant', 'user']);
    expect(outcome(await ask(w, { prompt_id: w.followUp.id, highlighted_text: PASSAGE, parent_ask_id: b.json().ask.id }))).toEqual([409, 'follow_ups_used']);
    expect(provider.requests).toHaveLength(2);
  });

  it('the teacher’s test pupil can ask', async () => {
    const w = await readingWorld(deps);
    const test = await pupilIn(deps, w, 'teacher_test');
    expect((await first(w, {}, { cookie: test.cookie })).statusCode).toBe(200);
  });
});

describe('refusals, each before any call', () => {
  it('422 for a passage not in the reading or too long; 400 for a typed question', async () => {
    const w = await readingWorld(deps);
    expect(outcome(await first(w, { highlighted_text: 'Vikings built boats' }))).toEqual([422, 'highlight_not_in_reading']);
    expect(outcome(await first(w, { highlighted_text: 'x'.repeat(1001) }))).toEqual([422, 'highlight_too_long']);
    expect((await first(w, { question: 'what is your name?' })).statusCode).toBe(400);
    expect(provider.requests).toHaveLength(0);
  });

  it('409 for a prompt not allowed on the reading, gone from the library, or not ticked for this place', async () => {
    const w = await readingWorld(deps);
    const other = await w.library.add(w.sid, { label: 'Summarise', instruction: 'Summarise it.', after_highlight: true, follow_up: true }, w.env);
    expect(outcome(await first(w, { prompt_id: (other as { id: string }).id }))).toEqual([409, 'prompt_unavailable']);
    expect(outcome(await first(w, { prompt_id: w.followUp.id }))).toEqual([409, 'prompt_not_offered']);
    const a = (await first(w)).json().ask;
    expect(outcome(await ask(w, { prompt_id: w.explain.id, highlighted_text: PASSAGE, parent_ask_id: a.id }))).toEqual([409, 'prompt_not_offered']);
    await w.library.remove(w.sid, w.explain.id, w.env);
    expect(outcome(await first(w))).toEqual([409, 'prompt_unavailable']);
    expect(provider.requests).toHaveLength(1);
  });

  it('404 for another member’s ask as the parent', async () => {
    const w = await readingWorld(deps);
    const a = (await first(w)).json().ask;
    const other = await pupilIn(deps, w);
    expect(outcome(await ask(w, { prompt_id: w.followUp.id, highlighted_text: PASSAGE, parent_ask_id: a.id }, { cookie: other.cookie }))).toEqual([404, 'not_found']);
    expect(provider.requests).toHaveLength(1);
  });

  it('membership comes first: an unknown reading is 403 not_member like another class’s, a removed one 404, both before the body is read', async () => {
    const w = await readingWorld(deps);
    expect(outcome(await first(w, {}, { reading: '01J00000000000000000000000' }))).toEqual([403, 'not_member']);
    const elsewhere = await readingWorld(deps);
    expect(outcome(await ask(w, {}, { cookie: elsewhere.pupil.cookie }))).toEqual([403, 'not_member']);
    await w.readings.remove(w.sid, w.cls.id, w.reading.id, w.env);
    expect(outcome(await first(w))).toEqual([404, 'not_found']);
    expect(provider.requests).toHaveLength(0);
  });

  it('429 when the pupil’s budget in the class, or the workspace’s, could not cover the call', async () => {
    const w = await readingWorld(deps);
    await createReaderSettingsStore(t.db, deps.events, () => deps.loaded.config.reader).set(w.sid, w.cls.id, { pupil_budget_gbp: 0 }, w.env);
    expect(outcome(await first(w))).toEqual([429, 'pupil_budget_spent']);

    const v = await readingWorld(deps);
    const broke = await appWith({ loaded: { ...deps.loaded, config: { ...deps.loaded.config, limits: { ...deps.loaded.config.limits, budget_gbp: 1e-9, budget_overrun_gbp: 0 } } } });
    try {
      expect(outcome(await first(v, {}, { on: broke }))).toEqual([429, 'budget_spent']);
    } finally {
      await broke.close();
    }
    expect(provider.requests).toHaveLength(0);
  });

  it('503 without a zero-retention provider', async () => {
    const w = await readingWorld(deps);
    const keeps = await appWith({ loaded: { ...deps.loaded, config: { ...deps.loaded.config, provider: { ...deps.loaded.config.provider, zero_retention: false } } } });
    try {
      expect(outcome(await first(w, {}, { on: keeps }))).toEqual([503, 'no_zero_retention']);
    } finally {
      await keeps.close();
    }
    expect(provider.requests).toHaveLength(0);
  });

  it('403 for another class’s pupil, the workspace’s switch off or PUPILS off; 401 without a pupil sign-in; 403 from another site', async () => {
    const w = await readingWorld(deps);
    const elsewhere = await readingWorld(deps);
    expect(outcome(await first(w, {}, { cookie: elsewhere.pupil.cookie }))).toEqual([403, 'not_member']);
    const shut = await appWith({ env: { PUPILS: 'off' } });
    try {
      expect(outcome(await first(w, {}, { on: shut }))).toEqual([403, 'pupils_off']);
    } finally {
      await shut.close();
    }
    await t.db.execute('UPDATE sessions SET features = ? WHERE session_id = ?', [JSON.stringify({ pupils: false }), w.sid]);
    expect(outcome(await first(w))).toEqual([403, 'feature_off']);
    expect((await first(w, {}, { cookie: 'edw_pupil=not-a-sign-in' })).statusCode).toBe(401);
    // A teacher's real sign-in, under the teachers' cookie and under the pupils', and the workspace token.
    const accounts = createAccountStore(t.db, deps.sessions);
    const { code } = await accounts.createInvite({ label: 'Reader teacher' });
    const { account } = await accounts.claimInvite(code, { provider: 'test', subject: 'reader-teacher', email: null, displayName: null });
    const teacher = (await accounts.startSignIn(account)).id;
    for (const cookie of [`${cookieNames(BASE).signIn}=${teacher}`, `edw_pupil=${teacher}`]) expect((await first(w, {}, { cookie })).statusCode).toBe(401);
    const token = await app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/asks`, headers: { origin: BASE, authorization: `Bearer ${w.session.participant_token}` }, payload: { prompt_id: w.explain.id, highlighted_text: PASSAGE } });
    expect(token.statusCode).toBe(401);
    const cross = await app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/asks`, headers: { origin: 'https://elsewhere.example', cookie: w.pupil.cookie }, payload: { prompt_id: w.explain.id, highlighted_text: PASSAGE } });
    expect(cross.statusCode).toBe(403);
    expect(provider.requests).toHaveLength(0);
  });

  it('a provider error answers 502 and stores and charges nothing', async () => {
    const w = await readingWorld(deps);
    provider.fail = true;
    expect(outcome(await first(w))).toEqual([502, 'provider_error']);
    const rows = await t.db.execute('SELECT COUNT(*) AS n FROM reader_asks WHERE session_id = ?', [w.sid]);
    expect(Number(rows.rows[0]!.n)).toBe(0);
    expect(await spendGbp(t.db, w.sid)).toBe(0);
  });
});
