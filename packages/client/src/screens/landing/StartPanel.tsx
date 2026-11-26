import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { AccessCodeForm } from './AccessCodeForm';
import { CodeField } from './CodeField';
import { cleanCode } from './codes';
import type { SignedInAccount } from '../../api/auth';

/**
 * The way in: the workspace when signed in (an admin goes on to /admin from its Dashboard row), otherwise the invite and access code
 * forms side by side. Nothing while the account is still loading.
 */
export function StartPanel({ account }: { account: SignedInAccount | null | undefined }) {
  if (account === undefined) return null;
  if (account) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="primary" className="max-md:h-11">
          <Link to="/w">Open your workspace</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <InviteForm />
      <AccessCodeForm />
    </div>
  );
}

/** "Have an invite code?": goes on to /join/<code>, where the providers are. */
function InviteForm() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const headingId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code) navigate(`/join/${encodeURIComponent(code)}`);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-foreground">Have an invite code?</h2>
      <CodeField label="Invite code" value={code} onChange={setCode} clean={cleanCode} autoFocus />
      <Button type="submit" variant="primary" disabled={!code} className="max-md:h-11">
        Sign up
      </Button>
    </form>
  );
}
