import { describe, expect, it } from 'vitest';
import type { BlockFixture, EvalRun } from '../src/harness.js';
import { SIMILES, SIMILES_MESSY, SOURCES, TRENCHES, TRENCHES_BARE, TRENCHES_LONG, VOCABULARY } from '../src/layout-fixtures.js';
import { gapBetween, layoutClean, layoutCleanWhere, layoutFindings, layoutNoWorse, pageBreakBefore, pagesAtMost, seededBlocks } from '../src/layout-judges.js';

const run = (name: string, blocks: readonly BlockFixture[]) => ({ afterBlocks: { [name]: seededBlocks(blocks) }, afterStyle: {} }) as unknown as EvalRun;
const areas = (blocks: readonly BlockFixture[]) => layoutFindings(seededBlocks(blocks), null).map((f) => f.area);
const replaceAt = (blocks: readonly BlockFixture[], i: number, b: BlockFixture) => blocks.map((x, k) => (k === i ? b : x));
const u = (n: number) => '_'.repeat(n);

describe('each layout fixture has the problem its eval is about, and nothing else', () => {
  it('the similes and sources tables are in equal columns that wrap the text', () => {
    expect(areas(SIMILES.blocks)).toEqual(['tables']);
    expect(areas(SOURCES.blocks)).toEqual(['tables']);
  });

  it('the trenches questions: one short writing line; none when bare', () => {
    expect(areas(TRENCHES.blocks)).toEqual(['lines']);
    expect(areas(TRENCHES_BARE.blocks)).toEqual([]);
  });

  it('the messy similes sheet has runs of empty paragraphs and uneven gaps', () => {
    expect(areas(SIMILES_MESSY.blocks).filter((a) => a === 'spacing').length).toBeGreaterThanOrEqual(4);
  });

  it('the long trenches sheet runs onto a second page by a few lines', () => {
    expect(areas(TRENCHES_LONG.blocks)).toEqual(['pages']);
    expect(pagesAtMost(TRENCHES_LONG.name, 1)(run(TRENCHES_LONG.name, TRENCHES_LONG.blocks)).pass).toBe(false);
  });

  it("the vocabulary table leaves one row on page 2", () => {
    expect(layoutFindings(seededBlocks(VOCABULARY.blocks), null, ['pages']).map((f) => f.text)).toContain('The table splits across pages 1 and 2 with only 1 row on page 2. Move the page end (or the table) so its rows stay together.');
  });
});

describe('the layout judges pass a good fix', () => {
  it('layoutClean: the suggested widths fix the table', () => {
    const name = SIMILES.name;
    expect(layoutClean(name, 'tables')(run(name, SIMILES.blocks)).pass).toBe(false);
    const i = SIMILES.blocks.findIndex((b) => b.type === 'table');
    const fixed = replaceAt(SIMILES.blocks, i, { ...SIMILES.blocks[i]!, content: `${SIMILES.blocks[i]!.content}\n<!-- colwidths: 25 0 85 85 -->` });
    expect(layoutClean(name, 'tables')(run(name, fixed)).pass).toBe(true);
  });

  it('layoutCleanWhere: a writing line taken to the margin', () => {
    const name = TRENCHES.name;
    const muddy = /muddy or flooded/;
    expect(layoutCleanWhere(name, muddy, 'lines')(run(name, TRENCHES.blocks)).pass).toBe(false);
    const fixed = TRENCHES.blocks.map((b) => (b.type === 'numbered_list' ? { ...b, content: b.content.replace(u(46), u(64)) } : b));
    expect(layoutCleanWhere(name, muddy, 'lines')(run(name, fixed)).pass).toBe(true);
  });

  it('layoutNoWorse: compares with the fixture as seeded', () => {
    const name = SIMILES_MESSY.name;
    expect(layoutNoWorse(name, SIMILES_MESSY.blocks, 'spacing')(run(name, SIMILES_MESSY.blocks)).pass).toBe(true);
    const worse = [...SIMILES_MESSY.blocks, { type: 'paragraph', content: ' ' } as BlockFixture];
    expect(layoutNoWorse(name, SIMILES_MESSY.blocks, 'spacing')(run(name, worse)).pass).toBe(false);
  });

  it('pagesAtMost: taking out the empty paragraphs brings the long sheet onto one page', () => {
    const name = TRENCHES_LONG.name;
    const tidy = TRENCHES_LONG.blocks.filter((b) => !(b.type === 'paragraph' && b.content === '')).map((b) => (b.type === 'paragraph' && b.content.startsWith('**Lice') ? { ...b, content: 'Lice lived in soldiers’ clothes. Rats stole food.' } : b));
    expect(pagesAtMost(name, 1)(run(name, tidy)).pass).toBe(true);
  });

  it('pageBreakBefore: a page break (with empty paragraphs between) before the block', () => {
    const name = SIMILES.name;
    const i = SIMILES.blocks.findIndex((b) => /Task 2/.test(b.content));
    const broken = [...SIMILES.blocks.slice(0, i), { type: 'page_break', content: '' } as BlockFixture, { type: 'paragraph', content: '' } as BlockFixture, ...SIMILES.blocks.slice(i)];
    expect(pageBreakBefore(name, /## Task 2/)(run(name, broken)).pass).toBe(true);
    expect(pageBreakBefore(name, /## Task 2/)(run(name, SIMILES.blocks)).pass).toBe(false);
    // Starting task 2 on its own page leaves page 1 well filled: no page problems.
    expect(layoutClean(name, 'pages')(run(name, broken)).pass).toBe(true);
  });

  it('layoutCleanWhere fails when the block it is about has gone', () => {
    const gone = TRENCHES.blocks.map((b) => (b.type === 'numbered_list' ? { ...b, content: '1. Something else' } : b));
    expect(layoutCleanWhere(TRENCHES.name, /muddy or flooded/, 'lines')(run(TRENCHES.name, gone)).pass).toBe(false);
  });

  it('gapBetween: an empty paragraph between the definitions, and not a paragraph of text', () => {
    const name = SIMILES.name;
    const at = SIMILES.blocks.findIndex((b) => b.key === 'metaphor');
    const spaced = [...SIMILES.blocks.slice(0, at), { type: 'paragraph', content: '' } as BlockFixture, ...SIMILES.blocks.slice(at)];
    const check = gapBetween(name, /A simile\*\* compares/, /A metaphor\*\* says/);
    expect(check(run(name, SIMILES.blocks)).pass).toBe(false);
    expect(check(run(name, spaced)).pass).toBe(true);
  });

  it('fails, rather than throws, when the doc is gone', () => {
    expect(layoutClean('Missing', 'lines')(run('Other', SIMILES.blocks))).toMatchObject({ pass: false, detail: 'no such doc after the turn' });
  });
});
