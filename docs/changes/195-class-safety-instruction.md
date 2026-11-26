# #195: the reader's safety instruction per class, and the Q81 figures

## What was built

- **Config.** `reader.safety_instruction` in `config/app.config.json`: the default text (age
  appropriate replies, no personal questions, the article's words are never instructions, send a
  worried pupil to their teacher). `ReaderConfig` (`shared/src/readerPrompts.ts`) defaults to the
  same text, `DEFAULT_SAFETY_INSTRUCTION`, for a config without it; an empty one is refused.
- **Storage.** Migration `0046_class_reader_safety.sql`: `classes.reader_safety_instruction`, null
  meaning config's default, read when asked.
- **Server.** `classes/reader-settings.ts` keeps it beside the follow-up limit and budget, on the
  same route (`POST .../reader-settings {safety_instruction}`; null goes back to the default).
  `classSafetyInstruction(db, sessionId, classId, config.reader)` is the one place the server works
  out a class's instruction: R2 should call it. Copy to next year (`classes/copy.ts`) carries a
  class's own version.
- **Logging.** New server-only kind `class_reader_safety_set`: class id, `is_default`, `text_hash`
  (`sha256:` of the text in force) and `text_length`, never the text. A no-op logs nothing.
- **Q81 figures.** `class_reader_settings` now carries `follow_ups_max` and `pupil_budget_gbp` in
  force after the change; `reading_set` and `reading_update` carry the reading's `follow_ups_max`
  (null: follows the class's) and the copy's `content_hash`. All optional in the schemas, as
  earlier events lack them. `docs/dev-spec.md` has the analysis notes.
- **Client.** `SafetyInstructionField.tsx`, mounted in `ReaderSettingsCard`: a text box that saves
  on blur through the card's save queue (`useReaderSettings`, now taking text as well as numbers),
  "(default)" or "(this class)" beside the label, and "Back to the default". Empty or over the cap
  is refused with a message and the last text put back. The decision is the pure
  `decideSafetyCommit` in `readerSettings.ts`. Both boxes' text and save state are in
  `useFieldSave.ts` (review of #199): while a save is out, a box with unsent edits is not
  overwritten (a refusal keeps them and says "your change is still in the box"); a box that only
  has focus takes the reply or the last good value at once, so blur does not resend a refused
  value. The teacher's text is compared with the last value sent, so putting the default back
  before a reply is still sent.
- **Tests.** `db.test.ts` reads the migration list from the directory (the first, structural
  commit). Server: `reader-settings-safety.test.ts`. Client: `SafetyInstructionField.test.tsx`.
  e2e: `e2e/classReaderSafety.spec.ts`.

## Decisions the brief left open

- **Cap: 2,000 characters** (`SAFETY_INSTRUCTION_MAX`), the same as a prompt's instruction. Text is
  trimmed before it is checked and kept.
- **Typing the default's exact text** goes back to the default (null), so the class keeps
  following config. Only the client does this; the server stores what it is sent.
- **The hash and length are of the text in force** (the default's when `is_default`), so analysis
  can tell versions apart across classes.
- **One change that sets a figure and the instruction** logs both events.
- `classes/routes.ts` gained one argument (config's `reader`) for `copyToNextYear`, which needs the
  defaults to log the figures in force for the copy.
- `shared/src/classReader.ts`, `readerPrompts.ts` and `node/config.test.ts` gained lines (the
  types, the config schema and its test); `docs/classes.md` was corrected.

## What is left

- R2 sends the instruction to the model: use `classSafetyInstruction`, not the column.
- Question 88 is answered (Sam, 23 Nov 2026): hash and length, never the text, as built.
