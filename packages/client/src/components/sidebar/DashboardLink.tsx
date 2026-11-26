/**
 * "Dashboard": the last row of the sidebar, just above the account chip, for a signed-in admin
 * at /w only. It saves pending work first, as "Sign out" does, then leaves for /admin by a full
 * page load (docs/client-state.md rule 8). A teacher, or a workspace opened by link, sees nothing.
 */
import { LayoutDashboard } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DASHBOARD_PATH } from '../../state/account';
import { useSignedIn } from './accountContext';
import { itemClass } from './styles';

export function DashboardLink() {
  const account = useSignedIn();
  if (!account?.isAdmin) return null;
  return (
    <div className="flex-none px-2 pb-1">
      <a
        href={DASHBOARD_PATH}
        className={cn(itemClass(false), 'flex items-center gap-2 no-underline')}
        onClick={(e) => {
          // A plain click saves first; a new tab (Ctrl or middle click) leaves this one as it is.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          void account.openDashboard();
        }}
      >
        <LayoutDashboard size={15} aria-hidden="true" className="flex-none text-foreground-2" />
        Dashboard
      </a>
    </div>
  );
}
