/**
 * Fonts that are not in Word. A Word file set in one shows it only where the reader has it
 * installed, so the download says so first (components/FontNotice.tsx), unless the teacher
 * asked not to be told again in this browser.
 */
import type { DocFont } from '@edw/shared';
import type { CanvasSnapshot } from '../editor/types.js';
import { readStore, writeStore } from '../lib/store';

export const NOT_IN_WORD: readonly DocFont[] = ['open_dyslexic'];

/** Where each can be had, free. */
export const FONT_SOURCES: Partial<Record<DocFont, string>> = { open_dyslexic: 'https://opendyslexic.org' };

/** The fonts not in Word that these docs use, for the whole doc or for some of its text. */
export function fontsNotInWord(snap: CanvasSnapshot, docIds: readonly string[]): DocFont[] {
  const ids = new Set(docIds);
  const docs = snap.docs.filter((d) => ids.has(d.id));
  // Suggestions not yet accepted are left out of the file, so they don't count.
  const blocks = snap.blocks.filter((b) => ids.has(b.doc_id) && b.status !== 'proposed');
  return NOT_IN_WORD.filter((f) => docs.some((d) => d.style?.font === f) || blocks.some((b) => b.content.includes(`data-font="${f}"`)));
}

const HIDDEN_KEY = 'edw-font-notice-hidden';

export const fontNoticeHidden = () => readStore(HIDDEN_KEY) === '1';
export const hideFontNotice = () => writeStore(HIDDEN_KEY, '1');
