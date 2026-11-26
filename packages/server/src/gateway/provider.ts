import type { ProviderAdapter } from '@edw/shared';
import { createElmProvider } from './elm.js';
import { MockProvider } from './mock.js';

export type { ChatMessage, ProviderAdapter, ProviderResult } from '@edw/shared';

export { ProviderError, type ProviderErrorKind } from './errors.js';

export interface CreateProviderOptions {
  kind: 'mock' | 'elm';
  model: string;
  temperature: number;
  baseUrl?: string;
  apiKey?: string;
  /** Appended to baseUrl; default `/chat/completions`. */
  chatPath?: string;
  /** Agent steps: appended to baseUrl (default `/responses`), and the reasoning effort. */
  responsesPath?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  maxOutputTokens: number;
  /** Default 60 000 ms. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Mock only: pause between streamed chunks (default 15 ms). */
  mockStreamDelayMs?: number;
}

export function createProvider(opts: CreateProviderOptions): ProviderAdapter {
  if (opts.kind === 'mock') return new MockProvider(opts.model, opts.temperature, opts.mockStreamDelayMs ?? 15);
  if (!opts.baseUrl || !opts.apiKey) {
    throw new Error('createProvider: the elm provider needs both baseUrl and apiKey');
  }
  return createElmProvider({ ...opts, baseUrl: opts.baseUrl, apiKey: opts.apiKey });
}
