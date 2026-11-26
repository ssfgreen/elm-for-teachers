import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { AdminApi } from '../api/admin';
import { saveBlob } from '../download';
import { cn } from '../lib/utils';
import { IconButton } from './IconButton';

export { saveBlob };

export interface ExportButtonProps {
  api: Pick<AdminApi, 'exportZip'>;
  sessionId: string;
  /** Named in the button's label, and used for the file name if the server does not send one. */
  label: string;
  className?: string;
}

/** A download icon: the full session bundle (docs, chats and logs) for one session, as a .zip (the file replay reads). */
export function ExportButton({ api, sessionId, label, className }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await api.exportZip(sessionId);
      saveBlob(blob, filename ?? `${label.replace(/[^A-Za-z0-9._-]/g, '_')}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <IconButton
        icon={busy ? LoaderCircle : Download}
        className={cn(busy && 'motion-safe:*:animate-spin', className)}
        label={`Download ${label} as a .zip`}
        title="Download the full session bundle as a .zip"
        onClick={() => void download()}
        disabled={busy}
        aria-busy={busy}
      />
      {error && (
        <span className="text-destructive" role="alert">
          Export failed: {error}
        </span>
      )}
    </>
  );
}
