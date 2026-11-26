/**
 * The "Pupil logins" card on a class's page (#232), between the class code and the pupils who
 * joined: Make 1 to 40 logins, see their passwords once (`LoginSlips`) with printable slips, and
 * the list of the class's logins, each "Not used yet" or the pupil's label, Locked after five
 * wrong passwords, Delete (a second click) while never used, and New password (a second click,
 * #246) on any login while pupils can join and no passwords are on show.
 *
 * Drawn when the api has pupil logins (the make kit's has none) and either pupils can join (class
 * codes in the api, the class not archived) or the class already has logins, so an unused login
 * can always be deleted. Make shows only while pupils can join.
 *
 * Research data: a username or password is only ever the value of a read-only input labelled
 * "Username" or "Password", never a button, link or label's text, an `aria-label`, `title`,
 * `data-track` or element id; the interaction log reads neither a field's value nor a selection
 * inside one. Delete is named "Delete" and points at its row through `aria-describedby`, which the
 * log does not read; so does New password.
 */
import { useState } from 'react';
import { hasClassCode } from '../../../api/classCode';
import type { SessionApi } from '../../../api/participant';
import { hasPupilLogins, MAX_LOGINS_A_BATCH, type PupilLoginsApi } from '../../../api/pupilLogins';
import type { Envelope } from '../../../api/types';
import { Button } from '../../../components/ui/button';
import { cardClass, cardTitleClass, hintClass } from '../styles';
import { siteAddress } from './classCode';
import { LoginSlips } from './LoginSlips';
import {
  canDelete,
  CONFIRM_DELETE,
  CONFIRM_NEW_PASSWORD,
  LOCKED,
  LOCKED_HINT,
  LOGINS_HINT,
  loginCount,
  loginStatus,
  makeLabel,
  NEW_LOGINS_TITLE,
  NEW_PASSWORD_TITLE,
  showLoginsCard,
} from './pupilLogins';
import { CODE_ON_SLIPS, slipsHtml } from './slips';
import { usePupilLogins } from './usePupilLogins';

export interface PupilLoginsCardProps {
  classId: string;
  /** The class's name, for the slips. */
  name: string;
  archived: boolean;
  api: SessionApi;
  getEnvelope: () => Envelope;
}

export function PupilLoginsCard({ classId, name, archived, api, getEnvelope }: PupilLoginsCardProps) {
  if (!hasPupilLogins(api)) return null;
  const canJoin = !archived && hasClassCode(api);
  const code = CODE_ON_SLIPS && hasClassCode(api) ? () => api.getClassCode(classId) : null;
  return <Card classId={classId} name={name} canJoin={canJoin} code={code} api={api} getEnvelope={getEnvelope} />;
}

interface CardProps {
  classId: string;
  name: string;
  canJoin: boolean;
  /** Reads the class code for the slips; null while `CODE_ON_SLIPS` is off. */
  code: (() => Promise<string | null>) | null;
  api: PupilLoginsApi;
  getEnvelope: () => Envelope;
}

const boxClass = 'w-full rounded-sm border border-border bg-card px-2 py-1 font-mono text-sm';

function Card({ classId, name, canJoin, code, api, getEnvelope }: CardProps) {
  const s = usePupilLogins(api, classId, getEnvelope);
  const [typed, setTyped] = useState('1');
  const count = loginCount(typed);
  // Without a way in, wait for the list: the card is drawn only if the class has logins.
  if (!canJoin && s.status !== 'ready') return null;
  if (s.status === 'ready' && !s.made && !showLoginsCard(s.logins.length, canJoin)) return null;

  const slips = async () =>
    slipsHtml({ className: name, address: siteAddress(window.location.origin), logins: s.made ?? [], code: code ? await code().catch(() => null) : null });

  return (
    <section className={cardClass} aria-label="Pupil logins">
      <h2 className={cardTitleClass}>Pupil logins</h2>
      <p className={hintClass}>{LOGINS_HINT}</p>
      {s.made ? (
        <LoginSlips
          classId={classId}
          made={s.made}
          title={s.madeBy === 'new-password' ? NEW_PASSWORD_TITLE : NEW_LOGINS_TITLE}
          confirming={s.confirmingDone}
          slips={slips}
          onAskDone={s.askDone}
          onCancelDone={s.cancelDone}
          onConfirmDone={s.confirmDone}
        />
      ) : (
        canJoin && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (count !== null) void s.make(count);
            }}
          >
            <label className="flex flex-col gap-1 text-sm text-foreground-2">
              How many
              <input
                type="number"
                min={1}
                max={MAX_LOGINS_A_BATCH}
                step={1}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-20 rounded-sm border border-border-strong bg-card px-2 py-1 text-md text-foreground"
              />
            </label>
            <Button type="submit" size="sm" disabled={count === null || s.busy}>
              {makeLabel(count)}
            </Button>
          </form>
        )
      )}
      {s.status === 'loading' && <p className={hintClass}>Loading…</p>}
      {s.status === 'failed' && (
        <p className="error-text m-0 text-sm" role="alert">
          The logins could not load. Reload the page to try again.
        </p>
      )}
      {s.status === 'ready' && s.logins.length === 0 && <p className={hintClass}>No logins yet.</p>}
      {s.status === 'ready' && s.logins.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Logins">
          {s.logins.map((l, i) => {
            const boxId = `pl-${classId}-${i}`;
            const asking = s.confirmingDelete === l.id || s.confirmingNewPassword === l.id;
            const newPassword = canJoin && !s.made && !asking;
            return (
              <li key={l.id} className="flex flex-col gap-1.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
                <input id={boxId} aria-label="Username" readOnly value={l.username} className={boxClass} onFocus={(e) => e.currentTarget.select()} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-foreground-2">{loginStatus(l)}</span>
                  {l.locked && <span className="font-medium text-warning">{LOCKED}</span>}
                  {(newPassword || (canDelete(l) && !asking)) && (
                    <span className="ml-auto flex gap-1">
                      {newPassword && (
                        <Button variant="ghost" size="sm" disabled={s.busy} aria-describedby={boxId} onClick={() => s.askNewPassword(l.id)}>
                          New password
                        </Button>
                      )}
                      {canDelete(l) && !asking && (
                        <Button variant="ghost" size="sm" disabled={s.busy} aria-describedby={boxId} onClick={() => s.askDelete(l.id)}>
                          Delete
                        </Button>
                      )}
                    </span>
                  )}
                </div>
                {l.locked && <p className={hintClass}>{LOCKED_HINT}</p>}
                {s.confirmingNewPassword === l.id && !s.made && (
                  <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="New password">
                    <span>{CONFIRM_NEW_PASSWORD}</span>
                    <Button size="sm" disabled={s.busy} aria-describedby={boxId} onClick={() => void s.confirmNewPassword()}>
                      Make new password
                    </Button>
                    <Button variant="ghost" size="sm" disabled={s.busy} onClick={s.cancelNewPassword}>
                      Cancel
                    </Button>
                  </div>
                )}
                {s.confirmingDelete === l.id && (
                  <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Delete the login">
                    <span>{CONFIRM_DELETE}</span>
                    <Button size="sm" disabled={s.busy} aria-describedby={boxId} onClick={() => void s.confirmDelete()}>
                      Delete
                    </Button>
                    <Button variant="ghost" size="sm" disabled={s.busy} onClick={s.cancelDelete}>
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {s.problem && (
        <p className="error-text m-0 text-sm" role="alert">
          {s.problem}
        </p>
      )}
    </section>
  );
}
