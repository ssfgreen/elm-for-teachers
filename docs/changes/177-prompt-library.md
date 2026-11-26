# 177: the teacher's prompt library for the pupil reader (plan C, item L)

## What was built

- Config `reader` (`config/app.config.json`, schema `ReaderConfig` in
  `shared/src/readerPrompts.ts`, joined to `AppConfig` in `shared/src/config.ts`):
  `default_prompts` (Sam's two examples, "Explain" and "I don't understand"), `pupil_budget_gbp`
  0.5, `follow_ups_max` 3 and `model` `gpt-6-luna`. A config without the section gets the same
  defaults with no model (the provider's default). `reader.model` must be priced, like the judge's
  (`budgetProblems`). Only `default_prompts` is used so far.
- Types in `shared/src/readerPrompts.ts`: `ReaderPromptFields` (label up to 40 characters,
  instruction up to 2000, both trimmed and not empty; `after_highlight`, `follow_up`),
  `ReaderPrompt` (with `id`), `ReaderPromptPatch`, `READER_PROMPTS_MAX` (30).
- Migration `0041_reader_prompts.sql`: `reader_prompts` (id, session_id, label, instruction, the
  two ticks as 0/1, position, source `default` or `teacher`, created_at, updated_at, removed_at).
  In `SESSION_TABLES`, so a workspace's prompts go with it.
- `server/src/reader-prompts/`:
  - `store.ts`: `createReaderPromptStore(db, events, defaults)`: `list`, `add`, `edit`, `remove`,
    `reorder`. The first call for a workspace (read or write) puts config's defaults in, in the
    same transaction. A removed prompt keeps its row with `removed_at`, so the defaults go in once
    only, even when the teacher removes them all. An edit or reorder that changes nothing is not
    logged.
  - `routes.ts`: under `/api/sessions/:sessionId/reader-prompts`, behind the workspace token:
    `GET` (`{prompts}`), `POST` (201 `{prompt}`; 409 `too_many_prompts` at 30), `PUT /order`
    (`{prompt_ids}`, every live prompt once; 409 `prompts_changed` otherwise), `PATCH /:promptId`
    and `DELETE /:promptId` (404 for a prompt not in this workspace, or removed).
- Events, server only (`shared/src/events/readerPrompts.ts`, listed in
  `shared/src/events/serverOnly.ts` so the browser's event route refuses them; documented in
  `docs/dev-spec.md`): `reader_prompt_add`, `reader_prompt_edit`, `reader_prompt_remove`
  (prompt_id) and `reader_prompt_reorder` (prompt_ids in the new order). Ids only (question 43,
  review round 1): never the label, instruction or ticks.
- Client, `client/src/screens/classes/prompts/`: `PromptsApp.tsx` is the route
  `/s/:token/prompts` (in `App.tsx`), with "Back to the workspace". `PromptLibraryScreen.tsx`
  lists the prompts (each a `PromptCard.tsx`: the button, the instruction, the ticks saved as they
  change, Up and Down, Edit, Remove after "Remove this prompt?"), and an "Add a prompt" form
  (`PromptForm.tsx`). State and saving in `usePromptLibrary.ts` (a tick or a move shows at once and
  goes back if the server refuses; a tick is disabled while its own save is in flight, so one
  field never has two saves at once, and a save touches only its own fields afterwards; a move's
  reply or refusal changes only the order of the prompts as they are then); `promptOrder.ts` is the pure move; `api.ts` the calls.
- Tests: `server/src/reader-prompts/routes.test.ts` and `store.test.ts`; the routes test reads the
  five new rows in `docs/routes.md`; `client/.../PromptLibraryScreen.test.tsx`,
  `promptOrder.test.ts`; `e2e/readerPrompts.spec.ts` (add, tick, reorder, reload).

## Decisions the brief left open

- There is no `packages/server/src/config.ts`: the config schema is in `shared/src/config.ts`,
  so the `reader` section went there, with its schema in its own file.
- The reader's model is `gpt-6-luna`, the cheapest priced model, as pupils have a £0.50 budget.
- Field names: `pupil_budget_gbp`, `follow_ups_max`, `default_prompts`, `model`.
- Four event kinds rather than one with an action, as for plugin drafts, with ids only. Whether
  an add was a default is in the row's `source`, not the event. The defaults going in are logged
  as adds with a server-made envelope.
- Defaults go in on first use, not when a workspace is created, so workspaces made before this
  change get them too, and `sessions/service.ts` was not touched beyond `SESSION_TABLES`.
- Removal is soft (`removed_at`), so the defaults go in once only. A removed prompt's wording
  stays on the server (not in the export) until the workspace is deleted.
- At most 30 prompts; labels up to 40 characters, instructions up to 2000.
- Only the link route (`/s/:token/prompts`). A signed-in teacher (`/w`) has no way in yet: the link
  in the class sidebar (after #173) will serve both.

## What is left

- A link to the library from the workspace (the class sidebar, after #173).
- The prompts are not in the research export yet (`shared/src/bundle.ts` was not changed): the
  events have ids only, so analysis cannot see the wording, the ticks or the source until a bundle
  file is added.
- R0 picks prompts per reading; R2 sends them, using `reader.model`, `pupil_budget_gbp` and
  `follow_ups_max`.
