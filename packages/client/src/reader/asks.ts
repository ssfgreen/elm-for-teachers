/**
 * What a pupil may ask about in a reading (#236): the passage a range cuts from a block, whether
 * the page offers asks on it, and which of the reading's prompts show where. Pure.
 *
 * The passage is the block's reader text (shared `readerBlock`), sliced. The server reads each
 * block through `readerBlock` too (#247), so any passage the page cuts is found there: asks are
 * refused only on a passage too long or blank. server/src/reader-asks/passage.test.ts holds the
 * same rule as `offered` and checks every range of every block type: change both together.
 */
import { READER_HIGHLIGHT_MAX, readerBlock, type PupilPrompt } from '@edw/shared';

interface Block {
  id: string;
  type: string;
  content: string;
}

/** The words of `block` from `start` to `end`, as the page shows them. */
export const passageOf = (block: Block, start: number, end: number): string => readerBlock(block).text.slice(start, end);

/** Whether asks are offered on a passage, and if not, why: too long, or a part the server cannot find. */
export type Askable = { ok: true } | { ok: false; why: 'too_long' | 'not_here' };

/** `block` is kept for the caller (ReaderScreen); every block's passages are asked about alike. */
export function askable(_block: Block, passage: string): Askable {
  if (passage.trim().length > READER_HIGHLIGHT_MAX) return { ok: false, why: 'too_long' };
  if (passage.trim() === '') return { ok: false, why: 'not_here' };
  return { ok: true };
}

/** The reading's prompts ticked for a place, in the reading's order. */
export const promptsFor = (prompts: readonly PupilPrompt[], place: 'after_highlight' | 'follow_up'): PupilPrompt[] => prompts.filter((p) => p[place]);
