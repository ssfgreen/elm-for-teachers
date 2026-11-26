import type { PdfLine } from '../pdf/lines.js';

/** Joins two wrapped lines: a word broken with a hyphen stays joined. */
export function joinWrapped(a: string, b: string): string {
  if (a.length === 0) return b;
  if (/[a-z]-$/.test(a) && /^[a-z]/.test(b)) return `${a}${b}`;
  return `${a} ${b}`;
}

/** Top to bottom, then left to right. */
export const readingOrder = (a: PdfLine, b: PdfLine) => b.y - a.y || a.x - b.x;

const headingLevel = (line: PdfLine) => (line.h >= 13 ? '## ' : line.h >= 11.5 ? '### ' : '');

/**
 * Lines of running text as markdown paragraphs, one per line: a bullet starts a list item,
 * a wrapped line joins the one above, and a gap or a step left starts a new paragraph.
 * With `headings`, larger type becomes a markdown heading.
 */
export function paragraphs(lines: PdfLine[], headings = false): string[] {
  const out: string[] = [];
  let text = '';
  let prev: PdfLine | null = null;
  let bulletX = -1;
  const flush = () => {
    if (text.trim().length > 0) out.push(text.trim());
    text = '';
  };
  for (const line of [...lines].sort(readingOrder)) {
    const bullet = /^[•●▪–-]\s*/.exec(line.text);
    const gap = prev ? prev.y - line.y : 0;
    const level = headings ? headingLevel(line) : '';
    const sameKind = !prev || !headings || headingLevel(prev) === level;
    const wrapped = prev && sameKind && gap <= line.h * 1.6 && gap > 0 && (Math.abs(line.x - prev.x) < 8 || (bulletX >= 0 && line.x > bulletX));
    if (line.note) {
      flush();
      text = `Note ${line.note}: ${line.text}`;
      bulletX = -1;
    } else if (bullet && line.text.startsWith('•')) {
      flush();
      text = `- ${line.text.slice(bullet[0].length)}`;
      bulletX = line.x;
    } else if (wrapped) {
      text = joinWrapped(text, line.text);
    } else {
      flush();
      text = `${level}${line.text}`;
      bulletX = -1;
    }
    prev = line;
  }
  flush();
  return out;
}
