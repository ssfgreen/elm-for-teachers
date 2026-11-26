/**
 * One of the assistant's suggestions as a card in the comments column, as in a word processor:
 * what it would do ("Replace “x” with “y”", "Add paragraph: …") with Accept and Reject. A
 * suggested edit to a paragraph has a card for each change in it, decided on its own. The
 * document shows the same suggestion as tracked changes (editor/extensions/trackChanges.ts).
 * Hovering Accept or Reject tints what it is about, green or red: just its change for a card
 * about one change in a paragraph, otherwise the block. The selected card's change (or block)
 * is tinted in the suggestion colour.
 */
import { Check, Sparkles, X } from 'lucide-react';
import type { Suggestion, TextChange } from '../../editor/suggest/suggestions.js';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

const QUOTE_MAX = 90;

const clip = (s: string) => {
  const t = s.replace(/\s*\n\s*/g, ' ¶ ').trim();
  return t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX - 1)}…` : t;
};

export type SuggestionHover = { block_id: string; part: number | null; intent: 'accept' | 'reject' } | null;
/** The selected suggestion: one change in a block (`part`), or the block and all its cards (null). */
export type SuggestionPick = { block_id: string; part: number | null } | null;

/** Whether a card is the selected one, or one of the selected block's. */
export const isPicked = (s: Suggestion, pick: SuggestionPick) => !!pick && s.block_id === pick.block_id && (pick.part === null || s.part === pick.part);

export interface SuggestionCardProps {
  suggestion: Suggestion;
  active: boolean;
  onSelect: (blockId: string, part: number | null) => void;
  /** `part`: the change's index inside the block's suggested edit, or null for the whole block. */
  onDecide: (blockId: string, accept: boolean, part: number | null) => void;
  onHover: (h: SuggestionHover) => void;
  /** Another card is selected: this one fades back (dimClass). */
  dim?: boolean;
}

const cardClass = 'suggestion-card relative mb-2.5 rounded-md bg-card px-4 py-3 text-md shadow-card ring-1 ring-border transition duration-150 ease-out';
/** A card that is not the selected one, while one is: faded, and whole again under the pointer or focus. */
export const dimClass = 'opacity-50 hover:opacity-100 focus-within:opacity-100';
/** The selected card steps out towards the document on a deeper drop shadow. */
const activeClass = 'cursor-default shadow-lift -translate-x-2 motion-reduce:translate-x-0';

export function SuggestionCard({ suggestion: s, active, onSelect, onDecide, onHover, dim }: SuggestionCardProps) {
  const hover = (intent: 'accept' | 'reject' | null) => onHover(intent ? { block_id: s.block_id, part: s.part, intent } : null);
  const decide = (accept: boolean) => {
    hover(null);
    onDecide(s.block_id, accept, s.part);
  };
  return (
    <div
      className={cn(cardClass, active ? activeClass : 'cursor-pointer hover:shadow-float', dim && !active && dimClass)}
      role="group"
      aria-label={`Suggestion: ${s.title.toLowerCase()}`}
      data-for-block={s.block_id}
      data-track={`suggestion:${s.block_id}:${s.part ?? 'all'}`}
      data-part={s.part ?? undefined}
      data-active={active || undefined}
      onClick={() => onSelect(s.block_id, s.part)}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles className="size-4 flex-none text-suggest" aria-hidden />
        <span className="mr-auto text-sm font-semibold">Assistant</span>
        <Button
          size="sm"
          className="suggestion-accept px-2 py-1 text-sm"
          aria-label={`Accept: ${s.title.toLowerCase()}`}
          onMouseEnter={() => hover('accept')}
          onMouseLeave={() => hover(null)}
          onFocus={() => hover('accept')}
          onBlur={() => hover(null)}
          onClick={(e) => {
            e.stopPropagation();
            decide(true);
          }}
        >
          <Check className="size-3.5" aria-hidden />
          Accept
        </Button>
        <Button
          size="sm"
          className="suggestion-reject px-2 py-1 text-sm"
          aria-label={`Reject: ${s.title.toLowerCase()}`}
          onMouseEnter={() => hover('reject')}
          onMouseLeave={() => hover(null)}
          onFocus={() => hover('reject')}
          onBlur={() => hover(null)}
          onClick={(e) => {
            e.stopPropagation();
            decide(false);
          }}
        >
          <X className="size-3.5" aria-hidden />
          Reject
        </Button>
      </div>
      <SuggestionBody suggestion={s} />
    </div>
  );
}

function SuggestionBody({ suggestion: s }: { suggestion: Suggestion }) {
  const label = 'text-muted-foreground';
  const change = s.changes[0];
  return (
    <div className="text-foreground-2">
      <div className={label}>{s.title}</div>
      {change ? <ChangeLine change={change} /> : s.text && <span className="italic">“{clip(s.text)}”</span>}
    </div>
  );
}

function ChangeLine({ change: c }: { change: TextChange }) {
  const label = 'text-muted-foreground';
  const ins = c.ins.trim();
  const del = c.del.trim();
  if (ins && del)
    return (
      <>
        <span className={label}>Replace: </span>
        <span className="italic">“{clip(del)}”</span>
        <span className={label}> with </span>
        <span className="italic">“{clip(ins)}”</span>
      </>
    );
  if (ins)
    return (
      <>
        <span className={label}>Add: </span>
        <span className="italic">“{clip(ins)}”</span>
      </>
    );
  if (del)
    return (
      <>
        <span className={label}>Delete: </span>
        <span className="italic">“{clip(del)}”</span>
      </>
    );
  return <span className={label}>Change spacing</span>;
}

/**
 * Tints what a card is about while Accept or Reject is hovered (its change, or its whole block),
 * and the selected card's block. A style rule rather than a class, as the editor draws the
 * block's classes and the changes' marks itself (editor/extensions/trackChanges.ts).
 */
export function SuggestionTint({ hover, active }: { hover: SuggestionHover; active: SuggestionPick }) {
  const rules: string[] = [];
  if (active) {
    const block = `.canvas-pm > [data-block-id="${active.block_id}"]`;
    rules.push(active.part === null ? `${block} { background: var(--suggest-soft); }` : `${block} [data-suggest-part="${active.part}"] { background: var(--suggest-soft); box-shadow: 0 0 0 1px var(--suggest); border-radius: 2px; }`);
  }
  if (hover) {
    const block = `.canvas-pm > [data-block-id="${hover.block_id}"]`;
    const soft = hover.intent === 'accept' ? '--success-soft' : '--destructive-soft';
    const solid = hover.intent === 'accept' ? '--success-solid' : '--danger-solid';
    // The margin bar still marks the block, so the change is easy to find in a long paragraph.
    rules.push(`${block}::after { background: var(${solid}); opacity: 1; width: 3px; }`);
    if (hover.part === null) rules.push(`${block} { background: var(${soft}); }`);
    else rules.push(`${block} [data-suggest-part="${hover.part}"] { background: var(${soft}); box-shadow: 0 0 0 1px var(${solid}); border-radius: 2px; }`);
  }
  return rules.length ? <style>{rules.join('\n')}</style> : null;
}
