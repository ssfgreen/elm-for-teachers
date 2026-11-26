import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PLUGINS, type AgentStep, type LoadedConfig, type ProviderAdapter } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { createAdaptationService } from '../classes/adaptations.js';
import { createCurriculumService } from '../classes/curriculum.js';
import { DEMO_CLASS, DEMO_PUPILS } from '../classes/demo.js';
import { createPupilService } from '../classes/pupils.js';
import { createClassService } from '../classes/service.js';
import type { AppDeps } from '../deps.js';
import { fakeLibrary, PEDAGOGY_PLUGIN } from '../pedagogy/test-library.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { checkCitations } from './citations.js';
import { loadGatewayCalls } from './history.js';
import { curriculumEntryId } from '@edw/shared';
import { loadPedagogyGrounding, type EntrySummary } from './pedagogy-message.js';
import { createChatService } from './service.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const T = '2026-11-12T09:00:00.000Z';
const entry = (id: string, type: string, claims: string[], extra: Partial<EntrySummary> = {}): EntrySummary => ({ id, type, title: `Title of ${id}`, summary: `About ${id}.`, status: 'draft', evidence: 'moderate', claims: claims.map((c) => ({ id: c, text: `Claim ${c}.`, support_type: c.endsWith('-inf') ? 'inference_by_curator' : 'paraphrase' })), ...extra });

/** A library answering `entries` by what is asked: types, ids, aligns_to. */
function library() {
  return fakeLibrary({
    benchmarks: (b) => ({ benchmarks: [{ id: 'bm-1', area: 'Literacy and English', level: 'second', section: 'Reading', organiser: 'Understanding, analysing and evaluating', codes: [...(b.codes as string[]), 'ENG 2-17a'], text: 'Identifies the main ideas of a text with appropriate detail.' }] }),
    entries: (b) => {
      const types = (b.types as string[] | undefined) ?? [];
      if (b.ids) return { entries: (b.ids as string[]).map((id) => (id.startsWith('cur-') ? entry(id, 'curriculum_ref', [`clm-${id}`]) : entry(id, 'adaptation', ['clm-spacing'], { changes_goal: id === 'adp-lower' }))) };
      if (b.aligns_to) return { entries: [entry('prn-reading', 'principle', ['clm-reading'])] };
      if (types.includes('format_rule')) return { entries: [entry('fmt-bold', 'format_rule', ['clm-bold'])] };
      if (types.includes('caution')) return { entries: [entry('cau-fonts', 'caution', ['clm-fonts-inf'], { evidence: 'not_recommended' })] };
      if (b.text === 'reciprocal') return { entries: [entry('sig-reciprocal', 'signature_pedagogy', ['clm-reciprocal'])], total: 1, truncated: false };
      return { entries: [entry('prn-styles', 'principle', ['clm-styles'], { evidence: 'not_recommended' }), entry('act-card-sort', 'activity_type', ['clm-sort'])] };
    },
  });
}

describe('the pedagogy grounding for a class', () => {
  it('fetches format rules, cautions, chosen adaptations, the curriculum now and a map, each claim citable', async () => {
    const lib = library();
    const source = { pluginId: 'p', name: 'Pedagogy', collection: 'pedagogy-scotland', client: lib.clientFor('http://x') };
    const g = (await loadPedagogyGrounding(source, { stage: 'p7', level: 'second', subject: null, adaptationIds: ['adp-spacing', 'adp-lower'], nowCodes: ['LIT 2-16a'] }))!;
    expect(lib.calls.find((c) => (c.body.types as string[] | undefined)?.includes('caution'))!.body.facets).toEqual({ stage: ['p7'], cfe_level: ['second'] });
    expect(g.text).toContain('### Baseline format rules');
    expect(g.text).toContain('- [[clm-bold]] Claim clm-bold.');
    expect(g.text).toContain("[[clm-fonts-inf]] Claim clm-fonts-inf. (the curator's inference, not stated by the source)");
    expect(g.text).toContain('MODIFICATION: changes the learning goal');
    expect(g.text).toContain('cur-CUR-lit-2-16a');
    expect(g.text).toContain('### Steer away from');
    expect(g.text).toContain('- act-card-sort: Title of act-card-sort (activity type)');
    expect([...g.claimIds].sort()).toEqual(['clm-bold', 'clm-cur-CUR-lit-2-16a', 'clm-fonts-inf', 'clm-reading', 'clm-spacing', 'clm-styles']);
    // The map's other entries are named, not cited: their claims come with pedagogy_read.
    expect(g.claimIds.has('clm-sort')).toBe(false);
  });

  it('is left out when the library cannot be reached', async () => {
    const source = { pluginId: 'p', name: 'P', collection: 'c', client: fakeLibrary({}).clientFor('http://x') };
    expect(await loadPedagogyGrounding(source, { stage: null, level: null, subject: null, adaptationIds: [], nowCodes: [] })).toBeNull();
  });

  it('names curriculum entries as the library does', () => {
    expect(curriculumEntryId('SOC 3-01a')).toBe('cur-CUR-soc-3-01a');
  });
});

describe('checkCitations', () => {
  it('keeps claims retrieved, drops invented ones, and keeps every citation out of the document', () => {
    const r = checkCitations(
      { message: 'Bold [[clm-bold]], invented [[clm-nope]].', comments: [{ doc_id: 'd', block_id: 'b', root_id: null, quote: null, body: 'See [[clm-nope]] and [[clm-bold]]' }], operations: [{ op: 'insert', doc_id: 'd', after_block_id: null, block: { type: 'paragraph', content: 'Read it twice [[clm-bold]].' } } as never] },
      new Set(['clm-bold']),
    );
    expect(r.message).toBe('Bold [[clm-bold]], invented.');
    expect(r.comments[0]!.body).toBe('See and [[clm-bold]]');
    expect(JSON.stringify(r.operations)).toContain('Read it twice.');
    expect(r.dropped).toEqual(['clm-nope']);
  });
});

describe('a class chat with the pedagogy library', () => {
  let t: TempDb;
  let deps: AppDeps & { canvas: CanvasServiceImpl };
  beforeAll(async () => {
    t = await tempDb();
    deps = testDeps(t.db);
  });
  afterAll(() => t.cleanup());

  const loaded = (): LoadedConfig => {
    const base = testLoaded();
    return { ...base, config: { ...base.config, mode: 'agent', pupil_rows_in_gateway_log: 'shape', plugins: [...DEFAULT_PLUGINS, PEDAGOGY_PLUGIN], provider: { ...base.config.provider, zero_retention: true }, agent: { max_steps: 3, max_turn_ms: 200_000, reasoning_effort: 'medium', tools: DEFAULT_TOOLS, max_read_chars: 40_000, skills: [] } } };
  };

  it('grounds the turn, lets a tool add claims, and takes invented citations out before saving', async () => {
    const sid = (await newWorkspace(deps)).session.session_id;
    const env = envelopeFor(null, null);
    const classes = createClassService(t.db, deps.events);
    const y = await classes.createYearGroup(sid, { name: 'P7' }, env);
    const c = await classes.create(sid, { ...DEMO_CLASS, year_group_id: y.id }, env);
    const pupils = await createPupilService(t.db, deps.events).add(sid, c.id, DEMO_PUPILS, env);
    const puffin = pupils.find((p) => p.label === 'tidy-puffin')!;
    await createAdaptationService(t.db, deps.events).add(sid, c.id, puffin.id, { entry_id: 'adp-spacing', title: 'Wider spacing', changes_goal: false, status: 'confirmed', overrides: 'amber overlay, Comic Sans 14pt' }, env);
    await createCurriculumService(t.db, deps.events).pick(sid, c.id, [{ code: 'LIT 2-16a', text: 'I can identify the purpose.', framework: 'cfe-eo', kind: 'eo' }], 'now', env);
    const { thread, doc } = await deps.threads.create(sid, env, undefined, { class_id: c.id });

    const sent: unknown[] = [];
    let step = 0;
    const provider: ProviderAdapter = {
      model: 'scripted',
      temperature: 1,
      complete: async () => {
        throw new Error('agent mode only');
      },
      respond: async (req, onText): Promise<AgentStep> => {
        sent.push(structuredClone(req));
        if (step++ === 0) {
          const call = { type: 'function_call', call_id: 'c1', name: 'pedagogy_find', arguments: JSON.stringify({ text: 'reciprocal' }) };
          return { text: '', toolCalls: [{ call_id: 'c1', name: 'pedagogy_find', arguments: call.arguments }], output: [call], input_tokens: 1, output_tokens: 1, provider_request_id: 'r', request: {} };
        }
        const text = 'Bold headings [[clm-bold]], reciprocal reading [[clm-reciprocal]], and something made up [[clm-ACC-invented]].';
        onText?.(text);
        return { text, toolCalls: [], output: [{ type: 'message', content: [{ type: 'output_text', text }] }], input_tokens: 1, output_tokens: 1, provider_request_id: 'r', request: {} };
      },
    };
    const lib = library();
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: loaded(), libraryUrl: 'http://library.test', libraryClient: lib.clientFor });
    const r = await chat.runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Make a version for tidy-puffin.', envelope: { client_ts: T, focus_pane: 'chat' } });
    expect(r.ok).toBe(true);
    expect(r.ok && r.message).toBe('Bold headings [[clm-bold]], reciprocal reading [[clm-reciprocal]], and something made up.');

    const toModel = JSON.stringify(sent[0]);
    expect(toModel).toContain('## Pedagogy library');
    expect(toModel).toContain('pedagogy_find');
    expect(toModel).toContain('Chosen adaptations: Wider spacing (adp-spacing; confirmed; own settings: amber overlay, Comic Sans 14pt)');
    expect(toModel).toContain('- LIT 2-16a: I can identify the purpose.');
    expect(toModel).toContain('### Benchmarks for the curriculum now');
    expect(toModel).toContain('Identifies the main ideas of a text with appropriate detail. (LIT 2-16a; second level, Understanding, analysing and evaluating)');
    expect(lib.calls.some((x) => JSON.stringify(x.body.ids ?? []).includes('adp-spacing'))).toBe(true);

    // Option B: which pupil has which adaptation stays out of the log with the rest of the table.
    const logged = JSON.stringify(await loadGatewayCalls(t.db, sid));
    expect(logged).not.toContain('Chosen adaptations');
    expect(logged).not.toContain('Comic Sans 14pt');
  });

  it('is not used in a chat that is for no class', async () => {
    const w = await newWorkspace(deps);
    const sent: unknown[] = [];
    const provider: ProviderAdapter = {
      model: 'echo',
      temperature: 1,
      complete: async () => {
        throw new Error('agent mode only');
      },
      respond: async (req, onText): Promise<AgentStep> => {
        sent.push(structuredClone(req));
        onText?.('Done [[clm-bold]].');
        return { text: 'Done [[clm-bold]].', toolCalls: [], output: [], input_tokens: 1, output_tokens: 1, provider_request_id: 'r', request: {} };
      },
    };
    const lib = library();
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: loaded(), libraryUrl: 'http://library.test', libraryClient: lib.clientFor });
    const r = await chat.runTurn(w.session.session_id, { thread_id: w.thread.id, doc_id: w.doc.id, text: 'Hello', envelope: { client_ts: T, focus_pane: 'chat' } });
    expect(JSON.stringify(sent[0])).not.toContain('Pedagogy library');
    expect(lib.calls).toEqual([]);
    expect(r.ok && r.message).toBe('Done.');
  });
});
