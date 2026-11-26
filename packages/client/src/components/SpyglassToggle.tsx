/**
 * Spyglass on or off, under the chat box (docs/spyglass.md, Part 5): its icon only, named on
 * hover. Off hides the callout under each reply; the checks still run and are recorded for the
 * research. Pressed means on.
 */
import { Telescope } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export const SPYGLASS_TIP = 'Spyglass: points out changes you might have missed';

export function SpyglassToggle({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <Button
      variant="bar"
      size="icon"
      aria-pressed={on}
      aria-label="Spyglass"
      tip={`${SPYGLASS_TIP} (${on ? 'on' : 'off'})`}
      tipAlign="end"
      disabled={disabled}
      className={cn('spyglass-toggle', on ? 'text-foreground' : 'text-muted-foreground opacity-60')}
      onClick={() => onChange(!on)}
    >
      <Telescope size={15} aria-hidden="true" />
    </Button>
  );
}
