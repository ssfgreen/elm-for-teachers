import { useState } from 'react';
import type { AdminApi } from '../api/admin';
import type { AdminSessionRow } from '../api/types';
import { fieldClass } from '../components/ui/input';
import { cn } from '../lib/utils';

/** The choices, as hours (null: until turned off). */
export const DURATIONS: { label: string; hours: number | null }[] = [
  { label: 'On for 2 hours', hours: 2 },
  { label: 'On for 8 hours', hours: 8 },
  { label: 'On for 24 hours', hours: 24 },
  { label: 'On for 7 days', hours: 168 },
  { label: 'On until turned off', hours: null },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** What the setting is now, in words. */
export function interactionsStatus(s: Pick<AdminSessionRow, 'interactions_on' | 'interactions_until' | 'interactions_active'>): string {
  if (s.interactions_active) return s.interactions_until ? `On until ${when(s.interactions_until)}` : 'On';
  if (s.interactions_on && s.interactions_until) return `Off (ended ${when(s.interactions_until)})`;
  return 'Off';
}

export interface InteractionsSwitchProps {
  api: Pick<AdminApi, 'setInteractions'>;
  session: AdminSessionRow;
  onChanged: (session: AdminSessionRow) => void;
}

/**
 * Interaction logging for one workspace: where the pointer is, what is clicked, what is on
 * screen (events/interactions). Off by default; on for a while, or until turned off.
 */
export function InteractionsSwitch({ api, session, onChanged }: InteractionsSwitchProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function choose(value: string) {
    if (value === '') return;
    setBusy(true);
    setError(null);
    try {
      const hours = value === 'off' || value === 'forever' ? null : Number(value);
      onChanged(await api.setInteractions(session.session_id, value !== 'off', hours));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={cn(session.interactions_active && 'font-semibold text-foreground')}>{interactionsStatus(session)}</span>
      <select
        className={cn(fieldClass, 'px-1.5 py-1 text-sm')}
        aria-label={`Interaction logging for ${session.label}`}
        value=""
        disabled={busy}
        onChange={(e) => void choose(e.target.value)}
      >
        <option value="">Change…</option>
        {DURATIONS.map((d) => (
          <option key={d.label} value={d.hours === null ? 'forever' : String(d.hours)}>
            {d.label}
          </option>
        ))}
        {session.interactions_active && <option value="off">Turn off</option>}
      </select>
      {error && (
        <span className="text-destructive" role="alert">
          Not changed: {error}
        </span>
      )}
    </span>
  );
}
