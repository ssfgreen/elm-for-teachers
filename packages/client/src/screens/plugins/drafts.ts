/** Pure rules for the Plugins screen's studio drafts (useDrafts.ts). */
import type { PluginDraft } from '@edw/shared';
import { ApiError, errorCode } from '../../api/http';

/** The server's limit (server/src/plugins/drafts/service.ts DRAFTS_MAX). Keep in step. */
export const DRAFTS_MAX = 20;

/** What the teacher reads when the server refuses an address, by the refusal's code. */
const REFUSALS: Record<string, string> = {
  not_an_address: "That is not a web address. Copy the draft's address from the plugin studio and paste it here.",
  not_the_studio: 'Drafts can only be added from the plugin studio, and that address is from somewhere else.',
  not_a_draft: "That is not a draft's address. In the studio, copy the address of the draft itself: it ends with /d/ and a code.",
  too_many_drafts: `This workspace already has ${DRAFTS_MAX} drafts. Remove one before adding another.`,
};

export const ADD_FAILED = 'That draft could not be added. Please try again.';
export const REMOVE_FAILED = 'That draft could not be removed. Please try again.';
export const LIST_FAILED = 'Your drafts could not be loaded. Please reload the page.';

/** Whether the server says drafts are off here (no PLUGIN_STUDIO_URL). */
export const isDraftsOff = (e: unknown): boolean => errorCode(e) === 'drafts_off';

/** Whether a remove failed only because the draft was already gone. */
export const isGone = (e: unknown): boolean => e instanceof ApiError && e.status === 404 && errorCode(e) === 'not_found';

/** The message for a failed add. */
export function addRefusal(e: unknown): string {
  return REFUSALS[errorCode(e) ?? ''] ?? ADD_FAILED;
}

/** The list with this draft at the end, or as it was when the draft is already in it. */
export function withDraft(drafts: PluginDraft[], draft: PluginDraft): PluginDraft[] {
  return drafts.some((d) => d.id === draft.id) ? drafts : [...drafts, draft];
}

export function withoutDraft(drafts: PluginDraft[], id: string): PluginDraft[] {
  return drafts.filter((d) => d.id !== id);
}

/** "22 Nov 2026", for "Added …". */
export function addedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
