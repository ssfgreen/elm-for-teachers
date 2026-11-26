# Handover (first written 30 Oct 2026; brought up to date 21 Nov 2026)

Read this first in a new session. `ARCHITECTURE.md` maps the system, `docs/client-state.md` says who owns which piece of the client's state, `CLAUDE.md` holds the working rules, and `docs/architecture-audit-2026-11.md` the refactoring plan (4 Nov 2026). The decisions table and backlog are in `docs/PLAN.md` (partly out of date: everything below is newer). Commits are small and their messages explain the why: `git log --oneline | head -40` is the fastest catch-up. Since 13 Nov 2026 work is planned by an orchestrator session and built by workers, one pull request into `development` each (`docs/workflow.md`); each worker writes a note in `docs/changes/`, and the health pass folds those notes in here (the notes up to #109 are in 4a15 to 4a24) and records the trend in `docs/architecture-health.md`.

## 1. What the tool is

A worksheet editor for teachers. A **workspace** (one link, `/s/<token>`) holds **chat threads**. Each thread owns its **docs**, and each doc is an ordered list of **blocks**. The assistant works through the thread's chat (or @model comments) and only ever **suggests**: its changes are proposals the teacher accepts or rejects (✓ / ✕). Everything the teacher does is logged as events for research: keystrokes, prompts, proposal decisions, comments and stops. `/admin` creates links, lists workspaces, deletes them and exports a zip.

Monorepo (pnpm): `packages/shared` (zod schemas, the canvas model, config loader), `packages/server` (Fastify, libSQL/Turso), `packages/client` (React, Tiptap), `packages/evals` (live evals against ELM). It is deployed on **Vercel from `main`**: one project at the repo root, preset Other, `"framework": null` in vercel.json, and the function is `api/index.mjs` with a 300 s maxDuration (60 s until 8 Nov 2026). See `DEPLOY.md`.

## 2. Working rules Sam set (also in memory)

- **Commit as you go**: small commits on your own branch, then a pull request into `development`; only the orchestrator merges into `development`, and **Sam pushes `main`** (a push deploys). Details in `CLAUDE.md` and `docs/workflow.md`.
- **Decide from the specs**; don't ask about details you can settle yourself. Report what you chose.
- Get all suites green before each commit (see 4). Never print `.env` or the API keys. Never send the user's email anywhere. Confirm before anything destructive against Turso.
- Write plain, short, British English. Sam reads the final summary, not the tool output.

## 3. The assistant (server/src/gateway/)

- `config/app.config.json` sets `"mode": "agent"`. A turn is a loop of up to `agent.max_steps` (12) calls through the ELM **Responses API**. ELM refuses tools on chat completions while the model reasons; see the memory note on ELM capabilities. `"single"` mode (one call, with the edits in a fenced JSON block) still works as the fallback or control.
- The loop is in `agent.ts`; `service.ts` checks and prepares the turn, and the rest is one file each beside it: `commit.ts` (the turn transaction), `limits.ts`, `stop.ts`, `history-plan.ts` (history and running summary), `agent-turn.ts` and `single-turn.ts`; the provider is `elm.ts` (stateless `store:false`, with encrypted reasoning passed back).
- **Tools** live in `tools/`, one file each, listed in `tools/index.ts` and switched on by `agent.tools`: `read_document` (pages via `from_block`), `edit_document` (block operations: insert, replace, delete, move, create_doc, set_style), `add_comment`, `reply_to_comment`, `search_pictures` (4d) and the library tools (4a4). `read_skill` is added automatically when `agent.skills` is non-empty. Tools never write to the database. They return operations or comment drafts, which `commit.ts` applies, revalidated, in one transaction.
- **Prompts:** `config/system_prompt_agent.md` (agent) and `config/system_prompt.md` (single). Tool descriptions are in code.
- **Hashes:** `config_hash` and `system_prompt_hash` go on every session and gateway call so sessions run under different settings aren't pooled. The texts behind them are stored in `config_versions` and included in the export. Skill files count towards `system_prompt_hash`. To look up a hash, run `scripts/find-config-version.mjs`.
- **History:** comment-thread turns are kept out of the chat history. Past `history.max_turns` (12), all but `keep_turns` (6) are folded into a model-written summary under fixed headings (`summary.ts`). That is one summary call every few messages, logged as a gateway call with `purpose: "summary"`, and it falls back to one line per turn if it fails. `threads.summary_turns` records how many turns the summary covers.
- **Limits:** a budget in pounds per workspace (`limits.budget_gbp`, £60, with up to `budget_overrun_gbp` £5 over inside a turn) and 100 messages an hour (`messages_per_hour`; a message counts once however many calls it takes). Each gateway call stores its cost; see 4a16. Long documents are cut at `agent.max_read_chars` (40k).
- **Stop:** the stream route sends `{"type":"start","turn_id"}` first. The client aborts the fetch and posts `/chat/stop`, which is logged as `chat_stop`. The turn checks for a stop before each step and before it commits, and applies nothing if stopped. On Vercel a dropped connection may not be noticed mid-call.
- **Skills:** each skill is `config/skills/<name>/SKILL.md` in the Agent Skills format; the loader is `shared/src/node/config.ts` and the types are in `shared/src/skills.ts`. The example `dyslexia-friendly` skill was written by Claude and is **off**: Sam is to review it before adding it to `agent.skills`.
- **Comments:** the server side is `server/src/comments/` (deletes are soft; deleting a root removes its thread). An @model comment runs a turn whose reply is posted in that comment thread.

## 4. Running and testing

```bash
pnpm install                     # on Sam's Mac; in the sandbox pnpm may stall on an interactive "reinstall?" prompt: use CI=true
pnpm --filter @edw/shared build  # server and evals import shared's dist: rebuild after changing shared
pnpm test                        # or per package: (cd packages/<p> && npx vitest run)
npx tsc --noEmit -p packages/<p> # each of shared, server, client, evals; shared also has tsconfig.test.json
npx eslint .
pnpm eval                        # live evals against ELM (needs .env); pnpm eval -t "name" for some cases
```

On 13 Nov (evening): 1777 unit tests (shared 246, server 626, client 774, library 95, evals 36; 3 skipped), all passing; lint allows no warnings (`--max-warnings 0`). 46 e2e tests in 26 files. The Python tests in `analysis/` are not run by `pnpm test` or CI (`uv run --extra dev pytest` there). `pnpm check` runs typecheck, lint, unit tests and the size report.

**CI** is `scripts/ci.sh`: check, build, then the live client against the built server (`client/src/integration/live.integration.test.tsx`), then the browser tests. `pnpm check` and `pnpm e2e` do not cover that integration step, so run `scripts/ci.sh` (or at least that step) before merging into `development`. It went unrun from 11 to 12 Nov while a stale selector failed it on every run; it counts `.canvas-pm > .st-proposed` now, as `e2e/core.spec.ts` does. For a fast loop: `cd packages/<p> && npx vitest run <file>`, and `npx tsc --noEmit -p packages/<p>`.

In the sandbox, `packages/evals/node_modules/@edw/{server,shared}` were hand-made symlinks, and the lockfile importer for evals was written by hand (checked with `--frozen-lockfile`). Sam's `pnpm install` on the Mac replaces them.

**Evals** (`packages/evals`, modelled on Pi): each case gets a fresh temp database, deterministic checks in `src/judges.ts` (behaviour and budget), and a report compared with `baseline.json` (52 entries). Runs are saved in `.eval/<timestamp>_<id>/`, with each run's full JSON under `runs/`: read those to see what the model actually wrote. Environment settings: `EVAL_RUNS`, `EVAL_STRICT`, `EVAL_UPDATE_BASELINE`, `EVAL_MODE`, `EVAL_CONFIG_DIR`, `EVAL_PROVIDER=mock`; a case can take the option `{ skills: [...] }`. Most cases cost a few thousand tokens, most of it served from the cache. One ELM call stalled for 125 s on 30 Oct: under today's 300 s Vercel limit, but over the 60 s limit of the time.

## 4a. Make kit (2 Nov 2026)

Teachers help design the tool at `/make/<token>` (the workspace's own token; `/admin` has "Make kit" and "Copy kit link" per workspace). It replaces a hand-drawn HTML kit (no longer in the repo). Code: `client/src/make/`, `shared/src/make.ts`, `server/src/make/routes.ts`, migration 0015.

- The board is the real `WorkspaceScreen` on an in-memory workspace (`make/demoApi.ts`: the shared canvas model with the similes worksheet, one suggestion and one comment thread). Nothing it does reaches the server, and the assistant does not answer there.
- Nineteen places (since 3 Nov, from the first session's feedback) are `<MakeSlot zone>` one-liners in the real components (`components/slots/`; the editor never imports `make/`). They render nothing outside the kit. In the sidebar: Docs (a section of its own for new features; the documents themselves are under their chats as in the editor), On a document (under the open document, in `ThreadSidebar`), Classes (P7), Personalise, Skills and Prompts, then Chats and the rest of the sidebar (`make/SidebarSections.tsx`). By the chat: a banner above it, the chat and its footer. On the document: its header, the Export menu (it opens while a card that fits it is placed, and its button counts the cards inside), tabs, the toolbar, the top, inside it after the first table (a ProseMirror widget, `components/slots/inlineSlot.tsx`) and a footer bar. Then the comments column and the footer. The comments place shows only while that column is open.
- A placed card folds to its title (a pill in a bar, whose panel shows on hover); a click opens it, and hovering its card in the tray opens it and scrolls it into view. A card just placed opens and folds the others in that place; cards marked `open` in the catalogue never fold. Cards are dragged by their title or the grip in the corner. While a card is being placed, or hovered in the tray, the places it fits glow green, its previews show at full strength and the rest of the board fades back (`make/make.css`).
- **Place features**: pick up a card (click or drag) and the places it fits turn green, with a preview. It can be put down only in a green place (5 Nov): elsewhere a click, key or drop does nothing and the card stays picked up (`canDrop` in `make/boardOps.ts`). Cards placed elsewhere on a board saved before then stay where they are. Cards are drawn with the app's classes for where they land (`make/FeatureCard.tsx`); their wording comes from the old kit (`make/catalogue.ts`).
- **Give feedback** was taken out on 5 Nov (Sam): no mode switch, bubble or ✓ / ✕ counts. Feedback saved before then stays in `board.feedback` and the export; the `feedback` action stays in the schema so old logs still read.
- **Describe a feature**: `POST .../make/design` sends the design prompt through the configured provider and logs it as `make_design`. Since 5 Nov (Sam) the model designs one card, not two options to choose from; it goes into Your ideas and is dragged onto a green place like the others (the result keeps its `options` list, with one entry, so logged results read the same). The limit is 40 an hour per workspace, separate from the chat limits; the mock provider answers it offline.
- Saving: the whole board is PUT 0.8 s after a change, with the actions since the last save, logged as `make_action`. The board goes into the export as `make_board.json`. Opening the kit uses `?open=0`, so it is not counted as opening the workspace.
- Tried in headless Chrome with every card placed (3 Nov). Not yet tried: real dragging with a mouse, and the design step against ELM with the new places.
- Cards taken out after the first session: Flags lowered challenge, Draft until you approve and Try it as a pupil. Show tool calls and reasoning was taken out too, and came back on 9 Nov under Review and approval (teachers verifying output by seeing how it got there). A saved board drops cards no longer in the kit when it is next opened; the export keeps what was saved.

## 4a2. Suggestions as in Word (7 Nov 2026, branch `claude/modest-hamilton-gzqvf0`)

Teachers found the ✓ / ✕ in the margin confusing and often forgot them. Sam asked for Word's
behaviour. Four parts:

- **Tracked changes in the document** (`editor/extensions/trackChanges.ts`): a suggested edit
  shows the words it adds underlined and the words it takes out struck through just after them,
  in the `--suggest` colour; the struck words are a widget, not document text. A new block is
  underlined throughout, a block to delete struck through, and each suggestion keeps a thin line
  in the right margin. The word diff is `editor/suggest/diff.ts`. The tick and cross are gone.
- **One card per change** in the comments column (`components/comments/SuggestionCard.tsx`),
  among the comment threads in reading order, each with Accept and Reject; a new block, a
  deletion, a move or a formatting-only change has one card for the block. Hovering a button
  tints its change green or red (each change in the text carries `data-suggest-part`, its
  card's number; a whole-block card tints the block); a click on a change in the text selects its own card and scrolls it into view (elsewhere
  in the block, all the block's cards), and a click on a card tints just its change; the column opens when
  a reply brings suggestions; the comments button counts them. `suggest/merge.ts` (pure, over
  editor nodes) lists the changes and takes one in (`acceptChange`) or back (`rejectChange`).
- **Typing inside a suggestion keeps it waiting, as in Word** (`extensions/blockAttrs.ts`,
  `carryEdit` in `suggest/merge.ts`). Text typed straight after suggested words joins the
  suggestion; anything typed or deleted elsewhere is the teacher's and goes into the block's
  own text too. A new block from the assistant stays a suggestion; a suggested move stays.
  Typing into a block suggested for deletion still keeps the block (the deletion goes), and an
  edit that cannot be carried over (the block changed type) accepts it as before.
- **Suggesting or Editing for the assistant**, a menu beside "+" under the chat box
  (`components/EditModeMenu.tsx`, `screens/useComposerBar.ts`), remembered per browser,
  Suggesting by default. In Editing, the server applies the turn as usual and then takes its
  suggestions in, in the same transaction (`takeTurnIn` in `shared/src/canvas/apply.ts`), as the
  assistant's revisions; no teacher decision. The model is told in a line after the teacher's
  message (`gateway/editMode.ts`) only in Editing; the system prompt and its hash are unchanged.
  Teachers have no suggesting mode (Sam).
  **An earlier suggestion stays the teacher's** (Sam, 7 Nov 2026, after a turn about guided
  practice took in a waiting "remove the exit ticket" change on the same list block): a change in
  Editing mode to a block with an earlier turn's suggestion stays a suggestion (shown, and logged
  in `proposal_shown`), unless the model sets `revises_suggestion` on the operation because the
  teacher asked for that change. The Editing note tells the model to build on the accepted text.
  `edit_document`'s schema has the one new property for every turn.

**Research data.** Only optional fields on existing events, so earlier data reads as before:
`keystroke_batch.in_suggestion` and `live_after`; `part` on `proposal_accept` and
`proposal_reject` (index, ins, del, and both texts after it); `chat_prompt.edit_mode` (now on
every turn). Details in `docs/dev-spec.md`. `text_events.jsonl` takes the block's live revision
for typing inside a suggested edit (its keystrokes are over the suggested text). Block rows and
revisions keep their shape.

**If this is reversed.** The block and doc rows keep the old shape, so the old code shows them
as they are. Events are parsed strictly by kind but not by field, so old code reads every new
row; it drops the new fields when it reads them. Keep `shared/src/events/editor.ts` and
`events/chat.ts` as they are now (the fields cost nothing) so the export keeps `part`,
`in_suggestion`, `live_after` and `edit_mode`: without them, a decision on one change would read
as a decision on the whole block. Older browsers still on the old client send none of the new
fields and get the old behaviour from the new server (edit-then-accept).

Not tried: a real phone, and the model's replies in Editing mode against ELM. The page-colour
e2e test fails on `main` too (not from this work).

## 4a3. A block per list item (7 Nov 2026, branch `list-items`)

PLAN.md section 6. A list was one block, so a request about one item touched the whole list. Each
item is now a block of its own: `bullet_item`, `numbered_item` or `checklist_item`, content
`- text`, `3. text`, `- [ ] text`, a line break as a continuation line under the marker. The
helpers are `shared/src/lists.ts` (read, write, split an old list, number a run, join a run, match
items between versions, `sameItem`).

- **Numbering:** a run of numbered items counts on from its first item's number; later items' own
  numbers are not read, so adding an item never rewrites the others. The editor (`blockChrome.ts`,
  `data-n`), the model's view (`gateway/prompt.ts`), the markdown export and the Word download
  all number the same way. A later item whose number alone changed is not a change (`sameItem`).
- **Editor (L.1):** `editor/extensions/listItems.ts`. Enter makes the next item, Enter on an empty
  one or Backspace at the start of one makes a paragraph (as in Word, also for an item with text);
  `- `, `* `, `1. `, `[] ` start a list; the toolbar, slash menu and shortcuts set every block in
  the selection, and toggle back. The old whole-list nodes stay in the schema to show old blocks;
  changing one's type turns it into items. Toolbar logic moved to `useToolbarCommands.ts`.
- **Server and model (L.2):** `gateway/listOps.ts`, run in `commit.ts`. The model still writes a
  list one item per line; an insert becomes one insert per item. A replace of an item with
  several items rewrites its run when one of the new items is word for word another item of the
  run, or the turn also deletes one: matched item by item, so an unchanged item keeps its block
  and any waiting suggestion. Otherwise it replaces the item and inserts the rest after it. The
  gateway call and the tool reply keep the model's operations as written; `chat_response` and
  the stored turn have the split ones. The system prompts say how to change one item, add items
  and rewrite a list (`system_prompt_hash` changed).
- **Word, paste, download (L.3):** Word lists upload as items and a run downloads as one Word
  list; a pasted list comes in as items (nested ones flattened); `importDoc` splits whole lists
  from reference files read before today.
- **Migration (L.4):** `server/src/lists/` (`split.ts` plans one list, `migrate.ts` writes a
  workspace in one transaction), run by `scripts/split-lists.mjs` (dry run by default; `--apply`;
  `--turso-confirmed` for the hosted database). Each list block becomes items in its place,
  `derived_from` the list; the list is marked deleted. Its versions are replayed and matched, so
  each list revision becomes revisions of the items it changed, with the original actor, cause
  and time. A waiting suggestion moves to the items it changes; comments move to the item with
  their quote. Migration 0019 adds `block_splits` (list, version, item index → item block, lines).
  Rejected and deleted lists are split too, their items keeping that status, so their history
  reads per item. **Run on Turso on 8 Nov 2026** (backup in `../edw-data/backups/2026-11-08-10-18/`):
  123 lists in 8 workspaces became 326 items; every workspace's revisions and text events
  replay to its stored text after. The steps, should it be needed again, with `.env` on Turso:
  build shared and server; `node scripts/download-workspaces.mjs` (read only, every workspace's
  full export to `../edw-data/backups/<when>/`); `node scripts/split-lists.mjs` (the dry run,
  which works before 0019 is deployed: it makes the table inside a rolled-back transaction);
  read the report; then Sam runs `node scripts/split-lists.mjs --apply --backup
  ../edw-data/backups/<when> --turso-confirmed`, which checks the download has every workspace
  in the database before writing. Do it after `main` deploys this branch, so no old client
  writes a list block after the split.
- **Export:** `export/listEvents.ts`. Earlier events naming a split list are written in
  `events.jsonl` against the items they touched (`payload.split_from` names the list; one line
  per item where several were touched); `text_events.jsonl` replays the items. The database's
  event log is unchanged. MANIFEST.json has `list_items_stats` with the seqs translated.
- **Evals (L.5):** fixtures still write `ol`/`ul`; `evals/src/seed.ts` stores them as items, a
  waiting suggestion on the items it changes. New cases in `evals/lists.eval.ts`. Run on 8 Nov
  (`.eval/2026-11-08T11-24-16-970Z_67jsly`): 67 of 70 pass, the four list cases included; no
  baseline update yet. Two checks still expect a whole-list block: `comments > notices the
  metaphor` (the model comments on the metaphor's item, `questions#3`) and `editing > another
  part of the block` (the earlier suggestion is now 2 waiting, on two items). Sam to decide.
  Going ahead with an earlier suggestion spread over items puts in every part 2 times in 3
  after a sentence in `gateway/editMode.ts`.
- **Browser (8 Nov):** `e2e/lists.spec.ts` covers typing lists, numbering, ticking, Enter and
  Backspace, the shortcuts and paste; `e2e/typing.spec.ts` the fix in `editor/reconcile.ts`
  (text typed just after a new doc's first line was lost). In this sandbox: `sudo -E npx
  playwright install --with-deps chromium` once, then `pnpm build && pnpm e2e`. A test that
  clicks and then presses a key must give the editor a moment after the click (`placeCursor`).
  `core.spec.ts`'s page colour test fails often, before these changes too: the style card can
  stay after Accept (not looked into).
- **Not done:** L.6 (shift-click to select several blocks and drag them, cut and paste across
  blocks).

## 4a4. Plugins, libraries and Customise (8 Nov 2026, branch `claude/jolly-ritchie-fn593b`)

Design and API: `docs/plugins.md`. In short:

- **Catalogue:** config `plugins` (ARASAAC, Education Scotland's experiences and outcomes, TRAILS).
  `shared/src/plugins.ts` has the schema. A library plugin uses `LIBRARY_URL` unless it names a
  server; without one it shows "Not set up yet" and is never offered.
- **Per workspace:** `server/src/plugins/` (migration 0020: `plugin_settings`, `plugin_grants`).
  Routes: `GET /plugins[?thread_id=]`, `POST /plugins/:id/trust`, `POST /plugins/:id/allow`.
  Events: `plugin_trust_set`, `plugin_request`, `plugin_grant`; `chat_prompt.plugins` records
  what was on offer.
- **In a turn:** `gateway/turn-plugins.ts` (pure) decides the tools: pictures Off takes
  `search_pictures` away; a library not Off adds its catalogue (`context-messages.ts`) and
  `library_search`, `library_grep`, `library_list`, `library_read` (`gateway/tools/library.ts`),
  which call the library server through `plugins/library-client.ts` (10 s timeout). An Ask first
  plugin not yet allowed returns `needs_permission`; the turn records `plugin_request`.
- **Client:** Customise at the top of the sidebar (`screens/customise/`); Allow in this chat above
  the message box (`components/PluginRequests.tsx`, `usePluginRequests.ts`).
- **Splits done first** (no behaviour change): `useProjects`, `sidebar/ChatItem`, `sidebar/AccountMenu`,
  `gateway/context-messages.ts`.
- **The library** (`library/`, its own package; `library/README.md`): `pnpm --filter @edw/library serve`
  (port 8787, JSON API and MCP at `/mcp`); `pnpm --filter @edw/library ingest <collection>`
  (in the cloud sandbox add `NODE_USE_ENV_PROXY=1`). Education Scotland's experiences and outcomes:
  16 areas, 1,402 codes, one per line, committed. TRAILS: 36 resource pages and the 95 Word,
  PowerPoint and PDF files they link to, committed (all rights reserved; Sam's team publishes it
  and agreed). Tried end to end: the app's library tools against the running server.
- **Not done:** evals for the library tools (they cost money), a deployed library server (set
  `LIBRARY_URL` on Vercel once there is one), the weekly refresh job, the curation frontend,
  Qualifications Scotland (talking to them first).
- **e2e:** `e2e/customise.spec.ts` passes. `core.spec.ts` "page colour" fails on `main` too (52ac461),
  and "ask, accept" fails now and then there as well: not caused by this work.

## 4a5. Hidden state machines, and bugs they hid (9 Nov 2026, branch `claude/hopeful-mayer-88coxd`)

Two read-only surveys listed the app's implicit state machines (state spread over flags that
change apart). The client's map of who owns what is now `docs/client-state.md`. What changed:

- **The chat's turn is one state** (`components/chatTurn.ts`): idle, running or stopping, with a
  queue. A message sent while a reply is written (the box, the editor's @model prompt, Allow) is
  queued and shown faded with Cancel; it goes when the turn ends, however it ends (asked for on
  9 Nov). It goes about the doc open when it was queued. Before, a second send ran a second turn
  at once and Stop vanished while it streamed.
- **A turn's preview and new doc stay with its own chat and doc** (`screens/useTurnPreview.ts`):
  opening another doc or chat mid-turn no longer moves the streamed edits there.
- **The chat flushes the editor before sending** (as @model comments, delete and export did),
  at most 5 s. Accept went to the server in the logger's next batch, so a message sent just after
  reached it first and the model edited a block the server still had as a suggestion: the e2e
  "ask, accept" failure (3 in 30 on `main`; 30 of 30 pass now).
- **A reply wins over typing the server already had** (`useCanvasWrites.typingMark`): in Editing
  mode the model's change to a block the teacher had typed in was hidden by the old text.
- **The streamed preview no longer writes into the snapshot**: a suggested page colour showed its
  card before the server had it, so Accept failed. This was the e2e "page colour" failure on
  every run.
- **One canvas reload at a time** (`screens/useSyncRecovery.ts`), and "could not be loaded"
  clears once a reload works.
- **Server:** a Stop during the ARASAAC picture fetch now applies nothing (`agent-turn.ts`).
- **Editing mode, typing during a turn** (asked for on 9 Nov): the assistant's change goes in and
  the teacher's typing since sending is kept, merged word by word (`shared/src/textMerge.ts`,
  `gateway/typed-during.ts`); where both touched the same words, the teacher's text stays and the
  change waits as a suggestion. The chat says "You were typing in the same paragraph while I made
  the change. I didn't touch your text." The reply lists such blocks in `typed_during`; the
  model's operations are logged as written, the block's revision carries the merge.
- **The chat box has one round button:** an arrow sends; Stop while a reply is written and
  nothing is typed; typing brings the arrow back, and a message sent then is queued.
- **Splits:** `WorkspaceScreen.tsx` 768 to 336 lines (`useDocActions`, `useThreadActions`,
  `useTurnReply`, `ChatColumn`, `DocColumn`); `Canvas.tsx` 574 to about 300 (`useSyncMachine`,
  `useSlashMenu`, `useAskAndComment`). The word diff moved to `shared/src/wordDiff.ts`.
- **Tidying:** four unused exports gone; one `hasWaitingSuggestion` in `shared/src/blocks.ts` for
  the check written four times; lint allows no warnings; `pnpm sizes` lists big test files too;
  `ChatPane.tsx` split (`chatReplies.tsx`).

**For Sam to decide** (not changed):
- A client event the server refuses (for example Accept on a suggestion already decided in
  another tab) makes the whole batch fail, and the logger retries it for ever: every later event
  is lost until a reload, and `logger.flush()` never resolves. Fixing it means deciding what such
  a click is in the research log (stored and not applied, with an `error` event, is the
  suggestion). This is the research data format.
- Suggestions cleared or replaced without an event: typing into a block with a waiting delete or
  move clears it (`canvas/proposals.ts`), and a new suggestion on a block replaces an earlier
  turn's with no decision logged.
- The rules table says `open_reference_as_doc` is the one write outside a turn's commit; ARASAAC
  pictures and drawings are saved as assets before it too.
- The make kit's board can lose its last actions if the tab closes during a save. A safe fix
  needs the server to refuse an older board (two saves in flight can land out of order).

## 4a6. Interaction logging (10 Nov 2026, branch `claude/busy-newton-3ohipw`)

Sam wants sessions without a screen recording to be replayable, to study checking behaviour:
what is on screen, where the pointer is, what is clicked and selected. This is the first layer
(structured events, CoAuthor-style); a full DOM recording (rrweb, chunks to the R2 bucket) was
discussed and left for later.

- **Switch:** per workspace, off by default. `/admin` has an Interaction logging column: on for
  2, 8 or 24 hours, 7 days, or until turned off (`PUT /api/admin/sessions/:id/interactions`).
  It lives on the `sessions` row (migration 0021: `interactions_on`, `interactions_until`), which
  every participant request loads, so checking it costs no query. Each switch is logged as
  `interaction_logging_set`.
- **Server:** `sessions/interactions.ts`. While off or past its end, the events route drops
  interaction events and answers `interactions: false`; the session's config says the same.
- **Client:** `events/interactions/`, one tracker a file: `pointer`, `click`, `viewport`,
  `ui_state`, `page_state`, `text_select`. They start when the session or a batch's answer says
  on, and stop when one says off (`ParticipantApp`, `onAck` on the logger). Listeners are on the
  document, since menus render in portals; no key listeners. Suggestion cards, comment threads
  and chat messages carry `data-track`, the comments column `data-region="comments"`.
- **Not logged:** what a field holds (only its label), hover over things the pointer samples do
  not name, and the editor's caret beyond the existing `selection`.
- **Volume:** pointer is the bulk, roughly 1.5 kB per 2 s of movement. Watch it in the first
  sessions before leaving it on for days.
- **Tested:** unit tests per tracker, server tests for the switch and the dropping, and
  `e2e/interactions.spec.ts` (admin turns it on, the browser's events arrive, off stops them).
- Also: the note under every chat box ("AI makes mistakes. Don’t enter personal data.", shortened
  on 11 Nov).

## 4a7. Spyglass (11 Nov 2026)

The plan is `docs/spyglass.md`; its "Built so far" sections say what exists. In short: lineage and
the copy choice card, the turn's effect, the judge and its experiment harness, the three workshop
sessions as fixtures (`fixtures/sessions/`), and (branch `claude/blissful-volta-ldipyo`) the scope
check after each commit, the toggle under the chat box and the callout with Show me and Dismiss.
Next: run `pnpm judge-models` on a machine with ELM keys and choose the judge's model
(`spyglass.judge_model`), then the callout's writing actions and the coherence check (step 5).

## 4a8. Session replay (12 Nov 2026, branch `development`)

The replay player in the dev spec (section 9), built on interaction logging: `/admin/replay`, from
the Replay link on each workspace row, or a downloaded bundle zip chosen or dropped on the page
(read in the browser, sent nowhere). Code in `client/src/replay/`; no server or data format change.

- **Sessions:** a workspace's events are split wherever 10 minutes pass with nothing logged
  (`sittings.ts`). The player opens on the one where the teacher did most.
- **Controls:** play and pause, rewind ×2 then ×5, fast-forward ×2 then ×5, a scrub bar marked
  with the moments (prompts, replies, decisions, doc changes, leaving the tab), a list of moments
  to jump to, Space and the arrow keys. Quiet stretches over 4 s are skipped unless unticked.
- **What it draws** (`snapshot.ts`, pure, one pass a frame): the window at its logged size,
  letterboxed in a fixed 16:10 frame (`frame.ts`: a resized window changes shape inside the frame,
  and the line under it gives the size; P04 went from 1492 × 929 to 1484 × 1642 and back to
  1440 × 698). By default (Sam, 13 Nov 2026) a window taller than 16:10 is drawn landscape at its
  own width (`landscape.ts`): heights keep the top 120 px, move the bottom 180 px with the foot
  (the chat box) and squeeze the middle, and the anchoring below places points exactly; "Landscape
  window" under the player turns it off. Each region is where `viewport` put it, drawn with the app's own components fed from the log, with
  handlers that do nothing, on an `inert` stage (13 Nov 2026): `ThreadSidebar`, `ChatHead`,
  `ChatMessages` (from `chat_turns.jsonl` through `messagesOf`, as the chat loads them),
  `ChatComposer` with the draft typed out (its `shown` prop) and the bar as the last prompt set it,
  `DocHeader`, the `Toolbar`, the bubble menu on the teacher's logged selection, comment
  highlights, and `CommentsPanel` with its suggestion cards. The document is drawn by the
  editor's own extensions, schema and CSS (`ReplayCanvas.tsx`), from blocks rebuilt with their
  type and waiting suggestion (`blockStates.ts`) from `text_events.jsonl`, keystroke by keystroke
  (on P04 every doc rebuilds to its exported text). It is not `Canvas` itself: that keeps its own
  text for ordinary blocks (`reconcile.ts`) and would not show the typing. Scrolled to the logged
  `scrollTop`. Not drawn: the Word preview (a box names the dialog), menus, the rename box, and
  pictures (assets are not in the bundle). The models list is not in the bundle either: the
  picker offers the models the workspace's prompts used.
- **Lining the pointer up** (`calibration.ts`, `anchor.ts`, `ReplayCursor.tsx`): each region is
  shifted by the median difference between named clicks and where the replay draws the control
  (fixed controls at any time, any control at its click; only clicks made in the same window size); then a point is kept on what it was
  over: a click on its control (inside the item the log names, the nearest of several of a name),
  a pointer on its block or card (`block_id`, `item`, which the app's `data-track` marks). A
  click's control is seen as playback comes up to it, since clicking Accept removes the card. On
  P04, 184 of the 189 named clicks whose control is drawn land on it (170 as logged). The line
  under the stage says what was moved.
- **Focus** comes from focus events and what the teacher does: `block_visible` and other events
  the browser logs on its own carry `focus_pane: none` while focus is still in the doc.
- **Two readings of the log:** the server writes `chat_response`, `proposal_shown`,
  `spyglass_shown`, `asset_upload`, `chat_title` and `thread_rename` with the prompt's
  `client_ts`, so these are placed at `server_ts`. And any click, typing, pointer, selection or
  scroll counts as the teacher being back on the page, since `page_state` can say hidden with no
  later return (P04 at 12:23:12, `visible: false, focused: true`, then clicks two seconds later).
- **The clock** (`replay/clock.ts`): `advance` ignores a step of no time or less. A frame is
  stamped with the time it began, a few milliseconds before the press it draws, so Fast forward
  at the start (or Rewind at the end) used to read as arriving at the end and set the rate back
  to 1; that was the speed label test failing now and then.
- **Fonts:** the replay never reads a doc's font or page colour (`snapshot.ts` builds docs
  without `style`), so every replayed page is in the default (Calibri, or Carlito); text set in
  Comic Sans draws in Comic Neue. A doc with no font showed in the system font on screen before
  12 Nov, so its lines may break in other places than the teacher saw. To show a doc's look,
  follow `doc_create`'s `style` and `doc_style` events in `snapshot.ts` (not done: Sam said the
  exact font of old sessions does not matter).
- **Tested:** `replay.test.ts`, `blockStates.test.ts`, `workspaceAt.test.ts`, `calibration.test.ts`,
  `frame.test.ts`, `landscape.test.ts`, `ReplayPlayer.test.tsx`, `oldFonts.test.tsx`, `e2e/replay.spec.ts`.

## 4a9. Layout check, writing lines, default font (12 Nov 2026)

The model reads docs as markdown, so it cannot see where lines end, how wide columns come out or
where pages break; the telemetry (P01 to P04) shows teachers asking for and fixing exactly that.
`shared/src/layout/` lays a doc out as the Word download sets it (A4, the styles in `word.ts`, the
bundled fonts' letter widths from `scripts/font-widths.py`), paginates it as
`client/src/export/paginate.ts` does, and reports writing lines, table columns, spacing and page
ends in text, with fixes (`<line/>` for writing lines, suggested colwidths). The agent has it as
`check_layout` (in `agent.tools`); the evals use it as judges (`evals/layout.eval.ts`, not run yet).
A doc with no font is now in Calibri (`DEFAULT_DOC_FONT`) on screen, in Word and in the check,
rather than the system font on screen and Aptos in Word: Aptos has no free twin to measure with.
Comic Sans is no longer offered (a past study condition, 12 Nov); docs already in it keep it, measured
as an estimate (Comic Neue at 1.08). Writing lines are `<line/>`
(`editor/extensions/writingLine.ts`): a line to the right margin, in Word a tab to a right tab
stop with an underline leader, read back on upload; the prompts tell the model to use it instead
of underscores, which stay for short gaps inside a sentence. A table's header colour now survives
a model's rewrite (`gateway/tableLooks.ts`) and a Word upload (`import/tableHeaders.ts`). The prompts now say the page's text is about
600 px wide in Word, not 800.

## 4a10. Classes (12 Nov 2026, branch `claude/bold-hypatia-vfu8rg`)

The plan and Sam's answers are in `docs/classes.md`. Built: C.0 (data model), C.1 (screens),
C.2 (chats for a class), most of C.3 (the pupil table) and C.6 (copy a class into next year).
Not yet: curriculum (C.4), skills (C.5, with T.1), files on a class, paste from a spreadsheet.

- **Data:** migration 0022 (replaced once on the branch, before it ran anywhere; Sam agreed):
  `schools` (name kept for the teacher only; `demo` marks the demo's fictional school, which never
  takes the teacher's own classes), `year_groups` and `classes` each with `school_id` and
  `school_year` ("2026-27", turning over on 1 August: `shared/src/schoolYear.ts`), `classes.starred_at`
  (per teacher) and `copied_from`, `class_pupils` (a made-up label, needs as JSON, what helps,
  working at, a note), `threads.class_id` and `threads.year_group_id`. A chat has
  at most one of project, class and year group (400 otherwise). Code: `server/src/classes/`,
  `shared/src/classes.ts`, `shared/src/pupilLabels.ts` (two-word labels from fixed lists with no
  first names or colours).
- **Option B (Sam):** `pupils_change` logs which rows and fields changed and the table's shape
  (rows, a count of each need, a sha256), never the rows. The export's `classes.json` has year
  groups and classes in full and each class's `pupil_table` shape. The gateway log keeps
  `[pupil table: class …, 20 rows, sha256 …]` in place of the rows (`gateway/class-message.ts`
  `scrubTable`, applied in `agent-turn.ts`).
- **The model:** a class message after the system prompt (as the project message is): the class,
  its and its year group's notes, and its pupils by label. The rows go only when
  `provider.zero_retention` is true (it is, for ELM), otherwise counts. A year group chat gets
  each class's note and counts. Agent mode only. The system prompt is unchanged, so its hash is too.
- **Demo class:** `POST .../classes/demo` adds P7A to year group P7, from the study's fictional
  register (`server/src/classes/demo.ts`): names, candidate numbers and dates of birth left out,
  fixed labels, grades as "Working at". The printout Sam shared differs slightly from Appendix C
  (Oliver Shaw's note is shorter, no "Staged intervention level 2"); the printout was used.
- **Copy to next year** (`server/src/classes/copy.ts`): the year group moves up (P6 to P7, P7 to
  S1, S6 has none), the name follows (P6A to P7A), subject and note come across, the stage is left
  for the teacher, and the pupils are copied as new rows.
- **Client:** `screens/classes/` (the list as a sortable table by school year, `state/classList.ts`
  pure and tested; class page with star and Copy to next year; year group page; pupil table;
  `useClasses`), the sidebar's Classes section above Projects (`sidebar/ClassesSection.tsx`:
  starred classes this year, plus the open one), and the chat header names the class (`crumb` on
  `ChatColumn`). Events and the export carry a school's id, never its name. The make kit has no classes API, so
  its own Classes zone is unchanged.
- **One copy of a class's detail** (pupils, their adaptations, its curriculum):
  `state/classDetail.ts`, one store per api object (a `WeakMap`), read through
  `state/useClassDetail.ts` by the mentions, the sidebar's Curriculum, the Curriculum card and
  screen and the pupil table. Writers update it once the server has taken a change, so the others
  follow at once. Loads made together share one request; a load that began before a local change
  is thrown away and made again; moving a pupil refreshes the other class if it is held. The
  held `class` and `year_group` are not kept up to date: read those from the class list. Keep
  the api memoised (`ParticipantApp` does), or the store is made afresh each render. If a tool
  ever writes pupils or the curriculum, the turn should call the store's `refresh(classId)`.
  Rules 6 and 7 in `docs/client-state.md`.
- **`WorkspaceScreen.tsx`** is 341 lines: `screens/useClassContext.ts` has the open chat's class
  and what hangs off it, `screens/MainViews.tsx` draws every main view but the editor, `MainView`
  is in `screens/mainView.ts`. Two components still import from `screens/`
  (`mentions/CurriculumMention.tsx`, `FontNotice.tsx`).
- **Checked:** unit tests, all 24 e2e tests (`e2e/classes.spec.ts` covers the demo, a pupil, a
  class chat and copying to next year; 10 of 10 repeated),
  "ask, accept" 20 of 20. Not run: `pnpm eval` (the class message is new model input: worth a
  case that the model uses a pupil's needs and calls them by label). Migration 0022 not yet run on
  Turso.

## 4a11. Pedagogy library and curriculum (12 Nov 2026, branch `claude/upbeat-archimedes-dsb0fm`)

Sam (12 Nov): "a pedagogy section that the needs and curriculum can be matched to", and a
Curriculum section in the sidebar. The spec is `library/pedagogy-sample/HANDOFF.md`. Built on
top of 4a10 (the branch starts from `claude/bold-hypatia-vfu8rg`). A first slice: what is left is
at the end.

- **The library, served** (`library/src/pedagogy/`, `library/collections/pedagogy-scotland/`):
  a collection of kind `pedagogy` holds the sample's merged `pedagogy.yaml`, unchanged. The
  library server answers `entries` (by type, facets, `aligns_to`, words), `entry` (in full, with
  what links to and from it), `claims` (with passages, sources and how far each was checked) and
  `facets`; MCP has the same. Loading refuses quotes over 15 words, two quotes from one source
  and quotes from a `locator_only` source. **No vectors** (Sam agreed, 12 Nov: grep and
  structured queries beat similarity here). HANDOFF.md assumed Postgres and pgvector; for 116
  entries, facets and words are enough, and the requests are shaped by stage, subject, purpose
  and barrier anyway.
- **The app reaches it over HTTP only**: plugin kind `pedagogy` in config (`pedagogy-scotland`,
  Use freely, listed under Libraries on Customise). `server/src/pedagogy/` passes the Pedagogy
  screen's queries through; browsing works whatever the trust level (Off keeps it from the
  assistant only).
- **Curriculum (C.4)**: migration 0023 `class_curriculum` (code, text as picked, library
  version, planned, now or done). The picker greps the E&O collection at the class's level
  (`classes/curriculum-search.ts`). Events `curriculum_pick` and `curriculum_status` carry the
  full text; `classes.json` gains each class's `curriculum`.
- **Pupils' adaptations**: migration 0023 `pupil_adaptations` (library entry id and title,
  `changes_goal`, status confirmed, trialling or stopped, the pupil's own settings). Kept with
  the table and never written to the library. Treated as part of the table for option B (to
  confirm with Sam): `pupils_change` with `fields: ["adaptations"]` and the shape, whose hash now
  covers them (a table with none hashes as before). Moving a pupil moves theirs.
- **The model** (agent mode, class and year group chats only, so other chats and the system
  prompt hash are unchanged): `gateway/pedagogy-message.ts` fetches, before the turn, the format
  rules, cautions for the class's stage and subject, the adaptations chosen for its pupils, the
  curriculum entries for its "now" codes and the pedagogy aligned to them, entries to steer away
  from, and a map of the rest. It carries the rules from HANDOFF.md. Tools `pedagogy_find` and
  `pedagogy_read` add claims to the turn's citable set. `gateway/citations.ts` takes out, before
  the commit, a citation of any claim not retrieved (reply and comments) and every citation in a
  document edit. The pupil line in the class message lists their adaptations (so the gateway log
  scrubs them with the table); the class message gains the curriculum. About 7,500 tokens for
  P7A, in the cached prefix.
- **Client**: Pedagogy in the sidebar (under Customise; `screens/pedagogy/`), with a plain draft
  note; `[[clm-…]]` in replies is an "i" (`components/pedagogy/ClaimInfo.tsx`): claim, passage,
  source link, check status, draft; a curator's inference is drawn dashed. The class page has a
  Curriculum card; the pupil table an Adaptations column (hints from the typed needs first; a
  modification needs a second click). The sidebar's Curriculum shows the class in view's "now"
  items, each opening the pedagogy aligned to it. `ProjectView.tsx` came out of WorkspaceScreen
  first (structural).
- **Checked**: `pnpm check`; all 25 e2e tests (the e2e run now starts a library server;
  `e2e/pedagogy.spec.ts`, 8 of 8 repeated); "ask, accept" 20 of 20. The mock cites a format rule in
  a class chat so the "i" shows offline. **Not run: `pnpm eval`** (`evals/pedagogy.eval.ts`, seven
  cases from HANDOFF.md section 8; they need `LIBRARY_URL`). Migration 0023 not run on Turso.
- **Research data, for Sam to confirm**: new events `curriculum_pick`, `curriculum_status`,
  `pedagogy_open`; `pupils_change.fields` may say `adaptations`; `classes.json` gains
  `curriculum`. All additions; earlier data reads as before.
- **Left**: Know, Do, Understand; curriculum for year groups; claim "i" on suggestion cards and
  comments (comments keep the citation text); a review workflow for the library (all draft);
  a controlled vocabulary for barriers; machine-applying `render_settings` (the model reads
  them); evals run; the library server deployed with `LIBRARY_URL` set.

### 4a11, later on 12 Nov (Sam's answers)

- **Gateway log keeps the pupil rows in full** for the pilot: config
  `pupil_rows_in_gateway_log: "full"`; `"shape"` switches back to option B's placeholder.
  Events and `classes.json` keep only the shape either way; under `"full"` the export's
  `gateway_calls.jsonl` holds the rows (the config comment and `MANIFEST.json` say so). There is
  no way yet to remove rows already logged, short of deleting the workspace. Whether
  `chat_turns.jsonl` can hold pupil details (a reply quoting a row) has not been looked at.
  `docs/classes.md` ("Sam's answers (12 Nov, evening)", point 1) still has the old wording, kept
  as the record of the answer.
- **Licences:** a source not yet confirmed reads "(licence unconfirmed)".
- **Structured curriculum** (`library/src/curriculum/`, collection `cfe-curriculum`, rebuilt with
  `pnpm --filter @edw/library curriculum`): 1,162 outcomes and 1,261 benchmarks for P7 and S1. Gaps
  are reported by the build and in `library/README.md`. The picker and class chats use it.
- **Study workspaces** start with the demo class and a demo chat (`server/src/study/`,
  `study_seed` event, `e2e/study.spec.ts`). The seed runs after the session is made, outside its
  transaction; if it throws, `sessions/routes.ts` deletes the new session and returns the seed's
  error (`study/seed.test.ts`). The study's tasks are given verbally and teachers make their own
  projects and chats (Sam, 13 Nov): `docs/classes.md`, and a dated note at the top of
  `docs/study-design.md` on what is out of date there.
- **Deleting a workspace** removes every row with its `session_id`: `SESSION_TABLES` in
  `sessions/service.ts` (exported) is checked against `sqlite_master` by
  `sessions/delete.test.ts`, so a new table left out fails it.
- **`CanvasService`** in `deps.ts` has `loadState`, `applyTurn` and `structural`, so the seed and
  the block routes need no cast; `app.ts` (the chat service) and `pictures/routes.ts` (`mutate`)
  still cast to `CanvasServiceImpl`.
- **Claim source links** (`ClaimInfo.tsx`) are links only for `http:` and `https:` (`webUrl`);
  anything else is plain text.
- All 26 e2e tests pass. Not run: `pnpm eval`.
- **On Vercel** (12 Nov, merged with `development`): the library is a second function in the
  same project (`api/library.mjs`, `library/src/server/vercel.ts`), at `/library`, with its
  collections bundled. Every request needs `LIBRARY_TOKEN` as a bearer token (TRAILS is all
  rights reserved), and the app sends it to `LIBRARY_URL` only. To switch it on, set
  `LIBRARY_TOKEN` on the project (Production and Preview): `LIBRARY_URL` then defaults to each
  deployment's own `/library`, production's domain or a preview's branch address, sending
  Vercel's protection bypass when there is one (DEPLOY.md section 6). The bypass goes only to that
  derived address (`loadEnv` sets `LIBRARY_BYPASS_SECRET` only when `vercelLibraryUrl` worked the
  address out); a
  `LIBRARY_URL` set by hand never gets it, so leave it unset on Vercel. `vercel.json` sends a bare `/library` to the library's `/`.
  Checked locally against the built entry; not yet tried on Vercel itself (a preview should answer
  `/library` with a 401 without the token).

## 4a12. Preferences, and Customise renamed Plugins (12 Nov 2026, branch `development`)

The sidebar's first entries are now **Preferences** (sliders icon) and **Plugins** (puzzle icon;
the screen was called Customise, `screens/plugins/`, `e2e/plugins.spec.ts`). Preferences
(`screens/preferences/`) holds, for the workspace:

- **About you**: a note about the teacher, up to 2000 characters, saved when the box is left. The
  model gets it in every agent-mode chat as the first message after the system prompt
  (`gateway/context-messages.ts` `teacherMessage`), as a project's instructions are, so the system
  prompt and `system_prompt_hash` stay the same for everyone. Not given in single mode.
- **Default font**: new docs (a new chat's, New doc, a Word upload, the model's) start in it, set on
  the doc as if the teacher had chosen it (`Ctx.newDocStyle` in the canvas). Docs already made
  keep their look; a copy takes its source's look. Calibri clears it (a doc with no font is in
  Calibri already). The doc's own font menu does the same: no separate "Default", a doc with no font
  shows as Calibri, and choosing Calibri leaves it with no font. Sam agreed the `style` on `doc_create`
  (12 Nov).

Stored in `preferences` (migration 0024), one row per workspace, deleted with the workspace.
Routes: `GET`/`POST /api/sessions/:id/preferences`. A change is logged as `preferences_set` with
only the fields that changed (the note's text included); `doc_create` now carries `style` when a
doc starts with one. The export bundle has no preferences file: the events hold the history.

## 4a13. Mentions and citations in replies (12 Nov 2026, branch `development`)

Sam's feedback on a whole-class exercise in P7A:

- **Pupils in replies** (`client/src/components/mentions/`): a label of the chat's class
  (tidy-puffin) is a dotted link; hover, focus or tap shows their row (needs, working at, what
  helps, note, adaptations). Loaded with the class (`useMentionSource`, provided in
  `WorkspaceScreen`). Replay, the make kit and the Pedagogy screen have no provider, so render as before.
- **Curriculum codes** (LIT 2-13a) show the outcome from the structured curriculum and whether the
  class is on it; a click opens the pedagogy aligned to it. A link the model puts on a code (the
  education.gov.scot PDF) gives way to this; other links stay.
- **Citations:** the pedagogy message now says a reply that uses the library cites the claim
  behind it, and writes codes without links. New eval case in `evals/pedagogy.eval.ts`. **Not run**
  (no `.env` in the sandbox).
- Checked: `pnpm check`, all 29 e2e tests, "ask, accept" 20 of 20.
## 4a15. Accounts, sign-in, access codes and admins (13 Nov 2026, #14, #23, #28 to #33)

Teachers can now sign in with Google or Microsoft and get one workspace each; link workspaces
(`/s/<token>`) still work and gain a typable access code; admins sign in the same way. Setup for
Google and Entra, the Vercel variables and "The first admin" are in `DEPLOY.md` section 12. Not
yet tried against real Google or Microsoft.

**Data.** Migration 0027: `sessions.access` (`'link'` by default, or `'account'`); `accounts`
(one workspace each, unique `(provider, subject)`), `sign_ins` and `account_invites`, keeping only
the hash of a sign-in id or invite code; first in `SESSION_TABLES`. 0028:
`sessions.access_code` (unique, stored canonical, shown `XXXX-XXXX-XXXX`; no backfill, so older
link workspaces have none until the admin makes one). 0029: `accounts.is_admin`.

**Server** (`packages/server/src/`):

- `accounts/store.ts`: invites (code returned only when made; 14 days by default, 1 to 90; open,
  used, expired; withdraw an open one), `claimInvite` (one transaction makes the workspace, named
  after the invite's label, and the account; unknown 404, used 409, expired 410; an identity that
  already has an account gets its own workspace back and the invite stays open),
  `openAccount`, `startSignIn`, `accountForSignIn`, `endSignIn`. Invite routes in
  `accounts/admin-routes.ts` (`/api/admin/invites`; an invite's id is the hash of its code).
- Sign-in: `accounts/providers.ts` (the registry; a SAML provider would be another member of
  `ProviderSettings`), `accounts/oidc.ts` (openid-client v6, code flow with PKCE, state, nonce,
  `prompt=select_account`; ID token signatures checked, `enableNonRepudiationChecks`; Entra's
  `tid` checked twice), `accounts/cookies.ts` (state cookie 10 minutes, HMAC with `AUTH_SECRET`;
  sign-in cookie 30 days, stored as a SHA-256 hash; `__Host-` names on https, plain names on
  localhost), `accounts/policy.ts` (the account, then the invite, then the open doors: Entra tenant
  from `tid`, Google domain from `hd`, never the email's domain; else `not_allowed`),
  `accounts/routes.ts`. `auth.ts` `requireAccount` sets `req.account`; every participant route
  still uses `requireParticipant`, and the client uses the token from `/api/account/workspace`
  as `/s/:token` does.
- Routes: `GET /api/auth/providers`, `GET /api/auth/:provider/start[?invite=]`,
  `GET /api/auth/:provider/callback` (to `/w` for everyone since #79, `/admin` only for an admin who
  started from /admin with `then=admin`, or `/signin?error=<reason>`), `POST /api/auth/sign-out`, `GET /api/account/workspace`
  (`session_id`, `token`, `account` with `notice_version` and `is_admin`), `POST
  /api/account/notice`. Error reasons: `cancelled`, `provider_error`, `failed`, `not_allowed`,
  `invite_unknown`, `invite_used`, `invite_expired` (`SignInError`). Writes need `Origin` equal to
  the site's (`auth.ts` `fromSite`).
- Settings (`env.ts`): `AUTH_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (#73),
  `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` (#89; the old `AUTH_MICROSOFT_CLIENT_*` pair is
  still read as a deprecated fallback, never mixed with the new one), `AUTH_MICROSOFT_TENANT`
  (defaults to `organizations`), `AUTH_OPEN_MICROSOFT_TENANTS`, `AUTH_OPEN_GOOGLE_DOMAINS`, `AUTH_TEST_*`
  (refused in production; the `test` provider loads only with `NODE_ENV` `test` or
  `development`). `AUTH_BASE_URL` is worked out: `PUBLIC_BASE_URL`, else the Vercel address, else
  localhost. Other previews offer no sign-in by configuration: set the sign-in variables for the
  `development` branch's previews only.
- Access codes: `access/codes.ts` (12 characters of Crockford base32; `normaliseCode` forgives
  case, spaces, hyphens, I/L for 1, O for 0). `POST /api/access {code}` gives `{session_id,
  token}`; only `access = 'link'` workspaces answer. Ten wrong codes a minute from one address
  gives 429 for everything from it (first `X-Forwarded-For` entry on Vercel, the socket address
  elsewhere). `POST /api/admin/sessions/:id/access-code` makes or replaces a code (replacing
  doubles as "this code leaked"). Invite codes take the same shape; `claimInvite` tries the exact
  code first (old 24-character codes are case-sensitive), then its forgiven form.
- Admins: `accounts/admins.ts`. `requireAdmin` takes an admin's sign-in cookie for 12 hours from
  the sign-in's start (`ADMIN_SIGN_IN_HOURS`), writes only with the site's `Origin`; losing the
  flag takes effect at once. Then the password, only off Vercel (`passwordAllowed` checks
  `VERCEL_ENV` and `ON_VERCEL`); `ADMIN_PASSWORD` is optional on Vercel and never compared there.
  A 401 carries `password: true|false` so `/admin` shows the password form only where it works.
  `GET /api/admin/me`, `GET /api/admin/accounts`, `PUT /api/admin/accounts/:id/admin`; removing
  the last admin, or deleting the only admin's workspace, is `409 last_admin`. A grant or removal
  logs the two account ids, never an email or name. All admin routes are `no-store`.
- `scripts/admin.mjs`: `--invite "<name>"` prints an invite link and its id; `--admin <invite
  id>` makes the account that invite made an admin, after a typed `yes`. Tried only against a local
  file database.

**Client** (`packages/client/src/`):

- `/`, `/signin`, `/join/:code` in `screens/landing/`: invite code ("Sign up", to `/join/<code>`)
  and access code ("Open workspace", `POST /api/access` then `/s/<token>`); signed in, "Open your
  workspace" and (for an admin) "Admin". `ProviderButtons` lists the providers from the server.
  The code field strips spaces and reduces a pasted `/join/` link to its code; an invite code keeps
  its case. Calls in `api/auth.ts`.
- `/w` (`screens/AccountApp.tsx`, `state/account.ts`): asks `/api/account/workspace`, keeps the
  token in React state only, and renders `screens/WorkspaceApp.tsx`, the same workspace `/s/:token`
  draws (`ParticipantApp` is now only the route). 401 goes to `/signin`.
- The notice: `config/sign-in-notice.json`, shown while `account.notice_version` differs from its
  `version`. **To show it again, change the text and the version together.** A tick enables
  Continue; only Continue records it.
- Sign out (`components/sidebar/AccountMenu.tsx`): blur the editor, make the workspace `inert`,
  save for at most 5 s (`useSaveBeforeSignOut`, registered from `screens/useDocActions.ts`),
  `POST /api/auth/sign-out`, then a full page load to `/signin?signed_out=1` so no module-level map
  keeps the token. A failed sign-out keeps the person signed in and says so. A chat turn still
  running carries on at the server.
- `/admin`: `screens/admin/` (split from one file in #28: `AdminApp`, `useAdminSessions`,
  `NewWorkspaceForm`, `WorkspaceList`, `columns.tsx`, `ActionsCell`, `styles.ts`). **To add a
  column: a cell component in its own file and one line in `adminColumns`.** `admin/AdminGate.tsx`
  replaces the password gate (sign-in links, "Sign in again" after 12 hours, the password form only
  where allowed). `InvitesPanel`, `AdminsPanel` (`role="switch"` per account), and the columns
  Access and Access code (hidden until Show; Copy works without showing it). `useAdminAccounts`
  loads the accounts once for both.

**Tests and e2e.** `e2e/fake-issuer.mjs` runs the server's `startFakeIssuer` (from
`packages/server/dist`, so build first) on port 3952; the app gets `NODE_ENV=test`, `AUTH_SECRET`
and `AUTH_TEST_ISSUER`. Each browser is its own person through a `fake_sub` cookie
(`e2e/fakePerson.ts` `becomeSomeone`); there is no control port. Specs: `signInSmoke`, `landing`,
`accounts`, `adminSignIn`. Privacy tests (`accounts/privacy.test.ts`, `accounts/routes.test.ts`,
`access/privacy.test.ts`) check the export and every table but `accounts` and `account_invites`
hold no email, name, subject or code. The invite's label does reach the export, and the invites
panel says so.

**Left.** The account menu shows the email, not the name. A sign-out control on `/` (the server
has the route). Signing in from `/admin/replay` comes back to `/admin`. `providerName`
(`api/admin.ts`) is a second list of provider labels to keep in step with `providers.ts`.
`admin/PasswordGate.tsx` exports `PasswordForm` (rename later). The Access column loads accounts
once per page. Nothing yet reads `emailVerified`; there is no matching by email at all.

## 4a16. Research data and the budget (13 Nov 2026, #16, #40, #41)

- **Pupil rows in stored calls: code kept, switched off** (Sam, 13 Nov: keep the data, removal may
  come later). `classes/pupil-scrub.ts` `scrubPupilRows` replaces each pupil table in a stored
  call's class message with `[pupil table removed: N rows, sha256 ...]`; when the end is in doubt
  it removes more, not less, and counts `unsure`; rows still found after are `leftover`, which
  refuses a real run. `gateway/scrub-routes.ts` `scrubSessions` does dry runs and real runs (one
  transaction, an export needed since the last call, one `pupil_rows_scrub` event). The rules are
  in `docs/classes.md` Decisions item 10. What it still cannot see, both cases a teacher would
  have to construct on purpose: (1) a note holding the closing line followed by a whole class
  message opening, word for word, splits the message there (rows after it in the current format
  count as `leftover`, so a real run is refused; in the older format they are not seen); (2) the
  last pupil's note holding a curriculum section in the server's exact shape, in a class with no
  curriculum, is taken for the real one and kept, unreported. Only `gateway_calls` is scrubbed; a
  table inside a string that is itself JSON is not found (none is stored that way). Switched off: `app.ts` does
  not register `registerScrubRoutes` (tested), `scripts/scrub-pupil-rows.mjs` stops at once, no
  admin control. To switch on: register the routes, take out the script's early exit, and wire
  `noExportRecorded` to `workspace_export` events.
- **Server-only event kinds** (`shared/src/events/serverOnly.ts`): `study_seed`,
  `pupil_rows_scrub`, `budget_update`, `workspace_export`. `events/routes.ts` refuses a batch
  holding any of them (400 `server_only_kind`, nothing stored). Other kinds the server writes
  (`chat_response`, `proposal_shown`, `chat_stop`, `participant_open`, `interaction_logging_set`,
  `asset_upload`) are refused too since the endpoint audit (4a17).
- **`workspace_export`** (`shared/src/events/exports.ts`: `format`, `via` account or password,
  `files`): one per admin download, written after the bundle is built, so a bundle holds earlier
  downloads but not its own. No admin id or email. `scripts/download-workspaces.mjs` backups log
  none. The replay counts it as passive.
- **`session.json` has `access`** (`link` or `account`), required on export.
  `analysis/edw_analysis/bundle.py` reads a bundle without it as `link`. Run its tests with
  `uv run --extra dev pytest` in `analysis/`; CI does not run them.
- **A budget in pounds per workspace** (replaces the 300-message total). `limits` is
  `{ messages_per_hour: 100, budget_gbp: 60, budget_overrun_gbp: 5 }`. Migration 0030 adds
  `gateway_calls.cost_gbp`, stored when each call is saved at that day's prices
  (`gateway/calls.ts` `callCostGbp`); `budget/store.ts` `spendGbp` sums it. Calls from before 0030 count
  as nothing. Before a turn (`limits.ts` `checkLimits`): spend at or over £60 is 429
  `budget_spent` with `BUDGET_MESSAGE`, then the hourly cap. Before each agent call
  (`checkCallBudget`, through `runAgentTurn`'s `beforeCall`): saved spend plus this turn's steps
  plus the call's worst cost (`worstCostGbp`: a token per byte at the dearest input price, plus
  `max_output_tokens`) must stay within £65, or the turn fails with the finished steps saved and
  nothing applied. A call that may have run without counts is charged its worst cost. The config
  must price every model it names (`budgetProblems`).
  - Known gaps: two turns at once each see only their own unsaved spend (pinned by a test; a
    follow-up if Sam wants a hard ceiling). The summary, the judge and single mode are costed but
    not checked one by one. **Single mode stores £0 for a call stopped mid-stream**, so charge it
    as `agent-turn.ts` does before ever switching `mode` to `single`. A judge retry that times out
    loses the first attempt's row.
  - Since #50 the counter under the chat box and Usage on Preferences (spend by UK day,
    `server/src/usage/`) add up the stored costs too (4a18). Since #51 the budget is config plus
    top-ups, and /admin shows spend against it.

## 4a17. Endpoint audit; replacing or closing a link (13 Nov 2026, #44)

- **Route table.** `docs/routes.md` lists every server route, who may call it (none, workspace
  token, access code, account, admin) and its guard. `server/src/routes.test.ts` collects the
  routes through `buildApp`'s `onRoute` option and fails on a route missing from the table, a row
  not registered, a wrong guard, an open row with no reason, or a guard that lets through a caller
  it must refuse (no credentials, another workspace's token, a token or a non-admin cookie on an
  admin route, a cookie on a write from another site). It checks guards, not what a handler does
  after one. Left (in `docs/routes.md`): `?token=` is taken on every workspace route (three need
  it), and child ids inside handlers are spot-checked, not proved route by route.
- **Server-only kinds** now also cover `chat_response`, `proposal_shown`, `chat_stop`,
  `participant_open`, `interaction_logging_set`, `asset_upload` and the new `workspace_link`.
- **Export GETs with the admin cookie** need a fetch from the site's own page (`Sec-Fetch-Site:
  same-origin`, or `Origin` equal to `AUTH_BASE_URL`), else 403 `export_from_site`
  (`export/routes.ts` `fetchedFromSite`). Chosen over a POST so e2e and scripts can still GET
  `export.json` with the password. Browsers that send neither header (Safari before 16.4) are
  refused with the cookie: it fails closed.
- **Replace or close a link.** `POST /api/admin/sessions/:id/link/replace` gives a link workspace
  a new token and code; the old ones stop at once (and it reopens a closed link).
  `.../link/close` sets `sessions.link_closed_at` (migration 0031), clears the code and changes
  the token as well, so nothing that checks only the token opens it; `byParticipantToken` and
  `byAccessCode` skip a closed link, and `.../access-code` answers 409 `link_closed`. An account
  workspace answers 409 `account_workspace`. Both log `workspace_link` `{ action, via }`, never
  the link or code; the replay counts it as passive. A turn already running carries on to its
  commit (up to 200 s); every later request is refused, and a tab on the old link stops saving
  (the confirm says so). /admin: Replace and Close, each confirmed in place; a closed link offers
  only a new link and the code column says "Link closed".

## 4a18. Usage, top-ups and "£N left" (13 to 15 Nov 2026, #45, #51, #67)

- **The chat counter adds up stored costs** (`gateway/history.ts` `threadCallUsage`), so a price
  change in config no longer moves it and it agrees with `spendGbp`; a call from before 0030
  counts £0. `ChatUsage` is `{ input_tokens, output_tokens, gbp }`; the meter shows one cost
  ("↓12.3k ↑678 £0.025"). `priceCalls` prices calls only when they are saved.
- **Usage on Preferences** (`screens/preferences/UsageSection.tsx`, `UsageChart.tsx`): "£N of £60
  used" with a bar, This week / This month / All time, the range total, CSS bars by day and a
  screen-reader table of the same days. `GET /api/sessions/:id/usage?range=week|month|all`
  (`server/src/usage/`, participant, no event) returns `days`, `total_gbp`, `spent_gbp` (all
  time) and `budget_gbp`. Days are UK days (`shared/src/usageDaily.ts`, Europe/London through
  `Intl`, arithmetic on `YYYY-MM-DD` at UTC midnight so clock changes never move it). Weeks run
  from Monday to today, months from the 1st to today, all time from the first call; empty ranges
  say "Nothing spent this week." Amounts (`UsagePounds.ts`): "£60", "£0.50", "£0.081". Rows are
  bucketed in the server, since SQLite cannot group by UK day. Left: the admin page could show the
  same report per workspace (`usageReport` takes a session id).
- **A budget is config `limits.budget_gbp` plus its top-ups** (migration 0033 `budget_topups`,
  read through `server/src/budget/store.ts`). Both checks in `gateway/limits.ts` and Usage use it;
  the limit stays soft and per workspace (Sam, 14 Nov). Deleting a workspace removes its top-ups.
- **Routes** (`budget/routes.ts`): `GET /api/admin/budgets`, `POST
  /api/admin/sessions/:id/budget/topup` (adds `TOP_UP_GBP` = £10, now in `shared/src/budget.ts`,
  and logs `budget_update` in the same transaction) and `GET /api/sessions/:id/budget` for the
  chat. `budget_update` is `{ amount_gbp, budget_before_gbp, budget_after_gbp, spent_gbp, via }`
  plus, since #67, an optional `account_id` for a signed-in admin (none for the password or before
  15 Nov). The table has no account column: the event is the record of who.
- **/admin** has a Budget column ("£12.40 of £60", "Add £10"; `screens/admin/BudgetCell.tsx`,
  one request for the list through `useAdminBudgets`). No confirm, but the button is off while it
  runs. There is no undo and no top-up history beyond the events. Top-ups are not a bundle file:
  the bundle shape is unchanged and the `budget_update` events are the record. The event takes any
  positive amount, so a new top-up size needs no new kind. Migration 0032 (skills) has not
  landed: when it does, the lists in `db/db.test.ts` need its line.
- **"£N left"** sits under the chat's name beside the meter, always, in whole pounds rounded down
  (`screens/useBudgetLeft.ts`), fetched again after each turn. Who owns it: `docs/client-state.md`.

## 4a19. Admin password, sign-in page and the admin table (14 to 21 Nov 2026, #56, #60, #77, #79, #98, #109)

- **Where the password works** (`auth.ts` `passwordAllowed`): a non-empty password, and
  `deployEnv` is not `production`. On Vercel `vercelDeployEnv` decides from `VERCEL_ENV`: only
  `preview` takes it; production, `vercel dev` and a function with no `VERCEL_ENV` refuse it, and
  `DEPLOY_ENV` is ignored there. Off Vercel, `DEPLOY_ENV` (`production`, `preview` or `local`;
  unset is `local`, anything else stops the server) decides (#98, building on the default of
  decision 10 in `docs/architecture-target.md`, an open row). With `DEPLOY_ENV=production` no
  password is needed to start. `AUTH_TEST_ISSUER` is refused there too. DEPLOY.md says to set
  `ADMIN_PASSWORD` for Preview on branch `development` only, which keeps other previews closed.
  README and comments now say "outside production" rather than "off Vercel" (#109).
- **`workspace_export`** has an optional `account_id` when a signed-in admin exported (#56).
- **/signin takes the password** where it works (#60): Username and Password under the provider
  buttons (`screens/landing/usePasswordTaken.ts` reads the 401's `password` flag from
  `GET /api/admin/me`). The username must be "admin" (trimmed, any case), checked in the browser;
  an accepted password goes to sessionStorage (`edw.admin.password`) and the page moves to
  `/admin`, which uses it with no second prompt. Wrong details say "That username or password is
  not right." The form is `PasswordForm` with `askUsername`; its error line is `role="alert"`. With
  the form shown, "Sign-in is not set up here yet" is left out.
- **Admins land on /w** (#79). Google or Microsoft sign-in lands everyone on `/w`; a sign-in
  started from /admin's own buttons carries `then=admin` (an allow-list of one, sealed in the
  state cookie; anything else reads as a plain sign-in) and comes back to /admin. An admin at `/w`
  has "Dashboard" as the sidebar's last row: it saves as Sign out does, then loads `/admin`,
  still signed in (`docs/client-state.md` rule 8, with the back-forward cache details). `/` and
  `/start` no longer show an Admin button. `SignedInAccount.is_admin` is no longer read.
- **The workspace table** (#77): actions are 24 px icon buttons (`admin/IconButton.tsx`:
  `IconButton`, `IconLink`, `CopyIcon`), each with an `aria-label` naming the action and the
  workspace and a native `title` (a CSS tip would be cut off in the scrolling card). Access column:
  Copy link, Open, Replace, Close (`screens/admin/AccessCell.tsx`); code column: Show and Copy;
  a last Data column (`DataCell` in `ActionsCell.tsx`): Replay, Download .zip, Delete. Delete asks
  for `DELETE` typed exactly. The card scrolls sideways on a narrow screen. CI draws in DejaVu
  Sans, wider than the sandbox's Inter, so confirms may break long words. Left: `WorkspaceLinks`
  is unused by the list (its `CopyLink` is still used), `ActionsCell.tsx` wants renaming, and
  `CopyIcon` ignores a failed clipboard write.

## 4a20. Feature switches (15 Nov 2026, #62, #64)

- **Six switches** (`shared/src/features.ts`): `classes`, `curriculum`, `pedagogy`,
  `preferences`, `spyglass`, `plugins`, all on by default, with no rules between them. Stored in
  `sessions.features` (migration 0034) as JSON of those that are off, null when all are on;
  `resolveFeatures` reads anything unreadable as on. `PUT /api/admin/sessions/:id/features`
  (`features/routes.ts`) and `POST /api/admin/sessions` set them, logging the server-only
  `workspace_features_set` (`features`, `changed`, `via`, `account_id`) in one transaction, also
  for a PUT that changes nothing and for a create with any switch off. The replay does not start a
  sitting for it. `GET /api/sessions/:id` returns `config.features`, and `config.spyglass` is
  `'off'` when the switch is. `session.json` lists all six; older bundles read as all on (also in
  `analysis/`). The rename `PATCH` now has its own `{label}` schema.
- **What the assistant hears** (`gateway/service.ts` reads the switches once per turn onto
  `TurnContext.features`; they are a required argument wherever they reach the model):
  classes off runs a class chat as a plain chat; curriculum off drops the class's curriculum and
  benchmarks; pedagogy off drops the grounding, the `pedagogy_*` tools and the pupil table's
  adaptations; plugins off drops every library and picture plugin (`search_pictures` too, though
  the system prompt still mentions it, as with ARASAAC set to Off);
  preferences off drops the teacher note (the saved font still applies). Spyglass off still runs
  the checks unseen, stored with `hidden: "workspace_off"` (after `config_off`, before
  `teacher_off`), so nothing streams, comes back on reload or reaches the history.
- Decided: curriculum with classes off sends nothing (it all lives in the class message today); the
  pedagogy library follows the pedagogy switch, not plugins; the E&O library is a plugin, so
  curriculum off leaves it (Sam, 15 Nov); plugins off still sends benchmarks (the structured
  curriculum is not a plugin; still with Sam, one line in `turnPlugins`). Single mode is unchanged
  apart from Spyglass.
- `gateway/features-turn.test.ts` pins the everything-on request with a snapshot taken before the
  switches reached the gateway. A deliberate prompt, tool or context change updates it with
  `npx vitest run src/gateway/features-turn.test.ts -u`; say so in that PR.
- Left: no screen or feature route acts on the switches yet, the client does not read
  `config.features`, and there is no admin screen for them.

## 4a21. The front page and its wording (15 Nov 2026, #68, #76, #81)

- **`/`** (`screens/landing/`) is a full page: header (section links hidden below 900px, theme
  switch), a hero ("ELM for teachers", three facts, one **Get started** button to `/start`, or
  "Open your workspace" when signed in) beside the editor drawn in markup (`WorksheetSketch.tsx`,
  one labelled picture; below 720px only the document), then What it does (six cards), How a
  turn works (four numbered steps), Built for schools, seven Questions as `<details>`, a closing
  call and a plain footer ("ELM for teachers, <year>"). Every word is data in `content.ts`;
  sections in `sections.tsx`; sizes, Lexend headings and motion in `landing.css`; colours as
  `--landing-*` tokens in `theme.css` (light and dark); `lib/utils.ts` tells tailwind-merge the
  new sizes and shadows. The look follows a reference page Sam shared (warm paper, centred hero
  with an italic serif half title, soft glows, borderless cards, a dark band for pupils' data);
  none of its code, words, pictures or fonts were taken.
- **`/start`** (`StartScreen.tsx`, Sam, 15 Nov) holds the invite and access code forms and
  "Already signed up? Sign in"; more providers belong here, not on `/`. `/signin` and `/join` go
  back to `/start`.
- Claims come only from the docs: no testimonials, figures or logos. ELM is named in text only.
  The page says new or blank docs take changes straight in and other changes come as
  suggestions unless the teacher chose Editing; do not shorten it to "every change is a
  suggestion". Screenshots from before the round-1 wording were in `docs/changes/68-landing/`
  (in git history before this fold); newer ones are on the PRs. Left: the information sheet
  (URL in `config/sign-in-notice.json`) is not linked.
- **Sign-in notice** (#76): its first paragraph now says "Please do not upload identifiable pupil
  data into the system.", version `2026-11-15`, so everyone sees it again at next sign-in.
- **Landing copy** (#81): the pupils card now reads "We provide a way for you to store key
  information about your pupils' accessibility needs without revealing identifiable
  information." (Sam's choice; "we don't store pupils' names" is not true today, as a typed name is
  stored). "Keep your link to yourself" and "do not upload pupils' work" are gone;
  `content.test.ts` checks for such instructions. If the upload guidance is still wanted, it
  belongs where teachers upload.

## 4a22. The make kit screen removed (14 Nov 2026, #52)

Sam ended the make kit experiment. The whole kit is on branch `archive/make-kit` (34afd93). Gone
from the client: `packages/client/src/make/`, the `/make/:token` route (now the unknown-page
screen), its stylesheet, the `make`, `makeDesign` and `participantNoOpen` endpoints,
`createNoopLogger`, the admin's kit links and `e2e/make.spec.ts`. Later items: the server's make
routes, store, limit and `open=0` (M2, #53); `components/slots/` and where it is drawn (M3, #54);
the shared make types, the lint rule and the docs' make lines (M4, #55). Section 4a above
describes the kit as it was.

## 4a23. Deployment settings (15 to 21 Nov 2026, #73, #89, #95, #96)

- **Sign-in variables.** Google reads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only; the old
  `AUTH_GOOGLE_*` are not read (rename them in a local `.env`). Microsoft reads
  `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`, falling back to the deprecated
  `AUTH_MICROSOFT_CLIENT_*`, which Production still has: rename them on Vercel, then drop the
  fallback. The pairs are never mixed (either new name set means the new pair must be whole);
  the fallback lives only in `env.ts` (`microsoftClient`). No warning is logged for old names.
  `AUTH_MICROSOFT_TENANT` and `AUTH_OPEN_MICROSOFT_TENANTS` keep their names.
- **One place for deployment facts** (#95). Only `env.ts` reads `process.env`; only it and
  `env/vercel.ts` read Vercel's variables. New: `TRUST_PROXY` (whether the first
  `X-Forwarded-For` entry is the visitor, for the wrong-code limit; on where `VERCEL=1`),
  `FUNCTION_LIMIT_MS` (the judge is skipped when too little time is left; 300000) and the worked
  out `LIBRARY_BYPASS_SECRET` (replacing `LIBRARY_URL_FROM_VERCEL`; `env.ts` sets it only when
  `LIBRARY_URL` is unset and `vercelLibraryUrl` works out the address). `PUBLIC_BASE_URL` stays the
  public address; on Kubernetes set it and `LIBRARY_URL`, `TRUST_PROXY=true` and
  `FUNCTION_LIMIT_MS` to the ingress timeout.
- **Migrations as a command** (#96). `MIGRATE_ON_START` (on unless `false`, `0`, `no` or `off`);
  Vercel sets nothing, so it still migrates on each cold start. `node
  packages/server/dist/migrate.js` (dev: `pnpm --filter @edw/server migrate`) applies pending
  migrations and exits 0 or 1; it reads `loadEnv`, so it needs `ADMIN_PASSWORD` like the server.
  `migrate.ts` has no main-module check, so it runs however Node starts it. `GET
  /api/health/ready` answers 200 when the database answers and nothing is pending, else 503 with
  `reason` `database`, `migrations` or `schema` (with a `pending` count); `/api/health` stays the
  liveness check. With migrations off on an unmigrated database the server will not start
  (`recordConfigVersions`), so K3 runs the Job first and lets readiness gate traffic. `loadEnv`
  spins on a `file:` URL under `/proc`; not a real setting, left alone.

## 4a24. Plugin platform, runner side (21 Nov 2026, #101, #102, #109)

`library/` only (plus one `includeFiles` line in `vercel.json`); the app still calls the old
`/api` and `/mcp`, so nothing a teacher sees changes. Design: `docs/plugin-platform.md` sections
9, 10 and 12. Details are in `library/README.md` (Plugins, Addresses).

- **Manifest v1 and loader** (#101): `library/src/plugin/manifest.ts` (`parseManifest`,
  `TOOL_KINDS`, setting types and effects), cases as data in `manifest.cases.json`, `load.ts`
  (`buildPlugin`, `loadPlugin`), `hash.ts` (`treeHash` over every non-dot file, so plugins are
  text only), `bundled.ts` (reads `library/plugins/*`, placing collections from
  `library/collections/<id>`). `tool-kinds.test.ts` checks `TOOL_KINDS` against `server/api.ts`.
  Pedagogy is the first plugin (`library/plugins/pedagogy/`, `elm/pedagogy` 0.1.0); its
  collection version is pinned to the collection's own.
- Manifest choices: `look_up`, `checklist` and `template` are refused until their kinds exist;
  documents tools ask for a documents collection; a tool with no `collection` is on for every
  collection of its kind; effects take fixed setting types; options are `{ value, label }`;
  nested collection folders, a tool twice on one collection, and semver `+build` are refused.
  Pedagogy's minimum rating runs `any`, `practitioner_wisdom`, `emerging`, `moderate`, `strong`:
  R3 applies it and should confirm the order.
- **Addresses** (#102, `plugin/store.ts`, `plugin/routes.ts`): `GET /p/<owner>/<name>[@<ver>]`,
  `POST .../api/collections/<c>/<tool>` (the old answer plus `plugin: { id, version, hash }`) and
  `.../mcp` with the plugin's tools only (`list_collections` kept, listing the plugin's own). No
  version means the highest. The plugin block is on every answer once the plugin is known, errors
  included. `@` may be `%40`. A plugin that fails to load gives an empty store marked unavailable
  and every `/p/` address answers 503 (`loadPluginStoreSafely`); the old routes are unaffected.
  The pedagogy collection is held twice for now.
- **Operation check** (#109): `library/src/server/api.ts` `isOperation` uses `Object.hasOwn`, so
  `/api/collections/<c>/constructor` no longer passes.
- Left: R3 applies `Plugin-Settings` and a settings hash; published versions join the store;
  per-plugin keys (P4) replace `LIBRARY_TOKEN`; moving `library/collections/pedagogy-scotland`
  into the plugin folder (1 point, the `includeFiles` line is in place).

## 4b. Styling (2 Nov 2026)

Tailwind v4 with one theme file; see docs/STYLING.md. Every colour, size and radius is a
token in `client/src/styles/theme.css`, in light and dark (System by default, with a choice
in the account menu). Classes name scale steps, never bracketed values. Shared pieces in
shadcn/ui's form live in `client/src/components/ui`. Only content React does not draw
(the document, Markdown replies) and a few cross-element rules are still plain CSS.

## 4c. Page breaks and the Word preview (3 Nov 2026)

A `page_break` block (toolbar, "/" menu, Ctrl/Cmd+Enter) is written to Word as a real page
break and read back on upload. The eye button in the doc header opens "Preview in Word": the
same file Download makes (A4, 2.54 cm margins), drawn by `docx-preview` and laid out into pages
by `client/src/export/paginate.ts`, which docx-preview does not do. Only forced breaks are
stored; the other page ends are worked out each time and can be a line or two off Word's.
Opening it logs a `doc_preview` event with the page count; scrolling it logs `preview_scroll` (doc, position, and how far it can scroll), from 12 Nov 2026. It is a dialog outside the panes, so `scroll` never saw it.

## 4d. Document look and pictures (3 Nov 2026)

- Each doc can have a font (Sans: Lexend, Calibri, Arial, OpenDyslexic (Comic Sans was back on 5 Nov, then taken off again on 12 Nov: a past study condition); Serif: Georgia, Cambria, Times New Roman; Century Gothic and Verdana are still read for older docs but no longer offered; where the machine lacks them they draw in Arimo, in the editor and the Word preview (`components/wordPreviewFonts.css`, `wordPreviewFonts.test.ts` fails if a `DocFont` has no preview face), and the layout check scales Arimo by 1.1 and 1.15 for them, so a line may fit a little more than in Word) and a pale page colour, set from the toolbar's Document group (`editor/DocStyleControls.tsx`, `editor/docStyle.ts`). They are stored on the doc (`docs.style`, migration 0016; the `doc_style` command and event) and written to Word as the theme fonts and page background. Lexend and the free twins of the Word fonts, with the same letter widths (Carlito, Arimo, Gelasio, Caladea, Tinos; for Comic Sans, Comic Neue, which looks like it but has other letter widths), are bundled with the app (`@fontsource/*`, `styles/index.css`); the editor uses the Word font where the device has it and the twin otherwise, so text wraps and pages break as in Word. With text selected, the Font menu sets that text's font instead (the `textFont` mark, `<span data-font="georgia">` in block content, a run font in Word; the system prompts tell the model to keep it). A Word upload does not read run fonts back yet.
- Pictures can be SVG: uploaded (always to the server, which cleans them; never straight to the bucket) or drawn by the assistant, which writes an image block's content as an SVG (both prompts say how). `server/src/gateway/drawings.ts` cleans each drawing (`shared/src/svg.ts`), saves it as an asset and rewrites the block to `![alt](asset:id)`; a drawing that cannot be kept is dropped as `invalid_image`. SVGs from the database are served with a sandboxing CSP.
- Pictures from ARASAAC (6 Nov): in agent mode the assistant looks first with `search_pictures` (`server/src/pictures/arasaac.ts`: exact matches, topped up by the looser search, at most 4) and puts the best as `![alt](arasaac:<id>)`; `gateway/pictures.ts` fetches it before the turn's transaction and saves it as a PNG asset. It draws an SVG only when nothing fits. The others found are kept with the turn (`pictures` on the stored turn and the reply) and shown in a row above the message box (`client/src/components/PictureChoices.tsx`) while the block is a suggestion; a click goes to `POST /pictures/choose`, which puts that picture in as the teacher's edit (accepting the block) and logs `picture_choose`. Thumbnails load from static.arasaac.org with no referrer. Licence CC BY-NC-SA: credited under the row only, not in the document or the Word file. Evals in `evals/pictures.eval.ts`, not run yet.
- The documents are in the sidebar under their chats: the open chat lists its docs under it; other chats with docs show a doc icon that names them on hover (`ChatItem` in `components/ThreadSidebar.tsx`). The doc header has no Documents menu. A project's chats nest under the project when it is open (its page or one of its chats): Project › Chat › Doc. In a project chat only the chat is highlighted. A click on the open chat, or on the project whose page is open, folds or unfolds what is under it; opening another unfolds everything again. The make kit's sidebar is the same (its demo's Similes chat is in P7 Literacy, to show Project › Chat › Doc); its old Docs tree and new-project preview are gone. A doc's "…" (on hover) → Delete → Yes deletes it: the `doc_delete` command and event; the row is kept with `docs.deleted_at` (migration 0017) and left out of the canvas, the model and the editor, but the research export still has it (`snapshot(…, { withDeleted: true })`). Deleting the open doc opens the chat's newest other doc, or a blank one if none is left. The sidebar no longer swaps to a project view with breadcrumbs, instructions and context; those are on the project's page.
- The sidebar (200 to 440 px) and the comments column (240 to 560 px) can be resized from their edges, remembered per browser.
- Narrow windows (5 Nov): the sidebar has no closed rail; closed, it is opened from the header beside it (with New chat). Below 1000px the sidebar and comments are drawers over the panes, closed to start and not remembered (the model's comments do not open the drawer). Below 820px the document sits over the chat, a third of the height to start, with a line to drag (remembered as `edw.chatShare`). The screen is the visible height (`useAppHeight`), so a phone's keyboard shrinks it rather than covering the chat. `e2e/layout.spec.ts` checks 390, 900 and 1200px; not tried on a real phone or iOS Safari.

## 4a14. Editing, Suggesting and Track changes; new docs go straight in (12 Nov 2026, branch `development`)

Sam asked for three modes under the chat box, and for a new or copied doc not to arrive as
suggestions.

- **Three modes** (`components/EditModeMenu.tsx`, `state/assistantMode.ts`, remembered per
  browser, Suggesting by default). The server still knows two (`edit_mode`): Suggesting and Track
  changes are both `suggest`, and differ only in the look, set on the workspace as
  `data-suggest-view` and drawn in `editor/suggestions.css`. **Suggesting**: only the words added
  show, in green and not underlined, so the doc reads as it would accepted; words taken out are
  hidden and named on the card, with a thin mark where words go with nothing in their place
  (`sg-del-only`, `trackChanges.ts`); a block to delete is faded and struck through. **Track
  changes**: the old look, with words added and taken out both in red (`--track`). Editing has
  the Suggesting look for any earlier suggestion still waiting. Anything that draws the editor
  outside the workspace (the replay) keeps the old green and orange.
- **A doc the assistant makes or copies goes straight in** (`shared/src/canvas/newDocs.ts`,
  `blocks/service.ts`), in Suggesting mode too: its blocks and style are taken in as the
  assistant's revisions, and are not cards. The teacher's own docs, even an empty one, still get
  suggestions. The prompt and `edit_document` no longer say a copy comes in as suggestions.
- **So does a blank doc** (Sam, 13 Nov), in Suggesting mode, judged per doc at the commit:
  `isBlankDoc` (`newDocs.ts`) is true when every visible block is empty text (white space counts
  as empty), with no picture, table, divider, page break, waiting suggestion or waiting suggested
  style; the name, font and page colour do not count, and a doc with no blocks is blank.
  `applyTurn` reads the chat's blank docs inside the transaction and takes in what the turn put
  in them, style changes included; if the teacher's typing reached the server first, they get
  suggestions. When the open doc is blank as the turn begins, the turn's prompt gains
  `BLANK_DOC_NOTE` (`gateway/editMode.ts`). The note and the commit can disagree (typing during
  the turn, a doc emptied during it, a blank doc that is not the open one), so the reply may
  wrongly ask for, or leave out, an accept. Spyglass still goes by the teacher's mode. The mock
  says "I have made the page pale green." in a blank doc, and drafts its worksheet into a doc with
  text when asked to "write" or "draft"; older tests type a line first (`typeLine` in
  `server/src/test-helpers.ts`). Tests: `newDocs.test.ts`, `gateway/blankDoc.test.ts`, a test in
  `e2e/core.spec.ts`, and the live integration test.
- **Research data**: optional `chat_prompt.suggest_view` (`inline` or `track`, Suggesting turns
  only); `proposal_shown.block_ids` leaves out what went straight in (a new doc's blocks are still
  in `doc_ids`), and `style_doc_ids` has only styles still waiting. Optional
  `proposal_shown.blank_doc_ids` (Sam, 13 Nov) names the blank docs the turn put something in:
  analysis of accept rates should read it, since such a turn logs `block_ids: []` and no
  `proposal_accept`; `analysis/` does not read it yet. Details in `docs/dev-spec.md`.
- **Tests**: `newDocs.test.ts`, `suggestView.test.ts`, `trackChanges.test.tsx`,
  `e2e/suggestModes.spec.ts` (the mock now answers "shorter" on an @model comment by taking the
  first word out). The copy test now expects a copy to be live.
- **Not done**: evals not run (no keys in the sandbox), though the prompt changed.

## 5. Not verified

- The e2e tests (`e2e/`) cover the core flow, @model comments, lists, layout, Customise and the make kit. Not covered in a browser test: the Stop button and queued messages (both tried by hand on 9 Nov), and Editing mode with typing during a turn (unit and screen tests only).
- Not tried on a real phone or iOS Safari.
- `/library` and the protection bypass on a Vercel preview.

## 6. Next, roughly in Sam's order of interest

**Next (8 Nov 2026): teachers make, test and publish plugins, from a project (`docs/plugins.md`, T.1 to T.7; T.1 is teacher skills, the old P.3).** Before that: push and review the plugins branch, deploy the library server and set `LIBRARY_URL`, and run the list migration (L.4) and evals on Turso. The list below is the longer-term backlog.


1. A replace within a block (exact phrase, must match exactly once, otherwise an error to the model): smaller and easier-to-review suggestions. This is the top recommendation from the deep-research report Sam pasted on 30 Oct.
2. **Reference uploads (R2):** convert once, give each file a catalogue card, then search and page-read tools, with no embedding index. Uploads already go to an R2 bucket (`server/src/assets/`).
3. **Web search** as a tool, with its output cut at `max_read_chars`.
4. **More skills**, written by Sam (differentiation, accessibility, assessment design…). The format is ready.
5. **Autonomy and conditions as a study variable** (suggest only vs suggest and comment): needs before/after tool hooks or a per-condition tool and prompt set.
6. **Cost:** the reply after edits is a separate call. Letting the model reply inside `edit_document` and end the turn (`terminate`) would save it.
7. Smaller: a document version on each proposal, clearing large tool results once used, a `kind` on comments, (queuing messages sent while the assistant is working: done 9 Nov, 4a5).
