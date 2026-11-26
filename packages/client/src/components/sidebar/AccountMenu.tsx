/** The account chip at the foot of the sidebar. Taken out of ThreadSidebar unchanged. */
import { useCallback, useRef, useState } from 'react';
import { Download, LogOut } from 'lucide-react';
import { ThemeSwitch } from '../ui/theme-switch';
import { useDismiss } from '../useDismiss';
import { useSignedIn } from './accountContext';

const itemClass = 'flex w-full items-center gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-base text-foreground hover:bg-hover';

/** The account chip at the foot of the sidebar; its menu opens upwards. */
export function AccountMenu({
  name,
  onDownloadData,
}: {
  name: string;
  onDownloadData: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  // Only in a signed-in workspace (/w): one opened by link has no account.
  const account = useSignedIn();

  const download = async () => {
    setState('busy');
    try {
      await onDownloadData();
      setState('idle');
      setOpen(false);
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="relative mt-auto flex-none border-t border-border p-2" ref={ref}>
      {open && (
        <div
          className="absolute bottom-full mb-1 left-2 z-40 w-60 rounded-md border border-border bg-card p-1 shadow-float"
          role="menu"
          aria-label="Account"
        >
          <div className="truncate px-2.5 pt-1.75 pb-1.5 text-xs text-muted-foreground">{name}</div>
          {account?.email && <div className="truncate px-2.5 pb-1.5 text-xs text-muted-foreground">{account.email}</div>}
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={state === 'busy'}
            onClick={() => void download()}
          >
            <Download size={14} aria-hidden="true" />
            <span className="min-w-0 truncate">
              {state === 'busy' ? 'Preparing…' : 'Documents and chats (.zip)'}
            </span>
          </button>
          {state === 'failed' && (
            <div
              className="mt-1 border-t border-border px-2.5 pt-1.5 pb-1.25 text-xs text-destructive"
              role="alert"
            >
              The download did not work. Please try again.
            </div>
          )}
          <AppearanceChoice />
          {account && <SignOutItem signOut={account.signOut} />}
        </div>
      )}
      <button
        type="button"
        className="flex w-full items-center gap-2.25 rounded-sm border-0 bg-transparent px-1.75 py-1.5 text-left text-md text-foreground hover:bg-hover aria-expanded:bg-hover"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        title={name}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="grid size-6.5 flex-none place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="min-w-0 truncate">{name}</span>
      </button>
    </div>
  );
}

/**
 * Light, Dark or System, as a small three-way switch in the account menu. Each choice is a
 * menu radio item (Tab, or the arrow keys within the row, then Enter or Space); the menu
 * stays open, so the change can be seen.
 */
function AppearanceChoice() {
  return (
    <div className="mt-1 border-t border-border px-2.5 pt-1.75 pb-1.5">
      <div className="mb-1.5 text-xs text-muted-foreground" aria-hidden="true">
        Appearance
      </div>
      <ThemeSwitch inMenu />
    </div>
  );
}

/** The last item, in a signed-in workspace. Pending work is saved first, so it can take a few seconds. */
function SignOutItem({ signOut }: { signOut: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const run = async () => {
    setState('busy');
    try {
      await signOut();
    } catch {
      setState('failed');
    }
  };
  return (
    <div className="mt-1 border-t border-border pt-1">
      <button type="button" role="menuitem" className={itemClass} disabled={state === 'busy'} onClick={() => void run()}>
        <LogOut size={14} aria-hidden="true" />
        <span className="min-w-0 truncate">{state === 'busy' ? 'Signing out…' : 'Sign out'}</span>
      </button>
      {state === 'failed' && (
        <div className="px-2.5 pt-1 pb-1.25 text-xs text-destructive" role="alert">
          Signing out did not work. Please try again.
        </div>
      )}
    </div>
  );
}
