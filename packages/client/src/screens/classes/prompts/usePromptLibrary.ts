/**
 * The prompt library's state for its screen: loads it, and adds, saves, removes and moves
 * prompts through the server. A move shows at once and goes back if the server refuses it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { READER_PROMPTS_MAX, type ReaderPrompt, type ReaderPromptFields, type ReaderPromptPatch } from '@edw/shared';
import { errorCode } from '../../../api/http';
import type { Envelope } from '../../../api/types';
import type { PromptLibraryApi } from './api';
import { inOrder, moveId } from './promptOrder';

export interface PromptLibrary {
  status: 'loading' | 'ready' | 'failed';
  prompts: ReaderPrompt[];
  error: string | null;
  add(fields: ReaderPromptFields): Promise<boolean>;
  save(promptId: string, patch: ReaderPromptPatch): Promise<boolean>;
  remove(promptId: string): Promise<void>;
  /** Whether a save of this prompt's field is in flight (its tick is disabled until it answers). */
  saving(promptId: string, field: keyof ReaderPromptFields): boolean;
  move(promptId: string, by: -1 | 1): Promise<void>;
}

function message(e: unknown): string {
  switch (errorCode(e)) {
    case 'too_many_prompts':
      return `The library holds ${READER_PROMPTS_MAX} prompts at most: remove one first.`;
    case 'prompts_changed':
      return 'The library changed in another window, so it has been reloaded. Please try again.';
    case 'not_found':
      return 'That prompt has been removed, so the library has been reloaded.';
    default:
      return 'That change could not be saved. Please try again.';
  }
}

export function usePromptLibrary(api: PromptLibraryApi, getEnvelope: () => Envelope): PromptLibrary {
  const [status, setStatus] = useState<PromptLibrary['status']>('loading');
  const [prompts, setPrompts] = useState<ReaderPrompt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set());
  const flying = useRef(inFlight);
  const fly = (next: (s: ReadonlySet<string>) => ReadonlySet<string>) => {
    flying.current = next(flying.current);
    setInFlight(flying.current);
  };
  const current = useRef(prompts);
  current.current = prompts;

  const load = useCallback(
    () =>
      api.list().then(
        (p) => {
          setPrompts(p);
          setStatus('ready');
        },
        () => setStatus((s) => (s === 'ready' ? s : 'failed')),
      ),
    [api],
  );

  useEffect(() => void load(), [load]);

  /** Runs a change; on a refusal says why, and reloads when the library was not what we thought. */
  const attempt = useCallback(
    async (run: () => Promise<void>): Promise<boolean> => {
      setError(null);
      try {
        await run();
        return true;
      } catch (e) {
        setError(message(e));
        if (errorCode(e) === 'prompts_changed' || errorCode(e) === 'not_found') void load();
        return false;
      }
    },
    [load],
  );

  const add = useCallback((fields: ReaderPromptFields) => attempt(async () => {
    const p = await api.add(fields, getEnvelope());
    setPrompts((ps) => [...ps, p]);
  }), [api, attempt, getEnvelope]);

  // Shown at once (a tick must change as it is clicked). Each field has at most one save in flight:
  // its tick is disabled until the server answers, so two saves of one field cannot cross. Only
  // the patch's own fields are touched afterwards: the server's value on success, the value from
  // before on a refusal.
  const save = useCallback(async (promptId: string, patch: ReaderPromptPatch) => {
    const keys = Object.keys(patch) as (keyof ReaderPromptPatch)[];
    const tags = keys.map((k) => `${promptId}:${k}`);
    // The tick is disabled meanwhile; this also stops a click that reaches it anyway.
    if (tags.some((t) => flying.current.has(t))) return false;
    const before = current.current.find((x) => x.id === promptId);
    const change = (fields: ReaderPromptPatch) => setPrompts((ps) => ps.map((x) => (x.id === promptId ? { ...x, ...fields } : x)));
    const pick = (from: ReaderPromptPatch) => Object.fromEntries(keys.map((k) => [k, from[k]]));
    fly((s) => new Set([...s, ...tags]));
    change(patch);
    const ok = await attempt(async () => change(pick(await api.edit(promptId, patch, getEnvelope()))));
    if (!ok && before) change(pick(before));
    fly((s) => new Set([...s].filter((t) => !tags.includes(t))));
    return ok;
  }, [api, attempt, getEnvelope]);

  const saving = useCallback((promptId: string, field: keyof ReaderPromptFields) => inFlight.has(`${promptId}:${field}`), [inFlight]);

  const remove = useCallback(async (promptId: string) => {
    await attempt(async () => {
      await api.remove(promptId, getEnvelope());
      setPrompts((ps) => ps.filter((x) => x.id !== promptId));
    });
  }, [api, attempt, getEnvelope]);

  // A move only ever changes the order: the reply and a refusal are applied to the prompts as
  // they are now, so a tick saved or a prompt added meanwhile is kept.
  const move = useCallback(async (promptId: string, by: -1 | 1) => {
    const was = current.current.map((p) => p.id);
    const ids = moveId(was, promptId, by);
    if (ids === was) return;
    setPrompts((ps) => inOrder(ps, ids));
    const ok = await attempt(async () => {
      const saved = await api.reorder([...ids], getEnvelope());
      setPrompts((ps) => inOrder(ps, saved.map((p) => p.id)));
    });
    // Put the old order back unless another move has changed it since.
    if (!ok) setPrompts((ps) => (ps.map((p) => p.id).filter((id) => ids.includes(id)).join() === ids.join() ? inOrder(ps, was) : ps));
  }, [api, attempt, getEnvelope]);

  return { status, prompts, error, add, save, remove, move, saving };
}
