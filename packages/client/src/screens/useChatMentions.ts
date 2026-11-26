/**
 * The open chat's mentions (components/mentions/): its class's pupils and the curriculum codes
 * in its replies and comments, and where a code leads: the Curriculum screen on that outcome in a
 * class's chat, else (the screen needs a class) the ideas aligned to it.
 */
import { useCallback } from 'react';
import { curriculumEntryId, type SchoolClass } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import { useMentionSource } from '../components/mentions/useMentionSource';
import type { MainView } from './mainView';

export function useChatMentions(api: SessionApi, activeClass: SchoolClass | undefined, setView: (v: MainView) => void) {
  const classId = activeClass?.id;
  const openCurriculum = useCallback(
    (code: string) => setView(classId ? { kind: 'curriculum', classId, code } : { kind: 'pedagogy', alignsTo: [curriculumEntryId(code)], code }),
    [setView, classId],
  );
  return useMentionSource({ api, classId: activeClass?.id ?? null, className: activeClass?.name ?? null, openCurriculum });
}
