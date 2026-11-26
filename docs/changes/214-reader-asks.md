# 214: R2 reader, asks on the server

## What was built

`POST /api/pupil/readings/:readingId/asks {prompt_id, highlighted_text, parent_ask_id?}` returns
`{ask: {id, reply, follow_ups_left}}`: one model call, answered whole. No screen yet (R3).

- `packages/shared/src/readerAsks.ts`: the body (strict: unknown keys are a 400, so no free text),
  the result, `READER_HIGHLIGHT_MAX` (1,000) and the refusal codes.
- `packages/server/src/reader-asks/`
  - `article.ts`: the reading's frozen copy as plain words (markup, link addresses, pictures,
    dividers and table rules left out) and `checkHighlight`: the passage must be in those words
    once both are normalised (NFKC, quotes and dashes, spaces, case). It may run across blocks.
  - `request.ts`: `askRequest`, the only builder of what the model gets: the safety instruction
    as `instructions`, then user and assistant messages (the reading once, in the first; each
    ask's passage and instruction; earlier replies). Snapshot in `__snapshots__/`.
  - `service.ts`: `askReader`, every check in order and then `callReader`; returns a value, so
    the route logs each refusal by code. `callReader` is also what the eval calls.
  - `store.ts`: SQL for the reading, its prompts, the chain, a member's spend and the save.
  - `routes.ts`: `requirePupil` + `fromSite`, then `openReading` (membership) and `askReader`.
- Migration `0050_reader_asks.sql`: `reader_asks` (ids, model, tokens, `cost_gbp`,
  `config_hash`, `safety_hash`; `member_id` with no foreign key, keep-anonymised) and
  `reader_ask_texts` (passage and reply). Both carry `session_id` and are in `SESSION_TABLES`.
- Migration `0051_reader_ask_texts_kept.sql` (Sam, 24 Nov 2026, question 105: keep what was
  asked about, delete only what identifies the pupil): `reader_ask_texts` rebuilt without
  `member_id`, rows kept. On Remove the words now stay with the ask, under the `removed_pupils`
  id; only the membership and the pupil record go. `0050` was left as it was, since a branch
  preview may already have run it.
- `budget/store.ts` (`spendGbp`, `allBudgets`) and `usage/query.ts` add `reader_asks.cost_gbp`.
- `docs/rules.md`: the dated section for answers 49, 90 and 91 and test pupils, with a pointer
  from the rules table row in `ARCHITECTURE.md`.
- `packages/evals/evals/reader.eval.ts` and `src/reader-case.ts`: three cases, not yet run on
  the real model (needs Sam's go for the cost).

## Decisions the brief left open

- The call goes through the provider's `respond` (the Responses API, as agent steps and the
  judge), with no tools and `toolChoice: 'none'`, so it can name `reader.model`. Reasoning
  effort `low`, or none for a model the config lists as not reasoning. Output cap: the
  provider's `max_output_tokens`.
- A call that comes back without token counts is charged at its worst cost, as the gateway does.
  The mock provider gives no counts, so locally each ask costs its worst (about £0.002 on Luna).
- The pupil budget applies to the teacher's test pupil too, so "View as pupil" shows what a
  pupil meets. Its spend also counts in the workspace's, as every pupil's does.
- Order of checks, as R1's reader routes: the reading and membership before the body is read (an unknown reading is 403 `not_member` like another class's; a removed one 404), then passage (422), prompt (409), follow-up place (409),
  parent (404), limit (409), zero retention (503), pupil budget then workspace budget (429).
- Refusal codes beyond the brief's: `prompt_not_offered` for a prompt not ticked for this place,
  `follow_ups_used` for the limit, `pupil_budget_spent`, `no_zero_retention`, `provider_error`.
- The follow-up limit counts down a chain: a chain of n asks makes the next one follow-up n.
  `follow_ups_left` is the limit (the reading's, else the class's, else config's) less that.
- The passage kept and sent is the pupil's string cleaned (`cleanPassage`: no zero-width characters, `*` or backticks, one space per run), so only case and typography can differ from the reading.
- An earlier ask in a chain uses its prompt's instruction as it is now (removed or not).
- The reading's prompts are read with SQL, not the library's `list`, which can put in the
  defaults and log events: an ask writes nothing outside its own tables.

## What is left

- R3: the reader screen. Follow-ups side by side on one answer are not limited: each new chain from the same parent counts on its own, and only the pupil budget caps how many. R3 should decide whether to offer more than one.
- A code block keeps its `*` and backticks in the reading's words, but `cleanPassage` drops them from the passage, so a passage with them inside a code block is refused. R3 should decide whether code blocks are offered for highlighting.
- `reader_asks` has no hash of the prompt's hidden instruction; a later item could add one beside `safety_hash`.
- Progress for the teacher (counts per question, highlights, replies), leaving out `teacher_test`.
- The eval run (`pnpm eval -t reader`), then its baseline entries.
