/**
 * The header colour of each table in a Word file. mammoth leaves cell shading out, so a table's
 * coloured header row (written by the download as a light tint of its colour, wordHeaderFill)
 * came back uncoloured. This reads the first row's shading from the file itself, for each
 * table in the body in order; a fill that is not one of the tints (Word's grey, a teacher's own
 * shade) is no colour.
 */
import type JSZip from 'jszip';
import { TEXT_COLORS, wordHeaderFill, type TextColor } from '../editor/textColors.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FILLS = new Map(TEXT_COLORS.map((c) => [wordHeaderFill(c), c]));
const kid = (el: Element | null | undefined, name: string) => (el ? (Array.from(el.children).find((c) => c.localName === name) ?? null) : null);

/** Each body-level table's header colour, in order; null when the file cannot be read. */
export async function tableHeaderColours(zip: JSZip): Promise<Array<TextColor | null> | null> {
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return null;
  const body = kid(new DOMParser().parseFromString(xml, 'application/xml').documentElement, 'body');
  if (!body) return null;
  return Array.from(body.children)
    .filter((el) => el.localName === 'tbl')
    .map((tbl) => {
      const shd = kid(kid(kid(kid(tbl, 'tr'), 'tc'), 'tcPr'), 'shd');
      const fill = (shd?.getAttributeNS(W, 'fill') ?? shd?.getAttribute('w:fill') ?? '').toUpperCase();
      return FILLS.get(fill) ?? null;
    });
}

/** A table block's content with its header colour line, when it has a header row and a colour. */
export function withHeaderColour(content: string, colour: TextColor | null): string {
  if (!colour || !/^\|?\s*:?-{3,}/m.test(content) || /<!--\s*header:/.test(content)) return content;
  return `${content}\n<!-- header: ${colour} -->`;
}
