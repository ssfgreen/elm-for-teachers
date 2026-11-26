/**
 * Whether the pupil signed in on /r is a teacher's test pupil (#215), and "Back to teacher": sign
 * the test pupil out, then close the tab. A tab the browser will not let a page close stays open
 * and says so. Asks /me only on the pupil pages (`onPupilPage`), once each time they are entered.
 */
import { useCallback, useEffect, useState } from 'react';
import { currentPupil, signOutPupil } from './pupilApi';

export type BackState = 'idle' | 'busy' | 'failed' | 'signed_out';

export interface TestPupilState {
  /** True only once /me said this is a test pupil. */
  test: boolean;
  back: BackState;
  goBack: () => Promise<void>;
}

export function useTestPupil(onPupilPage: boolean, closeTab: () => void = () => window.close()): TestPupilState {
  const [test, setTest] = useState(false);
  const [back, setBack] = useState<BackState>('idle');
  useEffect(() => {
    if (!onPupilPage) return;
    let live = true;
    currentPupil()
      .then((p) => live && setTest(p?.test === true))
      .catch(() => live && setTest(false));
    return () => {
      live = false;
    };
  }, [onPupilPage]);
  const goBack = useCallback(async () => {
    setBack('busy');
    try {
      await signOutPupil();
    } catch {
      setBack('failed');
      return;
    }
    setBack('signed_out');
    closeTab();
  }, [closeTab]);
  return { test, back, goBack };
}
