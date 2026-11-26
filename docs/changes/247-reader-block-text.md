# #247: the server reads reading blocks through `readerBlock`

24 Nov 2026. Follow-up from R3's review (#236, PR #241). The model now reads a reading exactly as
the pupil's page shows it, and the page offers asks on any passage that is not blank or too long.

## What was built, and where

- **`server/src/reader-asks/article.ts`**: `blockText(b)` is `readerBlock(b).text` (shared
  `readerText.ts`), except a table, which keeps its old layout: one row per line, each cell's text
  apart by three spaces. Pictures, dividers and page breaks still give ''. `plainLine` and
  `plainTable` went. `readingText` still joins blocks with a blank line.
- **`cleanPassage`** keeps `*` and backticks: in the reader's text they are words the pupil sees.
  It still drops invisible characters and folds space. `checkHighlight` matches with `*` and
  backticks set aside on both sides (comparison only, in `holds`), so a passage carrying marks
  the reading lacks is still found. A passage of marks alone is looked for as it is.
- **`client/src/reader/asks.ts`**: `readsTheSame` and the `*`/backtick rule went. `askable`
  refuses only a passage over 1,000 characters (`too_long`) or blank (`not_here`). Its signature
  keeps the block, unused, so `ReaderScreen.tsx` is unchanged.
- **Tests**: `article.test.ts` (each edge block reads as `readerBlock(b).text`, the table layout,
  plain paragraphs), `passage.test.ts` (every range of every block, code blocks and edge blocks
  included, is offered and found), `request.test.ts` (one new snapshot pins the `<reading>` text
  for the edge markup; the two old snapshots are byte-identical), `asks.test.ts`,
  `ReaderAsks.test.tsx` (a code block is now offered; space alone is not).

## What goes to the model now

Only the `<reading>` text of an ask's first user message changes, and only for blocks with markup
the old `plainLine` misread. Before and after, for one block each:

| Markup | Before | After |
| --- | --- | --- |
| Escapes `A back\\slash, a \<u> tag and [a\](https://example.com) bracket.` | `A back\\slash, a \ tag and a\ bracket.` | `A back\slash, a <u> tag and [a](https://example.com) bracket.` |
| Escaped marks `Five \* three \` makes.` | `Five \ three \ makes.` | ``Five * three ` makes.`` |
| Code mark `` Some `a*b` code. `` | `Some ab code.` | `Some a*b code.` |
| Heading `## 1. Introduction to Rome` | `Introduction to Rome` | `1. Introduction to Rome` |
| Heading `#### Four` | `Four` | `#### Four` |
| Paragraph `1. Read the passage below.` | `Read the passage below.` | `1. Read the passage below.` |
| Paragraph `• Pasted from Word` | `Pasted from Word` | `• Pasted from Word` |
| Quote line `> - Julius Caesar` | `Julius Caesar` | `- Julius Caesar` |
| Table cells `1. Step`, `2) Mix` | `Step   Mix` | `1. Step   2) Mix` |
| Second line `# not a heading here` | `not a heading here` | `# not a heading here` |
| `If x<y and y>z then.` | `If xz then.` | `If x<y and y>z then.` |
| `a <b> tag` | `a  tag` | `a <b> tag` |
| `Before <!-- a note --> after.` | `Before  after.` | `Before <!-- a note --> after.` |
| `A road ![map](asset:01J001) here.` | `A road  here.` | `A road ![map](asset:01J001) here.` |

Byte-identical (checked block by block against the old code): plain text, bold, italic,
underline, the editor's highlight, colour, font and size spans, links, `<line/>`, headings 1 to 3,
list items and old lists, checklists, quotes, code blocks, tables, pictures, dividers and page
breaks. The passage in `<highlight>` and in `reader_ask_texts` now keeps literal `*` and
backticks. Unchanged: the five parts and their order, the fence tags themselves, the safety
instruction, prompt instructions, `config_hash` and safety hash.
**Asks made before and after this change cannot be told apart by hash.**

The fences: `<reading>` and `<highlight>` tags a teacher or pupil typed now reach `fenced`
(`request.ts`) untouched, since the reading's words no longer drop tags. One pass let a tag
hidden inside another through (`</rea</reading>ding>` left `</reading>`), so `fenced` now takes
them off until none is left, in any form: a space after `<`, attributes, a closing slash
(`</reading x="1">`, `</reading/>`, `< /reading>`), a format or control character anywhere in
it (`</read\u200Bing>`, `</reading\u0000>`), but not a longer name such as `<readings>` (reviews
of PR #252). Text outside a tag is kept as it is, and the pattern stays linear on long or
unclosed input. A message without such tags is byte-identical.

Not research data (reader asks are kept apart, `docs/rules.md`) and not a prompt change. No eval
was run.

## Decisions

- A passage of only `*` or backticks would match everything once marks are set aside, so it is
  looked for as written.
- One old expectation changed on purpose: `checkHighlight(BLOCKS, 'straight **roads**, with')`
  now gives `straight **roads**, with` (the marks the pupil's string carried are kept and sent).

## What is left

- `askable` keeps an unused `block` argument; drop it when `ReaderScreen.tsx` is next touched.
- `request.ts` changed in its code (only `fenced`), allowed by the orchestrator's review although
  the brief listed it as must-not-change.
- Tags, comments and asset ids a teacher typed as text now reach the model as the pupil sees them.
