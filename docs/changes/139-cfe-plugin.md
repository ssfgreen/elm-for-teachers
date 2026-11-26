# 139: Curriculum for Excellence as a plugin

## What was built

- `library/plugins/cfe/plugin.json`: `elm/cfe` 0.1.0 over two collections that stay in
  `library/collections/` and are placed at `collections/<id>` when the plugin loads, as pedagogy's is.
  - `cfe-curriculum` (curriculum): `structure`, `outcomes`, `benchmarks`.
  - `education-scotland-eo` (documents): `search`, `read`.
- `library/plugins/cfe/README.md`: what it holds, the gaps in benchmark coverage, and the OGL v3
  attribution line.
- `library/src/plugin/cfe.test.ts`: the manifest, the collection versions unchanged, the
  attribution, the tree hash (equals `treeHash` over the placed files, stable across loads,
  changes with the README or a collection file) and the `/p/elm/cfe` routes.
- `bundled.test.ts` now expects two bundled plugins.
- One entry for the plugin in `library/README.md`, Plugins section.

Served at `/p/elm/cfe[@0.1.0]` (JSON API and MCP), and under `/library/p/...` on Vercel, which
already bundles `library/plugins/**`.

## Decisions

- Reuse `adapt_with_credit`: the OGL allows copying and adapting with attribution.
- `grep` and `list` are off for the E&O documents: the brief named search and read, and
  `outcomes` already finds by code.
- No settings and no skills. `use_in` is `class` and `year_group`, as pedagogy's.
- `browse` is `curriculum` on `cfe-curriculum`; nothing reads `browse` yet.
- The tree hash is not pinned as a literal in the test, so rebuilding the curriculum does not
  break CI; the test checks how it is made and that it moves with the content.

## Licence, checked 21 Nov 2026

https://education.gov.scot/terms-of-use (last updated 1 Nov 2025): its material is Crown copyright
and may be reused free of charge under the Open Government Licence (linked to v3), not including
logos. Images and videos are Crown copyright unless marked; third-party material is not covered.
The plugin holds only the text of the E&Os and benchmarks.

## Cost

Loading both bundled plugins from disk takes about 230 ms in the tests (the E&O markdown and the
curriculum JSON are read and hashed). On Vercel that is paid once per cold start.

## Left

- The app does not use the plugin yet: its chats still call the old `/api` routes.
- The runner does not read `use_when` or settings yet.
