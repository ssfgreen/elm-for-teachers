/**
 * `/admin/replay`: play back a workspace from its export bundle. `?session=<id>` loads it from
 * the server; otherwise a downloaded bundle (.zip) can be chosen or dropped. The bundle is read
 * in the browser and nothing is sent anywhere.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AdminApi } from '../api/admin';
import { AdminGate } from '../admin/AdminGate';
import { BundleError, readBundleZip, type ReplayBundle } from './bundle';
import { ReplayPlayer } from './ReplayPlayer';

export function ReplayScreen() {
  return <AdminGate>{(api) => <Replay api={api} />}</AdminGate>;
}

function Replay({ api }: { api: Pick<AdminApi, 'exportZip'> }) {
  const [params] = useSearchParams();
  const sessionId = params.get('session');
  const [bundle, setBundle] = useState<ReplayBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (get: () => Promise<Blob | ArrayBuffer>) => {
    setBusy(true);
    setError(null);
    try {
      setBundle(await readBundleZip(await get()));
    } catch (e) {
      setError(e instanceof BundleError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (sessionId) void load(async () => (await api.exportZip(sessionId)).blob);
  }, [sessionId, api]);

  return (
    <main className="mx-auto max-w-480 px-6 pt-4 pb-8">
      <p className="mb-3 text-md">
        <Link className="text-primary hover:text-primary-hover" to="/admin">
          ← Workspaces
        </Link>
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {busy && <p className="text-muted-foreground">Loading the session…</p>}
      {bundle ? (
        <ReplayPlayer bundle={bundle} />
      ) : (
        !busy && (
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-card px-8 py-16 text-center text-foreground-2 hover:bg-hover"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) void load(async () => file);
            }}
          >
            <span className="text-lg text-foreground">Choose or drop a session bundle (.zip)</span>
            <span>The zip from the download icon in a workspace’s Data column on the workspaces page. It is read here in the browser.</span>
            <input
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void load(async () => file);
              }}
            />
          </label>
        )
      )}
    </main>
  );
}
