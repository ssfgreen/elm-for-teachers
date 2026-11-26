/**
 * Choosing a library adaptation for a pupil: those the pupil's note hints at first (a hint, not a
 * rule), then the rest. One that changes the learning goal is a modification: it needs a second
 * click that says so, as only a teacher may choose one.
 */
import { useState } from 'react';
import type { EntryBrief } from '../../api/pedagogy';
import { Button } from '../../components/ui/button';
import { EntryBadges } from '../pedagogy/EntryBadges';
import { adaptationGroups } from './adaptationChoice';
import { hintClass } from './styles';

export interface AdaptationPickerProps {
  label: string;
  library: EntryBrief[] | null;
  /** The text the hints are read from: the pupil's note (#243). */
  hintsFrom: readonly string[];
  chosen: ReadonlySet<string>;
  onChoose: (e: EntryBrief) => void;
  onClose: () => void;
}

export function AdaptationPicker({ label, library, hintsFrom, chosen, onChoose, onClose }: AdaptationPickerProps) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!library) return <p className={hintClass}>Loading the library’s adaptations…</p>;
  const g = adaptationGroups(library, hintsFrom, chosen);
  const row = (e: EntryBrief) => (
    <li key={e.id} className="flex flex-col gap-1 border-b border-border py-1.5 last:border-b-0">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{e.title}</span>
          <span className="block text-xs text-foreground-2">{e.summary}</span>
        </span>
        <Button size="sm" aria-label={`Choose ${e.title} for ${label}`} onClick={() => (e.changes_goal ? setConfirm(e.id) : onChoose(e))}>
          Choose
        </Button>
      </div>
      <EntryBadges type={e.type} evidence={e.evidence} status={e.status} changesGoal={e.changes_goal} />
      {confirm === e.id && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-warning" role="group" aria-label="Confirm a modification">
          This changes the learning goal for {label}, not only how they reach it. Choose it?
          <Button size="sm" onClick={() => onChoose(e)}>
            Yes, a modification
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
            No
          </Button>
        </div>
      )}
    </li>
  );
  return (
    <div className="flex w-96 max-w-[90vw] flex-col gap-1.5 rounded-md border border-border bg-card p-2.5 shadow-float" role="dialog" aria-label={`Adaptations for ${label}`}>
      {g.suggested.length > 0 && (
        <>
          <p className={hintClass}>Often relevant to {g.hints.join(', ')}: a hint for where to look, not a rule. Choose what helps this pupil.</p>
          <ul className="m-0 list-none p-0" aria-label="Suggested">
            {g.suggested.map(row)}
          </ul>
        </>
      )}
      <details open={g.suggested.length === 0}>
        <summary className="cursor-pointer text-sm text-foreground-2">{g.suggested.length ? 'All the others' : 'All adaptations'}</summary>
        <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">{g.others.map(row)}</ul>
      </details>
      <p className={hintClass}>Every adaptation in the library is a draft, not yet reviewed by educators.</p>
      <Button variant="ghost" size="sm" className="w-fit" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
