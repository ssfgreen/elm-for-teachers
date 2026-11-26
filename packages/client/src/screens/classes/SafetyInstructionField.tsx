/**
 * The Pupil reader card's safety instruction box (#195): what the reader's model is told about
 * keeping pupils safe. A class starts with the default (config `reader.safety_instruction`) and can
 * keep its own version. Saves when it loses focus, through the card's save queue. It cannot be
 * saved empty: "Back to the default" is the way back. A refusal puts back the last good text.
 */
import { SAFETY_INSTRUCTION_MAX } from '@edw/shared';
import { Button } from '../../components/ui/button';
import { decideSafetyCommit } from './readerSettings';
import { hintClass } from './styles';
import { useFieldSave } from './useFieldSave';
import type { SaveOutcome } from './useReaderSettings';

interface Props {
  id: string;
  shown: string;
  isDefault: boolean;
  defaultText: string;
  onSave: (value: string | null) => Promise<SaveOutcome>;
}

const PROBLEMS = {
  empty: 'Not saved: the safety instruction cannot be empty. Use "Back to the default" to start again.',
  long: `Not saved: keep it to ${SAFETY_INSTRUCTION_MAX.toLocaleString('en-GB')} characters.`,
};

export function SafetyInstructionField({ id, shown, isDefault, defaultText, onSave }: Props) {
  const field = useFieldSave<string>(shown, isDefault, onSave, { display: (v) => v ?? defaultText, refused: 'Not saved: the last version is back. Try again.' });
  const { text, state, problem, save, refuse, reset } = field;

  const commit = () => {
    field.blur();
    const c = decideSafetyCommit(text, field.basis.shown, field.basis.isDefault, defaultText);
    if (c.kind === 'none') return reset();
    if (c.kind === 'save') return void save(c.value);
    refuse(PROBLEMS[c.kind]);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-md text-foreground-2">
          Safety instruction
        </label>
        <span className="text-sm text-muted-foreground">{isDefault ? '(default)' : '(this class)'}</span>
        {state === 'saving' && <span className="ml-auto text-xs text-muted-foreground">Saving…</span>}
        {state === 'saved' && <span className="ml-auto text-xs text-muted-foreground">Saved</span>}
      </div>
      <textarea
        id={id}
        className="min-h-40 w-full rounded-sm border border-border-strong bg-card px-2 py-1 text-md"
        value={text}
        maxLength={SAFETY_INSTRUCTION_MAX}
        onChange={(e) => field.change(e.target.value)}
        onBlur={commit}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className={hintClass}>
        What the assistant is told about keeping pupils safe when they read with it. Adapt it for this class, up to {SAFETY_INSTRUCTION_MAX.toLocaleString('en-GB')} characters.
      </p>
      <Button size="sm" className="self-start" disabled={field.basis.isDefault} onClick={() => void save(null)}>
        Back to the default
      </Button>
      {state === 'failed' && (
        <p className="error-text m-0 text-xs" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
