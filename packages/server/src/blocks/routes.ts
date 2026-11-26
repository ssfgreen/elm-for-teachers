/**
 * Participant-facing canvas routes.
 *   GET  /api/sessions/:sessionId/canvas            -> { blocks, docs }
 *   POST /api/sessions/:sessionId/blocks/:command   -> structural teacher commands (see StructuralCommand)
 * Content edits and accept/reject do not come here; they arrive as events.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BlockContent, BlockType, DocStyle, Ulid } from "@edw/shared";
import { requireParticipant } from "../auth.js";
import type { AppDeps } from "../deps.js";
import { notFound } from "../http-error.js";
import { Envelope } from "../http/request.js";
import { publicBlock, publicChanges } from "../http/views.js";
import type { StructuralCommand } from "./service.js";

const DocName = z.string().trim().min(1).max(200);

const Body = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("insert"),
    envelope: Envelope,
    /** Editor-assigned id (local-first write path); must be an unused ULID. */
    id: Ulid.optional(),
    doc_id: Ulid,
    after: z.string(),
    type: BlockType,
    content: z.string().optional(),
    /** The block this one restores (Spyglass's Restore). */
    derived_from: Ulid.optional(),
  }),
  z.object({ command: z.literal("split"), envelope: Envelope, block_id: z.string(), first: BlockContent, second: BlockContent, second_type: BlockType.optional(), second_id: Ulid.optional() }),
  z.object({ command: z.literal("merge"), envelope: Envelope, block_id: z.string(), merged_into: z.string(), after: BlockContent }),
  z.object({ command: z.literal("delete"), envelope: Envelope, block_id: z.string() }),
  z.object({ command: z.literal("move"), envelope: Envelope, block_id: z.string(), after: z.string() }),
  z.object({ command: z.literal("retype"), envelope: Envelope, block_id: z.string(), type: BlockType, after: BlockContent.optional() }),
  z.object({ command: z.literal("doc_create"), envelope: Envelope, thread_id: Ulid, name: DocName, id: Ulid.optional() }),
  z.object({ command: z.literal("doc_rename"), envelope: Envelope, doc_id: Ulid, name: DocName, auto: z.boolean().optional() }),
  z.object({ command: z.literal("doc_style"), envelope: Envelope, doc_id: Ulid, style: DocStyle }),
  z.object({ command: z.literal("doc_style_decision"), envelope: Envelope, doc_id: Ulid, accept: z.boolean() }),
  z.object({ command: z.literal("doc_delete"), envelope: Envelope, doc_id: Ulid }),
  z.object({ command: z.literal("doc_duplicate"), envelope: Envelope, doc_id: Ulid, name: DocName, id: Ulid.optional() }),
  z.object({
    command: z.literal("doc_import"),
    envelope: Envelope,
    thread_id: Ulid,
    name: DocName,
    id: Ulid.optional(),
    blocks: z.array(z.object({ type: BlockType, content: z.string().max(200_000) })).max(5000),
    source: z.object({ kind: z.literal("docx"), filename: z.string().max(255), bytes: z.number().int().nonnegative() }),
  }),
]);

export function registerBlockRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { canvas } = deps;
  const guard = { preHandler: requireParticipant(deps) };

  app.get("/api/sessions/:sessionId/canvas", guard, async (req) => {
    const snap = await canvas.snapshot(req.session!.session_id);
    return { blocks: snap.blocks.map(publicBlock), docs: snap.docs };
  });

  // An imported document can be large; everything else is small.
  app.post("/api/sessions/:sessionId/blocks/:command", { ...guard, bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const session = req.session!;
    const { command } = req.params as { command: string };
    const parsed = Body.safeParse({ ...(req.body as object), command });
    if (!parsed.success) return reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
    const { envelope, ...rest } = parsed.data;
    const cmd = rest as StructuralCommand;
    // A new doc must go in one of this session's threads.
    if ((cmd.command === "doc_create" || cmd.command === "doc_import") && !(await deps.threads.get(session.session_id, cmd.thread_id))) throw notFound("thread");
    const out = await canvas.structural(session.session_id, cmd, envelope);
    return { changes: publicChanges(out.changes), block: out.block ? publicBlock(out.block) : null, doc: out.doc ?? null };
  });
}
