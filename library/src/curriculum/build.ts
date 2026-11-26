/**
 * Builds the structured curriculum collection (collections/cfe-curriculum): the outcomes from
 * the E&O collection's markdown, and the benchmarks for the levels asked (default Second and
 * Third: P7 and S1) from Education Scotland's PDFs, fetched politely into a temporary folder,
 * parsed and deleted. Writes curriculum.json and sources.lock.json, and prints a report with how
 * many of each level's codes have benchmarks.
 *
 *   pnpm --filter @edw/library curriculum [--levels second,third]
 *
 * In a cloud sandbox, Node's fetch uses the proxy only with NODE_USE_ENV_PROXY=1.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../core/frontmatter.js';
import { Fetcher } from '../ingest/fetcher.js';
import { extractPdfItems } from '../ingest/pdf/extract.js';
import { bestOf } from './benchmarks.js';
import { combine, coverage } from './combine.js';
import { areaName, parseOutcomes } from './outcomes.js';
import { AREA_SOURCES, CURRICULUM_HOSTS } from './sources.js';
import { LEVELS, type Benchmark, type Level, type Outcome } from './types.js';

const root = fileURLToPath(new URL('../../collections/', import.meta.url));

async function main(argv: string[]) {
  const at = argv.indexOf('--levels');
  const levels = (at >= 0 ? argv[at + 1]!.split(',') : ['second', 'third']).filter((l): l is Level => (LEVELS as readonly string[]).includes(l));
  const fetcher = new Fetcher({ allowedHosts: CURRICULUM_HOSTS, delayMs: 1500 });
  const outcomes: Outcome[] = [];
  const benchmarks: Benchmark[] = [];
  const lock: { url: string; sha256: string; bytes: number; fetched_at: string }[] = [];
  for (const src of AREA_SOURCES) {
    const { data, body } = parseFrontmatter(readFileSync(`${root}education-scotland-eo/docs/${src.eo}`, 'utf8'));
    const area = areaName(String(data.title ?? src.eo));
    outcomes.push(...parseOutcomes(body, area));
    for (const url of src.benchmarks) {
      const res = await fetcher.get(url);
      if (res.status !== 200 || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
      lock.push({ url, sha256: createHash('sha256').update(res.body).digest('hex'), bytes: res.body.length, fetched_at: new Date().toISOString().slice(0, 10) });
      // Parsed in memory only: nothing from the download is written or run.
      benchmarks.push(...bestOf(await extractPdfItems(res.body), area, levels));
      console.log(`  ${area}: ${url.split('/').pop()}`);
    }
  }
  const data = { ...combine(outcomes, benchmarks, levels), coverage: [] as ReturnType<typeof coverage> };
  data.coverage = coverage(data);
  writeFileSync(`${root}cfe-curriculum/curriculum.json`, `${JSON.stringify(data, null, 1)}\n`);
  writeFileSync(`${root}cfe-curriculum/sources.lock.json`, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`\n${data.outcomes.length} outcomes, ${data.benchmarks.length} benchmarks`);
  for (const c of data.coverage) console.log(`  ${c.level.padEnd(7)} ${c.area.padEnd(48)} ${c.covered}/${c.codes} codes have benchmarks${c.missing.length ? `; none for ${c.missing.join(', ')}` : ''}`);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
