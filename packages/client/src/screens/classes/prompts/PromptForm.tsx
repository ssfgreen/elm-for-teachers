/** The fields of one prompt, for adding a new one or changing one's wording. */
import { useId, useState, type FormEvent } from 'react';
import { READER_INSTRUCTION_MAX, READER_LABEL_MAX, type ReaderPromptFields } from '@edw/shared';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';

export const EMPTY_PROMPT: ReaderPromptFields = { label: '', instruction: '', after_highlight: true, follow_up: false };

interface PromptFormProps {
  start: ReaderPromptFields;
  submitLabel: string;
  /** Resolves true when it was saved; the form then empties (for a new prompt) or closes. */
  onSubmit: (fields: ReaderPromptFields) => Promise<boolean>;
  onCancel?: () => void;
  /** Show the two ticks (a new prompt); a saved prompt's ticks are on its card. */
  withTicks?: boolean;
}

export function PromptForm({ start, submitLabel, onSubmit, onCancel, withTicks }: PromptFormProps) {
  const id = useId();
  const [fields, setFields] = useState(start);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ReaderPromptFields>) => setFields((f) => ({ ...f, ...patch }));
  const ready = fields.label.trim() !== '' && fields.instruction.trim() !== '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const ok = await onSubmit({ ...fields, label: fields.label.trim(), instruction: fields.instruction.trim() });
    setBusy(false);
    if (ok) setFields(start);
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
      <label className="flex flex-col gap-1" htmlFor={`${id}-label`}>
        <span className="text-md font-medium">Button pupils see</span>
        <Input id={`${id}-label`} value={fields.label} maxLength={READER_LABEL_MAX} placeholder="For example: Explain" onChange={(e) => set({ label: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1" htmlFor={`${id}-instruction`}>
        <span className="text-md font-medium">Instruction to the assistant</span>
        <span className="text-sm text-muted-foreground">Pupils never see this. It goes to the assistant with the text they are reading.</span>
        <Textarea id={`${id}-instruction`} rows={3} value={fields.instruction} maxLength={READER_INSTRUCTION_MAX} placeholder="For example: Explain this to a student aged 9. Don't give the answers." onChange={(e) => set({ instruction: e.target.value })} />
      </label>
      {withTicks && <PromptTicks value={fields} onChange={set} />}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy || !ready}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** The two ticks: where pupils are offered the button. */
export function PromptTicks({ value, onChange, busy = {} }: { value: Pick<ReaderPromptFields, 'after_highlight' | 'follow_up'>; onChange: (patch: Partial<ReaderPromptFields>) => void; busy?: Partial<Record<'after_highlight' | 'follow_up', boolean>> }) {
  return (
    <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-1 border-0 p-0">
      <legend className="sr-only">Where pupils see it</legend>
      <label className="flex items-center gap-2 text-md">
        <input className="m-0" type="checkbox" checked={value.after_highlight} disabled={busy.after_highlight} onChange={(e) => onChange({ after_highlight: e.target.checked })} />
        After a highlight
      </label>
      <label className="flex items-center gap-2 text-md">
        <input className="m-0" type="checkbox" checked={value.follow_up} disabled={busy.follow_up} onChange={(e) => onChange({ follow_up: e.target.checked })} />
        As a follow-up
      </label>
    </fieldset>
  );
}
