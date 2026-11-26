import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { CodeField } from './CodeField';
import { cleanCode } from './codes';
import { ProviderButtons } from './ProviderButtons';
import { gateClass, linkClass } from './styles';
import { useProviders } from './useProviders';

/** `/join/:code`: the invite code filled in, then one button per provider. */
export function JoinScreen() {
  const params = useParams<{ code: string }>();
  const [code, setCode] = useState(() => cleanCode(params.code ?? ''));
  const providers = useProviders();
  return (
    <>
      <ThemeSwitch className="fixed top-4 right-4" />
      <main className={gateClass}>
        <h1 className="text-foreground">Sign up with your invite code</h1>
        <div className="flex flex-col gap-3">
          <CodeField label="Invite code" value={code} onChange={setCode} clean={cleanCode} />
          <ProviderButtons providers={providers} invite={code} />
        </div>
        <p className="mt-4">
          <Link className={linkClass} to="/start">
            Go back
          </Link>
        </p>
      </main>
    </>
  );
}
