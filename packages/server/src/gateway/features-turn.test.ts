/**
 * What the assistant hears with each workspace switch off (issue #64). With all on, the request
 * is pinned byte for byte by a snapshot taken before the switches reached the gateway.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PLUGINS, type AgentStep, type FeaturesPatch, type LoadedConfig, type ProviderAdapter } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { createAdaptationService } from '../classes/adaptations.js';
import { createCurriculumService } from '../classes/curriculum.js';
import { DEMO_CLASS, DEMO_PUPILS } from '../classes/demo.js';
import { CLASS_MESSAGE_HEADING } from '../classes/pupil-scrub.js';
import { createPupilService } from '../classes/pupils.js';
import { createClassService } from '../classes/service.js';
import type { AppDeps } from '../deps.js';
import { EO_PLUGIN, fakeLibrary, PEDAGOGY_PLUGIN } from '../pedagogy/test-library.js';
import { createPreferenceService } from '../preferences/service.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { MockProvider } from './mock.js';
import { createChatService } from './service.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const T = '2026-11-15T09:00:00.000Z';

const library = () =>
  fakeLibrary({
    benchmarks: (b) => ({ benchmarks: [{ id: 'bm-1', area: 'Literacy and English', level: 'second', section: 'Reading', organiser: 'Understanding, analysing and evaluating', codes: b.codes as string[], text: 'Identifies the main ideas of a text.' }] }),
    entries: () => ({ entries: [{ id: 'fmt-bold', type: 'format_rule', title: 'Bold headings', summary: 'Bold.', status: 'draft', evidence: 'moderate', claims: [{ id: 'clm-bold', text: 'Bold helps.', support_type: 'paraphrase' }] }] }),
  });

const loaded = (): LoadedConfig => {
  const base = testLoaded();
  return { ...base, config: { ...base.config, mode: 'agent', plugins: [...DEFAULT_PLUGINS, EO_PLUGIN, PEDAGOGY_PLUGIN], provider: { ...base.config.provider, zero_retention: true }, agent: { max_steps: 3, max_turn_ms: 200_000, reasoning_effort: 'medium', tools: DEFAULT_TOOLS, max_read_chars: 40_000, skills: [] } } };
};

/** Ids and times differ on each run; the rest of the request must not. */
const normalise = (s: string) => s.replace(/[0-9A-HJKMNP-TV-Z]{26}/g, '<id>').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<time>');

describe('what the assistant hears, by workspace switch', () => {
  let t: TempDb;
  let deps: AppDeps & { canvas: CanvasServiceImpl };
  beforeAll(async () => {
    t = await tempDb();
    deps = testDeps(t.db);
  });
  afterAll(() => t.cleanup());

  /** A class chat with a pupil table, an adaptation, a curriculum now, a teacher note and every plugin; the first request the model got. */
  /** `request`: the whole first request; `heard`: it less the system prompt, which is the same in every chat; `tools`: the tools' names. */
  async function classTurn(off: FeaturesPatch = {}): Promise<{ request: string; heard: string; tools: string[]; libraryOps: string[] }> {
    const sid = (await newWorkspace(deps)).session.session_id;
    if (Object.keys(off).length) await deps.sessions.setFeatures(sid, off, 'password');
    const env = envelopeFor(null, null);
    const classes = createClassService(t.db, deps.events);
    const y = await classes.createYearGroup(sid, { name: 'P7' }, env);
    const c = await classes.create(sid, { ...DEMO_CLASS, year_group_id: y.id }, env);
    const pupils = await createPupilService(t.db, deps.events).add(sid, c.id, DEMO_PUPILS, env);
    await createAdaptationService(t.db, deps.events).add(sid, c.id, pupils[0]!.id, { entry_id: 'adp-spacing', title: 'Wider spacing', changes_goal: false, status: 'confirmed', overrides: 'amber overlay' }, env);
    await createCurriculumService(t.db, deps.events).pick(sid, c.id, [{ code: 'LIT 2-16a', text: 'I can identify the purpose.', framework: 'cfe-eo', kind: 'eo' }], 'now', env);
    await createPreferenceService(t.db, deps.events).set(sid, { teacher_note: 'I teach P7 in Leith.' }, env);
    const { thread, doc } = await deps.threads.create(sid, env, undefined, { class_id: c.id });

    const sent: unknown[] = [];
    const provider: ProviderAdapter = {
      model: 'scripted',
      temperature: 1,
      complete: async () => {
        throw new Error('agent mode only');
      },
      respond: async (req, onText): Promise<AgentStep> => {
        sent.push(structuredClone(req));
        onText?.('Done.');
        return { text: 'Done.', toolCalls: [], output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }], input_tokens: 1, output_tokens: 1, provider_request_id: 'r', request: {} };
      },
    };
    const lib = library();
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: loaded(), libraryUrl: 'http://library.test', libraryClient: lib.clientFor });
    const r = await chat.runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Make a version for the class.', envelope: { client_ts: T, focus_pane: 'chat' } });
    expect(r.ok).toBe(true);
    const rest = { ...(sent[0] as { instructions?: string; tools: { name: string }[] }) };
    delete rest.instructions;
    return { request: JSON.stringify(sent[0]), heard: JSON.stringify(rest), tools: rest.tools.map((x) => x.name), libraryOps: lib.calls.map((c) => c.op) };
  }

  it('with every switch on, sends the model the same request as before the switches', async () => {
    const { request, tools } = await classTurn();
    expect(tools).toEqual(expect.arrayContaining(['search_pictures', 'library_search', 'pedagogy_find']));
    // The parts each switch governs are all there.
    for (const part of ['I teach P7 in Leith.', 'Chosen adaptations: Wider spacing', '- LIT 2-16a: I can identify the purpose.', '### Benchmarks for the curriculum now', '## Pedagogy library', 'pedagogy_find', 'Experiences and outcomes', 'search_pictures']) expect(request).toContain(part);
    expect(normalise(request)).toMatchSnapshot();
  });

  it('with classes off, runs a class chat as a plain chat: no class message, pupil table or adaptations', async () => {
    const { heard: request, libraryOps } = await classTurn({ classes: false });
    for (const part of [CLASS_MESSAGE_HEADING, 'tidy-puffin', 'Chosen adaptations', 'LIT 2-16a', 'Benchmarks', '## Pedagogy library']) expect(request).not.toContain(part);
    // Nothing is fetched for a class the model does not hear about.
    expect(libraryOps).toEqual([]);
    expect(request).toContain('I teach P7 in Leith.');
  });

  it('with curriculum off, sends no curriculum section, benchmarks or curriculum now to the pedagogy library', async () => {
    const { heard: request, libraryOps } = await classTurn({ curriculum: false });
    for (const part of ['LIT 2-16a', 'I can identify the purpose.', 'Benchmarks', 'cur-CUR-lit-2-16a']) expect(request).not.toContain(part);
    expect(libraryOps).not.toContain('benchmarks');
    expect(request).toContain(CLASS_MESSAGE_HEADING);
    expect(request).toContain('## Pedagogy library');
  });

  it('with pedagogy off, sends no grounding, no pedagogy tools and no adaptations', async () => {
    const { heard: request, tools } = await classTurn({ pedagogy: false });
    for (const part of ['## Pedagogy library', 'Chosen adaptations', 'Wider spacing', 'adp-spacing', 'amber overlay']) expect(request).not.toContain(part);
    expect(tools.filter((x) => x.startsWith('pedagogy_'))).toEqual([]);
    expect(request).toContain(CLASS_MESSAGE_HEADING);
    expect(request).toContain('tidy-puffin');
    expect(request).toContain('### Benchmarks for the curriculum now');
  });

  it('with plugins off, offers no plugin sources or tools', async () => {
    const { heard: request, tools } = await classTurn({ plugins: false });
    expect(request).not.toContain('Experiences and outcomes');
    expect(tools.filter((x) => x.startsWith('library_') || x === 'search_pictures')).toEqual([]);
    expect(tools).toContain('read_document');
    // The pedagogy library and the curriculum have their own switches.
    expect(tools).toContain('pedagogy_find');
    expect(request).toContain('### Benchmarks for the curriculum now');
  });

  it('with preferences off, sends no teacher note', async () => {
    const { heard: request } = await classTurn({ preferences: false });
    expect(request).not.toContain('I teach P7 in Leith.');
    expect(request).toContain(CLASS_MESSAGE_HEADING);
  });

  it('with Spyglass off alone, sends the same request as with everything on', async () => {
    const on = await classTurn();
    const off = await classTurn({ spyglass: false });
    expect(normalise(off.request)).toBe(normalise(on.request));
  });

  it('in single mode, sends the same request whatever the switches', async () => {
    async function singleTurn(off: FeaturesPatch): Promise<string> {
      const w = await newWorkspace(deps);
      const sid = w.session.session_id;
      const env = envelopeFor(null, null);
      if (Object.keys(off).length) await deps.sessions.setFeatures(sid, off, 'password');
      await createPreferenceService(t.db, deps.events).set(sid, { teacher_note: 'I teach P7 in Leith.' }, env);
      const c = await createClassService(t.db, deps.events).create(sid, { ...DEMO_CLASS, year_group_id: (await createClassService(t.db, deps.events).createYearGroup(sid, { name: 'P7' }, env)).id }, env);
      const { thread, doc } = await deps.threads.create(sid, env, undefined, { class_id: c.id });
      const mock = new MockProvider('mock-model', 1);
      const sent: unknown[] = [];
      const provider: ProviderAdapter = { model: mock.model, temperature: mock.temperature, complete: (messages, system) => (sent.push(structuredClone({ messages, system })), mock.complete(messages, system)) };
      const base = testLoaded();
      const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: { ...base, config: { ...base.config, mode: 'single' } } });
      const r = await chat.runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Hello', envelope: { client_ts: T, focus_pane: 'chat' } });
      expect(r.ok).toBe(true);
      return normalise(JSON.stringify(sent[0]));
    }
    const on = await singleTurn({});
    expect(await singleTurn({ classes: false, curriculum: false, pedagogy: false, preferences: false, spyglass: false, plugins: false })).toBe(on);
  });
});
