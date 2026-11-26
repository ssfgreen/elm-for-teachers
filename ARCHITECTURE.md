# Architecture

A map of the system: what the parts are, how a change flows through them, and the rules that hold it
together. It changes rarely. What is wrong with the code today, and the plan to fix it, is in
[docs/architecture-audit-2026-11.md](docs/architecture-audit-2026-11.md). Feature decisions are in
`docs/PLAN.md` and the latest state in `docs/HANDOVER.md`.

Two sections: **Current** is what is built in `development`; **Planned** is what is agreed and
not built yet, one line each with a link. A PR that builds something under Planned moves its line
to Current.

## Current

### Three products on one core

```
            teachers                         researchers                  teachers as designers
               │                                  │                                │
   ┌───────────▼───────────┐        ┌─────────────▼────────────┐       ┌───────────▼───────────┐
   │ 1. Editor  /s/:token  │        │ 2. Research instrument   │       │ 3. Make kit /make/:tok│
   │ docs, chat, comments, │──logs─▶│ events, config hashes,   │◀─logs─│ a board over a fake   │
   │ projects, references  │        │ export bundle (/admin)   │       │ workspace + feedback  │
   └───────────┬───────────┘        └─────────────▲────────────┘       └───────────┬───────────┘
               │                                  │                                │ renders the real
               ▼                                  │                                ▼ editor screens
   ┌──────────────────────────────────────────────┴────────────────────────────────────────────┐
   │ Core: the canvas model (shared/src/canvas*) · the assistant (server/src/gateway)          │
   │       one write path (server/src/blocks/service.ts) · one event store (events/store.ts)   │
   └───────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **The editor** is what teachers use: a workspace (one secret link) holds chats; each chat owns
   its docs; each doc is an ordered list of blocks. The assistant *suggests* and the teacher
   accepts or rejects, unless the teacher sets it to Editing under the chat box.
2. **The research instrument** watches the editor. Every keystroke, prompt, suggestion decision and
   comment becomes an event; every session and model call carries the hash of the config and
   prompts it ran under; `/admin` exports a workspace as a zip bundle for analysis (`analysis/`).
3. **The make kit** lets teachers propose features: it renders the real editor on an in-memory
   workspace, with drop zones (`<MakeSlot>`) inside the editor's components, and saves a board.
   It is being removed (Sam, 14 Nov 2026; archived on `archive/make-kit`): its screen went in #52,
   its server routes, editor slots and shared code follow in #53 to #55.

The editor and the research instrument are staying. The aim is that each can change, or break, without taking the others with it.

### Packages

```
shared  ◀── server ◀── evals
   ▲
   └────── client
```

| Package | What it holds | Notes |
| --- | --- | --- |
| `packages/shared` | zod schemas and types, the canvas model, event types, the bundle shape, config loading and hashing (`src/node/`) | Pure TypeScript, no I/O outside `src/node/`. Server and evals import its **built** `dist/`, so rebuild shared after changing it (`pnpm typecheck` and `pnpm check` do). |
| `packages/server` | Fastify API, libSQL (local file or Turso), the assistant, export | One folder per module, one line each under "Server modules" below. Interfaces between modules are in `deps.ts`; `app.ts` wires them. Where it runs: [DEPLOY.md](DEPLOY.md) section 1. |
| `packages/client` | React, Tiptap editor, the three screens | `screens/` (workspace, projects, admin, and `landing/`: the front door: `/` says what the tool is and has one action, Sign up, to `/signup` (with Log in, or Your workspace, top right in its nav, to `/login`); both are `WhoScreen.tsx`, "I am a teacher" or "I am a pupil" (#224, targets in its `WHO_TARGETS`): a teacher signing up goes to `/start`, where an invite code goes on to `/join/:code`, an access code opens a workspace, and Log in goes to `/signin`, which signs in through the server's provider links; a teacher logging in goes to `/signin`, headed "Log in"; a pupil goes to `/r/join` to sign up or `/r/login` to log in), `pupil/` (#245: `/r/join` takes the class code, then a provider or the teacher's username and password (`JoinScreen.tsx`, `PasswordForm.tsx`, `loginApi.ts`); `/r/login` the same with no code (`LoginScreen.tsx`); `/r`, the signed-in pupil's page, says "You are Pupil 3 in 8B" and sends a signed-out pupil on to one of the two (`pupilErrorPage`); its own calls in `pupilApi.ts`), `reader/` (#213: the pupil's readings listed on `/r` and one reading on `/r/readings/:readingId`, drawn from the frozen copy without Tiptap (`ReadingBlocks.tsx`, reading blocks through shared `readerText.ts`), with the pupil's highlights, and asks about a selection or a highlight with the reading's prompt buttons (#236: `asks.ts` says what is offered, `useAsk.ts` holds the answer and its follow-ups, `AnswerPanel.tsx` draws them as plain text); calls `/api/pupil/readings` only, no event logger), `editor/` (Tiptap canvas and sync), `components/`, `events/` (logger and trackers), `export/` and `import/` (Word, PDF, PowerPoint, all in the browser). A workspace opens two ways into the same `screens/WorkspaceApp.tsx`: `/s/:token` (a link) and `/w` (signed in: `screens/AccountApp.tsx` gets the token from `/api/account/workspace` and keeps it in memory only; the first-visit notice is `config/sign-in-notice.json`). Who owns which piece of state, and the rules between them: [docs/client-state.md](docs/client-state.md). |
| `packages/evals` | Live evals of the assistant against the real model | Each case gets a fresh database; deterministic judges; a baseline to compare against. Needs `.env`, costs money: run by hand (`pnpm eval`). |
| `library/` | The library server for library plugins (JSON API and MCP), and its collections | Its own package; see `library/README.md` and `docs/plugins.md`. The app never imports it: it calls it over HTTP at `LIBRARY_URL` (`server/src/plugins/library-client.ts`). Where it runs: [DEPLOY.md](DEPLOY.md) section 1. It needs `LIBRARY_TOKEN` on every call. |
| `deploy/` | The deployment files | Not a package. What is in it, and what runs where: [DEPLOY.md](DEPLOY.md) sections 1 and 13. |

### Server modules

One line per folder in `packages/server/src/`: what it does and its key files. A branch that adds
a module adds a line here.

- `access/`: the typable codes (Crockford base32, `XXXX-XXXX-XXXX`): a link workspace's access code, which `POST /api/access` turns into its token, and the shape of invite codes. `codes.ts`, `routes.ts`.
- `accounts/`: teacher accounts (one workspace each, `sessions.access = 'account'`), the admin's invites, and signing in with Google or Microsoft (OpenID Connect). `auth.ts` `requireAccount` reads the sign-in cookie and hands back the workspace token, so every other route still uses `requireParticipant`. The email, name and provider subject stay in the `accounts` and `account_invites` tables only. `store.ts`, `oidc.ts`, `providers.ts`, `policy.ts`, `cookies.ts`, `routes.ts`, `admin-routes.ts`.
- `accounts/admins.ts`: an account with `is_admin` is an admin. `requireAdmin` (`auth.ts`) takes its sign-in cookie for 12 hours after it signs in and writes only with the site's `Origin`; the admin password works locally and on a Vercel preview (the development site), never in production: Vercel production, or `DEPLOY_ENV=production` elsewhere (`deployEnv`).
- `assets/`: uploaded and drawn pictures, in the database or an S3-compatible bucket. `store.ts`, `bucket.ts`, `routes.ts`, `send.ts` (sends one picture; used by the pupil reader too).
- `budget/`: a workspace's budget, config `limits.budget_gbp` plus its £10 top-ups from /admin (`budget_topups`, no undo; each logs `budget_update`). Both checks in `gateway/limits.ts`, Usage, the chat's "£N left" and the /admin Budget column read it here. `store.ts`, `routes.ts`.
- `blocks/`: the one write path for docs and blocks. `service.ts`, `structural.ts`, `routes.ts`.
- `classes/`: schools, year groups, classes (with optional `curriculum_profile` JSON and `note_check_id`), legacy pupil table reads, a class's curriculum (with optional `standard_uri`), and library adaptations ([docs/classes.md](docs/classes.md)). `service.ts`, `pupils.ts`, `curriculum.ts`, `adaptations.ts`, `pupil-scrub.ts`.
- `comments/`: comment threads (soft deletes) and @model comments. `store.ts`, `routes.ts`.
- `content-packs/`: one-way Content Pack v1 exporter (`T3`, migration 0054). Freezes live blocks and referenced assets into deterministic zip bundles (`zip.ts`, `service.ts`, `store.ts`, `routes.ts`), serves read-only capability downloads at `GET /api/packs/:code` (302 presigned GET when bucket-backed, zip stream fallback in dev/tests, never burns codes on GET for Safe Links resilience), and schedules 7-day `expire_content_pack` cleanup jobs.
- `db/`: the libSQL client (`db/client.ts`, the only file that imports `@libsql/client`, enforced by lint), our own database types (`db/types.ts`, which every other module imports), `run` for a statement on a database handle or a transaction (`db/run.ts`, type `DbOrTx`) and the migrations (`db/migrations/`), run when the server starts, or with `MIGRATE_ON_START=false` as their own step first: `src/migrate.ts` (built as `dist/migrate.js`) and `src/migrate-cli.ts`.
- `http/`: helpers every route module shares, so no route module imports another: `request.ts` (`parseOr400`, `Envelope`), `views.ts` (`publicBlock`, `publicChanges`, `sessionView`, `interactionsActive`), `wrong-codes.ts` (the wrong-code counter for access codes, and `clientAddress`). It imports no other module folder.
- `jobs/`: slow work run outside a request (`expire_content_pack` cleanup and future background jobs). The `jobs` table (0039), claimed one copy at a time, retried with backoff and given up after a kind's attempts; run by `node dist/worker.js` (`src/worker.ts`, for Kubernetes) or Vercel's cron at `GET /api/jobs/run`, guarded by `CRON_SECRET`. `store.ts`, `kinds.ts`, `runner.ts`, `loop.ts`, `routes.ts`.
- `health/`: `GET /api/health/ready`, 200 only when the database answers and no migration is pending. `routes.ts`. (`/api/health` in `app.ts` says only that the process is up.)
- `lessons/`: teacher onboarding lesson progress (`lesson_progress`, migration 0055), keyed on `session_id` so secret-link study workspaces and signed-in accounts both work. `store.ts`, `routes.ts`.
- `events/`: the `EventStore`, the only writer to `events`, and the browser's event route. `store.ts`, `routes.ts`.
- `env/`: the settings, one file per group (`database.ts`, `model.ts`, `admin.ts`, `site.ts`, `bucket.ts`, `library.ts`, `jobs.ts`, `vercel.ts`, `sign-in.ts`), each with its variables, its part of `Env`, its checks and what it works out. `env.ts` joins them, is the only reader of `process.env`, and is what the scripts load (`dist/env.js`).
- `export/`: the research bundle. With the admin cookie its GETs take only a fetch from the site's own page (`fetchedFromSite`, docs/routes.md). `bundle.ts`, `routes.ts`, `zip.ts`, `textEvents.ts`.
- `features/`: a workspace's feature switches (`shared/src/features.ts`: classes, needs_groups, curriculum, pedagogy, preferences, spyglass, plugins, all on by default, plus legacy `pupils`, off by default), set by an admin in `/admin` (`SessionService.setFeatures`) and logged as `workspace_features_set`. `routes.ts`.
- `gateway/`: the assistant: turns, tools, the provider, limits and the budget. `service.ts`, `agent.ts`, `agent-turn.ts`, `commit.ts`, `limits.ts`, `elm.ts`, `tools/`.
- `lists/`: moving old list blocks to a block per item (PLAN.md section 6). `split.ts`, `migrate.ts`.
- `make/`: the make kit's board and its design call. `store.ts`, `routes.ts`.
- `moderation/`: pre-save zero-retention PII moderation gate (`T2`, migration 0053) for class notes and needs groups. `deterministic.ts`, `pii.ts`, `store.ts`. Records only hashes, verdicts, and category counts in `moderation_checks` — never blocked text, and strictly outside research events.
- `needs-groups/`: generic or class-assigned groups of learning needs replacing per-pupil rows (`T1`, migration 0052), gated by `features.needs_groups`. `store.ts`, `routes.ts`.
- `pedagogy/`: passes the Pedagogy screen and the curriculum picker through to the library server, over HTTP only. `routes.ts`, `call.ts`, `source.ts`.
- `pictures/`: the ARASAAC picture search. `arasaac.ts`, `routes.ts`.
- `plugins/`: plugins for a workspace, their trust levels and the library client. `service.ts`, `routes.ts`, `library-client.ts`, `grants.ts` (Ask first in a chat: the grants read and Allow, for catalogue plugins and drafts), `capped-text.ts` (reads an answer with a size cap, for the studio).
  - `plugins/drafts/`: a workspace's plugin studio drafts (#158): add (only a `<studio>/d/<code>` address at a `PLUGIN_STUDIO_URL` origin, `env/studio.ts`), list, remove, logged as `plugin_draft_add` and `plugin_draft_remove`.
- `preferences/`: the teacher's preferences for a workspace. `service.ts`, `routes.ts`.
- `projects/`: projects and their chats. `service.ts`, `routes.ts`.
- `references/`: files added as context, stored a page a row, searched and summarised. `service.ts`, `reader.ts`, `summary.ts`, `routes.ts`.
- `sessions/`: workspaces: create, list, delete (`SESSION_TABLES`), interaction logging, and replacing or closing a link workspace's link and code (`setLink`, logged as `workspace_link`; the old ones stop working). `service.ts`, `routes.ts`, `interactions.ts`.
- `study/`: seeds a study workspace's starting state (the demo class and its demo chat). `seed.ts`, `demo-chat.ts`.
- `threads/`: chats (with optional `project_id`, `class_id`, `year_group_id`, or `needs_group_id`), and naming them. `service.ts`, `title.ts`.
- `usage/`: the read-only spend by UK day for Preferences (from each call's stored `cost_gbp`; the chat counter adds up the same stored costs). `query.ts`, `routes.ts`.
- Zero-pupil CI guardrail (`zero-pupil.test.ts`): asserts no pupil/reader routes are registered and no server code writes to dormant pupil/reader tables.

### How a change flows

**The teacher types.** The editor is local-first. Tiptap edits freely; after each transaction the
client compares the doc's top-level blocks with the last state and queues block commands
(`insert`, `split`, `merge`, `delete`, `move`, `retype`) to `POST /api/sessions/:id/blocks/:command`
in the background. Content edits travel as events (`keystroke_batch`). The server validates every
command with the shared canvas model and logs it. A refused command reloads the canvas.

**The teacher asks the assistant.** `POST .../chat/stream`:

1. `gateway/service.ts` checks the turn and its limits (`limits.ts`: the workspace's budget in
   pounds, config plus top-ups (`budget/store.ts`), and its messages this hour), plans the history and
   running summary (`history-plan.ts`), and hands over to `agent-turn.ts`, which runs the agent loop
   (`gateway/agent.ts`, up to `agent.max_steps` model calls (12), and no tools after `agent.max_turn_ms`, through `gateway/elm.ts`, or `mock.ts` offline). Stop
   is in `stop.ts`; `single-turn.ts` is single mode (`"mode": "single"`, one call a message).
   Before each agent call, `limits.ts` checks the call's worst cost against saved spend plus this
   turn's own steps, so that it could not pass the budget plus `limits.budget_overrun_gbp`. Turns
   running at once each see only their own unsaved spend, so together they can pass it. The
   running summary, the Spyglass judge and single mode are costed but not checked one by one.
   Each call is saved with its cost in pounds (`cost_gbp`), at the prices in force when it was
   made; a call that may have run but came back without its counts is charged its worst cost.
   The budget, the counter under the chat box, "£N left" in the chat head and Usage on Preferences all add up those stored
   costs ([docs/model-prices.md](docs/model-prices.md)).
2. **Tools never write.** `read_document`, `edit_document`, `add_comment` and the rest return
   operations or comment drafts. (One exception: `open_reference_as_doc` copies a teacher's own
   file into the chat at once.)
3. At the end, `gateway/commit.ts` checks the operations again and commits them in **one
   transaction** through `blocks/service.ts`, which applies them with the shared canvas model as *proposals*.
4. The client shows proposals as tracked changes in the document (words added underlined, words
   taken out struck through) and as cards in the comments column, one per change, with Accept and
   Reject; a decision is a logged event the server applies. In Editing mode the commit takes the
   proposals in at once, in the same transaction.

The reply streams to the browser as NDJSON while this happens; the preview in the document is display
only and never saved.

**Researchers export.** `/admin` → export: `server/src/export/bundle.ts` gathers sessions, chats,
docs, blocks, revisions, events, model calls, comments, references, classes and the make board into
the files listed in `shared/src/bundle.ts`, with the config and prompt texts behind each hash.
Each download logs a `workspace_export` event in the workspace (so with the admin cookie it must be a fetch from the site's own page, docs/routes.md); that kind and the other
server-only ones (`shared/src/events/serverOnly.ts`) are refused from the browser's event route.
`session.json` says how the workspace is reached (`access`: link or account).
`classes.json` and the events keep only the shape of a class's pupil table; the model calls
(`gateway_calls.jsonl`) hold the rows as sent while config `pupil_rows_in_gateway_log` is `"full"`.
The data is kept. Code to take the rows out of the stored calls later is in `classes/pupil-scrub.ts`
and `gateway/scrub-routes.ts`, but it is switched off until Sam decides what removal should do
(13 Nov 2026): no route serves it and `scripts/scrub-pupil-rows.mjs` stops at once.

**An admin deletes a workspace.** `sessions/service.ts` deletes its rows from every table with a
`session_id` (`SESSION_TABLES`, children first: foreign keys are on) in one transaction, then the
route removes its files from the bucket. A new table with a `session_id` goes in that list;
`sessions/delete.test.ts` fails until it does.

### The rules that hold it together

Changing any of these is a design decision for Sam, not an implementation detail. Each says where it
lives and what currently protects it.

| Rule | Where | Protected by |
| --- | --- | --- |
| **The assistant suggests; the teacher decides.** Model changes are proposals. Tools return operations; only the turn commit writes. Its dated exceptions (Editing mode, docs the assistant makes or copies, blank docs) are in [docs/rules.md](docs/rules.md). | `gateway/tools/types.ts`, `gateway/commit.ts`, `blocks/service.ts`, `shared/src/canvas/apply.ts` (`takeTurnIn`), `shared/src/canvas/newDocs.ts` | Convention and tests |
| **One write path for docs and blocks.** Every change on the server goes through `blocks/service.ts`, which applies it with `shared/src/canvas.ts`. | `blocks/service.ts`, `shared/src/canvas.ts` | Convention and tests |
| **A chat sees only its own docs, history and summary.** | `gateway/view.ts` (`workingView`) | Tests and evals |
| **Everything is logged, under a hash.** Events go through the `EventStore` (`deps.ts`), the only writer to the `events` table; sessions and model calls carry `config_hash` and `system_prompt_hash`. Its dated exception, pupils' reader asks kept apart from research data, is in [docs/rules.md](docs/rules.md). | `events/store.ts`, `config-versions.ts` | Convention and tests |
| **The research data format is stable.** Event payloads (`shared/src/events.ts` and its family files in `shared/src/events/`) and the bundle files (`shared/src/bundle.ts`) are what analysis reads. Changing them changes what past and future data mean. | `shared/src/events.ts`, `shared/src/events/`, `shared/src/bundle.ts`, `export/` | Export tests (see the audit: the file list is pinned in two places) |
| **Migrations run against the live database before new code serves traffic.** Add, never edit, a migration; confirm before anything destructive. | `server/src/db/migrations/`, `server/src/migrate-cli.ts`, `server/src/health/routes.ts` | Convention |

Provenance stays on the server: the participant API never returns `origin`, the system prompt or
another session's token. Workspace links are secrets (no indexing, no referrer).
Every route, who may call it and its guard are in [docs/routes.md](docs/routes.md); `server/src/routes.test.ts`
fails on a route missing from it, or one whose guard lets through a caller its row rules out
(a stranger, another workspace's token, a teacher on an admin route, a cookie write from another site).

### Size and shape

Files over 400 lines are where agents lose track and where every feature collides. `pnpm sizes`
lists them, and test files over 400 lines separately (on 9 Nov: 5 source files, the largest
`client/src/screens/WorkspaceScreen.tsx` at about 760 lines, down from 1050 on 4 Nov). The working rule is in `CLAUDE.md`: split before you add. The split plan for each
large file is in the audit.

### Checks

| Command | What | When |
| --- | --- | --- |
| `pnpm check` | typecheck, lint (no warnings allowed), unit tests (all packages), size report | Before every commit |
| `pnpm build` then `pnpm e2e` | Playwright: the core flow in a real browser, mock provider | Before a push; CI always |
| `scripts/ci.sh` | Everything CI does, locally (`SKIP_E2E=1` without a browser) | Before a push |
| `pnpm eval` | Live evals against the real model | When prompts, tools or models change |

CI (`.github/workflows/ci.yml`) runs all but the evals on every push. Vercel deploys `main` on push
regardless, so a red run on `main` means fix forward at once.

## Planned

- **The move to Kubernetes**, away from Vercel and Turso: what is built and what is left is in
  [docs/kubernetes-migration.md](https://github.com/ssfgreen/epistemic-differentiation-workshop/blob/migration_to_kubernetes/docs/kubernetes-migration.md)
  on the branch `migration_to_kubernetes`.
- **The plugin milestones**, starting with the passport for pedagogy's plugin: [#103](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/103).
- **The Plugin Studio**, its own repo (`ssfgreen/education-plugin-studio`), milestone 1: [#125](https://github.com/ssfgreen/epistemic-differentiation-workshop/issues/125).
