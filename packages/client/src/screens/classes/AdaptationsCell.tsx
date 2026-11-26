/**
 * A pupil's library adaptations in the pupil table: each with whether it helps (confirmed,
 * trialling, stopped) and the pupil's own settings (cream background, 14pt), which win for them.
 * The free-text "What helps" and note stay as they are beside it.
 */
import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ADAPTATION_OVERRIDES_MAX, AdaptationStatus, type PupilAdaptation } from '@edw/shared';
import type { EntryBrief } from '../../api/pedagogy';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { AdaptationPicker } from './AdaptationPicker';
import { fieldClass } from './styles';

const STATUS_WORDS: Record<AdaptationStatus, string> = { confirmed: 'Helps', trialling: 'Trying', stopped: 'Stopped' };

export interface AdaptationsCellProps {
  label: string;
  /** The text the picker's hints are read from: the pupil's note. */
  hintsFrom: readonly string[];
  chosen: PupilAdaptation[];
  library: EntryBrief[] | null;
  /** Loads the library's adaptations the first time a picker opens. */
  onWantLibrary: () => void;
  onAdd: (e: EntryBrief) => void;
  onUpdate: (a: PupilAdaptation, fields: { status?: AdaptationStatus; overrides?: string | null }) => void;
  onRemove: (a: PupilAdaptation) => void;
}

export function AdaptationsCell({ label, hintsFrom, chosen, library, onWantLibrary, onAdd, onUpdate, onRemove }: AdaptationsCellProps) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="relative flex flex-col gap-1">
      {chosen.map((a) => (
        <div key={a.id} className={cn('flex flex-col gap-0.5 rounded-sm border border-border px-1.5 py-1', a.status === 'stopped' && 'opacity-60')}>
          <div className="flex items-start gap-1">
            <span className="min-w-0 flex-1 text-sm" title={a.entry_id}>
              {a.title}
            </span>
            {a.changes_goal && <Badge variant="warning">Modification</Badge>}
            <button type="button" className="flex-none border-0 bg-transparent p-0.5 text-muted-foreground hover:text-destructive" aria-label={`Remove ${a.title} for ${label}`} onClick={() => onRemove(a)}>
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <select aria-label={`Does ${a.title} help ${label}?`} className="rounded-sm border border-border bg-card px-1 py-0.5 text-xs" value={a.status} onChange={(e) => onUpdate(a, { status: e.target.value as AdaptationStatus })}>
              {AdaptationStatus.options.map((s) => (
                <option key={s} value={s}>
                  {STATUS_WORDS[s]}
                </option>
              ))}
            </select>
            <Overrides label={`${label}'s own settings for ${a.title}`} value={a.overrides ?? ''} onSave={(t) => t !== (a.overrides ?? '') && onUpdate(a, { overrides: t || null })} />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="flex w-fit items-center gap-1 rounded-sm border-0 bg-transparent px-1 py-0.5 text-sm text-foreground-2 hover:bg-hover hover:text-foreground"
        aria-label={`Add an adaptation for ${label}`}
        aria-expanded={picking}
        onClick={() => {
          onWantLibrary();
          setPicking((p) => !p);
        }}
      >
        <Plus size={13} aria-hidden="true" /> Adaptation
      </button>
      {picking && (
        <div className="absolute top-full left-0 z-30 mt-1">
          <AdaptationPicker
            label={label}
            library={library}
            hintsFrom={hintsFrom}
            chosen={new Set(chosen.map((a) => a.entry_id))}
            onChoose={(e) => {
              onAdd(e);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        </div>
      )}
    </div>
  );
}

function Overrides({ label, value, onSave }: { label: string; value: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      aria-label={label}
      className={cn(fieldClass(), 'text-xs')}
      placeholder="Own settings, e.g. cream, 14pt"
      maxLength={ADAPTATION_OVERRIDES_MAX}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(text.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
