/**
 * Block service: persists the shared canvas model (docs and their blocks).
 *
 * Every change goes through here, inside the transaction of the event that caused it,
 * so nothing reaches a doc without passing through the event log. Client events arrive
 * via the EventStore hook (keystroke batches with content snapshots, accept and reject);
 * structural teacher commands arrive via the REST routes, which log their own events.
 */
import type { Transaction } from "../db/types.js";
import {
  acceptAll,
  acceptBlock,
  decidePart,
  editInSuggestion,
  applyOperations,
  mergeChanges,
  takeTurnIn,
  takeNewDocsIn,
  blankDocIds,
  createDoc,
  createState,
  deleteBlock,
  duplicateDoc,
  editBlock,
  importDoc,
  insertBlock,
  getBlock,
  mergeBlocks,
  moveBlock,
  newUlid,
  nowIso,
  rejectAll,
  rejectBlock,
  renameDoc,
  setDocStyle,
  decideStyle,
  retypeBlock,
  splitBlock,
  type Block,
  type BlockType,
  type CanvasState,
  type Changes,
  type Ctx,
  type Doc,
  type DecisionPart,
  type Event,
} from "@edw/shared";
import type { Db } from "../db/client.js";
import { notFound } from "../http-error.js";
import { blockToRow, docToRow, revisionToRow, rowToBlock, rowToDoc } from "../db/rows.js";
import type { CanvasService, EventStore, ServerEnvelope } from "../deps.js";
import { createPreferenceService, newDocStyle } from "../preferences/service.js";
import { structurePayload } from "./structural.js";

export type { StructuralCommand } from "./structural.js";

export interface StructuralResult {
  changes: Changes;
  block?: Block;
  doc?: Doc;
}

export interface CanvasServiceImpl extends CanvasService {
  /** Run a canvas mutation and persist its changes inside `tx` (or a new transaction). */
  /** `newDocs`: a doc it makes starts in the teacher's default font. */
  mutate<T extends { changes: Changes }>(sessionId: string, fn: (state: CanvasState, ctx: Ctx) => T, opts: MutateOpts): Promise<T>;
  /**
   * A reference file the model opened (open_reference_as_doc), copied at once as a live doc in the
   * thread, outside the turn's transaction: it is the teacher's own file, so it stays even if the
   * turn is stopped or fails (Sam, 4 Nov). Returns the doc and its blocks.
   */
  openReference(
    sessionId: string,
    p: { thread_id: string; file: { id: string; name: string }; name: string; blocks: Array<{ type: BlockType; content: string }> },
    envelope: ServerEnvelope,
  ): Promise<{ doc: Doc; blocks: Block[] }>;
  /** A teacher doc, created and logged in `tx` (used by thread creation). */
  createTeacherDoc(sessionId: string, p: { thread_id: string; name: string }, envelope: ServerEnvelope, tx: Transaction): Promise<Doc>;
}

const UPSERT_BLOCK = `INSERT INTO blocks (id, session_id, doc_id, type, content, origin, origin_turn, status, version,
  derived_from, "order", pending, created_at, updated_at)
  VALUES (:id, :session_id, :doc_id, :type, :content, :origin, :origin_turn, :status, :version,
  :derived_from, :order, :pending, :created_at, :updated_at)
  ON CONFLICT(id) DO UPDATE SET type = excluded.type, content = excluded.content, status = excluded.status,
  version = excluded.version, "order" = excluded."order", pending = excluded.pending, updated_at = excluded.updated_at`;

const UPSERT_DOC = `INSERT INTO docs (id, session_id, thread_id, name, created_by, created_at, style, proposed_style, deleted_at)
  VALUES (:id, :session_id, :thread_id, :name, :created_by, :created_at, :style, :proposed_style, :deleted_at)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, style = excluded.style, proposed_style = excluded.proposed_style, deleted_at = excluded.deleted_at`;

const INSERT_REVISION = `INSERT INTO block_revisions (block_id, version, actor, before, after, cause_event_id, at)
  VALUES (:block_id, :version, :actor, :before, :after, :cause_event_id, :at)`;

type MutateOpts = { tx?: Transaction; envelope: ServerEnvelope; newDocs?: boolean };

export function createCanvasService(db: Db, events: EventStore): CanvasServiceImpl {
  const preferences = createPreferenceService(db, events);
  /** Deleted docs and their blocks are left out unless `withDeleted` (the export). */
  async function loadState(sessionId: string, tx?: Transaction, withDeleted = false): Promise<CanvasState> {
    const run = (sql: string) => (tx ? tx.execute({ sql, args: [sessionId] }) : db.execute(sql, [sessionId]));
    const live = withDeleted ? "" : " AND deleted_at IS NULL";
    const [b, d] = await Promise.all([
      run(`SELECT * FROM blocks WHERE session_id = ?${withDeleted ? "" : " AND doc_id IN (SELECT id FROM docs WHERE deleted_at IS NULL)"}`),
      run(`SELECT * FROM docs WHERE session_id = ?${live}`),
    ]);
    return createState(sessionId, b.rows.map(rowToBlock), d.rows.map(rowToDoc));
  }

  async function persist(sessionId: string, changes: Changes, tx: Transaction, envelope: ServerEnvelope): Promise<void> {
    for (const d of changes.docs) await tx.execute({ sql: UPSERT_DOC, args: docToRow(d) });
    for (const b of changes.blocks) await tx.execute({ sql: UPSERT_BLOCK, args: blockToRow(b) });
    for (const r of changes.revisions) {
      await tx.execute({ sql: INSERT_REVISION, args: revisionToRow(r) });
      await events.appendServer(sessionId, "block_revision", { block_id: r.block_id, version: r.version, actor: r.actor }, envelope, tx);
    }
  }

  async function mutate<T extends { changes: Changes }>(
    sessionId: string,
    fn: (state: CanvasState, ctx: Ctx) => T,
    opts: MutateOpts,
  ): Promise<T> {
    const work = async (tx: Transaction): Promise<T> => {
      const style = opts.newDocs ? newDocStyle(await preferences.get(sessionId, tx)) : undefined;
      const ctx: Ctx = { now: nowIso, newId: newUlid, ...(style ? { newDocStyle: style } : {}) };
      const state = await loadState(sessionId, tx);
      const out = fn(state, ctx);
      await persist(sessionId, out.changes, tx, opts.envelope);
      return out;
    };
    return opts.tx ? work(opts.tx) : db.transaction(work);
  }

  async function createTeacherDoc(sessionId: string, p: { thread_id: string; name: string; id?: string }, envelope: ServerEnvelope, tx: Transaction): Promise<Doc> {
    const evId = newUlid();
    const { doc } = await mutate(sessionId, (s, c) => createDoc(s, c, { ...p, created_by: "teacher" }), { tx, envelope, newDocs: true });
    await events.appendServer(sessionId, "doc_create", { doc_id: doc.id, thread_id: doc.thread_id, name: doc.name, created_by: "teacher", ...styleOf(doc) }, { ...envelope, event_id: evId }, tx);
    return doc;
  }

  const service: CanvasServiceImpl = {
    loadState,
    mutate,
    createTeacherDoc,

    async snapshot(sessionId, tx, opts) {
      const s = await loadState(sessionId, tx, opts?.withDeleted);
      return { blocks: [...s.blocks.values()], docs: [...s.docs.values()] };
    },

    async openReference(sessionId, p, envelope) {
      const res = await service.structural(
        sessionId,
        { command: "doc_import", thread_id: p.thread_id, name: p.name, id: newUlid(), blocks: p.blocks, source: { kind: "reference", reference_id: p.file.id, filename: p.file.name } },
        envelope,
      );
      if (!res.doc) throw new Error("the document was not made");
      return { doc: res.doc, blocks: res.changes.blocks.filter((b) => b.doc_id === res.doc!.id) };
    },

    applyTurn(sessionId, p, opts) {
      return mutate(
        sessionId,
        (state, base) => {
          // The ids made, in order, so Spyglass's effect can replay the turn with the same ids.
          const new_ids: string[] = [];
          const ctx: Ctx = { ...base, newId: () => { const id = base.newId(); new_ids.push(id); return id; } };
          // Read now, inside the commit and before the turn changes anything: a doc the teacher typed
          // in while the assistant worked is not blank (canvas/newDocs.ts).
          const blank = p.direct ? [] : blankDocIds(state, p.thread_id);
          const r = applyOperations(state, ctx, p);
          if (p.direct) return { ...r, changes: mergeChanges(r.changes, takeTurnIn(state, ctx, r, p.cause_event_id, p.hold)), new_ids, new_doc_block_ids: [], blank_doc_ids: [] };
          // Docs the turn made, and docs that were blank, take its changes straight in.
          const made = takeNewDocsIn(state, ctx, r, p.cause_event_id, blank);
          return { ...r, changes: mergeChanges(r.changes, made.changes), new_ids, new_doc_block_ids: made.block_ids, blank_doc_ids: made.blank_doc_ids };
        },
        { ...opts, newDocs: p.operations.some((o) => o.op === "create_doc") },
      );
    },

    async structural(sessionId, cmd, envelope) {
      return db.transaction(async (tx) => {
        if (cmd.command === "doc_create") {
          const doc = await createTeacherDoc(sessionId, { thread_id: cmd.thread_id, name: cmd.name, id: cmd.id }, envelope, tx);
          return { changes: { blocks: [], docs: [doc], revisions: [] }, doc };
        }
        if (cmd.command === "doc_rename") {
          const out = await mutate(sessionId, (s, c) => renameDoc(s, c, { doc_id: cmd.doc_id, name: cmd.name }), { tx, envelope });
          await events.appendServer(sessionId, "doc_rename", { doc_id: out.doc.id, name: out.doc.name, ...(cmd.auto ? { auto: true } : {}) }, envelope, tx);
          return { changes: out.changes, doc: out.doc };
        }
        if (cmd.command === "doc_delete") {
          const doc = (await loadState(sessionId, tx)).docs.get(cmd.doc_id);
          if (!doc) throw notFound("doc");
          const deleted: Doc = { ...doc, deleted_at: nowIso() };
          await tx.execute({ sql: UPSERT_DOC, args: docToRow(deleted) });
          await events.appendServer(sessionId, "doc_delete", { doc_id: doc.id, thread_id: doc.thread_id, name: doc.name }, envelope, tx);
          return { changes: { blocks: [], docs: [], revisions: [] }, doc: deleted };
        }
        if (cmd.command === "doc_style") {
          const out = await mutate(sessionId, (s, c) => setDocStyle(s, c, { doc_id: cmd.doc_id, style: cmd.style }), { tx, envelope });
          await events.appendServer(sessionId, "doc_style", { doc_id: out.doc.id, style: out.doc.style ?? {} }, envelope, tx);
          return { changes: out.changes, doc: out.doc };
        }
        if (cmd.command === "doc_style_decision") {
          const out = await mutate(sessionId, (s, c) => decideStyle(s, c, { doc_id: cmd.doc_id, accept: cmd.accept }), { tx, envelope });
          const decided = { doc_id: out.doc.id, turn_id: out.proposed.turn_id, style: out.proposed.style };
          await events.appendServer(sessionId, cmd.accept ? "style_accept" : "style_reject", decided, envelope, tx);
          if (cmd.accept) await events.appendServer(sessionId, "doc_style", { doc_id: out.doc.id, style: out.doc.style ?? {} }, envelope, tx);
          return { changes: out.changes, doc: out.doc };
        }
        if (cmd.command === "doc_import") {
          const evId = newUlid();
          const out = await mutate(
            sessionId,
            (st, c) => importDoc(st, c, { thread_id: cmd.thread_id, name: cmd.name, id: cmd.id, blocks: cmd.blocks, cause_event_id: evId }),
            { tx, envelope, newDocs: true },
          );
          await events.appendServer(
            sessionId,
            "doc_create",
            { doc_id: out.doc.id, thread_id: out.doc.thread_id, name: out.doc.name, created_by: cmd.source.kind === "reference" ? "model" : "teacher", imported_from: cmd.source, ...styleOf(out.doc) },
            { ...envelope, event_id: evId },
            tx,
          );
          return { changes: out.changes, doc: out.doc };
        }
        if (cmd.command === "doc_duplicate") {
          // Logged as a doc_create under the id the copied blocks' revisions cite.
          const evId = newUlid();
          const out = await mutate(sessionId, (st, c) => duplicateDoc(st, c, { doc_id: cmd.doc_id, name: cmd.name, id: cmd.id, cause_event_id: evId }), { tx, envelope });
          await events.appendServer(
            sessionId,
            "doc_create",
            { doc_id: out.doc.id, thread_id: out.doc.thread_id, name: out.doc.name, created_by: "teacher", copied_from: cmd.doc_id },
            { ...envelope, event_id: evId },
            tx,
          );
          return { changes: out.changes, doc: out.doc };
        }
        const evId = newUlid();
        const out = await mutate(
          sessionId,
          (state, ctx): StructuralResult => {
            switch (cmd.command) {
              case "insert": {
                if (cmd.derived_from) getBlock(state, cmd.derived_from);
                const r = insertBlock(state, ctx, {
                  id: cmd.id,
                  doc_id: cmd.doc_id,
                  after: cmd.after,
                  type: cmd.type,
                  content: cmd.content ?? "",
                  origin: "teacher",
                  status: "live",
                  actor: "teacher",
                  cause_event_id: evId,
                  derived_from: cmd.derived_from ?? null,
                });
                return { changes: r.changes, block: r.block };
              }
              case "split": {
                const r = splitBlock(state, ctx, { ...cmd, cause_event_id: evId });
                return { changes: r.changes, block: r.second };
              }
              case "merge": {
                const r = mergeBlocks(state, ctx, { ...cmd, cause_event_id: evId });
                return { changes: r.changes, block: r.target };
              }
              case "delete": {
                const r = deleteBlock(state, ctx, { block_id: cmd.block_id });
                return { changes: r.changes, block: r.block };
              }
              case "move": {
                const r = moveBlock(state, ctx, { block_id: cmd.block_id, after: cmd.after });
                return { changes: r.changes, block: r.block };
              }
              case "retype": {
                const r = retypeBlock(state, ctx, { block_id: cmd.block_id, type: cmd.type, after: cmd.after, cause_event_id: evId });
                return { changes: r.changes, block: r.block };
              }
            }
          },
          { tx, envelope },
        );
        // Logged under the id the revisions cite as their cause.
        await events.appendServer(sessionId, "block_structure", structurePayload(cmd, out), { ...envelope, event_id: evId }, tx);
        return out;
      });
    },
  };

  // Client events that change a doc.
  events.addHook(async (event: Event, tx: Transaction) => {
    const envelope: ServerEnvelope = { client_ts: event.client_ts, focus_pane: event.focus_pane, doc_id: event.doc_id, thread_id: event.thread_id };
    const sessionId = event.session_id;
    switch (event.kind) {
      case "keystroke_batch": {
        const p = event.payload;
        if (p.target.kind !== "block" || !p.content_after) return;
        const blockId = p.target.block_id;
        const after = p.content_after;
        const live = p.live_after;
        // Typed inside a suggestion that stays waiting (as in Word); older clients send neither field.
        const r = p.in_suggestion
          ? await mutate(sessionId, (s, c) => editInSuggestion(s, c, { block_id: blockId, after, ...(live ? { live } : {}), cause_event_id: event.event_id }), { tx, envelope })
          : await mutate(sessionId, (s, c) => editBlock(s, c, { block_id: blockId, after, cause_event_id: event.event_id }), { tx, envelope });
        if (r.implicit_accept) {
          await events.appendServer(sessionId, "proposal_accept", { block_id: blockId, doc_id: null, mode: "edit_then_accept" }, envelope, tx);
        }
        return;
      }
      case "proposal_accept": {
        const p = event.payload;
        if (p.part && p.block_id) {
          await decideOnePart(sessionId, p.block_id, true, p.part, event.event_id, tx, envelope);
        } else if (p.mode === "accept_all" && p.doc_id) {
          const docId = p.doc_id;
          await mutate(sessionId, (s, c) => acceptAll(s, c, { doc_id: docId, cause_event_id: event.event_id }), { tx, envelope });
        } else if (p.block_id) {
          const bid = p.block_id;
          await mutate(sessionId, (s, c) => acceptBlock(s, c, { block_id: bid, cause_event_id: event.event_id }), { tx, envelope });
        }
        return;
      }
      case "proposal_reject": {
        const p = event.payload;
        if (p.part && p.block_id) {
          await decideOnePart(sessionId, p.block_id, false, p.part, event.event_id, tx, envelope);
        } else if (p.mode === "reject_all" && p.doc_id) {
          const docId = p.doc_id;
          await mutate(sessionId, (s, c) => rejectAll(s, c, { doc_id: docId }), { tx, envelope });
        } else if (p.block_id) {
          const bid = p.block_id;
          await mutate(sessionId, (s, c) => rejectBlock(s, c, { block_id: bid }), { tx, envelope });
        }
        return;
      }
      default:
        return;
    }
  });

  /** One change inside a block's suggested change, decided on its own card. */
  async function decideOnePart(sessionId: string, blockId: string, accept: boolean, part: DecisionPart, causeEventId: string, tx: Transaction, envelope: ServerEnvelope) {
    await mutate(sessionId, (s, c) => decidePart(s, c, { block_id: blockId, accept, live: part.live_after, suggested: part.suggested_after, cause_event_id: causeEventId }), { tx, envelope });
  }

  return service;
}

/** A new doc's style for its doc_create event, when it has one (the teacher's default font). */
export const styleOf = (doc: Doc) => (doc.style ? { style: doc.style } : {});
