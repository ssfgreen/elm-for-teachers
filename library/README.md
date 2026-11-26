# Library

Curated collections of education documents, converted once to markdown, that an assistant
searches like files in a terminal: list, grep, read, and a ranked search. The contract is
`docs/plugins.md`. This is its own product: the app in `packages/` never imports it and talks to
it over HTTP; other agents can use MCP.

## What is here

```
collections/<id>/
  collection.json      id, name, publisher, description, licence, licence_url, homepage, sources
  sources.lock.json    each source fetched: url, etag, last_modified, sha256, fetched_at, docs
  docs/**/*.md         one markdown file per document, with YAML frontmatter
src/core/              pure functions over a collection in memory: list, search, grep, read, filters
src/server/            the JSON API and MCP, over node:http
src/ingest/            fetch, compare with the lockfile, convert, report; one adapter per collection
plugins/<name>/        a bundled plugin: plugin.json and README.md, and passport.json and PASSPORT.md if it has a passport (see Plugins below)
src/plugin/            reads a plugin manifest and builds a plugin from its files
src/passport/          a plugin's passport: schema passport/1, the publish check and PASSPORT.md's renderer; imports only zod and node:crypto
```

| Collection | Source | Licence |
| --- | --- | --- |
| `education-scotland-eo` | The English experiences and outcomes PDFs on education.gov.scot, one file per curriculum area, one experience and outcome per line starting with its code | Open Government Licence v3 |
| `pedagogy-scotland` | The pedagogy library sample v0.1 (`pedagogy-sample/`, merged by its `validate.py`), copied as `pedagogy.yaml` and given citations by `fill-citations`: 116 entries and 437 claims, every one a draft, and 262 citations derived from the 84 rated entries' sources | Mixed, per source; most not yet confirmed |
| `cfe-curriculum` | Structured: every experience and outcome by area, organiser, level and stages, and the benchmarks for Second level (P7) and Third level (S1), tied to their rows' codes. Built from `education-scotland-eo` and the benchmark PDFs | Open Government Licence v3 |
| `trails` | Every resource on trails.scot (Teaching Responsible AI Literacy in Schools), from its WordPress API, with the text of the Word, PowerPoint and PDF files each links to (and those in zips) under `files/<resource>/` | All rights reserved; used with its publisher's agreement (Sam Green, 8 Nov 2026) |

A document's line numbers count from 1 after its frontmatter. A collection's version is the
first 12 hex characters of a sha256 over every file's path and content.

## Serve

```sh
pnpm --filter @edw/library serve          # PORT, default 8787
```

It loads every folder in `collections/` (or `LIBRARY_COLLECTIONS`). The JSON API is under `/api`
(see `docs/plugins.md`); MCP is at `/mcp`, stateless streamable HTTP, with the tools
`list_collections`, `search`, `grep`, `list` and `read`.

```sh
curl -s localhost:8787/api/collections
curl -s localhost:8787/api/collections/education-scotland-eo/grep -H 'content-type: application/json' -d '{"pattern":"^MNU 2-03"}'
```

## Pedagogy collections

A collection whose `collection.json` has `"kind": "pedagogy"` holds a `pedagogy.yaml` of sources,
passages, entries and claims (`pedagogy-sample/pedagogy_library_schema.yaml`) instead of markdown.
It is navigated by its structure, not by similarity: no vectors.

| Call | Body | Returns |
| --- | --- | --- |
| `POST /api/collections/:id/entries` | `{ types?, ids?, facets?, aligns_to?, text?, recommended_only?, limit? }` | `{ total, truncated, entries }`, each with its claims (id, text, support type) |
| `POST /api/collections/:id/entry` | `{ id }` | the entry in full, its claims with passages and sources, `related` and `linked_from` |
| `POST /api/collections/:id/claims` | `{ ids }` | each claim with passages, sources and `verification` (`located`, `locator_to_confirm`, `not_fetched`); `missing` |
| `POST /api/collections/:id/facets` | `{}` | counts of types, statuses, evidence ratings and every facet value |

`facets` filters any of each list. Stage, level, area and subject also match an entry with no
value or with `curriculum_area: all` (it applies everywhere); subjects match either way round
("English and literacy" finds "english"); barrier and the other facets must match. `text` needs
every word in the entry or its claims. MCP has the same as `pedagogy_entries`, `pedagogy_entry`
and `pedagogy_claims`.

Loading refuses a library that breaks the copyright rules (HANDOFF.md section 4): a quote over 15
words, two quotes from one source, or a quote from a `locator_only` source. To update it:

1. run `python3 validate.py parts out.yaml` in `pedagogy-sample/`;
2. copy `out.yaml` to `collections/pedagogy-scotland/pedagogy.yaml`;
3. run `pnpm --filter @edw/library fill-citations`. `parts/` holds no citations, so step 2 wipes
   them; this puts them back, from each entry's claims, passages and sources, and only adds lines.

Each rated entry should carry `evidence.citations` (`src/pedagogy/citations.ts`): a
`practitioner_wisdom` rating takes `{kind: practitioner_example, text}` or `{kind: url, url,
description}`; any other rating a `url` or `{kind: doi, doi, citation}`; an unrated entry none.
A `url` or `doi` citation may carry `derived: true`: `fill-citations` wrote it from the entry's
sources, rather than a curator by hand.
Loading warns, in one line, on a missing or malformed citation and goes on; `loadPedagogy(text,
{strict: true})` refuses instead. Citations are for curators and go into no tool answer.

## The structured curriculum

`pnpm --filter @edw/library curriculum [--levels second,third]` rebuilds
`collections/cfe-curriculum/curriculum.json` (and `sources.lock.json`): outcomes from the E&O
collection's markdown (`src/curriculum/outcomes.ts`), benchmarks from each area's benchmark PDF
(`src/curriculum/sources.ts` lists them; `benchmarks.ts` reads the three-column tables, finding the
columns two ways and keeping the better). It prints, and stores as `coverage`, how many of each
level's codes have benchmarks. A benchmark belongs to its table row, so to all that row's codes:
the documents do not tie a bullet to one outcome. On 12 Nov 2026 every Second level Literacy and
English code and every Third level Social studies code had benchmarks; Health and wellbeing's
wellbeing codes (HWB x-01a to x-19a), most of RERC and a few others had none, and some Numeracy
and Health and wellbeing rows have a wrong organiser name. Check those before relying on them.

| Call | Body | Returns |
| --- | --- | --- |
| `POST /api/collections/:id/structure` | `{}` | areas with organisers and counts per level, `benchmark_levels`, `coverage` |
| `POST /api/collections/:id/outcomes` | `{ level?, stage?, area?, organiser?, code?, text?, limit? }` | `{ total, truncated, outcomes }` |
| `POST /api/collections/:id/benchmarks` | `{ codes?, area?, level? }` | `{ benchmark_levels, benchmarks }` |

MCP: `curriculum_outcomes`, `curriculum_benchmarks`.

## Plugins

A plugin is a folder that bundles collections, skills and tests under one manifest, `plugin.json`
(format 1, `docs/plugin-platform.md` section 9). `src/plugin/` reads it, and the server serves
each plugin at its own addresses (below); the routes above are unchanged.

| File | What |
| --- | --- |
| `manifest.ts` | `parseManifest`: checks a manifest and throws a message naming each wrong field. Also the fixed tool set and the kind of collection each tool needs (`TOOL_KINDS`), the reuse values and the setting types and effects |
| `load.ts` | `buildPlugin(files)`: the manifest, each collection built from its own folder (with its own version, as now), the tree hash and the declared settings. `loadPlugin(dir)` reads a folder |
| `hash.ts` | `treeHash`: sha256 over every file, sorted by path, as path, NUL, content, NUL, written `sha256:<64 hex>`. Not the same as a collection's 12-character version. From disk it covers every file but dot-files (and dot-folders), each read as UTF-8, so a plugin holds text files only |
| `bundled.ts` | `loadBundledPlugins()`: every folder in `plugins/`. A collection still in `collections/<id>` (or `LIBRARY_COLLECTIONS`) is placed at the path its manifest names |
| `store.ts` | `loadPluginStore()`: the bundled plugins in memory, from `LIBRARY_PLUGINS` (default `plugins/`), each id with its versions; the latest is the highest semver |
| `routes.ts` | `routePlugin`: the addresses under `/p/` |
| `passport-files.ts` | A plugin's `passport.json` and `PASSPORT.md` on disk: `readPassport`, `writePassportMd`, and `coveredHash`, the tree hash without those two files, which is what a passport's `covers` names |
| `write-passport.ts` | `pnpm --filter @edw/library passport`: writes `PASSPORT.md` for each bundled plugin with a `passport.json`, and says whether the passport covers the plugin as it is now |
| `manifest.cases.json` | Manifests the reader must accept or refuse, as data, so another reader (the app, the platform) can be checked against the same cases |

The manifest's main fields: `format` (1), `id` (`owner/name`), `version` (semver), `name`,
`description`, `reuse` (`use_only`, `adapt_with_credit`, the default, or `adapt_freely`) and
`reuse_note`, `collections` (`[{ id, kind, path }]`, the path relative, inside the plugin and not
inside another collection's folder),
`tools` (`[{ tool, collection?, use_when?, settings? }]`), `settings`
(`{ key: { type, label, default, options?, effect, collection? } }`), `browse`, `use_in`, `skills`
and `tests`. A tool must be on the fixed list and point at a collection of its kind:

| Tools | Kind of collection |
| --- | --- |
| `search`, `grep`, `list`, `read` | documents |
| `entries`, `entry`, `claims`, `facets` | pedagogy |
| `structure`, `outcomes`, `benchmarks` | curriculum |

Setting types are `boolean`, `choice`, `choices`, `number` and `entries`; effects, which the runner
applies (not yet), are `hide_ids` and `favour_ids` (type `entries`), `min_rating` (`choice`) and
`facet` (`choice` or `choices`). A default must fit its type and be one of the options.

The bundled plugins:

- `plugins/pedagogy/` (`elm/pedagogy`, 0.1.0): the pedagogy library, over `pedagogy-scotland`.
  Its passport (`passport.json`, and `PASSPORT.md` written from it) was drafted by an assistant;
  no author is named or has approved it yet (QUESTIONS.md question 28).
- `plugins/cfe/` (`elm/cfe`, 0.1.0): Curriculum for Excellence, over `cfe-curriculum`
  (`structure`, `outcomes`, `benchmarks`) and `education-scotland-eo` (`search`, `read`); OGL v3,
  attribution in its README.

Pedagogy's collection, `pedagogy-scotland`, still lives in `collections/` (Vercel bundles that folder), and is placed at
`collections/pedagogy-scotland` in the plugin's tree when it loads. Its version is the same either
way, so no recorded `source_version` changes.

## Addresses

Each plugin has its own addresses beside the old ones. `@<ver>` pins a version; without it the
address means the latest (highest semver). A bundled plugin has one version.

| Address | What |
| --- | --- |
| `GET /p/<owner>/<name>[@<ver>]` | `{ plugin, versions, manifest }` |
| `POST /p/<owner>/<name>[@<ver>]/api/collections/<c>/<tool>` | The JSON API, on the plugin's own collections and only the tools its manifest switches on |
| `/p/<owner>/<name>[@<ver>]/mcp` | MCP with the plugin's tools only; `list_collections` lists only its collections |

Every answer keeps `version`, the collection's version (the app records it as `source_version`),
and adds `plugin: { id, version, hash }`. An unknown plugin or version, a collection the plugin
does not declare, or a tool its manifest does not switch on answers 404 with a reason. On Vercel
the same addresses sit under `/library/p/...` and need `LIBRARY_TOKEN`, as the old routes do. A
`Plugin-Settings` header is not read yet.

```sh
curl -s localhost:8787/p/elm/pedagogy
curl -s localhost:8787/p/elm/pedagogy@0.1.0/api/collections/pedagogy-scotland/entries -H 'content-type: application/json' -d '{"types":["activity_type"],"limit":3}'
```

## Ingest

```sh
pnpm --filter @edw/library ingest education-scotland-eo
pnpm --filter @edw/library ingest trails --report /tmp/trails-report.md
pnpm --filter @edw/library ingest trails --force   # convert again after changing a converter
```

Each run fetches every source one at a time, with a pause between and the User-Agent
`edw-library-bot/0.1`, sending `If-None-Match` and `If-Modified-Since` from the lockfile. A source
whose content hash is unchanged is not converted again. The report lists sources as new, changed,
unchanged, gone or failed; a failed source keeps its last good documents, and the run exits 1.
Downloads are untrusted: they sit in a fresh temporary folder, are only parsed, and are deleted at
the end. Originals are never committed.

In a cloud sandbox, Node's fetch only uses the proxy with `NODE_USE_ENV_PROXY=1`.

## Add a collection

1. Write an adapter in `src/ingest/<id>/`: `meta` (what goes in `collection.json`), `discover`
   (the sources, from a page or an API) and `convert` (one source to markdown files). Keep the
   parsing in pure functions and test them on a saved fixture.
2. Register it, with the hosts it may fetch from, in `src/ingest/main.ts`.
3. Run the ingest, read the markdown, and commit `collection.json`, `sources.lock.json` and `docs/`.

Write markdown for grep: one idea per line, headings for structure, and frontmatter with
`title`, `source_url`, `licence`, `fetched_at`, `content_hash`, `type`, and where they apply
`subject`, `level` and `codes`, which the filters read.

## Keeping it up to date

The update flow is: run the ingest, read the report and the diff of the markdown, commit. Next, a
weekly GitHub Action could run both ingests and open a pull request with the report as its
description, so each library version is a commit someone approved. It is not set up yet: it
needs a decision on who reviews those pull requests.

## How clean the conversion is

- **Experiences and outcomes**: every code printed in a table ends up at the start of a line with
  its statement: 1,495 lines carrying 1,818 codes over 16 files (1,402 distinct; the
  across-learning files repeat some). The PDFs are tables that pdf.js reads out of order, so
  statements are paired with codes by position. Rough edges: the opening and appendix pages are
  running text and read less cleanly; a few codes are printed oddly in the source and are tidied
  (`TCH 02-02a` becomes `TCH 2-02a`, `RME 0-07a / 1-07a` becomes two full codes) or kept as
  printed (`MLAN 1-03`, `1-06` and `1-13` have no letter in the PDF).
- **TRAILS**: the page text and links come through well. Linked files: slides keep their speaker
  notes, but a slide's text comes in the order of its XML, not always top to bottom. PDFs that
  are pictures only (posters, printable posts: four on 8 Nov) have no text; reading them needs OCR.
  Videos and images stay links.
