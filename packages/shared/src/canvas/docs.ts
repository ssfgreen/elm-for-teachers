/** Docs on the canvas: creating, renaming and styling one, and the model's suggested style. */
import type { Doc } from "../blocks.js";
import type { DocStyle } from "../enums.js";
import { CanvasError, emptyChanges, getDoc, type CanvasState, type Changes, type Ctx } from "./state.js";

export interface CreateDocParams {
  thread_id: string;
  name: string;
  created_by: "teacher" | "model";
  id?: string;
}

/** A new, empty doc in a thread, in the look new docs start with (`ctx.newDocStyle`). */
export function createDoc(state: CanvasState, ctx: Ctx, p: CreateDocParams): { doc: Doc; changes: Changes } {
  if (p.id !== undefined && state.docs.has(p.id)) throw new CanvasError("duplicate_id", `doc ${p.id} already exists`);
  const doc: Doc = {
    id: p.id ?? ctx.newId(),
    session_id: state.sessionId,
    thread_id: p.thread_id,
    name: p.name,
    created_by: p.created_by,
    created_at: ctx.now(),
  };
  const style = ctx.newDocStyle && cleanStyle(ctx.newDocStyle);
  if (style && (style.font || style.background)) doc.style = style;
  state.docs.set(doc.id, doc);
  const changes = emptyChanges();
  changes.docs.push(doc);
  return { doc, changes };
}

export function renameDoc(state: CanvasState, _ctx: Ctx, p: { doc_id: string; name: string }): { doc: Doc; changes: Changes } {
  const doc = getDoc(state, p.doc_id);
  doc.name = p.name;
  const changes = emptyChanges();
  changes.docs.push(doc);
  return { doc, changes };
}

/** Sets a doc's font and page colour; an empty style is the default look. */
export function setDocStyle(state: CanvasState, _ctx: Ctx, p: { doc_id: string; style: DocStyle }): { doc: Doc; changes: Changes } {
  const doc = getDoc(state, p.doc_id);
  const style: DocStyle = { ...(p.style.font ? { font: p.style.font } : {}), ...(p.style.background ? { background: p.style.background } : {}) };
  if (style.font || style.background) doc.style = style;
  else delete doc.style;
  const changes = emptyChanges();
  changes.docs.push(doc);
  return { doc, changes };
}

/** Only the parts of a style that are set. */
const cleanStyle = (s: DocStyle): DocStyle => ({ ...(s.font ? { font: s.font } : {}), ...(s.background ? { background: s.background } : {}) });

/**
 * The model suggests a font or page colour for a doc; the teacher decides. A later suggestion
 * in the same doc adds to the one still waiting (the newer part wins), under the newer turn.
 */
export function proposeStyle(state: CanvasState, _ctx: Ctx, p: { doc_id: string; style: DocStyle; turn_id: string }): { doc: Doc; changes: Changes } {
  const doc = getDoc(state, p.doc_id);
  doc.proposed_style = { style: cleanStyle({ ...doc.proposed_style?.style, ...p.style }), turn_id: p.turn_id };
  const changes = emptyChanges();
  changes.docs.push(doc);
  return { doc, changes };
}

/**
 * Accepts or rejects the doc's suggested style. An accept sets the parts it names on top of
 * the doc's style as it is now. `proposed` is what was suggested, for the log.
 */
export function decideStyle(
  state: CanvasState,
  _ctx: Ctx,
  p: { doc_id: string; accept: boolean },
): { doc: Doc; proposed: NonNullable<Doc["proposed_style"]>; changes: Changes } {
  const doc = getDoc(state, p.doc_id);
  const proposed = doc.proposed_style;
  if (!proposed) throw new CanvasError("nothing_pending", `doc ${p.doc_id} has no suggested style`);
  delete doc.proposed_style;
  if (p.accept) {
    const style = cleanStyle({ ...doc.style, ...proposed.style });
    if (style.font || style.background) doc.style = style;
  }
  const changes = emptyChanges();
  changes.docs.push(doc);
  return { doc, proposed, changes };
}
