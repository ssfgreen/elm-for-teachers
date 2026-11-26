import { describe, expect, it } from "vitest";
import { Block, BlockRevision, Doc, Thread } from "./blocks.js";
import { ClientEvent, ClientEventBatch, EVENT_KINDS, Event } from "./events.js";
import { Operation } from "./operations.js";

const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ID2 = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const T = "2026-10-28T12:00:00.000Z";

describe("Operation", () => {
  it("parses every supported op", () => {
    const ops = [
      { op: "insert", after: "start", type: "paragraph", content: "Hi" },
      { op: "insert", doc: "d1", after: ID, type: "heading", content: "# Title" },
      { op: "replace", id: ID, content: "x" },
      { op: "delete", id: ID },
      { op: "move", id: ID, after: "start" },
      { op: "create_doc", temp_id: "d1", name: "Adapted version" },
    ];
    for (const o of ops) expect(Operation.parse(o)).toEqual(o);
  });

  it("rejects unknown ops, removed ops and bad block types", () => {
    expect(Operation.safeParse({ op: "create_version", temp_id: "v", name: "x", copy_from: "none" }).success).toBe(false);
    expect(Operation.safeParse({ op: "insert", after: "start", type: "worksheet_item", content: "x" }).success).toBe(false);
    expect(Operation.safeParse({ op: "teleport", id: ID }).success).toBe(false);
  });
});

describe("Events", () => {
  const base = { event_id: ID, client_ts: T, focus_pane: "canvas", doc_id: ID2, thread_id: null } as const;

  it("knows the editor's event kinds and none of the study's", () => {
    expect(EVENT_KINDS).toHaveLength(98);
    for (const k of ["doc_create", "doc_rename", "doc_delete", "doc_open", "doc_export", "doc_preview", "preview_scroll", "thread_create", "thread_rename", "thread_open", "participant_open", "comment_create", "comment_delete", "comment_edit", "comment_resolve", "project_create", "project_rename", "project_update", "project_archive", "project_delete", "project_open", "reference_open", "chat_title", "make_action", "make_design", "style_accept", "style_reject", "picture_choose", "plugin_trust_set", "plugin_request", "plugin_grant", "plugin_draft_add", "plugin_draft_remove", "reader_prompt_add", "reader_prompt_edit", "reader_prompt_remove", "reader_prompt_reorder", "reading_set", "reading_update", "reading_remove", "preferences_set", "copy_choice", "spyglass_shown", "spyglass_toggle", "spyglass_action", "pointer", "click", "viewport", "ui_state", "page_state", "text_select", "interaction_logging_set", "school_create", "school_rename", "year_group_create", "year_group_update", "year_group_archive", "class_create", "class_update", "class_archive", "class_open", "pupils_change", "curriculum_pick", "curriculum_status", "class_reader_settings", "class_reader_safety_set", "class_code_set", "class_pupil_remove", "pedagogy_open", "study_seed", "pupil_rows_scrub", "workspace_export", "workspace_link", "workspace_features_set", "budget_update"]) expect(EVENT_KINDS).toContain(k);
    expect(EVENT_KINDS).toContain("pupil_logins_made");
    expect(EVENT_KINDS).toContain("pupil_password_reset");
    expect(EVENT_KINDS).toContain("class_view_as_pupil");
    for (const k of ["brief_open", "task_complete", "facilitator", "sort", "version_create"]) expect(EVENT_KINDS).not.toContain(k);
  });

  it("parses a scroll in the Word preview and refuses one without its doc or with a negative position", () => {
    const ev = { ...base, kind: "preview_scroll", payload: { doc_id: ID2, position: 812.5, max: 2400 } };
    expect(ClientEvent.parse(ev)).toEqual(ev);
    expect(ClientEvent.safeParse({ ...ev, payload: { position: 10, max: 20 } }).success).toBe(false);
    expect(ClientEvent.safeParse({ ...ev, payload: { doc_id: ID2, position: -1, max: 20 } }).success).toBe(false);
  });

  it("parses a client keystroke batch with edits and refuses a wrong payload for the kind", () => {
    const ev = {
      ...base,
      kind: "keystroke_batch",
      payload: {
        target: { kind: "block", block_id: ID },
        edits: [{ t: 1000, ops: [{ retain: 2 }, { insert: "a" }] }],
        char_count: 1,
        batch_start_ts: T,
        batch_end_ts: T,
        content_after: { content: "Hia" },
      },
    };
    expect(ClientEvent.parse(ev)).toEqual(ev);
    expect(ClientEvent.safeParse({ ...base, kind: "doc_rename", payload: { doc_id: ID } }).success).toBe(false);
  });

  it("requires doc_id and thread_id on the envelope (null allowed), seq and server_ts only when stored", () => {
    const ev = { ...base, kind: "doc_open", payload: { doc_id: ID } };
    expect(ClientEvent.safeParse(ev).success).toBe(true);
    const { doc_id: _d, ...noDoc } = ev;
    void _d;
    expect(ClientEvent.safeParse(noDoc).success).toBe(false);
    expect(Event.safeParse(ev).success).toBe(false);
    expect(Event.safeParse({ ...ev, session_id: "s", seq: 1, server_ts: T }).success).toBe(true);
  });

  it("bounds a batch at 500 events", () => {
    const one = { ...base, kind: "doc_open", payload: { doc_id: ID } };
    expect(ClientEventBatch.safeParse({ session_id: "s", events: Array(500).fill(one) }).success).toBe(true);
    expect(ClientEventBatch.safeParse({ session_id: "s", events: Array(501).fill(one) }).success).toBe(false);
  });
});

describe("Thread, Doc, Block, BlockRevision", () => {
  it("round-trips a thread, a doc, a live block and a revision", () => {
    const thread = { id: ID, session_id: "s", title: "Untitled", project_id: null, created_at: T };
    const doc = { id: ID2, session_id: "s", thread_id: ID, name: "Untitled", created_by: "teacher", created_at: T };
    const block = {
      id: ID,
      session_id: "s",
      doc_id: ID2,
      type: "paragraph",
      content: "Hello",
      origin: "teacher",
      origin_turn: null,
      status: "live",
      version: 1,
      derived_from: null,
      order: 0,
      pending: null,
      created_at: T,
      updated_at: T,
    };
    const rev = { block_id: ID, version: 1, actor: "teacher", before: null, after: { content: "Hello" }, cause_event_id: ID2, at: T };
    expect(Thread.parse(thread)).toEqual(thread);
    expect(Doc.parse(doc)).toEqual(doc);
    expect(Block.parse(block)).toEqual(block);
    expect(BlockRevision.parse(rev)).toEqual(rev);
    expect(Block.safeParse({ ...block, id: "nope" }).success).toBe(false);
    expect(Block.safeParse({ ...block, status: "accepted" }).success).toBe(false);
    expect(Block.safeParse({ ...block, origin: "injected" }).success).toBe(false);
  });
});
