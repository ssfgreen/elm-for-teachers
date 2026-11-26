/** The reader's prompt library on the server (#177), for one workspace. */
import type { ReaderPrompt, ReaderPromptFields, ReaderPromptPatch } from '@edw/shared';
import { endpoints } from '../../../api/endpoints';
import { api } from '../../../api/http';
import type { Envelope } from '../../../api/types';

export interface PromptLibraryApi {
  list(): Promise<ReaderPrompt[]>;
  add(fields: ReaderPromptFields, envelope: Envelope): Promise<ReaderPrompt>;
  edit(promptId: string, patch: ReaderPromptPatch, envelope: Envelope): Promise<ReaderPrompt>;
  remove(promptId: string, envelope: Envelope): Promise<void>;
  /** Every prompt's id once, in the new order. */
  reorder(promptIds: string[], envelope: Envelope): Promise<ReaderPrompt[]>;
}

export function createPromptLibraryApi(token: string, sessionId: string): PromptLibraryApi {
  const opts = { token };
  return {
    list: () => api<{ prompts: ReaderPrompt[] }>('GET', endpoints.readerPrompts(sessionId), undefined, opts).then((r) => r.prompts),
    add: (fields, envelope) => api<{ prompt: ReaderPrompt }>('POST', endpoints.readerPrompts(sessionId), { ...fields, envelope }, opts).then((r) => r.prompt),
    edit: (promptId, patch, envelope) => api<{ prompt: ReaderPrompt }>('PATCH', endpoints.readerPrompts(sessionId, promptId), { ...patch, envelope }, opts).then((r) => r.prompt),
    remove: (promptId, envelope) => api<void>('DELETE', endpoints.readerPrompts(sessionId, promptId), { envelope }, opts),
    reorder: (promptIds, envelope) => api<{ prompts: ReaderPrompt[] }>('PUT', endpoints.readerPromptOrder(sessionId), { prompt_ids: promptIds, envelope }, opts).then((r) => r.prompts),
  };
}
