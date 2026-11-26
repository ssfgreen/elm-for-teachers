# 132: a citation behind every evidence rating (C1)

No teacher-visible change. Nothing new reaches the model, so no eval.

## What was built

- `library/src/pedagogy/types.ts`: `Citation` (`practitioner_example {text}`, `url {url,
  description}`, `doi {doi, citation}`, and `unreadable {given}` for anything else, so it is
  reported rather than lost), `CITATION_KINDS`, `EVIDENCE_RATINGS`; `Entry.evidence.citations`.
- `library/src/pedagogy/citations.ts`: `parseCitations` (reads `evidence.citations`),
  `kindsFor(rating)`, `entryCitationProblems(entry)` and the pure `citationProblems(lib)`.
- `library/src/pedagogy/load.ts`: parses citations; `loadPedagogy(text, { strict?, warn? })`.
  Not strict, every citation problem goes to `warn` (default `console.warn`) as one line with
  the count and the first three, and the library loads. Strict, they join the other problems
  and loading throws.
- `library/src/pedagogy/query.ts`: `entry()` spread the whole entry into its answer, so it now
  rebuilds `evidence` as `{rating, rationale}`. That keeps citations out of `pedagogy_entry`
  and the HTTP `entry` call. `entries`, `claims` and `facets` never carried them.
- Tests: `citations.cases.ts` (every rating with every kind, every rating with none, unrated,
  malformed URLs and DOIs, unknown kinds) run by `citations.test.ts`, which also loads today's
  `pedagogy-scotland` library (84 warnings: one per rated entry) and checks strict refuses it.
  `query.test.ts` checks no answer carries a citation. `test-fixture.ts` gained one citation per
  rated entry so it loads with no warning.

## Decisions the brief did not cover

- Every citation problem (not only a missing one) is a warning when not strict: a bad URL or
  DOI never stops the library loading.
- One warning line per load, not one per entry: 84 lines on each cold start would bury other logs.
- A DOI written as `doi:10...` or `https://doi.org/10...` is read as the bare DOI. A DOI must
  match `10.<4 to 9 digits>/<no spaces>`. A URL must be http or https with a dot in its host.
- Empty `text`, `description` or `citation` is a problem.
- A single citation written as an object (not a list) is read as a list of one.
- An unknown rating string follows the "other ratings" rule (URL or DOI). The loader still does
  not check ratings against the enum; that is unchanged.
- An unrated entry with a citation is a problem ("citations but no evidence rating").

## What is left

- C2: fill `evidence.citations` in `pedagogy-sample/` and `collections/pedagogy-scotland/pedagogy.yaml`.
  `validate.py` does not know about citations yet.
- The studio should call `loadPedagogy(text, { strict: true })` on save.
