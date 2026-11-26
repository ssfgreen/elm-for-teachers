/** Which model provider the gateway calls, and where. */
import { z } from 'zod';
import { emptyToUndefined, optional, type Vars } from './parse.js';

export const modelVars = {
  PROVIDER: z.preprocess(emptyToUndefined, z.enum(['mock', 'elm']).default('mock')),
  ELM_PROXY_BASE_URL: optional(z.string().url()),
  ELM_PROXY_API_KEY: optional(z.string()),
  ELM_PROXY_CHAT_PATH: z.preprocess(emptyToUndefined, z.string().default('/chat/completions')),
  /** Agent mode's Responses API path. */
  ELM_PROXY_RESPONSES_PATH: z.preprocess(emptyToUndefined, z.string().default('/responses')),
};

export interface ModelEnv {
  PROVIDER: 'mock' | 'elm';
  ELM_PROXY_BASE_URL?: string;
  ELM_PROXY_API_KEY?: string;
  ELM_PROXY_CHAT_PATH: string;
  ELM_PROXY_RESPONSES_PATH: string;
}

/** PROVIDER=elm needs the proxy's address and key. */
export function checkModel(v: Vars<typeof modelVars>): void {
  if (v.PROVIDER === 'elm') {
    const missing = (['ELM_PROXY_BASE_URL', 'ELM_PROXY_API_KEY'] as const).filter((k) => !v[k]);
    if (missing.length) {
      throw new Error(`PROVIDER=elm requires ${missing.join(' and ')} to be set`);
    }
  }
}
