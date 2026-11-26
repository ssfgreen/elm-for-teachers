# #131 PP1a: passport v1 schema and publish check, no territory

**Built.** `library/src/passport/`, a self-contained folder the studio copies as it is:

- `schema.ts`: `parsePassport(raw)` for schema `passport/1` (`plugin {id, version}`, `covers
  [{version, content_hash}]`, `authors [{id, name}]`, `issuer: null`, and `sections` with
  `contents`, `expected_use`, `tested_use`, `risks`, each `null` or `{text, written_by,
  approved_by, drafted_by_assistant}`). Throws `passport.json: <field>: <message>`.
- `check.ts`: `publishCheck(passport | null, level)` gives `{blocking, suggestions}`, each a list
  of `{code, section?, message}`; `covers(passport, version, hash)`.
- `passport.cases.json`: the shared cases (check at each level, refusals, covers). The studio's
  copy must pass the same file.
- `passport.test.ts`: runs the cases, and scans every non-test file in the folder: only `zod`,
  `node:crypto` and `./` imports (no `../`).

**Decisions not in the brief.**

- At limited and public, a writer or approver who is not in `authors` **blocks** (codes
  `unknown_writer`, `unknown_approver`): a wrong claim, not a gap. Private checks nothing at all.
- At limited, no passport at all is a suggestion (`no_passport`), not a block (Sam: "suggested for
  limited in minor form").
- No authors is its own code, `no_authors` (blocking at public).
- The four sections sit under `sections`, not at the top level. Unknown fields are refused
  (`.strict()`), so a `territory` field is refused until a later schema adds it.
- An author id may not contain `@` or spaces, so an email cannot be used as one.
- Section `text` must not be blank: an unanswered section is `null`.
- `node:crypto` is allowed by the scan but not used.

**Docs.** `docs/plugin-platform.md` section 8 rewritten for version 1; section 13 rows 9, 12, 13
changed to Sam's answers. Row 20 keeps Sam's wording, with a note that which v1 changes wait for
the teacher is open for Sam (question 30). Elsewhere in that file (sections 4, 10, 11, 12) "territory" still appears in plans for
later items (PP2, the review wizard): not changed here, since this item owns sections 8 and 13 only.
`library/README.md` gains one line for `src/passport/`.

**Left.** PP1b (#103): `render.ts` writes `PASSPORT.md`, and pedagogy's `passport.json`. Nothing
calls `publishCheck` yet: the studio's publish step (PP3) and Elm's display (PP2) will.
