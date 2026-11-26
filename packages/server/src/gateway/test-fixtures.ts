import type { AgentRequest, AgentStep, Block, Doc, Operation, ProviderAdapter, StoredTurn } from '@edw/shared';

/** Test-only builders shared by the gateway tests. */
let n = 0;
export function ulid(tag: string): string {
  return ('01H' + tag.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, 'X')).padEnd(26, '0').slice(0, 26);
}

export const THREAD = ulid('thread');
export const DOC = ulid('doc');

export function block(over: Partial<Block> & Pick<Block, 'id'>): Block {
  return {
    session_id: 's',
    doc_id: DOC,
    type: 'paragraph',
    content: 'text',
    origin: 'model',
    origin_turn: null,
    status: 'live',
    version: 1,
    derived_from: null,
    order: n++,
    pending: null,
    created_at: '2026-10-29T10:00:00.000Z',
    updated_at: '2026-10-29T10:00:00.000Z',
    ...over,
  };
}

export function doc(over: Partial<Doc> & Pick<Doc, 'id'>): Doc {
  return { session_id: 's', thread_id: THREAD, name: 'Untitled', created_by: 'teacher', created_at: '2026-10-29T10:00:00.000Z', ...over };
}

export function turn(i: number, operations: Operation[] = []): StoredTurn {
  return {
    turn_id: `t${i}`,
    thread_id: THREAD,
    doc_id: DOC,
    prompt: `prompt ${i}`,
    anchor: null,
    response_text: `response ${i}`,
    operations,
    rewritten_assistant_content: `assistant ${i}`,
    at: '2026-10-29T10:00:00.000Z',
  };
}

/** A provider whose steps are scripted: each function gets the request and returns the step's text and tool calls. */
export function scripted(...steps: ((req: AgentRequest) => { text?: string; calls?: { name: string; args: unknown }[] })[]) {
  const requests: AgentRequest[] = [];
  const provider: ProviderAdapter = {
    model: 'scripted',
    temperature: 1,
    complete: async () => {
      throw new Error('agent mode must not use complete');
    },
    respond: async (req, onText): Promise<AgentStep> => {
      requests.push(structuredClone(req));
      const s = steps[requests.length - 1]!(req);
      if (s.text) onText?.(s.text);
      const toolCalls = (s.calls ?? []).map((c, i) => ({ call_id: `c${requests.length}_${i}`, name: c.name, arguments: JSON.stringify(c.args) }));
      return {
        text: s.text ?? '',
        toolCalls,
        output: [...toolCalls.map((c) => ({ type: 'function_call', ...c })), ...(s.text ? [{ type: 'message', content: [{ type: 'output_text', text: s.text }] }] : [])],
        input_tokens: 100,
        output_tokens: 20,
        cached_tokens: 80,
        reasoning_tokens: 5,
        provider_request_id: `r${requests.length}`,
        request: { step: requests.length },
      };
    },
  };
  return { provider, requests };
}
