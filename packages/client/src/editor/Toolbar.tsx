/**
 * Block and inline formatting toolbar for the canvas. Icon buttons (Lucide) whose name
 * and shortcut show in a tooltip on hover or keyboard focus (`data-tip`) and are the
 * accessible name; the active block type and marks are highlighted.
 */
import { useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  SeparatorHorizontal,
  Pilcrow,
  Quote,
  SquareCode,
  Table,
  Underline,
} from "lucide-react";
import type { BlockType } from "@edw/shared";
import { MakeSlot } from "../components/slots/slots";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

export interface BlockTypeChoice {
  type: BlockType;
  level?: number;
}

export type MarkName = "bold" | "italic" | "underline" | "code";

export interface ToolbarProps {
  current: BlockTypeChoice;
  marks: Record<MarkName, boolean>;
  readOnly: boolean;
  canUpload: boolean;
  onBlockType: (choice: BlockTypeChoice) => void;
  onMark: (mark: MarkName) => void;
  onInsert: (what: "divider" | "page_break" | "table") => void;
  onImage: (file: File) => void;
  /** Comment on the selected text with @model; absent when the screen has no chat. */
  onAsk?: () => void;
  /** Whether there is a selection to comment on. */
  canAsk?: boolean;
  /** Text size, colour, highlight and link (TextStyleControls), after the other inline formatting. */
  textStyle?: ReactNode;
  /** The table's header row colour (TableHeaderColorMenu), after the Table button; it shows only in a table. */
  tableStyle?: ReactNode;
  /** The document's font and page colour (DocStyleControls), in a group of their own. */
  docStyle?: ReactNode;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";
const ALT = isMac ? "⌥" : "Alt+";
const SHIFT = isMac ? "⇧" : "Shift+";

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** "Name (shortcut)": the tooltip text and the accessible name. */
const tip = (name: string, keys?: string) => (keys ? `${name} (${keys})` : name);

const BLOCKS: Array<{ choice: BlockTypeChoice; icon: LucideIcon; name: string; keys: string }> = [
  { choice: { type: "paragraph" }, icon: Pilcrow, name: "Text", keys: `${MOD}${ALT}0` },
  { choice: { type: "heading", level: 1 }, icon: Heading1, name: "Heading 1", keys: `${MOD}${ALT}1` },
  { choice: { type: "heading", level: 2 }, icon: Heading2, name: "Heading 2", keys: `${MOD}${ALT}2` },
  { choice: { type: "heading", level: 3 }, icon: Heading3, name: "Heading 3", keys: `${MOD}${ALT}3` },
  { choice: { type: "bullet_item" }, icon: List, name: "Bulleted list", keys: `${MOD}${SHIFT}8` },
  { choice: { type: "numbered_item" }, icon: ListOrdered, name: "Numbered list", keys: `${MOD}${SHIFT}7` },
  { choice: { type: "checklist_item" }, icon: ListChecks, name: "Checklist", keys: `${MOD}${SHIFT}9` },
  { choice: { type: "quote" }, icon: Quote, name: "Quote", keys: `${MOD}${SHIFT}.` },
  { choice: { type: "code_block" }, icon: SquareCode, name: "Code block", keys: `${MOD}${ALT}8` },
];

/** Inline marks, shared with the selection (bubble) menu. */
export const MARK_BUTTONS: Array<{ mark: MarkName; icon: LucideIcon; label: string }> = [
  { mark: "bold", icon: Bold, label: tip("Bold", `${MOD}B`) },
  { mark: "italic", icon: Italic, label: tip("Italic", `${MOD}I`) },
  { mark: "underline", icon: Underline, label: tip("Underline", `${MOD}U`) },
  { mark: "code", icon: Code, label: tip("Inline code", `${MOD}E`) },
];

export const ASK_ICON = AtSign;
export const COMMENT_ICON = MessageSquarePlus;

export function sameChoice(a: BlockTypeChoice, b: BlockTypeChoice): boolean {
  return a.type === b.type && (a.type !== "heading" || a.level === b.level);
}

export interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  /** Which way the hover tooltip hangs: centred under the button, or flush with its start or end (near a window edge). */
  tipAlign?: "center" | "start" | "end";
  onClick: () => void;
}

/**
 * A ghost icon button; the label is its accessible name and its hover tooltip.
 * `tip-start` / `tip-end` stay on it as hooks (tests check the tooltip side); `active` shows
 * the pressed look.
 */
export function IconButton({ icon: Icon, label, active, disabled, className, tipAlign = "center", onClick }: IconButtonProps) {
  return (
    <Button
      variant="toolbar"
      size="icon"
      tip={label}
      tipAlign={tipAlign}
      data-active={active || undefined}
      className={cn(tipAlign !== "center" && `tip-${tipAlign}`, className)}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon {...ICON} />
    </Button>
  );
}

/** A group of toolbar buttons, with a hairline before every group but the first. */
const groupClass = "flex items-center gap-px px-1.5 border-border not-first:border-l";

export function Toolbar(props: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const disabled = props.readOnly;
  const isAtom = (t: BlockType) => t === "divider" || t === "page_break" || t === "image";
  const inTable = props.current.type === "table";
  return (
    <div
      className={cn(
        "canvas-toolbar",
        "sticky top-0 z-2 flex flex-wrap items-center gap-x-0 gap-y-1 rounded-t-lg border-b border-border bg-card px-2.5 py-1.5",
        // In the document panel the toolbar is a plain bar under the header.
        "in-[.doc-panel]:static in-[.doc-panel]:flex-none in-[.doc-panel]:rounded-none in-[.doc-panel]:pl-3",
      )}
      role="toolbar"
      aria-label="Formatting"
    >
      <div className={groupClass} aria-label="Block type">
        {BLOCKS.map((b) => (
          <IconButton
            key={b.name}
            icon={b.icon}
            label={tip(b.name, b.keys)}
            active={sameChoice(props.current, b.choice)}
            disabled={disabled || isAtom(props.current.type) || inTable}
            onClick={() => {
              if (!sameChoice(props.current, b.choice)) props.onBlockType(b.choice);
            }}
          />
        ))}
      </div>
      <div className={groupClass} aria-label="Insert">
        <IconButton icon={Minus} label="Divider" disabled={disabled} onClick={() => props.onInsert("divider")} />
        <IconButton icon={SeparatorHorizontal} label={tip("Page break", `${MOD}Enter`)} disabled={disabled || inTable} onClick={() => props.onInsert("page_break")} />
        <IconButton icon={Table} label="Table" disabled={disabled || inTable} onClick={() => props.onInsert("table")} />
        {props.tableStyle}
        <IconButton
          icon={ImagePlus}
          label={props.canUpload ? "Image (PNG, JPEG, GIF, WebP or SVG, up to 5 MB)" : "Image upload is not available here"}
          disabled={disabled || !props.canUpload}
          onClick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg"
          hidden
          aria-label="Choose an image"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImage(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className={groupClass} aria-label="Inline formatting">
        {MARK_BUTTONS.map((m) => (
          <IconButton
            key={m.mark}
            icon={m.icon}
            label={m.label}
            active={props.marks[m.mark]}
            disabled={disabled || props.current.type === "code_block" || isAtom(props.current.type)}
            onClick={() => props.onMark(m.mark)}
          />
        ))}
        {props.textStyle}
      </div>
      {props.docStyle && (
        <div className={groupClass} aria-label="Document">
          {props.docStyle}
        </div>
      )}
      {props.onAsk && (
        <div className={groupClass} aria-label="Assistant">
          <IconButton
            icon={ASK_ICON}
            className="tb-ask text-primary"
            label={props.canAsk ? "Ask the assistant about the selected text (@model)" : "Select some text, then ask the assistant about it (@model)"}
            disabled={disabled || !props.canAsk}
            onClick={props.onAsk}
          />
        </div>
      )}
      <MakeSlot zone="toolbar" />
    </div>
  );
}
