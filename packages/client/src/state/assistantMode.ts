import type { EditMode, SuggestView } from '@edw/shared';

/**
 * The three modes under the chat box (12 Nov 2026). The server knows two: Editing, or
 * Suggesting. Suggesting and Track changes differ only in how suggestions look in the document
 * (`SuggestView`): only the new words in green, or the words added and taken out, both in red.
 */
export type AssistantMode = 'edit' | 'suggest' | 'track';

export const editModeOf = (m: AssistantMode): EditMode => (m === 'edit' ? 'edit' : 'suggest');

/** Editing has the Suggesting look, for an earlier suggestion still waiting. */
export const suggestViewOf = (m: AssistantMode): SuggestView => (m === 'track' ? 'track' : 'inline');

/** A stored mode; anything else (nothing stored, or an older value) is Suggesting. */
export const readMode = (stored: string | null): AssistantMode => (stored === 'edit' || stored === 'track' ? stored : 'suggest');
