import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { CodeField } from '../landing/CodeField';
import { linkClass } from '../landing/styles';
import { cleanClassCode, wholeClassCode } from './ClassCode';
import { pupilErrorMessage } from './messages';
import { PupilLoginForm } from './PasswordForm';
import { ProviderLinks, SignInFrame } from './SignInFrame';

/**
 * `/r/join`, "Sign up" (#245): a new pupil types their class code, then signs in with a provider
 * or with the username and password their teacher gave them. The code lives only in this screen's
 * state: it leaves in the provider start link and the login's POST body, never in storage or the
 * page's URL, so a reload asks for it again. `?error=` (from /r) says why the last try failed.
 */
export function PupilJoinScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const error = pupilErrorMessage(params.get('error'));
  // The last try's reason is spent once the pupil moves on: it does not come back after Change.
  const clearError = () => {
    if (params.has('error')) setParams({}, { replace: true });
  };
  return (
    <SignInFrame title="Sign up">
      {(providers) => (
        <>
          {code === null ? (
            <CodeStep
              typed={typed}
              setTyped={setTyped}
              error={error}
              onNext={(c) => {
                clearError();
                setCode(c);
              }}
            />
          ) : (
            <div className="flex flex-col gap-4 text-left">
              <CodeChosen code={code} onChange={() => setCode(null)} />
              <ProviderLinks providers={providers} code={code} />
              <PupilLoginForm code={code} submitLabel="Sign up" onSignedIn={() => navigate('/r', { replace: true })} />
            </div>
          )}
          <p className="mt-4 text-sm">
            Been here before?{' '}
            <Link className={linkClass} to="/r/login">
              Log in
            </Link>
          </p>
        </>
      )}
    </SignInFrame>
  );
}

/** Step 1: "Class code" and Next, which waits for all 8 letters or digits. */
function CodeStep({ typed, setTyped, error, onNext }: { typed: string; setTyped: (t: string) => void; error: string | null; onNext: (code: string) => void }) {
  const whole = wholeClassCode(typed);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (whole) onNext(whole);
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      {error && (
        <p id="join-code-error" role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <CodeField label="Class code" value={typed} onChange={setTyped} clean={cleanClassCode} error={error} errorId="join-code-error" autoFocus />
      <p className="text-sm">Type the code your teacher gave you.</p>
      <Button type="submit" variant="default" disabled={!whole}>
        Next
      </Button>
    </form>
  );
}

/** Step 2's first line: the code, with Change to go back and type it again (what was typed is kept). */
function CodeChosen({ code, onChange }: { code: string; onChange: () => void }) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus(), []);
  return (
    <p ref={line} tabIndex={-1} className="flex items-center justify-between gap-3 outline-none">
      <span>Class code {code}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onChange}>
        Change
      </Button>
    </p>
  );
}
