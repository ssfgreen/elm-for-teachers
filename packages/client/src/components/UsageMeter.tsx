/**
 * The chat's model use so far, in the row under the chat box: tokens in and out, then what the
 * chat has cost in pounds ("↓12.3k ↑1.1k £0.040"). The cost is the one stored with each call when
 * it was made, the sum the budget uses, so it does not split into in and out.
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ChatUsage } from '@edw/shared';

/** 950, 12.3k, 1.2M. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trim(n / 1000)}k`;
  return `${trim(n / 1_000_000)}M`;
}

const trim = (x: number) => (x < 100 ? x.toFixed(1).replace(/\.0$/, '') : String(Math.round(x)));

/** Pence matter here: three places under a pound, two above. */
export function formatPounds(gbp: number): string {
  return `£${gbp < 1 ? gbp.toFixed(3) : gbp.toFixed(2)}`;
}

export function UsageMeter({ usage }: { usage: ChatUsage }) {
  const { input_tokens, output_tokens, gbp } = usage;
  const label = `This chat: ${input_tokens} tokens in, ${output_tokens} out, ${formatPounds(gbp)}`;
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums" title={label}>
      <span className="sr-only">{label}</span>
      <span className="flex items-center" aria-hidden="true">
        <ArrowDown size={12} aria-hidden="true" />
        {formatTokens(input_tokens)}
      </span>
      <span className="flex items-center" aria-hidden="true">
        <ArrowUp size={12} aria-hidden="true" />
        {formatTokens(output_tokens)}
      </span>
      <span aria-hidden="true">{formatPounds(gbp)}</span>
    </div>
  );
}
