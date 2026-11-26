/**
 * The pupil's asks on one reading (#236): the open chain (a passage, then each button pressed and
 * its reply), whether a request is out, and the last refusal's code. One per `ReaderScreen`
 * (docs/client-state.md). The chain lives only here: never in storage, the URL, a log line or the
 * console, so it is gone after a reload. A new reading, or Close, drops it, and an answer that
 * comes back after either is ignored. One request at a time: a second press while one is out
 * does nothing. A `follow_ups_used` refusal leaves the chain with no follow-ups left.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PupilPrompt } from '@edw/shared';
import { errorCode } from '../api/http';
import { askAbout } from './readerApi';

/** One step of a chain: the button pressed and the reply it got. */
export interface AskStep {
  id: string;
  label: string;
  reply: string;
}

export interface AskChain {
  passage: string;
  steps: AskStep[];
  follow_ups_left: number;
}

export interface AskState {
  chain: AskChain | null;
  /** A request is out: every ask button is off. */
  asking: boolean;
  /** Why the last ask was refused (a reason code, or 'failed'), or null. */
  refused: string | null;
  /** A first ask about `passage`: its answer replaces the open chain. */
  ask: (prompt: PupilPrompt, passage: string) => void;
  /** A follow-up on the newest reply of the open chain. */
  followUp: (prompt: PupilPrompt) => void;
  close: () => void;
}

export function useAsk(readingId: string): AskState {
  const [chain, setChain] = useState<AskChain | null>(null);
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  /** Bumped by a new reading and by Close: a request from before either is dropped when it answers. */
  const generation = useRef(0);
  const out = useRef(false);

  const reset = useCallback(() => {
    generation.current += 1;
    out.current = false;
    setChain(null);
    setAsking(false);
    setRefused(null);
  }, []);

  useEffect(reset, [readingId, reset]);

  const send = useCallback(
    async (prompt: PupilPrompt, passage: string, parent: AskChain | null) => {
      if (out.current) return;
      const mine = generation.current;
      out.current = true;
      setAsking(true);
      setRefused(null);
      const parentId = parent?.steps.at(-1)?.id;
      try {
        const a = await askAbout(readingId, { prompt_id: prompt.id, highlighted_text: passage, ...(parentId ? { parent_ask_id: parentId } : {}) });
        if (generation.current !== mine) return;
        const step = { id: a.id, label: prompt.label, reply: a.reply };
        setChain({ passage, steps: parent ? [...parent.steps, step] : [step], follow_ups_left: a.follow_ups_left });
      } catch (err) {
        if (generation.current !== mine) return;
        const code = errorCode(err);
        setRefused(code ?? 'failed');
        if (code === 'follow_ups_used') setChain((c) => c && { ...c, follow_ups_left: 0 });
      } finally {
        if (generation.current === mine) {
          out.current = false;
          setAsking(false);
        }
      }
    },
    [readingId],
  );

  const ask = useCallback((prompt: PupilPrompt, passage: string) => void send(prompt, passage, null), [send]);
  const followUp = useCallback(
    (prompt: PupilPrompt) => {
      if (chain && chain.follow_ups_left > 0) void send(prompt, chain.passage, chain);
    },
    [chain, send],
  );

  return { chain, asking, refused, ask, followUp, close: reset };
}
