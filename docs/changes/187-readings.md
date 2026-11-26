# 187: readings, set an article for a class (R0)

23 Nov 2026. Plan C on #152, item R0; answer 58 (the teacher picks which prompts each reading
allows).

## What was built

- **Migration** `0045_readings.sql`: `readings` (the frozen copy in `blocks` as JSON, its
  `content_hash`, `follow_ups_max` nullable with a 0 to 10 check, `removed_at`) and
  `reading_prompts` (primary key `reading_id, prompt_id`, with `position`). Both are in
  `SESSION_TABLES`, before `reader_prompts`, `docs` and `classes`.
- **Shared** `shared/src/readings.ts`: `ReadingFollowUps` (0 to 10), `ReadingFields`,
  `ReadingPatch`, `Reading`, `ReadingBlock`, `ReadingSource`. Events in
  `shared/src/events/readings.ts`: `reading_set`, `reading_update`, `reading_remove`, server only,
  ids only (reading_id, class_id, doc_id, and prompt_ids for a set or update).
- **Server** `server/src/readings/`: `copy.ts` (pure: the doc's live blocks as `{id, type,
  content}`, and `sha256:` of them), `store.ts`, `routes.ts`. Routes are in `docs/routes.md`.
- **Client** `client/src/api/readings.ts` (spread into the session api; `hasReadings` tells the
  class page whether to show the section), and `client/src/screens/classes/readings/`:
  `ReadingsSection.tsx`, `ReadingForm.tsx`, `useReadings.ts`, `readingView.ts` (pure helpers). The
  section is mounted in `ClassLists.tsx` between Chats and the pupils.
- **e2e** `e2e/readings.spec.ts`.

## Decisions the brief did not cover

- **Setting the same doc again** for a class replaces its reading: the old one is removed (soft,
  logged `reading_remove`) and a new one set with a fresh copy, in one transaction. The brief says
  "to update it the teacher sets the doc again"; without this, a class could hold two readings of
  one doc. The reading's id changes; nothing points at it yet (R1 will).
- **The docs list** (`GET /reading-sources`) is a light SQL read of `docs` and `threads` (name,
  chat title, created_at), leaving out deleted docs and docs in deleted projects' chats, the same
  rule as the chat list. A doc in a deleted project's chat is refused with 404 when set.
- **The copy** is taken with `canvas.loadState` and `liveBlocks` inside the write's transaction.
  A live block with a change waiting on it is copied as it stands (the suggestion is left out).
- **Prompts are checked** against the library (`reader-prompts/store.ts` `list`) just before the
  write's transaction, since `list` may seed defaults in a transaction of its own. A prompt removed
  in the moment between would still be stored; R2 should skip prompts no longer in the library.
- **The order of prompt_ids**: the server stores them in the library's order at the time of the
  save (`position`), whatever order they were sent in, so a different order alone is not a change
  and is not logged.
- **Prompts removed from the library later** stay in `reading_prompts`; the list returns them and
  the page shows only those still in the library. Saving the reading's ticks drops them.
- **An archived class** refuses a new reading (409 `class_archived`) but its readings can still be
  changed and removed.
- **The follow-up range**: #186 (S) had not landed in `development` when this was opened, so
  `ReadingFollowUps` has its own 0 to 10 schema in `readings.ts`. When S lands, import its
  `FollowUpsMax` from `shared/src/classReader.ts` in place of `READING_FOLLOW_UPS_MIN/MAX`.
- `shared/src/schemas.test.ts` pins the number of event kinds: it went from 88 to 91 (not in the
  brief's list; #177 changed the same line).

## What is left

- R1: pupils see the class's readings. R2: the copy goes to the model with the reading's prompts.
- Gating behind the workspace's `pupils` switch (P2). A length cap on the article (R2).
- No preview of the copy, and no "refresh" button (set the doc again instead).
