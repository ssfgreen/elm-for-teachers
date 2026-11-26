/**
 * "Readings" on a class's page (#187): articles set for the whole class, each a frozen copy of
 * one of the workspace's docs with the library prompts it allows and its follow-up limit. The
 * teacher sets one, changes its ticks and limit, and removes it (asked first). Pupils see
 * readings in a later item (R1).
 */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Reading, ReaderPrompt } from '@edw/shared';
import type { ReadingsApi } from '../../../api/readings';
import type { Envelope } from '../../../api/types';
import { Button } from '../../../components/ui/button';
import { shortDate } from '../styles';
import { ReadingForm } from './ReadingForm';
import { followUpsText, promptLabels } from './readingView';
import { useReadings } from './useReadings';

export interface ReadingsSectionProps {
  classId: string;
  api: ReadingsApi;
  getEnvelope: () => Envelope;
}

export function ReadingsSection({ classId, api, getEnvelope }: ReadingsSectionProps) {
  const r = useReadings(api, classId, getEnvelope);
  const [adding, setAdding] = useState(false);

  return (
    <section aria-label="Readings" className="flex flex-col gap-2">
      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">Readings</h2>
        {r.status === 'ready' && !adding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              r.refreshSources();
              setAdding(true);
            }}
          >
            <Plus size={14} aria-hidden="true" /> Set a reading
          </Button>
        )}
      </div>
      {r.error && (
        <p role="alert" className="m-0 text-md text-destructive">
          {r.error}
        </p>
      )}
      {r.status === 'loading' && <p className="m-0 text-md text-muted-foreground">Loading…</p>}
      {r.status === 'failed' && <p className="m-0 text-md text-destructive">The readings could not be loaded. Please reload the page.</p>}
      {r.status === 'ready' && (
        <>
          {adding && (
            <ReadingForm
              library={r.prompts}
              sources={r.sources}
              start={{ prompt_ids: r.prompts.map((p) => p.id), follow_ups_max: null }}
              submitLabel="Set reading"
              onCancel={() => setAdding(false)}
              onSubmit={async (f) => {
                const ok = await r.set(f);
                if (ok) setAdding(false);
                return ok;
              }}
            />
          )}
          {r.readings.length === 0 && !adding ? (
            <p className="m-0 text-md text-muted-foreground">No readings yet. Set one of your docs as an article for the class to read.</p>
          ) : (
            <ul aria-label="Readings set" className="m-0 flex list-none flex-col gap-2 p-0">
              {r.readings.map((x) => (
                <ReadingItem key={x.id} reading={x} library={r.prompts} onSave={(patch) => r.update(x.id, patch)} onRemove={() => void r.remove(x.id)} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

interface ReadingItemProps {
  reading: Reading;
  library: ReaderPrompt[];
  onSave: (patch: { prompt_ids: string[]; follow_ups_max: number | null }) => Promise<boolean>;
  onRemove: () => void;
}

function ReadingItem({ reading, library, onSave, onRemove }: ReadingItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (editing) {
    return (
      <li aria-label={reading.name}>
        <ReadingForm
          library={library}
          start={reading}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (f) => {
            const ok = await onSave({ prompt_ids: f.prompt_ids, follow_ups_max: f.follow_ups_max });
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </li>
    );
  }
  return (
    <li aria-label={reading.name} className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-1.5 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="min-w-0 truncate font-medium">{reading.name}</span>
        <span className="text-sm text-foreground-2">Prompts: {promptLabels(library, reading.prompt_ids) || 'none left in the library'}</span>
        <span className="text-sm text-foreground-2">Follow-ups: {followUpsText(reading.follow_ups_max)}</span>
        <span className="text-sm text-muted-foreground">Set {shortDate(reading.created_at)}</span>
      </div>
      <div className="flex items-center gap-3">
        {confirming ? (
          <>
            <span className="text-md">Remove this reading?</span>
            <Button variant="link-danger" onClick={onRemove}>
              Remove
            </Button>
            <Button variant="link" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button variant="link" aria-label={`Edit ${reading.name}`} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="link-danger" aria-label={`Remove ${reading.name}`} onClick={() => setConfirming(true)}>
              Remove
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
