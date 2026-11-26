import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newUlid, type Doc, type Thread } from "@edw/shared";
import { rowToRevision } from "../db/rows.js";
import type { AppDeps, ServerEnvelope } from "../deps.js";
import { clientEvent, envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from "../test-helpers.js";
import type { CanvasServiceImpl } from "./service.js";

const now = "2026-10-29T12:00:00.000Z";
let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let canvas: CanvasServiceImpl;
let sid: string;
let thread: Thread;
let doc: Doc;
let envelope: ServerEnvelope;
/** Events logged by session creation (participant setup), skipped in kind assertions. */
let setupEvents: number;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  canvas = deps.canvas;
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
  envelope = envelopeFor(doc, thread);
  setupEvents = (await deps.events.list(sid)).length;
});

const kindsSinceSetup = async () => (await deps.events.list(sid)).slice(setupEvents).map((e) => e.kind);
const ctx = () => ({ doc_id: doc.id, thread_id: thread.id });
const insert = async (content: string, after = "start", d = doc.id) =>
  (await canvas.structural(sid, { command: "insert", doc_id: d, after, type: "paragraph", content }, envelope)).block!;

describe("structural commands", () => {
  it("inserts a teacher block into a doc, persists it, and logs block_revision then block_structure", async () => {
    const b = await insert("Hello");
    expect(b).toMatchObject({ content: "Hello", origin: "teacher", status: "live", doc_id: doc.id });
    const snap = await canvas.snapshot(sid);
    expect(snap.blocks).toHaveLength(1);
    expect(snap.docs.map((d) => d.id)).toEqual([doc.id]);
    expect(await kindsSinceSetup()).toEqual(["block_revision", "block_structure"]);
    const revs = (await t.db.execute("SELECT * FROM block_revisions WHERE block_id = ?", [b.id])).rows.map(rowToRevision);
    expect(revs.map((r) => r.after.content)).toEqual(["Hello"]);
  });

  it("inserts a teacher block derived from another (Spyglass's Restore), and refuses an unknown one", async () => {
    const a = await insert("The learning intention");
    const r = await canvas.structural(sid, { command: "insert", doc_id: doc.id, after: a.id, type: "paragraph", content: a.content, derived_from: a.id }, envelope);
    expect(r.block).toMatchObject({ derived_from: a.id, origin: "teacher", status: "live" });
    expect((await canvas.loadState(sid)).blocks.get(r.block!.id)?.derived_from).toBe(a.id);
    await expect(canvas.structural(sid, { command: "insert", doc_id: doc.id, after: "start", type: "paragraph", content: "x", derived_from: newUlid() }, envelope)).rejects.toMatchObject({ code: "unknown_block" });
  });

  it("refuses an insert into an unknown doc", async () => {
    await expect(canvas.structural(sid, { command: "insert", doc_id: newUlid(), after: "start", type: "paragraph", content: "x" }, envelope)).rejects.toMatchObject({ code: "unknown_doc" });
  });

  it("split then merge round-trips through the database", async () => {
    const a = await insert("Hello world");
    const split = await canvas.structural(sid, { command: "split", block_id: a.id, first: { content: "Hello" }, second: { content: "world" } }, envelope);
    let state = await canvas.loadState(sid);
    expect([...state.blocks.values()].filter((b) => b.status === "live").sort((x, y) => x.order - y.order).map((b) => b.content)).toEqual(["Hello", "world"]);
    expect(split.block).toMatchObject({ derived_from: a.id, doc_id: doc.id });
    await canvas.structural(sid, { command: "merge", block_id: split.block!.id, merged_into: a.id, after: { content: "Hello world" } }, envelope);
    state = await canvas.loadState(sid);
    expect(state.blocks.get(split.block!.id)?.status).toBe("deleted");
    expect(state.blocks.get(a.id)).toMatchObject({ content: "Hello world", version: 3 });
  });

  it("retype persists the new type and content", async () => {
    const a = await insert("apples");
    const r = await canvas.structural(sid, { command: "retype", block_id: a.id, type: "bullet_list", after: { content: "- apples" } }, envelope);
    expect(r.block).toMatchObject({ type: "bullet_list", content: "- apples", version: 2 });
    const row = (await t.db.execute("SELECT type, content FROM blocks WHERE id = ?", [a.id])).rows[0]!;
    expect({ type: row.type, content: row.content }).toEqual({ type: "bullet_list", content: "- apples" });
    expect((await deps.events.list(sid)).at(-1)?.payload).toMatchObject({ action: "retype", type: "bullet_list" });
  });

  it("uses editor-assigned ids on insert and split, and refuses an id that already exists", async () => {
    const id = newUlid();
    const a = (await canvas.structural(sid, { command: "insert", id, doc_id: doc.id, after: "start", type: "paragraph", content: "Hello world" }, envelope)).block!;
    expect(a.id).toBe(id);
    const secondId = newUlid();
    const split = await canvas.structural(sid, { command: "split", block_id: a.id, first: { content: "Hello" }, second: { content: "world" }, second_id: secondId }, envelope);
    expect(split.block?.id).toBe(secondId);
    await expect(canvas.structural(sid, { command: "insert", id, doc_id: doc.id, after: "start", type: "paragraph", content: "again" }, envelope)).rejects.toMatchObject({ code: "duplicate_id" });
    expect((await canvas.snapshot(sid)).blocks).toHaveLength(2);
  });

  it("a structural command's revisions cite the logged block_structure event as their cause", async () => {
    const a = await insert("Hello world");
    await canvas.structural(sid, { command: "split", block_id: a.id, first: { content: "Hello" }, second: { content: "world" } }, envelope);
    const structureIds = new Set((await deps.events.list(sid, { kinds: ["block_structure"] })).map((e) => e.event_id));
    const revs = (await t.db.execute("SELECT r.* FROM block_revisions r JOIN blocks b ON b.id = r.block_id WHERE b.session_id = ?", [sid])).rows.map(rowToRevision);
    expect(revs).toHaveLength(3);
    for (const r of revs) expect(structureIds.has(r.cause_event_id)).toBe(true);
  });

  it("creates and renames teacher docs in a thread, logging doc_create and doc_rename", async () => {
    const id = newUlid();
    const created = await canvas.structural(sid, { command: "doc_create", thread_id: thread.id, name: "Untitled", id }, envelope);
    expect(created.doc).toMatchObject({ id, thread_id: thread.id, name: "Untitled", created_by: "teacher" });
    const renamed = await canvas.structural(sid, { command: "doc_rename", doc_id: id, name: "Similes" }, envelope);
    expect(renamed.doc?.name).toBe("Similes");
    expect((await canvas.snapshot(sid)).docs.find((d) => d.id === id)?.name).toBe("Similes");
    expect(await kindsSinceSetup()).toEqual(["doc_create", "doc_rename"]);
    expect((await deps.events.list(sid, { kinds: ["doc_rename"] }))[0]?.payload).toEqual({ doc_id: id, name: "Similes" });
  });

  it("duplicates a doc into its thread, logging doc_create with copied_from as the copies' cause", async () => {
    const a = await insert("Hello");
    await insert("World", a.id);
    const id = newUlid();
    const r = await canvas.structural(sid, { command: "doc_duplicate", doc_id: doc.id, name: "Untitled (copy)", id }, envelope);
    expect(r.doc).toMatchObject({ id, thread_id: thread.id, name: "Untitled (copy)" });
    const copies = (await canvas.snapshot(sid)).blocks.filter((b) => b.doc_id === id).sort((x, y) => x.order - y.order);
    expect(copies.map((b) => b.content)).toEqual(["Hello", "World"]);
    const created = (await deps.events.list(sid, { kinds: ["doc_create"] })).at(-1)!;
    expect(created.payload).toMatchObject({ doc_id: id, copied_from: doc.id, created_by: "teacher" });
    const revs = (await t.db.execute("SELECT * FROM block_revisions WHERE block_id IN (?, ?)", [copies[0]!.id, copies[1]!.id])).rows.map(rowToRevision);
    expect(revs.every((x) => x.cause_event_id === created.event_id)).toBe(true);
    await expect(canvas.structural(sid, { command: "doc_duplicate", doc_id: newUlid(), name: "x" }, envelope)).rejects.toMatchObject({ code: "unknown_doc" });
  });

  it("imports an uploaded document as a new teacher doc in the thread, logged with its source", async () => {
    const id = newUlid();
    const source = { kind: "docx" as const, filename: "P7 Similes.docx", bytes: 5209 };
    const r = await canvas.structural(
      sid,
      {
        command: "doc_import",
        thread_id: thread.id,
        name: "P7 Similes",
        id,
        blocks: [
          { type: "heading", content: "# Similes and Metaphors" },
          { type: "numbered_list", content: "3. On Monday\n4. The storm" },
          { type: "paragraph", content: "" },
        ],
        source,
      },
      envelope,
    );
    expect(r.doc).toMatchObject({ id, thread_id: thread.id, name: "P7 Similes", created_by: "teacher" });
    const blocks = (await canvas.snapshot(sid)).blocks.filter((b) => b.doc_id === id).sort((x, y) => x.order - y.order);
    expect(blocks.map((b) => [b.type, b.content, b.status, b.origin])).toEqual([
      ["heading", "# Similes and Metaphors", "live", "teacher"],
      // A whole list comes in as a block per item (PLAN.md section 6).
      ["numbered_item", "3. On Monday", "live", "teacher"],
      ["numbered_item", "4. The storm", "live", "teacher"],
      ["paragraph", "", "live", "teacher"],
    ]);
    const created = (await deps.events.list(sid, { kinds: ["doc_create"] })).at(-1)!;
    expect(created.payload).toMatchObject({ doc_id: id, imported_from: source });
    const revs = (await t.db.execute("SELECT cause_event_id FROM block_revisions WHERE block_id = ?", [blocks[0]!.id])).rows;
    expect(revs[0]?.cause_event_id).toBe(created.event_id);
  });

  it("rolls back everything when the command is refused", async () => {
    await expect(canvas.structural(sid, { command: "delete", block_id: newUlid() }, envelope)).rejects.toThrow(/unknown block/);
    expect(await kindsSinceSetup()).toEqual([]);
  });
});

describe("event hook", () => {
  it("a keystroke batch with a content snapshot records a teacher revision caused by that batch", async () => {
    const a = await insert("A");
    const ev = clientEvent(
      "keystroke_batch",
      { target: { kind: "block", block_id: a.id }, edits: [{ t: 1, ops: [{ retain: 1 }, { insert: "B" }] }], char_count: 1, batch_start_ts: now, batch_end_ts: now, content_after: { content: "AB" } },
      ctx(),
    );
    await deps.events.appendClient(sid, [ev]);
    expect((await canvas.loadState(sid)).blocks.get(a.id)).toMatchObject({ content: "AB", version: 2 });
    const revs = (await t.db.execute("SELECT * FROM block_revisions WHERE block_id = ? ORDER BY version", [a.id])).rows.map(rowToRevision);
    expect(revs[1]).toMatchObject({ actor: "teacher", cause_event_id: ev.event_id });
  });

  it("a chat-input keystroke batch changes nothing in the docs", async () => {
    await deps.events.appendClient(sid, [clientEvent("keystroke_batch", { target: { kind: "chat" }, steps: [], char_count: 1, batch_start_ts: now, batch_end_ts: now }, ctx())]);
    expect((await canvas.snapshot(sid)).blocks).toHaveLength(0);
  });

  it("model proposals become live through accept events; typing into a proposal logs edit_then_accept", async () => {
    // With a line of the teacher's in it: a blank doc would take the turn straight in.
    const mine = await insert("My notes");
    const r = await canvas.applyTurn(
      sid,
      {
        turn_id: "t1",
        cause_event_id: newUlid(),
        thread_id: thread.id,
        default_doc_id: doc.id,
        operations: [
          { op: "insert", after: "start", type: "heading", content: "H" },
          { op: "insert", after: "start", type: "paragraph", content: "P" },
          { op: "insert", after: "start", type: "paragraph", content: "Q" },
        ],
      },
      { envelope },
    );
    const [h, p, q] = r.proposed_block_ids as [string, string, string];
    expect((await canvas.snapshot(sid)).blocks.every((b) => b.id === mine.id || (b.status === "proposed" && b.doc_id === doc.id))).toBe(true);

    await deps.events.appendClient(sid, [
      clientEvent("proposal_accept", { block_id: h, doc_id: doc.id, mode: "click" }, ctx()),
      clientEvent("proposal_reject", { block_id: q, doc_id: doc.id, mode: "click" }, ctx()),
      clientEvent(
        "keystroke_batch",
        { target: { kind: "block", block_id: p }, edits: [], char_count: 1, batch_start_ts: now, batch_end_ts: now, content_after: { content: "P!" } },
        ctx(),
      ),
    ]);
    const byId = new Map((await canvas.snapshot(sid)).blocks.map((b) => [b.id, b]));
    expect(byId.get(h)?.status).toBe("live");
    expect(byId.get(q)?.status).toBe("rejected");
    expect(byId.get(p)).toMatchObject({ status: "live", content: "P!", origin: "model" });
    const accepts = (await deps.events.list(sid, { kinds: ["proposal_accept"] })).map((e) => (e.payload as { mode: string }).mode);
    expect(accepts).toEqual(["click", "edit_then_accept"]);
  });

  it("typing inside a suggestion keeps it waiting, and one change of a suggested edit can be decided on its own", async () => {
    const live = await insert("a big dog");
    const r = await canvas.applyTurn(
      sid,
      {
        turn_id: "t2",
        cause_event_id: newUlid(),
        thread_id: thread.id,
        default_doc_id: doc.id,
        operations: [
          { op: "replace", id: live.id, content: "a small dog and cat" },
          { op: "insert", after: live.id, type: "paragraph", content: "New" },
        ],
      },
      { envelope },
    );
    const added = r.proposed_block_ids.find((id) => id !== live.id)!;
    const batch = (blockId: string, content: string, extra: object) =>
      clientEvent("keystroke_batch", { target: { kind: "block", block_id: blockId }, edits: [], char_count: 1, batch_start_ts: now, batch_end_ts: now, content_after: { content }, in_suggestion: true, ...extra }, ctx());
    await deps.events.appendClient(sid, [
      batch(added, "New text", {}),
      batch(live.id, "a small dog and cat!", { live_after: { content: "a big dog!" } }),
      clientEvent(
        "proposal_accept",
        { block_id: live.id, doc_id: doc.id, mode: "click", part: { index: 0, ins: "small", del: "big", live_after: { content: "a small dog!" }, suggested_after: { content: "a small dog and cat!" } } },
        ctx(),
      ),
    ]);
    const byId = new Map((await canvas.snapshot(sid)).blocks.map((b) => [b.id, b]));
    expect(byId.get(added)).toMatchObject({ status: "proposed", content: "New text" });
    expect(byId.get(live.id)).toMatchObject({ status: "live", content: "a small dog!", pending: { op: "replace", content: "a small dog and cat!" } });
    // No implicit accept: the suggestions still wait.
    expect((await deps.events.list(sid, { kinds: ["proposal_accept"] })).map((e) => (e.payload as { mode: string }).mode)).toEqual(["click"]);
    await deps.events.appendClient(sid, [
      clientEvent(
        "proposal_reject",
        { block_id: live.id, doc_id: doc.id, mode: "click", part: { index: 0, ins: " and cat", del: "", live_after: { content: "a small dog!" }, suggested_after: { content: "a small dog!" } } },
        ctx(),
      ),
    ]);
    expect((await canvas.snapshot(sid)).blocks.find((b) => b.id === live.id)).toMatchObject({ content: "a small dog!", pending: null });
  });

  it("a model turn can create a doc in the thread and fill it", async () => {
    const r = await canvas.applyTurn(
      sid,
      {
        turn_id: "t1",
        cause_event_id: newUlid(),
        thread_id: thread.id,
        default_doc_id: doc.id,
        operations: [
          { op: "create_doc", temp_id: "d1", name: "Short version" },
          { op: "insert", doc: "d1", after: "start", type: "paragraph", content: "x" },
        ],
      },
      { envelope },
    );
    expect(r.created_doc_ids).toHaveLength(1);
    const snap = await canvas.snapshot(sid);
    const created = snap.docs.find((d) => d.id === r.created_doc_ids[0])!;
    expect(created).toMatchObject({ thread_id: thread.id, name: "Short version", created_by: "model" });
    expect(snap.blocks.find((b) => b.content === "x")?.doc_id).toBe(created.id);
  });

  it("accept_all and reject_all apply to every outstanding proposal in one doc only", async () => {
    const a = await insert("A");
    const other = (await canvas.structural(sid, { command: "doc_create", thread_id: thread.id, name: "Other" }, envelope)).doc!;
    const o = await insert("O", "start", other.id);
    const turn = (n: string, operations: Parameters<CanvasServiceImpl["applyTurn"]>[1]["operations"]) =>
      canvas.applyTurn(sid, { turn_id: n, cause_event_id: newUlid(), thread_id: thread.id, default_doc_id: doc.id, operations }, { envelope });
    await turn("t1", [
      { op: "replace", id: a.id, content: "A2" },
      { op: "insert", after: a.id, type: "paragraph", content: "B" },
      { op: "replace", id: o.id, content: "O2" },
    ]);
    await deps.events.appendClient(sid, [clientEvent("proposal_reject", { block_id: null, doc_id: doc.id, mode: "reject_all" }, ctx())]);
    let byContent = (await canvas.snapshot(sid)).blocks;
    expect(byContent.find((b) => b.id === a.id)?.pending).toBeNull();
    expect(byContent.find((b) => b.content === "B")?.status).toBe("rejected");
    expect(byContent.find((b) => b.id === o.id)?.pending).not.toBeNull();

    await turn("t2", [{ op: "replace", id: a.id, content: "A3" }]);
    await deps.events.appendClient(sid, [clientEvent("proposal_accept", { block_id: null, doc_id: doc.id, mode: "accept_all" }, ctx())]);
    byContent = (await canvas.snapshot(sid)).blocks;
    expect(byContent.find((b) => b.id === a.id)?.content).toBe("A3");
    expect(byContent.find((b) => b.id === o.id)?.content).toBe("O");
  });

  it("a failing doc command inside a batch rolls the whole batch back", async () => {
    const before = (await deps.events.list(sid)).length;
    await expect(
      deps.events.appendClient(sid, [clientEvent("doc_open", { doc_id: doc.id }, ctx()), clientEvent("proposal_accept", { block_id: newUlid(), doc_id: doc.id, mode: "click" }, ctx())]),
    ).rejects.toThrow();
    expect(await deps.events.list(sid)).toHaveLength(before);
  });
});
