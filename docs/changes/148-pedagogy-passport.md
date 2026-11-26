# 148: pedagogy's passport and PASSPORT.md (PP1b)

## What was built

- `library/src/passport/render.ts`: `renderPassport(passport)` writes `PASSPORT.md` from a parsed
  `passport.json`. Pure, imports only `./schema.js`. Authors and sections that are not answered
  show "Not answered."; each answered section ends with who drafted or wrote it and who approved
  it, by name (or by id when the person is not among the authors).
- `publishCheck` now has `no_covers`: an empty `covers` blocks at public and is a suggestion at
  limited. Cases in `passport.cases.json`; `docs/plugin-platform.md` section 8 says so.
- `library/src/plugin/passport-files.ts`: the disk side, kept out of `passport/` so that folder
  stays copyable. `coveredHash(files)` is the plugin's `treeHash` without `passport.json` and
  `PASSPORT.md` (a passport cannot hold its own hash); `readPassport`, `writePassportMd`.
- `pnpm --filter @edw/library passport` (`src/plugin/write-passport.ts`): writes `PASSPORT.md`
  for each bundled plugin with a `passport.json`, and says whether the passport covers the plugin
  as it is now, printing the current hash.
- `library/plugins/pedagogy/passport.json` and `PASSPORT.md`: four sections drafted by an
  assistant from the manifest and the collection (counts of entries, claims, passages, sources),
  `written_by` and `approved_by` empty, no authors (question 28). `covers` is 0.1.0 at
  `sha256:1b930d4f...`. At limited: nothing blocking; suggestions `no_authors` and four
  `not_approved`.

## Decisions

- `written_by` is empty as well as `approved_by`: no person wrote the drafts, and naming the
  assistant is not allowed (an author id is a person). Rendered as "Drafted by an assistant."
- `no_covers` is a gap like the others: blocking at public, a suggestion at limited.
- A changed plugin is not covered until its passport says so (confirmed in review). The test
  checks that the current version and covered hash are among the `covers` entries, so any change
  to `pedagogy-scotland`, `plugin.json` or the README fails it until an entry is added. The script
  prints the new hash; it does not add it to `covers` itself, since `covers` is a claim by the
  authors.
- `covers` names `coveredHash`, not the runner's `Plugin.hash` (which includes the passport
  files). A host computes the covered hash from the plugin's files. The runner's answer shape is
  unchanged.

## What is left

- Sam names the authors and approvers (question 28); then fill `authors`, `written_by`,
  `approved_by` and rerun the script.
- The section counts in Contents are written by hand from today's collection; they go stale with
  the collection, at the same time as `covers`.
- Later: Elm should render `PASSPORT.md` as untrusted Markdown.
