/**
 * The end of a turn that worked, in one write transaction: revalidate the operations against the
 * docs as they are now, log `chat_response`, apply them as proposals (in Editing mode, straight into
 * the doc, except changes to blocks with an earlier suggestion waiting; in either mode, straight
 * into a doc it made or a doc that is blank at this moment), log `proposal_shown` (in
 * Editing mode only for what still waits), then
 * save the gateway call(s), the stored turn and the comment reply.
 */
import { newUlid, nowIso, SVG_MIME, type Comment, type CopyRequest, type DroppedOp, type Operation, type PictureOffer, type TurnStep } from '@edw/shared';
import type { Transaction } from '../db/types.js';
import { saveAsset } from '../assets/store.js';
import { publicBlock } from '../http/views.js';
import type { CommentStore } from '../comments/store.js';
import { storeDrawings } from './drawings.js';
import { loadTurns, saveTurn } from './history.js';
import { expandListOps } from './listOps.js';
import { keepHeaderColours } from './tableLooks.js';
import { storePictures } from './pictures.js';
import type { PictureSearch } from './tools/types.js';
import type { ChatServiceDeps, TurnContext, TurnResult } from './turn-types.js';
import type { CommittedTurn } from './turn-checks.js';
import { validateOperations } from './validate.js';
import { carryTyping } from './typed-during.js';
import { workingView, type WorkingView } from './view.js';

export interface CommitInput {
  message: string;
  rawOperations: unknown[] | null;
  /** The gateway call `chat_response` names (the last, in agent mode). */
  finalCallId: string;
  saveCalls: (tx: Transaction, validated: { operations: Operation[]; dropped: DroppedOp[] }, at: string) => Promise<void>;
  /** The assistant message as replayed to the model in later turns. */
  rewrite: (message: string, operations: Operation[]) => string;
  /** Agent mode: the comments the model asked for, written in the same transaction. */
  writeComments?: (tx: Transaction) => Promise<Comment[]>;
  /** Agent mode: what the model thought and did, kept with the turn for the chat. */
  trace?: { steps: TurnStep[]; worked_ms: number };
  /** Agent mode: what search_pictures found, and the pictures used, already fetched (pictures.ts). */
  pictures?: { searches: PictureSearch[]; fetched: ReadonlyMap<number, Buffer> };
  /** Agent mode: copies the teacher must choose about first (the copy choice card). */
  copyRequests?: CopyRequest[];
  /** Agent mode, for Spyglass: docs the model read, and docs it opened from reference files (the teacher's own). */
  readDocIds?: string[];
  openedDocIds?: string[];
}

export type CommitDeps = Pick<ChatServiceDeps, 'db' | 'events' | 'canvas'> & { comments: CommentStore };

/** `turn.checks`, when given, receives what Spyglass's checks need once the turn is applied. */
export function commitTurn(deps: CommitDeps, turn: TurnContext & { snapshot?: WorkingView; checks?: { committed?: CommittedTurn } }, c: CommitInput): Promise<TurnResult> {
  const { db, events, canvas, comments } = deps;
  const { sessionId, thread, input, envelope, turn_id, anchor, attachments, commentThread } = turn;
  const { message, rawOperations, finalCallId, saveCalls, rewrite, writeComments, trace, pictures, copyRequests = [] } = c;
  return db.transaction(async (tx): Promise<TurnResult> => {
    const view = workingView(await canvas.loadState(sessionId, tx), thread.id, input.doc_id, input.copy_choice);
    const validated = validateOperations(rawOperations, view.ctx);
    const dropped: DroppedOp[] = validated.dropped;
    const imageBlockIds = view.ctx.imageBlockIds ?? new Set<string>();
    // Drawings become pictures, saved with the session like an upload.
    const drawn = await storeDrawings(validated.operations, imageBlockIds, async (svg, alt) => {
      const asset_id = `ast_${newUlid()}`;
      const data = Buffer.from(svg, 'utf8');
      const filename = alt ? `${alt.slice(0, 80)}.svg` : null;
      await saveAsset(tx, { asset_id, session_id: sessionId, mime: SVG_MIME, bytes: data.length, filename, data, created_at: nowIso() });
      await events.appendServer(sessionId, 'asset_upload', { asset_id, mime: SVG_MIME, bytes: data.length, filename, turn_id }, envelope, tx);
      return asset_id;
    });
    // ARASAAC pictures too, as PNGs.
    const picked = await storePictures(drawn, imageBlockIds, pictures?.searches ?? [], pictures?.fetched ?? new Map(), async (data, alt) => {
      const asset_id = `ast_${newUlid()}`;
      const filename = `${alt.slice(0, 80) || 'picture'}.png`;
      await saveAsset(tx, { asset_id, session_id: sessionId, mime: 'image/png', bytes: data.length, filename, data, created_at: nowIso() });
      await events.appendServer(sessionId, 'asset_upload', { asset_id, mime: 'image/png', bytes: data.length, filename, turn_id }, envelope, tx);
      return asset_id;
    });
    // Lists the model wrote become a block per item (listOps.ts); tables keep the header colour they had (tableLooks.ts).
    const operations = keepHeaderColours(expandListOps(picked.operations, view.blocks), view.blocks);
    dropped.push(...picked.dropped);

    const direct = input.edit_mode === 'edit';
    // Editing mode: blocks the teacher typed in since the turn began keep their typing (typed-during.ts).
    const typed = direct && turn.snapshot ? carryTyping(operations, turn.snapshot.blocks, view.blocks) : { applied: operations, typed: [], hold: [] };
    const response = await events.appendServer(sessionId, 'chat_response', { turn_id, text: message, operations, gateway_call_id: finalCallId }, envelope, tx);
    const result = await canvas.applyTurn(
      sessionId,
      {
        operations: typed.applied,
        turn_id,
        cause_event_id: response.event_id,
        thread_id: thread.id,
        default_doc_id: input.doc_id,
        direct,
        hold: typed.hold,
        ...(input.copy_choice ? { copy_choices: { [input.copy_choice.doc_id]: input.copy_choice.choice } } : {}),
      },
      { tx, envelope },
    );
    if (turn.checks) {
      const copyOf = new Map(result.produced.flatMap((p) => (p.op.op === 'create_doc' && p.op.copy_of ? [[p.doc_id, p.op.copy_of] as const] : [])));
      const made = result.changes.docs.filter((d) => result.created_doc_ids.includes(d.id));
      turn.checks.committed = {
        effect: {
          blocks: view.blocks,
          docs: view.docs,
          operations,
          turn_id,
          thread_id: thread.id,
          default_doc_id: input.doc_id,
          new_ids: result.new_ids,
          ...(input.copy_choice ? { copy_choices: { [input.copy_choice.doc_id]: input.copy_choice.choice } } : {}),
          ...(c.openedDocIds?.length ? { exclude_doc_ids: c.openedDocIds } : {}),
          ...(c.readDocIds?.length ? { read_doc_ids: c.readDocIds } : {}),
        },
        docs: [...view.docs, ...made].map((d) => ({ id: d.id, name: d.name, ...(copyOf.has(d.id) ? { copy_of: copyOf.get(d.id)! } : {}) })),
        direct,
      };
    }
    for (const docId of result.created_doc_ids) {
      const doc = result.changes.docs.find((d) => d.id === docId)!;
      await events.appendServer(sessionId, 'doc_create', { doc_id: doc.id, thread_id: thread.id, name: doc.name, created_by: 'model', ...(doc.style ? { style: doc.style } : {}) }, envelope, tx);
    }
    // Each picture's choices, by the block it went into.
    const offered: PictureOffer[] = picked.offers.flatMap(({ asset_id, ...offer }) => {
      const block = result.changes.blocks.find((b) => b.type === 'image' && (b.pending?.op === 'replace' ? b.pending.content : b.content).includes(`(asset:${asset_id})`));
      return block ? [{ ...offer, block_id: block.id }] : [];
    });
    // In Editing mode only what stays waiting is shown: changes to blocks with an earlier suggestion,
    // or that the teacher typed in meanwhile where both touched the same words.
    // In Suggesting mode, what went into a doc the turn made, or a blank doc, is not shown either
    // (canvas/newDocs.ts): of the docs given a font or page colour, only those where it still waits.
    const shown = direct
      ? result.proposed_block_ids.filter((id) => result.earlier_suggestions.includes(id) || typed.hold.includes(id))
      : result.proposed_block_ids.filter((id) => !result.new_doc_block_ids.includes(id));
    const styled = result.styled_doc_ids.filter((id) => result.changes.docs.some((d) => d.id === id && d.proposed_style));
    if (!direct)
      await events.appendServer(
        sessionId,
        'proposal_shown',
        { turn_id, block_ids: shown, doc_ids: result.created_doc_ids, ...(styled.length ? { style_doc_ids: styled } : {}), ...(result.blank_doc_ids.length ? { blank_doc_ids: result.blank_doc_ids } : {}) },
        envelope,
        tx,
      );
    else if (shown.length) await events.appendServer(sessionId, 'proposal_shown', { turn_id, block_ids: shown, doc_ids: [] }, envelope, tx);

    const at = nowIso();
    await saveCalls(tx, { operations, dropped }, at);
    const seq = (await loadTurns(tx, sessionId)).length + 1;
    await saveTurn(
      tx,
      sessionId,
      {
        turn_id,
        thread_id: thread.id,
        doc_id: input.doc_id,
        prompt: input.text,
        anchor,
        response_text: message,
        operations,
        rewritten_assistant_content: rewrite(message, operations),
        comment_id: input.comment_id ?? null,
        ...(attachments.length ? { attachments } : {}),
        ...(trace?.steps.length ? { steps: trace.steps, worked_ms: trace.worked_ms } : {}),
        ...(offered.length ? { pictures: offered } : {}),
        ...(copyRequests.length ? { copy_requests: copyRequests } : {}),
        at,
      },
      seq,
    );
    const reply = commentThread
      ? await comments.create(sessionId, { doc_id: commentThread.root.doc_id, root_id: commentThread.root.id, author: 'model', body: message, turn_id }, envelope, tx)
      : null;
    const added = writeComments ? await writeComments(tx) : [];

    return {
      ok: true,
      turn_id,
      message,
      operations,
      dropped: dropped.length,
      ...(trace?.steps.length ? { steps: trace.steps, worked_ms: trace.worked_ms } : {}),
      changes: {
        blocks: result.changes.blocks.map(publicBlock),
        docs: result.changes.docs,
        revisions: result.changes.revisions.map((r) => ({ block_id: r.block_id, version: r.version })),
      },
      proposed_block_ids: shown,
      created_doc_ids: result.created_doc_ids,
      ...(reply ? { comment: reply } : {}),
      ...(added.length ? { comments: added } : {}),
      ...(offered.length ? { pictures: offered } : {}),
      ...(typed.typed.length ? { typed_during: typed.typed } : {}),
      ...(copyRequests.length ? { copy_requests: copyRequests } : {}),
    };
  });
}
