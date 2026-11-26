/** A run of text on a PDF page, as pdf.js gives it. y grows up the page. */
export interface PdfItem {
  x: number;
  y: number;
  w: number;
  h: number;
  str: string;
  font: string;
}

/** Items on one baseline, joined. `note` is set when the line starts a footnote with that number. */
export interface PdfLine {
  x: number;
  y: number;
  right: number;
  h: number;
  font: string;
  text: string;
  note?: string;
}

const SAME_BASELINE = 2;
const MAX_GAP = 6;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

const joinText = (a: string, b: string, gap: number) => (gap < 1 || /^[.,;:)’'”]/.test(b) || /[(‘“]$/.test(a) ? `${a}${b}` : `${a} ${b}`);

/**
 * Joins items into lines in stream order, which pdf.js keeps column by column. Small digits
 * raised above the text (footnote marks) are dropped, except that a mark at the start of a
 * line marks that line as a footnote.
 */
export function groupLines(items: PdfItem[]): PdfLine[] {
  const visible = items.filter((i) => i.str.trim().length > 0);
  const body = median(visible.map((i) => i.h));
  const lines: PdfLine[] = [];
  let current: PdfLine | null = null;
  let mark: PdfItem | null = null;

  for (const item of visible) {
    // Symbol-font bullets come out as private-use characters.
    const str = item.str.replace(/[\uE000-\uF8FF]/g, '•').replace(/\s+/g, ' ');
    if (/^\d{1,2}$/.test(str.trim()) && item.h < body * 0.75) {
      const followsText = current && Math.abs(item.x - current.right) < 4 && item.y >= current.y - 1 && item.y - current.y < body;
      mark = followsText ? null : item;
      continue;
    }
    const gap = current ? item.x - current.right : Infinity;
    const afterBullet = current?.text === '•' && gap <= 30;
    if (current && Math.abs(item.y - current.y) <= SAME_BASELINE && gap > -2 && (gap <= MAX_GAP || afterBullet)) {
      current.text = joinText(current.text, str.trim(), gap);
      current.right = item.x + item.w;
      mark = null;
      continue;
    }
    current = { x: item.x, y: item.y, right: item.x + item.w, h: item.h, font: item.font, text: str.trim() };
    if (mark && item.x - mark.x < 12 && item.x >= mark.x && mark.y - item.y >= 0 && mark.y - item.y < body) current.note = mark.str.trim();
    mark = null;
    lines.push(current);
  }
  return mergeFragments(attachStrayPunctuation(lines));
}

/**
 * pdf.js sometimes splits a justified line, leaving a word or two (`as`, `to`) as a line of
 * its own just right of the rest. Such a fragment starts where no other line starts, so it
 * is not a column; it goes back on the end of the line it follows.
 */
function mergeFragments(lines: PdfLine[]): PdfLine[] {
  const startsNear = (x: number) => lines.filter((l) => Math.abs(l.x - x) <= 3).length;
  const merged = new Set<PdfLine>();
  for (const frag of lines) {
    if (startsNear(frag.x) > 1) continue;
    const host = lines.find(
      (l) => l !== frag && !merged.has(l) && Math.abs(l.y - frag.y) <= 1 && frag.x - l.right >= -2 && frag.x - l.right <= 15 && Math.abs(l.h - frag.h) < 1,
    );
    if (!host) continue;
    host.text = `${host.text} ${frag.text}`;
    host.right = frag.right;
    merged.add(frag);
  }
  return lines.filter((l) => !merged.has(l));
}

/** A full stop that pdf.js put out of order goes back on the end of the line it sits after. */
function attachStrayPunctuation(lines: PdfLine[]): PdfLine[] {
  const out: PdfLine[] = [];
  for (const line of lines) {
    if (/^[.,;:]$/.test(line.text)) {
      const host = lines.find((l) => l !== line && Math.abs(l.y - line.y) <= SAME_BASELINE && line.x - l.right > -2 && line.x - l.right < 8);
      if (host) {
        host.text += line.text;
        host.right = line.right;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}
