import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentStep, LoadedConfig, ProviderAdapter } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { DEMO_CLASS, DEMO_PUPILS } from '../classes/demo.js';
import { createPupilService } from '../classes/pupils.js';
import { createClassService } from '../classes/service.js';
import type { AppDeps } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { loadGatewayCalls } from './history.js';
import { createChatService } from './service.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const T = '2026-11-12T09:00:00.000Z';

describe('the pupil table in the gateway log', () => {
  let t: TempDb;
  let deps: AppDeps & { canvas: CanvasServiceImpl };
  beforeAll(async () => {
    t = await tempDb();
    deps = testDeps(t.db);
  });
  afterAll(() => t.cleanup());

  const provider: ProviderAdapter = {
    model: 'echo',
    temperature: 1,
    complete: async () => {
      throw new Error('agent mode only');
    },
    respond: async (req, onText): Promise<AgentStep> => {
      onText?.('Done.');
      return { text: 'Done.', toolCalls: [], output: [], input_tokens: 1, output_tokens: 1, provider_request_id: 'r', request: structuredClone(req) };
    },
  };
  const loaded = (rows: 'full' | 'shape'): LoadedConfig => {
    const base = testLoaded();
    return { ...base, config: { ...base.config, mode: 'agent', pupil_rows_in_gateway_log: rows, provider: { ...base.config.provider, zero_retention: true }, agent: { max_steps: 2, max_turn_ms: 200_000, reasoning_effort: 'medium', tools: DEFAULT_TOOLS, max_read_chars: 40_000, skills: [] } } };
  };

  async function turn(rows: 'full' | 'shape') {
    const sid = (await newWorkspace(deps)).session.session_id;
    const env = envelopeFor(null, null);
    const classes = createClassService(t.db, deps.events);
    const y = await classes.createYearGroup(sid, { name: 'P7' }, env);
    const c = await classes.create(sid, { ...DEMO_CLASS, year_group_id: y.id }, env);
    await createPupilService(t.db, deps.events).add(sid, c.id, DEMO_PUPILS, env);
    const { thread, doc } = await deps.threads.create(sid, env, undefined, { class_id: c.id });
    const chat = createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded: loaded(rows) });
    await chat.runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Hello', envelope: { client_ts: T, focus_pane: 'chat' } });
    return { log: JSON.stringify(await loadGatewayCalls(t.db, sid)), events: JSON.stringify(await deps.events.list(sid)) };
  }

  it('keeps the rows in full when config says so (the pilot), and the events still only the shape', async () => {
    const { log, events } = await turn('full');
    expect(log).toContain('Comic Sans 14pt');
    expect(log).not.toContain('[pupil table:');
    expect(events).not.toContain('Comic Sans 14pt');
  });

  it('keeps only the shape when switched back', async () => {
    const { log } = await turn('shape');
    expect(log).not.toContain('Comic Sans 14pt');
    expect(log).toContain('[pupil table:');
  });
});
