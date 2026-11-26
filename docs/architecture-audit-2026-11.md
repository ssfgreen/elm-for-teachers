# Architecture audit (4 Nov 2026)

What was checked: how well the three products (editor, research instrument, make kit) are kept
apart, whether the rules in `ARCHITECTURE.md` actually hold, and how to split the large files. Read
at commit `4cdc9e6`, unit suites green (shared 84, server 254, client 284, evals 8 tests; one lint
warning). The live integration test was failing, unnoticed, since the 3 Nov sidebar change; fixed
in 6d666ac. Line numbers are from that commit. Sizes are story points, as in `PLAN.md`.

## Summary

- **The core is sound.** Tools never touch the database; every block change on the server goes
  through `blocks/service.ts` and the shared canvas model; events have one writer; `shared` never
  imports `server`; no import cycles between server modules.
- **The make kit is the most tangled product.** It is wired into about ten places on the server and
  nine production client files, and in two places it changes how production components behave.
  Removing or changing it means touching the editor and the export.
- **The research data format is defined twice.** The bundle's file list in `shared/src/bundle.ts`
  is used by nothing; the export builds its own list and its test pins a third copy.
- **Two files carry most of the risk.** `client/src/screens/WorkspaceScreen.tsx` (one component,
  22 `useState`s, about 25 logging calls) and `server/src/gateway/service.ts` (limits, history,
  stop, the agent turn, the single turn and the commit). Almost every feature edits one of them.

## 1. The seams between the three products

### Make kit → editor (client)

Nine production files import from `make/`, all through `make/slots.tsx` or `make/inlineSlot.tsx`.
Those two files depend on nothing but `@edw/shared` and `lib/utils`, and their slots render nothing
outside the kit, so most of this is harmless. The parts that are not:

- `components/ExportMenu.tsx:30-35`: kit state forces the Export menu open through an effect. The
  only place the kit drives production state.
- `components/DocHeader.tsx:38-55` changes its classes in the kit; `ThreadSidebar.tsx:325,404`
  renders an extra place only in the kit.
- The kit's feedback layer finds parts by class name (`thread-item`, `composer-bar`). Renaming a
  class silently breaks feedback on that part.
- `make/MakeKitScreen.tsx:398-404` passes a do-nothing logger cast `as unknown as EventLogger`, so a
  new logger method is never type-checked there.
- `make/MakeApp.tsx:13` imports the whole `ParticipantApp` for one class name.

### Make kit → server and export

Removing the kit today means editing `app.ts`, `export/bundle.ts` (imports `loadBoard` from
`make/routes.ts`), `sessions/service.ts` (deletes `make_boards`), `shared/src/bundle.ts`,
`shared/src/events/make.ts` (the `make_action` and `make_design` payloads) and their `body(...)`
entries in `shared/src/events.ts`, `export.test.ts`, as well as the `make/`
folders. `make/routes.ts` also counts its rate limit with raw SQL on `events`, calls the model
provider directly (so design calls are not recorded as gateway calls, unlike every other model
call), and borrows helpers from `blocks/routes` and `sessions/routes`.

### Research instrument

- **Server:** one seam, the `EventStore` interface (`deps.ts:86-99`), and `events/store.ts` is the
  only `INSERT INTO events`. But three modules read `events` with their own SQL
  (`make/routes.ts:57`, `gateway/history.ts:54`, `sessions/service.ts:71`), and `export/bundle.ts`
  reads five other modules' tables directly.
- **Client:** the logger is passed in as a prop (good: no singleton), but calls are scattered.
  `WorkspaceScreen.tsx` alone has about 25, half of them the same error boilerplate.
  `editor/Canvas.tsx:361-372` holds block events back while a command is in flight. That is logic
  the research data depends on, sitting inside a UI effect with no test of its own.
- **Bundle shape:** `shared/src/bundle.ts:21` declares `BUNDLE_FILES`; nothing imports it.
  `export/bundle.ts:87-104` builds its own map, and `export.test.ts:68-71` asserts a hand-written
  list. Three copies that can drift.

### The assistant's write path

Confirmed: no tool imports the database; `tools/preview.ts` applies operations only to an in-memory
copy. The one write outside the turn's transaction is `open_reference_as_doc`
(`gateway/service.ts:479-487`, through `canvas.structural`): the copied doc stays even if the turn is
then stopped or fails, and there is no stop check before it. That is by design (it is the teacher's
own file). **Decided (Sam, 4 Nov): the copy stays.**

## 2. Splitting the large files

Each split is structural only: no behaviour change, in its own commit, tests green before and after.
Pure functions come out first, because they can be tested without React or a database.

| File | Lines | Split into |
| --- | --- | --- |
| `client/screens/WorkspaceScreen.tsx` | 1055 | Hooks: `useWorkspaceData` (snapshot, threads, open, structural changes, `keepNewerTyping`), `useDocComments`, `useProjects`, `useDocActions` (new, duplicate, delete, export, preview, upload, rename, style), `useThreadActions`, `useModelChoice`, `useWorkspaceLayout`. Views: `ChatColumn`, `DocColumn`. |
| `client/make/MakeKitScreen.tsx` | 978 | `make/boardOps.ts` (pure place, move, remove, feedback, each returning `{ board, action }`), `useBoardState`, `ZoneView.tsx` (with `PlacedCard`, pill, ghost), `Tray.tsx`, `Describe.tsx`. |
| `server/gateway/service.ts` | 834 | `turn-types.ts`, `stop.ts`, `limits.ts`, `history-plan.ts` (with `summary.ts`), `commit.ts` (the turn transaction, 613-705), `agent-turn.ts`, `single-turn.ts`; `service.ts` becomes a thin orchestrator. `openReference` becomes a canvas or references service method. |
| `client/editor/Canvas.tsx` | 743 | `useSlashMenu`, `useSyncMachine` (batcher, queue, gated logger, flush), `editor/reconcile.ts` (pure), `useToolbarCommands`, `useAskAndComment`, `editor/canvasUtils.ts`. |
| `shared/canvas.ts` | 714 | `canvas/` folder: `state.ts`, `docs.ts`, `blocks.ts`, `proposals.ts`, `apply.ts`, `index.ts` re-exporting the same API; `toMarkdown` to `markdown.ts`. |
| `client/make/parts.tsx` | 639 | `activeTime.ts`; the 40-case `Leaf` switch becomes a registry of components grouped by family. |
| `client/screens/ProjectScreens.tsx` | 601 | One file per component under `screens/project/`, plus `useReferences`. |
| `shared/make.ts` | 575 | `make/schema.ts`, `make/design-prompt.ts`, `make/parse-design.ts`. |
| `client/components/ThreadSidebar.tsx` | 513 | `sidebar/ChatItem.tsx`, `DocRow.tsx`, `AccountMenu.tsx`, `tree.ts` (pure). |
| `client/components/CommentsPanel.tsx` | 480 | `comments/threads.ts` (pure), `Composer.tsx` with `useMentionMenu`, `CommentItem.tsx`. |
| `shared/events.ts` | 457 | Done (#48), as built: family files `events/editor.ts`, `comments.ts`, `make.ts`, `session.ts`, with `chat.ts` and `docs.ts` extended; the union stays in `events.ts` (now 201 lines). Same exports. |
| `server/gateway/elm.ts` | 428 | `elm-parse.ts`, `elm-chat.ts`, `elm-responses.ts`. |
| `server/env.ts` | 249 | Done (#120): one file per settings group under `env/` (`database.ts`, `model.ts`, `admin.ts`, `site.ts`, `bucket.ts`, `library.ts`, `jobs.ts`, `vercel.ts`, `sign-in.ts`, with `parse.ts` and `repo-root.ts`); `env.ts` joins them (76 lines). Same exports. |

## 3. Smaller tangles

- **editor ↔ components cycle:** `IconButton` lives in `editor/Toolbar.tsx` and four components
  import it; it belongs in `components/ui`.
- **Canvas types in the wrong place:** `api/` and `state/` import data types from `editor/types`;
  they belong in `state/` or `@edw/shared`. `api/participant.ts` imports file conversion from
  `import/`.
- ✓ **Route modules used as helper libraries:** `blocks/routes.ts` (`Envelope`, `publicBlock`) and
  `sessions/routes.ts` (`parseOr400`) are imported by most other route modules; move them to
  `server/src/http/`. Done (#112): `http/request.ts` (`Envelope`, `parseOr400`) and `http/views.ts`
  (`publicBlock`, `interactionsActive`, `sessionView`).
- **`gateway/service.ts` builds its own stores** (`createCommentStore`, `createProjectService`)
  and casts to the concrete `CanvasServiceImpl`, rather than taking them from `deps`. This makes it
  harder to test alone.

## 4. Recommended order

Fix the seams first, then split the files. The seams protect the research data and the products from
each other; the splits make every later feature cheaper.

| # | Work | Points | Why first |
| --- | --- | --- | --- |
| 1 | ✓ Bundle shape in one place: `export/bundle.ts` and its test both use `BUNDLE_FILES` | 1 | Protects the research data format; tiny |
| 2 | ✓ Gated logger out of `Canvas.tsx` into `events/gatedLogger.ts`, with tests; `createNoopLogger()` for the kit | 2 | Research correctness logic gets a test |
| 3 | ✓ Slots become a generic extension point (`components/slots/`): production never imports `make/`; kit targets parts by `data-make-part` attributes, not class names; the Export menu opened through the slot API | 3 | Make kit stops reaching into editor behaviour |
| 4 | ✓ Make kit on the server: `make/store.ts`, its events counted through `EventStore`, design calls recorded like other model calls, the bundle and session delete take contributions instead of importing make | 3 | Kit becomes removable by deleting its folders |
| 5 | ✓ Split `gateway/service.ts` (commit, limits, stop, history, turns) | 5 | The assistant's riskiest file |
| 6 | ✓ Split `WorkspaceScreen.tsx`, one hook per commit (1055 to 336 lines by 9 Nov) | 8 (split into 2 to 3 sessions) | The editor's riskiest file |
| 7 | ✓ Split `Canvas.tsx` and `shared/canvas.ts` (`Canvas.tsx` 743 to about 300; `shared/canvas/` done) | 5 | |
| 8 | The rest of section 2 and section 3, opportunistically: split a file when a feature next touches it | | |

Progress is ticked in the table as each item lands.

How 1 to 4 landed (4 Nov), where it differs from the plan above:

- **3:** the slots moved to `client/src/components/slots/` and a lint rule stops editor code importing
  `make/`. The feedback layer still finds parts by class name, but those names are now one exported
  list with a test that each is on the board; it found three already dead, now removed. The Export
  menu and the doc header still read the slot context: that is the extension point's API, not the
  kit reaching in, so they stay.
- **4:** `make/store.ts` holds the board's SQL and the export reads it from there; the design limit
  counts through `EventStore.countSince`. Not done, on purpose: a registry for bundle files and session
  deletes (one central list is the safer way to be sure a delete is complete), and recording design
  calls as gateway calls (`gateway_calls` needs a thread; they are logged as `make_design` events with
  tokens, as reference summaries are). Items 6 onwards are each best done in a fresh
session, briefed by this document.

How 5 landed (4 Nov), in five structural commits: `service.ts` went from 834 lines to 157 and now
only checks and prepares the turn (thread, doc, model, limits, comment thread, anchor, attachments,
the prompt event, the history). The rest is `turn-types.ts`, `stop.ts`, `limits.ts`, `calls.ts`
(the gateway log's cache and reasoning counts), `history-plan.ts`, `view.ts` (`workingView`),
`commit.ts`, `agent-turn.ts` and `single-turn.ts`, none over 170 lines. The commit takes one
`CommitInput` object instead of seven positional arguments. `openReference` became
`CanvasServiceImpl.openReference`, still outside the turn's transaction as decided. Not done: the
service still builds its own comment store and project service (section 3); that is item 8.

Method: two read-only agents audited the client and the server and shared packages; the key claims
(the unused `BUNDLE_FILES`, the Export menu effect, the logger cast, the reference copy outside the
transaction) were then checked by hand. A file-level cycle tool (madge) was not run.

## 5. For agents, 9 Nov 2026

A second, shorter audit, asking how safely an agent can change the code. Method: two read-only
surveys of implicit state machines (client; server and shared), one read-only audit of docs,
discoverability and feedback loops, then each claim checked by hand before acting.

**What cost the most.** State with several owners, and rules that live in one file and are
assumed in another (the chat's turn, who owns a block's text, the preview, sync recovery). Unit
tests were green while real bugs stood; only a browser, and repeating one test 20 to 30 times,
found the timing ones. And two e2e tests red on `main` (one always, one 1 in 10) had taught
everyone to ignore a red run.

**Done on 9 Nov:** the bugs and changes in `HANDOVER.md` 4a5; `docs/client-state.md` (owners and
the rules between them); the e2e suite green (16 of 16); lint fails on warnings; `pnpm sizes`
lists test files over 400 lines; stale claims in `HANDOVER.md` and `ARCHITECTURE.md` corrected;
four unused exports removed; `hasWaitingSuggestion` in place of four copies.

**Next, cheapest first:**

| # | Work | Size | Note |
| --- | --- | --- | --- |
| 1 | Who owns a block's text is still decided in five places (`reconcile.ts`, `useCanvasWrites.ts`, `batcher.ts`, `canvasState.applyLocalEdit`, `Canvas.tsx`'s deferred reconcile). One pure module (`state/textOwnership.ts`) with a table of tests. | Medium | Also closes the gap left on 9 Nov: a non-streamed reply (an @model comment's answer in Editing mode) to a plain block the editor holds is not shown until reload. |
| 2 | ✓ `onReply` (`useTurnReply`) and `onSyncError` (`useSyncRecovery`) out of `WorkspaceScreen.tsx` | Small | Structural |
| 3 | ✓ `useSyncMachine` out of `Canvas.tsx` | Medium | Structural |
| 4 | `IconButton` into `components/ui`; `gateway/service.ts` takes its comment store and project service from `deps` (section 3) | Small | Still true on 9 Nov |
| 5 | CI runs e2e with `retries: 1` (`playwright.config.ts`), which hides a 1 in 10 failure | Small | Sam's call: off, or report retried tests |
| 6 | `dev-spec.md` lists 17 of the 49 event kinds; 9 are documented nowhere | Small to medium | Sam's call: is it the analysis reference? |
| 7 | The research-data items in `HANDOVER.md` 4a5, "For Sam to decide" | | Sam's call |

