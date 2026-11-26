/**
 * The library adaptations chosen for a class's pupils, and the library's list to choose from
 * (loaded once, when a picker first opens). The chosen ones are the class detail's (the caller
 * holds them, state/classDetail.ts). Changes are saved at once; under option B the research
 * record keeps only that the table changed.
 */
import { useCallback, useState } from 'react';
import type { AdaptationStatus, PupilAdaptation } from '@edw/shared';
import type { EntryBrief } from '../../api/pedagogy';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { withAdded } from '../../state/classDetail';

export function usePupilAdaptations({
  api,
  classId,
  getEnvelope,
  onFail,
  chosen,
  setChosen,
}: {
  api: SessionApi;
  classId: string;
  getEnvelope: () => Envelope;
  onFail: (message: string) => void;
  chosen: PupilAdaptation[];
  setChosen: (change: (xs: PupilAdaptation[]) => PupilAdaptation[]) => void;
}) {
  const [library, setLibrary] = useState<EntryBrief[] | null>(null);
  const available = !!(api.addAdaptation && api.pedagogyEntries);

  const loadLibrary = useCallback(() => {
    if (library || !api.pedagogyEntries) return;
    api
      .pedagogyEntries({ types: ['adaptation'], limit: 120 })
      .then((r) => setLibrary(r.entries))
      .catch(() => onFail('The library’s adaptations could not be loaded.'));
  }, [api, library, onFail]);

  const add = (pupilId: string, e: EntryBrief) =>
    void api
      .addAdaptation!(classId, pupilId, { entry_id: e.id, title: e.title, changes_goal: e.changes_goal === true, status: 'trialling' }, getEnvelope())
      .then((a) => setChosen((xs) => withAdded(xs, [a])))
      .catch(() => onFail('That adaptation could not be added.'));
  const update = (a: PupilAdaptation, fields: { status?: AdaptationStatus; overrides?: string | null }) =>
    void api
      .updateAdaptation!(classId, a.id, fields, getEnvelope())
      .then((next) => setChosen((xs) => xs.map((x) => (x.id === a.id ? next : x))))
      .catch(() => onFail('That change could not be saved.'));
  const remove = (a: PupilAdaptation) =>
    void api
      .removeAdaptation!(classId, a.id, getEnvelope())
      .then(() => setChosen((xs) => xs.filter((x) => x.id !== a.id)))
      .catch(() => onFail('That adaptation could not be removed.'));

  return { available, chosen, library, loadLibrary, of: (pupilId: string) => chosen.filter((a) => a.pupil_id === pupilId), add, update, remove };
}
