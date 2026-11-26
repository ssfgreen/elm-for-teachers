import { useEffect, useState } from 'react';
import { listProviders, type SignInProvider } from '../../api/auth';

/** The sign-in providers set up on this server: null while loading, [] when none (or the call failed). */
export function useProviders(): SignInProvider[] | null {
  const [providers, setProviders] = useState<SignInProvider[] | null>(null);
  useEffect(() => {
    let live = true;
    listProviders()
      .then((p) => live && setProviders(p))
      .catch(() => live && setProviders([]));
    return () => {
      live = false;
    };
  }, []);
  return providers;
}
