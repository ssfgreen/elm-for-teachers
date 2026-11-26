/**
 * A word in a reply that shows a card on hover, focus or tap, as the claim "i" does
 * (pedagogy/ClaimInfo.tsx). The card is fixed to the window so the chat's scroll does not clip it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface HoverCardProps {
  /** The word as the reply wrote it. */
  label: ReactNode;
  /** What a screen reader says the word opens, e.g. "tidy-puffin's row in P7A". */
  ariaLabel: string;
  /** The card, drawn while it is open. */
  card: () => ReactNode;
  /** A click on the word itself, when it leads somewhere (else a click toggles the card). */
  onActivate?: () => void;
  kind: string;
}

/** The card open now, if any: opening another closes it at once, so two never overlap. */
let closeOpen: (() => void) | null = null;

export function HoverCard({ label, ariaLabel, card, onActivate, kind }: HoverCardProps) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  // Leaving waits a moment, so the pointer can cross to the card and use a button on it.
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stay = () => {
    if (leaving.current) clearTimeout(leaving.current);
    leaving.current = null;
  };
  // One function for the life of the card, so `closeOpen` can be compared with it.
  const [close] = useState(() => () => {
    if (leaving.current) clearTimeout(leaving.current);
    leaving.current = null;
    setAt(null);
    if (closeOpen === close) closeOpen = null;
  });
  useEffect(() => close, [close]);
  const hide = close;
  const show = () => {
    stay();
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 336)), top: r.bottom + 4 });
  };
  const hideSoon = () => {
    stay();
    leaving.current = setTimeout(hide, 200);
  };
  return (
    <span className="relative inline" onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        ref={ref}
        type="button"
        data-mention={kind}
        aria-label={ariaLabel}
        aria-expanded={!!at}
        className="inline cursor-pointer rounded-xs border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] text-primary underline decoration-dotted underline-offset-2 hover:bg-primary-soft"
        onFocus={show}
        onBlur={hideSoon}
        onClick={() => (onActivate ? onActivate() : at ? hide() : show())}
      >
        {label}
      </button>
      {at && (
        <span role="tooltip" onFocus={stay} onBlur={hideSoon} className={cn('fixed z-50 block w-80 rounded-md border border-border bg-card p-3 text-left text-sm leading-normal not-italic shadow-card')} style={{ left: at.left, top: at.top }}>
          {card()}
        </span>
      )}
    </span>
  );
}
