/**
 * Writing lines (`<line/>`, editor/extensions/writingLine.ts) in the Word file: a tab, in a
 * paragraph with a right tab stop at the right margin whose leader is an underline. Word draws
 * the leader from where the tab sits to the margin, in any font, so a line after text fills the
 * rest of that line and a line of its own runs the full width. Tab stops are measured from the
 * page margin, so the same stop works in a list item. An upload reads them back
 * (import/writingLines.ts).
 */
import { LeaderType, Tab, TabStopType, TextRun } from 'docx';
import type { Node } from '@tiptap/pm/model';

/** The right margin, in twentieths of a point from the left one: A4 less 2.54 cm margins (as A4 in docx.ts). */
export const LINE_STOP = 11906 - 2 * 1440;

export const isWritingLine = (n: Node) => n.type.name === 'writingLine';

/** The run a writing line is written as. */
export const lineRun = () => new TextRun({ children: [new Tab()] });

/** Paragraph options for a textblock: the tab stop its writing lines run to, when it has any. */
export function lineStops(block: Node | null | undefined): { tabStops?: Array<{ type: (typeof TabStopType)[keyof typeof TabStopType]; position: number; leader: (typeof LeaderType)[keyof typeof LeaderType] }> } {
  let found = false;
  block?.forEach((n) => {
    if (isWritingLine(n)) found = true;
  });
  return found ? { tabStops: [{ type: TabStopType.RIGHT, position: LINE_STOP, leader: LeaderType.UNDERSCORE }] } : {};
}
