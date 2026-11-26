/**
 * The Plugins screen's studio drafts (#160): an offer to add the draft from an "Open in Elm" link,
 * a field to paste a draft's address, and the drafts in the workspace, each with a Remove that
 * asks first. Draws nothing while loading or when drafts are off, except one line when a studio
 * link arrived anyway. The logic is in useDrafts.ts.
 */
import { useState, type FormEvent } from 'react';
import { FlaskConical } from 'lucide-react';
import type { PluginDraft } from '@edw/shared';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { addedOn } from './drafts';
import type { Drafts } from './useDrafts';

export function DraftsSection({ drafts: d }: { drafts: Drafts }) {
  const [address, setAddress] = useState('');
  if (d.status === 'off' && d.linkOff) {
    return (
      <p className="m-0 text-md text-muted-foreground" role="status">
        Drafts from the plugin studio are not set up here, so that draft cannot be added.
      </p>
    );
  }
  if (d.status === 'off' || d.status === 'loading') return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void d.add(address).then((ok) => ok && setAddress(''));
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="drafts-heading">
      <div className="flex flex-col gap-1">
        <h2 id="drafts-heading" className="m-0 text-lg font-semibold">
          Drafts from the plugin studio
        </h2>
        <p className="m-0 text-md text-foreground-2">Paste the address of a draft you are making in the plugin studio to add it to this workspace.</p>
      </div>
      {d.offered && (
        <div role="group" aria-label="Add a draft from the studio" className="flex flex-wrap items-center gap-3 rounded-lg border border-border-strong bg-primary-soft p-4">
          <p className="m-0 min-w-60 flex-1 text-md">The plugin studio sent a draft. Add it to this workspace?</p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={d.adding} onClick={() => void d.acceptOffer()}>
              {d.adding ? 'Adding…' : 'Add'}
            </Button>
            <Button variant="ghost" size="sm" disabled={d.adding} onClick={d.declineOffer}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {d.status === 'ready' && (
        <form className="flex flex-wrap gap-2" onSubmit={submit}>
          <label className="min-w-60 flex-1">
            <span className="sr-only">Draft address</span>
            <Input className="w-full" placeholder="Paste a draft's address" autoComplete="off" spellCheck={false} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <Button type="submit" disabled={d.adding || !address.trim()}>
            Add draft
          </Button>
        </form>
      )}
      {d.error && (
        <p className="error-text m-0" role="alert">
          {d.error}
        </p>
      )}
      {d.notice && (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          {d.notice}
        </p>
      )}
      {d.drafts.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Drafts">
          {d.drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} onRemove={() => d.remove(draft.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DraftCard({ draft, onRemove }: { draft: PluginDraft; onRemove: () => Promise<void> }) {
  const added = addedOn(draft.added_at);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-label={draft.name}>
      <FlaskConical size={20} aria-hidden="true" className="flex-none text-foreground-2" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 truncate text-base font-semibold">{draft.name}</h3>
          <Badge variant="primary">Draft</Badge>
        </div>
        {added && <p className="m-0 text-sm text-muted-foreground">Added {added}</p>}
      </div>
      <RemoveButton name={draft.name} onRemove={onRemove} />
    </li>
  );
}

/** Remove, after a second click to confirm (like ClassPage's ArchiveButton). */
function RemoveButton({ name, onRemove }: { name: string; onRemove: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'failed'>('idle');
  if (state === 'idle') {
    return (
      <Button variant="ghost" size="sm" onClick={() => setState('confirm')}>
        Remove
      </Button>
    );
  }
  return (
    <div className="flex flex-none flex-wrap items-center justify-end gap-2 text-sm" role="group" aria-label={`Remove ${name}`}>
      <span>{state === 'failed' ? 'It could not be removed.' : 'Remove this draft? The studio keeps it.'}</span>
      <Button
        size="sm"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          onRemove().catch(() => setState('failed'));
        }}
      >
        Remove
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setState('idle')}>
        Cancel
      </Button>
    </div>
  );
}
