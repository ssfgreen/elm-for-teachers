/**
 * The assistant's suggested font or page colour for the doc, as a card at the top of the
 * comments column: what would change, with a tick to accept it and a cross to reject it.
 * Changes to the look of a doc have no text to mark, so they are decided here.
 */
import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import type { DocStyle } from '@edw/shared';
import { IconButton } from '../../editor/Toolbar.js';
import { SWATCH } from '../../editor/DocStyleControls.js';
import { DOC_BACKGROUND_LABELS, DOC_FONT_LABELS, DOC_FONT_STACKS } from '../../editor/docStyle.js';
import { cn } from '../../lib/utils';

export function StyleSuggestion({ style, onDecide }: { style: DocStyle; onDecide: (accept: boolean) => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const decide = async (accept: boolean) => {
    setBusy(true);
    try {
      await onDecide(accept);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="style-suggestion relative mb-2.5 rounded-md bg-card px-4 py-3 text-md shadow-card ring-1 ring-border" aria-label="Suggested style">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
        <span className="mr-auto text-sm text-muted-foreground">Suggested style</span>
        <IconButton icon={Check} label="Accept the suggested style" disabled={busy} onClick={() => void decide(true)} />
        <IconButton icon={X} label="Reject the suggested style" tipAlign="end" disabled={busy} onClick={() => void decide(false)} />
      </div>
      <ul className="mt-1.5 flex list-none flex-col gap-1 p-0">
        {style.background && (
          <li className="flex items-center gap-2">
            <span className={cn('inline-block size-4 rounded-full ring-1 ring-border-strong', SWATCH[style.background])} aria-hidden />
            Page colour: {DOC_BACKGROUND_LABELS[style.background]}
          </li>
        )}
        {style.font && (
          <li>
            Font: <span style={{ fontFamily: DOC_FONT_STACKS[style.font] }}>{DOC_FONT_LABELS[style.font]}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
