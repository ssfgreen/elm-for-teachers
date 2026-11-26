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
- `classes/`: schools, year groups, classes, the pupil table, a class's curriculum and the library adaptations chosen for pupils ([docs/classes.md](docs/classes.md)). `service.ts`, `pupils.ts`, `curriculum.ts`, `adaptations.ts`, `pupil-scrub.ts` (switched off), `reader-settings.ts` and `reader-settings-routes.ts` (a class's pupil reader settings, #186, #195: the follow-up limit, the pupil budget and the reader's safety instruction, three nullable columns on `classes`, null read as config `reader`'s default when asked; `classSafetyInstruction` is the one place the server works out a class's instruction; carried by Copy to next year in `copy.ts`; logged as `class_reader_settings` with the figures in force, and `class_reader_safety_set` with a hash and length, never the text).
- `comments/`: comment threads (soft deletes) and @model comments. `store.ts`, `routes.ts`.
- `db/`: the libSQL client (`db/client.ts`, the only file that imports `@libsql/client`, enforced by lint), our own database types (`db/types.ts`, which every other module imports), `run` for a statement on a database handle or a transaction (`db/run.ts`, type `DbOrTx`) and the migrations (`db/migrations/`), run when the server starts, or with `MIGRATE_ON_START=false` as their own step first: `src/migrate.ts` (built as `dist/migrate.js`) and `src/migrate-cli.ts`.
- `http/`: helpers every route module shares, so no route module imports another: `request.ts` (`parseOr400`, `Envelope`), `views.ts` (`publicBlock`, `publicChanges`, `sessionView`, `interactionsActive`), `wrong-codes.ts` (the wrong-code counter shared by the access code and the class code, and `clientAddress`). It imports no other module folder.
- `jobs/`: slow work run outside a request (marking, later; nothing enqueues a job yet). The `jobs` table (0039), claimed one copy at a time, retried with backoff and given up after a kind's attempts; run by `node dist/worker.js` (`src/worker.ts`, for Kubernetes) or Vercel's cron at `GET /api/jobs/run`, guarded by `CRON_SECRET`. `store.ts`, `kinds.ts`, `runner.ts`, `loop.ts`, `routes.ts`.
- `health/`: `GET /api/health/ready`, 200 only when the database answers and no migration is pending. `routes.ts`. (`/api/health` in `app.ts` says only that the process is up.)
- `events/`: the `EventStore`, the only writer to `events`, and the browser's event route. `store.ts`, `routes.ts`.
- `env/`: the settings, one file per group (`database.ts`, `model.ts`, `admin.ts`, `site.ts`, `bucket.ts`, `library.ts`, `jobs.ts`, `vercel.ts`, `sign-in.ts`; and `pupils/env.ts`), each with its variables, its part of `Env`, its checks and what it works out. `env.ts` joins them, is the only reader of `process.env`, and is what the scripts load (`dist/env.js`).
- `export/`: the research bundle. With the admin cookie its GETs take only a fetch from the site's own page (`fetchedFromSite`, docs/routes.md). `bundle.ts`, `routes.ts`, `zip.ts`, `textEvents.ts`.
- `features/`: a workspace's feature switches (`shared/src/features.ts`: classes, curriculum, pedagogy, preferences, spyglass, plugins, all on by default, and pupils, off by default), set by an admin in the /admin Features column or the New workspace ticks (`SessionService.setFeatures`) and logged as `workspace_features_set`. `routes.ts`. A turn carries them (`PreparedTurn.features`, read in `gateway/service.ts`): what is off, the model hears nothing about (`gateway/agent-turn.ts`, `gateway/turn-plugins.ts`, `classes/context.ts`), and Spyglass off is stored hidden as `workspace_off` (`gateway/turn-checks.ts`).
- `gateway/`: the assistant: turns, tools, the provider, limits and the budget. `service.ts`, `agent.ts`, `agent-turn.ts`, `commit.ts`, `limits.ts`, `elm.ts`, `tools/`.
- `lists/`: moving old list blocks to a block per item (PLAN.md section 6). `split.ts`, `migrate.ts`.
- `make/`: the make kit's board and its design call. `store.ts`, `routes.ts`.
- `pedagogy/`: passes the Pedagogy screen and the curriculum picker through to the library server, over HTTP only. `routes.ts`, `call.ts`, `source.ts`.
- `pictures/`: the ARASAAC picture search. `arasaac.ts`, `routes.ts`.
- `plugins/`: plugins for a workspace, their trust levels and the library client. `service.ts`, `routes.ts`, `library-client.ts`, `grants.ts` (Ask first in a chat: the grants read and Allow, for catalogue plugins and drafts), `capped-text.ts` (reads an answer with a size cap, for the studio).
  - `plugins/drafts/`: a workspace's plugin studio drafts (#158): add (only a `<studio>/d/<code>` address at a `PLUGIN_STUDIO_URL` origin, `env/studio.ts`), list, remove, logged as `plugin_draft_add` and `plugin_draft_remove`. The address holds the draft's secret code: it stays on the server (only `addressOf` and `listWithAddresses` return it, for the server's own use), never in a response, event or log line. `address.ts`, `studio.ts` (reads the draft's name), `service.ts`, `routes.ts`. In a turn (#159): `runner.ts` reads the draft's manifest at its address (3 s) and calls its tools under it, with the address taken out of any error; `chat.ts` gives a turn the workspace's drafts, always Ask first (the same `plugin_grants` through `plugins/grants.ts`, keyed by the draft's id), and adds them to `GET /plugins?thread_id=` and Allow. `gateway/turn-drafts.ts` offers each as a library, or, once allowed in the chat, a pedagogy draft in place of the built-in pedagogy library; `chat_prompt` marks them `draft: true` with `content_hash` (`studio.ts` `contentHashOf`, the same as `plugin_draft_add`). The Plugins screen adds and removes them (#160: `client/src/screens/plugins/useDrafts.ts`, and `draftLink.ts` for the studio's `#add-draft=` link); the type is `PluginDraft` in `shared/src/pluginDrafts.ts`.
- `preferences/`: the teacher's preferences for a workspace. `service.ts`, `routes.ts`.
- `projects/`: projects and their chats. `service.ts`, `routes.ts`.
- `pupils/`: pupils who sign in on `/r` (#179) with the teachers' providers and `accounts/oidc.ts`, asking for `openid` only. Only the provider, subject and tenant are kept (`pupils`, `pupil_sign_ins`); their own cookie (`cookies.ts`) and guard (`auth.ts` `requirePupil`), so a pupil's sign-in opens no teacher route and a teacher's none of a pupil's. One identity is a teacher or a pupil, never both (`admit.ts`; `accounts/policy.ts` the other way). `gate.ts`: only `PUPILS=on` (`env.ts`) opens the pupil routes, and unset is off; a route that concerns a workspace also needs its `pupils` switch. Someone new signs in only with a live class code (`class-joins/`), carried through the provider in the sealed state. A pupil can also sign in with a login the teacher made (`login-routes.ts`, `POST /api/pupil/login`; the steps in `login.ts`, #231): provider `login`, subject the login's id; the class code the first time only. `tables.ts`: `PUPIL_TABLES`, every table that holds a pupil and what Remove does to it (`delete` or `keep-anonymised`; keyed by pupil or by membership), used by `forgetPupil` and by `remove.ts` (`removeMember`, #220: one pupil out of one class, in one transaction; the rest as `forgetPupil` when it was their last class); a test fails when a column naming a pupil or a membership (`pupilColumns`) is missing. A pupil's own data is not research data: none of it goes into `events`, the call log or the export. The teacher's Remove is logged as `class_pupil_remove`, with the class id only. `store.ts`, `routes.ts`.
- `class-joins/`: class codes and class members (#209). `codes.ts` (eight characters, `XXXX-XXXX`), `store.ts` (`class_codes`, one live code a class, kept plain; `class_members`, role `pupil` or `teacher_test`, at most one test member a class; `memberLabel` gives "Pupil N"), `join.ts` (whether a typed code lets a pupil in; wrong codes count in `http/wrong-codes.ts`, shared with the access code), `member.ts` (`memberOf` and `requireMember`, the one guard for routes a pupil uses inside a class: member, class not archived, `pupilsRefusal(env, workspace)`), `routes.ts` (the teacher's make, renew, close and read, the member list without the test member, and Remove). `view-as-pupil.ts` (#215): "View as pupil" makes the class's one test pupil (provider `teacher_test`, subject the class id; only this route makes one) and its member, ends the browser's earlier pupil sign-in and sets the pupil cookie; `class_view_as_pupil`, the class id only. A class never gives a number twice: the next is past both the highest held and the count of members and `removed_pupils`. Logged as `class_code_set` and `class_pupil_remove`, ids only.
- `pupil-logins/`: logins the teacher makes for pupils (#223), no name and no email. `words.ts` (a checked word list; usernames `green-otter-27`, unique site-wide, passwords `maple-acorn-418`, `node:crypto` randomness), `hash.ts` (scrypt, a salt each, constant-time compare, `dummyVerify` for an unknown username), `store.ts` (`pupil_logins`: make a batch, list a class's, find by username, mark used, wrong tries and the lock at 5, each try claimed before its password is checked so a burst cannot pass the limit), `teacher-routes.ts` (make 1 to 40, list, delete one never used, a new password for one), `regenerate.ts` (#246: the new password's hash, unlock, end the pupil's sign-ins, in one transaction; `signedIn` and the pupil sign-in's start (`startLoginSignIn` in `pupils/store.ts`) each need the hash the sign-in checked, so the old password stops at once, even mid sign-in). Only the make and new-password responses hold a password; only its hash is kept. In `PUPIL_TABLES` (`delete`) and `SESSION_TABLES`. Logged as `pupil_logins_made` (class id and count) and `pupil_password_reset` (class id).
- `reader/`: the pupil's reader (#213): a signed-in pupil's readings (`GET /api/pupil/readings`), one reading's frozen copy with its prompts as label and ticks only (never the instruction) and the follow-up limit in force, the pictures it names (`assets/send.ts`), and the pupil's highlights (`reader_highlights`, at most 200 a reading). Each reading route checks the pupil is a member of the reading's class with `memberOf`; an unknown reading is refused like another class's. A highlight's offsets count in the block's reader text (shared `readerText.ts`), checked against the copy. Kept by membership with no foreign key, `keep-anonymised` in `PUPIL_TABLES`. Not research data: nothing goes into `events`, the call log or the export. `store.ts`, `routes.ts`.
- `reader-prompts/`: the teacher's prompt library for the pupil reader (#177): each prompt a button label, a hidden instruction for the model and two ticks (after a highlight, as a follow-up), in the teacher's order. A workspace's first call puts config `reader.default_prompts` in; a removed prompt keeps its row (`removed_at`), so they go in once only. Logged as `reader_prompt_add`, `_edit`, `_remove`, `_reorder` with ids only. Pupils see the labels of a reading's prompts (`reader/`); nothing reaches the model yet. `store.ts`, `routes.ts`.
- `readings/`: a class's readings (#187): one of the workspace's docs set for the whole class as a frozen copy (`copy.ts`: live blocks only, no suggestions, pictures as asset ids, a `sha256:` hash), with the library prompts it allows (`reading_prompts`) and an optional follow-up limit (0 to 10, null for the class's). Later edits to the doc do not change it; setting the same doc again replaces the class's reading. An archived class takes no new reading; removing is soft (`removed_at`). It reads classes, the prompt library and the canvas through their modules and never writes docs or blocks. Logged as `reading_set`, `_update`, `_remove` with ids only. Pupils read it through `reader/`. `copy.ts`, `store.ts`, `routes.ts`.
- `reader-asks/`: a pupil's ask in the reader (#214): `POST /api/pupil/readings/:readingId/asks` with a prompt and a highlighted passage, no free text, answered whole. `article.ts` (the reading's words; the passage must be in them, normalised, at most 1,000 characters), `request.ts` (`askRequest`, the only thing that builds what the model gets: the class's safety instruction, the reading, the passage, the prompt's instruction and the earlier chain; snapshot-tested), `service.ts` (membership through `memberOf`, the prompt and follow-up checks, zero retention only, the pupil's budget in the class and the workspace's at worst cost, one call on config `reader.model`), `store.ts` (`reader_asks`: ids, tokens, cost, hashes, kept anonymised on Remove; `reader_ask_texts`: the passage and reply, keyed by the ask, so they stay too). The cost counts in the workspace's spend and Usage (`budget/store.ts`, `usage/query.ts`). Not research data: never `events`, `gateway_calls`, the export or a log line's words (docs/rules.md).
- `references/`: files added as context, stored a page a row, searched and summarised. `service.ts`, `reader.ts`, `summary.ts`, `routes.ts`.
- `sessions/`: workspaces: create, list, delete (`SESSION_TABLES`), interaction logging, and replacing or closing a link workspace's link and code (`setLink`, logged as `workspace_link`; the old ones stop working). `service.ts`, `routes.ts`, `interactions.ts`.
- `study/`: seeds a study workspace's starting state (the demo class and its demo chat). `seed.ts`, `demo-chat.ts`.
- `threads/`: chats, and naming them. `service.ts`, `title.ts`.
- `usage/`: the read-only spend by UK day for Preferences (from each call's stored `cost_gbp`; the chat counter adds up the same stored costs). `query.ts`, `routes.ts`.

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
