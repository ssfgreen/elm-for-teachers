/**
 * Asks before a Word download whose docs use a font Word lacks (export/fontNotice.ts). `confirm`
 * resolves true at once when there is nothing to say, or when the teacher hid the notice;
 * otherwise once they answer the dialog (`asking`, drawn by components/FontNotice.tsx).
 */
import { useCallback, useState } from 'react';
import type { DocFont } from '@edw/shared';
import type { CanvasSnapshot } from '../editor/types.js';
import { fontNoticeHidden, fontsNotInWord, hideFontNotice } from '../export/fontNotice';

export interface FontQuestion {
  fonts: DocFont[];
  answer: (download: boolean, hideFromNowOn: boolean) => void;
}

export function useFontNotice() {
  const [asking, setAsking] = useState<FontQuestion | null>(null);
  const confirm = useCallback((snap: CanvasSnapshot, docIds: readonly string[]): Promise<boolean> => {
    const fonts = fontsNotInWord(snap, docIds);
    if (fonts.length === 0 || fontNoticeHidden()) return Promise.resolve(true);
    return new Promise((resolve) => {
      setAsking({
        fonts,
        answer: (download, hideFromNowOn) => {
          if (download && hideFromNowOn) hideFontNotice();
          setAsking(null);
          resolve(download);
        },
      });
    });
  }, []);
  return { asking, confirm };
}
