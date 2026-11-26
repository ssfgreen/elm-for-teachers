/**
 * The fields of a reading: the doc (for a new one only: the copy changes only by setting the doc
 * again), the library prompts it allows (all ticked to start, at least one) and, optionally, its
 * own follow-up limit.
 */
import { useId, useState, type FormEvent } from 'react';
import { READING_FOLLOW_UPS_MAX, READING_FOLLOW_UPS_MIN, type ReaderPrompt, type ReadingFields, type ReadingSource } from '@edw/shared';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { shortDate } from '../styles';
import { overrideText, parseOverride, ticked, toggled } from './readingView';

interface ReadingFormProps {
  library: ReaderPrompt[];
  /** The docs to pick from (a new reading); left out when changing one. */
  sources?: ReadingSource[];
  start: { prompt_ids: string[]; follow_ups_max: number | null };
  submitLabel: string;
  /** Resolves true when it was saved. */
  onSubmit: (fields: ReadingFields) => Promise<boolean>;
  onCancel: () => void;
}

export function ReadingForm({ library, sources, start, submitLabel, onSubmit, onCancel }: ReadingFormProps) {
  const id = useId();
  const [chosenDoc, setDocId] = useState('');
  const [tickedIds, setIds] = useState(() => start.prompt_ids);
  // Read through the current lists, so a doc or prompt gone since a reload is neither shown nor sent.
  const docId = sources?.some((s) => s.doc_id === chosenDoc) ? chosenDoc : '';
  const ids = ticked(library, tickedIds);
  const [override, setOverride] = useState(overrideText(start.follow_ups_max));
  const [busy, setBusy] = useState(false);
  const follow = parseOverride(override);
  const ready = (!sources || docId !== '') && ids.length > 0 && follow !== 'invalid';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    await onSubmit({ doc_id: docId, prompt_ids: ids, follow_ups_max: follow });
    setBusy(false);
  };

  return (
    <form className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card" onSubmit={(e) => void submit(e)}>
      {sources && (
        <label className="flex flex-col gap-1" htmlFor={`${id}-doc`}>
          <span className="text-md font-medium">Doc</span>
          <span className="text-sm text-muted-foreground">The class reads it as it is now. Later changes to the doc do not change the reading; set it again to update it.</span>
          <select id={`${id}-doc`} className="rounded-sm border border-border bg-card px-1.5 py-1 text-md" value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">{sources.length === 0 ? 'No docs yet' : 'Choose a doc'}</option>
            {sources.map((s) => (
              <option key={s.doc_id} value={s.doc_id}>
                {s.name} ({s.thread_title}, {shortDate(s.created_at)})
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-md font-medium">Prompts pupils can use</legend>
        {library.length === 0 && <span className="text-sm text-muted-foreground">The prompt library is empty: add prompts there first.</span>}
        {library.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-md">
            <input type="checkbox" checked={ids.includes(p.id)} onChange={() => setIds((x) => toggled(library, x, p.id))} />
            {p.label}
          </label>
        ))}
        {library.length > 0 && ids.length === 0 && <span className="text-sm text-destructive">Tick at least one prompt.</span>}
      </fieldset>
      <label className="flex flex-col gap-1" htmlFor={`${id}-follow`}>
        <span className="text-md font-medium">Follow-ups after an answer</span>
        <span className="text-sm text-muted-foreground">
          Leave empty for the same as the class, or give {READING_FOLLOW_UPS_MIN} to {READING_FOLLOW_UPS_MAX}.
        </span>
        <Input id={`${id}-follow`} className="w-24" inputMode="numeric" value={override} placeholder="Class" onChange={(e) => setOverride(e.target.value)} aria-invalid={follow === 'invalid'} />
        {follow === 'invalid' && <span className="text-sm text-destructive">A whole number from {READING_FOLLOW_UPS_MIN} to {READING_FOLLOW_UPS_MAX}, or empty.</span>}
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy || !ready}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
