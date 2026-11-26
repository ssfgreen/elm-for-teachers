import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LoadedConfig } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps } from '../deps.js';
import { createPreferenceService } from '../preferences/service.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { teacherMessage } from './context-messages.js';
import { loadGatewayCalls } from './history.js';
import { createChatService } from './service.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
const loaded: LoadedConfig = { ...testLoaded(), config: { ...testLoaded().config, mode: 'agent', agent: { max_steps: 6, max_turn_ms: 200_000, reasoning_effort: 'medium', tools: DEFAULT_TOOLS, max_read_chars: 40_000, skills: [] } } };
const envelope = { client_ts: '2026-11-12T12:00:00.000Z', focus_pane: 'chat' } as const;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());

describe('the note about the teacher (Preferences)', () => {
  it('says who the teacher is, in their words, as material about them', () => {
    expect(teacherMessage('I teach P5 in Glasgow.')).toBe(
      "## About the teacher\n\nThe teacher wrote this about themselves in their preferences. Bear it in mind in every chat; what they ask in a chat comes first.\n\nI teach P5 in Glasgow.",
    );
    expect(teacherMessage(null)).toBeNull();
    expect(teacherMessage('   ')).toBeNull();
  });

  it('comes first, after the system prompt, which stays the same for everyone', async () => {
    const { session, thread, doc } = await newWorkspace(deps);
    const sid = session.session_id;
    const chat = (p: ReturnType<typeof scripted>['provider']) => createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider: p, loaded });
    const { provider, requests } = scripted(() => ({ text: 'Hi.' }), () => ({ text: 'Hi.' }));
    await chat(provider).runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Hello', envelope });
    expect(JSON.stringify(requests[0]!.input)).not.toContain('## About the teacher');

    await createPreferenceService(t.db, deps.events).set(sid, { teacher_note: 'I teach P5 in Glasgow.' }, envelopeFor(null, null));
    await chat(provider).runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'Hello again', envelope });
    const first = requests[1]!.input[0] as { role: string; content: string };
    expect(first).toEqual({ role: 'developer', content: teacherMessage('I teach P5 in Glasgow.') });
    expect(requests[1]!.instructions).toBe(requests[0]!.instructions);
    const calls = await loadGatewayCalls(t.db, sid);
    expect(calls[1]!.system_prompt_hash).toBe(calls[0]!.system_prompt_hash);
  });
});
