/**
 * Reading the structured curriculum: its shape (areas, organisers, counts), outcomes by level,
 * stage, area, organiser, code or words, and the benchmarks for given codes or a part of the
 * curriculum. Pure, for the JSON API, MCP and tests.
 */
import { badRequest } from '../core/errors.js';
import { LEVELS, type CurriculumData, type Level } from './types.js';

export const OUTCOMES_MAX = 400;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const levelOf = (l: string | undefined): Level | undefined => {
  if (!l) return undefined;
  const v = l.toLowerCase();
  if (!(LEVELS as readonly string[]).includes(v)) throw badRequest(`level must be one of ${LEVELS.join(', ')}`);
  return v as Level;
};

export function structure(data: CurriculumData) {
  return {
    framework: data.framework,
    benchmark_levels: data.benchmark_levels,
    areas: data.areas.map((a) => ({
      ...a,
      counts: Object.fromEntries(LEVELS.map((l) => [l, data.outcomes.filter((o) => o.area === a.name && o.levels.includes(l)).length])),
    })),
    coverage: data.coverage ?? [],
  };
}

export interface OutcomesArgs {
  level?: string;
  stage?: string;
  area?: string;
  organiser?: string;
  /** A code or its start: "LIT 2-1", "SOC 3-01a". */
  code?: string;
  /** Words that must all be in the statement. */
  text?: string;
  limit?: number;
}

export function outcomes(data: CurriculumData, args: OutcomesArgs) {
  const level = levelOf(args.level);
  const limit = args.limit ?? 200;
  if (limit < 1 || limit > OUTCOMES_MAX) throw badRequest(`limit must be 1 to ${OUTCOMES_MAX}`);
  const words = norm(args.text ?? '').split(' ').filter((w) => w.length > 1);
  const code = args.code ? norm(args.code) : null;
  const found = data.outcomes.filter(
    (o) =>
      (!level || o.levels.includes(level)) &&
      (!args.stage || o.stages.includes(args.stage.toLowerCase())) &&
      (!args.area || norm(o.area) === norm(args.area)) &&
      (!args.organiser || norm(o.organiser) === norm(args.organiser)) &&
      (!code || o.codes.some((c) => norm(c).startsWith(code))) &&
      words.every((w) => norm(`${o.code} ${o.text}`).includes(w)),
  );
  return { total: found.length, truncated: found.length > limit, outcomes: found.slice(0, limit) };
}

export interface BenchmarksArgs {
  /** Benchmarks whose row names any of these codes. */
  codes?: string[];
  area?: string;
  level?: string;
}

export function benchmarks(data: CurriculumData, args: BenchmarksArgs) {
  const level = levelOf(args.level);
  if (!args.codes?.length && !args.area) throw badRequest('give codes or an area');
  const codes = new Set((args.codes ?? []).flatMap((c) => c.split('/')).map((c) => c.trim()));
  const found = data.benchmarks.filter((b) => (!codes.size || b.codes.some((c) => codes.has(c))) && (!args.area || norm(b.area) === norm(args.area)) && (!level || b.level === level));
  return { benchmark_levels: data.benchmark_levels, benchmarks: found };
}
