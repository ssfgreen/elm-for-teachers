/**
 * The selection (bubble) menu: floats over selected text with ask, comment, the inline marks and
 * the font, size, colour, highlight and link controls, and in a table its header row colour. Not shown in a code block, on an image or for a whole-node selection.
 */
import { useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import { BubbleMenu } from "@tiptap/react/menus";
import { ASK_ICON, COMMENT_ICON, IconButton, MARK_BUTTONS, type MarkName } from "./Toolbar.js";
import { TextStyleControls } from "./TextStyleControls.js";
import { SelectionFontMenu } from "./DocStyleControls.js";
import { TableHeaderColorMenu } from "./TableHeaderColorMenu.js";

export interface SelectionMenuProps {
  editor: Editor;
  /** Which inline marks the selection has. */
  marks: Record<MarkName, boolean>;
  onMark: (mark: MarkName) => void;
  onAsk?: () => void;
  onComment?: () => void;
}

export function SelectionMenu({ editor, marks, onMark, onAsk, onComment }: SelectionMenuProps) {
  // BubbleMenu re-registers (and dispatches) whenever shouldShow changes identity, so keep it stable.
  const shouldShow = useCallback(
    ({ editor: ed, state }: { editor: Editor; state: EditorState }) =>
      ed.isEditable && !state.selection.empty && !(state.selection instanceof NodeSelection) && !ed.isActive("codeBlock") && !ed.isActive("image"),
    [],
  );
  return (
    <BubbleMenu editor={editor} className="bubble-menu flex gap-0.5 rounded-md border border-border bg-card p-0.75 shadow-pop" shouldShow={shouldShow}>
      {onAsk && <IconButton icon={ASK_ICON} className="tb-ask text-primary" label="Ask the assistant about this text (@model)" onClick={onAsk} />}
      {onComment && <IconButton icon={COMMENT_ICON} label="Comment" onClick={onComment} />}
      {MARK_BUTTONS.map((m) => (
        <IconButton key={m.mark} icon={m.icon} label={m.label} active={marks[m.mark]} onClick={() => onMark(m.mark)} />
      ))}
      <SelectionFontMenu editor={editor} opensRight />
      <TextStyleControls editor={editor} />
      <TableHeaderColorMenu editor={editor} />
    </BubbleMenu>
  );
}
