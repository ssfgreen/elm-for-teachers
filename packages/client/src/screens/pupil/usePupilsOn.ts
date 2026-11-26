import { useEffect, useState } from 'react';
import { pupilProviders } from './pupilApi';

/**
 * Whether the who screen offers "I am a pupil": whenever the server has pupil sign-in on
 * (`PUPILS=on`), even with no provider set up, as a teacher's login needs none (#245). False while
 * loading and on any error, so the choice never shows on a site where pupils cannot sign in.
 */
export function usePupilsOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    pupilProviders()
      .then((p) => live && setOn(p !== 'off'))
      .catch(() => live && setOn(false));
    return () => {
      live = false;
    };
  }, []);
  return on;
}
