import { isBlankDoc, type Block, type Doc, type EditMode } from '@edw/shared';

/**
 * What the model is told when the teacher has set Editing mode under the chat box: its changes
 * go straight into the doc. The system prompt says they are suggestions to accept, so without
 * this the reply would ask the teacher to accept them. Nothing is added in Suggesting mode, so
 * those turns read exactly as before.
 *
 * Earlier suggestions still waiting are the teacher's to decide: the model builds on the accepted
 * text and marks a change the teacher asked for to one of them (`revises_suggestion`), which goes
 * in; any other change to such a block stays a suggestion (`takeTurnIn`). A suggestion on a list
 * is on its items (PLAN.md section 6), so going ahead with it can take several operations.
 */
export function editModeNote(mode: EditMode | undefined): string {
  if (mode !== 'edit') return '';
  return '\n\n[The teacher has set Editing mode: your changes go straight into the document, with nothing to accept or reject. Do not ask them to accept your changes. Your earlier suggestions that are not accepted yet ([suggested] blocks, and "(suggested, not yet accepted: ...)" lines) are still the teacher\'s to decide: build on the accepted text, not the suggested one, and leave those suggestions as they are unless the teacher asks about them. When the teacher asks for a change to one of them, by name or clearly by implication, set "revises_suggestion": true on that replace, delete or move, and it goes straight in. One suggestion can be spread over several items of a list (some items changed, others to be deleted; marked "one suggestion with blocks ..."): when the teacher asks to go ahead with it, put in every part, each with "revises_suggestion": true. Any other change to a block with a suggestion waiting stays a suggestion.]';
}

/**
 * What the model is told in Suggesting mode when the open doc is blank (`isBlankDoc`, the same
 * test the commit uses): what it writes there goes straight in (Sam, 13 Nov 2026), so the reply
 * should not ask the teacher to accept it. The commit decides again when the turn ends: if the
 * teacher typed meanwhile, the changes are suggestions after all, and the reply may not say so.
 */
export const BLANK_DOC_NOTE =
  '\n\n[The open document is blank, so what you put in it (a font or page colour too) goes straight in, with nothing to accept or reject. Do not ask the teacher to accept it. Changes to their other documents that have something in them are still suggestions.]';

/** The note for this turn: `view` is the chat's docs and blocks as the turn began. */
export function blankDocNote(mode: EditMode | undefined, docId: string, view: { docs: readonly Doc[]; blocks: readonly Block[] }): string {
  if (mode === 'edit') return '';
  return isBlankDoc(view.docs.find((d) => d.id === docId), view.blocks) ? BLANK_DOC_NOTE : '';
}
