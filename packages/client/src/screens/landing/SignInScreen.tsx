import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PasswordForm } from '../../admin/PasswordGate';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { signInErrorMessage } from './codes';
import { ProviderButtons } from './ProviderButtons';
import { gateClass, linkClass } from './styles';
import { usePasswordTaken } from './usePasswordTaken';
import { useProviders } from './useProviders';

/**
 * `/signin`: one button per provider, why the last try failed (`?error=`), and "You have signed out."
 * after signing out (`?signed_out=1`). Where the server takes the admin password (not production),
 * a Username and Password form under the buttons: "admin" and the password open /admin for this tab.
 */
export function SignInScreen() {
  const [params] = useSearchParams();
  const error = signInErrorMessage(params.get('error'));
  // Where "Sign out" in a signed-in workspace lands (SIGNED_OUT_PATH in screens/AccountApp.tsx).
  const signedOut = params.get('signed_out') === '1';
  const providers = useProviders();
  const passwordTaken = usePasswordTaken();
  const navigate = useNavigate();
  return (
    <>
      <ThemeSwitch className="fixed top-4 right-4" />
      <main className={gateClass}>
        <h1 className="text-foreground">Log in</h1>
        {signedOut && (
          <p role="status" className="mb-3">
            You have signed out.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 text-destructive">
            {error}
          </p>
        )}
        {/* "Sign-in is not set up here yet" would be wrong above a form that signs in. */}
        {!(passwordTaken && providers?.length === 0) && <ProviderButtons providers={providers} focusFirst />}
        {passwordTaken && (
          <div className="mt-4">
            <PasswordForm askUsername onAccepted={() => navigate('/admin')} />
          </div>
        )}
        <p className="mt-4">Teachers and admins both log in here.</p>
        <p className="mt-2 text-sm">
          Have a code instead?{' '}
          <Link className={linkClass} to="/start">
            Go back
          </Link>
        </p>
      </main>
    </>
  );
}
