import { Navigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ReadingList } from '../../reader/ReadingList';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { gateClass } from '../landing/styles';
import { JoinClass } from './ClassCode';
import { usePupil } from './usePupil';

/** Reasons about the class code: the pupil goes back to the join screen to type it again. */
const CODE_REASONS = new Set(['code_needed', 'code_unknown', 'class_archived', 'too_many_codes', 'feature_off']);

/**
 * Where signed-out /r sends a pupil (#245): code trouble to /r/join, anything else to /r/login,
 * each with the reason; with none, /r/login. The server still sends every failure to `/r?error=`.
 */
export function pupilErrorPage(reason: string | null): string {
  if (!reason) return '/r/login';
  const to = CODE_REASONS.has(reason) ? '/r/join' : '/r/login';
  return `${to}?error=${encodeURIComponent(reason)}`;
}

/**
 * `/r`: the signed-in pupil's page (issue #179), apart from the teachers' /signin. It says who
 * they are in their class ("You are Pupil 3 in 8B"), or lets them type a code. Signed out, it
 * sends them on to /r/join or /r/login (#245), where they sign up or log in.
 */
export function PupilScreen() {
  const [params] = useSearchParams();
  const { pupil, signedOut, signOutFailed, signOut, join } = usePupil();
  if (pupil === null) return <Navigate to={signedOut ? '/r/login?signed_out=1' : pupilErrorPage(params.get('error'))} replace />;
  return (
    <>
      <ThemeSwitch className="fixed top-4 right-4" />
      <main className={gateClass}>
        {pupil === undefined ? (
          <p>Loading…</p>
        ) : (
          <>
            {pupil.classes.length ? (
              <>
                {pupil.classes.map((c) => (
                  <h1 key={c.class_id} className="text-foreground">
                    You are {c.label} in {c.class_name}
                  </h1>
                ))}
                <ReadingList />
              </>
            ) : (
              <>
                <h1 className="text-foreground">You are signed in</h1>
                <JoinClass join={join} />
              </>
            )}
            {signOutFailed && (
              <p role="alert" className="mb-3 text-destructive">
                Signing out did not work. Please try again.
              </p>
            )}
            <Button variant="default" onClick={() => void signOut()}>
              Sign out
            </Button>
          </>
        )}
      </main>
    </>
  );
}
