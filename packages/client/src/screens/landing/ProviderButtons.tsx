import { useEffect, useRef } from 'react';
import type { SignInProvider } from '../../api/auth';
import { endpoints } from '../../api/endpoints';
import { Button } from '../../components/ui/button';

/**
 * One link per sign-in provider, "Continue with Google", to the server's start route (a full page
 * load: the provider's page follows). With an invite, the start route claims it on the way back.
 */
export function ProviderButtons({
  providers,
  invite,
  focusFirst = false,
}: {
  providers: SignInProvider[] | null;
  invite?: string;
  focusFirst?: boolean;
}) {
  const first = useRef<HTMLAnchorElement>(null);
  const loaded = providers !== null && providers.length > 0;
  useEffect(() => {
    if (focusFirst && loaded) first.current?.focus();
  }, [focusFirst, loaded]);

  if (providers === null) return <p>Loading…</p>;
  if (providers.length === 0) return <p>Sign-in is not set up here yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {providers.map((p, i) => (
        <Button key={p.id} asChild variant="default">
          <a ref={i === 0 ? first : undefined} href={endpoints.authStart(p.id, invite || undefined)}>
            Continue with {p.label}
          </a>
        </Button>
      ))}
    </div>
  );
}
