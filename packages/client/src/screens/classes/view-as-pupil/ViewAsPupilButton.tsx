/**
 * "View as pupil" in the class page's header (#215): opens /r in a new tab as the class's test
 * pupil. Shown only with pupils on (the api has class codes), an api that can do it (not the make
 * kit's) and the class not archived. A second click while one is under way does nothing.
 */
import { useRef, useState } from 'react';
import { hasClassCode } from '../../../api/classCode';
import type { SessionApi } from '../../../api/participant';
import type { Envelope } from '../../../api/types';
import { hasViewAsPupil } from '../../../api/viewAsPupil';
import { Button } from '../../../components/ui/button';
import { openTestPupilTab, type TabOpener } from './openTestPupilTab';

export interface ViewAsPupilButtonProps {
  classId: string;
  archived: boolean;
  api: SessionApi;
  getEnvelope: () => Envelope;
  /** The window that opens the tab; the page's own by default (tests pass their own). */
  win?: TabOpener;
}

export function ViewAsPupilButton({ classId, archived, api, getEnvelope, win }: ViewAsPupilButtonProps) {
  // A ref, not state: a second click in the same moment must see the first at once.
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (archived || !hasClassCode(api) || !hasViewAsPupil(api)) return null;

  const click = () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    void openTestPupilTab(win ?? (window as unknown as TabOpener), () => api.viewAsPupil(classId, getEnvelope())).then((said) => {
      busy.current = false;
      setPending(false);
      setMessage(said);
    });
  };

  return (
    <div className="flex flex-none flex-col items-end gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={click}>
        View as pupil
      </Button>
      {message && (
        <p role="alert" className="m-0 max-w-64 text-right text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
