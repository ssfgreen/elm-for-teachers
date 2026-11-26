/**
 * Usage, on Preferences: what the workspace has spent on the assistant against its budget ("£12.40
 * of £60 used", the sum the budget counts), and spend by day for this week, this month or all time.
 * Days are UK days (the server works them out). The chart is a picture only: the totals and a table
 * for screen readers say the same. Reading usage is not logged.
 */
import { useEffect, useState } from 'react';
import type { UsageRange, UsageReport } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import { cn } from '../../lib/utils';
import { UsageChart, dayLabel } from './UsageChart';
import { poundsAndPence } from './UsagePounds';

const RANGES: { range: UsageRange; label: string; within: string }[] = [
  { range: 'week', label: 'This week', within: 'this week' },
  { range: 'month', label: 'This month', within: 'this month' },
  { range: 'all', label: 'All time', within: 'in all' },
];

export function UsageSection({ api, className }: { api: Pick<SessionApi, 'getUsage'>; className?: string }) {
  const [range, setRange] = useState<UsageRange>('week');
  const [report, setReport] = useState<UsageReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!api.getUsage) return;
    let cancelled = false;
    setFailed(false);
    api
      .getUsage(range)
      .then((r) => !cancelled && setReport(r))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [api, range]);

  if (!api.getUsage) return null;
  const within = RANGES.find((r) => r.range === range)!.within;
  const shown = report?.range === range ? report : null;

  return (
    <section className={className} aria-labelledby="pref-usage">
      <div className="flex flex-col gap-1">
        <h2 id="pref-usage" className="m-0 text-base font-semibold">
          Usage
        </h2>
        <p className="m-0 text-sm text-muted-foreground">What the assistant has cost in this workspace, in all your chats. Days are UK days.</p>
      </div>
      {failed && <p className="m-0 text-md text-muted-foreground">Usage could not be loaded. Please reload the page.</p>}
      {report && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-md font-medium tabular-nums">
            {poundsAndPence(report.spent_gbp)} of {poundsAndPence(report.budget_gbp)} used
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (report.spent_gbp / report.budget_gbp) * 100 || 0)}%` }} />
          </div>
        </div>
      )}
      <div role="radiogroup" aria-label="Range" className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <label
            key={r.range}
            className={cn(
              'cursor-pointer rounded-md border border-border px-3 py-1.5 text-md text-foreground-2 hover:bg-hover has-focus-visible:outline-2 has-focus-visible:outline-ring',
              range === r.range && 'border-border-strong bg-pressed text-foreground',
            )}
          >
            <input type="radio" className="sr-only" name="usage-range" checked={range === r.range} onChange={() => setRange(r.range)} />
            {r.label}
          </label>
        ))}
      </div>
      {!shown && !failed && <p className="m-0 text-md text-muted-foreground">Loading…</p>}
      {shown && (shown.total_gbp > 0 ? <Days report={shown} within={within} /> : <p className="m-0 text-md text-muted-foreground">Nothing spent {range === 'all' ? 'yet' : within}.</p>)}
    </section>
  );
}

function Days({ report, within }: { report: UsageReport; within: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-md tabular-nums">
        {poundsAndPence(report.total_gbp)} {within}
      </p>
      <UsageChart days={report.days} />
      <table className="sr-only">
        <caption>Spend by day, {within}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Spend</th>
          </tr>
        </thead>
        <tbody>
          {report.days.map((d) => (
            <tr key={d.day}>
              <td>{dayLabel(d.day)}</td>
              <td>{poundsAndPence(d.gbp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
