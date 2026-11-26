# 142: fill citations from each entry's sources (C2)

No teacher-visible change. Citations still reach no tool answer and nothing new goes to the
model, so no eval.

## What was built

- `library/src/pedagogy/fill-citations.ts` (`pnpm --filter @edw/library fill-citations [path]`):
  for every rated entry with no `evidence.citations`, follows claims → `supported_by` passages →
  `source_id` and writes one citation per distinct source, in the order the claims first reach
  it. A source on `doi.org` becomes `{kind: doi, doi, citation}` when the rating takes a DOI; any
  other source `{kind: url, url, description: <source title>}`. Each carries `derived: true`.
  Entries that already have citations, and unrated ones, are left alone, so a second run changes
  nothing.
- It splices text in at positions found with the yaml Document API (the line where the next key
  after `evidence` starts), instead of re-serialising: `yaml`'s `toString()` does not give this
  file back byte for byte. It refuses evidence written inline rather than rewrite it.
- `pedagogy-scotland/pedagogy.yaml` filled: 84 entries, 262 citations, 3 of them `doi`. The diff
  is 1132 lines added, 0 removed; every added line is one of `citations:`, `- kind:`, `url:`,
  `description:`, `doi:`, `citation:` or `derived: true`, and the parsed file with `citations`
  removed is deep-equal to the old one.
- `types.ts` and `citations.ts`: `url` and `doi` citations take an optional `derived: true`
  (only `true` is read; anything else is dropped). This is the smallest change that keeps the
  mark after loading; C1's parser dropped unknown fields.
- Tests: `fill-citations.test.ts` (a small fixture: order, de-duplication, doi only where the
  rating takes one, untouched entries, evidence as the last key, byte-for-byte except the added
  lines, idempotent, and the shipped file: strict load, 84 rated entries all cited, no problem).
  `citations.test.ts`: the test that pinned strict loading refusing the shipped file now expects
  it to load strictly with no warning, which is the change C1's review asked for.

## Refreshing the library

`validate.py` rebuilds `pedagogy.yaml` from `pedagogy-sample/parts`, which hold no citations. So
after copying `out.yaml`, run `pnpm --filter @edw/library fill-citations` (library/README.md,
step 3), or the strict tests fail.

## Versions

- `pedagogy-scotland` collection version: `7367c9dffc20` → `47d5acf4ec95`. The `elm/pedagogy`
  plugin hash changes with it. Both are computed at load; nothing in the repo pins either value.

## Decisions the brief did not cover

- The brief said 10 entries carry a DOI. By its own rule (a source URL on doi.org) it is 3
  entries, from 2 sources. 10 is the number of *sources* with a DOI written anywhere (in `url`
  on a publisher site such as Springer or SAGE, or in `version`). Those stay `url` citations:
  reading DOIs out of `version` notes or publisher paths is a guess, and the URL citation is
  already valid.
- A `doi` citation's text is `Authors (year). Title. Publisher.`, from the source fields.
- An entry is cited with every source its own claims reach, even a claim it shares with another
  entry. `adp-ACC-preferred-font` and `cau-ACC-dyslexia-fonts` list each other's claims, so each
  cites the other's sources. That is what the entries say they rest on, so it stays.
- The new lines go above any comment lines on the key after `evidence`, so a comment stays with
  its key. The shipped file has none there.
- A practitioner wisdom entry would get a `url` citation even for a doi.org source (that rating
  takes no DOI). None of the 35 such entries reaches one today.

## What is left

- `pedagogy-sample/` is not filled (not in this brief); `validate.py` still does not know
  about citations.
- The studio should call `loadPedagogy(text, { strict: true })` on save.
