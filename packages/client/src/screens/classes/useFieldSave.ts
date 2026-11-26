/**
 * One box on the Pupil reader card (#186, #195): its text, its save state and the message under
 * it. `save` sends a value through the card's queue and shows Saving, Saved or the refusal;
 * `refuse` puts the last value back with a message, without asking the server.
 *
 * While a save is with the server (review of #199):
 * - the box is never overwritten while it has edits not yet sent, so typing is not lost (a box
 *   that only has focus is: a reply or refusal shows there at once, so blur does not resend);
 * - `basis` is the last value sent, not the last the server confirmed, so a change back to what
 *   the server had before (the default, say) is still sent, and the server ends with it.
 */
import { useEffect, useRef, useState } from 'react';
import type { SaveOutcome } from './useReaderSettings';

export type FieldState = 'idle' | 'saving' | 'saved' | 'failed';

export const REFUSED = 'Not saved: the last value is back. Try again.';
/** A refusal that lands while the teacher has changed the box again: their change stays. */
export const REFUSED_KEPT = 'Not saved; your change is still in the box.';

/** What the box compares a teacher's text with: its text, and whether it is the default. */
export interface Basis {
  shown: string;
  isDefault: boolean;
}

export interface FieldOptions<V> {
  /** The box's text for a value; null is the default's text. */
  display: (value: V | null) => string;
  refused?: string;
}

export function useFieldSave<V>(shown: string, isDefault: boolean, onSave: (value: V | null) => Promise<SaveOutcome>, { display, refused = REFUSED }: FieldOptions<V>) {
  const [text, setText] = useState(shown);
  const [state, setState] = useState<FieldState>('idle');
  const [problem, setProblem] = useState('');
  const edited = useRef(false);
  /** The last value sent while it is with the server. */
  const pending = useRef<Basis | null>(null);

  useEffect(() => {
    if (!edited.current && !pending.current) setText(shown);
  }, [shown, isDefault]);
  // What the server last confirmed: a refusal puts this back, not what it showed when the save began.
  const current = useRef(shown);
  current.current = shown;

  const basis: Basis = pending.current ?? { shown, isDefault };

  const save = async (value: V | null) => {
    const sent: Basis = { shown: display(value), isDefault: value === null };
    pending.current = sent;
    setState('saving');
    const outcome = await onSave(value);
    // A later save of this box is in flight: its outcome is the one shown.
    if (outcome === 'stale') return;
    pending.current = null;
    if (outcome === 'saved') {
      if (!edited.current) setText(sent.shown);
      return setState('saved');
    }
    if (!edited.current) setText(current.current);
    setProblem(edited.current ? REFUSED_KEPT : refused);
    setState('failed');
  };

  const refuse = (message: string) => {
    setText(basis.shown);
    setProblem(message);
    setState('failed');
  };

  return {
    text,
    state,
    problem,
    basis,
    save,
    refuse,
    reset: () => setText(basis.shown),
    change: (t: string) => {
      edited.current = true;
      setText(t);
    },
    /** Call as the box loses focus, before deciding what its text means: its edits are sent or refused now. */
    blur: () => {
      edited.current = false;
    },
  };
}
