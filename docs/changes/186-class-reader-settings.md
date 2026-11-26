# 186: a class's Pupil reader settings (plan C, item S)

## What was built

- Migration `0044_class_reader_settings.sql`: `classes.reader_follow_ups_max INTEGER` and
  `classes.reader_pupil_budget_gbp REAL`, both nullable. NULL means config's default.
- `shared/src/classReader.ts`: `FollowUpsMax` (whole, 0 to 10), `PupilBudgetGbp` (£0 to £5, whole
  pence), `ClassReaderSettings` (values in force, `defaults`, `set` per field) and
  `ClassReaderSettingsPatch` (a number sets, null clears, left out stays).
- `server/src/classes/reader-settings.ts`: `createReaderSettingsStore(db, events, defaults)` with
  `get` and `set`; `copyReaderSettings` for Copy to next year (`copy.ts` calls it inside the copy's
  transaction). Defaults come from `deps.loaded.config.reader` when asked, never stored.
  `reader-settings-routes.ts`: `GET` and `POST /api/sessions/:sessionId/classes/:id/reader-settings`
  (404 for a class not in this workspace, 400 out of limits).
- Event `class_reader_settings` (`shared/src/events/classes.ts`), `{class_id}` only, server only
  (in `SERVER_ONLY_KINDS`). One per real change; none when nothing changed.
- Client: `ClassesApi.getReaderSettings` / `setReaderSettings` (path in `api/endpoints.ts`);
  `screens/classes/ReaderSettingsCard.tsx` (mounted in `ClassSidebar.tsx` after Curriculum),
  `useReaderSettings.ts` (load per class, save per field), `readerSettings.ts` (pure parsers:
  "0.5", "£0.50", "50p"; `formatPounds`).
- Tests: `server/src/classes/reader-settings.test.ts` (a test config with 7 and £1.25 as defaults;
  set, clear, no-op, limits, 404, config change after the fact, copy, `classes.json` keys, the
  browser's event route refusing the kind); `client/.../readerSettings.test.ts`,
  `ReaderSettingsCard.test.tsx`; `e2e/classReaderSettings.spec.ts`.

## Decisions the brief left open

- Copy to next year logs `class_reader_settings` for the new class when it carried any value (and
  nothing when the old class had none), so every change to a class's settings has an event.
- An amount that is not whole pence (0.505) is refused (400), not rounded. The client refuses it
  before asking the server.
- A value read back is rounded to the penny, since PostgreSQL's `REAL` is single precision. The
  schema rounds a budget too (`PupilBudgetGbp` transforms with `toPence`), so 1e-9 is stored as 0
  and a repeat is a no-op (review round 1).
- Zero is a value (no follow-ups, or no budget), not a clear: only an empty box goes back to the
  default.
- The card saves on blur or Enter, as `SavedText` does, not on each keystroke. Typing the
  default's own value into an unset box sets it (it stops being "(default)"); leaving the box as
  shown saves nothing, and typing a set box's own value another way ("75p" at £0.75) only tidies
  the text. The decision is `decideCommit` in `readerSettings.ts`, pure.
- The box stays editable while a save is in flight. Each field's saves are queued in
  `useReaderSettings` (`enqueue`): the next is sent only once the one before has settled, and only
  the newest value waiting goes, so the server ends with the teacher's last value whatever order it
  would handle requests in (two quick saves can reach separate Vercel functions). A refused save
  puts back the box's current value (review rounds 1 and 2). While a save waits behind another,
  the box can show the earlier value for a moment before the last one lands.
- The settings live in the card's hook, not in the class detail store (`state/classDetail.ts`):
  nothing else reads them yet.
- `shared/src/schemas.test.ts` (count of event kinds) needed one line too: it is a registry the
  brief did not list.
- An archived class's settings can still be read and changed.

## What is left

- R2 reads these when a pupil asks (`classes/reader-settings.ts`'s `get` gives the values in force).
- P2 hides the card when the workspace's `pupils` switch is off.
- Question 81: whether the figures may go in the event.
