/**
 * Spend by day as bars, drawn with CSS: one bar a day, its height against the dearest day. A
 * picture only (hidden from screen readers): the Usage section's totals and table say the same.
 * Each bar's title gives its day and amount on hover.
 */
import type { UsageDay } from '@edw/shared';
import { poundsAndPence } from './UsagePounds';

/** "Wed 4 Nov" for `2026-11-04`. The day is already a UK one, so it is read at UTC. */
export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
}

export function UsageChart({ days }: { days: UsageDay[] }) {
  const most = Math.max(0, ...days.map((d) => d.gbp));
  const first = days[0];
  const last = days.at(-1);
  return (
    <div aria-hidden="true" data-testid="usage-chart" className="flex flex-col gap-1">
      <div className="flex h-28 items-end gap-0.5 border-b border-border">
        {days.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 items-end" title={`${dayLabel(d.day)}: ${poundsAndPence(d.gbp)}`}>
            <div className="mx-auto w-full max-w-8 rounded-t-sm bg-primary" style={{ height: most > 0 && d.gbp > 0 ? `max(2px, ${(d.gbp / most) * 100}%)` : 0 }} />
          </div>
        ))}
      </div>
      {first && last && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{dayLabel(first.day)}</span>
          {last.day !== first.day && <span>{dayLabel(last.day)}</span>}
        </div>
      )}
    </div>
  );
}
