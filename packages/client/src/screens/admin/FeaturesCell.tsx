import { useState } from 'react';
import { FEATURE_NAMES, resolveFeatures, type FeatureName, type Features } from '@edw/shared';
import type { AdminSessionRow } from '../../api/types';
import type { CellContext } from './columns';

/** Said by the `pupils` tick: the switch alone does not open pupil sign-in. */
export const PUPILS_HINT = "pupils: only matters when the site's PUPILS setting is on";

export interface FeatureTicksProps {
  features: Features;
  onChange: (name: FeatureName, on: boolean) => void;
  /** Names each tick for a screen reader, for example "classes for Year 7". */
  labelFor?: (name: FeatureName) => string;
  disabled?: boolean;
}

/** One tick per feature switch, in the shared order (shared/src/features.ts). */
export function FeatureTicks({ features, onChange, labelFor, disabled }: FeatureTicksProps) {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {FEATURE_NAMES.map((name) => (
        <label key={name} className="inline-flex items-center gap-1 whitespace-nowrap" title={name === 'pupils' ? PUPILS_HINT : undefined}>
          <input
            type="checkbox"
            checked={features[name]}
            disabled={disabled}
            aria-label={labelFor?.(name)}
            onChange={(e) => onChange(name, e.target.checked)}
          />
          {name}
        </label>
      ))}
    </span>
  );
}

/** The switches in a few words, for the closed cell: those turned off, or "All on". */
export function featuresSummary(features: Features): string {
  const off = FEATURE_NAMES.filter((n) => !features[n]);
  return off.length ? `Off: ${off.join(', ')}` : 'All on';
}

/**
 * A workspace's feature switches: what is off, opening to one tick each. A change is saved at
 * once; the server enforces it straight away, and a teacher's open tab picks it up on its next
 * load. A refused save puts the tick back and says so.
 */
export function FeaturesCell({ row, ctx }: { row: AdminSessionRow; ctx: CellContext }) {
  const [error, setError] = useState<string | null>(null);
  /** One save at a time per row: the ticks wait until the last one is answered. */
  const [saving, setSaving] = useState(false);
  const features = resolveFeatures(row.features ?? null);
  const change = async (name: FeatureName, on: boolean) => {
    setError(null);
    setSaving(true);
    try {
      setError(await ctx.list.setFeatures(row.session_id, { [name]: on }));
    } finally {
      setSaving(false);
    }
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <details>
        <summary className="cursor-pointer" title={`Change the features for ${row.label}`}>
          {featuresSummary(features)}
        </summary>
        <span className="mt-1 flex flex-col gap-1">
          <FeatureTicks features={features} onChange={(n, on) => void change(n, on)} labelFor={(n) => `${n} for ${row.label}`} disabled={saving} />
          <span className="text-sm text-muted-foreground">{PUPILS_HINT}.</span>
        </span>
      </details>
      {error && (
        <span className="text-destructive" role="alert">
          Not saved: {error}
        </span>
      )}
    </span>
  );
}
