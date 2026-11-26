/**
 * The block canvas: a Tiptap editor over one doc.
 *
 * Local-first (PLAN.md): the teacher edits freely; after each transaction the
 * top-level blocks are diffed against the last snapshot (sync.ts) and structural
 * commands go to the server in the background, while content edits go out as
 * keystroke batches (batcher.ts). Blocks coming back from the server (proposals,
 * other changes) are reconciled into the document without clobbering unflushed
 * typing or commands still in flight.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { NodeSelection, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { logPaste } from "../events/trackers.js";
import { buildExtensions, canvasSchema } from "./extensions/index.js";
import { imageFileFrom, startImageUpload } from "./extensions/image.js";
import { docFromBlocks } from "./markdown.js";
import { AskPrompt } from "./AskPrompt.js";
import { SlashMenu } from "./SlashMenu.js";
import { useSlashMenu } from "./useSlashMenu.js";
import { ContextMenu, type ContextMenuKind } from "./ContextMenu.js";
import { Toolbar } from "./Toolbar.js";
import { useToolbarCommands } from "./useToolbarCommands.js";
import { useAskAndComment } from "./useAskAndComment.js";
import { SelectionMenu } from "./SelectionMenu.js";
import { DocStyleControls } from "./DocStyleControls.js";
import { pageStyle } from "./docStyle.js";
import { TextStyleControls } from "./TextStyleControls.js";
import { TableHeaderColorMenu } from "./TableHeaderColorMenu.js";
import { setCommentMarks } from "./extensions/commentMarks.js";
import type { CanvasProps } from "./types.js";
import { syncTransaction, useSyncMachine, type Machine } from "./useSyncMachine.js";
import { MakeSlot } from "../components/slots/slots";
import { useInlineSlot } from "../components/slots/inlineSlot";
import { cn } from "../lib/utils";

export function Canvas(props: CanvasProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const machineRef = useRef<Machine | null>(null);
  const [, setTick] = useState(0);
  /** Opens the inline @model prompt (useAskAndComment sets it; the "@" menu calls it). */
  const openAskRef = useRef<() => void>(() => undefined);
  /** Right-click menu on a table cell or an image, positioned in the canvas frame. */
  const [contextMenu, setContextMenu] = useState<{ kind: ContextMenuKind; top: number; left: number } | null>(null);
  const openContextMenuRef = useRef<(kind: ContextMenuKind, x: number, y: number) => void>(() => undefined);

  /* ---------------------------------------------------------- slash menu */
  const { bridgeRef, pickRef, menu, selected, setSelected } = useSlashMenu();

  /* ------------------------------------------------------------- editor */
  const extensions = useMemo(
    () =>
      buildExtensions({
        readOnly: () => propsRef.current.readOnly || !!propsRef.current.busy,
        resolveAssetUrl: (src) => propsRef.current.resolveAssetUrl?.(src) ?? src,
        slashBridge: () => bridgeRef.current,
        canUpload: () => !!propsRef.current.uploadImage,
        pickImage: () => fileRef.current?.click(),
        canAsk: () => !propsRef.current.readOnly && !propsRef.current.busy && !!propsRef.current.onSendComment,
        openAskPrompt: () => openAskRef.current(),
        onCommentSelect: (id) => propsRef.current.onCommentSelect?.(id),
      }),
    // bridgeRef is a ref from useSlashMenu: it never changes, so the extensions are built once.
    [bridgeRef],
  );

  const upload = useCallback((view: EditorView, pos: number, file: File) => {
    const fn = propsRef.current.uploadImage;
    if (!fn) return false;
    startImageUpload(view, pos, file, fn, (err) => console.error("image upload failed", err));
    return true;
  }, []);

  const onTransaction = useCallback(({ editor, transaction }: { editor: Editor; transaction: Transaction }) => {
    const m = machineRef.current;
    if (!m) return;
    syncTransaction(m, editor, transaction, propsRef.current);
    setTick((t) => t + 1);
  }, []);

  const editor = useEditor(
    {
      extensions,
      content: docFromBlocks(canvasSchema(), props.blocks, props.docId).toJSON() as object,
      editable: !props.readOnly,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: "canvas-pm", "data-doc-id": props.docId },
        handlePaste(view, event) {
          const m = machineRef.current;
          const img = imageFileFrom(event.clipboardData?.files);
          if (img && upload(view, view.state.selection.from, img)) {
            event.preventDefault();
            return true;
          }
          const text = event.clipboardData?.getData("text/plain") ?? "";
          const source = m?.marker.classify(text || null, text.length) ?? null;
          const $from = view.state.selection.$from;
          const blockId = $from.depth >= 1 ? ($from.node(1).attrs.id as string | null) : null;
          if (source && blockId) logPaste(propsRef.current.logger, { kind: "block", block_id: blockId }, text.length, source);
          return false;
        },
        handleDOMEvents: {
          // Right-click in a table cell or on an image: select it and show our menu instead of the browser's.
          contextmenu(view, event) {
            if (!view.editable) return false;
            const target = event.target as HTMLElement | null;
            const figure = target?.closest?.(".blk-image");
            if (figure && view.dom.contains(figure)) {
              let at = -1;
              view.state.doc.forEach((node, offset) => {
                if (at === -1 && node.type.name === "image" && view.nodeDOM(offset) === figure) at = offset;
              });
              if (at === -1) return false;
              event.preventDefault();
              view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
              openContextMenuRef.current("image", event.clientX, event.clientY);
              return true;
            }
            const cell = target?.closest?.("td, th");
            if (!cell || !view.dom.contains(cell)) return false;
            event.preventDefault();
            const pos = view.posAtDOM(cell, 0);
            const $pos = view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size));
            view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
            openContextMenuRef.current("table", event.clientX, event.clientY);
            return true;
          },
        },
        handleDrop(view, event, _slice, moved) {
          if (moved) return false;
          const img = imageFileFrom(event.dataTransfer?.files);
          if (!img) return false;
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
          if (!upload(view, at, img)) return false;
          event.preventDefault();
          return true;
        },
      },
      onTransaction,
    },
    // Another doc means another document, so a new editor.
    [props.docId],
  );

  // While the assistant writes, the doc is locked; redraw so the marks hide and come back. Typing
  // still in the batch goes first: a block with unsent typing keeps the editor's text over the
  // preview, and the turn's commit must see that typing to keep it (Editing mode, typed-during.ts).
  useEffect(() => {
    if (!editor || editor.isDestroyed || props.readOnly) return;
    if (props.busy) machineRef.current?.batcher.flush();
    editor.setEditable(!props.busy, false);
    editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  }, [editor, props.busy, props.readOnly]);

  useSyncMachine({ editor, machineRef, propsRef, frameRef, blocks: props.blocks, docId: props.docId });

  /* ---------------------------------------------- click anywhere places the cursor */
  useEffect(() => {
    const root = frameRef.current;
    if (!root || !editor) return;
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || propsRef.current.readOnly || editor.isDestroyed) return;
      const target = event.target as HTMLElement | null;
      if (!target || editor.view.dom.contains(target) || target.closest(".canvas-toolbar, .slash-menu, .bubble-menu, .drag-handle")) return;
      event.preventDefault();
      const box = editor.view.dom.getBoundingClientRect();
      const doc = editor.state.doc;
      let sel: Selection;
      if (event.clientY >= box.bottom) sel = Selection.atEnd(doc);
      else if (event.clientY <= box.top) sel = Selection.atStart(doc);
      else {
        const left = Math.min(Math.max(event.clientX, box.left + 1), box.right - 1);
        const hit = editor.view.posAtCoords({ left, top: event.clientY });
        sel = hit ? TextSelection.near(doc.resolve(hit.pos)) : Selection.atEnd(doc);
      }
      editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView());
      editor.view.focus();
    };
    root.addEventListener("mousedown", onMouseDown, true);
    return () => root.removeEventListener("mousedown", onMouseDown, true);
  }, [editor]);

  /* ------------------------------------------------------------ toolbar */
  // Recomputed every render; transactions re-render through setTick.
  const { current, onBlockType, onMark, onInsert } = useToolbarCommands(editor);

  /* ------------------------------------------- @model prompt, ask and comment */
  const { ask, closeAsk, submitAsk, askModel, commentOnSelection } = useAskAndComment({ editor, frameRef, machineRef, propsRef, openAskRef });

  openContextMenuRef.current = (kind, x, y) => {
    const frame = frameRef.current;
    if (!frame) return;
    const box = frame.getBoundingClientRect();
    // Keep the menu inside the frame horizontally; 230px is the menu's width.
    setContextMenu({ kind, top: y - box.top + 2, left: Math.max(4, Math.min(x - box.left + 2, box.width - 234)) });
  };
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // The threads to highlight, whenever they or the selected one change.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(setCommentMarks(editor.state.tr, props.comments ?? [], props.activeComment ?? null));
  }, [editor, props.comments, props.activeComment]);

  const onImage = useCallback(
    (file: File) => {
      if (editor) upload(editor.view, editor.state.selection.from, file);
    },
    [editor, upload],
  );

  // The make kit's place inside the worksheet (nothing outside the kit).
  const inlineSlot = useInlineSlot(editor);

  const marks = editor
    ? { bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"), code: editor.isActive("code") }
    : { bold: false, italic: false, underline: false, code: false };
  return (
    <div
      ref={frameRef}
      className={cn(
        "canvas-frame",
        "relative flex flex-col rounded-lg border border-border bg-card shadow-card",
        // Inside the document panel the card loses its own frame: the panel is the page. It
        // grows from about 22rem, so the comments column beside it gives way first.
        "in-[.doc-panel]:min-h-0 in-[.doc-panel]:min-w-0 in-[.doc-panel]:grow in-[.doc-panel]:basis-88 in-[.doc-panel]:rounded-none in-[.doc-panel]:border-0 in-[.doc-panel]:shadow-none",
        props.readOnly && "read-only",
        props.busy && "busy",
      )}
    >
      {!props.readOnly && (
        <Toolbar
          current={current}
          marks={marks}
          readOnly={props.readOnly || !!props.busy}
          canUpload={!!props.uploadImage}
          onBlockType={onBlockType}
          onMark={onMark}
          onInsert={onInsert}
          onImage={onImage}
          onAsk={props.onAskModel ? askModel : undefined}
          canAsk={!!editor && !editor.state.selection.empty && !(editor.state.selection instanceof NodeSelection)}
          textStyle={editor ? <TextStyleControls editor={editor} disabled={props.readOnly || !!props.busy || ["code_block", "divider", "page_break", "image"].includes(current.type)} /> : undefined}
          tableStyle={editor ? <TableHeaderColorMenu editor={editor} disabled={props.readOnly || !!props.busy} /> : undefined}
          docStyle={props.onDocStyle ? <DocStyleControls style={props.docStyle ?? {}} editor={editor ?? undefined} disabled={!!props.busy} onChange={props.onDocStyle} /> : undefined}
        />
      )}
      <MakeSlot zone="doctabs" />
      <MakeSlot zone="doc" />
      <EditorContent editor={editor} className={`canvas${props.readOnly ? " read-only" : ""}`} style={pageStyle(props.docStyle)} data-doc-id={props.docId} data-scroll-root="" />
      {inlineSlot}
      <MakeSlot zone="docfooter" />
      {editor && !props.readOnly && (
        <>
          <DragHandle
            editor={editor}
            className="drag-handle flex h-6 w-4.5 cursor-grab items-center justify-center rounded-xs text-xs tracking-tighter text-muted-foreground select-none hover:bg-hover hover:text-foreground active:cursor-grabbing"
          >
            <span className="drag-grip" aria-hidden="true">
              ⋮⋮
            </span>
          </DragHandle>
          <SelectionMenu
            editor={editor}
            marks={marks}
            onMark={onMark}
            onAsk={props.onAskModel ? askModel : undefined}
            onComment={props.onComment ? commentOnSelection : undefined}
          />
        </>
      )}
      {menu && frameRef.current && (
        <SlashMenu state={menu} selected={selected} frame={frameRef.current} onHover={setSelected} onPick={(item) => pickRef.current(item)} />
      )}
      {contextMenu && editor && (
        <ContextMenu editor={editor} kind={contextMenu.kind} top={contextMenu.top} left={contextMenu.left} onClose={closeContextMenu} />
      )}
      {ask && <AskPrompt top={ask.top} left={ask.left} logger={props.logger} onSubmit={submitAsk} onCancel={closeAsk} />}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg"
        hidden
        aria-label="Choose an image"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImage(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
