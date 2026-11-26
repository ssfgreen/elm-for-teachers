import { describe, expect, it } from "vitest";
import { createGatedLogger } from "./gatedLogger.js";

function recorder() {
  const logged: Array<{ kind: string; payload: unknown }> = [];
  return { logged, log: ((kind: string, payload: unknown) => (logged.push({ kind, payload }), "id")) as never };
}

const onBlock = (block_id: string, n: number) => ({ target: { block_id }, n });

describe("createGatedLogger", () => {
  it("logs at once when no command for the block is in flight", () => {
    const r = recorder();
    const gate = createGatedLogger(r);
    gate.log("keystroke_batch" as never, onBlock("a", 1) as never);
    gate.log("selection" as never, { n: 2 } as never);
    expect(r.logged.map((l) => l.payload)).toEqual([onBlock("a", 1), { n: 2 }]);
  });

  it("holds a block's events until its command is applied, then logs them in order", () => {
    const r = recorder();
    const gate = createGatedLogger(r);
    gate.begin(["a"]);
    gate.log("keystroke_batch" as never, onBlock("a", 1) as never);
    gate.log("keystroke_batch" as never, onBlock("b", 2) as never);
    gate.log("keystroke_batch" as never, onBlock("a", 3) as never);
    expect(r.logged.map((l) => l.payload)).toEqual([onBlock("b", 2)]);
    expect(gate.held()).toBe(2);
    gate.end(["a"]);
    expect(r.logged.map((l) => l.payload)).toEqual([onBlock("b", 2), onBlock("a", 1), onBlock("a", 3)]);
    expect(gate.held()).toBe(0);
  });

  it("keeps holding while another command for the same block is still in flight", () => {
    const r = recorder();
    const gate = createGatedLogger(r);
    gate.begin(["a"]);
    gate.begin(["a"]);
    gate.log("keystroke_batch" as never, onBlock("a", 1) as never);
    gate.end(["a"]);
    expect(r.logged).toHaveLength(0);
    gate.end(["a"]);
    expect(r.logged).toHaveLength(1);
  });

  it("drops what it holds when a command is refused", () => {
    const r = recorder();
    const gate = createGatedLogger(r);
    gate.begin(["a"]);
    gate.log("keystroke_batch" as never, onBlock("a", 1) as never);
    gate.reset();
    expect(gate.held()).toBe(0);
    gate.log("keystroke_batch" as never, onBlock("a", 2) as never);
    expect(r.logged.map((l) => l.payload)).toEqual([onBlock("a", 2)]);
  });
});
