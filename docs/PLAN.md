# Build plan

**29 Oct 2026: the tool is now a worksheet editor for teachers (docs and chat threads).** The study layer (phases, briefs, register, task sidebar, injector and bank, versions, sections, question blocks, console live view, WebSockets) was removed and may come back once we know how it should behave. Its last state is the git tag `study-layer-2026-10-29`, which also holds the previous version of this plan with the study task list and model assignments. `study-design.md` and `dev-spec.md` describe that study and are kept for reference only; they no longer describe the code.

## 1. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Editor tool first (29 Oct 2026) | The product is an editor in which teachers write worksheets with an assistant. Everything that is not docs or chat is removed for now: no phases, briefs, register, task completion, injector, bank, versions, sections or question blocks; no console live view or WebSockets | Study lead: "we're creating a tool for teachers to edit worksheets primarily, and the task idea can come later" |
| Session → threads → docs → blocks | A session (one link) holds chat threads. Each thread owns its docs and its conversation; each doc is an ordered list of blocks. "Doc", never "version" | Study lead, 29 Oct 2026 |
| Threads see only their own docs | The model is sent the open thread's docs (the open one first, marked `; open`) and that thread's history and running summary only; its operations are validated against those docs only | Keeps the prompt small as a session grows. Study lead, 29 Oct 2026 |
| A new chat starts with a blank doc | Creating a thread creates one "Untitled" doc in it, in the same transaction. The thread is "Untitled" too until the teacher names it (pencil beside the chat title; logged as `thread_rename`); it is never named from the first message (Sam, 29 Oct 2026) | "The point of this editor is document editing rather than plain chat." Study lead, 29 Oct 2026 |
| Docs in the header | The open doc's name with a pencil to rename it; a docs icon opening a menu of every doc in the session grouped by chat; `+` ("Create new") makes a blank doc in the open chat. Opening a doc from another chat switches the chat to that thread. No deleting for now | Study lead, 29 Oct 2026 |
| The model and docs | Inserts go to the open doc unless they name another doc of the thread (`"doc": <id>`); `create_doc {temp_id, name}` makes a new doc in the thread, filled by inserts that name the temp id. These are ordinary entries in the operations JSON, not provider tool calls. A doc the model creates opens in the editor | One output format for every provider and the mock; the validator and the log stay as they are |
| Layout (29 Oct 2026, supersedes the task-sidebar layout) | [chats sidebar, collapsible] [chat] │ [document]: the thread list on the far left (open/close, New chat), the chat next to it, a 1px drag handle, and the document filling the rest; full window height with independent scrolling | Study lead: with the task sidebar gone, chat moves to the left with a sidebar for thread navigation, like Claude.ai |
| Admin | `/admin` (was `/console`): create a workspace link with a name, copy it, list workspaces, open them, download the bundle as a .zip. Since 13 Nov 2026 admins sign in with Google or Microsoft (an account with `is_admin`); `ADMIN_PASSWORD` (`CONSOLE_PASSWORD` still read) works locally, in tests and on the development site (a Vercel preview), never in production | Study lead: links to share with teachers for ease |
| Accounts (built 13 Nov 2026) | Teachers have accounts: they sign in with Google or Microsoft (OpenID Connect) by invite or an open tenant or domain, and each account has one workspace (`/w`). Link workspaces stay, with a typable access code. All "who is asking" logic stays in `server/src/auth.ts` (`requireAdmin`, `requireAccount`, `requireParticipant` setting `request.session`): an account resolves to its workspace's token, so the routes did not change | Study lead, 29 Oct 2026; built 13 Nov 2026 (#14) |
| Fresh schema | Migration `0004_editor.sql` drops every earlier table and creates the docs-and-threads schema; there is no data migration | Dev mode, nothing deployed to users. Study lead, 29 Oct 2026 |
| Provider | ELM proxy API, GPT-6-Sol, temperature 1, `max_completion_tokens`; `PROVIDER=mock` runs the app offline with canned replies (it fills an empty doc with a sample worksheet, answers "new document" with `create_doc`, and an `@model` comment with a `replace`) | GPT-6-Sol is a reasoning model: ELM rejects `max_tokens` and any temperature but 1 (both HTTP 400, checked 28 Oct 2026). Every call's output is in `gateway_calls` |
| Database | libSQL client: `DATABASE_URL` is a local `file:` path or a Turso `libsql://` URL with `DATABASE_AUTH_TOKEN` | A hosted SQLite; one client covers both |
| Canvas write path, local-first | The editor edits freely. New top-level blocks get a ULID in the browser. After each transaction the client diffs the doc's top-level blocks against the previous state and queues `insert`, `split`, `merge`, `delete`, `move` and `retype` commands to `/blocks/:command` in order, in the background; the server validates (client ids must be unused ULIDs) and logs them. Content edits and accept/reject are events. A refused command reloads the canvas and logs an `error` event. Switching docs lets the queue drain | Typing never waits on the network; the server owns validation and the single logged write path. 28 Oct 2026 |
| Editor engine | Tiptap 3 (StarterKit, task list, image, table, suggestion, drag handle, bubble menu; all MIT) with our own block attributes, markdown mapping, proposal chrome, slash menu and logging, modelled on steven-tey/novel (its upload-placeholder plugin and command list are copied with attribution); `novel` itself is not a dependency | 28 Oct 2026 |
| Streaming (29 Oct 2026) | Chat turns go to `POST .../chat/stream`, which answers in NDJSON: the model's raw reply in pieces as the provider streams it (`stream: true` on the ELM proxy; an HTTP error before any text, or a proxy that answers with plain JSON, falls back to an ordinary call), then the turn result. The chat shows pulsing dots until text arrives, the message as it is written, and "Writing in the document…" while the operations come in. Experiment, on by default and switched off with "Live edits" under the composer: the operations received so far, and the one being written, are applied to a copy of the canvas with the shared model and shown in the document, which is locked until the turn ends; the real suggestions (validated, saved and logged as before) then replace the preview. The preview is display only and is not logged | Sam: no feedback while the model works; asked to try streaming into the doc |
| Word upload (29 Oct 2026) | "Upload .docx" in the document header makes a new doc in the open chat from a Word file, as the teacher's own text (logged as `doc_create` with `imported_from`). Converted in the browser: mammoth (BSD-2) turns the docx into HTML (heading, Title, Subtitle and Quote styles; lists; tables; bold, italic, underline; line breaks; images, stored as assets) and the editor's schema reads the HTML, so blocks are exactly what the editor writes. mammoth drops list start numbers, so they are read from the docx numbering (Word continues a numId's count, and restarts at a startOverride). Empty paragraphs (answer space) are kept. Checked against the three samples in `fixtures/docx/`. Documents given to the model as context are a separate, later feature | Sam: teachers bring their existing worksheets |
| Suggestions | Model changes are proposals shown as normal text with ✓ and ✕ in the right margin; Accept all / Reject all act on the open doc only; typing into a suggestion accepts it (`edit_then_accept`) | 28 Oct 2026 (replaced 7 Nov) |
| Suggestions, as in Word | Shown as tracked changes, one card per change in the comments column with Accept and Reject; typing inside a suggestion keeps it waiting (Word's behaviour); the assistant has Suggesting and Editing modes under the chat box, teachers do not | 7 Nov 2026 (Sam) |
| Editing mode and earlier suggestions (7 Nov 2026) | In Editing mode a turn's own changes go straight in; a change to a block with an earlier turn's suggestion waiting stays a suggestion unless the teacher asked for it, which the model says with `revises_suggestion` on the replace, delete or move (an optional field in `chat_response` operations) | Sam: the teacher decides on every suggestion; a request about one part of a block must not take in a waiting change to another |
| A block per list item (7 Nov 2026) | Each list item is its own block, of a new type `bullet_item`, `numbered_item` or `checklist_item`; a run of them is drawn as one list. Existing lists, and their history, are migrated to the new types (section 6) | Sam: a request about one item must not touch another's suggestion; finer suggestions and edits |
| `@model` comments | Select text and press `@model` (toolbar or selection menu), or type `@` and choose @model for an inline prompt. A comment is a chat message anchored to a block and optional selection (`anchor` on `chat_prompt`); the anchored block must be in the open thread | Targeted updates without a second channel. 28 Oct 2026 |
| Keystroke telemetry | Per-transaction deltas over each block's markdown (CoAuthor's retain/insert/delete shape, code points) in `keystroke_batch.edits`, with `content_after` as a checkpoint; the export derives non-typing changes from revisions and writes `text_events.jsonl`. Every event carries the open `doc_id` and `thread_id` | Replayable by a short function in any language, comparable with the CoAuthor dataset. 29 Oct 2026 |
| Participant API | Never returns `origin`, `origin_turn`, the system prompt or the participant token of another session | Provenance stays server-side |
| Comments: "Send to model" (31 Oct 2026) | Each comment box has a "Send to model" checkbox, ticked to start with; a comment sent with it ticked is answered by the assistant, unticked it is just a comment. Typing "@" offers @model (as in the editor) and choosing it ticks the box | Sam asked for it: comments without asking the model each time, and no typing the whole @model |
| Comment actions (31 Oct 2026) | Each comment has a "…" menu instead of the bin: Edit and Delete on the teacher's own comments, Resolve (or Reopen) on a thread's first comment. The assistant's comments can't be edited or deleted (the server refuses with 403); deleting a teacher's thread still takes the assistant's replies with it. Resolved threads fold under "Resolved" in the column, lose their highlight, take no replies and are left out of what the model reads. Edits and resolves are logged (comment_edit with the body before, comment_resolve) | Sam asked for it: the assistant's answers are part of the record |
| Model picker (31 Oct 2026) | Under the chat box, as in Claude: the teacher picks the model and (for a reasoning model) Low, Medium or High thinking; remembered in the browser. The list is `provider.models` in the config (study configuration, hashed); the server refuses any other model (400 `unknown_model`). Sam's list (31 Oct): under "OpenAI", GPT-6 Luna, Sol and Astra (with reasoning); under "Open models", Qwen 3.5 and Mistral Small 4 (ELM refuses a reasoning effort for them, so none is sent). Llama 3.3 and EuroLLM are left off for now: ELM serves them without a tool-call parser (chat completions refuses tools; on /responses Llama writes the call as plain JSON text and EuroLLM pretends), so they could not edit the document. They can go on when ELM enables tool calling for them. Each turn logs its model and effort in `chat_prompt`, and its gateway calls record the model. Summaries still use the default model | Sam asked for it; probes in memory (31 Oct) |
| Open models out, and who judges (11 Nov 2026) | Mistral Small 4 and Qwen 3.5 leave the picker: Luna, Sol and Astra remain. Spyglass's judge is Luna for a Luna turn and Sol for every other | Mistral claimed edits it had not made and deleted the wrong question; Qwen thinks, hidden, and took up to 40 s a turn. Sol judged most consistently; Luna close at a twentieth of the price. Evidence and when to look again: `docs/model-decisions.md`, runs in `docs/eval-log.md` (Sam, 11 Nov) |
| "+" under the chat box (31 Oct 2026) | Adds files from the teacher's computer as context for the model (a curriculum PDF, a worksheet to adapt, slides): chat files, as planned in P.2, built now ahead of the project screens | Sam: the "+" is for context, not for opening a doc |
| Reference search without FTS5 (31 Oct 2026) | Pages narrowed with SQL `LIKE` per term, ranked in JS (`references/reader.ts`) | FTS5 works in local libSQL, but checking Turso means writing to the live DB, and a failed migration would stop the server; 20 files a project is small |
| Reference summaries as events (31 Oct 2026) | The upload's one-line summary call is logged as a `reference_summary` event (model, tokens, request, error), not a gateway call | `gateway_calls.thread_id` is NOT NULL and `GatewayCall` needs a thread and doc; a summary has neither, and rebuilding the table on Turso is not worth it. It doesn't count against the message limits |
| Reference pages (31 Oct 2026) | Text stored one row a page (`reference_pages`); PDFs keep their pages, other formats are cut at ~4k characters at paragraph breaks (`splitIntoPages` in shared) | Reading and search can cite a page for every format |
| Images in references (31 Oct 2026) | ELM's Responses API reads images (probed: a PNG's text read exactly), so images and scanned PDFs can come as page images with a `view_reference_page` tool | Not built yet; the first version refuses files with no text |
| Word files as documents (2 Nov 2026) | A Word file added as context is read with the Upload .docx importer: its text keeps headings, lists and tables, and its blocks are stored with it. The model's `open_reference_as_doc` copies it into the chat as a live doc named after the file, and the model suggests edits to the copy, instead of retyping the sheet from flat text (which lost the tables). The one tool that writes at once: the copy is the teacher's own content, not a suggestion. Offered only when a chat has such a file | Sam: a differentiated sheet came back with no tables |
| Doc and chat names (2 Nov 2026) | An "Untitled" doc takes its first heading's text as its name (`doc_rename` with `auto`). The wand next to a chat's title has the model name the chat, following `config/skills/naming-chats` (Shankar's five principles, adapted: topic and document first, one pattern, at most six words), logged as `chat_title`. An Untitled chat is also named on its own once it has had three prompts (`trigger: 'auto'` on `chat_title`); a name the teacher gives, even while the model is naming it, stays | Sam asked for both; the automatic name, 12 Nov 2026 |
| OpenDyslexic (11 Nov 2026) | OpenDyslexic is a document and text font, bundled with the app. It is not a Word font, so a Word download (one doc, or the workspace zip) whose docs use it first says the reader needs it installed (free from opendyslexic.org) and that Word otherwise shows a standard font; "Don't show this again" is kept in the browser. The model is not offered it: the teacher picks it | Sam asked for it |
| Project sidebar (2 Nov 2026) | In a project's chat the left sidebar shows the project: breadcrumbs (Projects › name), its chats with a pencil for a new one, and the Instructions and Context cards from the project page. "Projects" goes back to the main list | Sam asked for it |
| A stopped turn keeps an opened reference (4 Nov 2026) | When the model copies a teacher's file into the chat with `open_reference_as_doc`, the copy stays even if the turn is then stopped or fails | Sam: it is the teacher's own file, not a suggestion |
| Pilot (8 Nov 2026) | The study is in pilot: models, tools and prompts change as we go, and that is wanted. Nothing is deleted, and every turn records what it ran under, so earlier data can still be analysed and replayed | Sam, 8 Nov 2026 |
| Plugins and libraries (8 Nov 2026) | Teachers choose plugins on the Plugins screen (called Customise until 12 Nov), each Use freely, Ask first or Off for the workspace. The picture library is the first; curated libraries (folders of markdown on a library server, `library/`) the others, searched like a terminal (search, grep, list, read). Design in `docs/plugins.md` | Sam: a search across curated Scottish sources before the web, maintained apart from this app |
| Trust levels (8 Nov 2026) | Trust controls when the assistant may use a plugin, not how its text is framed. Ask first: the assistant asks, the teacher allows it in that chat (Allow above the message box) | Sam chose it over content labels |
| Libraries in this repo (8 Nov 2026) | `library/` is its own package and server; the app never imports it and reaches it over HTTP (`LIBRARY_URL`). It can move to its own repo later | A new repo could not be made from the session |
| Teachers make plugins (8 Nov 2026) | A project is the playground: it gains Tools and Tests tabs, and **Publish as plugin** takes a versioned snapshot of its skills, chosen files and tools, which then appears on Plugins. Tools are picked from a list with settings (lookup table, checklist, template, questions first), never code. Tests run with and without the plugin, with a separate testing budget the teacher can see. Plugin making and use are recorded for research. Plan: `docs/plugins.md`, steps T.1 to T.7 | Sam, 8 Nov 2026 |
| Interaction logging (10 Nov 2026) | Per workspace, off by default, switched in /admin for 2, 8 or 24 hours, 7 days or until turned off. While on, the client logs `pointer`, `click`, `viewport`, `ui_state`, `page_state` and `text_select` as ordinary events (`shared/src/events/interactions.ts`); while off the server drops them. `interaction_logging_set` records each switch | Sam: replay sessions without screen recordings, to study checking behaviour; not needed for every session. A DOM recording (rrweb, to the bucket) is a later step if this is not enough |
| Pupil data note (10 Nov 2026; shortened 11 Nov) | Under every chat box: "AI makes mistakes. Don’t enter personal data." | Sam |
| Longer turns (8 Nov 2026) | `maxDuration` 300 s, `agent.max_steps` 12, and after `agent.max_turn_ms` (200 s) the next model call has no tools so the turn ends with a reply | Sam: 6 steps and 60 s were too tight |

## 2. Repository structure

```
epistemic-differentiation-workshop/
├── docs/                      this plan, the handover, and the study's specs (reference only)
├── config/                    app.config.json (provider, history, thresholds) and system_prompt.md, hashed into every bundle
├── packages/
│   ├── shared/                types + zod schemas, ULIDs and hashes, the canvas model (docs, blocks, proposals), text deltas, bundle schema
│   ├── server/                Node + Fastify + libSQL: sessions, threads, docs and blocks, event store, gateway, assets, export
│   └── client/                Vite + React + Tiptap: the workspace (/s/:token) and /admin
├── analysis/                  Python: bundle loader from the study era (not yet updated for docs and threads)
└── fixtures/
```

Client routes: `/` the front page (Get started); `/start` the codes (invite code or access code) and sign-in; `/signin` and `/join/:code` sign in with Google or Microsoft; `/w` the signed-in teacher's workspace; `/s/:token` the workspace for that link; `/make/:token` the make kit; `/admin` the admin page (`/console` redirects there) and `/admin/replay`.

Server surface (all under `/api`):

- admin: `POST/GET /admin/sessions`, `GET /admin/sessions/:id/export[.json]`, `GET /admin/sessions/:id/assets/:assetId`
- participant: `GET /participant` (resolves the link token, records the open), `GET /sessions/:id`, `GET/POST /sessions/:id/threads`, `GET /sessions/:id/canvas`, `POST /sessions/:id/blocks/:command` (block commands plus `doc_create` and `doc_rename`), `GET/POST /sessions/:id/threads/:threadId/chat`, `POST /sessions/:id/events`, assets

## 3. Backlog

The whole backlog in one table, to choose the next work from: [backlog.md](backlog.md) (11 Nov 2026). The Spyglass plan: [spyglass.md](spyglass.md).

| Id | Task | State |
| --- | --- | --- |
| D.1 | Docs and threads model, migration 0004, thread-scoped gateway, admin links, layout with the chats sidebar | Done 29 Oct 2026 |
| D.2 | Try the loop by hand against ELM: new chat, worksheet, `@model` comment, "put a simpler one in a new document", rename, switch chats; check that ELM streams (`stream: true`) and decide whether "Live edits" stays (decided 3 Nov 2026: always on, the switch is gone) | Next |
| D.3 | Delete (or archive) docs and chats | When asked |
| D.7 | Download a doc as Word (.docx), next to Markdown and JSON in the Download menu | Done 29 Oct 2026: written in the browser with `docx` (MIT) from the editor's own reading of each block; round-trips through Upload .docx (tested on the three samples) |
| D.4 | Teacher accounts (OAuth Google/Microsoft or username and password) behind `auth.ts`; sessions owned by an account | Done 13 Nov 2026 for Google and Microsoft (#14, #23, #28 to #33; HANDOVER 4a15); no username and password |
| D.5 | Update `analysis/` for the new bundle (threads.json, docs.json, `docs/*.md`) | When the analysis is needed |
| D.6 | Study layer back (phases, injector, post-task screens), redesigned around docs and threads; start from the tag `study-layer-2026-10-29` | If and when the study needs it |
| P.0 | Projects data model (no UI): `projects` table, `threads.project_id` | Done 31 Oct 2026 (routes too, for P.2); see section 5 |
| P.1 | Reference uploads into a project, with limits; `read_reference` and `search_references` tools | Done 31 Oct 2026 for .docx, .txt, .md (server, tools, summaries, evals, client API); PDFs wait for pdf.js, images for `view_reference_page` |
| P.2 | Projects in the UI: switcher, project page (Chats, Files, Skills, Instructions), project instructions in the prompt | Done (project page, chat files with "+", PDF and PowerPoint text); images in references not yet |
| P.3 | Teachers write their own skills in a project | Not started; now step T.1 of the plugins plan |
| P.4, P.6 | Teachers test skills; admin budgets | Not started; now steps T.3 and T.4 of the plugins plan (tests cover whole plugins) |
| G | Plugins: trust levels per workspace, the Plugins screen, Ask first, library tools; longer turns | Done 8 Nov 2026 on branch `claude/jolly-ritchie-fn593b` (`docs/plugins.md`) |
| LIB | The library service (`library/`): Education Scotland experiences and outcomes (committed), TRAILS with its linked files (committed; Sam's team publishes it) | Done 8 Nov 2026; not deployed, no weekly refresh, no curation frontend |
| T | Teachers make, test and publish plugins (T.1 to T.7) | Planned 8 Nov 2026; next |
| L | A block per list item, with the data migrated (section 6) | L.1 to L.5 on `main`; the migration not yet run on Turso, the evals not yet run, L.6 not started |

## 4. Working agreements

- Tests land with every change; `scripts/ci.sh` (lint, typecheck, tests, build, live integration test) is green before a commit.
- A change to `config/` or `docs/` gets a note in the commit message and, if it is a decision, a row above.
- Secrets never leave environment variables; never print `.env`.
- Nothing produced by the tool is used with pupils without a teacher checking it.
- **Sizes are story points, not days** (Sam, 1 Nov 2026), on a Fibonacci scale and relative to work already done:
  - **1**: a small, well-understood change in one place (the Resolve tick, the green and red hover tints).
  - **2**: one feature in one layer, with its tests (comment edit and resolve on the server; the project description and its message to the model).
  - **3**: a feature across server and client (the model picker; P.0, the projects data model).
  - **5**: a feature with a migration, new routes, a client UI and its tests (the chat's "+" and chat files, with PDF and PowerPoint reading).
  - **8**: a multi-part feature (P.1, reference uploads: storage, limits, tools, summaries, evals, browser conversion).
  - **13** or more: too big to estimate well, so split it.

  For pace: on 31 Oct one working session got through about 30 points (P.0, P.1, the comment changes, the project message, the model picker, chat files, the build fix). Browser checks and Sam's feedback come on top.

## 5. Plan: projects, reference uploads, teacher skills and testing them, pupil work, budgets (scoped 30 Oct 2026; P.4 to P.6 added 1 Nov)

**8 Nov 2026:** P.3, P.4 and P.6 now go ahead as steps of the plugins plan (`docs/plugins.md`, T.1 to T.4): a project is the playground where a plugin is made and tested. The detail below still holds.

Agreed with Sam on 30 Oct 2026. A **project** is whatever the teacher wants it to be (a class, a course, a topic): a titled collection of the files they upload and the skills they write, with the chats that use them. Order: P.0 → P.1 → P.2 → P.3 → P.6 → P.4, each in its own commits with tests and evals, as usual. P.5 (pupil work) is backlog (Sam, 1 Nov): for the first sessions teachers are told not to upload pupils' work, and that can be trusted.

### P.0 Projects data model (3 points) — done 31 Oct 2026

Built as below, plus participant routes (`server/src/projects/routes.ts`: list, create, rename, archive) and `project_id` on `POST .../threads`, so P.2 only needs the client. Archiving twice logs once; a chat can't be started in an archived project (409).


- Migration `0009_projects.sql`: `projects (id, session_id, name, instructions TEXT NULL, created_at, archived_at NULL)`; `threads.project_id` nullable.
- **Decision:** a chat need not be in a project. A chat with no project works exactly as now, which keeps existing workspaces unchanged and adds no structure a teacher didn't ask for. A new chat started from inside a project belongs to it.
- `ProjectService` (`server/src/projects/`): create, rename, archive, list; logged as `project_create`, `project_rename` and `project_archive` events. Projects belong to the workspace now and move to a teacher account later (keep this behind `auth.ts`, as for sessions).
- Export: `projects.json`, and `project_id` on each thread.

### P.1 Reference uploads (8 points) — mostly done 31 Oct 2026; images left (5 points, in P.2)

Built: `server/src/references/` (service, reader, routes, summary), migration 0010, the two tools in `gateway/tools/`, the catalogue message (`referenceCatalogue` in `agent.ts`), the system prompt section, `references.jsonl` in the bundle, three evals (9/9), and the client's `addReference` with `import/reference.ts`. Differences from the plan below are in the decisions table (pages table, search without FTS5, summaries as events). Not built yet:

- **PDFs:** need `pdfjs-dist` in the client. It couldn't be installed from the sandbox (pnpm wanted to relink the whole shared `node_modules` from Linux). On the Mac: `pnpm add pdfjs-dist --filter @edw/client`, then add a PDF branch to `convertReference` (one page per PDF page, loaded with a dynamic import). The server already takes `application/pdf`.
- **Images and scanned PDFs:** ELM reads images (decision row), so: store page images, count them against `images_per_project`, add `view_reference_page`.
- No UI: that is P.2 (the Context card). PowerPoint, PDF and image handling moved to P.2 (rescoped 31 Oct).


These are different from "Upload .docx", which makes an editable doc. A **reference** is a read-only file in a project that the model can consult.

- **Formats in the first version:** `.docx` (mammoth, in the browser already), `.txt` / `.md`, and PDFs with a text layer (pdf.js, loaded only when needed), all converted to text with `[page N]` markers. Images and scanned PDFs: first check whether ELM's Responses API accepts image input. If it does, store page images and add `view_reference_page`; if not, refuse them with a clear message.
- **Path:** the browser converts the file. The original goes straight to R2 through a signed PUT (reuse `server/src/assets/bucket.ts`; Vercel takes at most 4.5 MB a request). The server stores the extracted text and metadata in `references (id, project_id, name, mime, bytes, storage_key, text, pages, est_tokens, summary NULL, status, created_at, deleted_at)`. Deletes are soft, kept for the record.
- **Limits** (config `references`; a refusal message for each):

  | Limit | First value |
  | --- | --- |
  | Files per project | 20 |
  | Size per file (original) | 20 MB |
  | Extracted text per file | 200k tokens (estimated as characters / 4) |
  | Extracted text per project | 1M tokens |
  | Images (pages or pictures) per project | 50 |
  | Storage per workspace (originals, all projects) | 100 MB (Sam: 500 MB was far too much) |

- **For the model:** a catalogue of the project's files (id, name, pages, estimated size, a one-line summary) as a message after the system prompt, before the history; it changes only on upload, so it stays cached. Tools (one file each in `gateway/tools/`, switched on when the chat's project has files):
  - `read_reference(file_id, from_page)`, paged and capped by `agent.max_read_chars` like `read_document`;
  - `search_references(query, file_ids?)`, a keyword search returning the file, page and a snippet. Check whether Turso supports SQLite's FTS5; if not, scan the chunks in memory, which is fine for 20 files.

  No embedding index (the deep-research report: catalogue plus search plus read beats retrieval augmentation at this scale). Uploaded text is untrusted data: the system prompt must say that instructions inside references are not the teacher's.
- **Summary card (optional, recommended):** one small model call at upload writes the one-line summary, logged as a gateway call with `purpose: "reference_summary"`. It doesn't count against the message limits.
- **Logging and export:** `reference_upload` and `reference_delete` events; reads and searches are already in the gateway calls. The bundle gets `references.jsonl` (metadata and extracted text); the originals stay on R2.
- **Evals:** answering from a reference (with the page cited); search finding a passage in a long file; refusing to follow an instruction planted in a reference; a file over the limits refused.

### P.2 Projects in the UI, and the other file types (about 9 points left) — rescoped with Sam 31 Oct 2026

Sam's brief (31 Oct): Projects in the sidebar, with New project. The new-project form asks "What are you working on?" (the name; placeholder "Name your project") and "What are you trying to achieve?" (placeholder "Describe your project, goals, subject, etc..."), with an "Add context" button for any file we can read: Word, PowerPoint, PDF, images. Inside a project the teacher can write instructions, write and add skills (P.3), and add more context.

**Layout** (as Claude's and ChatGPT's projects do it, rather than tabs):
- **Sidebar:** a "Projects" section above the chats, listing the projects with "New project". Chats in a project are listed on its page, not in the main list (the main list keeps chats with no project).
- **New project:** a form in the main area with the two questions and "Add context". Create makes the project, uploads the files, and opens the project page.
- **Project page:** the name and description at the top (both editable), a "Start a chat in this project" box and the project's chats in the main column, and a side column with three cards: **Instructions** (a text box, saved on blur), **Context** (the files: add, list with size and status, delete, and how much of the limits is used) and **Skills** (P.3; hidden until then). Archive is in a "…" menu.

**What the model gets.** One "project" message after the system prompt and before the file catalogue: the project's name, the description ("What the teacher is trying to achieve") and the instructions. Its own message rather than added to the system prompt, so the system prompt and its hash stay the same for every teacher, the cache still holds, and the system prompt can say that project instructions come below its own rules. The answer to Sam's "an appendage to the system prompt?" is: yes, in effect, placed straight after it. Logged with the full text: `project_update {project_id, description?, instructions?}`. Migration: `projects.description`.

**File types.** All converted in the browser, as now, into pages of text; pictures are kept as page images that the model can look at. This matches the other systems: Claude's projects pull text out of PDFs and Office files, and read images and image-only PDF pages visually. Pi has no Office or PDF handling (it's a coding agent), but two of its patterns are worth copying: its read tool pages through long files with a "continue from…" note, which `read_reference` already does, and images are resized before sending (longest side at most 2000 px, re-encoded as JPEG quality 80 if still too big).

| Type | How it is read | Pages |
| --- | --- | --- |
| Word (.docx) | text with mammoth (done) | about every 4,000 characters |
| PowerPoint (.pptx) | each slide's text and speaker notes, from the slide XML with JSZip (already a dependency) | one per slide (`[slide N]`) |
| PDF | the text layer with pdf.js, loaded only when needed | one per PDF page |
| PDF page with no text layer (scanned) | the page drawn as an image (pdf.js on a canvas) | that page, as an image |
| Image (.png, .jpg, .webp, .gif) | resized as Pi does | one page, an image |
| .txt, .md | as they are (done) | about every 4,000 characters |

- **Images and image pages:** stored in the bucket next to the original (`ref_<id>_p<N>`). They count against `images_per_project` (50) and the workspace storage limit. At upload, the summary call (already made for every file) also gets the images, at most the first 4, and writes a short transcription or description for each. That text becomes the page's text, so search and the catalogue work for pictures too. Those calls are logged like the summary.
- **New tool `view_reference_page(file_id, page)`:** returns the page image (and its text) for the model to look at. ELM takes `input_image` in the input. Whether it takes images inside a tool output is not yet checked: probe it first, and if not, add the image as a user-role message straight after the tool output. Images are not carried into later turns' history (only the tool's text note is), so the cost does not keep growing.
- **Small projects, everything in context:** when a project's files come to at most 8k tokens altogether (config `references.inline_tokens`), their text goes in the catalogue message in full, as Claude's projects do with small knowledge bases. Above that, the catalogue, search and read work as now. The message changes only on upload, so it stays cached.
- Images inside Word and PowerPoint files are left out for now (the text is kept); the PowerPoint slide-image route can come later if teachers' slides are mostly pictures.

**"+" in the chat composer (Sam, 31 Oct) — built 31 Oct, with PDF and PowerPoint text.** "Add from project" waits for the project screens; images and scanned pages wait for step (4). Built as below, except that the chip is a tile like Claude's (name, type badge, a round cross on hover), and "Open as a document" is not offered yet. A "+" button left of the message box, with a small menu: "Add a file" (any type above) and, in a project, "Add from project" (pick from its Context). As in Claude and ChatGPT:
- A file added in a chat becomes a reference file **of that chat**: `reference_files` gains a nullable `thread_id`, and a file has a project or a chat, not both. Migration, plus the same limits (counted against the project if the chat is in one, otherwise against the workspace).
- It shows as a chip above the message box while the message is written (with a cross to remove it) and as a chip on the sent message. The model sees the chat's files in the catalogue with the project's, with the same tools; "the teacher attached X to this message" is said in the user message.
- An image attached to a message also goes to the model in that turn as an image (it is small and clearly meant to be looked at); later turns use `view_reference_page`.
- "Upload .docx" in the doc header stays as it is (it makes an editable doc). For a Word file added with "+", the chip's menu offers "Open as a document" as well.
- Logged as `reference_upload` with `thread_id`; the message's `chat_prompt` event lists the attachment ids.

**Order of work** (points): (1) `projects.description` and `project_update`, and the project message to the model (2, done 31 Oct); (2) sidebar, New project and the project page with Instructions and Context for the types done now (8, done 1 Nov: `client/src/screens/ProjectScreens.tsx`; opening a page logs `project_open`; an archived project's chats go back to the chats list); (3) PowerPoint and PDF text (2, done 31 Oct: `client/src/import/pdf.ts`, `pptx.ts`); (4) images, scanned pages, `view_reference_page` and the probe (5); (5) the chat's "+" and chat files (5, done 31 Oct, ahead of (2)), and "Add from project" (2); (6) inline small projects (2). Evals for the project message (instructions followed; description used) and for an image reference.

- What the model sees in a chat: its own docs, plus its project's description, instructions, files and skills. Not other chats' docs (a later option).

### P.3 Teachers' own skills (5 points)

- `project_skills (id, project_id, name, description, body, version, created_at, deleted_at)`. Each edit adds a version, so the record shows which version the assistant read.
- **Form:** name, "Use this when…" (the description) and instructions (a text box); later, attach project files as the skill's reference files. The same rules as config skills (`shared/src/skills.ts`: name format, description up to 1024 characters), instructions up to about 5k tokens, and at most 20 skills per project.
- **For the model:** config skills stay in the system prompt. Project skills go in their own `<available_skills>` message after it, which only changes when a skill is edited. `read_skill` finds both kinds, and a project skill can't take a config skill's name. The system prompt says teacher skills come below its own rules (they can't, for example, make edits apply without a suggestion).
- **Logging and export:** `skill_create`, `skill_update` and `skill_delete` events with the full text; `skills.jsonl` in the bundle. A skill read already appears in the gateway call's tool calls; add the version to the tool output.
- **Evals:** a teacher skill read when a request matches and followed; not read otherwise; a name clash with a config skill refused.
- **Later:** a "draft this skill with the assistant" button; export or import as `SKILL.md` folders.


### P.4 Teachers test their own skills (about 19 points, after P.3) — added 1 Nov 2026

Sam (1 Nov): teachers will write skills (homework marking, differentiating a resource, lesson planning) and, later, install other people's. They need to know whether a skill does better than the assistant without it. So: a short guide, and simple tooling to test a skill systematically. Based on the research in `docs/research/evaluating-skills-2026-11.md`, where the method is the same everywhere (Anthropic's skill-creator and `claude plugin eval`, OpenAI's skill evals, Superpowers, Pi). Run realistic requests several times **with and without** the skill. Check first whether the skill was used at all, then grade with simple checks and a short judge. Compare, and keep an eye on time and cost. Our developer suite (`packages/evals`) already works this way; this puts a teacher-sized version in the app.

**What the teacher does (the guide, in the app and as a page):**
1. **Start from what goes wrong.** Try a few real requests without the skill and note what the assistant gets wrong. If it already does them well, the skill isn't needed.
2. **Write at least three examples** where it goes wrong, and one or two where the skill should not be used ("tidy the spelling" should not trigger a marking skill).
3. **Say what good looks like:** a few plain criteria, each pass or fail ("gives a mark out of 10", "names one thing to improve", "reading age of about 9").
4. **Run the test, then read the answers, not only the scores.**
5. **Change the skill and run it again.** Run it again when the model changes as well: a skill the assistant no longer needs can be deleted.

**Test cases** ("examples", on the skill's page): a request as the teacher would type it, optionally with a document to work on (a copy of one of theirs, or a worksheet; pupils' work waits for P.5), and whether the skill should be used. Each example has its checks:
- **Simple checks, no model needed:** the reply or document contains, or doesn't contain, some text; edits are made, or none; length within a range; a reading-age band (a readability formula, for differentiation).
- **Criteria in plain English,** each judged pass/fail by the model with a short rubric (binary, as Husain and Anthropic advise; Likert scales are avoided).
- **Used the skill:** whether `read_skill` was called for it. This is checked on its own: the research's most common finding is a skill that is never picked (Vercel: not used in 56% of cases). When it isn't picked, the fix is the "Use this when…" line, and the report says so.

**Running.** Each example runs 3 times with the skill and 3 times without. The "without" side is the same project, instructions and files, minus the skill. When a teacher is improving a skill, the "without" side can instead be the previous version (skills keep versions, P.3). Runs are dry: the agent loop works on a copy of the document and nothing is applied or added to the chat; a run is a normal agent turn with no commit. Each run is its own request, driven from the browser one after another, so none goes near Vercel's 300 s limit. Runs use the model picked under the chat box, and the report names it. They count against a separate test budget, not the chat's budget, so a test can't use up a teacher's chat. The budget is set per workspace by an admin (P.6); the config gives the default (for example 60 runs a day, about three tests of three examples).

**Report** (plain words first, numbers underneath):
- A verdict per skill: "Helps", "No clear difference" or "Makes it worse", from the difference in pass rate between the two sides across the examples. With 3 runs a side it says "a small test" and suggests more examples rather than claiming significance.
- Per example: passes with and without, which checks failed, how often the skill was used, and a warning when the runs disagree a lot (as Superpowers puts it, "variance is a metric": unclear wording).
- Time and size (tokens) with and without, so a skill that doubles the cost for no gain shows up.
- Every answer can be opened, side by side. A **blind comparison** shows two answers to the same example as A and B, and the teacher picks the better or "about the same". The teacher is the expert. Their picks also check the model judge: when they often disagree with it, the report says the criteria need rewording (Husain's judge validation, in small).

**Installed skills and files.** The same test works for a skill installed from someone else (when sharing exists), for the built-in skills (the teacher's own examples, with the built-in skill on and off), and for a project's files ("with the curriculum file" against "without").

**Data and logging.** Tables `skill_tests` (the examples and their checks, versioned like skills) and `skill_test_runs` (side, skill version, model and effort, the reply and edits, whether the skill was read, check and judge results, tokens, time). Events `skill_test_create`, `skill_test_update`, `skill_test_run` and `skill_test_verdict` (the blind picks). The bundle gets `skill_tests.jsonl` and `skill_test_runs.jsonl`. For the study this is research data in its own right: how teachers judge AI output, and what they count as "better".

**Our own evals.** The developer suite keeps checking the platform. A teacher-skill case runs there too: the harness can load a teacher skill and its examples, so we can check that the in-app test agrees with the developer harness on a few skills we write ourselves. Our built-in skills (dyslexia-friendly and the ones to come) each get with-and-without cases in `packages/evals`, so we hold ourselves to the same rule.

**Order of work** (points): (1) examples and simple checks, dry runs and the with/without report (8); (2) the "used the skill" check and its advice (1); (3) criteria judged by the model (3); (4) blind comparison and judge agreement (5); (5) the guide (2). Examples that hold pupils' work wait for P.5. Evals: a skill that helps is reported as helping, one that changes nothing as no clear difference, and a skill that is never picked is flagged as such.

**Not now:** automatic suggestions for better wording (skill-creator's description optimiser), pressure tests for "discipline" skills, held-out examples, and running tests automatically on every model change. These can come once teachers use the basic version.

### P.5 Pupil work: permission, and nothing kept (about 8 points) — backlog, added 1 Nov 2026

**Backlog (Sam, 1 Nov).** Not needed yet: for the first sessions teachers are told not to upload pupils' work, and that can be trusted. Build this before pupils' work is allowed. Until then P.4's examples use teachers' own documents only.

The design: teachers may upload pupils' work (an essay to mark, answers to give feedback on). They must say they have permission, and for these files data retention is turned off. It would cover the chat's "+", a project's Context and P.4's examples.

- **The question at upload.** Every file added (with "+", to a project's Context, or to a test example) asks: "Does this contain pupils' work or anything that identifies a pupil?" The answer is No or Yes. Yes needs a tick before the file goes up: "I have permission to use this work here (my school's policy or consent), and I have removed names where I can." Without the tick the file isn't added. The answer is logged (`reference_consent {reference_id, pupil_work, confirmed_at}`), and the file carries `pupil_work = true`.
- **Nothing kept, for a pupil-work file:**
  - *Original:* never stored. Only the extracted text is kept, and nothing goes to the bucket.
  - *The text:* deleted for good (not just marked deleted, the one exception to our soft deletes) when the teacher removes the file, when its chat or project is deleted, and in any case after a set time (config `pupil_work.keep_days`, for example 30). A daily sweep does the deleting; on Vercel that's a cron route.
  - *Our logs:* where the gateway log would store the file's text (tool outputs, the request sent), it stores `[pupil work: <file name>, <hash>]` instead, written that way at the time, so nothing has to be cleaned up later. The study record keeps that a pupil-work file was used, its size and its hash, but not its text.
  - *Export:* the bundle and the teacher's download leave out its text, with a line saying why.
  - *The provider:* pupil-work files go only to models marked `zero_retention` in the config list (ELM's own setting; to confirm with ELM which of the listed models it covers). While a chat has pupil work, the picker shows the other models as unavailable, with the reason.
- **What it can't cover**, said plainly in the dialog: the assistant's replies and the teacher's documents can quote the work. They are the teacher's content and are kept like any chat, so the teacher should delete the chat when done if it quotes pupils.
- **Before it ships:** the wording, the keep time and the zero-retention list are checked with the university's ethics and data-protection contacts (the school is the data controller for its pupils' work). A short page explains what happens to the file.
- Order (points): the question, the flag and the log (2); text only, permanent deletion and the sweep (3); placeholders in the logs and the export (2); zero-retention models only (1).

### P.6 Admin: workspace budgets (about 8 points) — added 1 Nov 2026

Sam (1 Nov): budgets are for an admin to control. For each workspace, an admin can see what it has used and change its limits or give it more. Since 13 Nov 2026 (#41) the chat's limit is a budget in pounds per workspace (`limits.budget_gbp` £60, overrun up to `budget_overrun_gbp` £5 within a turn), with 100 messages an hour kept; the total of 300 messages is gone. Each gateway call stores its cost (`cost_gbp`), and `spendGbp` sums a workspace's.

- **Limits per workspace.** The config keeps the defaults (the budget in pounds, messages per hour, skill test runs a day, files and storage). A `workspace_limits` table holds a workspace's own values where an admin has set them; the gateway and the upload checks read the workspace's value first, then the default. A change is logged with the old and new values (`limits_update`, from the admin), so the study record shows when a workspace had more.
- **The admin page shows each workspace's use against its limits:** spend in pounds against its budget (`spendGbp`, from the stored cost of each call), messages this hour, test runs today, storage and files. A workspace at 80% or more of any limit is marked in the list.
- **Controls:** set any limit, or add to the budget (a top-up in pounds); reset to the defaults.
- **The teacher's side:** near the budget the chat says so; at it the chat says to contact the study team, as it does now (`BUDGET_MESSAGE`).
- Order (points): the table, the lookups and the log (3); usage and cost on the admin page (3); controls and the teacher's warning (2).

## 6. Plan: a block per list item (about 32 points) — added 7 Nov 2026

**Why (Sam, 7 Nov).** A list is one block, so a request about one item touches the whole list. In
Editing mode a request about guided practice rewrote the lesson-sequence list and, before the fix
of 7 Nov, took in a waiting "remove the exit ticket" change on another item. With the fix it is left
waiting, but the doc can show items twice until the teacher decides. Notion, Word and Google Docs
all make each list item its own unit.

**The shape.** Each list item is its own block, of a new type: `bullet_item`, `numbered_item` or
`checklist_item` (content `- text`, `1. text`, `- [ ] text`). The editor keeps its rule that each
top-level node is a block, so ids, tracked changes, comments, drag and logging work for an item as
they do for a paragraph. A run of item blocks of one kind is drawn as one list, numbered across the
run. `bullet_list`, `numbered_list` and `checklist` are no longer written; the bundle schema still
reads them, for exports made before the migration. Paragraphs, headings, quotes, code, tables and
pictures stay one block each; there are no nested lists, as now.

**Pieces, in order** (points):

- **L.1 Editor (8).** The item node and its markdown; Enter makes the next item, Backspace on an
  empty item makes it a paragraph, `- `, `1. ` and `[] ` start a list; the toolbar's list buttons
  and the slash menu work across a selection of blocks; numbering across a run (and a list that
  carries on after a heading keeps its first number); the teacher's typing logs as before.
- **L.2 Server and model (5).** A multi-line list in the model's insert or replace is split into
  item blocks on the server (one insert per item; a replace of an item with several lines replaces
  it and inserts the rest), so the system prompt changes little. A rewrite that spans a run of
  items is matched item by item: unchanged items keep their block, id and any waiting suggestion,
  changed ones get a suggestion, new ones are inserted and missing ones suggested for deletion. The
  model sees each item with its id; the markdown export joins a run into one list.
- **L.3 Word, paste and download (3).** A Word list imports as item blocks and exports as a Word
  list; a pasted list is split into items.
- **L.4 Migrating the data (8).** Existing lists, and what happened to them, are moved to the new
  types, so the history reads as item edits and the export is in the new format throughout:
  - *Blocks:* each list block becomes one item block per item, with `derived_from` set to the list
    block, in its place in the doc. The list block is marked deleted, not removed.
  - *History:* each list block's versions are replayed and its items matched from one version to
    the next (L.2's matching), so each list revision becomes revisions of the items it changed
    (an item edited, added or removed), with the original actor, cause event and time.
  - *Suggestions:* a waiting suggestion on a list becomes suggestions on the items it changes.
  - *Events and the export:* the event log is not rewritten (it is the record, and append-only).
    A table `block_splits` (migration) maps each list block and version to its item blocks and
    their lines, and the export uses it to write every earlier event that names a list (keystroke
    batches, text events, proposals shown, accepted and rejected, comments on the list) against
    the item it touched; an event that touched several items is split into one per item.
    MANIFEST.json says which lines were translated, and the export test checks that replaying the
    translated text events gives each item's stored text.
  - *Running it:* a script under `scripts/`, dry run first, which reports what it would change;
    every workspace exported to `../edw-data` before it runs on Turso, and Sam confirms before that.
- **L.5 Evals (3).** The fixture helpers write item blocks; cases for editing one item, rewriting a
  list, and a request about one item in Editing mode with another item's suggestion waiting; a run
  against the real model (about $0.60) and a new baseline once Sam has read it.
- **L.6 Several blocks at once (3).** Shift-click to select a run of blocks and drag them as one;
  cut and paste across blocks as in Word (to try in a browser).

L.1 and L.2 go together on a branch; nothing goes to `main` until L.1 to L.4 are done, so that
Word, existing docs and the export agree. L.5 runs before merging; L.6 can follow.

**For analysis:** from the migration, counts per block (revisions, suggestions, decisions) are per
item. The migrated history is reconstructed by matching items between versions, so where an item
was rewritten past recognition it shows as one removed and one added; the dry run reports how often.

