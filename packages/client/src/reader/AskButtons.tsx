/**
 * "Ask about this" in the reader's bar (#236): one button per prompt of the reading ticked "after
 * a highlight", in the reading's order, for the selected text or the picked highlight. Where asks
 * are not offered on the passage (asks.ts `askable`) one line says why instead; a reading with no
 * such prompt shows nothing. Buttons keep the selection on a mouse press, as the bar's others do.
 */
import type { MouseEvent } from 'react';
import type { PupilPrompt } from '@edw/shared';
import { Button } from '../components/ui/button';
import type { Askable } from './asks';
import { NOT_ASKABLE } from './messages';

interface Props {
  prompts: PupilPrompt[];
  askable: Askable;
  /** A request is out: every button is off. */
  asking: boolean;
  onAsk: (p: PupilPrompt) => void;
}

const keep = (e: MouseEvent) => e.preventDefault();

export function AskButtons({ prompts, askable, asking, onAsk }: Props) {
  if (prompts.length === 0) return null;
  if (!askable.ok) return <p className="basis-full text-sm">{NOT_ASKABLE[askable.why]}</p>;
  return (
    <div role="group" aria-label="Ask about this" className="flex basis-full flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-foreground">Ask about this</span>
      {prompts.map((p) => (
        <Button key={p.id} variant="primary" disabled={asking} onMouseDown={keep} onClick={() => onAsk(p)}>
          {p.label}
        </Button>
      ))}
    </div>
  );
}
