import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { pupilLogin } from './loginApi';
import { pupilErrorMessage } from './messages';

/**
 * "Username and password from your teacher" (#245): the login slip's two values, posted to
 * `POST /api/pupil/login` with the class code when the join screen has one. The fields are
 * uncontrolled and read only on submit, so neither value is ever in React state or an attribute
 * (a controlled input's value shows as its `value` attribute); they go only in the POST body.
 * A refusal says why, clears the password and keeps the username.
 */
export function PupilLoginForm({ code, submitLabel, onSignedIn, onRefused }: { code?: string; submitLabel: string; onSignedIn: () => void; onRefused?: () => void }) {
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Whether each field has something in it, for the button; never the values themselves.
  const [hasUsername, setHasUsername] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const username = usernameRef.current?.value ?? '';
    const password = passwordRef.current?.value ?? '';
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    const result = await pupilLogin(code === undefined ? { username, password } : { username, password, code });
    if ('ok' in result) {
      onSignedIn();
      return;
    }
    setBusy(false);
    if (passwordRef.current) passwordRef.current.value = '';
    setHasPassword(false);
    setError(pupilErrorMessage(result.refused));
    onRefused?.();
  };
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-foreground">Username and password from your teacher</h2>
      <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <label className="flex flex-col gap-1.25 text-base text-foreground-2">
          <span>Username</span>
          <Input
            ref={usernameRef}
            onChange={(e) => setHasUsername(e.target.value.trim() !== '')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1.25 text-base text-foreground-2">
          <span>Password</span>
          <Input
            ref={passwordRef}
            type="password"
            onChange={(e) => setHasPassword(e.target.value !== '')}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" variant="default" disabled={busy || !hasUsername || !hasPassword}>
          {submitLabel}
        </Button>
      </form>
    </div>
  );
}
