# Development Specification: Instrumented Worksheet Authoring Tool

Oct 28, 2026 · @Sam Green

Concise specification for the research tool used in the teacher-AI epistemic relationship study. Companion to the Study Design and Facilitator Interview Guide (`study-design.md`). Where the two documents differ, the study design is authoritative; this document was reconciled to it on 28 Oct 2026.

## 1. Purpose, scope and non-goals

The tool is a single-purpose web application in which a teacher creates and differentiates a worksheet with an AI assistant, while every action is logged at a grain fine enough to reconstruct the session and attribute every block of the final worksheet to its author. It also hosts the post-task annotation screens and a facilitator console for log-prompted interviews.

In scope:

- A three-pane authoring screen: brief and class specification, block-based canvas, chat with the assistant.
- A model gateway that proposes block-level edits, keeps the canvas as the source of truth, and supports rewriting of the stored message history.
- A deterministic injector that substitutes bank items for model-generated items and logs ground truth.
- An append-only event log with keystroke, focus, dwell, chat and edit events, replayable to any point.
- Provenance annotation and relationship card-sort screens.
- A facilitator console that hosts the questionnaire and interview views and exports a session bundle.

Non-goals:

- Multi-user editing, accounts for teachers, or any use outside supervised sessions.
- Rich formatting beyond the basic block set (headings 1 to 3, paragraphs, bullet, numbered and check lists, quotes, code blocks, dividers, images, simple tables) and inline bold, italic and underline. No colours, fonts or layout.
- Export of the worksheet for classroom use (a PDF preview is sufficient; nothing made in the tool is used with pupils).
- Automatic coding of prompts or interview data. Coding is done by researchers from the export.

Design principle: anything the analysis will need must be derivable from the event log alone. If a measure in the study design cannot be computed from the export, the logging is incomplete.

## 2. Participant-facing flow

A session is a linear sequence of phases. The facilitator advances phases from the console; the participant cannot go back. A session starts in Task 1, and the participant link opens straight into the authoring screen. Task 1's clock starts when the participant first opens the link, not when the facilitator creates the session; every open is logged as a `participant_open` event. Welcome, consent and the intake questionnaire (study design A.2, a Microsoft Teams form sent in advance and joined to the session by participant code at analysis) happen outside the tool.

| Phase | Screen | Participant can | Logged |
| --- | --- | --- | --- |
| Task 1 | Authoring screen, Task 1 brief, class panel hidden | Write on the canvas, prompt the assistant, accept or reject proposed edits, mark the task complete | All events |
| Task 2 | Authoring screen, Task 2 brief, class panel visible; the Task 1 worksheet is the starting canvas | As Task 1; may adapt the single worksheet in place or create named versions for particular pupils or needs (section 4) | All events |
| Final check | Authoring screen with a banner: "You are about to hand these out tomorrow" | As above | All events, phase-tagged |
| Annotation | Read-only final worksheet with per-block tag controls | Tag each block (who decided, confidence, flag) | Tag values and timing |
| Relationship sort | Card sort | Drag cards into five piles; choose one best card per task | Pile membership, best cards, timing |
| Ownership rating | Me-to-assistant slider per section; authorship and control items | Set each slider; answer authorship and control | Slider values, authorship, control, timing |
| Questionnaire | Fixed post-task questionnaire (study design B.3.1) | Answer every item | Responses and timing |
| Interview | Final worksheet and chat, read-only, with four fixed anchors (B.3.2) the facilitator navigates, then the closing and whole-interaction questions (B.4) | Watch | Anchor opened, timestamps |
| Debrief | Read-only list of planted items | Read; indicate withdrawal | Withdrawal status |

**Authoring screen layout.** Full window, modelled on the Claude.ai document view (study lead, 29 Oct 2026). Left: a collapsible task sidebar holding everything about the study task (task name, the final-check note, the brief, from Task 2 the class register rendered as a SEEMiS printout (section 13), and the task-complete control), so the editor and chat also work on their own; it opens whenever there is a brief. Then the document panel, flush to the window and filling the rest, a drag handle, and the chat column on the right (one text input and a send button, Enter sends). The screen is exactly the visible window and never scrolls as a page; the document, chat and sidebar scroll independently. The document panel has a header row with the worksheet title (its first heading) and Accept all / Reject all, from Task 2 a tab bar listing the main worksheet and any versions (section 4) with a "New version" control that asks for a name and, optionally, the pupils it is for, then the formatting toolbar, and only the document scrolls. Proposed edits from the assistant appear in the canvas as normal text with a thin margin line and accept and reject controls in the right margin; they are not applied until accepted. The participant can also type directly into any block at any time, including into a pending proposal (which counts as edit-then-accept).

**Canvas editing.** Supported block types: heading (levels 1 to 3), paragraph, bullet, numbered and checklist items (a block per list item from 7 Nov 2026; a run of them is one list, numbered from its first item; before then a whole list was one block), quote, code block, divider, image (uploaded by the teacher and stored with the session), table (plain cells), and worksheet item (a paragraph with a label slot, used for identification items). Inline bold, italic and underline are supported with the usual shortcuts (Cmd or Ctrl with B, I, U), as are copy and paste. A block toolbar offers the block types; markdown shortcuts for headings and lists also work. Block content is stored as markdown (inline marks as `**`, `*` and `<u>`), so every revision stays a plain diffable string. No colours, fonts or layout.

**Assistant behaviour visible to the participant.** The assistant answers in chat and, when the request implies changes to the worksheet, also proposes block edits. It never applies changes directly. It has no visible knowledge of the planted errors.

## 3. Architecture overview

The participant's browser sends prompts and every event to the session server. The model gateway sends the current canvas and a trimmed history to the model API and receives block operations back; the injector substitutes bank items before anything is shown and records ground truth; the event store holds everything and feeds the facilitator console. Nothing is written to the canvas without passing through the event store.

**Components**

- **Client**: a single-page app (React) with a ProseMirror-based block editor. It holds no state the server does not also hold; on reload it rebuilds the canvas from the event store.
- **Session server**: one process per deployment, stateless apart from the event store. Exposes a small HTTP and WebSocket API: session lifecycle, event ingestion, chat turn, accept or reject edit, annotation submission, console queries, export.
- **Model gateway**: builds the prompt from the canvas state and the stored (possibly rewritten) history, calls the provider, parses block operations, and hands generated items to the injector.
- **Injector**: deterministic; takes the generated block list and the session seed, returns the list with substitutions and a provenance record.
- **Event store**: an append-only table in SQLite or Postgres, one row per event, with a session id, monotonic sequence number, server timestamp and client timestamp.
- **Facilitator console**: a separate route on the same app, authenticated, that advances phases, hosts the questionnaire and the fixed-anchor interview view, and exports the session bundle.

**Technology defaults**: TypeScript throughout; Node server; SQLite for database; ProseMirror for the editor; ELM Proxy API used running a GPT variant.

## 4. Canvas data model

The canvas is a set of versions (see **Versions** below), each an ordered list of blocks. Every session has a main version; further versions exist only if the teacher or the model creates them in Task 2. Each block carries its provenance and its full edit history, so that at any point the final worksheet can be attributed character by character. Block identity is stable: edits change a block's content, not its id. Splitting or merging blocks creates new ids with a `derived_from` link.

**Block**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (ULID) | Stable for the block's life |
| `session_id` | string |  |
| `variant_id` | string | The version this block belongs to; `main` for the Task 1 worksheet |
| `type` | enum | heading, paragraph, bullet\_item, numbered\_item, checklist\_item (one list item each, from 7 Nov 2026), bullet\_list, numbered\_list, checklist (a whole list; no longer written, split into items by `scripts/split-lists.mjs`), quote, code\_block, divider, image, table, worksheet\_item |
| `section` | enum | explanation, identify, answer\_key, write\_own, adaptation, other; set by the model or the teacher, editable |
| `content` | string (markdown) | Current text; for worksheet\_item also `label` (metaphor / simile / blank) and `answer_key` |
| `origin` | enum | teacher, model, injected |
| `origin_turn` | string or null | Chat turn id that produced it, if model or injected |
| `injection_id` | string or null | Reference into the injection log; null unless origin is injected |
| `status` | enum | proposed, accepted, rejected, live, deleted |
| `version` | integer | Incremented on every content change |
| `derived_from` | string or null | Parent block id on split, merge, or copy into a new version |
| `created_at`, `updated_at` | timestamp | Server time |

**Block revision** (one row per content change)

| Field | Type | Notes |
| --- | --- | --- |
| `block_id`, `version` |  | Composite key |
| `actor` | enum | teacher, model, injector |
| `before`, `after` | string | Full content; diffs are computed at analysis |
| `cause_event_id` | string | The event that caused this change (keystroke batch, accept, model op) |
| `at` | timestamp |  |

**Derived at export**: for each live block, the proportion of its final characters attributable to teacher, model and injector, computed by replaying revisions with a character-level diff. This gives the authorship share used in the study design.

**Versions.** Task 2 takes the Task 1 worksheet as its input. The teacher may adapt it in place following universal design principles, create separate versions for particular pupils or needs, or do both. A version is a canvas-level record:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `main`, or a ULID |
| `session_id` | string |  |
| `name` | string | As shown on the tab, e.g. "Lachlan", "Dyslexia-friendly" |
| `target_pupils` | string[] | Register names the version is for; empty for a general version |
| `created_by` | enum | teacher, model |
| `copied_from` | string or null | Source version id; null if started empty |
| `created_at` | timestamp |  |

Creating a version from a source copies every live block of the source into a new block with a new id, `derived_from` set to the source block, and `origin` and `injection_id` carried over, so that a planted error copied into a version is still a planted error there. The copy is recorded as a revision with actor `teacher` or `model` and the copy event as its cause. Authorship share for a copied block is computed by replaying the source block to the copy point and then the copy's own revisions. Deleting a version marks its blocks deleted. Versions cannot be created in Task 1.

**Invariants**

- A block with `origin = injected` never changes `origin`, even when fully rewritten by the teacher; the revision history shows the rewrite.
- A proposed block is not part of the live worksheet until accepted. Typing into a proposed block records an edit revision followed by an implicit accept.
- Deleting a block sets `status = deleted`; nothing is physically removed.
- The server, not the client, assigns block ids and versions.
- `variant_id` never changes; moving content between versions is a delete and an insert.
- A version's blocks are independent of their source after the copy; later edits to the main worksheet do not propagate.

## 5. Model gateway

The gateway turns a chat turn into a reply and, where appropriate, a set of block operations against the current canvas. It never writes to the canvas directly.

**Prompt construction.** Every call is assembled from four parts, in this order: a fixed system prompt (stored verbatim in configuration and in every session bundle); the task brief and, from Task 2, the class specification; a serialisation of the current live canvas, version by version, as a numbered list of blocks with ids, types, sections and content, each version headed by its name and target pupils; and the chat history. The history is trimmed to the last N turns (default 12) plus a running summary the gateway maintains; the canvas serialisation, not the history, is the authoritative account of the worksheet.

**Output contract.** The model is instructed to reply with a short chat message and, optionally, a JSON array of operations in a fenced block. Supported operations:

| Operation | Fields | Effect once accepted |
| --- | --- | --- |
| `insert` | `variant` (version id, default `main`), `after` (block id or `start`), `type`, `section`, `content`, optional `label` and `answer_key` | New block, origin model |
| `replace` | `id`, `content`, optional `label`, `answer_key` | New revision, actor model |
| `delete` | `id` | Status deleted |
| `move` | `id`, `after` | Reorder within its version |
| `create_version` | `temp_id` (used as `variant` by later operations in the same turn), `name`, `target_pupils`, `copy_from` (version id or `none`) | New version, created\_by model; shown as a pending tab and accepted or rejected as a whole, together with any operations in the same turn that target it |

Operations are validated against the current canvas (unknown ids are dropped and logged; operations targeting a version proposed in the same turn are validated against that proposed version) and then passed through the injector before being presented as proposals. A full-document generation in Task 1 is simply a list of inserts.

**History rewriting.** After injection, the assistant turn stored in the history is rewritten so that its operations contain the injected content in place of the original. The original is retained in the injection log, never in the history. On the next call the model therefore sees a history in which it authored the planted items, and it will answer questions about them as author. No instruction about defending or conceding is given.

**Model behaviour settings.** One provider, one model version and temperature 0 (or the lowest the provider allows) for the whole study, fixed in configuration and recorded per call. The provider adapter exposes `complete(messages, system) -> text` and nothing else, so switching provider changes no other code.

**Per-call logging.** Request (system prompt hash, serialised canvas, trimmed history), raw response, parsed operations, validation drops, latency, token counts, provider request id.

**Failure handling.** On provider error or unparseable output, the chat shows "The assistant couldn't respond; please try again" and the event is logged. The facilitator console shows a live error count so a session can be abandoned if the provider is unreliable.

## 6. Injector

The injector is a pure function: given the validated operations from a model turn, the session's injection plan and the current canvas, it returns modified operations and a list of injection records. It uses no model call and no randomness beyond the session seed.

**Bank schema** (a versioned JSON file, frozen before data collection; its hash is recorded in every session bundle)

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | C1 to C7, D1 to D5, K1, K2 as in the study design |
| `kind` | enum | content\_item, definition, answer\_key, adaptation, control |
| `slots` | string[] | Which block type and section it can replace, as `type/section` pairs in order of preference: e.g. `worksheet_item/identify`, `paragraph/explanation`, `paragraph/adaptation` |
| `presented` | object | The content as the teacher will see it: `content`, and for items `label`; for adaptations, which pupil(s) it targets |
| `extra_ops` | array or null | Additional operations planted with the item; only D2 uses this |
| `correct` | object | The correct reading, for the debrief and for coding |
| `theme_neutral` | boolean | True if the item reads naturally regardless of the worksheet's examples; only theme-neutral items are used in version 1 |
| `difficulty` | integer 1 to 3 | For balancing across sessions |

**Injection plan.** Created at session start from the seed, following study design A.4: two C-series codes, two D-series codes and both K-series codes (K1 and K2). Constraints: at most one of the two C-series codes is a definition error (C5 or C6), so at least one is an item or answer-key error; D1 (generic dyslexia adaptation) is in half of sessions, alternating by session order; C and D pairs are drawn so that no two sessions in the study share the same four codes. The plan is stored before Task 1 begins.

**Swap procedure.** On each model turn:

1. Identify candidate slots in the incoming operations: inserts and replaces whose `type` and `section` match an unfulfilled plan entry.
2. For each unfulfilled entry with a matching candidate, replace the operation's content (and label or answer key) with the bank item's `presented` content. Prefer candidates in the middle of a list over the first or last position.
3. Mark the operation's resulting block `origin = injected` with the `injection_id`.
4. Record an injection record: `injection_id`, `code`, `block_id`, `turn_id`, `original_content`, `presented_content`, position in list, timestamp.
5. If no candidate exists on this turn, the entry stays unfulfilled and is retried on later turns. Entries still unfulfilled when the task ends are recorded as not planted.

D-series entries are only eligible from Task 2 and are planted wherever the differentiation lives. Each D-series bank item names its target pupil(s) and the slot it replaces. The injector looks first for a candidate in a version whose `target_pupils` include the named pupil; failing that, in a general version; failing that, in the main worksheet (the universal-design case, which the study design treats as "the sole version"). A D-series item replaces or augments the model's adaptation text for the named pupil(s); if the model produced no per-pupil adaptation, D1 is planted as a single generic adaptation block addressed to all three dyslexic pupils. D2 (the adaptation removes the task) is the one structural item: its bank entry carries, besides the presented note for Callum, an `extra_ops` list that deletes the identification blocks in the version it is planted in. D2 is eligible only when a version targeting Callum exists and is otherwise recorded as not planted.

**What the injector never does.** It never alters a block the teacher has edited. It never plants into a block that is a replacement of an already-injected block. It never touches the chat message text, only the operations. It never re-plants an item the model has itself corrected; such corrections are logged as a `model_self_correction` event against the injection record.

**Validation.** A unit test suite runs the injector against a corpus of recorded model outputs and asserts: plan fulfilment rate, no double planting, correct origin tagging, and byte-identical output for the same seed and input.

## 7. Event logging

Every event has the same envelope and lands in one append-only table. The client buffers events and sends them in batches at most 500 ms apart; the server assigns the sequence number. Client and server timestamps are both kept so that latency can be measured and ordering reconstructed.

**Envelope**

| Field | Type | Notes |
| --- | --- | --- |
| `event_id` | ULID |  |
| `session_id` | string |  |
| `seq` | integer | Server-assigned, gapless per session |
| `phase` | enum | task1, task2, final\_check, annotation, sort, ownership, questionnaire, interview, debrief |
| `kind` | string | See below |
| `client_ts`, `server_ts` | timestamp |  |
| `focus_pane` | enum | brief, canvas, chat, none |
| `payload` | JSON | Kind-specific |

**Event kinds**

From 13 Nov 2026 the browser's event route refuses the kinds only the server writes (`packages/shared/src/events/serverOnly.ts`: `study_seed`, `pupil_rows_scrub`, `budget_update`, `workspace_export`, and from the endpoint audit (#44) `chat_response`, `proposal_shown`, `chat_stop`, `participant_open`, `interaction_logging_set`, `asset_upload`, the new `workspace_link`, and from 15 Nov 2026 `workspace_features_set`): a batch holding any of them gets 400 `server_only_kind`, and none of it is stored.

| Kind | Payload | Notes |
| --- | --- | --- |
| `keystroke_batch` | target (block\_id or chat), `edits` (canvas: one per editor transaction, `{t, ops}` where `ops` is a CoAuthor-style retain/insert/delete delta over the block's markdown in code points, plus `label`/`answer_key` when changed), character count, batch start and end ts, and for canvas blocks the block content after the batch; from 7 Nov 2026, `in_suggestion: true` when the typing was inside one of the assistant's suggestions and it stays waiting, with `live_after` (the block's own text) for a suggested edit | Replaying a block's edits in order reproduces `content_after`; that is tested. Without `in_suggestion` (all earlier data), typing into a suggestion accepted it. With `live_after`, `content_after` is the suggested text and the edits are over it, so `text_events.jsonl` takes the block's live revision instead. Chat input sends text diffs as `steps`. Canvas batches before 29 Oct 2026 carried ProseMirror steps instead of `edits` |
| `paste` | target (block\_id or chat), length, source (internal or external) | External paste is detected by clipboard origin where the browser allows, otherwise inferred from insertion size |
| `selection` | block\_id, from, to | Throttled to one per 250 ms |
| `focus` | pane, block\_id or null | On every change |
| `scroll` | pane, position | Throttled to one per 500 ms |
| `preview_scroll` | doc\_id, position, max | The "Preview in Word" dialog (12 Nov 2026), which is not one of the panes. Throttled like `scroll`; `position / max` is how far through the pages the teacher got (`max` is 0 when the pages fit). Before 12 Nov 2026, scrolling the preview was not logged |
| `block_visible` | block\_id, visible (bool) | From an IntersectionObserver; dwell is computed from visible plus focus at analysis |
| `pointer` | interval\_ms, samples: `{t, x, y, pane, block_id, item}` | Interaction logging only (10 Nov 2026, below). At most one sample per 100 ms while the pointer moves, sent 2 s (or 100 samples) at a time. `x`, `y` are CSS pixels from the window's top left; `item` is the closest `data-track` element: `suggestion:<block_id>:<part\|all>`, `comment:<root id>`, `message:<key>` |
| `click` | pane, block\_id, item, x, y, button, count, control (role, accessible name) or null | Interaction logging only. Every click and right click, logged in the capture phase. `count` 0 is a keyboard click. A field's typed value is never read |
| `viewport` | width, height, device\_pixel\_ratio, regions (threads, canvas, chat, comments: left, top, width, height) | Interaction logging only. On start, on resize, when a region changes size; a hidden region is left out |
| `ui_state` | role (dialog, alertdialog, menu, listbox), label, open | Interaction logging only. A dialog or menu opening or closing |
| `page_state` | visible, focused | Interaction logging only. The tab showing, and the window focused: false while the teacher looks elsewhere |
| `text_select` | pane, block\_id, item, length, text (first 500 characters) | Interaction logging only. Text selected outside the editor (chat, comments, references); the editor logs `selection` |
| `interaction_logging_set` | on, until (or null) | Logged by the server when the admin switches interaction logging for the workspace |
| `pupil_rows_scrub` | calls, tables, rows, unsure, leftover | Not logged yet: the removal is switched off until Sam decides (13 Nov 2026). If switched on, logged by the server when a researcher removes the pupil table from the workspace's stored model calls (`scripts/scrub-pupil-rows.mjs`, from 13 Nov 2026): how many calls changed and how many tables and rows were taken out, never the rows. `unsure`: calls whose table end was in doubt, so everything through to the class message's closing line was removed, or with a class message that has a table and no closing line, left alone. `leftover`: row lines still in a class message whose table was removed; a run with any is refused, so it is 0. A dry run is not logged |
| `workspace_export` | format (`zip` or `json`), via (`account` or `password`: how the admin signed in), files (how many the bundle held), account_id (the admin's account when `via` is `account`, from 14 Nov 2026; absent for a password export and in earlier events) | Logged by the server when an admin downloads the workspace's full bundle (13 Nov 2026 onwards), after the bundle is built: a bundle holds the events of earlier downloads, not its own. Before 13 Nov 2026 downloads were not logged. Backups taken with `scripts/download-workspaces.mjs` do not log it |
| `workspace_link` | action (`replace`: a new link and access code, the old ones stopped working; `close`: both stopped, none issued), via (`account` or `password`: how the admin signed in) | Logged by the server when an admin replaces or closes a link workspace's link in /admin (13 Nov 2026 onwards). Never carries the link or the code. A teacher's events on the old link stop here; on a replace they go on under the new one |
| `budget_update` | amount_gbp (pounds added, always 10), budget_before_gbp and budget_after_gbp (the workspace's budget either side: config `limits.budget_gbp` plus every top-up), spent_gbp (its spend then, from the stored cost of each model call), via (`account` or `password`: how the admin signed in), account_id (the admin's account when signed in with one; from 15 Nov 2026, absent for a password top-up and in earlier events) | Logged by the server when an admin presses "Add £10" for a workspace in /admin (14 Nov 2026 onwards), one event per top-up. There is no undo. Before this the budget was the config figure alone |
| `workspace_features_set` | features (all the switches in force afterwards: `classes`, `curriculum`, `pedagogy`, `preferences`, `spyglass`, `plugins`, and from 23 Nov 2026 `pupils`, each true or false; an earlier event has no `pupils` and reads as false), changed (the switches whose value changed, in that order; empty on a PUT that changes nothing), via (`account` or `password`: how the admin signed in), account_id (the admin's account when signed in with one; absent for the password) | Logged by the server when an admin sets a workspace's feature switches (`PUT /api/admin/sessions/:id/features`, 15 Nov 2026 onwards), and when a workspace is created with any switch away from its default (none is logged when it starts at the defaults). Before 15 Nov 2026 every workspace had every feature on. `pupils` (pupils signing in to the workspace's classes, issue #179) is off by default and only an admin turns it on |
| `plugin_draft_add`, `plugin_draft_remove` | draft\_id (Elm's own short id), name; for an add, content\_hash (null when the studio could not be read; else, from 22 Nov 2026 with #159, `sha256:<64 hex>`: the studio's own hash when its answer carries one, else a sha256 of the answer, the same rule as `chat_prompt`'s `plugins`; plain hex of the answer before). Never the draft's address or its code | Logged by the server when the teacher adds or removes a plugin studio draft (`/api/sessions/:id/plugin-drafts`, 22 Nov 2026 onwards, #158). Server only |
| `plugin_request`, `plugin_grant` | plugin\_id (and for a request, turn\_id); from 22 Nov 2026 (#159) plugin\_id may be a studio draft's id (`d-…`), never its address | Logged by the server when the assistant asks for an Ask first plugin in a chat, and when the teacher allows it there (the envelope's thread). Server only |
| `reader_prompt_add`, `reader_prompt_edit`, `reader_prompt_remove`, `reader_prompt_reorder` | prompt\_id; for a reorder, prompt\_ids (every prompt in the new order) instead. Ids only (question 43): never a prompt's label, instruction or ticks. An add is either one of config `reader.default_prompts`, put in when the library is first used, or the teacher's own: the `reader_prompts` row's `source` says which. An edit that changes nothing, or a reorder that moves nothing, is not logged | Logged by the server when the teacher changes the reader's prompt library (`/api/sessions/:id/reader-prompts`, 23 Nov 2026 onwards, #177). The wording and ticks are in the `reader_prompts` table, on the server only (not in the export) until the workspace is deleted. Server only |
| `class_reader_settings` | class\_id; from #195 (question 81, Sam 23 Nov 2026), follow\_ups\_max and pupil\_budget\_gbp: the values in force after the change (config's default for a field the class has not set). Analysis: earlier events (23 Nov, #186) carry class\_id only, so for them the values are not in the log | Logged by the server when the teacher changes a class's pupil reader settings (follow-ups after an answer, a pupil's default budget) on the class page (`/api/sessions/:id/classes/:id/reader-settings`, 23 Nov 2026 onwards, #186), one per real change (none when nothing changed), and for the new class when "Copy to next year" carries settings across. The values are in the `classes` row (`reader_follow_ups_max`, `reader_pupil_budget_gbp`; null is config's default), not in the export. Server only |
| `class_reader_safety_set` | class\_id, is\_default (the class follows config's `reader.safety_instruction`), text\_hash (`sha256:` and the hex of the text in force after the change), text\_length (its characters). Never the text (question 88, Sam 23 Nov 2026: hash and length, never the text). Analysis: two events with the same text\_hash ran under the same text; the default's hash changes only when config's text does | Logged by the server when the teacher sets a class's own safety instruction for the pupil reader on the class page or goes back to the default (`/api/sessions/:id/classes/:id/reader-settings`, from #195), one per real change (none when nothing changed), and for the new class when "Copy to next year" carries the class's own version. The text is in the `classes` row (`reader_safety_instruction`; null is config's default), not in the export. Server only |
| `class_code_set` | class\_id, action (`make`, `renew` or `close`); from #209. Never the code, never a pupil. Server-only. |
| `class_pupil_remove` | class\_id; from #220, the teacher removed a pupil from the class. Never the member, the pupil or the `removed_pupils` id. Server-only. |
| `pupil_logins_made` | class\_id, count (1 to 40); from #223. Never a username, password or hash. Server-only. |
| `pupil_password_reset` | class\_id; from #246, the teacher made a new password for one pupil login (it unlocks the login and signs its pupil out). Never the login, a username, a password or a hash. Server-only. |
| `class_view_as_pupil` | class\_id; from #215, the teacher pressed "View as pupil" and opened /r as the class's test pupil. Never the test pupil or its member. Server-only. |
| `reading_set`, `reading_update`, `reading_remove` | reading\_id, class\_id, doc\_id; for a set or an update, prompt\_ids (the prompts it allows, in the library's order). From #195 (question 81, Sam 23 Nov 2026) a set or an update also carries follow\_ups\_max (the reading's own limit after it; null means it follows the class's, so read that from the class's latest `class_reader_settings`) and content\_hash (the frozen copy's, `sha256:...`: two readings with the same hash were set from the same text). Never the doc's name or the copy's text. Analysis: events from before #195 have neither field. Setting a doc that already has a reading in the class logs `reading_remove` for the old one, then `reading_set`. An update that changes nothing is not logged | Logged by the server when the teacher sets, changes or removes a class's reading (`/api/sessions/:id/classes/:classId/readings`, 23 Nov 2026 onwards, #187). The frozen copy, its hash and the limit are in the `readings` table, on the server only (not in the export) until the workspace is deleted. Server only |
| `chat_prompt` | turn\_id, text, anchor (block\_id, from, to, quote) when the teacher commented on a passage with `@model`; from 7 Nov 2026, `edit_mode`: `suggest` or `edit` (absent before: suggest); from 12 Nov 2026 in Suggesting turns, `suggest_view`: `inline` (Suggesting: new words in green, words taken out only on the card) or `track` (Track changes: both, in red) (absent before, and in Editing turns); from 8 Nov 2026 in agent mode, `plugins`: each plugin on offer as `{id, trust}`, and from 22 Nov 2026 a studio draft also has `draft: true` and `content_hash` (the studio's hash for the turn, null when the studio could not be read, so the draft was unavailable) | The prompt builder names the anchored block to the model, which answers with proposals on it |
| `chat_response` | turn\_id, text, operations (as presented, after injection), gateway\_call\_id |  |
| `proposal_shown` | turn\_id, block\_ids | Not logged for a turn in Editing mode (`edit_mode: edit`), whose changes go straight in as the assistant's revisions. From 12 Nov 2026, a doc the turn made (`doc_ids`) goes straight in in Suggesting mode too, and its blocks are not in `block_ids`. From 13 Nov 2026 the same holds for a doc that was blank when the turn was committed (every visible block empty text; no picture, table, divider or page break; no suggestion or suggested style waiting): its blocks are not in `block_ids` and a font or page colour for it is not in `style_doc_ids`, so a Suggesting turn into a blank doc logs `proposal_shown` with `block_ids: []`. The event names those docs in `blank_doc_ids` (added 13 Nov 2026; only blank docs the turn put something in; left out when none, and older events lack it); the turn's `block_revision`s (actor model, caused by its `chat_response`) show what went in, and no `proposal_accept` follows. In Editing mode the field is never set: the mode, not the blank doc, is why the changes went in |
| `proposal_accept` | block\_id, mode (click, accept\_all, edit\_then\_accept); from 7 Nov 2026 `part` when one change inside a suggested edit was decided on its own: index, ins, del, live\_after, suggested\_after | With `part`, the rest of the block's suggestion still waits; without it, the whole block was decided |
| `proposal_reject` | block\_id, mode; `part` as for accept |  |
| `block_revision` | block\_id, version, actor | Mirrors the revision table |
| `block_structure` | action (split, merge, insert, delete, move, version\_delete), block\_id, new\_block\_id or merged\_into or after | Teacher structural changes made through the synchronous block API; logged by the server |
| `asset_upload` | asset\_id, mime, bytes, filename | An image the teacher uploaded for an image block |
| `picture_choose` | turn\_id, block\_id, picture, position, replaced, asset\_id | The teacher picked another of the ARASAAC pictures offered for an image block (the assistant had put in `replaced`); logged by the server, followed by `proposal_accept` (edit\_then\_accept) when the block was still a suggestion |
| `participant_open` | first (bool), started\_clock (bool) | The participant link was opened (each page load); logged by the server. The first open in Task 1 starts the Task 1 clock |
| `brief_open`, `profile_open` | pupil name or null | Opening or expanding a profile in the class panel |
| `task_complete` | phase | Participant clicked complete |
| `facilitator` | action, note | Phase advance, replay selection, free-text note |
| `annotation` | block\_id, who (me, assistant, both, not\_sure), confidence, flagged |  |
| `sort` | card\_id, pile (like\_me\_usually, like\_me\_today, unsure, not\_like\_me\_today, never\_like\_me), task (best-card choice only) |  |
| `ownership` | section or version id, value (−50 to +50); or authorship\_text, authorship\_choice, control | One event per slider release or item change |
| `questionnaire` | item, value | One event per answer or change (study design B.3.1) |
| `version_create` | variant\_id, name, target\_pupils, copied\_from, created\_by |  |
| `anchor` | anchor (explanation, identification, answer\_key, differentiation, closing) | Facilitator opened an interview anchor |
| `model_self_correction` | injection\_id, turn\_id | A later model operation replaced a planted item with correct content |
| `withdrawal` | withdrawn (bool) | Set on the debrief screen |
| `error` | source, message | Provider or client errors |

**Part of the study data (Sam, 13 Nov 2026).** These are kept and exported as study data:
`curriculum_pick` and `curriculum_status` (a class's curriculum chosen, and moved between planned,
now and done, or taken off), `pedagogy_open` (the Pedagogy screen or one of its entries opened), the adaptations recorded in
`pupils_change.fields` (`adaptations` when a library adaptation is chosen for a pupil), the
`curriculum` of each class in `classes.json`, and `picture_choose` with the pictures the assistant found
stored on the turn. Their payloads are in `docs/classes.md` and the event types in `packages/shared`.

**Replay.** A session's canvas at any sequence number is reconstructed by applying block revisions up to that point. The console replays a window as an animation of the canvas with the chat beside it, at 1x to 8x speed, with injected blocks highlighted for the facilitator only.

**Derived measures computed by the export script, not stored**: dwell per block (sum of intervals where the block is visible and the canvas has focus); time from proposal shown to accept, with blocks accepted under 2 seconds of dwell flagged as unread; edit acceptance (accepted unchanged, edited before acceptance, rejected); authorship share per block, per section, per version and per worksheet; prompt counts by phase; whether the three dyslexia profiles received identical text (input to the generic-adaptation flag); and planted-item outcomes per version.

## 8. Annotation and relationship-sort screens

**Provenance annotation.** The final live worksheet is shown read-only, one block per row, in document order: the main worksheet first, then each version in creation order under its name. A copied block whose content is unchanged from its source is shown collapsed under its source and inherits the source's tag; the participant can expand it and tag it separately. Blocks that are new or edited in a version are tagged individually. Beside each block are three controls: a four-way choice (Me / The assistant / Both / Not sure), a 1 to 5 confidence slider labelled "How sure are you this block is right?", and a "Check before using" toggle. The screen cannot be submitted until every block has a choice. No block shows any provenance hint, highlight or timestamp. The order of blocks is the document order, not shuffled, because the measure is memory of the actual session.

Time per block and the order in which blocks were tagged are logged. Changes to a tag before submission are logged as separate `annotation` events so that second thoughts are visible.

**Relationship sort.** Nine cards (text from the study design, B.4) are shown in a randomised order. Five piles in a fixed order: "Like me usually", "Like me today", "Unsure", "Not like me today", "Never like me". After sorting, the participant is asked to pick the single card that best fits Task 1 and the single card that best fits Task 2; the same card may be chosen for both. Drags, drops and the two final choices are logged.

**Ownership rating** (adapted from Draxler et al., ACM TOCHI 2024). Immediately after the relationship sort: one row per worksheet section (explanations, identification items, answer key, write-your-own, derived from the `section` field of the live main blocks) and then the differentiation: one row per version if any exist, otherwise one row for the adaptation-section blocks of the main worksheet, otherwise one row labelled "Changes for the class" so that the measure is never skipped, each with an unlabelled slider whose ends read "Me" and "The assistant"; the position is stored as an integer from −50 to +50 and never shown to the participant. Below the rows: a free-text field "If this worksheet were shared with colleagues, who should be named as its author?", a forced choice (Me / The assistant / Both / Someone else), and a 1 to 7 control item. Every slider must be set before submission. Each slider release and each change to the authorship or control items is logged as an `ownership` event; the final values are exported alongside the log-derived authorship share for each section.

Both screens are deliberately plain: no progress bars, no encouragement text, no summary of the participant's own answers. The participant does not see anything about the assistant's contribution until the debrief screen.

## 9. Facilitator console

A separate authenticated route, used on the facilitator's own device. It shows one session at a time.

**Intake view.** Before the tool is shown, the facilitator records the three pre-task elicitation answers (study design B.2) in three text fields; these are stored with the intake record.

**Live view (during tasks).** Current phase and elapsed time against target; a mirror of the participant's canvas and chat, read-only, updated live; the injection plan with each entry's status (unfulfilled, planted, teacher-edited, challenged, model-corrected, passed through so far); a provider error count; a free-text note box whose entries are logged with timestamps. The facilitator can advance the phase, pause the session clock, and abandon the session.

**Interview view (after the questionnaire).** The final worksheet and the full chat, read-only, with four navigation buttons for the fixed anchors in the study design (B.3.2): explanation, identification items, answer key, and the differentiation in whatever form it took (the version tabs, or the main worksheet if none), with the class register opened beside it. A fifth button, Closing, shows the closing questions and then the whole-interaction questions (B.4) beside the participant's two best-fit cards and their ownership slider positions, which the facilitator needs for those questions and which are never shown to the participant. Each button scrolls both the facilitator's and the participant's screen to the anchor and logs the time. The questions for each anchor are shown beside it as a fixed script. This view shows no injection status, no provenance and no timings, so the facilitator asks the same questions regardless of what was planted. No moments are selected from the log; the log is used only in analysis.

**Replay player (research team only, post-session).** Canvas and chat side by side, animated from a start sequence to an end sequence, with speed control and pause, and injected blocks outlined. Used for coding and for checking derived measures, not during the interview.

**Debrief screen.** A participant-facing list of the planted items for this session with the correct reading beside each, generated from the injection log and the bank's `correct` field. A withdrawal toggle, which is logged and which marks the session bundle as withdrawn at export.

**Export.** One button produces the session bundle (section 10).

## 10. Configuration, reproducibility and export

**Configuration** is a single versioned file checked into the repository and hashed into every session bundle. It holds: provider and model version; temperature and other sampling settings; the system prompt; the Task 1 and Task 2 briefs; the class specification; the bank file reference; the injection plan rules (counts per series, constraints); phase time targets; replay selection thresholds; the card texts; the pre-task elicitation questions; and the questionnaire items. Changing any of these produces a new configuration hash, so sessions run under different settings can never be silently pooled.

**Seeding.** Each session has a seed derived from the session id. The seed determines the injection plan and the card order. Given the seed, the configuration and the recorded model responses, the whole session can be replayed deterministically.

**Session bundle** (a zip, one per session, named by pseudonymous participant code):

| File | Content |
| --- | --- |
| `session.json` | Session id, participant code, configuration hash, bank hash, seed, phase timings, withdrawal status; from 13 Nov 2026, `access`: `link` (reached by its participant link or access code) or `account` (a signed-in teacher's workspace). Older bundles have no `access` and read as `link` (`analysis/edw_analysis/bundle.py`); from 15 Nov 2026, `features`: the feature switches in force when it was exported (`classes`, `curriculum`, `pedagogy`, `preferences`, `spyglass`, `plugins`, and from 23 Nov 2026 `pupils`, each true or false). Older bundles have no `features` and read as all on but `pupils`, as every workspace was; a bundle without `pupils` reads it as off (`analysis/edw_analysis/bundle.py`) |
| `events.jsonl` | Every event in sequence order |
| `blocks.json` and `revisions.jsonl` | Final block table and full revision history |
| `text_events.jsonl` | One line per change to block text in the CoAuthor shape (`eventName`, `eventSource` user/model/system, `eventTimestamp` ms, `textDelta.ops`), plus `block_id`, `variant_id` and `block-<action>` structure lines; replaying a block's lines from empty gives its stored text. `MANIFEST.json` reports resyncs, unresolved causes and final mismatches. Lists split into items (`block_splits`, 7 Nov 2026): earlier events that named a list are written in `events.jsonl` against the items they touched, with `payload.split_from`, and the text events replay the items; `MANIFEST.json` has `list_items_stats` |
| `gateway_calls.jsonl` | Every model call: request, raw response, parsed operations, drops, latency |
| `injections.json` | Injection plan and records, with outcomes as far as the tool can determine them |
| `annotation.json` | Provenance tags, confidence, flags, with timing |
| `sort.json` | Card piles and best-fit choices |
| `ownership.json` | Section and version sliders, authorship text and choice, control, with timing |
| `questionnaire.json` | Post-task questionnaire responses with timing |
| `intake.json` | Pre-task elicitation answers entered on the console; the Teams intake form is joined by participant code at analysis |
| `versions.json` | Version table |
| `derived.json` | Dwell per block, authorship share, prompt counts, proposal timings, edit acceptance, planted-item outcomes per version |
| `worksheet_final.md` and `worksheet_final.pdf` | The final live worksheet as the participant saw it |
| `facilitator_notes.jsonl` | Timestamped notes and replay selections |

Audio from the interview is recorded outside the tool and stored under the same participant code.

**Analysis scripts** read bundles only. A small library (Python) loads a bundle, recomputes `derived.json` from raw events, and asserts that it matches the exported version; this catches drift between the tool's derivation and the analysis.

## 11. Security, ethics and data protection

- **No accounts for participants.** A session is opened by the facilitator and the participant joins via a one-time link that expires when the session ends.
- **Capture is confined to the tool window.** Keystroke logging is implemented as ProseMirror transaction logging inside the editor and a change listener on the chat input; there is no global key listener. The participant information sheet states that typing in the tool is recorded.
- **Pseudonymisation at export.** The bundle carries a participant code, never a name or email. The mapping from code to person is held separately by the lead researcher.
- **Provider data handling.** The provider is called with any available zero-retention or no-training option, and the chosen setting is recorded in configuration. No pupil data is involved; the class specification is fictional.
- **Withdrawal.** A session marked withdrawn exports a bundle containing only `session.json` with the withdrawal flag, so the analysis pipeline sees the session count without its content.
- **Secrets.** Provider keys live in environment variables on the server, never in the client or the bundle.
- **Retention.** Raw bundles are kept for the period stated in the ethics approval and then deleted; the pseudonymised derived data and transcripts are kept for publication.

## 12. Build plan, acceptance criteria and pilot checklist

**Build order** (each stage usable on its own before the next starts)

1. Event store, session API and the block data model with a minimal canvas. Acceptance: a session can be created, typed into, exported, and the canvas rebuilt from the bundle.
2. Chat and model gateway with block operations and proposals. Acceptance: a generation request produces proposals; accept and reject work per block and in bulk; every call is logged.
3. Injector with the bank and plan. Acceptance: unit tests pass; a session with a fixed seed plants the same items twice; history rewriting is verified by asking the model about a planted item and checking it answers as author.
4. Brief and class panel, versions, phases, final-check banner. Acceptance: a full participant flow runs end to end without the facilitator touching the participant's device.
5. Annotation and sort screens. Acceptance: every block must be tagged before submission; all interactions logged.
6. Facilitator console with live view, questionnaire, interview view, debrief and export; replay player for the research team. Acceptance: the four anchor buttons scroll both screens correctly and the interview view shows no provenance or injection status.
7. Export library and analysis assertions. Acceptance: `derived.json` recomputed from events matches the export for three test sessions.

**Pilot checklist** (three pilot sessions with colleagues before any participant)

- [ ] Phase timings are realistic; adjust targets if Task 1 regularly overruns.
- [ ] Plan fulfilment rate is at least 90 percent for C-series and D-series entries.
- [ ] Model self-correction rate of planted items is recorded; if above 30 percent, reduce temperature further or move injections to sections the differentiation request does not touch.
- [ ] At least one pilot includes a challenge to a planted item and one challenge to a control item, and the model's responses are reviewed.
- [ ] The questionnaire and the four-anchor interview run identically for two pilot participants with different worksheets.
- [ ] Dwell and authorship share figures are sanity-checked against the screen recording of one pilot.
- [ ] The debrief list is correct and complete for each pilot session.
- [ ] Bank, configuration and system prompt are frozen and their hashes recorded.

**Decisions (28 Oct 2026)**

- Provider: ELM proxy API with GPT-6-Sol as the base model.
- Task 2 takes the Task 1 worksheet as input and shows the class register. The teacher may adapt the single worksheet in place (universal design), create separate versions for particular pupils or needs, or both; the injector handles all three forms (sections 4 and 6).
- The final-check phase keeps the editable canvas, because the brief asks the teacher to make last changes.
- Where this document and the study design differ, the study design is authoritative.

## 13. Class register (content of the class panel)

The class panel shows the register below from the start of Task 2, rendered to resemble a SEEMiS Click+Go printout: a header block, then a single table with one ASN column naming the recorded need (blank where none) and the notes column wrapping. The panel is scrollable, read-only, and always visible beside the canvas during Task 2 and the final check. Expanding or scrolling to a pupil row is logged as a `profile_open` event with the pupil's name. The register is stored in configuration and hashed into the session bundle; the model receives it verbatim, as plain text in the same layout, as part of the Task 2 prompt.

The register is fictional. Names, Scottish Candidate Numbers and dates of birth do not correspond to any real pupil.

**SEEMiS Class Register: P7A**

|  |  |
| --- | --- |
| School | Braeside Primary School |
| Local authority | City of Edinburgh Council |
| Class | P7A |
| Class teacher | Mrs K. Munro |
| Session | 2026/27 |
| Term | Term 2 (Autumn) |
| Roll | 20 pupils |
| Printed | 21/10/2026 from SEEMiS Click+Go |

**1. Class list, attainment and additional support needs (ASN)**

| No. | Pupil name | SCN | Date of birth | Most recent grade (A to E) | ASN | Notes and key requirements |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Aiden Buchanan | 021935412 | 14/04/2015 | B |  |  |
| 2 | Amelia Fraser | 021935427 | 02/09/2015 | A |  |  |
| 3 | Callum Reid | 021935433 | 21/06/2015 | C | Dyslexia | Dyslexia. Needs amber reading overlay for all printed text. Prefers Comic Sans 14pt on handouts. Does not need extra time for reading in class, only in assessments. |
| 4 | Eilidh McPherson | 021935448 | 30/11/2015 | B |  |  |
| 5 | Finlay Sinclair | 021935454 | 08/01/2016 | D | Autism | Autism. Visual timetable on desk, 5 minute warning before transitions. Sits near the door. Ear defenders available in tray for assemblies and PE. |
| 6 | Freya Campbell | 021935469 | 19/03/2015 | A |  |  |
| 7 | Harris Munro | 021935475 | 27/07/2015 | C | ADHD | ADHD. Movement break every 20 to 25 minutes (classroom jobs work well). Wobble cushion. Chunk written tasks into 3 steps max. Medication at 12:15, office holds supply. |
| 8 | Isla Drummond | 021935480 | 11/05/2015 | B |  |  |
| 9 | Jack Lennox | 021935496 | 04/10/2015 | C |  |  |
| 10 | Kirsty Baird | 021935501 | 16/02/2016 | A |  |  |
| 11 | Lachlan Grant | 021935517 | 23/08/2015 | D | Dyslexia | Dyslexia. Massively supported by text to speech (TLDR extension on Chromebook, Immersive Reader in Teams). Typing instead of handwriting for extended writing. Spelling not penalised in content marking. |
| 12 | Lewis Hamilton | 021935522 | 09/12/2015 | B |  |  |
| 13 | Maisie Robertson | 021935538 | 01/04/2015 | C |  |  |
| 15 | Oliver Shaw | 021935559 | 13/09/2015 | E | Autism, ADHD | Autism and ADHD. Individual workstation available when overwhelmed. Now, next, then board. Key adult is Mrs Paterson (PSA). Staged intervention level 2, CSP under review with Educational Psychology. |
| 16 | Orla Kennedy | 021935564 | 07/07/2015 | A |  |  |
| 17 | Rhys Docherty | 021935570 | 18/01/2016 | C |  |  |
| 18 | Rosie MacLeod | 021935585 | 29/10/2015 | B | Dyslexia | Dyslexia (mild). Coloured line guide for reading. Reads instructions aloud 1:1 before independent tasks. No overlay needed. |
| 19 | Ruaridh Fleming | 021935591 | 03/03/2015 | D |  |  |
| 20 | Skye Anderson | 021935606 | 22/05/2015 | B |  |  |
| 21 | Sophie Wallace | 021935612 | 15/08/2015 | A |  |  |

Grade column shows the most recent class assessment grade (A to E) entered on the SEEMiS Assessment and Reporting module. The ASN column mirrors the Additional Support Needs tab on each pupil record and is blank where no need is recorded. Notes summarise the key classroom requirements only; full detail is held in the pupil support plan, IEP or CSP on SEEMiS. Pupils with no recorded need have an empty notes box.
