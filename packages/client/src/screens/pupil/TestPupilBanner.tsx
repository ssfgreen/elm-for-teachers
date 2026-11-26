/**
 * The strip across /r and /r/... while a teacher views it as the class's test pupil (#215):
 * "Test pupil (you)" and "Back to teacher". Drawn nowhere else, and for no real pupil. It holds
 * no link to the workspace: going back closes this tab, and the teacher's tab is still open.
 */
import { useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useTestPupil } from './useTestPupil';

/** The pupil pages: `/r` and anything under `/r/`. */
export const isPupilPage = (path: string): boolean => path === '/r' || path.startsWith('/r/');

export function TestPupilBanner({ closeTab }: { closeTab?: () => void }) {
  const onPupilPage = isPupilPage(useLocation().pathname);
  const { test, back, goBack } = useTestPupil(onPupilPage, closeTab);
  if (!onPupilPage || !test) return null;
  return (
    <div role="region" aria-label="Test pupil" className="flex flex-wrap items-center gap-3 border-b border-border bg-panel px-4 py-2 text-sm text-foreground">
      <strong>Test pupil (you)</strong>
      {back === 'signed_out' ? (
        <span role="status">Signed out. You can close this tab.</span>
      ) : (
        <Button variant="default" size="sm" disabled={back === 'busy'} onClick={() => void goBack()}>
          Back to teacher
        </Button>
      )}
      {back === 'failed' && (
        <span role="alert" className="text-destructive">
          Signing out did not work. Please try again.
        </span>
      )}
    </div>
  );
}
