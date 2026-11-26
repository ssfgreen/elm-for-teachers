/**
 * The answer to a pupil's ask (#236), above the bar at the foot of the reader: the passage
 * quoted, then each button pressed and its reply, and under the newest reply the follow-up
 * buttons while any are left. Replies are drawn as plain text with their line breaks: never HTML
 * or markdown, no links. Close or Escape hides it. A refusal is a line of its own under it, so the
 * panel stays as it was. The passage and replies are only ever text, never in a label or attribute.
 */
import { useEffect, useRef } from 'react';
import type { PupilPrompt } from '@edw/shared';
import { Button } from '../components/ui/button';
import { askRefusal, NO_MORE_FOLLOW_UPS } from './messages';
import type { AskChain } from './useAsk';

interface Props {
  chain: AskChain | null;
  asking: boolean;
  refused: string | null;
  /** The reading's prompts ticked "as a follow-up". */
  followUps: PupilPrompt[];
  onFollowUp: (p: PupilPrompt) => void;
  onClose: () => void;
}

export function AnswerPanel({ chain, asking, refused, followUps, onFollowUp, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  const newest = chain?.steps.at(-1)?.id;
  // A new reply takes focus, so Escape and the follow-ups are a key away.
  useEffect(() => {
    if (newest) panel.current?.focus();
  }, [newest]);

  return (
    <>
      {(chain || asking) && (
        <section ref={panel} role="region" aria-label="Answer" tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && onClose()} className="mx-auto mb-2 max-h-80 max-w-2xl overflow-y-auto rounded-md border border-border bg-card p-4 shadow-float outline-none">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Answer</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
          {chain && (
            <>
              <blockquote className="mb-3 border-l-2 border-border-strong pl-3 whitespace-pre-line italic">{chain.passage}</blockquote>
              <ol className="flex flex-col gap-3">
                {chain.steps.map((s) => (
                  <li key={s.id}>
                    <p className="text-sm font-semibold text-foreground">{s.label}</p>
                    <p className="whitespace-pre-line text-foreground">{s.reply}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
          {asking && (
            <p role="status" className="mt-3 text-muted-foreground">
              Thinking…
            </p>
          )}
          {chain && followUps.length > 0 && (
            <div className="mt-3">
              {chain.follow_ups_left > 0 ? (
                <div role="group" aria-label="Follow up" className="flex flex-wrap gap-2">
                  {followUps.map((p) => (
                    <Button key={p.id} variant="default" disabled={asking} onClick={() => onFollowUp(p)}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm">{NO_MORE_FOLLOW_UPS}</p>
              )}
            </div>
          )}
        </section>
      )}
      {refused && (
        <p role="alert" className="mx-auto mb-2 max-w-2xl rounded-md border border-destructive-border bg-destructive-soft p-3 text-destructive">
          {askRefusal(refused)}
        </p>
      )}
    </>
  );
}
