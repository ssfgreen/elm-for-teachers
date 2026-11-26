/**
 * "Copy to next year" on a class's page: the year group moves up and the name follows (P6A in P6
 * becomes P7A in P7), both editable; the pupils come too, as new rows (Sam, 12 Nov 2026).
 */
import { useState, type FormEvent } from 'react';
import { CopyPlus } from 'lucide-react';
import { CLASS_NAME_MAX, nextClassName, nextYearGroupName, type SchoolClass } from '@edw/shared';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export function CopyToNextYear({ cls, yearGroupName, toYear, onCopy }: { cls: SchoolClass; yearGroupName: string; toYear: string; onCopy: (f: { year_group_name: string; name: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const nextGroup = nextYearGroupName(yearGroupName) ?? yearGroupName;
  const [group, setGroup] = useState(nextGroup);
  const [name, setName] = useState(nextClassName(cls.name, yearGroupName, nextGroup));
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <CopyPlus size={14} aria-hidden="true" /> Copy to {toYear}
      </Button>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setState('busy');
    onCopy({ year_group_name: group.trim() || nextGroup, name: name.trim() || cls.name }).catch(() => setState('failed'));
  };
  return (
    <form className="order-last flex basis-full flex-wrap items-end gap-2 rounded-md border border-border bg-card p-2 text-sm" onSubmit={submit} aria-label={`Copy ${cls.name} to ${toYear}`}>
      <label className="flex flex-col gap-1 text-foreground-2">
        Year group in {toYear}
        <Input value={group} maxLength={CLASS_NAME_MAX} onChange={(e) => setGroup(e.target.value)} className="w-24 text-md" />
      </label>
      <label className="flex flex-col gap-1 text-foreground-2">
        Class name
        <Input value={name} maxLength={CLASS_NAME_MAX} onChange={(e) => setName(e.target.value)} className="w-32 text-md" />
      </label>
      <Button type="submit" size="sm" disabled={state === 'busy'}>
        Copy with its pupils
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state === 'failed' && (
        <p className="error-text m-0 w-full" role="alert">
          It could not be copied. Please try again.
        </p>
      )}
    </form>
  );
}
