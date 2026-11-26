# 159: a studio draft in a turn (E1b)

## What was built

- `server/src/plugins/drafts/runner.ts`: the reader for the studio's runner (S5, not built yet),
  behind a `DraftRunner` interface that tests stub. `read(address)` does `GET <address>` with
  E1a's limits (JSON only, no redirects, 256 KB, 3 s; `studio.ts` `readAnswer`) and takes from the
  answer, or from its `manifest` or `plugin` object: `collections` (a `pedagogy` one first, else the
  first `documents` one), `description` (one line, 300 characters) and `content_hash`.
  `client(address)` is a library client for `POST <address>/api/collections/<c>/<tool>`, the
  same path under the draft as under `/p/<owner>/<name>` (docs/plugin-platform.md section 10):
  8 s a call, no redirects, answers of at most 256 KB (`plugins/capped-text.ts`, shared with
  E1a's read). Its errors have the address and its code taken out.
- One content hash rule, `contentHashOf` in `drafts/studio.ts`, for both `plugin_draft_add`
  and `chat_prompt`: the studio's own hash when its answer carries one, else a sha256 of the
  answer, always `sha256:<64 hex>` (E1a's rows before this were plain hex; there were none in
  use, since the studio is not built).
- `server/src/plugins/drafts/chat.ts`: `createDraftChat`, built once in `app.ts`
  (`draftChatFor`): `forTurn` reads every draft of the workspace at once as a turn starts;
  `infos` and `grant` for the chat's Ask first banner. A draft is always Ask first and uses the
  same `plugin_grants` rows and `plugin_request` / `plugin_grant` events as a catalogue plugin,
  keyed by the draft's id (`d-…`), through `plugins/grants.ts` (`chatGrants`, `allowInChat`),
  which both share; Allow checks inside its transaction, so a double click logs once. The drafts
  and their addresses are one query (`listWithAddresses`). A draft whose origin is no longer in `PLUGIN_STUDIO_URL` is
  left out; with it unset, there are no drafts.
- `server/src/gateway/turn-drafts.ts` (pure) and `turn-plugins.ts`: a draft is offered as a
  library (the `library_*` tools, its line in the Libraries list marked as a draft). A draft
  whose manifest names a pedagogy collection stands in for the built-in pedagogy library for that
  workspace once the teacher allows it in a chat: then the built-in is left out of the offer and
  of `chat_prompt`. Until then the built-in stays, and a class chat asks for the draft. A draft the studio did
  not give (down, slow, not JSON, or no collection it can use) is listed as "unavailable just
  now", its tools say it could not be read, and the turn carries on.
- `gateway/service.ts` reads the drafts (agent mode, plugins switch on) before `chat_prompt`;
  `agent-turn.ts` records a request for a pedagogy draft not yet allowed in a class or year group
  chat, so the teacher gets Allow (the pedagogy library has no tool that asks).
- `plugins/routes.ts`: `GET /plugins?thread_id=` also lists the workspace's drafts (only with a
  chat; the Plugins screen lists drafts on its own, E1c), and `POST /plugins/:id/allow` takes a
  draft's id. No client change: the chat's banner already works from these.
- `shared/src/events/plugins.ts`: `PluginOnOffer` gains optional `draft: true` and
  `content_hash` (null when the draft could not be read). Older events parse as before.

## Decisions

- The draft is read at the studio at the start of every turn, so a change in the studio shows on
  the next message and `content_hash` is the one the turn used. That read is a call to the runner:
  S5 should not count `GET <address>` as a use of the draft, only tool calls, or the "was it used"
  check will count every turn in the workspace.
- Every draft is read even in a chat that has not allowed it, since a pedagogy draft must be
  known as one to stand in for the built-in. The search words still go to the studio only once
  the teacher allows the draft (question 35).
- Until a pedagogy draft is allowed in a chat, the built-in pedagogy library stays there (the
  orchestrator's default while Sam answers, review round 1). A second pedagogy draft is left
  out; so is any pedagogy draft with the workspace's pedagogy switch off. With plugins off, no
  draft is offered.
- An allowed pedagogy draft is asked what the built-in is asked: in a class or year group chat,
  each turn sends the class's stage, level, subject, curriculum codes and adaptation ids (no
  names, no pupil rows) to the studio (the orchestrator's default while Sam answers).
- If the studio is down or slow, even an allowed pedagogy draft cannot be told apart from a
  library: it is listed as an unavailable library, and the built-in pedagogy library is used for
  that turn.
- Every turn in a workspace with drafts waits for the studio before `chat_prompt` is logged: up
  to 3 s when it is slow (all drafts at once). S5 should keep the draft address's cold start
  well under that, or drafts will show as unavailable after a quiet spell.
- The banner's `PluginInfo` for a draft says kind `library`, publisher "Plugin studio": its kind
  is known only after a read, and the banner shows only the name.
- `content_hash: null` marks "unavailable" in `chat_prompt`, rather than a new field the brief
  did not agree.
- I touched `plugins/routes.ts` (not in the brief's files) for the listing and Allow: without
  them a draft could never be allowed, so never searched.

## Left

- When S5 lands, check `runner.ts` against what it really serves: the manifest's shape, the tool
  path under the address, the content hash's form, and a `Plugin-Settings` header (not sent).
- Skills in a draft (`skills/`) are not offered; only one collection a draft is used.
- Removing a draft leaves its `plugin_grants` rows; they are never read again.
- Not tried in a browser: the Allow banner for a draft was tested through the routes only.
