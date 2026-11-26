import type { AdminApi, AdminMe } from '../../api/admin';
import { AdminGate } from '../../admin/AdminGate';
import { Button } from '../../components/ui/button';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { AdminsPanel } from './AdminsPanel';
import { InvitesPanel } from './InvitesPanel';
import { NewWorkspaceForm } from './NewWorkspaceForm';
import { linkClass } from './styles';
import { useAdminAccounts } from './useAdminAccounts';
import { useAdminSessions } from './useAdminSessions';
import { WorkspaceList } from './WorkspaceList';

/** `/admin`: sign in, create workspace links, invite teachers, list workspaces and accounts. */
export function AdminApp() {
  return <AdminGate>{(api, me, signOut) => <AdminScreen api={api} me={me} signOut={signOut} />}</AdminGate>;
}

function AdminScreen({ api, me, signOut }: { api: AdminApi; me: AdminMe; signOut: () => void }) {
  const list = useAdminSessions(api);
  const accounts = useAdminAccounts(api);
  return (
    <main className="mx-auto max-w-384 px-7 pt-5 pb-8">
      <header className="mb-2 flex items-baseline justify-between">
        <h1>Workspaces</h1>
        <div className="flex items-center gap-3">
          {me.via === 'account' && (
            <a className={linkClass} href="/w">
              Your workspace
            </a>
          )}
          <ThemeSwitch />
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>
      {list.error && <p className="text-destructive">{list.error}</p>}
      <NewWorkspaceForm onCreate={list.create} created={list.created} />
      <WorkspaceList sessions={list.sessions} ctx={{ api, list, accounts: accounts.bySession }} />
      <InvitesPanel api={api} />
      {accounts.error && <p className="text-destructive">{accounts.error}</p>}
      <AdminsPanel api={api} accounts={accounts.accounts} meId={me.via === 'account' ? me.account.id : null} onChanged={accounts.reload} />
    </main>
  );
}
