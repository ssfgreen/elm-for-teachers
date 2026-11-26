import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { openByAccessCode } from '../../api/auth';
import { ApiError } from '../../api/http';
import { Button } from '../../components/ui/button';
import { CodeField } from './CodeField';
import { accessErrorMessage, cleanAccessCode } from './codes';

/** "Have an access code?": the code opens its workspace at /s/<token>. */
export function AccessCodeForm() {
  const navigate = useNavigate();
  const field = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const headingId = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token } = await openByAccessCode(code);
      navigate(`/s/${encodeURIComponent(token)}`);
    } catch (err) {
      setError(accessErrorMessage(err instanceof ApiError ? err.status : null));
      setBusy(false);
      field.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-foreground">Have an access code?</h2>
      <CodeField ref={field} label="Access code" value={code} onChange={setCode} clean={cleanAccessCode} error={error} errorId={errorId} />
      <Button type="submit" variant="ghost" disabled={busy || !code} className="max-md:h-11">
        {busy ? 'Opening…' : 'Open workspace'}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
