import { compareCodes, parseCode } from '../../core/codes.js';
import type { Statement } from './columns.js';
import type { Organiser, PageContent } from './page.js';

export interface Area {
  name: string;
  intro: string[];
  organisers: Organiser[];
}

export interface EoDocument {
  intro: string[];
  areas: Area[];
  /** Pages of running text after the tables, such as explanations. */
  appendix: string[];
  footnotes: string[];
  /** Codes found with no statement above them: a measure of how well the PDF was read. */
  lost: string[][];
}

/** Statements in curriculum order: by the lowest level they cover, then the highest, then code. */
export function compareStatements(a: Statement, b: Statement): number {
  const levels = (s: Statement) => s.codes.map((c) => parseCode(c)?.level ?? 9);
  const [aMin, aMax, bMin, bMax] = [Math.min(...levels(a)), Math.max(...levels(a)), Math.min(...levels(b)), Math.max(...levels(b))];
  return aMin - bMin || aMax - bMax || compareCodes(a.codes[0] ?? '', b.codes[0] ?? '');
}

/** Joins the pages into one document, carrying areas and organisers across page breaks. */
export function assemble(pages: PageContent[]): EoDocument {
  const doc: EoDocument = { intro: [], areas: [], appendix: [], footnotes: [], lost: [] };
  for (const page of pages) {
    if (page.kind === 'prose') {
      (doc.areas.length > 0 ? doc.appendix : doc.intro).push(...page.paragraphs);
      continue;
    }
    let area = doc.areas.at(-1);
    if (!area || (page.area !== null && page.area !== area.name)) {
      area = { name: page.area ?? '', intro: [], organisers: [] };
      doc.areas.push(area);
    }
    area.intro.push(...page.intro);
    for (const o of page.organisers) {
      const last = area.organisers.at(-1);
      if (last && (o.name === '' || o.name === last.name)) {
        last.statements.push(...o.statements);
        last.notes.push(...o.notes);
        if (!last.description) last.description = o.description;
      } else area.organisers.push({ ...o, statements: [...o.statements], notes: [...o.notes] });
    }
    for (const f of page.footnotes) if (!doc.footnotes.includes(f)) doc.footnotes.push(f);
    doc.lost.push(...page.lost);
  }
  for (const a of doc.areas) for (const o of a.organisers) o.statements.sort(compareStatements);
  return doc;
}
