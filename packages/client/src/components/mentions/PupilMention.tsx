/** A pupil named in a reply: hover for their row of the class's table, as the class page shows it. */
import type { Pupil, PupilAdaptation } from '@edw/shared';
import { HoverCard } from './HoverCard';
import { useMentions } from './context';

const ADAPTATION_STATUS: Record<PupilAdaptation['status'], string> = { confirmed: 'confirmed', trialling: 'trialling', stopped: 'stopped: did not help' };

/** The row: the table's own columns, in its order, and the pupil's adaptations from the library. Not the hidden needs or working_at (#243). */
export function PupilRow({ pupil, adaptations, className }: { pupil: Pupil; adaptations: readonly PupilAdaptation[]; className: string | null }) {
  const fields: [string, string | null][] = [
    ['What helps', pupil.helps],
    ['Note', pupil.note],
  ];
  const own = adaptations.filter((a) => a.pupil_id === pupil.id);
  return (
    <span className="flex flex-col gap-1.5">
      <span className="font-semibold text-foreground">
        {pupil.label}
        {className && <span className="font-normal text-muted-foreground"> · {className}</span>}
      </span>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {fields.map(([name, value]) => (
          <span key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="m-0 whitespace-pre-wrap text-foreground">{value ?? <span className="text-muted-foreground">None</span>}</dd>
          </span>
        ))}
        {own.length > 0 && (
          <span className="contents">
            <dt className="text-muted-foreground">Adaptations</dt>
            <dd className="m-0 text-foreground">
              {own.map((a) => (
                <span key={a.id} className="block">
                  {a.title} <span className="text-muted-foreground">({ADAPTATION_STATUS[a.status]}{a.changes_goal ? ', changes the goal' : ''})</span>
                </span>
              ))}
            </dd>
          </span>
        )}
      </dl>
    </span>
  );
}

export function PupilMention({ label, text }: { label: string; text: string }) {
  const m = useMentions();
  const pupil = m?.pupilOf(label);
  if (!m || !pupil) return <>{text}</>;
  const where = m.className ? ` in ${m.className}` : '';
  return <HoverCard kind="pupil" label={text} ariaLabel={`${pupil.label}: their row${where}`} card={() => <PupilRow pupil={pupil} adaptations={m.adaptations} className={m.className} />} />;
}
