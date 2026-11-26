/**
 * Searching the structured curriculum: its shape (areas and organisers) once, then the outcomes
 * for the words, level, area and organiser given, a moment after they stop changing. Taken out of
 * CurriculumPicker so the Curriculum screen can browse the same way.
 */
import { useEffect, useState } from 'react';
import type { CurriculumSearch, CurriculumStructure } from '../../api/classes';
import type { SessionApi } from '../../api/participant';

export interface CurriculumQuery {
  query: string;
  level: number | undefined;
  area: string;
  organiser: string;
}

export function useCurriculumSearch(api: Pick<SessionApi, 'searchCurriculum' | 'getCurriculum'>, { query, level, area, organiser }: CurriculumQuery) {
  const [shape, setShape] = useState<CurriculumStructure | null>(null);
  const [found, setFound] = useState<CurriculumSearch | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCurriculum?.()
      .then(setShape)
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (!api.searchCurriculum) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api.searchCurriculum!({ ...(query.trim() ? { query: query.trim() } : {}), ...(level !== undefined ? { level } : {}), ...(area ? { area } : {}), ...(organiser ? { organiser } : {}) })
        .then((r) => {
          if (cancelled) return;
          setFound(r);
          setFailed(null);
        })
        .catch(() => !cancelled && setFailed('The curriculum could not be searched just now.'));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [api, query, level, area, organiser]);

  return { shape, found, failed };
}
