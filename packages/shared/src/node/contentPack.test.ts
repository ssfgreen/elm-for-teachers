import { describe, expect, it } from "vitest";
import { createState, extractPackBlocks, type Block, type Doc } from "../index.js";
import { buildContentPackFiles, verifyContentPackFiles } from "./contentPack.js";

const T = "2026-11-26T10:00:00.000Z";
const PACK_ID = "01JCPACK000000000000000001";
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const makeDoc = (id: string): Doc => ({
  id,
  session_id: "sess-secret-123",
  thread_id: "01JTHREAD00000000000000001",
  name: "Water Cycle",
  created_by: "teacher",
  created_at: T,
});

const makeBlock = (overrides: Partial<Block> & { id: string; order: number; content: string }): Block => ({
  session_id: "sess-secret-123",
  doc_id: "01JDOC00000000000000000001",
  type: "paragraph",
  origin: "teacher",
  origin_turn: null,
  status: "live",
  version: 1,
  derived_from: null,
  pending: null,
  created_at: T,
  updated_at: T,
  ...overrides,
});

describe("Content Pack v1", () => {
  it("extracts live blocks only, drops proposals/deletes, strips provenance, and sanitises inline SVGs", () => {
    const docId = "01JDOC00000000000000000001";
    const state = createState(
      "sess-secret-123",
      [
        makeBlock({ id: "01JBLK00000000000000000001", order: 0, type: "heading", content: "# The Water Cycle" }),
        makeBlock({
          id: "01JBLK00000000000000000002",
          order: 1,
          content: "Evaporation turns water into vapour.",
          pending: { op: "replace", turn_id: "t1", content: "SECRET PROPOSED CHANGE" },
        }),
        makeBlock({ id: "01JBLK00000000000000000003", order: 2, status: "proposed", content: "UNACCEPTED BLOCK" }),
        makeBlock({ id: "01JBLK00000000000000000004", order: 3, status: "deleted", content: "DELETED BLOCK" }),
        makeBlock({ id: "01JBLK00000000000000000005", order: 4, type: "image", content: "![Diagram](asset:img_water_1)" }),
        makeBlock({
          id: "01JBLK00000000000000000006",
          order: 5,
          type: "image",
          content: '<svg viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>',
        }),
      ],
      [makeDoc(docId)],
    );

    const { blocks, assetIds } = extractPackBlocks(state, docId);
    expect(blocks.map((b) => b.id)).toEqual([
      "01JBLK00000000000000000001",
      "01JBLK00000000000000000002",
      "01JBLK00000000000000000005",
      "01JBLK00000000000000000006",
    ]);
    expect(assetIds).toEqual(["img_water_1"]);
    const raw = JSON.stringify(blocks);
    expect(raw).not.toContain("SECRET PROPOSED CHANGE");
    expect(raw).not.toContain("UNACCEPTED BLOCK");
    expect(raw).not.toContain("DELETED BLOCK");
    expect(raw).not.toContain("sess-secret-123");
    expect(raw).not.toContain("<script>");
    expect(blocks[3]!.content).toContain("<circle");
  });

  it("builds deterministic hashes and verifies unpacked files round-trip", () => {
    const built = buildContentPackFiles({
      pack_id: PACK_ID,
      kind: "reading",
      title: "The Water Cycle",
      subject: "Sciences",
      stage: "Second level",
      standard_uris: ["SCN 2-05a"],
      created_at: T,
      blocks: [
        { id: "b1", type: "heading", content: "# The Water Cycle" },
        { id: "b2", type: "image", content: "![Diagram](asset:img_1)" },
      ],
      assets: [{ asset_id: "img_1", mime: "image/png", bytes: PNG_1X1 }],
    });
    const builtAgain = buildContentPackFiles({
      pack_id: PACK_ID,
      kind: "reading",
      title: "The Water Cycle",
      subject: "Sciences",
      stage: "Second level",
      standard_uris: ["SCN 2-05a"],
      created_at: T,
      blocks: [
        { id: "b1", type: "heading", content: "# The Water Cycle" },
        { id: "b2", type: "image", content: "![Diagram](asset:img_1)" },
      ],
      assets: [{ asset_id: "img_1", mime: "image/png", bytes: PNG_1X1 }],
    });
    expect(built.manifest.content_hash).toBe(builtAgain.manifest.content_hash);

    const map = new Map(Object.entries(built.files));
    const verified = verifyContentPackFiles(map, built.manifest.content_hash);
    expect(verified.blocks).toHaveLength(2);
    expect(verified.assets.get("img_1")?.mime).toBe("image/png");
    expect(verified.prompts).toEqual([]);
  });

  it("rejects tampered bytes, wrong expected hash, extra files, and disallowed mimes", () => {
    const built = buildContentPackFiles({
      pack_id: PACK_ID,
      kind: "worksheet",
      title: "Fractions Practice",
      created_at: T,
      blocks: [{ id: "b1", type: "paragraph", content: "Solve: <line/>" }],
    });

    const tampered = new Map(Object.entries(built.files));
    tampered.set("blocks.json", new TextEncoder().encode("[]\n"));
    expect(() => verifyContentPackFiles(tampered)).toThrow(/byte length|sha256/);

    const extra = new Map(Object.entries(built.files));
    extra.set("notes.txt", new TextEncoder().encode("teacher email"));
    expect(() => verifyContentPackFiles(extra)).toThrow(/unexpected file/);

    const clean = new Map(Object.entries(built.files));
    expect(() => verifyContentPackFiles(clean, "sha256:" + "0".repeat(64))).toThrow(/does not match expected hash/);

    expect(() =>
      buildContentPackFiles({
        pack_id: PACK_ID,
        kind: "reading",
        title: "Bad asset",
        created_at: T,
        blocks: [{ id: "b1", type: "image", content: "![x](asset:a1)" }],
        assets: [{ asset_id: "a1", mime: "image/svg+xml", bytes: new TextEncoder().encode("<svg/>") }],
      }),
    ).toThrow(/disallowed asset mime/);
  });
});
