import { describe, expect, it, vi } from 'vitest';
import { createElmProvider } from './elm.js';
import { createProvider, ProviderError } from './provider.js';
import { MockProvider } from './mock.js';

const KEY = 'sk-secret-key-123';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

function make(fetchImpl: typeof fetch, timeoutMs?: number) {
  return createElmProvider({
    model: 'gpt-x',
    temperature: 0,
    baseUrl: 'https://elm.example/api/',
    apiKey: KEY,
    maxOutputTokens: 900,
    timeoutMs,
    fetchImpl,
  });
}

async function catchErr(p: Promise<unknown>): Promise<ProviderError> {
  try {
    await p;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error('expected rejection');
}

describe('ELM adapter', () => {
  it('posts an OpenAI-style request and parses a success response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          id: 'chatcmpl-body',
          choices: [{ message: { role: 'assistant', content: 'Hello' } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 3,
            prompt_tokens_details: { cached_tokens: 8, cache_write_tokens: 0 },
            completion_tokens_details: { reasoning_tokens: 2 },
          },
        },
        { headers: { 'x-request-id': 'req-header' } },
      ),
    );
    const p = make(fetchImpl as unknown as typeof fetch);
    const r = await p.complete([{ role: 'user', content: 'Hi' }], 'SYS');
    expect(r).toEqual({
      text: 'Hello',
      input_tokens: 12,
      output_tokens: 3,
      cached_tokens: 8,
      cache_write_tokens: 0,
      reasoning_tokens: 2,
      provider_request_id: 'req-header',
      request: { model: 'gpt-x', temperature: 0, max_completion_tokens: 900, messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'Hi' }] },
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://elm.example/api/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gpt-x',
      temperature: 0,
      max_completion_tokens: 900,
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'Hi' },
      ],
    });
    expect(p.model).toBe('gpt-x');
    expect(p.temperature).toBe(0);
  });

  it('falls back to body id and null usage', async () => {
    const p = make((async () =>
      jsonResponse({
        id: 'body-id',
        choices: [{ message: { content: 'x' } }],
      })) as unknown as typeof fetch);
    const r = await p.complete([], 'S');
    expect(r).toMatchObject({
      text: 'x',
      input_tokens: null,
      output_tokens: null,
      cached_tokens: null,
      cache_write_tokens: null,
      reasoning_tokens: null,
      provider_request_id: 'body-id',
    });
  });

  it('maps HTTP 500 to ProviderError http with status and never leaks the key', async () => {
    const p = make(
      (async () =>
        new Response(`upstream failed for Bearer ${KEY}`, {
          status: 500,
        })) as unknown as typeof fetch,
    );
    const err = await catchErr(p.complete([], 'S'));
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('http');
    expect(err.status).toBe(500);
    expect(err.message).not.toContain(KEY);
  });

  it('maps a malformed body to bad_response', async () => {
    const p1 = make(
      (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
    );
    expect((await catchErr(p1.complete([], 'S'))).kind).toBe('bad_response');
    const p2 = make((async () => jsonResponse({ choices: [] })) as unknown as typeof fetch);
    expect((await catchErr(p2.complete([], 'S'))).kind).toBe('bad_response');
  });

  it('maps a fetch rejection to network', async () => {
    const p = make((async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);
    expect((await catchErr(p.complete([], 'S'))).kind).toBe('network');
  });

  it('aborts after the timeout and maps to timeout', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as unknown as typeof fetch;
    const err = await catchErr(make(hang, 20).complete([], 'S'));
    expect(err.kind).toBe('timeout');
  });

  it('a Stop (the caller aborting its signal) ends a call, a stream or an agent step as aborted', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        if (init.signal!.aborted) reject(new DOMException('aborted', 'AbortError'));
        init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const p = make(hang, 5_000);
    for (const call of [
      (signal: AbortSignal) => p.complete([], 'S', signal),
      (signal: AbortSignal) => p.stream!([], 'S', () => undefined, signal),
      (signal: AbortSignal) => p.respond!({ instructions: 'S', input: [], tools: [] }, undefined, signal),
    ]) {
      const stop = new AbortController();
      const pending = catchErr(call(stop.signal));
      stop.abort();
      expect((await pending).kind).toBe('aborted');
    }
    const already = new AbortController();
    already.abort();
    expect((await catchErr(p.complete([], 'S', already.signal))).kind).toBe('aborted');
  });
});

describe('createProvider', () => {
  it('returns the mock provider', () => {
    const p = createProvider({
      kind: 'mock',
      model: 'mock-1',
      temperature: 0,
      maxOutputTokens: 100,
    });
    expect(p).toBeInstanceOf(MockProvider);
    expect(p.model).toBe('mock-1');
  });

  it('requires baseUrl and apiKey for elm', () => {
    expect(() =>
      createProvider({ kind: 'elm', model: 'm', temperature: 0, maxOutputTokens: 100 }),
    ).toThrow(/baseUrl/);
  });

  it('honours a custom chatPath', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const p = createProvider({
      kind: 'elm',
      model: 'm',
      temperature: 0,
      baseUrl: 'https://h',
      apiKey: 'k',
      chatPath: '/v1/chat',
      maxOutputTokens: 100,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await p.complete([], 'S');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://h/v1/chat');
  });
});

describe('ELM adapter, streaming', () => {
  const sse = (lines: string[], init: ResponseInit = {}) =>
    new Response(
      new ReadableStream({
        start(c) {
          const enc = new TextEncoder();
          // Split mid-line to check the line buffering.
          const all = lines.join('');
          c.enqueue(enc.encode(all.slice(0, 25)));
          c.enqueue(enc.encode(all.slice(25)));
          c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' }, ...init },
    );
  const chunk = (content: string, extra: object = {}) => `data: ${JSON.stringify({ id: 'cmpl-1', choices: [{ delta: { content } }], ...extra })}\n\n`;

  it('asks for a stream, hands on each delta and returns the whole reply with usage', async () => {
    const fetchImpl = vi.fn(async () =>
      sse([chunk('Hel'), chunk('lo '), chunk('world'), `data: ${JSON.stringify({ id: 'cmpl-1', choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } })}\n\n`, 'data: [DONE]\n\n']),
    );
    const deltas: string[] = [];
    const r = await make(fetchImpl as unknown as typeof fetch).stream!([{ role: 'user', content: 'hi' }], 'SYS', (d) => deltas.push(d));
    expect(deltas).toEqual(['Hel', 'lo ', 'world']);
    expect(r).toMatchObject({ text: 'Hello world', input_tokens: 7, output_tokens: 3, provider_request_id: 'cmpl-1', request: { stream: true } });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true }, max_completion_tokens: 900 });
  });

  it('takes an ordinary JSON answer from a proxy that does not stream', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'x', choices: [{ message: { content: 'whole' } }] }));
    const deltas: string[] = [];
    const r = await make(fetchImpl as unknown as typeof fetch).stream!([], 'SYS', (d) => deltas.push(d));
    expect(deltas).toEqual(['whole']);
    expect(r.text).toBe('whole');
  });

  it('reports HTTP errors without the key, and a broken chunk as a bad response', async () => {
    const http = await catchErr(make((async () => new Response(`bad ${KEY}`, { status: 400 })) as unknown as typeof fetch).stream!([], 'S', () => undefined));
    expect(http).toMatchObject({ kind: 'http', status: 400 });
    expect(http.message).not.toContain(KEY);
    const bad = await catchErr(make((async () => sse(['data: {nope\n\n'])) as unknown as typeof fetch).stream!([], 'S', () => undefined));
    expect(bad.kind).toBe('bad_response');
  });
});

describe('ELM adapter, agent steps (Responses API)', () => {
  const events = (...evs: object[]) =>
    new Response(
      new ReadableStream({
        start(c) {
          const enc = new TextEncoder();
          const all = evs.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
          c.enqueue(enc.encode(all.slice(0, 40)));
          c.enqueue(enc.encode(all.slice(40)));
          c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-1' } },
    );
  const finished = {
    id: 'resp_1',
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque' },
      { type: 'message', content: [{ type: 'output_text', text: 'Reading it now.' }] },
      { type: 'function_call', call_id: 'call_1', name: 'read_document', arguments: '{"doc_id":"D1"}' },
    ],
    usage: { input_tokens: 500, output_tokens: 40, input_tokens_details: { cached_tokens: 400, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 25 } },
  };
  const request = { instructions: 'SYS', input: [{ role: 'user', content: 'Hi' }], tools: [{ name: 'read_document', description: 'Read', parameters: { type: 'object' } }] };

  it('streams the text, and returns the tool calls, the output items to pass back, and the usage', async () => {
    const fetchImpl = vi.fn(async () =>
      events({ type: 'response.output_text.delta', delta: 'Reading ' }, { type: 'response.output_text.delta', delta: 'it now.' }, { type: 'response.completed', response: finished }),
    );
    const deltas: string[] = [];
    const step = await make(fetchImpl as unknown as typeof fetch).respond!(request, (d) => deltas.push(d));
    expect(deltas).toEqual(['Reading ', 'it now.']);
    expect(step).toMatchObject({
      text: 'Reading it now.',
      toolCalls: [{ call_id: 'call_1', name: 'read_document', arguments: '{"doc_id":"D1"}' }],
      output: finished.output,
      input_tokens: 500,
      output_tokens: 40,
      cached_tokens: 400,
      cache_write_tokens: 0,
      reasoning_tokens: 25,
      provider_request_id: 'req-1',
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://elm.example/api/responses');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: 'gpt-x',
      instructions: 'SYS',
      input: request.input,
      tools: [{ type: 'function', name: 'read_document', description: 'Read', parameters: { type: 'object' }, strict: false }],
      tool_choice: 'auto',
      reasoning: { effort: 'medium', summary: 'auto' },
      max_output_tokens: 900,
      store: false,
      include: ['reasoning.encrypted_content'],
      stream: true,
    });
    expect(step.request).toEqual(body);
  });

  it('streams the reasoning summary as it is written, and returns its parts', async () => {
    const done = { ...finished, output: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: '**Reading the task**\n\nIt asks for a word bank.' }] }, ...finished.output] };
    const fetchImpl = vi.fn(async () =>
      events(
        { type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', summary_index: 0, delta: '**Reading the task**' },
        { type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', summary_index: 0, delta: '\n\nIt asks for a word bank.' },
        { type: 'response.completed', response: done },
      ),
    );
    const seen: string[][] = [];
    const step = await make(fetchImpl as unknown as typeof fetch).respond!(request, undefined, undefined, (parts) => seen.push(parts));
    expect(seen).toEqual([['**Reading the task**'], ['**Reading the task**\n\nIt asks for a word bank.']]);
    expect(step.reasoning).toEqual(['**Reading the task**\n\nIt asks for a word bank.']);
  });

  it('forces a call to one tool when the request names it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(finished));
    await make(fetchImpl as unknown as typeof fetch).respond!({ ...request, toolChoice: { name: 'read_document' } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).tool_choice).toEqual({ type: 'function', name: 'read_document' });
  });

  it('sends the chosen model and effort, and no reasoning at all for a model without it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(finished));
    const p = make(fetchImpl as unknown as typeof fetch);
    await p.respond!({ ...request, model: 'gpt-5.5', reasoningEffort: 'high' });
    await p.respond!({ ...request, model: 'gpt-4.1', reasoningEffort: 'none' });
    const [a, b] = fetchImpl.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(a).toMatchObject({ model: 'gpt-5.5', reasoning: { effort: 'high' }, include: ['reasoning.encrypted_content'] });
    expect(b.model).toBe('gpt-4.1');
    expect(b).not.toHaveProperty('reasoning');
    expect(b).not.toHaveProperty('include');
  });

  it('takes a finished response as plain JSON from a proxy that does not stream', async () => {
    const step = await make((async () => jsonResponse(finished)) as unknown as typeof fetch).respond!(request);
    expect(step.toolCalls).toHaveLength(1);
    expect(step.provider_request_id).toBe('resp_1');
  });

  it('maps an HTTP error, a failed response and a stream with no finished response to ProviderErrors, never leaking the key', async () => {
    const http = await catchErr(make((async () => new Response(`bad ${KEY}`, { status: 400 })) as unknown as typeof fetch).respond!(request));
    expect(http).toMatchObject({ kind: 'http', status: 400 });
    expect(http.message).not.toContain(KEY);
    const failed = await catchErr(make((async () => events({ type: 'response.failed', response: { error: { message: 'overloaded' } } })) as unknown as typeof fetch).respond!(request));
    expect(failed).toMatchObject({ kind: 'bad_response', message: expect.stringContaining('overloaded') });
    const cut = await catchErr(make((async () => events({ type: 'response.output_text.delta', delta: 'Hal' })) as unknown as typeof fetch).respond!(request));
    expect(cut.message).toMatch(/without a finished response/);
  });
});
