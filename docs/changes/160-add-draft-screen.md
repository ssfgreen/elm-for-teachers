# 160: add a draft on the Plugins screen (E1c)

## What was built

- `shared/src/pluginDrafts.ts`: `PluginDraft` (id, name, added_at), the one type for a draft as
  the teacher sees it. The server's `DraftInfo` is now an alias of it, and the client's
  `api/participant.ts` re-exports it.
- `client/src/screens/plugins/`:
  - `draftLink.ts`: the studio's "Open in Elm" link, `<elm>/#add-draft=<address>`.
    `takeAddDraftLink` (called in `main.tsx` before the first render) takes the address out of
    the address bar with `history.replaceState`, keeping the path, query and router state, and
    keeps it in memory. `hasPendingDraft` and `takePendingDraft` (once) hand it on.
  - `drafts.ts`: pure rules: the message for each refusal (`not_an_address`, `not_the_studio`,
    `not_a_draft`, `too_many_drafts`), `drafts_off`, a draft already gone, adding once, the date.
  - `useDrafts.ts`: the list, add (pasted or offered), Accept and Cancel for the offer, remove.
    `status` is `off` when the server answers `drafts_off` (or the api has no drafts calls).
  - `DraftsSection.tsx`: the section above the catalogue: the offer (Add, Cancel), the paste
    field, messages, and each draft as a card with a "Draft" badge and Remove (confirmed in
    place, like ClassPage's Archive).
- `WorkspaceScreen.tsx`, one line after the first load: with a link waiting, open Plugins.
- e2e: `e2e/fake-studio.mjs` (a stand-in studio on port 3953) and `PLUGIN_STUDIO_URL` for the e2e
  server in `playwright.config.ts`; `e2e/pluginDrafts.spec.ts` adds by link and by paste, shows a
  refusal, removes one, and reloads.

## Decisions

- Drafts are their own section ("Drafts from the plugin studio") above the search, not mixed into
  the catalogue's list: they have no kind or publisher, and the search and kind filters do not
  apply to them.
- The link's address lives in memory only (not sessionStorage), so it is never written anywhere.
  The cost: the offer is gone if the page reloads before the teacher reaches their workspace, and
  also once they leave Plugins without choosing Add or Cancel (the screen takes the address once).
  Either way they paste the address or click the link again. From the front page, "Open your
  workspace" is a client-side link, so the offer survives it.
- With drafts off on the server, a teacher who arrives by a link sees one line on Plugins
  ("Drafts from the plugin studio are not set up here, so that draft cannot be added.") and
  nothing else about drafts (review, round 1).
- The offer never shows the address. After a refusal (wrong studio, not a draft, full) the offer
  goes and the message stays; after a plain failure (network) the offer stays for another try.
- Adding an address already added says "“name” is already in this workspace." rather than nothing.
- Remove of a draft that is already gone (404 `not_found`) counts as removed.
- `errorCode` moved from `api/admin.ts` to `api/http.ts`, next to `ApiError` (admin re-exports
  it), so `drafts.ts` uses it without a copy and without importing the admin api.
- Badge "Draft" uses the `primary` badge variant; icon `FlaskConical`.

## Left

- The front page (`/`) does nothing with a waiting link: a signed-in teacher who lands there
  reaches the offer through "Open your workspace", but a link-workspace teacher (no account,
  `/s/<token>`) who lands on `/` has no way in, and the offer is lost. The studio's copy (S7)
  must not promise more than this. A short notice on the front page could help.
- The workspace's `plugins` feature switch: nothing in the client or the plugins routes reads it,
  so the Plugins screen, the drafts and the offer ignore it, like the rest of Plugins. Only the
  turn applies it (`gateway/turn-plugins.ts`). What a draft does in a turn with the switch off
  is E1b's question.
- `DRAFTS_MAX` (20) is repeated in `drafts.ts` for the "full" message; keep it in step with the
  server. A follow-up could have the server's `too_many_drafts` refusal carry the number.
- Using a draft in a turn is E1b (#159).
