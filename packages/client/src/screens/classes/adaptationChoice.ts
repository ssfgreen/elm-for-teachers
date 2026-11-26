/**
 * Which library adaptations to offer a pupil first. Needs are barriers, not diagnoses: what the
 * teacher wrote in the pupil's note ("Dyslexic. Reads slowly…") is only a hint for where to look
 * (the library's `often_relevant_to`), so every adaptation stays on offer, the hinted ones first.
 * Not from "What helps": "Visual timetable" would hint visual impairment. Pure.
 */
import { needHints } from '@edw/shared';
import type { EntryBrief } from '../../api/pedagogy';

export interface AdaptationGroups {
  hints: string[];
  suggested: EntryBrief[];
  others: EntryBrief[];
}

export function adaptationGroups(all: readonly EntryBrief[], hintsFrom: readonly string[], chosen: ReadonlySet<string>): AdaptationGroups {
  const hints = needHints(hintsFrom);
  const open = all.filter((e) => !chosen.has(e.id));
  const wanted = new Set(hints.map((h) => h.toLowerCase()));
  const hinted = (e: EntryBrief) => (e.facets.often_relevant_to ?? []).some((h) => wanted.has(h.toLowerCase()));
  return { hints, suggested: open.filter(hinted), others: open.filter((e) => !hinted(e)) };
}
