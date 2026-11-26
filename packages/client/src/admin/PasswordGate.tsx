import { useState } from 'react';
import type { FormEvent } from 'react';
import { createAdminApi, savePassword } from '../api/admin';
import type { AdminMe } from '../api/admin';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

/** The one username /signin takes with the admin password: "admin", any case, spaces trimmed. */
export const isAdminUsername = (name: string) => name.trim().toLowerCase() === 'admin';

/**
 * The admin password form. AdminGate and /signin show it only where the server takes the password
 * (local, e2e and a Vercel preview, never production). One admin call checks it; an accepted
 * password is kept in sessionStorage for the tab, where AdminGate reads it on load.
 * `askUsername` (on /signin) adds a Username field, which must be "admin".
 */
export function PasswordForm({ onAccepted, askUsername = false }: { onAccepted: (password: string, me: AdminMe) => void; askUsername?: boolean }) {
  const [username, setUsername] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Never says which of the two was wrong.
  const refused = askUsername ? 'That username or password is not right.' : 'That password was not accepted.';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    // A wrong username is turned down here: the password is not sent.
    if (askUsername && !isAdminUsername(username)) {
      setError(refused);
      return;
    }
    setBusy(true);
    try {
      const me = await createAdminApi(draft).me();
      savePassword(draft);
      onAccepted(draft, me);
    } catch {
      setError(refused);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {askUsername && (
        <label className="flex flex-col gap-1.25 text-base text-foreground-2">
          <span>Username</span>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} />
        </label>
      )}
      <label className="flex flex-col gap-1.25 text-base text-foreground-2">
        <span>Password</span>
        <Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="current-password" />
      </label>
      {/* "Sign in", as the e2e tests click it; the providers' sign-ins are links, so no clash. */}
      <Button type="submit" disabled={busy || !draft || (askUsername && !username.trim())}>
        Sign in
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
