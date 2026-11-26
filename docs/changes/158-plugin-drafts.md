# 158: a workspace's studio drafts on the server (E1a)

## What was built

- `PLUGIN_STUDIO_URL` (`server/src/env/studio.ts`, `.env.example`): the studio origins a draft may
  come from, separated by commas. https only, except http on `localhost` or `127.0.0.1`. Unset,
  drafts are off. `studioOrigins(env)` gives the allow-list.
- Migration `0040_plugin_drafts.sql`: `plugin_drafts` (id, session_id, address, name,
  content_hash, created_at; one row per workspace and address). In `SESSION_TABLES`, so deleting a
  workspace deletes its drafts.
- `server/src/plugins/drafts/`:
  - `address.ts`: `checkDraftAddress` takes only `<allowed origin>/d/<code>` (code: letters,
    digits, `-`, `_`, 6 to 200 long; no query, fragment or user name) and returns it in one form;
    `newDraftId` gives Elm's own id, `d-` and 8 random characters.
  - `studio.ts`: `readDraft` asks the studio for the draft (Accept JSON, no redirects, 3 s) and
    takes `name`, `manifest.name` or `plugin.name`, cleaned to one line of at most 80 characters,
    and a sha256 of the answer, read with a cap of 256 KB in bytes (by its stated length, or as it
    arrives). Anything else gives the name "Studio draft" and no hash. Failures
    are not logged.
  - `service.ts`: `createDraftService(db, events)`: `list`, `add`, `remove`, and `addressOf` for
    the server's own use (E1b). At most 20 drafts a workspace. `add` reads the studio first, then
    looks for the address, counts and inserts in one transaction, so overlapping adds cannot pass
    the limit or return a draft that was never stored (review, round 1).
  - `routes.ts`: `GET`, `POST {address, envelope}` (201, or 200 with the same draft when the
    address is already added) and `DELETE /:draftId {envelope}` (204) under
    `/api/sessions/:sessionId/plugin-drafts`, behind the workspace token. Without
    `PLUGIN_STUDIO_URL` every one answers 404 `drafts_off`. Refusals: 400 `not_an_address`,
    `not_the_studio`, `not_a_draft`; 409 `too_many_drafts`.
- Events `plugin_draft_add` (draft_id, name, content_hash or null) and `plugin_draft_remove`
  (draft_id, name) in `shared/src/events/drafts.ts`, both server only. Written through the
  EventStore in the same transaction as the write. In `docs/dev-spec.md`.
- Client: `endpoints.pluginDrafts`, and `listPluginDrafts`, `addPluginDraft`, `removePluginDraft`
  on `SessionApi`, with a `PluginDraft` type. No screen uses them yet (E1c).

## Decisions

- The address must be a draft's address (`/d/<code>`), not just any page at the studio's origin,
  so a teacher cannot point the server at another studio page.
- Adding the same address twice returns the draft already there and logs nothing.
- The events carry `content_hash` as question 39 asked, as well as the id and name the brief
  named. The hash is of the studio's answer, not of the address.
- A 404 `drafts_off` for the feature being off, like an absent route; not a 5xx, which the app
  logs as an error.
- The workspace's `plugins` feature switch is not checked here: E1c (the screen) and E1b (the
  turn) should decide what a draft does when it is off.
- `DraftInfo` (server) and `PluginDraft` (client) are the same three fields, kept apart because
  the brief gave no shared file for them. Move them into `shared/` when E1c touches it.

## Left

- E1b: use a draft in a turn (`addressOf`), Ask first; `chat_prompt` gains `draft` and
  `content_hash` (question 39).
- E1c: the Plugins screen.
- Since 22 Nov: the studio's draft address (S5, studio #156) is built. It sends `name` and
  `content_hash` at the top level of its answer, which is what `readDraft` reads, and
  `contentHashOf` uses the studio's own hash when it is there (a sha256 of the whole answer is
  only the fallback). The studio checks this against a copy of Elm's reader.
- The read on add is a GET, which the studio does not count as a use: "Last used" changes only
  on a POST (a tool call, or any MCP message).
- Porting to the studio's published plugins: the table and service only know an address, a name
  and a hash; a published plugin would add a kind column (default `draft`) in a new migration.
