/** One prompt in the library: its button and instruction, its ticks (saved as they change, each disabled while its save is in flight), Up, Down, Edit and Remove (which asks first). */
import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReaderPrompt, ReaderPromptPatch } from '@edw/shared';
import { Button } from '../../../components/ui/button';
import { PromptForm, PromptTicks } from './PromptForm';

interface PromptCardProps {
  prompt: ReaderPrompt;
  first: boolean;
  last: boolean;
  onSave: (patch: ReaderPromptPatch) => Promise<boolean>;
  /** Ticks whose save is in flight, disabled until it answers. */
  busy: { after_highlight: boolean; follow_up: boolean };
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
}

export function PromptCard({ prompt, first, last, busy, onSave, onRemove, onMove }: PromptCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-label={prompt.label}>
      {editing ? (
        <PromptForm
          start={prompt}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (f) => {
            const ok = await onSave({ label: f.label, instruction: f.instruction });
            if (ok) setEditing(false);
            return ok;
          }}
        />
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="self-start rounded-sm border border-border-strong bg-panel px-2.25 py-0.75 text-md font-medium">{prompt.label}</span>
            <p className="m-0 text-md break-words whitespace-pre-wrap text-foreground-2">{prompt.instruction}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${prompt.label} up`} disabled={first} onClick={() => onMove(-1)}>
              <ArrowUp size={16} aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${prompt.label} down`} disabled={last} onClick={() => onMove(1)}>
              <ArrowDown size={16} aria-hidden />
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PromptTicks value={prompt} busy={busy} onChange={(patch) => void onSave(patch)} />
        {!editing && (
          <div className="flex items-center gap-3">
            {confirming ? (
              <>
                <span className="text-md">Remove this prompt?</span>
                <Button variant="link-danger" onClick={onRemove}>
                  Remove
                </Button>
                <Button variant="link" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <>
                <Button variant="link" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="link-danger" aria-label={`Remove ${prompt.label}`} onClick={() => setConfirming(true)}>
                  Remove
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
