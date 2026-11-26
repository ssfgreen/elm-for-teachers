import { useCallback, useEffect, useState } from 'react';
import type { SignInProvider } from '../../api/auth';
import { currentPupil, joinClass, pupilProviders, signOutPupil, type SignedInPupil } from './pupilApi';

export interface PupilState {
  /** undefined while loading; null when no pupil is signed in. */
  pupil: SignedInPupil | null | undefined;
  signedOut: boolean;
  /** Signing out failed (the pupil is still signed in): the page says so. */
  signOutFailed: boolean;
  signOut: () => Promise<void>;
  /** A signed-in pupil types a class code: null when they joined, else the reason code it was refused. */
  join: (code: string) => Promise<string | null>;
}

/** null while loading; 'off' when the server has pupil sign-in off; [] when none is set up (or the call failed). */
export type PupilProviders = SignInProvider[] | 'off' | null;

/** The signed-in pupil, loaded once: undefined while loading, null when none (or the call failed). */
function useCurrentPupil() {
  const [pupil, setPupil] = useState<SignedInPupil | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    currentPupil()
      .then((p) => live && setPupil(p))
      .catch(() => live && setPupil(null));
    return () => {
      live = false;
    };
  }, []);
  return [pupil, setPupil] as const;
}

/**
 * For /r/join and /r/login (#245): whether a pupil is already signed in in this browser (they are
 * sent on to /r), and which providers to offer.
 */
export function usePupilSignIn(): { pupil: SignedInPupil | null | undefined; providers: PupilProviders } {
  const [pupil] = useCurrentPupil();
  const [providers, setProviders] = useState<PupilProviders>(null);
  useEffect(() => {
    let live = true;
    pupilProviders()
      .then((p) => live && setProviders(p))
      .catch(() => live && setProviders([]));
    return () => {
      live = false;
    };
  }, []);
  return { pupil, providers };
}

/** Who is signed in on the pupil page, /r. */
export function usePupil(): PupilState {
  const [pupil, setPupil] = useCurrentPupil();
  const [signedOut, setSignedOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOut = useCallback(async () => {
    try {
      await signOutPupil();
    } catch {
      setSignOutFailed(true);
      return;
    }
    setSignOutFailed(false);
    setPupil(null);
    setSignedOut(true);
  }, [setPupil]);
  const join = useCallback(async (code: string) => {
    const result = await joinClass(code);
    if ('refused' in result) return result.refused;
    const joined = result.joined;
    setPupil((p) => (p ? { ...p, classes: [...p.classes.filter((c) => c.class_id !== joined.class_id), joined] } : p));
    return null;
  }, [setPupil]);
  return { pupil, signedOut, signOutFailed, signOut, join };
}
