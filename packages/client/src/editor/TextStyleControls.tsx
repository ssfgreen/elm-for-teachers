/**
 * Text size, colour, highlight and links, in the toolbar and the selection bubble: one set of
 * controls for both. Size is its own menu (./TextSizeMenu.tsx). Colour opens a row of swatches (Default and the six colours); highlight is yellow, on
 * or off; a link opens a small form for its address, with Remove and Open for a link already there.
 */
import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Baseline, ExternalLink, Highlighter, Link, Unlink } from "lucide-react";
import { IconButton } from "./Toolbar.js";
import { TEXT_COLORS, TEXT_COLOR_LABELS, type TextColor } from "./textColors.js";
import { TextSizeMenu } from "./TextSizeMenu.js";
import { Button } from "../components/ui/button";
import { fieldClass } from "../components/ui/input";
import { useDismiss } from "../components/useDismiss";
import { cn } from "../lib/utils";

/** What a teacher may type as an address: a web address (https:// added when left off) or an email. */
export function normaliseHref(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^(https?:\/\/|mailto:)[^\s)]+$/i.test(s)) return s;
  if (/^[^\s@()]+@[^\s@()]+\.[^\s@()]+$/.test(s)) return `mailto:${s}`;
  if (/^[^\s()]+\.[^\s()]{2,}$/.test(s)) return `https://${s}`;
  return null;
}

const SWATCH: Record<TextColor, string> = {
  red: "bg-text-red",
  yellow: "bg-text-yellow",
  green: "bg-text-green",
  blue: "bg-text-blue",
  teal: "bg-text-teal",
  purple: "bg-text-purple",
};
const popoverClass = "absolute top-full left-0 z-40 mt-1 rounded-md border border-border bg-card p-1.5 shadow-float";

export function TextStyleControls({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      color: (e.getAttributes("textColor").color as TextColor | undefined) ?? null,
      highlight: e.isActive("highlight"),
      href: (e.getAttributes("link").href as string | undefined) ?? null,
      empty: e.state.selection.empty,
    }),
  });
  return (
    <>
      <TextSizeMenu editor={editor} disabled={disabled} />
      <ColorMenu editor={editor} color={state.color} disabled={disabled} />
      <IconButton
        icon={Highlighter}
        label="Highlight (yellow)"
        active={state.highlight}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />
      <LinkControl editor={editor} href={state.href} disabled={disabled || (state.empty && !state.href)} />
    </>
  );
}

function ColorMenu({ editor, color, disabled }: { editor: Editor; color: TextColor | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const pick = (c: TextColor | null) => {
    editor.chain().focus().setTextColor(c).run();
    setOpen(false);
  };
  return (
    <span className="relative inline-flex" ref={ref}>
      <span className="relative inline-flex">
        <IconButton icon={Baseline} label={color ? `Text colour: ${TEXT_COLOR_LABELS[color]}` : "Text colour"} active={open} disabled={disabled} className={cn(open && "after:hidden")} onClick={() => setOpen((o) => !o)} />
        {/* The colour in use, as a bar under the letter. */}
        {color && <span className={cn("pointer-events-none absolute right-2 bottom-1 left-2 h-0.75 rounded-xs", SWATCH[color])} aria-hidden="true" />}
      </span>
      {open && (
        <div className={cn(popoverClass, "flex items-center gap-1")} role="menu" aria-label="Text colour">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={color === null}
            className="flex h-6 items-center rounded-sm border border-border-strong bg-card px-1.5 text-xs text-foreground hover:bg-hover aria-checked:ring-2 aria-checked:ring-ring"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(null)}
          >
            Default
          </button>
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemradio"
              aria-checked={color === c}
              aria-label={TEXT_COLOR_LABELS[c]}
              title={TEXT_COLOR_LABELS[c]}
              className={cn("size-6 cursor-pointer rounded-full border-2 border-card ring-1 ring-border-strong aria-checked:ring-2 aria-checked:ring-ring", SWATCH[c])}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            />
          ))}
        </div>
      )}
    </span>
  );
}

function LinkControl({ editor, href, disabled }: { editor: Editor; href: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const range = useRef<{ from: number; to: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  const start = () => {
    if (open) return setOpen(false);
    // In a link with nothing selected: the whole link.
    if (editor.state.selection.empty && href) editor.chain().extendMarkRange("link").run();
    const { from, to } = editor.state.selection;
    range.current = { from, to };
    setValue(href ?? "");
    setError(false);
    setOpen(true);
  };
  const apply = (next: string | null) => {
    const r = range.current;
    if (!r) return;
    const chain = editor.chain().focus().setTextSelection(r);
    if (next) chain.extendMarkRange("link").setLink({ href: next }).run();
    else chain.extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };
  return (
    <span className="relative inline-flex" ref={ref}>
      <IconButton icon={Link} label={href ? "Edit link" : "Link"} active={open || !!href} disabled={disabled} className={cn(open && "after:hidden")} onClick={start} />
      {open && (
        <form
          className={cn(popoverClass, "flex w-80 flex-col gap-1.5")}
          aria-label="Link"
          onSubmit={(e) => {
            e.preventDefault();
            const next = normaliseHref(value);
            if (!next) return setError(true);
            apply(next);
          }}
        >
          <div className="flex items-center gap-1.5">
            <input
              className={cn(fieldClass, "h-7.5 min-w-0 flex-1 px-2 text-md")}
              autoFocus
              placeholder="https://… or an email address"
              aria-label="Link address"
              aria-invalid={error || undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                  editor.commands.focus();
                }
              }}
            />
            <Button type="submit" variant="primary" size="sm" className="h-7.5 px-2.5">
              {href ? "Save" : "Add"}
            </Button>
          </div>
          {error && <p className="error-text m-0 px-0.5 text-xs">Type a web address (school.org.uk/page) or an email address.</p>}
          {href && (
            <div className="flex items-center gap-1">
              <a className="inline-flex min-w-0 items-center gap-1 truncate px-1 text-sm" href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} aria-hidden="true" className="flex-none" />
                <span className="truncate">Open</span>
              </a>
              <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 px-2 text-sm" onClick={() => apply(null)}>
                <Unlink size={13} aria-hidden="true" /> Remove link
              </Button>
            </div>
          )}
        </form>
      )}
    </span>
  );
}
