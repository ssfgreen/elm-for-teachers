/** An entry's type, evidence and draft status, and a modification warning, as badges. */
import { Badge } from '../../components/ui/badge';
import { EVIDENCE, TYPE_SINGULAR } from './labels';

export function EntryBadges({ type, evidence, status, changesGoal }: { type: string; evidence: string | null; status: string; changesGoal?: boolean }) {
  const ev = evidence ? EVIDENCE[evidence] : undefined;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant="outline">{TYPE_SINGULAR[type] ?? type}</Badge>
      {ev && <Badge variant={ev.tone}>{ev.label}</Badge>}
      {changesGoal && (
        <Badge variant="warning" title="Changes the learning goal: only ever the teacher's choice">
          Modification
        </Badge>
      )}
      {status === 'draft' && <Badge title="Not yet reviewed by a teacher or specialist">Draft</Badge>}
    </span>
  );
}
