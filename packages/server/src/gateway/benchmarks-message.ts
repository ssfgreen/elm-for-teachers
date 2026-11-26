/**
 * The benchmarks for what a class is on now, added to the class message: Education Scotland's
 * evidence that a learner has achieved those outcomes, from the structured curriculum on the
 * library server. A benchmark belongs to its table row, so it is evidence for that row's codes,
 * not one code alone. Left out when the library cannot be reached.
 */
import type { CurriculumBenchmark } from '@edw/shared';
import type { CollectionSource } from '../pedagogy/source.js';

export const BENCHMARKS_MAX = 40;

export async function benchmarksSection(source: CollectionSource, nowCodes: readonly string[]): Promise<string | null> {
  const codes = [...new Set(nowCodes.flatMap((c) => c.split('/')).map((c) => c.trim()))];
  if (!codes.length) return null;
  let found: CurriculumBenchmark[];
  try {
    found = ((await source.client.call(source.collection, 'benchmarks', { codes })).benchmarks as CurriculumBenchmark[] | undefined) ?? [];
  } catch {
    return null;
  }
  const seen = new Set<string>();
  const lines = found
    .filter((b) => !seen.has(b.text) && (seen.add(b.text), true))
    .slice(0, BENCHMARKS_MAX)
    .map((b) => `- ${b.text} (${b.codes.filter((c) => codes.includes(c)).join(', ')}; ${b.level} level, ${b.organiser})`);
  if (!lines.length) return null;
  return ['### Benchmarks for the curriculum now', '', "Education Scotland's benchmarks for these outcomes: what a learner shows when they have achieved them. Use them to aim tasks and success criteria; each is for the outcomes in its row of the benchmark document.", '', ...lines].join('\n');
}
