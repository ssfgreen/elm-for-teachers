import { describe, expect, it, vi } from "vitest";
import type { BlockContent, BlockType } from "@edw/shared";
import { createStructuralQueue, diffBlocks, type BlockSnap } from "./sync.js";
import type { StructuralCommand } from "./types.js";

const c = (content: string): BlockContent => ({ content });
const snap = (id: string, content: string, type: BlockType = "paragraph"): BlockSnap => ({ id, type, content: c(content) });
const DOC = "01ARZ3NDEKTSV4RRFFQ69G5D0C";

/**
 * What the server would hold after applying the commands in order to `prev`.
 * Mirrors shared/canvas.ts placement: `after` is "start" or an existing id.
 */
function simulate(prev: BlockSnap[], cmds: StructuralCommand[]): BlockSnap[] {
  let list = prev.map((b) => ({ ...b }));
  const place = (b: BlockSnap, after: string) => {
    list = list.filter((x) => x.id !== b.id);
    if (after === "start") list.unshift(b);
    else {
      const i = list.findIndex((x) => x.id === after);
      if (i < 0) throw new Error(`bad anchor ${after}`);
      list.splice(i + 1, 0, b);
    }
  };
  const get = (id: string) => {
    const b = list.find((x) => x.id === id);
    if (!b) throw new Error(`unknown block ${id}`);
    return b;
  };
  for (const cmd of cmds) {
    switch (cmd.command) {
      case "insert":
        if (list.some((x) => x.id === cmd.id)) throw new Error("duplicate id");
        place({ id: cmd.id!, type: cmd.type, content: c(cmd.content ?? "") }, cmd.after);
        break;
      case "split": {
        const first = get(cmd.block_id);
        first.content = cmd.first;
        place({ id: cmd.second_id!, type: cmd.second_type ?? first.type, content: cmd.second }, first.id);
        break;
      }
      case "merge":
        get(cmd.merged_into).content = cmd.after;
        get(cmd.block_id);
        list = list.filter((x) => x.id !== cmd.block_id);
        break;
      case "delete":
        get(cmd.block_id);
        list = list.filter((x) => x.id !== cmd.block_id);
        break;
      case "move":
        place(get(cmd.block_id), cmd.after);
        break;
      case "retype": {
        const b = get(cmd.block_id);
        b.type = cmd.type;
        if (cmd.after) b.content = cmd.after;
        break;
      }
      default:
        throw new Error(`unexpected ${cmd.command}`);
    }
  }
  return list;
}

/** Apply content changes the way keystroke batches would, then compare with `next`. */
function expectConverges(prev: BlockSnap[], next: BlockSnap[]) {
  const diff = diffBlocks(prev, next, DOC);
  const server = simulate(prev, diff.commands);
  for (const id of diff.contentChanged) server.find((b) => b.id === id)!.content = next.find((b) => b.id === id)!.content;
  expect(server).toEqual(next);
  return diff;
}

describe("diffBlocks", () => {
  const A = "A".repeat(26);
  const B = "B".repeat(26);
  const C = "C".repeat(26);
  const D = "D".repeat(26);
  const N = "N".repeat(26);
  const M = "M".repeat(26);

  it("finds nothing to do for an unchanged document", () => {
    const d = expectConverges([snap(A, "x")], [snap(A, "x")]);
    expect(d).toEqual({ commands: [], contentChanged: [] });
  });

  it("reports plain typing as a content change", () => {
    expect(expectConverges([snap(A, "Hello")], [snap(A, "Hello world")])).toEqual({ commands: [], contentChanged: [A] });
  });

  it("turns Enter into a split that keeps the first id and names the second", () => {
    const d = expectConverges([snap(A, "Hello world")], [snap(A, "Hello"), snap(N, "world")]);
    expect(d.commands).toEqual([{ command: "split", block_id: A, first: c("Hello"), second: c("world"), second_type: "paragraph", second_id: N }]);
    expect(d.contentChanged).toEqual([]);
    // Enter at the end of a heading: an empty paragraph after an unchanged block is an insert.
    const e = expectConverges([snap(A, "# Q1", "heading")], [snap(A, "# Q1", "heading"), snap(N, "")]);
    expect(e.commands[0]).toMatchObject({ command: "insert", id: N, after: A, type: "paragraph" });
  });

  it("turns Backspace at a boundary into a merge, and a deletion across blocks into a merge plus deletes", () => {
    const d = expectConverges([snap(A, "Hello"), snap(B, "world")], [snap(A, "Helloworld")]);
    expect(d.commands).toEqual([{ command: "merge", block_id: B, merged_into: A, after: c("Helloworld") }]);
    const e = expectConverges([snap(A, "one two"), snap(B, "three"), snap(C, "four five")], [snap(A, "one five")]);
    expect(e.commands).toEqual([
      { command: "merge", block_id: B, merged_into: A, after: c("one five") },
      { command: "delete", block_id: C },
    ]);
  });

  it("deletes a block whose neighbours did not change", () => {
    const d = expectConverges([snap(A, "a"), snap(B, "b"), snap(C, "c")], [snap(A, "a"), snap(C, "c")]);
    expect(d.commands).toEqual([{ command: "delete", block_id: B }]);
  });

  it("inserts a new block after an unchanged predecessor, or at the start", () => {
    const d = expectConverges([snap(A, "---", "divider")], [snap(A, "---", "divider"), snap(N, "")]);
    expect(d.commands).toEqual([
      { command: "insert", id: N, doc_id: DOC, after: A, type: "paragraph", content: "" },
    ]);
    const e = expectConverges([snap(A, "a")], [snap(N, "new"), snap(A, "a")]);
    expect(e.commands[0]).toMatchObject({ command: "insert", id: N, after: "start" });
    const f = expectConverges([], [snap(N, "first words")]);
    expect(f.commands).toEqual([{ command: "insert", id: N, doc_id: DOC, after: "start", type: "paragraph", content: "first words" }]);
  });

  it("chains inserts for a multi-block paste, splitting off the block pasted into", () => {
    const d = expectConverges(
      [snap(A, "head tail"), snap(B, "b")],
      [snap(A, "head one"), snap(N, "two"), snap(M, "three tail"), snap(B, "b")],
    );
    expect(d.commands.map((x) => x.command)).toEqual(["split", "insert"]);
    expect(d.commands[0]).toMatchObject({ block_id: A, second_id: N });
    expect(d.commands[1]).toMatchObject({ id: M, after: N });
  });

  it("turns a type change into a retype carrying the restructured content", () => {
    const d = expectConverges([snap(A, "apples")], [snap(A, "- apples", "bullet_list")]);
    expect(d.commands).toEqual([{ command: "retype", block_id: A, type: "bullet_list", after: c("- apples") }]);
    expect(d.contentChanged).toEqual([]);
  });

  it("moves displaced blocks so the server ends in the editor's order", () => {
    const d = expectConverges([snap(A, "a"), snap(B, "b"), snap(C, "c")], [snap(B, "b"), snap(A, "a"), snap(C, "c")]);
    expect(d.commands).toHaveLength(1);
    expect(d.commands[0]!.command).toBe("move");
    expectConverges([snap(A, "a"), snap(B, "b"), snap(C, "c"), snap(D, "d")], [snap(C, "c"), snap(A, "a"), snap(D, "d"), snap(B, "b")]);
    expectConverges([snap(A, "a"), snap(B, "b"), snap(C, "c"), snap(D, "d")], [snap(D, "d"), snap(C, "c"), snap(B, "b"), snap(A, "a")]);
  });

  it("handles a move combined with an insert and a deletion in one transaction", () => {
    expectConverges([snap(A, "a"), snap(B, "b"), snap(C, "c")], [snap(C, "c"), snap(N, "n"), snap(A, "a")]);
  });
});

describe("createStructuralQueue", () => {
  const cmd = (id: string): StructuralCommand => ({ command: "delete", block_id: id });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("sends commands one at a time, in order, awaiting beforeSend each time", async () => {
    const log: string[] = [];
    let release: (() => void) | null = null;
    const send = vi.fn(async (c: StructuralCommand) => {
      log.push(`send ${(c as { block_id: string }).block_id}`);
      await new Promise<void>((r) => (release = r));
    });
    const q = createStructuralQueue({ send, beforeSend: async () => void log.push("before"), onReject: vi.fn() });
    q.push([cmd("1"), cmd("2")]);
    expect(q.idle()).toBe(false);
    await tick();
    expect(log).toEqual(["before", "send 1"]);
    release!();
    await tick();
    await tick();
    expect(log).toEqual(["before", "send 1", "before", "send 2"]);
    release!();
    await q.whenIdle();
    expect(q.idle()).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("drops the rest of the queue when a command fails and reports it", async () => {
    const send = vi.fn(async (c: StructuralCommand) => {
      if ((c as { block_id: string }).block_id === "2") throw new Error("409");
    });
    const onReject = vi.fn();
    const onIdle = vi.fn();
    const q = createStructuralQueue({ send, onReject, onIdle });
    q.push([cmd("1"), cmd("2"), cmd("3")]);
    await q.whenIdle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(onReject).toHaveBeenCalledWith(expect.any(Error), cmd("2"));
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(q.idle()).toBe(true);
  });

  it("accepts pushes while running and resolves whenIdle immediately when idle", async () => {
    const send = vi.fn<(c: StructuralCommand) => Promise<void>>(async () => {
      await tick();
    });
    const q = createStructuralQueue({ send, onReject: vi.fn() });
    await q.whenIdle();
    q.push([cmd("1")]);
    q.push([cmd("2")]);
    await q.whenIdle();
    expect(send.mock.calls.map((c) => (c[0] as { block_id: string }).block_id)).toEqual(["1", "2"]);
  });
});
