/**
 * The "Pupils who joined" card on a class's page (#220), below the class code: how many have
 * joined, a row for each ("Pupil N", the provider they sign in with, the day they joined) and
 * Remove, which asks for a second click. Drawn whenever someone has joined, even with pupils
 * switched off or the class archived, so a child's data can always be removed; with no one in it,
 * only while pupils can join. Not drawn without class members in the api (the make kit).
 *
 * Research data: the Remove button's accessible name is "Remove" and nothing more; the row is
 * named to it through `aria-describedby`, which the interaction log does not read. No member id
 * is in a label, title, `data-track` or element id.
 */
import { hasClassCode } from '../../../api/classCode';
import { hasClassMembers, type ClassMembersApi } from '../../../api/classMembers';
import type { SessionApi } from '../../../api/participant';
import type { Envelope } from '../../../api/types';
import { Button } from '../../../components/ui/button';
import { cardClass, cardTitleClass, hintClass } from '../styles';
import { CONFIRM_REMOVE, joinedCount, joinedDay, providerName, showJoinedCard } from './classMembers';
import { useClassMembers } from './useClassMembers';

export interface JoinedPupilsCardProps {
  classId: string;
  archived: boolean;
  api: SessionApi;
  getEnvelope: () => Envelope;
}

export function JoinedPupilsCard({ classId, archived, api, getEnvelope }: JoinedPupilsCardProps) {
  if (!hasClassMembers(api)) return null;
  return <Card classId={classId} canJoin={!archived && hasClassCode(api)} api={api} getEnvelope={getEnvelope} />;
}

function Card({ classId, canJoin, api, getEnvelope }: { classId: string; canJoin: boolean; api: ClassMembersApi; getEnvelope: () => Envelope }) {
  const s = useClassMembers(api, classId, getEnvelope);
  // Without a way in, wait for the list: the card is drawn only if someone is in it.
  if (!canJoin && s.status !== 'ready') return null;
  if (s.status === 'ready' && !showJoinedCard(s.members.length, canJoin)) return null;

  return (
    <section className={cardClass} aria-label="Pupils who joined">
      <h2 className={cardTitleClass}>Pupils who joined</h2>
      {s.status === 'loading' && <p className={hintClass}>Loading…</p>}
      {s.status === 'failed' && (
        <p className="error-text m-0 text-sm" role="alert">
          The pupils could not load. Reload the page to try again.
        </p>
      )}
      {s.status === 'ready' && s.members.length === 0 && <p className={hintClass}>No pupils have joined yet.</p>}
      {s.status === 'ready' && s.members.length > 0 && (
        <>
          <p className={hintClass}>{joinedCount(s.members.length)}.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {s.members.map((m, i) => {
              const labelId = `jp-${classId}-${i}`;
              return (
                <li key={m.id} className="flex flex-col gap-1.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span id={labelId} className="font-medium">
                      {m.label}
                    </span>
                    <span className="text-foreground-2">{providerName(m.provider)}</span>
                    <span className="text-foreground-2">Joined {joinedDay(m.joined_on)}</span>
                    {s.confirming !== m.id && (
                      <Button className="ml-auto" variant="ghost" size="sm" disabled={s.busy} aria-describedby={labelId} onClick={() => s.ask(m.id)}>
                        Remove
                      </Button>
                    )}
                  </div>
                  {s.confirming === m.id && (
                    <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-describedby={labelId}>
                      <span>{CONFIRM_REMOVE}</span>
                      <Button size="sm" disabled={s.busy} aria-describedby={labelId} onClick={() => void s.confirm()}>
                        Remove
                      </Button>
                      <Button variant="ghost" size="sm" disabled={s.busy} onClick={s.cancel}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {s.problem && (
        <p className="error-text m-0 text-sm" role="alert">
          {s.problem}
        </p>
      )}
    </section>
  );
}
