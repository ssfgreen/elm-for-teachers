/**
 * The selected text's size, in the toolbar (with the colour and highlight) and the selection
 * bubble: Small, Normal (the block's own size), Large, Extra large and Huge, each shown at its size.
 * With nothing selected it sets the size for what is typed next.
 */
import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { ALargeSmall, Check } from "lucide-react";
import { IconButton } from "./Toolbar.js";
import { isTextSize, TEXT_SIZE_LABELS, TEXT_SIZE_POINTS, type TextSize } from "./textSizes.js";
import { useDismiss } from "../components/useDismiss";
import { cn } from "../lib/utils";

/** In the menu's order, Normal in its place between Small and Large. */
const CHOICES: ReadonlyArray<TextSize | null> = ["small", null, "large", "x_large", "huge"];

export function TextSizeMenu({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const size = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = e.getAttributes("textSize").size as string | undefined;
      return isTextSize(s) ? s : null;
    },
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const pick = (s: TextSize | null) => {
    editor.chain().focus().setTextSize(s).run();
    setOpen(false);
  };
  const name = (s: TextSize | null) => (s ? TEXT_SIZE_LABELS[s] : "Normal");
  return (
    <span className="relative inline-flex" ref={ref}>
      <IconButton icon={ALargeSmall} label={`Text size: ${name(size)}`} active={open} disabled={disabled} className={cn(open && "after:hidden")} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="absolute top-full left-0 z-40 mt-1 w-60 rounded-md border border-border bg-card p-1.5 shadow-float" role="menu" aria-label="Text size">
          {CHOICES.map((s) => (
            <button
              key={s ?? "normal"}
              type="button"
              role="menuitemradio"
              aria-checked={size === s}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1 text-left text-foreground hover:bg-hover"
              style={{ fontSize: `${s ? TEXT_SIZE_POINTS[s] : 12}pt` }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              <span className="min-w-0 flex-1 truncate">{name(s)}</span>
              {size === s && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
