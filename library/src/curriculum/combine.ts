/** The curriculum data from its parts, and how much of it has benchmarks. Pure. */
import { slug } from './benchmarks.js';
import type { Benchmark, CurriculumData, Level, Outcome } from './types.js';

export function combine(outcomes: Outcome[], benchmarks: Benchmark[], benchmarkLevels: Level[]): CurriculumData {
  const areas = [...new Set(outcomes.map((o) => o.area))].map((name) => ({ id: slug(name), name, organisers: [...new Set(outcomes.filter((o) => o.area === name).map((o) => o.organiser))] }));
  return { framework: 'cfe-eo', areas, outcomes, benchmarks, benchmark_levels: benchmarkLevels };
}

/** For each area and benchmark level: its outcome codes at that level, and those with no benchmark row. */
export function coverage(data: CurriculumData) {
  const out: { area: string; level: Level; codes: number; covered: number; missing: string[] }[] = [];
  for (const level of data.benchmark_levels) {
    for (const a of data.areas) {
      const codes = [...new Set(data.outcomes.filter((o) => o.area === a.name).flatMap((o) => o.codes).filter((c) => Number(c.match(/ (\d)-/)?.[1]) === ['early', 'first', 'second', 'third', 'fourth'].indexOf(level)))];
      if (!codes.length) continue;
      const has = new Set(data.benchmarks.filter((b) => b.area === a.name && b.level === level).flatMap((b) => b.codes));
      const missing = codes.filter((c) => !has.has(c));
      out.push({ area: a.name, level, codes: codes.length, covered: codes.length - missing.length, missing });
    }
  }
  return out;
}
