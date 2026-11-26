import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { signOut as endSignIn } from '../api/account';
import { checkAdmin, createAdminApi, loadPassword, savePassword } from '../api/admin';
import type { AdminApi, AdminMe, GateState } from '../api/admin';
import { endpoints } from '../api/endpoints';
import { Button, buttonVariants } from '../components/ui/button';
import { ThemeSwitch } from '../components/ui/theme-switch';
import { PasswordForm } from './PasswordGate';

/**
 * `/admin` and `/admin/replay` ask the server who this is (GET /api/admin/me), then show the
 * page, the sign-in buttons, or "this account cannot open the admin pages". The password form
 * appears only where the server says it takes the password (local, e2e and a Vercel preview).
 * A password kept for this tab, from here or from /signin, goes with the first call.
 */
export function AdminGate({ children }: { children: (api: AdminApi, me: AdminMe, signOut: () => void) => ReactNode }) {
  const [state, setState] = useState<GateState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(() => {
    setError(null);
    checkAdmin(loadPassword()).then(setState, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(check, [check]);

  const signOut = () => {
    const viaPassword = state?.kind === 'admin' && state.me.via === 'password';
    // Off the admin screen at once, rather than leaving it up while the server answers.
    setState(null);
    if (viaPassword) {
      savePassword(null);
      check();
      return;
    }
    void endSignIn()
      .catch(() => undefined)
      .then(check);
  };

  if (state?.kind === 'admin') return <>{children(state.api, state.me, signOut)}</>;

  return (
    <>
      <ThemeSwitch className="fixed top-4 right-4" />
      <main className="mx-auto mt-36 flex max-w-88 flex-col gap-4 rounded-lg border border-border bg-card p-8 text-center text-foreground-2 shadow-card">
        <h1 className="text-foreground">Admin</h1>
        {error && <p className="text-destructive">Could not reach the server: {error}</p>}
        {!state && !error && <p className="text-muted-foreground">Checking…</p>}
        {state?.kind === 'not-admin' && (
          <>
            <p>This account cannot open the admin pages.</p>
            <p className="flex justify-center gap-3">
              <a className={buttonVariants({ variant: 'default' })} href="/w">
                Your workspace
              </a>
              <Button variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </p>
            {state.password && (
              <PasswordForm onAccepted={(password, me) => setState({ kind: 'admin', me, api: createAdminApi(password) })} />
            )}
          </>
        )}
        {state?.kind === 'signed-out' && (
          <>
            {state.again && <p>Admin sign-ins last 12 hours. Sign in again to carry on.</p>}
            {state.providers.length === 0 && !state.password && <p>No sign-in is set up on this site.</p>}
            {state.providers.map((p) => (
              <a key={p.id} className={buttonVariants({ variant: 'primary' })} href={endpoints.authStart(p.id, undefined, 'admin')}>
                Sign in with {p.label}
              </a>
            ))}
            {state.password && (
              <PasswordForm onAccepted={(password, me) => setState({ kind: 'admin', me, api: createAdminApi(password) })} />
            )}
          </>
        )}
      </main>
    </>
  );
}
