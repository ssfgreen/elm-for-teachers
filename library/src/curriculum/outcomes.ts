/**
 * Experiences and outcomes from the E&O collection's markdown (library/collections/
 * education-scotland-eo), where each statement is one line with its code, under headings: the
 * area (#), its organiser (##), a sub-organiser where there is one (###) and a level (####). The
 * code says the level; a statement shared by levels ("LIT 2-10a / LIT 3-10a") belongs to each.
 * The appendices are left out. Pure.
 */
import { LEVEL_STAGES, LEVELS, type Level, type Outcome } from './types.js';

const LINE_RE = /^((?:[A-Z]{2,5} [0-4]-\d{2}[a-z]?)(?:\s*\/\s*[A-Z]{2,5} [0-4]-\d{2}[a-z]?)*):\s*(.+)$/;
const CODE_RE = /[A-Z]{2,5} ([0-4])-\d{2}[a-z]?/g;

/** `area`: the area's name (the document's title without ": experiences and outcomes"). */
export function parseOutcomes(markdown: string, area: string): Outcome[] {
  const out: Outcome[] = [];
  let organiser: string | null = null;
  let sub: string | null = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const depth = h[1]!.length;
      if (depth === 2) {
        organiser = /^appendix/i.test(h[2]!) ? null : h[2]!.trim();
        sub = null;
      } else if (depth === 3 && organiser) sub = h[2]!.trim();
      continue;
    }
    const m = LINE_RE.exec(line);
    if (!m || !organiser) continue;
    const codes = m[1]!.split('/').map((c) => c.trim());
    const levels = [...new Set([...m[1]!.matchAll(CODE_RE)].map((c) => LEVELS[Number(c[1])]!))] as Level[];
    out.push({ code: codes.join(' / '), codes, level: levels[0]!, levels, stages: [...new Set(levels.flatMap((l) => LEVEL_STAGES[l]))], area, organiser, sub_organiser: sub, text: m[2]!.trim() });
  }
  return out;
}

/** "Literacy and English: experiences and outcomes" is the area "Literacy and English". */
export const areaName = (title: string) => title.replace(/:\s*experiences and outcomes\s*$/i, '').trim();
