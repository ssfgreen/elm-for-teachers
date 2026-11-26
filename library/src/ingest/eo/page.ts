import { isCodeOnly } from '../../core/codes.js';
import type { PdfLine } from '../pdf/lines.js';
import { pairStatements, type Statement } from './columns.js';
import { joinWrapped, paragraphs, readingOrder } from './prose.js';

export interface Organiser {
  name: string;
  description: string;
  top: number;
  statements: Statement[];
  notes: string[];
}

export type PageContent =
  | { kind: 'prose'; paragraphs: string[] }
  | { kind: 'table'; area: string | null; intro: string[]; organisers: Organiser[]; footnotes: string[]; lost: string[][] };

const LEVEL_WORDS = new Set(['Early', 'First', 'Second', 'Third', 'Fourth', 'Senior phase']);
const ORGANISER_MIN_H = 11.5;
const AREA_MIN_H = 13;

export const stripContinued = (s: string) => s.replace(/\s*\(continued\)\s*$/i, '').trim();

/** The running footer (title and page number) on the bottom line of the page. */
function dropFooter(lines: PdfLine[]): PdfLine[] {
  if (lines.length === 0) return lines;
  const bottom = Math.min(...lines.map((l) => l.y));
  const footer = lines.filter((l) => l.y <= bottom + 2);
  if (bottom > 70 || !footer.some((l) => /experiences and outcomes/i.test(l.text) || /^\d+$/.test(l.text))) return lines;
  return lines.filter((l) => l.y > bottom + 2);
}

/** The row of level names that heads a table, if the page has one. The names sit a little unevenly. */
function headerRow(lines: PdfLine[]): { top: number; bottom: number; font: string } | null {
  const words = lines.filter((l) => LEVEL_WORDS.has(l.text));
  for (const w of words) {
    const row = words.filter((o) => Math.abs(o.y - w.y) <= 6);
    if (row.length >= 2) return { top: Math.max(...row.map((o) => o.y)), bottom: Math.min(...row.map((o) => o.y)), font: w.font };
  }
  return null;
}

/** Organiser names are bold like the level names, or set larger than the statements. */
const isOrganiserName = (line: PdfLine, headerFont: string) => line.font === headerFont || line.h >= ORGANISER_MIN_H;

function organisersOf(lines: PdfLine[], headerFont: string): Organiser[] {
  const out: Organiser[] = [];
  let prev: PdfLine | null = null;
  for (const line of [...lines].sort(readingOrder)) {
    const isName = isOrganiserName(line, headerFont);
    const current = out.at(-1);
    const continues = prev && prev.y - line.y <= prev.h * 1.8;
    if (isName && current && continues && isOrganiserName(prev!, headerFont)) current.name = joinWrapped(current.name, line.text);
    else if (isName || !current) out.push({ name: isName ? line.text : '', description: isName ? '' : line.text, top: line.y, statements: [], notes: [] });
    else current.description = joinWrapped(current.description, line.text);
    prev = line;
  }
  for (const o of out) {
    o.name = stripContinued(o.name);
    o.description = o.description.replace(/^\(continued\)\s*/i, '');
  }
  return out;
}

/** The organiser a thing at height `top` sits beside: the nearest one starting above it. */
function ownerOf(organisers: Organiser[], top: number): Organiser | null {
  let owner: Organiser | null = null;
  for (const o of organisers) if (o.top >= top - 6 && (!owner || o.top < owner.top)) owner = o;
  return owner;
}

/** Text above the first organiser on a page carries on the organiser from the page before. */
function ownerOrCarryOn(organisers: Organiser[], top: number): Organiser {
  const owner = ownerOf(organisers, top);
  if (owner) return owner;
  if (organisers[0]?.name !== '') organisers.unshift({ name: '', description: '', top: Infinity, statements: [], notes: [] });
  return organisers[0]!;
}

/** Splits one page of an experiences and outcomes PDF into its area, organisers and statements. */
export function readPage(all: PdfLine[]): PageContent {
  const lines = dropFooter(all);
  const header = headerRow(lines);
  if (header === null) return { kind: 'prose', paragraphs: paragraphs(lines, true) };

  const above = lines.filter((l) => l.y > header.top + 3);
  const areaLines = above.filter((l) => l.h >= AREA_MIN_H).sort(readingOrder);
  const area = areaLines.length > 0 ? stripContinued(areaLines.map((l) => l.text).join(' ')) : null;
  const intro = paragraphs(above.filter((l) => l.h < AREA_MIN_H));

  const below = lines.filter((l) => l.y < header.bottom - 3);
  const noteTop = Math.max(-Infinity, ...below.filter((l) => l.note).map((l) => l.y));
  const footnotes = paragraphs(below.filter((l) => l.y <= noteTop));
  const table = below.filter((l) => l.y > noteTop);

  const margin = Math.min(...table.map((l) => l.x));
  // Some tables have no organiser column: then statements start at the margin.
  const atMargin = table.filter((l) => l.x < margin + 40);
  const hasOrganisers = atMargin.some((l) => isOrganiserName(l, header.font));
  const organiserLines = hasOrganisers ? atMargin : [];
  const rest = hasOrganisers ? table.filter((l) => l.x >= margin + 40) : table;
  const organisers = organisersOf(organiserLines, header.font);
  const { statements, orphans, lost } = pairStatements(
    rest.filter((l) => !isCodeOnly(l.text)),
    rest.filter((l) => isCodeOnly(l.text)),
  );
  for (const s of statements) ownerOrCarryOn(organisers, s.top).statements.push(s);
  for (const o of orphans) ownerOrCarryOn(organisers, o.top).notes.push(o.text);
  return { kind: 'table', area, intro, organisers, footnotes, lost };
}
