/**
 * The page and styles the Word download uses (client/src/export/docx.ts), in points. Keep the
 * two in step: the layout check measures against these.
 */

/** A4 (21 x 29.7 cm) less 2.54 cm margins all round. */
export const PAGE = { width: 451.3, height: 697.9 };

/** Editor pixels to points: the download writes a pixel as 15 twentieths of a point. */
export const PX = 0.75;
/** The text width of the page in editor pixels, as a table's colwidths line counts them. */
export const PAGE_PX = Math.round(PAGE.width / PX);

/** Body text: 12 pt at 1.15 lines, 8 pt after. */
export const BODY = { size: 12, multiple: 1.15, after: 8 };
/** List items are 4 pt apart, the last of a list 8 pt. */
export const ITEM_AFTER = 4;
/** Bullets and numbers: text starts 0.5 inch in. */
export const LIST_INDENT = 36;
/** Quotes: 0.25 inch in, with a border 8 pt from the text. */
export const QUOTE_INDENT = 28;

export const HEADINGS: Record<1 | 2 | 3, { size: number; before: number; after: number }> = {
  1: { size: 20, before: 18, after: 4 },
  2: { size: 16, before: 8, after: 4 },
  3: { size: 14, before: 8, after: 4 },
};

/** Table cells: single lines, no space between paragraphs, 0.08 inch padding left and right. */
export const CELL = { multiple: 1, padding: 10.8, border: 1 };

/** A picture's height when its size is not known (a drawing's usual 400 x 300 at 300 px wide). */
export const IMAGE_HEIGHT = 170;
