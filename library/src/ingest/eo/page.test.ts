import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupLines, type PdfItem } from '../pdf/lines.js';
import { assemble } from './document.js';
import { eoMarkdown, statementLine } from './markdown.js';
import { readPage, type PageContent } from './page.js';

/** Text items of real pages, saved from the PDFs on 8 Nov 2026 (Open Government Licence). */
function page(name: string): PageContent {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as [number, number, number, number, string, string][];
  const items: PdfItem[] = raw.map(([x, y, w, h, str, font]) => ({ x, y, w, h, str, font }));
  return readPage(groupLines(items));
}

function table(name: string) {
  const p = page(name);
  if (p.kind !== 'table') throw new Error(`${name} is not a table page`);
  return p;
}

const lines = (p: ReturnType<typeof table>) => p.organisers.flatMap((o) => o.statements.map(statementLine));

describe('readPage', () => {
  it('pairs each statement with its code, even when pdf.js gives them out of order', () => {
    const p = table('numeracy-p3');
    expect(p.area).toBe('Number, money and measure');
    expect(p.organisers.map((o) => o.name)).toEqual(['Estimation and rounding', 'Number and number processes']);
    expect(p.organisers[1]!.description).toBe('including addition, subtraction, multiplication, division and negative numbers');
    const out = lines(p);
    expect(out).toContain(
      'MNU 0-01a: I am developing a sense of size and amount by observing, exploring, using and communicating with others about things in the world around me.',
    );
    expect(out).toContain(
      'MNU 1-01a: I can share ideas with others to develop ways of estimating the answer to a calculation or problem, work out the actual answer, then check my solution by comparing it with the estimate.',
    );
    expect(out.filter((l) => l.startsWith('MNU 2-03a: Having determined which calculations are needed'))).toHaveLength(1);
    expect(p.footnotes).toEqual(['Note 1: The numeracy experiences and outcomes, which are the responsibility of all teachers, are shown in italics.']);
    expect(p.lost).toEqual([]);
  });

  it('joins codes split over lines and mends spaced letters, and keeps two-paragraph statements whole', () => {
    const out = lines(table('literacy-p3'));
    expect(out).toContain('LIT 0-01a / LIT 0-11a / LIT 0-20a: I enjoy exploring and playing with the patterns and sounds of language, and can use what I learn.');
    expect(out).toContain(
      'LIT 1-01a / LIT 2-01a: I regularly select and listen to or watch texts which I enjoy and find interesting, and I can explain why I prefer certain sources. I regularly select subject, purpose, format and resources to create texts of my choice.',
    );
    expect(out).toContain('LIT 0-01b / LIT 0-11b: I enjoy exploring and choosing stories and other texts to watch, read or listen to, and can share my likes and dislikes.');
    expect(out).toHaveLength(5);
  });

  it('reads statements that span every level, with organisers in the margin', () => {
    const p = table('hwb-p4');
    expect(p.organisers.map((o) => o.name)).toEqual(['Social wellbeing', 'Physical wellbeing']);
    expect(lines(p)[0]).toMatch(/^HWB 0-09a \/ HWB 1-09a \/ HWB 2-09a \/ HWB 3-09a \/ HWB 4-09a: As I explore the rights/);
    expect(p.organisers[1]!.statements[0]!.text).toMatch(/^I am developing my understanding of the human body/);
  });

  it('reads a table with no organiser column, and the text above it', () => {
    const p = table('expressive-arts-p3');
    expect(p.area).toBe('Participation in performances and presentations');
    expect(p.intro[0]).toMatch(/^All aspects of learning in expressive arts include opportunities/);
    expect(lines(p)[0]).toMatch(/^EXA 0-01a \/ EXA 1-01a \/ EXA 2-01a: I have experienced the energy and excitement/);
    expect(p.lost).toEqual([]);
  });

  it('takes a code on the same line as its text, and fills in letters left off a code', () => {
    const out = lines(table('rme-p9'));
    expect(out).toContain('RME 0-07a / RME 1-07a / RME 2-07a / RME 3-07a / RME 4-07a: I am developing respect for others and my understanding of their beliefs and values.');
  });
});

describe('eoMarkdown', () => {
  it('writes headings for area, organiser and level, one statement per line', () => {
    const md = eoMarkdown('Numeracy and mathematics: experiences and outcomes', assemble([page('numeracy-p3')]));
    const at = (s: string) => md.split('\n').indexOf(s);
    expect(at('## Number, money and measure')).toBeGreaterThan(0);
    expect(at('### Estimation and rounding')).toBeGreaterThan(at('## Number, money and measure'));
    expect(at('#### Early')).toBeGreaterThan(at('### Estimation and rounding'));
    expect(md).toMatch(/\n#### Second\n\nMNU 2-02a: [^\n]+\nMNU 2-03a: /);
    expect(md).toMatch(/## Notes\n\nNote 1: The numeracy/);
  });
});
