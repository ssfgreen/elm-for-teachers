/**
 * The route `/s/:token/prompts`: the prompt library of the workspace the link belongs to, on its
 * own page with a way back to the workspace. A link in the class sidebar comes later (#173).
 */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { nowIso } from '@edw/shared';
import { useSession } from '../../../state/session';
import { plainScreenClass } from '../../WorkspaceApp';
import { createPromptLibraryApi } from './api';
import { PromptLibraryScreen } from './PromptLibraryScreen';

const envelope = () => ({ client_ts: nowIso(), focus_pane: 'none' as const, doc_id: null, thread_id: null });

export function PromptsApp() {
  const { token = '' } = useParams();
  const { sessionId, error } = useSession(token);

  const api = useMemo(() => (sessionId ? createPromptLibraryApi(token, sessionId) : null), [token, sessionId]);

  if (error && !sessionId) {
    return (
      <main className={plainScreenClass}>
        <p className="mt-4">This link could not be opened. Please check it, or ask for a new one.</p>
      </main>
    );
  }
  if (!api) {
    return (
      <main className={plainScreenClass}>
        <p className="mt-4">Loading…</p>
      </main>
    );
  }
  return (
    <main className="min-h-dvh bg-background">
      <nav className="mx-auto max-w-200 px-6 pt-6">
        <Link className="text-md text-primary underline underline-offset-2" to={`/s/${encodeURIComponent(token)}`}>
          Back to the workspace
        </Link>
      </nav>
      <PromptLibraryScreen api={api} getEnvelope={envelope} />
    </main>
  );
}
