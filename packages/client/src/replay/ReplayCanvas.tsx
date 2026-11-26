/**
 * A doc drawn by the editor's own extensions, schema, toolbar, bubble menu and CSS, so blocks,
 * suggestions (tracked changes), comment highlights and the selection look as they did. It is not
 * `Canvas`: that editor owns the text of ordinary blocks and would not take the replay's typing
 * from outside (reconcile.ts). Here the whole doc is set again whenever a block changes.
 *
 * The editor is editable, as the teacher's was (the bubble menu shows only then); the stage
 * around it is inert, so nothing here can be typed into or clicked.
 */
import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import type { DocStyle } from '@edw/shared';
import { buildExtensions, canvasSchema } from '../editor/extensions/index.js';
import { setCommentMarks, type CommentMark } from '../editor/extensions/commentMarks.js';
import { docFromBlocks } from '../editor/markdown.js';
import { pageStyle } from '../editor/docStyle.js';
import { DocStyleControls } from '../editor/DocStyleControls.js';
import { SelectionMenu } from '../editor/SelectionMenu.js';
import { TableHeaderColorMenu } from '../editor/TableHeaderColorMenu.js';
import { TextStyleControls } from '../editor/TextStyleControls.js';
import { Toolbar } from '../editor/Toolbar.js';
import { currentChoice } from '../editor/useToolbarCommands.js';
import type { PublicBlock } from '../editor/types';
import { useSame } from './useSame';

const noop = () => undefined;

export interface ReplayCanvasProps {
  docId: string;
  blocks: PublicBlock[];
  style: DocStyle | undefined;
  marks: CommentMark[];
  selection: { block_id: string; from: number; to: number } | null;
  /** The logged scroll position; without one, the first block on screen goes to the top. */
  scrollTop: number | null;
  firstVisible: string | null;
}

export function ReplayCanvas({ docId, blocks, style, marks, selection, scrollTop, firstVisible }: ReplayCanvasProps) {
  const same = useSame(blocks, blocks.map((b) => [b.id, b.type, b.status, b.content, JSON.stringify(b.pending)].join('\u0001')).join('\u0002'));
  const extensions = useMemo(() => buildExtensions({ readOnly: () => false }), []);
  const content = useMemo(() => docFromBlocks(canvasSchema(), same, docId).toJSON() as object, [same, docId]);
  const editor = useEditor(
    { extensions, content, editable: true, immediatelyRender: true, shouldRerenderOnTransaction: false, editorProps: { attributes: { class: 'canvas-pm', 'data-doc-id': docId } } },
    [docId],
  );

  // The doc is set again only when it changed: setting it rebuilds the page, and its scroll.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);

  // Then the comment highlights and the teacher's selection on it.
  const marksKey = JSON.stringify(marks);
  const selKey = selection ? `${selection.block_id}:${selection.from}:${selection.to}` : '';
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const tr = setCommentMarks(editor.state.tr, marks, null);
    const at = selection ? blockStart(editor.state.doc, selection.block_id) : null;
    if (selection && at !== null) {
      const max = editor.state.doc.content.size;
      const clamp = (n: number) => Math.max(0, Math.min(max, n));
      tr.setSelection(TextSelection.create(editor.state.doc, clamp(at + selection.from), clamp(at + selection.to)));
    }
    editor.view.dispatch(tr.setMeta('addToHistory', false));
    // marksKey and selKey stand for marks and selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content, marksKey, selKey]);

  // The page's scroll, after every render and again on the next frame: a doc opened anew has
  // its page attached by Tiptap after this render, and scrolling an empty page does nothing.
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const apply = () => {
      const scroller = frame.current?.querySelector<HTMLElement>('.canvas');
      if (!scroller) return;
      const target = firstVisible ? scroller.querySelector<HTMLElement>(`[data-block-id="${firstVisible}"]`) : null;
      const want = scrollTop ?? (target ? target.offsetTop - 24 : 0);
      if (Math.abs(scroller.scrollTop - want) > 1) scroller.scrollTop = want;
    };
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  });

  const active = editor
    ? { bold: editor.isActive('bold'), italic: editor.isActive('italic'), underline: editor.isActive('underline'), code: editor.isActive('code') }
    : { bold: false, italic: false, underline: false, code: false };
  const hasText = !!selection && selection.from !== selection.to;
  return (
    // As Canvas's frame inside the document panel (DocColumn).
    <div ref={frame} className="canvas-frame relative flex min-h-0 min-w-0 grow basis-88 flex-col bg-card">
      <Toolbar
        current={currentChoice(editor)}
        marks={active}
        readOnly={false}
        canUpload
        onBlockType={noop}
        onMark={noop}
        onInsert={noop}
        onImage={noop}
        onAsk={noop}
        canAsk={hasText}
        textStyle={editor ? <TextStyleControls editor={editor} /> : undefined}
        tableStyle={editor ? <TableHeaderColorMenu editor={editor} /> : undefined}
        docStyle={<DocStyleControls style={style ?? {}} editor={editor ?? undefined} onChange={noop} />}
      />
      <EditorContent editor={editor} className="canvas" style={pageStyle(style)} data-doc-id={docId} data-scroll-root="" />
      {editor && <SelectionMenu editor={editor} marks={active} onMark={noop} onAsk={noop} onComment={noop} />}
    </div>
  );
}

/** Where a top-level block's content starts in the editor's doc, or null. */
function blockStart(doc: import('@tiptap/pm/model').Node, id: string): number | null {
  let at: number | null = null;
  doc.forEach((node, offset) => {
    if (at === null && node.attrs.id === id) at = offset + 1;
  });
  return at;
}
