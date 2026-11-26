# 48: split events.ts payloads by family (structural)

## What was built

`packages/shared/src/events.ts` went from 414 to 191 lines. Its payload schemas moved, text
unchanged, into family files under `packages/shared/src/events/`:

- `editor.ts` (new): `TextEdit`, keystroke batch, paste, selection, focus, scroll, block visible,
  revision and structure, asset upload. The private `BlockOrChatTarget` moved with them.
- `comments.ts` (new): comment create, delete, edit, resolve.
- `make.ts` (new): make action and make design.
- `session.ts` (new): participant open and error.
- `docs.ts`: doc export, doc preview, preview scroll added.
- `chat.ts`: thread create, rename, open and chat title added.

events.ts keeps the envelopes, the `bodies` list (order unchanged, so `EVENT_KINDS` is too), the
unions, `PupilRowsScrubPayload` (left in place on purpose), and re-exports every family.

## Decisions

- Nothing pinned the names events.ts exports, so `events.exports.test.ts` now does (an inline
  snapshot of all 100 runtime names), committed before the move and passing on both sides of it.
- Participant open and error had no family; they went to a new `session.ts` rather than events.ts.
- `events/features.ts` is still not re-exported from events.ts, as before (out of scope).

## Left

Nothing for this item. No server or client file imported a deep path into events.ts; the shared
tests (`schemas.test.ts`, `features.test.ts`, `interactions.test.ts`) import `./events.js`, which
still exports everything.
