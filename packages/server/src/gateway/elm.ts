import type { AgentRequest, AgentStep, ChatMessage, ProviderAdapter, ProviderResult } from '@edw/shared';
import { ProviderError } from './errors.js';

/**
 * OpenAI-compatible chat-completions adapter (used for the University of Edinburgh ELM
 * gateway, but nothing here is ELM-specific). `complete` waits for the whole reply; `stream`
 * asks for server-sent events (`stream: true`) and hands each content delta on as it arrives.
 * The API key is sent in the Authorization header and never logged or put in error messages.
 *
 * `respond` is one agent step through the Responses API (`responsesPath`), streamed: ELM
 * refuses function tools on chat completions while the model reasons, and accepts them there.
 * It runs stateless (`store: false`), asking for the encrypted reasoning so the next step can
 * pass it back with the rest of the output. No temperature is sent: reasoning models take
 * only their default.
 */
export interface ElmOptions {
  model: string;
  temperature: number;
  baseUrl: string;
  apiKey: string;
  chatPath?: string;
  /** Appended to baseUrl for agent steps; default `/responses`. */
  responsesPath?: string;
  /** Agent steps only. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  maxOutputTokens: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 60_000;

/** Aborts `controller` when `signal` does (the teacher pressed Stop); returns the unhook. */
function follow(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => undefined;
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

const stopped = () => new ProviderError('aborted', 'the request was stopped');
export const DEFAULT_CHAT_PATH = '/chat/completions';
export const DEFAULT_RESPONSES_PATH = '/responses';

/** Responses API usage. */
interface ResponsesUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  input_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown };
  output_tokens_details?: { reasoning_tokens?: unknown };
}

interface ResponsesBody {
  id?: unknown;
  status?: unknown;
  error?: { message?: unknown } | null;
  incomplete_details?: { reason?: unknown } | null;
  output?: { type?: unknown; content?: { type?: unknown; text?: unknown }[]; summary?: { type?: unknown; text?: unknown }[]; call_id?: unknown; name?: unknown; arguments?: unknown }[];
  usage?: ResponsesUsage;
}

/** A finished Responses API body as one agent step. */
export function parseResponse(body: ResponsesBody, request: unknown, headerId: string | null): AgentStep {
  if (!Array.isArray(body.output)) throw new ProviderError('bad_response', 'provider response has no output');
  if (body.status === 'failed') throw new ProviderError('bad_response', `provider response failed: ${String(body.error?.message ?? 'no reason given')}`);
  const text = body.output
    .filter((o) => o.type === 'message')
    .flatMap((o) => (o.content ?? []).filter((c) => c.type === 'output_text' && typeof c.text === 'string').map((c) => c.text as string))
    .join('');
  const toolCalls = body.output
    .filter((o) => o.type === 'function_call' && typeof o.call_id === 'string' && typeof o.name === 'string')
    .map((o) => ({ call_id: o.call_id as string, name: o.name as string, arguments: typeof o.arguments === 'string' ? o.arguments : '{}' }));
  const reasoning = body.output
    .filter((o) => o.type === 'reasoning')
    .flatMap((o) => (o.summary ?? []).filter((p) => p.type === 'summary_text' && typeof p.text === 'string' && p.text.trim()).map((p) => p.text as string));
  const u = body.usage;
  return {
    text,
    toolCalls,
    output: body.output,
    ...(reasoning.length ? { reasoning } : {}),
    input_tokens: asCount(u?.input_tokens),
    output_tokens: asCount(u?.output_tokens),
    cached_tokens: asCount(u?.input_tokens_details?.cached_tokens),
    cache_write_tokens: asCount(u?.input_tokens_details?.cache_write_tokens),
    reasoning_tokens: asCount(u?.output_tokens_details?.reasoning_tokens),
    provider_request_id: headerId ?? (typeof body.id === 'string' ? body.id : null),
    request,
  };
}

function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join('[redacted]') : text;
}

/** Chat-completions usage, with the cache and reasoning details ELM (like OpenAI) reports. */
interface Usage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  prompt_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown };
  completion_tokens_details?: { reasoning_tokens?: unknown };
}

function usageCounts(u: Usage | undefined) {
  return {
    input_tokens: asCount(u?.prompt_tokens),
    output_tokens: asCount(u?.completion_tokens),
    cached_tokens: asCount(u?.prompt_tokens_details?.cached_tokens),
    cache_write_tokens: asCount(u?.prompt_tokens_details?.cache_write_tokens),
    reasoning_tokens: asCount(u?.completion_tokens_details?.reasoning_tokens),
  };
}

function asCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/** A non-streamed chat-completions body. */
function parseCompletion(bodyText: string, headerId: string | null): ProviderResult {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new ProviderError('bad_response', 'provider response is not JSON');
  }
  const b = body as {
    id?: unknown;
    choices?: { message?: { content?: unknown } }[];
    usage?: Usage;
  };
  const content = Array.isArray(b?.choices) ? b.choices[0]?.message?.content : undefined;
  if (typeof content !== 'string') {
    throw new ProviderError('bad_response', 'provider response has no choices[0].message.content');
  }
  return {
    text: content,
    ...usageCounts(b.usage),
    provider_request_id: headerId ?? (typeof b.id === 'string' ? b.id : null),
  };
}

export function createElmProvider(opts: ElmOptions): ProviderAdapter {
  const url = opts.baseUrl.replace(/\/+$/, '') + (opts.chatPath ?? DEFAULT_CHAT_PATH);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;

  // Reasoning models (gpt-6-sol on ELM) reject `max_tokens` with a 400; `max_completion_tokens`
  // also covers their hidden reasoning tokens.
  const requestBody = (messages: ChatMessage[], system: string, stream: boolean) => ({
    model: opts.model,
    temperature: opts.temperature,
    max_completion_tokens: opts.maxOutputTokens,
    messages: [{ role: 'system', content: system }, ...messages],
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  });

  async function complete(messages: ChatMessage[], system: string, signal?: AbortSignal): Promise<ProviderResult> {
    const request = requestBody(messages, system, false);
    const controller = new AbortController();
    const unfollow = follow(signal, controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch (err) {
        if (signal?.aborted) throw stopped();
        if (timedOut)
          throw new ProviderError('timeout', `provider timed out after ${timeoutMs} ms`);
        throw new ProviderError(
          'network',
          redact(`provider request failed: ${(err as Error).message}`, opts.apiKey),
        );
      }

      let bodyText: string;
      try {
        bodyText = await res.text();
      } catch {
        if (signal?.aborted) throw stopped();
        if (timedOut)
          throw new ProviderError('timeout', `provider timed out after ${timeoutMs} ms`);
        throw new ProviderError('network', 'provider response could not be read');
      }

      if (!res.ok) {
        throw new ProviderError(
          'http',
          redact(`provider returned HTTP ${res.status}: ${bodyText.slice(0, 200)}`, opts.apiKey),
          res.status,
        );
      }

      return { ...parseCompletion(bodyText, res.headers.get('x-request-id')), request };
    } finally {
      clearTimeout(timer);
      unfollow();
    }
  }

  /**
   * Streams the reply. The timeout is an idle timeout: it restarts with every chunk, so a
   * long reply is fine as long as it keeps coming (a reasoning model may think for a while
   * before the first token, which the same limit covers).
   */
  async function stream(messages: ChatMessage[], system: string, onText: (delta: string) => void, signal?: AbortSignal): Promise<ProviderResult> {
    const request = requestBody(messages, system, true);
    const controller = new AbortController();
    const unfollow = follow(signal, controller);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    };
    const fail = (err: unknown): never => {
      if (err instanceof ProviderError) throw err;
      if (signal?.aborted) throw stopped();
      if (timedOut) throw new ProviderError('timeout', `provider timed out after ${timeoutMs} ms without data`);
      throw new ProviderError('network', redact(`provider stream failed: ${(err as Error).message}`, opts.apiKey));
    };
    arm();
    try {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch (err) {
        return fail(err);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError('http', redact(`provider returned HTTP ${res.status}: ${text.slice(0, 200)}`, opts.apiKey), res.status);
      }
      // A proxy that ignores `stream: true` answers with one ordinary JSON body.
      if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        const whole = parseCompletion(await res.text(), res.headers.get('x-request-id'));
        if (whole.text) onText(whole.text);
        return { ...whole, request };
      }
      if (!res.body) throw new ProviderError('bad_response', 'provider stream has no body');

      let content = '';
      let id: string | null = res.headers.get('x-request-id');
      let usage: Usage | undefined;
      let buffer = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const handle = (line: string) => {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;
        let chunk: { id?: unknown; choices?: { delta?: { content?: unknown } }[]; usage?: typeof usage };
        try {
          chunk = JSON.parse(data);
        } catch {
          throw new ProviderError('bad_response', 'provider stream sent a chunk that is not JSON');
        }
        if (!id && typeof chunk.id === 'string') id = chunk.id;
        if (chunk.usage) usage = chunk.usage;
        const delta = Array.isArray(chunk.choices) ? chunk.choices[0]?.delta?.content : undefined;
        if (typeof delta === 'string' && delta) {
          content += delta;
          onText(delta);
        }
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          arm();
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            handle(buffer.slice(0, nl).replace(/\r$/, ''));
            buffer = buffer.slice(nl + 1);
          }
        }
        handle(buffer.trim());
      } catch (err) {
        return fail(err);
      }
      return { text: content, ...usageCounts(usage), provider_request_id: id, request };
    } finally {
      clearTimeout(timer);
      unfollow();
    }
  }

  const responsesUrl = opts.baseUrl.replace(/\/+$/, '') + (opts.responsesPath ?? DEFAULT_RESPONSES_PATH);

  /** One agent step, streamed; the same idle timeout as `stream`. */
  async function respond(req: AgentRequest, onText?: (delta: string) => void, signal?: AbortSignal, onReasoning?: (parts: string[]) => void): Promise<AgentStep> {
    const request = {
      model: req.model ?? opts.model,
      instructions: req.instructions,
      input: req.input,
      tools: req.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false })),
      tool_choice: typeof req.toolChoice === 'object' ? { type: 'function', name: req.toolChoice.name } : (req.toolChoice ?? 'auto'),
      // A model without reasoning is refused one (ELM: "Unsupported reasoning effort").
      // `summary`: the model's own short account of its thinking, shown as steps in the chat.
      ...(req.reasoningEffort === 'none' ? {} : { reasoning: { effort: req.reasoningEffort ?? opts.reasoningEffort ?? 'medium', summary: 'auto' }, include: ['reasoning.encrypted_content'] }),
      max_output_tokens: opts.maxOutputTokens,
      store: false,
      stream: true,
    };
    const controller = new AbortController();
    const unfollow = follow(signal, controller);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    };
    const fail = (err: unknown): never => {
      if (err instanceof ProviderError) throw err;
      if (signal?.aborted) throw stopped();
      if (timedOut) throw new ProviderError('timeout', `provider timed out after ${timeoutMs} ms without data`);
      throw new ProviderError('network', redact(`provider request failed: ${(err as Error).message}`, opts.apiKey));
    };
    arm();
    try {
      let res: Response;
      try {
        res = await doFetch(responsesUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch (err) {
        return fail(err);
      }
      const headerId = res.headers.get('x-request-id');
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError('http', redact(`provider returned HTTP ${res.status}: ${text.slice(0, 300)}`, opts.apiKey), res.status);
      }
      // A proxy that ignores `stream: true` answers with the finished response as JSON.
      if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        let body: ResponsesBody;
        try {
          body = JSON.parse(await res.text()) as ResponsesBody;
        } catch {
          throw new ProviderError('bad_response', 'provider response is not JSON');
        }
        const step = parseResponse(body, request, headerId);
        if (step.text) onText?.(step.text);
        return step;
      }
      if (!res.body) throw new ProviderError('bad_response', 'provider stream has no body');

      let finished: ResponsesBody | null = null;
      let buffer = '';
      // Reasoning summary parts as they stream, keyed by item and part.
      const parts = new Map<string, string>();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const handle = (line: string) => {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;
        let ev: { type?: unknown; delta?: unknown; item_id?: unknown; output_index?: unknown; summary_index?: unknown; response?: ResponsesBody; message?: unknown; error?: { message?: unknown } };
        try {
          ev = JSON.parse(data);
        } catch {
          throw new ProviderError('bad_response', 'provider stream sent an event that is not JSON');
        }
        if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string' && ev.delta) onText?.(ev.delta);
        else if (ev.type === 'response.reasoning_summary_text.delta' && typeof ev.delta === 'string') {
          const key = `${String(ev.item_id ?? ev.output_index)}:${String(ev.summary_index ?? 0)}`;
          parts.set(key, (parts.get(key) ?? '') + ev.delta);
          onReasoning?.([...parts.values()]);
        }
        else if ((ev.type === 'response.completed' || ev.type === 'response.incomplete') && ev.response) finished = ev.response;
        else if (ev.type === 'response.failed') throw new ProviderError('bad_response', `provider response failed: ${String(ev.response?.error?.message ?? 'no reason given')}`);
        else if (ev.type === 'error') throw new ProviderError('bad_response', redact(`provider stream error: ${String(ev.message ?? ev.error?.message ?? 'unknown')}`, opts.apiKey));
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          arm();
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            handle(buffer.slice(0, nl).replace(/\r$/, ''));
            buffer = buffer.slice(nl + 1);
          }
        }
        handle(buffer.trim());
      } catch (err) {
        return fail(err);
      }
      if (!finished) throw new ProviderError('bad_response', 'provider stream ended without a finished response');
      return parseResponse(finished, request, headerId);
    } finally {
      clearTimeout(timer);
      unfollow();
    }
  }

  return { model: opts.model, temperature: opts.temperature, complete, stream, respond };
}
