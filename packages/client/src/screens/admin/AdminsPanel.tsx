import { useState } from 'react';
import type { AdminAccount, AdminApi } from '../../api/admin';
import { errorCode, providerName } from '../../api/admin';
import { cardClass, tdClass, thClass } from './styles';

export interface AdminsPanelProps {
  api: Pick<AdminApi, 'setAdmin'>;
  accounts: AdminAccount[];
  /** The signed-in admin's own account, if signed in (not the password). */
  meId: string | null;
  /** After a change: reload the accounts. */
  onChanged: () => void;
}

/** Every signed-in account, with an Admin switch. The server refuses to remove the last admin. */
export function AdminsPanel({ api, accounts, meId, onChanged }: AdminsPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (a: AdminAccount) => {
    setBusy(a.id);
    setError(null);
    try {
      await api.setAdmin(a.id, !a.admin);
      onChanged();
    } catch (e) {
      setError(errorCode(e) === 'last_admin' ? 'This is the only admin. Make another account admin first.' : `That did not work: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={cardClass} aria-labelledby="admins-heading">
      <h2 id="admins-heading" className="mb-3">
        Admins
      </h2>
      <p className="mb-2 text-md text-muted-foreground">Everyone who has signed in. An admin can open these pages.</p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {accounts.length === 0 ? (
        <p className="text-muted-foreground">No one has signed in yet. Make an invite above.</p>
      ) : (
        <table className="w-full border-collapse text-base">
          <thead>
            <tr>
              {['Name', 'Email', 'Signs in with', 'Workspace', 'Admin'].map((h) => (
                <th key={h} className={thClass}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="group/row">
                <td className={tdClass}>
                  {a.name ?? 'No name given'}
                  {a.id === meId && <span className="text-muted-foreground"> (you)</span>}
                </td>
                <td className={tdClass}>{a.email ?? ''}</td>
                <td className={tdClass}>{providerName(a.provider)}</td>
                <td className={tdClass}>{a.workspace.label}</td>
                <td className={tdClass}>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-checked={a.admin}
                    checked={a.admin}
                    disabled={busy !== null}
                    onChange={() => void toggle(a)}
                    aria-label={`Admin: ${a.name ?? a.email ?? a.workspace.label}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
