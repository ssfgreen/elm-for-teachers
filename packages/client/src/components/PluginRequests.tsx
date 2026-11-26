/** Above the message box: each Ask first plugin the assistant wants in this chat, with Allow and Not now. */
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { PluginInfo } from '@edw/shared';
import { Button } from './ui/button';

export function PluginRequests({ pending, onAllow, onDismiss }: { pending: PluginInfo[]; onAllow: (p: PluginInfo) => Promise<void>; onDismiss: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (pending.length === 0) return null;
  return (
    <ul className="m-0 mb-2 flex list-none flex-col gap-1.5 p-0" aria-label="Asked to use">
      {pending.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <BookOpen size={15} aria-hidden="true" className="flex-none text-foreground-2" />
          <span className="min-w-0 flex-1">
            The assistant would like to look in <strong>{p.name}</strong> in this chat.
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={busy !== null}
            onClick={() => {
              setBusy(p.id);
              setFailed(false);
              onAllow(p)
                .catch(() => setFailed(true))
                .finally(() => setBusy(null));
            }}
          >
            Allow in this chat
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => onDismiss(p.id)}>
            Not now
          </Button>
        </li>
      ))}
      {failed && (
        <li className="error-text" role="alert">
          That could not be saved. Please try again.
        </li>
      )}
    </ul>
  );
}
