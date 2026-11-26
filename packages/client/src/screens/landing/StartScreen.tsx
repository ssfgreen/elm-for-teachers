import { Link } from 'react-router-dom';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { StartPanel } from './StartPanel';
import { linkClass } from './styles';
import { useAccount } from './useAccount';

/**
 * `/start`, behind the front page's "Get started": every way in on one page. An invite code signs
 * a teacher up (on to /join/<code>), an access code opens a workspace, and a teacher who has
 * signed up signs in. Signed in, it offers the workspace instead. New ways in (more sign-in
 * providers) belong here, not on the front page.
 */
export function StartScreen() {
  const account = useAccount();
  return (
    <div className="min-h-screen bg-landing-page text-foreground-2">
      <header className="mx-auto flex h-18 w-full max-w-300 items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" className="whitespace-nowrap font-display text-lg text-foreground no-underline">
          ELM for teachers
        </Link>
        <ThemeSwitch />
      </header>
      <main className="mx-4 mt-12 mb-20 sm:mx-auto sm:max-w-176 max-md:mt-8">
        <h1 className="mb-0 font-display text-title font-normal text-foreground">Get started</h1>
        <p className="mt-3 text-lead">
          {account ? 'You are signed in.' : 'Use the code the research team gave you, or log in if you have signed up before.'}
        </p>
        <div className="mt-8 rounded-2xl bg-card p-6 shadow-soft sm:p-8">
          <StartPanel account={account} />
        </div>
        {account === null && (
          <p className="mt-6 text-md">
            Already signed up?{' '}
            <Link className={linkClass} to="/signin">
              Log in
            </Link>
          </p>
        )}
        <p className="mt-3 text-md">
          <Link className={linkClass} to="/">
            Back to the front page
          </Link>
        </p>
      </main>
    </div>
  );
}
