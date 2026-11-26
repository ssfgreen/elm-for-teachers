/**
 * The header row colour of the table the cursor is in, in the toolbar and the selection bubble.
 * Shown only in a table. Opens a row of swatches: Default (the usual grey) and the six text
 * colours as light fills; picking a colour turns the header row on if it was off.
 */
import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { findParentNode } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { PaintBucket } from "lucide-react";
import { IconButton } from "./Toolbar.js";
import { TEXT_COLORS, TEXT_COLOR_LABELS, type TextColor } from "./textColors.js";
import { hasHeaderRow, isHeaderColor } from "./extensions/tableHeaderColor.js";
import { useDismiss } from "../components/useDismiss";
import { cn } from "../lib/utils";

const findTable = findParentNode((n) => n.type.name === "table");
/** The fill as table.css draws it. */
const fill = (c: TextColor) => `color-mix(in srgb, var(--text-${c}) 18%, var(--card))`;
const swatchClass = "size-6 cursor-pointer rounded-full border-2 border-card ring-1 ring-border-strong aria-checked:ring-2 aria-checked:ring-ring";

export function TableHeaderColorMenu({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const table = findTable(e.state.selection)?.node;
      const c = table?.attrs.headerColor as unknown;
      return { inTable: !!table, color: table && hasHeaderRow(table) && isHeaderColor(c) ? c : null };
    },
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  if (!state.inTable) return null;
  const { color } = state;
  const pick = (c: TextColor | null) => {
    editor.chain().focus().setTableHeaderColor(c).run();
    setOpen(false);
  };
  return (
    <span className="relative inline-flex" ref={ref}>
      <span className="relative inline-flex">
        <IconButton
          icon={PaintBucket}
          label={color ? `Header row colour: ${TEXT_COLOR_LABELS[color]}` : "Header row colour"}
          active={open}
          disabled={disabled}
          className={cn(open && "after:hidden")}
          onClick={() => setOpen((o) => !o)}
        />
        {color && <span className="pointer-events-none absolute right-2 bottom-1 left-2 h-0.75 rounded-xs" style={{ background: `var(--text-${color})` }} aria-hidden="true" />}
      </span>
      {open && (
        <div className="absolute top-full left-0 z-40 mt-1 flex items-center gap-1 rounded-md border border-border bg-card p-1.5 shadow-float" role="menu" aria-label="Header row colour">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={color === null}
            aria-label="Default (grey)"
            title="Default (grey)"
            className={cn(swatchClass, "bg-panel")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(null)}
          />
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemradio"
              aria-checked={color === c}
              aria-label={TEXT_COLOR_LABELS[c]}
              title={TEXT_COLOR_LABELS[c]}
              className={swatchClass}
              style={{ background: fill(c) }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            />
          ))}
        </div>
      )}
    </span>
  );
}
