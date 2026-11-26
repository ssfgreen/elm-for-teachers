/**
 * Dialog for exporting a document as a frozen one-way Content Pack v1 link for Elm for Students (T3).
 * Teachers choose reading or worksheet, copy the 7-day link, or revoke previous links.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ContentPackKind, Doc } from '@edw/shared';
import type { ContentPackSummary, CreatedContentPack } from '../api/contentPacks';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import { Button } from './ui/button';

export interface SendToStudentsDialogProps {
  doc: Doc;
  api: SessionApi;
  getEnvelope: () => Envelope;
  onClose: () => void;
}

export function SendToStudentsDialog({ doc, api, getEnvelope, onClose }: SendToStudentsDialogProps) {
  const [kind, setKind] = useState<ContentPackKind>('reading');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedContentPack | null>(null);
  const [copied, setCopied] = useState(false);
  const [packs, setPacks] = useState<ContentPackSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api.listContentPacks) return;
    try {
      const all = await api.listContentPacks();
      setPacks(all.filter((p) => p.doc_id === doc.id && !p.revoked_at));
    } catch {
      // Non-fatal: the teacher can still create a new link.
    }
  }, [api, doc.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (!api.createContentPack || creating) return;
    setCreating(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.createContentPack(doc.id, { kind, title: doc.name }, getEnvelope());
      setCreated(res);
      setPacks((prev) => [res.pack, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the link.');
    } finally {
      setCreating(false);
    }
  };

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const onRevoke = async (packId: string) => {
    if (!api.revokeContentPack) return;
    setError(null);
    try {
      await api.revokeContentPack(packId);
      setPacks((prev) => prev.filter((p) => p.id !== packId));
      if (created?.pack_id === packId) setCreated(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the link.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Send to Elm for Students">
      <div className="flex max-h-[85vh] w-full max-w-130 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold text-foreground">Send to Elm for Students</h2>
            <p className="mt-1 mb-0 text-sm text-foreground-2">
              Freezes “{doc.name}” into a one-way Content Pack (v1) link valid for 7 days. No comments, chat history, or teacher notes are included.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <fieldset className="m-0 flex gap-4 border-0 p-0">
          <legend className="mb-1 text-sm font-medium text-foreground-2">Pack type</legend>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-md">
            <input type="radio" name="pack-kind" value="reading" checked={kind === 'reading'} onChange={() => setKind('reading')} />
            Reading
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-md">
            <input type="radio" name="pack-kind" value="worksheet" checked={kind === 'worksheet'} onChange={() => setKind('worksheet')} />
            Worksheet
          </label>
        </fieldset>

        <div>
          <Button size="sm" variant="primary" disabled={creating} onClick={() => void onCreate()}>
            {creating ? 'Creating link…' : 'Create link'}
          </Button>
        </div>

        {error && (
          <p className="error-text m-0 text-sm" role="alert">
            {error}
          </p>
        )}

        {created && (
          <div className="rounded-md border border-border bg-panel p-3" aria-label="Import link">
            <p className="m-0 text-sm font-medium text-foreground">Ready to import into Elm for Students</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                readOnly
                aria-label="Content pack import link"
                className="min-w-0 flex-1 rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs"
                value={created.import_url}
              />
              <Button size="sm" variant="default" onClick={() => void onCopy(created.import_url)}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-1.5 mb-0 text-xs text-foreground-2">Expires {new Date(created.expires_at).toLocaleDateString('en-GB')}.</p>
          </div>
        )}

        {packs.length > 0 && (
          <div>
            <h3 className="m-0 text-sm font-medium text-foreground-2">Active links for this document</h3>
            <ul className="mt-2 mb-0 flex list-none flex-col gap-2 p-0">
              {packs.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium capitalize">{p.kind}</span> · expires {new Date(p.expires_at).toLocaleDateString('en-GB')}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void onRevoke(p.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
