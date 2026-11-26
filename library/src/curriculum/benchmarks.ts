/**
 * Benchmarks from Education Scotland's benchmark PDFs. Each level is a table of three columns:
 * the curriculum organiser, the experiences and outcomes (with their codes) and the benchmarks
 * (bullets). A benchmark belongs to its row, so to the codes in that row's middle column: the
 * documents do not tie a bullet to one code. Columns are found per page, as the documents differ:
 * the organiser column is at the page's left margin, the benchmarks start at the bullets.
 * Pure, so it is tested on items saved from the PDFs.
 */
import type { PdfItem } from '../ingest/pdf/lines.js';
import type { Benchmark, Level } from './types.js';

const LEVEL_RE = /^(?:Benchmarks\s*[–-]\s*)?(Early|First|Second|Third|Fourth)\s+[Ll]evel\b(?:\s*[–-]\s*(.+))?/;
const BULLET_RE = /^[•●]$/;
const CODE_RE = /[A-Z]{2,5} [0-4]-\d{2}[a-z]?/g;
const isBold = (font: string, boldFonts: ReadonlySet<string>) => boldFonts.has(font);

interface Row {
  level: Level;
  section: string | null;
  organiser: string;
  codes: string[];
  bullets: string[];
}

/** Items on one line (within 2 points), left to right, as one string. */
function lines(items: PdfItem[]): { y: number; x: number; text: string; bold: boolean }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: { y: number; x: number; text: string; bold: boolean; fonts: string[] }[] = [];
  for (const it of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.y - it.y) <= 2) {
      last.text = `${last.text}${/^[;,.)]/.test(it.str) || last.text.endsWith('(') ? '' : ' '}${it.str.trim()}`;
      last.fonts.push(it.font);
    } else out.push({ y: it.y, x: it.x, text: it.str.trim(), bold: false, fonts: [it.font] });
  }
  return out.map(({ fonts, ...l }) => ({ ...l, bold: fonts[0] === '__bold__' }));
}

/** The fonts used for bold: those of the table's header row ("Curriculum organisers"). */
function boldFontsOf(pages: PdfItem[][]): Set<string> {
  const fonts = new Set<string>();
  for (const p of pages) for (const it of p) if (/^Curriculum$|^Benchmarks|^Experiences/.test(it.str.trim())) fonts.add(it.font);
  return fonts;
}

/**
 * The benchmarks of the levels wanted, from a benchmark PDF's pages (items with text, as
 * extractPdfItems gives them). `area` is the curriculum area's name.
 */
export function parseBenchmarks(pages: PdfItem[][], area: string, levels: readonly Level[], columns: Columns = 'margin'): Benchmark[] {
  const bold = boldFontsOf(pages);
  const rows: Row[] = [];
  let level: Level | null = null;
  let section: string | null = null;
  let bulletX: number | null = null;
  /** The organiser column's left edge and the outcomes column's, from the table's header row (kept across pages). */
  let col1Left: number | null = null;
  let col2Left: number | null = null;

  for (const raw of pages) {
    // Footnotes (smaller type at the foot of the page) and stray marks are not content.
    const items = raw.filter((i) => i.str.trim() && i.str.trim() !== '`' && i.y > 50 && !(i.y < 100 && i.h < 10.5));
    // A page can name its level twice ("Second level Literacy and English", "Second level – Reading"): the one with a section wins.
    const headers = items.filter((i) => i.y > 480 && LEVEL_RE.test(i.str.trim()) && isBold(i.font, bold));
    const header = headers.find((i) => LEVEL_RE.exec(i.str.trim())![2]) ?? headers[0];
    if (header) {
      const m = LEVEL_RE.exec(header.str.trim())!;
      level = m[1]!.toLowerCase() as Level;
      section = m[2]?.trim() ?? null;
    }
    if (!level) continue;
    // The table header row and anything above it are not content.
    const curriculum = items.find((i) => /^Curriculum$/.test(i.str.trim()) && isBold(i.font, bold));
    const experiences = items.find((i) => /^Experiences/.test(i.str.trim()) && isBold(i.font, bold));
    if (curriculum) col1Left = curriculum.x - 30;
    if (experiences) col2Left = experiences.x - 25;
    const tableTop = curriculum?.y;
    const body = items.filter((i) => (tableTop === undefined ? !headers.includes(i) : i.y < tableTop - 20) && !(header && i.y >= header.y - 2));
    // Outcomes can have bullets too: the benchmarks' are the rightmost.
    const bulletXs = body.filter((i) => BULLET_RE.test(i.str.trim())).map((b) => b.x);
    if (bulletXs.length) bulletX = Math.min(...bulletXs.filter((x) => x >= Math.max(...bulletXs) - 20));
    if (bulletX === null) continue;
    let col1: PdfItem[];
    let col2: PdfItem[];
    if (columns === 'header') {
      if (col1Left === null || col2Left === null) continue;
      col1 = body.filter((i) => i.x >= col1Left! && i.x < col2Left!);
      col2 = body.filter((i) => i.x >= col2Left! && i.x < bulletX! - 2);
    } else {
      // The organiser column at the page's left margin (side labels further left are skipped).
      const textXs = body.filter((i) => i.x > 64).map((i) => i.x);
      if (!textXs.length) continue;
      const left = Math.min(...textXs);
      col1 = body.filter((i) => i.x >= 64 && i.x < left + 15);
      col2 = body.filter((i) => i.x >= left + 15 && i.x < bulletX! - 2);
    }
    const col3 = body.filter((i) => i.x >= bulletX! - 2);

    // Organiser blocks: a bold line after a plain one (or a gap) starts the next.
    const starts: { y: number; name: string }[] = [];
    let prevBold = false;
    let prevY = Infinity;
    for (const l of lines(col1.map((i) => ({ ...i, font: isBold(i.font, bold) ? '__bold__' : i.font })))) {
      if (l.bold && (!prevBold || prevY - l.y > 16)) starts.push({ y: l.y, name: l.text });
      else if (l.bold && starts.length) starts.at(-1)!.name = `${starts.at(-1)!.name} ${l.text}`;
      prevBold = l.bold;
      prevY = l.y;
    }
    const pageRows: { top: number; row: Row }[] = [];
    const current = rows.at(-1);
    // Content above the first organiser on the page continues the last row.
    if (current && current.level === level && !header) pageRows.push({ top: Infinity, row: current });
    for (const s of starts) {
      const row: Row = { level, section, organiser: organiserName(s.name), codes: [], bullets: [] };
      rows.push(row);
      pageRows.push({ top: s.y + 6, row });
    }
    if (!pageRows.length) continue;
    const rowAt = (y: number) => [...pageRows].reverse().find((r) => y <= r.top)?.row ?? pageRows[0]!.row;

    for (const i of col2) for (const code of i.str.match(CODE_RE) ?? []) {
      const r = rowAt(i.y);
      if (!r.codes.includes(code)) r.codes.push(code);
    }
    // A bullet glyph starts a benchmark; the lines after it, to the next, are its text.
    let open: { row: Row; index: number } | null = null;
    for (const l of lines(col3)) {
      const r = rowAt(l.y);
      if (BULLET_RE.test(l.text.slice(0, 1))) {
        const text = l.text.slice(1).trim();
        r.bullets.push(text);
        open = { row: r, index: r.bullets.length - 1 };
      } else if (open && open.row === r) {
        r.bullets[open.index] = `${r.bullets[open.index]} ${l.text}`.trim();
      } else if (r.bullets.length) {
        r.bullets[r.bullets.length - 1] = `${r.bullets.at(-1)} ${l.text}`.trim();
      }
    }
  }

  const out: Benchmark[] = [];
  for (const r of rows) {
    if (!levels.includes(r.level)) continue;
    for (const text of r.bullets.map(tidy).filter(Boolean)) {
      out.push({ id: '', area, level: r.level, section: r.section, organiser: r.organiser, codes: r.codes, text });
    }
  }
  return out.map((b, n) => ({ ...b, id: `bm-${slug(area)}-${b.level}-${String(n + 1).padStart(3, '0')}` }));
}

/** The organiser's name, without the description the document runs on after a dash. */
const organiserName = (s: string) => s.replace(/\s+/g, ' ').split(/\s[-–](\s|$)/)[0]!.trim();
/**
 * How the columns are found. `margin`: the organisers at the page's left margin. `header`: from
 * the table's header row ("Curriculum organisers", "Experiences and outcomes"), for documents whose
 * organisers sit further left. The documents differ, so the build tries both (`bestOf`).
 */
export type Columns = 'margin' | 'header';

/** Of the ways of reading a document, the one that ties benchmarks to the most of the area's codes. */
export function bestOf(pages: PdfItem[][], area: string, levels: readonly Level[]): Benchmark[] {
  const tries = (['margin', 'header'] as const).map((c) => parseBenchmarks(pages, area, levels, c));
  const score = (bs: Benchmark[]) => new Set(bs.flatMap((b) => b.codes)).size * 1000 + bs.length;
  return tries.reduce((a, b) => (score(b) > score(a) ? b : a));
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([;,.:])/g, '$1').trim();
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
