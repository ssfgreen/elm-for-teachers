/**
 * The list the slash command opens, positioned under the cursor inside the
 * canvas frame. Keyboard handling lives in the Canvas's bridge; this component
 * only renders and reports hover and clicks.
 */
import { useEffect, useRef } from "react";
import type { SlashItem, SlashMenuState } from "./extensions/slashCommand.js";
import { cn } from "../lib/utils";

/** The menu's look, shared with the @model suggestion under a comment box. */
export const slashMenuClass = "absolute z-20 min-w-70 max-w-90 max-h-80 overflow-y-auto rounded-md border border-border bg-card p-1.5 shadow-pop";
export const slashItemClass = "flex cursor-pointer flex-col gap-px rounded-sm px-2.5 py-1.5 aria-selected:bg-hover";
export const slashTitleClass = "text-md font-semibold text-foreground";
export const slashDescClass = "text-xs text-muted-foreground";

export interface SlashMenuProps {
  state: SlashMenuState;
  selected: number;
  frame: HTMLElement;
  onHover: (index: number) => void;
  onPick: (item: SlashItem) => void;
}

export function SlashMenu({ state, selected, frame, onHover, onPick }: SlashMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const frameRect = frame.getBoundingClientRect();
  const rect = state.rect;
  const top = rect ? rect.bottom - frameRect.top + frame.scrollTop + 6 : 0;
  const left = rect ? Math.max(8, rect.left - frameRect.left) : 8;

  return (
    <div ref={listRef} className={cn("slash-menu", slashMenuClass)} role="listbox" aria-label="Insert" style={{ top, left }} onMouseDown={(e) => e.preventDefault()}>
      {state.items.length === 0 && <div className={cn("px-2.5 py-1.5", slashDescClass)}>No matching block</div>}
      {state.items.map((item, i) => (
        <div
          key={item.title}
          role="option"
          aria-selected={i === selected}
          data-index={i}
          className={cn("slash-item", slashItemClass)}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(item)}
        >
          <span className={cn("slash-title", slashTitleClass)}>{item.title}</span>
          <span className={slashDescClass}>{item.description}</span>
        </div>
      ))}
    </div>
  );
}
