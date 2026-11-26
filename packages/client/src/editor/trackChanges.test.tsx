import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Canvas } from "./Canvas.js";
import { block } from "./markdown.test.js";
import type { PublicBlock } from "./types.js";
import { installEditorPolyfills, mockLogger } from "../test-utils.js";

beforeAll(installEditorPolyfills);
afterEach(cleanup);

const DOC = "01ARZ3NDEKTSV4RRFFQ69G5D0C";
const A = "01ARZ3NDEKTSV4RRFFQ69G5FA1";

const mount = (blocks: PublicBlock[]) =>
  render(
    <Canvas
      docId={DOC}
      blocks={blocks}
      readOnly
      logger={mockLogger()}
      structural={vi.fn()}
      onLocalEdit={vi.fn()}
      onSyncError={vi.fn()}
      onAskModel={vi.fn()}
      onSendComment={vi.fn()}
    />,
  ).container;

describe("words taken out, for the Suggesting look (12 Nov 2026)", () => {
  it("marks a change that only takes words out, so Suggesting can show where it is", () => {
    const c = mount([block({ id: A, content: "one two three four", order: 0, pending: { op: "replace", turn_id: "t", content: "one new three" } })]);
    const dels = [...c.querySelectorAll<HTMLElement>("del.sg-del")];
    // "two" became "new" (a word in its place); "four" just goes.
    expect(dels.map((d) => [d.textContent, d.classList.contains("sg-del-only")])).toEqual([
      ["two", false],
      [" four", true],
    ]);
    // Named on hover, in either look.
    expect(dels[1]!.title).toBe("Taken out: four");
  });
});
