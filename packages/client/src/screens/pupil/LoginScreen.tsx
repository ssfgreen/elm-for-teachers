import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { linkClass } from '../landing/styles';
import { pupilErrorMessage } from './messages';
import { PupilLoginForm } from './PasswordForm';
import { ProviderLinks, SignInFrame } from './SignInFrame';

/**
 * `/r/login`, "Log in" (#245): a pupil who has signed up before signs in with their provider or
 * their teacher's username and password, with no class code. `?error=` (from /r) says why the last
 * try failed; `?signed_out=1` is where Sign out on /r lands.
 */
export function PupilLoginScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const error = pupilErrorMessage(params.get('error'));
  const signedOut = params.get('signed_out') === '1';
  return (
    <SignInFrame title="Log in">
      {(providers) => (
        <div className="flex flex-col gap-4">
          {signedOut && <p role="status">You have signed out.</p>}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <ProviderLinks providers={providers} />
          <div className="text-left">
            {/* A refusal of the form replaces the last try's reason and "signed out": one message at a time. */}
            <PupilLoginForm submitLabel="Log in" onSignedIn={() => navigate('/r', { replace: true })} onRefused={() => setParams({}, { replace: true })} />
          </div>
          <p className="text-sm">
            First time?{' '}
            <Link className={linkClass} to="/r/join">
              Sign up with your class code
            </Link>
          </p>
          <p className="text-sm">
            A teacher?{' '}
            <Link className={linkClass} to="/signin">
              Log in on the teacher page
            </Link>
          </p>
        </div>
      )}
    </SignInFrame>
  );
}
