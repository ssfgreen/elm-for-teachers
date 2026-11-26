import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findEoLinks } from './links.js';

/** The main part of the page as it was on 8 Nov 2026. */
const html = readFileSync(new URL('./fixtures/eo-page.html', import.meta.url), 'utf8');
const BASE = 'https://education.gov.scot/curriculum-for-excellence/experiences-and-outcomes/';

describe('findEoLinks', () => {
  it('finds each English experiences and outcomes PDF once, with its area name', () => {
    const links = findEoLinks(html, BASE);
    expect(links).toHaveLength(16);
    expect(links).toContainEqual({ url: 'https://education.gov.scot/media/sz2lnh1g/numeracy-maths-eo.pdf', name: 'Numeracy and mathematics' });
    expect(links).toContainEqual({ url: 'https://education.gov.scot/media/nqgj0egw/technologies-es-os.pdf', name: 'Technologies' });
    expect(links).toContainEqual({ url: 'https://education.gov.scot/media/lbtg5lpl/rerc-eo.pdf', name: 'Religious education in Roman Catholic schools' });
    expect(links).toContainEqual({ url: 'https://education.gov.scot/media/ysyfazzx/gaelic-learners-eo.pdf', name: 'Gaelic (Learners)' });
  });

  it('leaves out Gaelic versions, the combined files and the benchmarks', () => {
    const urls = findEoLinks(html, BASE).map((l) => l.url);
    expect(urls.some((u) => /gaelic\.pdf$/.test(u))).toBe(false);
    expect(urls.some((u) => /all-experiences|responsibility-of-all|benchmarks/.test(u))).toBe(false);
  });
});
