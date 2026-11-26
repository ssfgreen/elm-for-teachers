/**
 * The document's font and page colour, in the toolbar: set for the whole document (a worksheet
 * in Lexend on cream, say). With text selected, Font sets that text's font instead, over the
 * document's (the selection bubble has the same font menu). Font opens a list under Sans and Serif, each name in its own font; page colour
 * opens a row of swatches.
 */
import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Check, PaintBucket, Type } from "lucide-react";
import { DEFAULT_DOC_FONT, type DocBackground, type DocFont, type DocStyle } from "@edw/shared";
import { IconButton } from "./Toolbar.js";
import { DOC_BACKGROUND_LABELS, DOC_BACKGROUNDS, DOC_FONT_GROUPS, DOC_FONT_LABELS, DOC_FONT_STACKS } from "./docStyle.js";
import { useDismiss } from "../components/useDismiss";
import { cn } from "../lib/utils";

export const SWATCH: Record<DocBackground, string> = {
  cream: "bg-paper-cream",
  yellow: "bg-paper-yellow",
  blue: "bg-paper-blue",
  green: "bg-paper-green",
  pink: "bg-paper-pink",
  lilac: "bg-paper-lilac",
};
// The document group ends the toolbar, near the window edge, so its menus open leftwards.
const popoverClass = "absolute top-full right-0 z-40 mt-1 rounded-md border border-border bg-card p-1.5 shadow-float";
const swatchClass = "size-6 cursor-pointer rounded-full border-2 border-card ring-1 ring-border-strong aria-checked:ring-2 aria-checked:ring-ring";

export function DocStyleControls({ style, editor, disabled, onChange }: { style: DocStyle; editor?: Editor; disabled?: boolean; onChange: (style: DocStyle) => void }) {
  const set = (next: Partial<Record<keyof DocStyle, DocFont | DocBackground | null>>) => {
    const merged = { ...style, ...next };
    onChange({ ...(merged.font ? { font: merged.font as DocFont } : {}), ...(merged.background ? { background: merged.background as DocBackground } : {}) });
  };
  return (
    <>
      {editor ? (
        <EditorFontMenu editor={editor} docFont={style.font ?? null} disabled={disabled} onPickDoc={(font) => set({ font })} />
      ) : (
        <FontMenu font={style.font ?? null} disabled={disabled} onPick={(font) => set({ font })} />
      )}
      <PaperMenu background={style.background ?? null} disabled={disabled} onPick={(background) => set({ background })} />
    </>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  return { open, setOpen, ref };
}

/** With text selected the menu sets that text's font, over the document's; otherwise the document's. */
function EditorFontMenu({ editor, docFont, disabled, onPickDoc }: { editor: Editor; docFont: DocFont | null; disabled?: boolean; onPickDoc: (f: DocFont | null) => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ selected: !e.state.selection.empty && e.isEditable }),
  });
  if (!state.selected) return <FontMenu font={docFont} disabled={disabled} onPick={onPickDoc} />;
  return <SelectionFontMenu editor={editor} disabled={disabled} />;
}

/** The selected text's font, over the document's; in the toolbar and the selection bubble. */
export function SelectionFontMenu({ editor, disabled, opensRight }: { editor: Editor; disabled?: boolean; opensRight?: boolean }) {
  const font = useEditorState({ editor, selector: ({ editor: e }) => (e.getAttributes("textFont").font as DocFont | undefined) ?? null });
  return <FontMenu font={font} forSelection opensRight={opensRight} disabled={disabled} onPick={(f) => editor.chain().focus().setTextFont(f).run()} />;
}

const headingClass = "px-2.5 pt-2 pb-0.5 text-xs font-medium text-muted-foreground";

function FontMenu({
  font,
  forSelection,
  opensRight,
  disabled,
  onPick,
}: {
  font: DocFont | null;
  forSelection?: boolean;
  /** Open the list rightwards from the button (in the bubble), not leftwards (at the toolbar's end). */
  opensRight?: boolean;
  disabled?: boolean;
  onPick: (f: DocFont | null) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  // A doc with no font is in Calibri, so the document's menu shows it as Calibri, and choosing
  // Calibri leaves the doc with no font. Selected text keeps "Document’s font", which clears its own.
  const shown = forSelection ? font : (font ?? DEFAULT_DOC_FONT);
  const pick = (f: DocFont | null) => onPick(!forSelection && f === DEFAULT_DOC_FONT ? null : f);
  const item = (f: DocFont | null) => (
    <button
      key={f ?? "default"}
      type="button"
      role="menuitemradio"
      aria-checked={shown === f}
      className="flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-base text-foreground hover:bg-hover"
      style={f ? { fontFamily: DOC_FONT_STACKS[f] } : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        pick(f);
        setOpen(false);
      }}
    >
      <span className="min-w-0 flex-1 truncate">{f ? DOC_FONT_LABELS[f] : "Document’s font"}</span>
      {shown === f && <Check size={14} aria-hidden="true" />}
    </button>
  );
  // A font no longer offered stays listed while it is the one in use.
  const offered = DOC_FONT_GROUPS.flatMap((g) => g.fonts);
  const groups = DOC_FONT_GROUPS.map((g, i) => (i === 0 && font && !offered.includes(font) ? { ...g, fonts: [...g.fonts, font] } : g));
  const name = shown ? DOC_FONT_LABELS[shown] : "Document’s font";
  const menuLabel = forSelection ? "Font for the selection" : "Document font";
  return (
    <span className="relative inline-flex" ref={ref}>
      <IconButton icon={Type} label={`${menuLabel}: ${name}`} active={open} disabled={disabled} className={cn(open && "after:hidden")} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className={cn(popoverClass, "w-52", opensRight && "right-auto left-0")} role="menu" aria-label={menuLabel}>
          {forSelection && item(null)}
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className={headingClass} aria-hidden="true">
                {g.label}
              </div>
              {g.fonts.map(item)}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

function PaperMenu({ background, disabled, onPick }: { background: DocBackground | null; disabled?: boolean; onPick: (b: DocBackground | null) => void }) {
  const { open, setOpen, ref } = usePopover();
  const pick = (b: DocBackground | null) => {
    onPick(b);
    setOpen(false);
  };
  return (
    <span className="relative inline-flex" ref={ref}>
      <span className="relative inline-flex">
        <IconButton
          icon={PaintBucket}
          label={`Page colour: ${background ? DOC_BACKGROUND_LABELS[background] : "White"}`}
          active={open}
          disabled={disabled}
          className={cn(open && "after:hidden")}
          onClick={() => setOpen((o) => !o)}
        />
        {background && <span className={cn("pointer-events-none absolute right-2 bottom-1 left-2 h-0.75 rounded-xs ring-1 ring-border-strong", SWATCH[background])} aria-hidden="true" />}
      </span>
      {open && (
        <div className={cn(popoverClass, "flex items-center gap-1")} role="menu" aria-label="Page colour">
          <button type="button" role="menuitemradio" aria-checked={background === null} aria-label="White" title="White" className={cn(swatchClass, "bg-card")} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)} />
          {DOC_BACKGROUNDS.map((b) => (
            <button
              key={b}
              type="button"
              role="menuitemradio"
              aria-checked={background === b}
              aria-label={DOC_BACKGROUND_LABELS[b]}
              title={DOC_BACKGROUND_LABELS[b]}
              className={cn(swatchClass, SWATCH[b])}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(b)}
            />
          ))}
        </div>
      )}
    </span>
  );
}
