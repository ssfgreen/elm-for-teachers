import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { CodeField } from '../landing/CodeField';
import { pupilErrorMessage } from './messages';

/** What a pupil types: capitals, no spaces, at most a code's length with its hyphen. */
export const cleanClassCode = (typed: string): string => typed.toUpperCase().replace(/\s/g, '').slice(0, 9);

/** The letters and digits of what was typed: a whole code has 8. */
const codeLetters = (typed: string): string => typed.replace(/[^A-Z0-9]/gi, '').toUpperCase();

/** The code as the join screen shows and sends it, `ABCD-EFGH`, or null until all 8 are typed. */
export function wholeClassCode(typed: string): string | null {
  const s = codeLetters(typed);
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

/** A signed-in pupil with no class types their code here. */
export function JoinClass({ join }: { join: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const refused = await join(code);
    setBusy(false);
    setError(refused ? pupilErrorMessage(refused) : null);
  };
  return (
    <form className="mb-4 flex flex-col gap-2" onSubmit={(e) => void submit(e)}>
      <p>Join your class with the code your teacher gave you.</p>
      <CodeField label="Class code" value={code} onChange={setCode} clean={cleanClassCode} error={error} errorId="join-error" />
      {error && (
        <p id="join-error" role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="default" disabled={busy || !code.trim()}>
        Join class
      </Button>
    </form>
  );
}
