import { levelName, parseCode } from '../../core/codes.js';
import type { Statement } from './columns.js';
import type { EoDocument } from './document.js';

/** The level heading for a statement: `Second`, `Third and Fourth` or `Early to Fourth`. */
export function levelLabel(s: Statement): string {
  const levels = [...new Set(s.codes.map((c) => parseCode(c)?.level).filter((l): l is number => l !== undefined))].sort();
  if (levels.length === 0) return 'Level not shown';
  const first = levelName(levels[0]!);
  const last = levelName(levels.at(-1)!);
  if (levels.length === 1) return first;
  if (levels.length === 2 && levels[1]! - levels[0]! === 1) return `${first} and ${last}`;
  return `${first} to ${last}`;
}

/** One experience and outcome, on one line, starting with its codes. */
export const statementLine = (s: Statement) => `${s.codes.join(' / ')}: ${s.text.replace(/\s+/g, ' ').trim()}`;

/** The document as markdown made for grep: headings for area, organiser and level. */
export function eoMarkdown(title: string, doc: EoDocument): string {
  const out: string[] = [`# ${title}`, ''];
  const para = (p: string) => {
    // List items stay together; everything else is its own paragraph.
    if (p.startsWith('- ') && out.at(-2)?.startsWith('- ')) out.splice(-1, 1, p, '');
    else out.push(p, '');
  };
  const letters = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
  const inTitle = (p: string) => /^#+ /.test(p) && letters(title).includes(letters(p));
  doc.intro.filter((p) => !inTitle(p)).forEach(para);
  for (const area of doc.areas) {
    if (area.name) out.push(`## ${area.name}`, '');
    area.intro.forEach(para);
    for (const o of area.organisers) {
      if (o.name) out.push(`### ${o.name}`, '');
      if (o.description) para(o.description);
      let label = '';
      for (const s of o.statements) {
        const next = levelLabel(s);
        if (next !== label) {
          if (label) out.push('');
          out.push(`#### ${next}`, '');
          label = next;
        }
        out.push(statementLine(s));
      }
      if (o.statements.length > 0) out.push('');
      o.notes.forEach(para);
    }
  }
  doc.appendix.forEach(para);
  if (doc.footnotes.length > 0) {
    out.push('## Notes', '');
    doc.footnotes.forEach(para);
  }
  return `${out.join('\n').trimEnd()}\n`;
}

/** Every code in the document, in curriculum order without repeats. */
export function documentCodes(doc: EoDocument): string[] {
  const codes = new Set<string>();
  for (const a of doc.areas) for (const o of a.organisers) for (const s of o.statements) s.codes.forEach((c) => codes.add(c));
  return [...codes];
}
