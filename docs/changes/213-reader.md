# 213: the pupil's reader (R1): readings, the article read-only, highlights

Plan C item R1 (#213), on P2a (#209) and R0 (#187). Built on Sam's "use sensible defaults"
(23 Nov 22:40). Five points; no fallback was needed: tables and drawings are drawn properly.

## What was built

- **Structural commit first**: `sendAsset` moved from `assets/routes.ts` to `assets/send.ts`,
  exported, no behaviour change.
- **`shared/src/reader.ts`**: the five categories as data (`HIGHLIGHT_CATEGORIES`, ids
  `dont_understand`, `may_be_inaccurate`, `possibly_biased`, `missing_sources`, `poor_quality`;
  null is plain "Highlight"), `HighlightFields`, `Highlight`, `PupilReadingItem`, `PupilPrompt`,
  `PupilReading`, `READER_HIGHLIGHTS_MAX` (200).
- **`shared/src/readerText.ts`**: `readerBlock(block)` reads a frozen-copy block into what the
  reader shows: its kind (heading, paragraph, quote, code, list item, old list, table, picture,
  rule, page break) and its text with the markup off, in runs that know where they start. A
  highlight's `start`/`end` count in that text (`ReaderBlock.text`): runs are joined with `\n`;
  pictures have no text. `inlineParts` keeps bold, italic, underline, code and links, and drops
  colour, font, size and the editor's own `<mark>`. `readingAssetIds` lists the pictures a copy
  names. The server checks offsets with it and the page draws from it, so they cannot disagree.
- **Migration `0049_reader_highlights.sql`**: `reader_highlights` (id, session, class, reading,
  `member_id` with no foreign key, block, `start`, `"end"` (a keyword, always quoted), category,
  created_at). In `SESSION_TABLES` and `PUPIL_TABLES` (member-keyed, `keep-anonymised`).
- **`server/src/reader/`** (`store.ts`, `routes.ts`, tests and `test-reading.ts`): the routes in
  `docs/routes.md` under "class member". It reads `readings`, `reading_prompts`, `reader_prompts`
  and `classes` with its own SQL and writes only `reader_highlights`.
- **`client/src/reader/`**: `ReadingList` (mounted on `/r` in place of "There is nothing to do
  yet", which it shows itself when empty), `ReaderScreen` (`/r/readings/:readingId`, in
  `App.tsx`), `ReadingBlocks` (draws the copy without Tiptap), `HighlightBar` (the bar at the foot:
  the categories while text is selected, Remove when a highlight is picked), `useReading` (one per
  page), `marks.ts` (cuts runs by highlights; the colours), `selection.ts` (a DOM range to
  `{block_id, start, end}`), `readerApi.ts`.
- **`routes.test.ts`**: a "class member" caller: no sign-in and a teacher (401), a pupil in no
  class (403), a write from another site (403). `pupils/tables.test.ts`: each describe has its own
  database, so the guard no longer passes only because it runs first.

## Decisions the brief did not make

- **Unknown reading id**: 403 `not_member`, the same as another class's, so reading ids cannot be
  probed. A removed reading is 404 to a member of its class ("Your teacher has taken this reading
  away").
- **Membership check**: the reading routes call `memberOf` in the handler (the class comes from the
  reading, not the path), not `requireMember`.
- **The list includes the teacher's test member's classes** (`teacher_test` treated like a pupil),
  unlike `/api/pupil/me`, which shows only `pupil` memberships.
- **`set_on`** is the day the reading row was made (`created_at`); setting the same doc again
  makes a new row, so it is the day it was last set.
- **Category is checked in code, not by a SQL `CHECK`**, so the list can change without rebuilding
  the table. The server refuses anything but the five or null (400).
- **One save or removal at a time** on the page (a busy flag): a double click saves once. A save that answers after the page has moved to another reading is dropped (`useReading`).
- **Overlapping highlights are allowed**; where they overlap the newest is drawn and picked.
- **A selection over two blocks** keeps the part in the block it starts in.
- **Errors**: 400 `unknown_block`, `bad_range` (past the block's text), `invalid_request`
  (schema); 409 `highlights_full` at 200; 404 for another pupil's highlight.
- **Colours** are written as Tailwind arbitrary values in `reader/marks.ts`: the theme resets
  Tailwind's palette (`--color-*: initial`) and `theme.css` is not this item's. Unlabelled uses the
  editor's `--text-highlight`. If Sam wants them as theme tokens, move them to `theme.css`.
- **Links in the article** open in a new tab (`rel="noopener noreferrer"`). Drawings (SVG content)
  are drawn as `<img>` from a data URL of the cleaned SVG, so nothing in them runs.
- **Pictures** come through `GET /api/pupil/readings/:id/assets/:assetId` with
  `Cache-Control: private, max-age=3600` (from `sendAsset`); a bucket picture redirects as for the
  teacher.

## What is left

- R2 (#214) sends a highlight to the model with a prompt: the article already gives
  `prompts` (label and ticks) and `follow_ups_max`; the highlight bar is where "after highlight"
  prompts would go.
- The teacher cannot see pupils' highlights yet.
- Setting the same doc again for a class makes a new reading (R0), so pupils' highlights stay on
  the old one and are no longer shown. Carrying them over (matching block ids and text) is for a
  later item.
- Not tried on a touch screen: selection goes through `selectionchange`, so it should work, but a
  phone's own selection menu may sit over the bar.
- Keyboard selection of text needs the browser's caret browsing (F7); highlights themselves are
  focusable and Enter or Space picks one.
