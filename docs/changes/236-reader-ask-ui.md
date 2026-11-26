# 236: asking about a highlight in the pupil's reader

Item R3 of plan C (#152), on R1 (#213) and R2 (#214). Client only, plus one server test. No
migration, no new event, no logger.

## What was built

- **`client/src/reader/messages.ts`**: R1's `REFUSED` table, moved out of `ReaderScreen` in its own
  commit; `NOT_ASKABLE` (the two lines shown instead of the buttons), `NO_MORE_FOLLOW_UPS`,
  `ASK_REFUSED` (one entry per shared `READER_ASK_REFUSALS` code) and `askRefusal(code)` (the ask's
  words, else R1's membership words, else "That did not work. Please try again."). The budget
  words are copied from the server's `PUPIL_BUDGET_MESSAGE` and `WORKSPACE_BUDGET_MESSAGE`
  (`server/src/reader-asks/service.ts`): the client cannot import them, so change both together.
- **`reader/asks.ts`** (pure): `passageOf(block, start, end)` is `readerBlock(block).text.slice`;
  `askable(block, passage)` is `too_long` over 1,000 characters (trimmed, as the server counts),
  `not_here` where the server would read the block differently (see Decisions), with `*` or a
  backtick, or on space alone; `promptsFor(prompts, place)` keeps the reading's order.
- **`reader/useAsk.ts`**: the open chain (`passage`, `steps` of `{id, label, reply}`,
  `follow_ups_left`), `asking`, `refused`; `ask`, `followUp`, `close`. One request at a time (a
  ref). A follow-up sends the chain's passage and the newest step's id as `parent_ask_id`. A new
  reading or Close drops everything, and an answer that comes back after either is ignored (a
  generation count). A `follow_ups_used` refusal sets `follow_ups_left` to 0.
- **`reader/AskButtons.tsx`**: the "Ask about this" group (`role="group"`) in the bar.
- **`reader/AnswerPanel.tsx`**: the "Answer" region: the passage quoted, each step's label and
  reply (`whitespace-pre-line`, React text only), "Thinking…" (`role="status"`), the "Follow up"
  group under the newest reply or "No more follow-ups on this answer.", Close and Escape. A new
  reply takes focus. A refusal is an alert under the panel.
- **`HighlightBar.tsx`**: an `asks` slot after the categories or after Remove; it no longer
  places itself. **`ReaderScreen.tsx`**: works out the passage (the picked highlight's, else the
  selection's) and puts the panel and the bar together in one fixed foot. 118 lines.
- **`readerApi.ts`** `askAbout`; **`api/endpoints.ts`** `pupilAsks`.
- **Tests**: `asks.test.ts`, `messages.test.ts`, `useAsk.test.ts`, `ReaderAsks.test.tsx` (the
  components and the research data guard), `server/src/reader-asks/passage.test.ts` (parity),
  `e2e/readerAsks.spec.ts`.

## Decisions

- **Where the page offers no asks.** The server reads a block's words with its own `plainLine`
  (`server/src/reader-asks/article.ts`), which takes off more than `readerBlock`. The parity test,
  widened after review, found these, and the page now refuses the whole block as `not_here`:
  - a backslash escape other than of `*` or a backtick (`\\`, `\<`, `\]`): the server keeps the
    backslash;
  - a line of the block's text starting with a heading, quote, bullet or number marker (`# `,
    `>`, `- `, `• `, `1. `, `2) `), even after the block's own marker, in a table cell or after a
    line break: the server strips it from every line;
  - a tag or comment (`<` then a letter, `/` or `!`, as in `x<y` or `<b>`): the server strips
    any;
  - a picture inside a line (`![`).
  The rules sit in `asks.ts` `askable` and, side by side, in the parity test's `offered`: change
  both together. The server was not changed. The lasting fix, a separate item, is the server
  reading blocks through `readerBlock`; then these rules can go.
- **Whitespace only** passages are `not_here` (the server would refuse them).
- **The refusal** shows as an alert under the panel, so the panel stays as it was. It goes on the
  next ask or on Close. A first ask refused shows the alert with no panel.
- **Close while a request is out** hides the panel and drops the answer when it comes (review).
- **The research data guard** checks attributes across the whole page for a plain selection. A
  highlight's mark already carries its words in `aria-label` (R1's, unchanged), so the guard
  does not use a highlight.
- **The export check in e2e** compares how often the passage word appears before and after the
  asks, since the doc itself holds the word, and checks that no reply appears.

## What is left

- Answers do not come back after a reload (question 129's default).
- G (Progress) reads asks for the teacher.
- The server reading blocks through `readerBlock` (a separate item); then drop `readsTheSame` from
  `askable` and the matching rules from the parity test's `offered`.
