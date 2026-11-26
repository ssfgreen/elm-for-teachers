/**
 * The editor against a simulated server: the real shared canvas model applies each
 * structural command and keystroke batch after a network delay, and the wrapper merges
 * responses into its snapshot exactly as WorkspaceScreen does. Catches the races the
 * unit tests in canvas.test.tsx cannot, where the server's answer arrives while the
 * teacher keeps typing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  applyOperations,
  createState,
  deleteBlock,
  editBlock,
  insertBlock,
  mergeBlocks,
  moveBlock,
  newUlid,
  nowIso,
  retypeBlock,
  splitBlock,
  type Block,
  type BlockContent,
  type CanvasState,
  type Changes,
  type Operation,
} from "@edw/shared";
import { Canvas } from "./Canvas.js";
import type { CanvasSnapshot, PublicBlock, StructuralCommand, StructuralResponse } from "./types.js";
import type { EventLogger } from "../events/logger.js";
import { mergeChanges, applyLocalEdit } from "../state/canvasState.js";
import { installEditorPolyfills, testDoc } from "../test-utils.js";

const DOC = "01ARZ3NDEKTSV4RRFFQ69G5D0C";
const LATENCY_MS = 300;
const ctx = { now: nowIso, newId: newUlid };

/** The server: shared canvas model, answers after LATENCY_MS. */
function fakeServer(initial: Block[] = []) {
  const state: CanvasState = createState("S1", initial, [testDoc({ id: DOC })]);
  const later = <T,>(fn: () => T) => new Promise<T>((resolve, reject) => setTimeout(() => {
    try {
      resolve(fn());
    } catch (e) {
      reject(e);
    }
  }, LATENCY_MS));
  const pub = (c: Changes): StructuralResponse["changes"] => ({ blocks: c.blocks.map(strip), docs: c.docs, revisions: [] });
  const apply = (cmd: StructuralCommand): StructuralResponse => {
    const cause = newUlid();
    switch (cmd.command) {
      case "insert": {
        const r = insertBlock(state, ctx, { id: cmd.id, doc_id: cmd.doc_id, after: cmd.after, type: cmd.type, content: cmd.content ?? "", origin: "teacher", status: "live", actor: "teacher", cause_event_id: cause });
        return { changes: pub(r.changes), block: strip(r.block), doc: null };
      }
      case "split": {
        const r = splitBlock(state, ctx, { ...cmd, cause_event_id: cause });
        return { changes: pub(r.changes), block: strip(r.second), doc: null };
      }
      case "merge": {
        const r = mergeBlocks(state, ctx, { ...cmd, cause_event_id: cause });
        return { changes: pub(r.changes), block: strip(r.target), doc: null };
      }
      case "delete":
        return { changes: pub(deleteBlock(state, ctx, cmd).changes), block: null, doc: null };
      case "move":
        return { changes: pub(moveBlock(state, ctx, cmd).changes), block: null, doc: null };
      case "retype": {
        const r = retypeBlock(state, ctx, { ...cmd, cause_event_id: cause });
        return { changes: pub(r.changes), block: strip(r.block), doc: null };
      }
      default:
        throw new Error(`unsupported ${cmd.command}`);
    }
  };
  return {
    state,
    structural: (cmd: StructuralCommand) => later(() => apply(cmd)),
    keystroke: (blockId: string, after: BlockContent) => editBlock(state, ctx, { block_id: blockId, after, cause_event_id: newUlid() }),
    propose: (operations: Operation[]) => pub(applyOperations(state, ctx, { operations, turn_id: "t1", cause_event_id: newUlid(), thread_id: testDoc({ id: DOC }).thread_id, default_doc_id: DOC }).changes),
    visible: () => [...state.blocks.values()].filter((b) => b.status === "live" || b.status === "proposed").sort((a, b) => a.order - b.order),
  };
}
function strip(b: Block): PublicBlock {
  const rest: Partial<Block> = { ...b };
  delete rest.origin;
  delete rest.origin_turn;
  return rest as PublicBlock;
}

interface Live {
  editor: Editor;
  server: ReturnType<typeof fakeServer>;
  container: HTMLElement;
  snap: () => CanvasSnapshot;
  push: (changes: StructuralResponse["changes"]) => void;
  errors: unknown[];
}

function mountLive(initial: Block[] = []): Live {
  const server = fakeServer(initial);
  let editor: Editor | null = null;
  let current: CanvasSnapshot = { blocks: initial.map(strip), docs: [testDoc({ id: DOC })] };
  let push: (c: StructuralResponse["changes"]) => void = () => undefined;
  const errors: unknown[] = [];
  const logger: EventLogger = {
    log: ((kind: string, payload: { target?: { kind: string; block_id?: string }; content_after?: BlockContent }) => {
      // The event store hook: a keystroke batch with a snapshot becomes a revision (after the network).
      if (kind === "keystroke_batch" && payload.target?.kind === "block" && payload.content_after) {
        const id = payload.target.block_id!;
        const after = payload.content_after;
        setTimeout(() => server.keystroke(id, after), LATENCY_MS);
      }
      return newUlid();
    }) as EventLogger["log"],
    pending: () => 0,
    flush: async () => undefined,
    onError: () => () => undefined,
    stop: () => undefined,
  };
  function Host() {
    const [snap, setSnap] = useState<CanvasSnapshot>(current);
    current = snap;
    push = (c) => setSnap((s) => mergeChanges(s, c));
    const structural = useCallback(async (cmd: StructuralCommand) => {
      const res = await server.structural(cmd);
      setSnap((s) => mergeChanges(s, res.changes));
      return res;
    }, []);
    return (
      <Canvas
        docId={DOC}
        blocks={snap.blocks}
        readOnly={false}
        logger={logger}
        structural={structural}
        onLocalEdit={(id, content) => setSnap((s) => applyLocalEdit(s, id, content))}
        onSyncError={(e) => errors.push(e)}
        onEditorReady={(e) => (editor = e)}
      />
    );
  }
  const r = render(<Host />);
  if (!editor) throw new Error("editor not created");
  return { editor, server, container: r.container, snap: () => current, push: (c) => act(() => push(c)), errors };
}

/** Typing as the browser does it, so input rules (`### ` makes a heading) run. */
const type = (l: Live, text: string) =>
  act(() => {
    const view = l.editor.view;
    for (const ch of text) {
      const { from, to } = view.state.selection;
      if (!view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  });
const key = (l: Live, name: string) => act(() => void l.editor.commands.keyboardShortcut(name));
const endOf = (l: Live, index: number) =>
  act(() => {
    let pos = 0;
    l.editor.state.doc.forEach((n, off, i) => {
      if (i === index) pos = off + n.nodeSize - 1;
    });
    l.editor.view.dispatch(l.editor.state.tr.setSelection(TextSelection.create(l.editor.state.doc, pos)));
  });
/** Let time pass in small steps so timers and the promises they resolve interleave as in a browser. */
async function wait(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}
const editorTexts = (l: Live) => {
  const out: string[] = [];
  l.editor.state.doc.forEach((n) => out.push(`${n.type.name}:${n.textContent}`));
  return out;
};
const block = (id: string, content: string, order: number, over: Partial<Block> = {}): Block => ({
  id,
  session_id: "S1",
  doc_id: DOC,
  type: "paragraph",
  content,
  origin: "teacher",
  origin_turn: null,
  status: "live",
  version: 1,
  derived_from: null,
  order,
  pending: null,
  created_at: nowIso(),
  updated_at: nowIso(),
  ...over,
});
const A = "01ARZ3NDEKTSV4RRFFQ69G5FA1";
const B = "01ARZ3NDEKTSV4RRFFQ69G5FA2";

beforeAll(installEditorPolyfills);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("editor against a slow server", () => {
  it("keeps a heading made with the shortcut and typed into while the server catches up", async () => {
    const l = mountLive([block(A, "Intro", 0)]);
    endOf(l, 0);
    key(l, "Enter");
    key(l, "Mod-Alt-3");
    type(l, "My");
    await wait(100);
    type(l, " header");
    await wait(5000);
    expect(editorTexts(l)).toEqual(["paragraph:Intro", "heading:My header"]);
    expect(l.server.visible().map((b) => [b.type, b.content])).toEqual([["paragraph", "Intro"], ["heading", "### My header"]]);
    expect(l.errors).toEqual([]);
  });

  it("keeps a heading made by typing ### while the server catches up", async () => {
    const l = mountLive([block(A, "Intro", 0)]);
    endOf(l, 0);
    key(l, "Enter");
    type(l, "### Title");
    await wait(5000);
    expect(editorTexts(l)).toEqual(["paragraph:Intro", "heading:Title"]);
    expect(l.server.visible().map((b) => [b.type, b.content])).toEqual([["paragraph", "Intro"], ["heading", "### Title"]]);
  });

  it("keeps typing in the first half of a line split with Enter while the split is in flight", async () => {
    const l = mountLive([block(A, "Hello world", 0)]);
    act(() => l.editor.view.dispatch(l.editor.state.tr.setSelection(TextSelection.create(l.editor.state.doc, 6))));
    key(l, "Enter");
    endOf(l, 0);
    type(l, "!");
    await wait(5000);
    expect(editorTexts(l)).toEqual(["paragraph:Hello!", "paragraph: world"]);
    expect(l.server.visible().map((b) => b.content)).toEqual(["Hello!", " world"]);
  });

  it("keeps a suggestion on its own block after an earlier block is deleted", async () => {
    const l = mountLive([block(A, "First", 0), block(B, "Second", 1)]);
    l.push(l.server.propose([{ op: "insert", after: B, type: "paragraph", content: "Suggested" }]));
    await wait(100);
    const marked = () => [...l.container.querySelectorAll<HTMLElement>(".st-proposed")].map((m) => [m.dataset.blockId, m.textContent]);
    const [[forId]] = marked() as [[string, string]];
    expect(marked()).toEqual([[forId, "Suggested"]]);
    // Delete the first block: select it all and delete, then join the empty line away.
    act(() => {
      const first = l.editor.state.doc.child(0);
      l.editor.view.dispatch(l.editor.state.tr.delete(0, first.nodeSize));
    });
    await wait(2000);
    expect(editorTexts(l)).toEqual(["paragraph:Second", "paragraph:Suggested"]);
    expect(marked()).toEqual([[forId, "Suggested"]]);
    expect(l.editor.state.doc.child(1).attrs).toMatchObject({ id: forId, status: "proposed" });
  });
});
