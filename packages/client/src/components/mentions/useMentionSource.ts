/**
 * The mentions' source for the open chat: its class's pupils, their adaptations and its
 * curriculum (the one copy of the class, state/classDetail.ts, so a class page's edits show at
 * once), and the app's curriculum to look codes up in. A chat with no class still links codes.
 */
import { useMemo } from 'react';
import type { SessionApi } from '../../api/participant';
import { useClassDetail } from '../../state/useClassDetail';
import { outcomeLoader, type MentionSource } from './context';

const NO_PUPILS: MentionSource['pupils'] = [];
const NO_ADAPTATIONS: MentionSource['adaptations'] = [];
const NO_CURRICULUM: MentionSource['curriculum'] = [];

export interface MentionSourceArgs {
  api: Pick<SessionApi, 'getClass' | 'searchCurriculum'>;
  classId: string | null;
  className: string | null;
  openCurriculum?: (code: string) => void;
}

export function useMentionSource({ api, classId, className, openCurriculum }: MentionSourceArgs): MentionSource {
  const { detail } = useClassDetail(api, classId);
  const search = api.searchCurriculum;
  const outcome = useMemo(() => (search ? outcomeLoader(search) : undefined), [search]);
  const pupils = detail?.pupils ?? NO_PUPILS;
  const adaptations = detail?.adaptations ?? NO_ADAPTATIONS;
  const curriculum = detail?.curriculum ?? NO_CURRICULUM;
  return useMemo(
    () => ({ className: classId ? className : null, pupils, adaptations, curriculum, outcome, openCurriculum }),
    [classId, className, pupils, adaptations, curriculum, outcome, openCurriculum],
  );
}
