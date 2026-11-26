/**
 * Spyglass's callout under a reply (docs/spyglass.md, Part 5): at most three things the turn
 * changed that the teacher may want to look at, each a short heading and a short reason, to skim.
 * Set apart from the assistant's own words by its frame and the telescope, and worded as "your
 * content changed", not "the assistant made a mistake".
 */
import { Telescope } from 'lucide-react';
import type { SpyglassResult } from '@edw/shared';
import type { EventLogger } from '../events/logger';
import { Button } from './ui/button';
import { useSpyglass } from './useSpyglass';

export function Spyglass({ turnId, result, logger }: { turnId: string; result: SpyglassResult; logger: Pick<EventLogger, 'log'> }) {
  const { flags, others, show } = useSpyglass({ turnId, result, logger });
  if (flags.length === 0) return null;
  return (
    <aside className="spyglass mt-2 flex gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm" aria-label="Spyglass">
      <Telescope size={15} aria-hidden="true" className="mt-0.5 flex-none text-foreground-2" />
      <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1.5 p-0">
        {flags.map((flag, index) => (
          <li key={index} className="spyglass-flag flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <strong className="block font-semibold text-foreground">{flag.title}</strong>
              {flag.why && <span className="block text-foreground-2">{flag.why}</span>}
            </span>
            <Button size="sm" variant="ghost" aria-label={`Show: ${flag.title}`} onClick={() => show(index)}>
              Show
            </Button>
          </li>
        ))}
        {others > 0 && <li className="text-muted-foreground">+{others} more</li>}
      </ul>
    </aside>
  );
}
