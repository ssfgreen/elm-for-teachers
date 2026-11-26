/**
 * Kinds the browser's event route refuses (400), so a teacher's browser cannot forge a study
 * seed, a scrub, a budget change, an export, a link change, a feature switch, a studio draft added or removed, a change to the reader's prompt library or a class's reader settings, safety instruction or code, a pupil's removal, a class's reading set, changed or removed, a model's reply, an open or an upload in the
 * research log. The browser never posts any of these (the replay only reads them). Kinds the
 * server writes as well as the browser are not here. A kind can be listed before it is defined
 * in events.ts; until then the batch schema refuses it anyway.
 */
export const SERVER_ONLY_KINDS: readonly string[] = [
  "study_seed",
  "pupil_rows_scrub",
  "budget_update",
  "workspace_export",
  "chat_response",
  "proposal_shown",
  "chat_stop",
  "participant_open",
  "interaction_logging_set",
  "asset_upload",
  "workspace_link",
  "workspace_features_set",
  "plugin_draft_add",
  "plugin_draft_remove",
  "reader_prompt_add",
  "reader_prompt_edit",
  "reader_prompt_remove",
  "reader_prompt_reorder",
  "class_reader_settings",
  "class_reader_safety_set",
  "class_code_set",
  "pupil_logins_made",
  "pupil_password_reset",
  "class_pupil_remove",
  "class_view_as_pupil",
  "reading_set",
  "reading_update",
  "reading_remove",
];

const serverOnly = new Set(SERVER_ONLY_KINDS);

/** Whether a kind may only be written by the server. */
export function isServerOnlyKind(kind: unknown): boolean {
  return typeof kind === "string" && serverOnly.has(kind);
}
