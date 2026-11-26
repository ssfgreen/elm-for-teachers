import { z } from "zod";
import { FocusPane } from "./enums.js";
import { Timestamp, Ulid } from "./blocks.js";
import { AssetUploadPayload, BlockRevisionPayload, BlockStructurePayload, BlockVisiblePayload, FocusPayload, KeystrokeBatchPayload, PastePayload, ScrollPayload, SelectionPayload } from "./events/editor.js";
import { ChatPromptPayload, ChatResponsePayload, ChatStopPayload, ChatTitlePayload, PictureChoosePayload, ProposalDecisionPayload, ProposalShownPayload, ThreadCreatePayload, ThreadOpenPayload, ThreadRenamePayload } from "./events/chat.js";
import { DocCreatePayload, DocDeletePayload, DocExportPayload, DocOpenPayload, DocPreviewPayload, DocRenamePayload, DocStylePayload, PreviewScrollPayload, StyleDecisionPayload } from "./events/docs.js";
import { CommentCreatePayload, CommentDeletePayload, CommentEditPayload, CommentResolvePayload } from "./events/comments.js";
import { MakeActionPayload, MakeDesignPayload } from "./events/make.js";
import { ErrorPayload, ParticipantOpenPayload } from "./events/session.js";
import { ClickPayload, InteractionLoggingSetPayload, PageStatePayload, PointerPayload, TextSelectPayload, UiStatePayload, ViewportPayload } from "./events/interactions.js";
import { PluginGrantPayload, PluginRequestPayload, PluginTrustSetPayload } from "./events/plugins.js";
import { PluginDraftAddPayload, PluginDraftRemovePayload } from "./events/drafts.js";
import { ReaderPromptAddPayload, ReaderPromptEditPayload, ReaderPromptRemovePayload, ReaderPromptReorderPayload } from "./events/readerPrompts.js";
import { ReadingRemovePayload, ReadingSetPayload, ReadingUpdatePayload } from "./events/readings.js";
import { PreferencesSetPayload } from "./events/preferences.js";
import { CopyChoicePayload, SpyglassActionPayload, SpyglassShownPayload, SpyglassTogglePayload } from "./events/spyglass.js";
import { ClassArchivePayload, ClassCreatePayload, ClassOpenPayload, ClassUpdatePayload, CurriculumPickPayload, CurriculumStatusPayload, ClassReaderSettingsPayload, ClassReaderSafetySetPayload, ClassCodeSetPayload, ClassPupilRemovePayload, PedagogyOpenPayload, PupilsChangePayload, StudySeedPayload, SchoolCreatePayload, SchoolRenamePayload, YearGroupArchivePayload, YearGroupCreatePayload, YearGroupUpdatePayload } from "./events/classes.js";
import { WorkspaceExportPayload } from "./events/exports.js";
import { PupilLoginsMadePayload, PupilPasswordResetPayload, ClassViewAsPupilPayload } from "./events/classes.js";
import { WorkspaceLinkPayload } from "./events/access.js";
import { BudgetUpdatePayload } from "./events/budget.js";
import { WorkspaceFeaturesSetPayload } from "./events/features.js";
import { ProjectArchivePayload, ProjectCreatePayload, ProjectDeletePayload, ProjectOpenPayload, ProjectRenamePayload, ProjectUpdatePayload, ReferenceDeletePayload, ReferenceOpenPayload, ReferenceSummaryPayload, ReferenceUploadPayload } from "./events/projects.js";

export * from "./events/editor.js";
export * from "./events/chat.js";
export * from "./events/docs.js";
export * from "./events/comments.js";
export * from "./events/make.js";
export * from "./events/session.js";
export * from "./events/interactions.js";
export * from "./events/plugins.js";
export * from "./events/drafts.js";
export * from "./events/readerPrompts.js";
export * from "./events/readings.js";
export * from "./events/preferences.js";
export * from "./events/projects.js";
export * from "./events/classes.js";
export * from "./events/spyglass.js";
export * from "./events/exports.js";
export * from "./events/access.js";
export * from "./events/budget.js";
export * from "./events/serverOnly.js";

/* ------------------------------------------------------------------ payloads */

/* The payloads live in events/, one file per family. The pupil-row scrub stays here for now. */

/**
 * A researcher removed the pupil table from the workspace's stored model calls (issue #16):
 * how many calls changed, how many tables and rows were taken out, and how many calls were
 * `unsure`. Never the rows themselves.
 */
export const PupilRowsScrubPayload = z.object({
  calls: z.number().int().nonnegative(),
  tables: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  /** Calls whose table end was in doubt (removed through to the closing line), or with no closing line (left alone). */
  unsure: z.number().int().nonnegative(),
  /** Pupil row lines still in a class message whose table was removed (a real run with any is refused, so 0 here). A class message with no closing line is left alone: its rows count under `unsure`, not here. */
  leftover: z.number().int().nonnegative(),
});

/* ----------------------------------------------------------------- envelope */

/**
 * Fields the client supplies. The server never trusts seq or server_ts from the
 * client. `doc_id` and `thread_id` are what the teacher had open when it happened.
 */
const ClientEnvelope = z.object({
  event_id: Ulid,
  client_ts: Timestamp,
  focus_pane: FocusPane,
  doc_id: Ulid.nullable(),
  thread_id: Ulid.nullable(),
});

const ServerEnvelope = ClientEnvelope.extend({
  session_id: z.string(),
  /** Server-assigned, gapless per session, starting at 1. */
  seq: z.number().int().positive(),
  server_ts: Timestamp,
});

function body<K extends string, P extends z.ZodTypeAny>(kind: K, payload: P) {
  return { kind: z.literal(kind), payload };
}

const bodies = [
  body("keystroke_batch", KeystrokeBatchPayload),
  body("paste", PastePayload),
  body("selection", SelectionPayload),
  body("focus", FocusPayload),
  body("scroll", ScrollPayload),
  body("block_visible", BlockVisiblePayload),
  body("chat_prompt", ChatPromptPayload),
  body("chat_response", ChatResponsePayload),
  body("chat_stop", ChatStopPayload),
  body("proposal_shown", ProposalShownPayload),
  body("proposal_accept", ProposalDecisionPayload),
  body("proposal_reject", ProposalDecisionPayload),
  body("block_revision", BlockRevisionPayload),
  body("block_structure", BlockStructurePayload),
  body("asset_upload", AssetUploadPayload),
  body("picture_choose", PictureChoosePayload),
  body("participant_open", ParticipantOpenPayload),
  body("doc_create", DocCreatePayload),
  body("doc_rename", DocRenamePayload),
  body("doc_style", DocStylePayload),
  body("style_accept", StyleDecisionPayload),
  body("style_reject", StyleDecisionPayload),
  body("doc_delete", DocDeletePayload),
  body("doc_open", DocOpenPayload),
  body("doc_export", DocExportPayload),
  body("doc_preview", DocPreviewPayload),
  body("preview_scroll", PreviewScrollPayload),
  body("thread_create", ThreadCreatePayload),
  body("thread_rename", ThreadRenamePayload),
  body("thread_open", ThreadOpenPayload),
  body("chat_title", ChatTitlePayload),
  body("make_action", MakeActionPayload),
  body("make_design", MakeDesignPayload),
  body("comment_create", CommentCreatePayload),
  body("comment_delete", CommentDeletePayload),
  body("comment_edit", CommentEditPayload),
  body("comment_resolve", CommentResolvePayload),
  body("project_create", ProjectCreatePayload),
  body("project_rename", ProjectRenamePayload),
  body("project_update", ProjectUpdatePayload),
  body("project_archive", ProjectArchivePayload),
  body("project_delete", ProjectDeletePayload),
  body("project_open", ProjectOpenPayload),
  body("school_create", SchoolCreatePayload),
  body("school_rename", SchoolRenamePayload),
  body("year_group_create", YearGroupCreatePayload),
  body("year_group_update", YearGroupUpdatePayload),
  body("year_group_archive", YearGroupArchivePayload),
  body("class_create", ClassCreatePayload),
  body("class_update", ClassUpdatePayload),
  body("class_archive", ClassArchivePayload),
  body("class_open", ClassOpenPayload),
  body("pupils_change", PupilsChangePayload),
  body("curriculum_pick", CurriculumPickPayload),
  body("curriculum_status", CurriculumStatusPayload),
  body("class_reader_settings", ClassReaderSettingsPayload),
  body("class_reader_safety_set", ClassReaderSafetySetPayload),
  body("class_code_set", ClassCodeSetPayload),
  body("pupil_logins_made", PupilLoginsMadePayload),
  body("pupil_password_reset", PupilPasswordResetPayload),
  body("class_pupil_remove", ClassPupilRemovePayload),
  body("class_view_as_pupil", ClassViewAsPupilPayload),
  body("pedagogy_open", PedagogyOpenPayload),
  body("study_seed", StudySeedPayload),
  body("reference_upload", ReferenceUploadPayload),
  body("reference_summary", ReferenceSummaryPayload),
  body("reference_delete", ReferenceDeletePayload),
  body("reference_open", ReferenceOpenPayload),
  body("plugin_trust_set", PluginTrustSetPayload),
  body("plugin_request", PluginRequestPayload),
  body("plugin_grant", PluginGrantPayload),
  body("plugin_draft_add", PluginDraftAddPayload),
  body("plugin_draft_remove", PluginDraftRemovePayload),
  body("reader_prompt_add", ReaderPromptAddPayload),
  body("reader_prompt_edit", ReaderPromptEditPayload),
  body("reader_prompt_remove", ReaderPromptRemovePayload),
  body("reader_prompt_reorder", ReaderPromptReorderPayload),
  body("reading_set", ReadingSetPayload),
  body("reading_update", ReadingUpdatePayload),
  body("reading_remove", ReadingRemovePayload),
  body("preferences_set", PreferencesSetPayload),
  body("copy_choice", CopyChoicePayload),
  body("spyglass_shown", SpyglassShownPayload),
  body("spyglass_toggle", SpyglassTogglePayload),
  body("spyglass_action", SpyglassActionPayload),
  body("pointer", PointerPayload),
  body("click", ClickPayload),
  body("viewport", ViewportPayload),
  body("ui_state", UiStatePayload),
  body("page_state", PageStatePayload),
  body("text_select", TextSelectPayload),
  body("interaction_logging_set", InteractionLoggingSetPayload),
  body("pupil_rows_scrub", PupilRowsScrubPayload),
  body("workspace_export", WorkspaceExportPayload),
  body("workspace_link", WorkspaceLinkPayload),
  body("budget_update", BudgetUpdatePayload),
  body("workspace_features_set", WorkspaceFeaturesSetPayload),
  body("error", ErrorPayload),
] as const;

export const EVENT_KINDS = bodies.map((b) => b.kind.value) as unknown as readonly [string, ...string[]];
export const EventKind = z.enum(EVENT_KINDS as unknown as [string, ...string[]]);
export type EventKind = (typeof bodies)[number]["kind"]["value"];

type Bodies = typeof bodies;
type ExtendAll<E extends z.ZodObject<z.ZodRawShape>, B extends Bodies> = {
  [I in keyof B]: B[I] extends { kind: infer K extends z.ZodLiteral<string>; payload: infer P extends z.ZodTypeAny }
    ? z.ZodObject<E["shape"] & { kind: K; payload: P }>
    : never;
};

function unionOf<E extends z.ZodObject<z.ZodRawShape>>(env: E) {
  const members = bodies.map((b) => env.extend({ kind: b.kind, payload: b.payload }));
  return z.discriminatedUnion(
    "kind",
    members as unknown as [z.ZodDiscriminatedUnionOption<"kind">, ...z.ZodDiscriminatedUnionOption<"kind">[]],
  ) as unknown as z.ZodDiscriminatedUnion<"kind", ExtendAll<E, Bodies>[number][]>;
}

/** An event as the client sends it. */
export const ClientEvent = unionOf(ClientEnvelope);
export type ClientEvent = z.infer<typeof ClientEvent>;

/** An event as stored and exported. */
export const Event = unionOf(ServerEnvelope);
export type Event = z.infer<typeof Event>;

export const ClientEventBatch = z.object({
  session_id: z.string(),
  events: z.array(ClientEvent).min(1).max(500),
});
export type ClientEventBatch = z.infer<typeof ClientEventBatch>;

export type EventOfKind<K extends EventKind> = Extract<Event, { kind: K }>;
export type PayloadOfKind<K extends EventKind> = EventOfKind<K>["payload"];
