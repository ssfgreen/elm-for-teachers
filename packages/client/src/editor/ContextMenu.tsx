/**
 * The editor's right-click menu. In a table: insert rows above or below and columns
 * left or right, toggle the header row, delete the row, column or table, acting on the
 * right-clicked cell. On an image: delete it. Escape, a click elsewhere or scrolling
 * close it; arrow keys move through it.
 */
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import { BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, Columns2, PanelTop, Rows2, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";

export type ContextMenuKind = "table" | "image";

export interface ContextMenuProps {
  editor: Editor;
  kind: ContextMenuKind;
  top: number;
  left: number;
  onClose: () => void;
}

interface Item {
  label: string;
  icon: LucideIcon;
  run: (e: Editor) => boolean;
  can: (e: Editor) => boolean;
  danger?: boolean;
}

const TABLE_GROUPS: Item[][] = [
  [
    { label: "Insert row above", icon: BetweenHorizontalStart, run: (e) => e.chain().focus().addRowBefore().run(), can: (e) => e.can().addRowBefore() },
    { label: "Insert row below", icon: BetweenHorizontalEnd, run: (e) => e.chain().focus().addRowAfter().run(), can: (e) => e.can().addRowAfter() },
    { label: "Insert column left", icon: BetweenVerticalStart, run: (e) => e.chain().focus().addColumnBefore().run(), can: (e) => e.can().addColumnBefore() },
    { label: "Insert column right", icon: BetweenVerticalEnd, run: (e) => e.chain().focus().addColumnAfter().run(), can: (e) => e.can().addColumnAfter() },
  ],
  [{ label: "Header row", icon: PanelTop, run: (e) => e.chain().focus().toggleHeaderRow().run(), can: (e) => e.can().toggleHeaderRow() }],
  [
    { label: "Delete row", icon: Rows2, run: (e) => e.chain().focus().deleteRow().run(), can: (e) => e.can().deleteRow(), danger: true },
    { label: "Delete column", icon: Columns2, run: (e) => e.chain().focus().deleteColumn().run(), can: (e) => e.can().deleteColumn(), danger: true },
    { label: "Delete table", icon: Trash2, run: (e) => e.chain().focus().deleteTable().run(), can: (e) => e.can().deleteTable(), danger: true },
  ],
];

/** The right-clicked image is the node selection when the menu opens. */
const IMAGE_GROUPS: Item[][] = [
  [{ label: "Delete image", icon: Trash2, run: (e) => e.chain().focus().deleteSelection().run(), can: (e) => !e.state.selection.empty, danger: true }],
];

const GROUPS: Record<ContextMenuKind, Item[][]> = { table: TABLE_GROUPS, image: IMAGE_GROUPS };
const LABEL: Record<ContextMenuKind, string> = { table: "Table", image: "Image" };

export function ContextMenu({ editor, kind, top, left, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        editor.commands.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [editor, onClose]);

  const move = (dir: 1 | -1) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + dir + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={ref}
      className="absolute z-25 w-57.5 rounded-md border border-border bg-card p-1 shadow-float"
      role="menu"
      aria-label={LABEL[kind]}
      style={{ top, left }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {GROUPS[kind].map((group, g) => (
        <div key={g} className="border-border not-first:mt-1 not-first:border-t not-first:pt-1" role="group">
          {group.map(({ label, icon: Icon, run, can, danger }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm text-foreground [&_svg]:flex-none [&_svg]:text-foreground-2",
                "hover:enabled:bg-hover focus-visible:bg-hover focus-visible:shadow-none",
                danger &&
                  "hover:enabled:bg-destructive-soft hover:enabled:text-destructive focus-visible:bg-destructive-soft focus-visible:text-destructive hover:enabled:[&_svg]:text-destructive focus-visible:[&_svg]:text-destructive",
              )}
              disabled={!can(editor)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                run(editor);
                onClose();
              }}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden={true} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
