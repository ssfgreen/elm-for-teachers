import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { SignInProvider } from '../../api/auth';
import { Button } from '../../components/ui/button';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { gateClass } from '../landing/styles';
import { pupilStartUrl } from './pupilApi';
import { usePupilSignIn } from './usePupil';

/**
 * The frame of /r/join and /r/login (#245): a pupil already signed in is sent to /r; with pupil
 * sign-in off the page says so and offers nothing. Calls only the pupil routes, sends no events.
 */
export function SignInFrame({ title, children }: { title: string; children: (providers: SignInProvider[]) => ReactNode }) {
  const { pupil, providers } = usePupilSignIn();
  if (pupil) return <Navigate to="/r" replace />;
  return (
    <>
      <ThemeSwitch className="fixed top-4 right-4" />
      <main className={gateClass}>
        <h1 className="text-foreground">{title}</h1>
        {pupil === undefined || providers === null ? (
          <p>Loading…</p>
        ) : providers === 'off' ? (
          <p>Pupil sign-in is switched off here.</p>
        ) : (
          children(providers)
        )}
      </main>
    </>
  );
}

/** "Continue with …" for each provider, with the class code on the join screen (none on the login screen). */
export function ProviderLinks({ providers, code = '' }: { providers: SignInProvider[]; code?: string }) {
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {providers.map((p) => (
        <Button key={p.id} asChild variant="default">
          <a href={pupilStartUrl(p.id, code)}>Continue with {p.label}</a>
        </Button>
      ))}
      <p className="text-sm">Use your school account.</p>
    </div>
  );
}
