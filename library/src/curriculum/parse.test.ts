import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PdfItem } from '../ingest/pdf/lines.js';
import { bestOf, parseBenchmarks } from './benchmarks.js';
import { combine, coverage } from './combine.js';
import { areaName, parseOutcomes } from './outcomes.js';

const pages = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')) as PdfItem[][];

describe('parseBenchmarks', () => {
  it('reads each row of Second level Literacy and English: section, organiser, its codes and each bullet', () => {
    const b = parseBenchmarks(pages('literacy-second-p19-23.json'), 'Literacy and English', ['second']);
    const finding = b.filter((x) => x.section === 'Listening and talking' && x.organiser === 'Finding and using information');
    expect(finding.map((x) => x.codes)).toEqual(Array(3).fill(['LIT 2-04a', 'LIT 2-05a', 'LIT 2-06a']));
    expect(finding[0]!.text).toBe('Identifies the purpose of spoken texts with suitable explanation.');
    const reading = b.filter((x) => x.section === 'Reading' && x.organiser === 'Tools for reading');
    expect(reading[0]!.text).toMatch(/^Reads with fluency, understanding and expression/);
    expect(new Set(b.map((x) => x.id)).size).toBe(b.length);
  });

  it('keeps an outcome’s own bullets out of the benchmarks', () => {
    const creating = parseBenchmarks(pages('literacy-second-p19-23.json'), 'Literacy and English', ['second']).filter((x) => x.organiser === 'Creating texts' && x.section === 'Listening and talking');
    expect(creating.map((x) => x.text)).toEqual(['Communicates clearly, audibly and with expression in different contexts.', 'Plans and delivers an organised presentation/talk with relevant content and appropriate structure.', 'Uses suitable vocabulary for purpose and audience.', 'Selects and uses resources to support communication.']);
    expect(creating[0]!.codes).toContain('LIT 2-09a');
  });

  it('reads Third level Social studies, whose bullets are tied to the organiser’s codes, not one each', () => {
    const b = bestOf(pages('social-third-p14-15.json'), 'Social studies', ['third']);
    const past = b.filter((x) => x.organiser === 'People, past events and societies');
    expect(past[0]!.codes).toEqual(expect.arrayContaining(['SOC 3-01a', 'SOC 3-06a']));
    expect(past[0]!.text).toMatch(/^Compares a range of primary and secondary sources of evidence/);
    expect(parseBenchmarks(pages('social-third-p14-15.json'), 'Social studies', ['second'])).toEqual([]);
  });
});

describe('parseOutcomes', () => {
  const md = ['# Social studies: experiences and outcomes', '', '## People, past events and societies', '', '#### Third', '', 'SOC 3-01a: I can use my knowledge of a historical period.', '', '## Literacy', '### Creating texts', 'LIT 2-10a / LIT 3-10a: I am developing confidence.', '', '## Appendix – Explanations', 'SOC 3-99a: Not an outcome.'].join('\n');
  it('gives each statement its area, organiser, sub-organiser, levels and stages, and leaves out the appendix', () => {
    const o = parseOutcomes(md, areaName('Social studies: experiences and outcomes'));
    expect(o.map((x) => x.code)).toEqual(['SOC 3-01a', 'LIT 2-10a / LIT 3-10a']);
    expect(o[0]).toMatchObject({ area: 'Social studies', organiser: 'People, past events and societies', sub_organiser: null, level: 'third', stages: ['s1', 's2', 's3'] });
    expect(o[1]).toMatchObject({ codes: ['LIT 2-10a', 'LIT 3-10a'], levels: ['second', 'third'], sub_organiser: 'Creating texts' });
  });

  it('reports which codes have no benchmarks', () => {
    const o = parseOutcomes(md, 'Social studies');
    const data = combine(o, [{ id: 'b', area: 'Social studies', level: 'third', section: null, organiser: 'x', codes: ['SOC 3-01a'], text: 'Compares.' }], ['third']);
    expect(coverage(data)).toEqual([{ area: 'Social studies', level: 'third', codes: 2, covered: 1, missing: ['LIT 3-10a'] }]);
  });
});
