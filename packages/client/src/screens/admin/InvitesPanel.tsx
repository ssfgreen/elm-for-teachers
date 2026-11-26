import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { AdminApi, AdminInvite } from '../../api/admin';
import { CopyLink } from '../../admin/WorkspaceLinks';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cardClass, tdClass, thClass } from './styles';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const day = (iso: string) => new Date(iso).toLocaleDateString();
const STATUS: Record<AdminInvite['status'], string> = { open: 'Open', used: 'Used', expired: 'Expired' };

/** The link a teacher opens to sign up with an invite (scripts/admin.mjs prints the same). */
export const joinUrl = (code: string, origin = window.location.origin) => `${origin}/join/${code}`;

export interface InvitesPanelProps {
  api: Pick<AdminApi, 'listInvites' | 'createInvite' | 'deleteInvite'>;
  /** After a change, so other lists can catch up. */
  onChanged?: () => void;
}

/**
 * Invites: a teacher signs up with one and gets a workspace of their own. The code and its
 * /join link are shown once, when made: only the code's hash is kept.
 */
export function InvitesPanel({ api, onChanged }: InvitesPanelProps) {
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [made, setMade] = useState<{ label: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { listInvites, createInvite, deleteInvite } = api;

  const load = useCallback(() => {
    listInvites().then(setInvites, (e: unknown) => setError(message(e)));
  }, [listInvites]);
  useEffect(() => load(), [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { code } = await createInvite(label.trim(), email.trim() || null);
      setMade({ label: label.trim(), code });
      setLabel('');
      setEmail('');
      load();
      onChanged?.();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteInvite(id);
      load();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <section className={cardClass} aria-labelledby="invites-heading">
      <h2 id="invites-heading" className="mb-3">
        Invites
      </h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.25 text-base text-foreground-2">
          <span>Label (names their workspace)</span>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        </label>
        <label className="flex flex-col gap-1.25 text-base text-foreground-2">
          <span>Email (optional)</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !label.trim()}>
          Make
        </Button>
      </form>
      <p className="mt-2 text-md text-muted-foreground">The label is kept with the research data, as the workspace’s name. Use a code name, not the teacher’s name.</p>
      {made && (
        <p role="status">
          Invite for {made.label}: <code>{made.code}</code> · <code>{joinUrl(made.code)}</code> <CopyLink url={joinUrl(made.code)} />
          <br />
          <span className="text-muted-foreground">Shown only now: copy it before you leave the page.</span>
        </p>
      )}
      {error && <p className="text-destructive">{error}</p>}
      {invites.length > 0 && (
        <table className="mt-3 w-full border-collapse text-base">
          <thead>
            <tr>
              {['Label', 'Email', 'Status', 'Made', 'Ends', ''].map((h) => (
                <th key={h} className={thClass}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id} className="group/row">
                <td className={tdClass}>{i.label}</td>
                <td className={tdClass}>{i.email ?? ''}</td>
                <td className={tdClass}>{STATUS[i.status]}</td>
                <td className={tdClass}>{day(i.created_at)}</td>
                <td className={tdClass}>{i.status === 'used' && i.used_at ? `Used ${day(i.used_at)}` : day(i.expires_at)}</td>
                <td className={tdClass}>
                  {i.status === 'open' && (
                    <Button variant="link-danger" onClick={() => void remove(i.id)} aria-label={`Delete the invite for ${i.label}`}>
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
