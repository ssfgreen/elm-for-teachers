# Plugins and libraries (8 Nov 2026)

Teachers choose what the assistant can reach, as plugins, on the **Plugins** screen (called Customise until 12 Nov 2026). The first two
kinds of plugin are the picture library (ARASAAC, built in) and **libraries**: curated collections of
education documents, converted once to markdown, that the assistant searches like files in a
terminal (list, grep, read) before it ever goes to the web.

Libraries are a separate product in `library/`. This app never imports it: it talks to a library
server over HTTP, the same way any other agent would talk to it over MCP. It lives in this repo for
now and can move to its own repo later.

## Decisions (Sam, 8 Nov 2026)

| Decision | What |
| --- | --- |
| Pilot | The study is in pilot: models, tools and prompts change as we go. Nothing is deleted, every turn records what it ran under, so earlier data can still be read and replayed. |
| Where libraries live | `library/` in this repo, its own package, server and (later) curation frontend. The app reaches it only over HTTP. |
| Trust levels | Each plugin, per workspace: **Use freely**, **Ask first** (the assistant asks in the chat and the teacher allows it for that chat), or **Off**. Library text is always data, never instructions, whatever the level. |
| Long turns | Vercel `maxDuration` 300 s; more steps; the turn has its own time budget (`agent.max_turn_ms`) and finishes with a reply before the function limit. |
| First libraries | Education Scotland (experiences and outcomes; Open Government Licence) and TRAILS (trails.scot, AI literacy resources). Qualifications Scotland next, once agreed with them. |

## The library format

A library holds collections. A collection is a folder:

```
library/collections/<id>/
  collection.json      id, name, publisher, description, licence, licence_url, homepage, sources
  sources.lock.json    each source fetched: url, etag, last_modified, sha256, fetched_at
  docs/**/*.md         one markdown file per document
```

Each markdown file starts with frontmatter:

```yaml
---
title: Numeracy and mathematics: experiences and outcomes
source_url: https://education.gov.scot/media/sz2lnh1g/numeracy-maths-eo.pdf
licence: OGL-UK-3.0
fetched_at: 2026-11-08
source_modified: 2025-08-01      # when known
content_hash: 3f9a…               # of the source as fetched
type: experiences-and-outcomes
subject: [Numeracy and mathematics]
level: [Early, First, Second, Third, Fourth]
codes: [MNU 0-01a, MNU 1-01a, …]
---
```

The markdown is written for grep: one experience and outcome per line, with its code at the start
(`MNU 2-03a: I can …`), headings for curriculum areas, organisers and levels. A collection's
**version** is a short hash of all its files' paths and contents: it changes when anything does.

Originals (PDFs) are not committed; `sources.lock.json` records what was fetched, so a refresh can
tell what changed.

## The library server's API

JSON over HTTP. Every response carries the collection `version`.

| Call | Body | Returns |
| --- | --- | --- |
| `GET /api/collections` | | `[{ id, name, publisher, description, licence, licence_url, homepage, version, doc_count, updated_at }]` |
| `POST /api/collections/:id/search` | `{ query, filters?, limit? }` | ranked `results: [{ path, title, source_url, snippet, score }]` |
| `POST /api/collections/:id/grep` | `{ pattern, ignore_case?, path_glob?, filters?, context? (0 to 3), max_matches? }` | `matches: [{ path, line, text, before?, after? }]`, `truncated` |
| `POST /api/collections/:id/list` | `{ path_glob?, filters? }` | `files: [{ path, title, lines, subject, level, type }]` |
| `POST /api/collections/:id/read` | `{ path, from_line?, max_lines? }` | `{ path, title, source_url, licence, from_line, to_line, total_lines, text }` |

`filters` match frontmatter: `{ subject?, level?, type?, code? }` (case-insensitive, any value of a
list field). Regexes are JavaScript syntax, at most 200 characters, run with a time limit; output is
capped. Details as built (8 Nov 2026): search results also carry `line`, for a `read` to follow; `code`
matches by prefix (`MNU 2` finds every second level numeracy code); limits are `search` 1 to 50
(default 10), `grep` 1 to 200 matches (default 50), `read` 1 to 500 lines (default 200); unknown
keys are refused with 400, and a missing collection or document is 404. Paths are relative to
`docs/` and lines count from 1 after the frontmatter. `/health` lists the collections. `/mcp` offers the same five as MCP tools (`list_collections`, `search`, `grep`, `list`,
`read`, each with a `collection` argument), for other agents.

## Pedagogy collections (12 Nov 2026)

A collection can be of kind `pedagogy` (`"kind": "pedagogy"` in `collection.json`): a
`pedagogy.yaml` of sources, passages, entries and claims (`library/pedagogy-sample/`), not
markdown. It is navigated by its structure, with no vectors: `entries` (by type, facets such as
stage, subject, lesson purpose, barrier and hint, `aligns_to`, and words), `entry`, `claims` and
`facets`. Details in `library/README.md`. In the app it is a plugin of kind `pedagogy` with the
usual trust levels; the assistant uses it only in class and year group chats (`docs/classes.md`,
"Pedagogy"), and the teacher browses it on the Pedagogy screen.

## Keeping libraries up to date

`pnpm --filter @edw/library ingest <collection>` fetches every source, compares it with
`sources.lock.json` (ETag, Last-Modified, then the content hash), converts what changed, and prints
a report: new, changed, unchanged, gone, failed. The report and the diff of the markdown are what a
curator reviews. Next: a weekly GitHub Action runs the ingest and opens a pull request with the
report, so every library version is a commit someone approved. Later the curation frontend does the
same for schools without git.

## In this app

- **Plugin catalogue:** config `plugins` (hashed with the rest of the config): id, kind (`pictures`
  or `library`), name, publisher, description, licence, homepage, default trust, and for a library
  its server URL and collection (`LIBRARY_URL` overrides the server URL).
- **Per workspace:** `plugin_settings` (migration) holds the teacher's trust level per plugin;
  `plugin_grants` holds "allowed in this chat" for Ask first. Changes are events through the
  `EventStore`: `plugin_trust_set` and `plugin_grant`.
- **Tools:** `search_pictures` is offered only when ARASAAC is not Off. Libraries share one set of
  tools with a `library` argument (`library_search`, `library_grep`, `library_list`,
  `library_read`), offered when any library is not Off; a catalogue message lists the libraries on
  offer. For an Ask first library with no grant in the chat, the tool returns no results and tells
  the model to ask; the reply shows the teacher an **Allow** button.
- **Logging:** `chat_prompt` records the plugins on offer and their trust levels; each library tool
  call's output carries the collection version, and is kept in the gateway call's trace.
- **Plugins screen:** a screen in the workspace to browse and search the plugins, read what each is
  (publisher, licence, what it holds) and set its trust level.

## Next: teachers make their own plugins (planned 8 Nov 2026)

Sam (8 Nov): a teacher (say an ASN teacher with prompts for different learning needs and
guidance documents) should be able to build a plugin, test it, and offer it to others. Nothing
below is built yet.

### A project is the playground

A project already holds what a plugin needs: instructions, files and chats to try things in. It
gains two tabs, **Tools** and **Tests**, and its skills (P.3) live there too. When the teacher is
happy, **Publish as plugin** takes a versioned snapshot:

| In the plugin | From the project |
| --- | --- |
| Skills | The project's skills (P.3), each versioned |
| Documents | The files the teacher ticks (their text, served like a library collection) |
| Tools | The tools picked on the Tools tab, with their settings |
| Name, description, publisher | A short form at publish time |

The project stays the playground: editing it changes nothing published until the next Publish,
which makes a new version. A published plugin appears on the Plugins screen like any other, with a trust
level. Instructions stay with the project (they are how the teacher works, not part of the plugin)
unless the teacher copies them into a skill.

### Tools from a list, with settings

The Tools tab lists tools to switch on, each with a few settings rather than code:

| Tool | What the assistant can do | Settings |
| --- | --- | --- |
| Library search | Search a library (as now) | Which library; levels or subjects to keep to |
| Picture search | ARASAAC (as now) | None |
| **Lookup table** | `look_up("working memory")` returns the teacher's rows word for word | The table (columns of the teacher's choosing) |
| **Checklist** | Check a document against the teacher's list; comment on what fails | The checks; which are automatic (sentence length, reading age, font size) and which the model judges |
| **Template** | Fill a teacher's template into a new doc, as a suggestion | The template doc |
| **Questions first** | Ask the teacher set questions before starting | The questions |

Each tool also has a "Use this when…" line in the teacher's words, like a skill. Lookup table and
checklist come first: they are the most use for ASN and the simplest. Teachers never write code.

### Tests, and a budget for them

The Tests tab is P.4 applied to the whole plugin: examples, simple checks and plain-English
criteria, each run with and without the plugin (or against its last version), a verdict ("Helps",
"No clear difference", "Makes it worse"), and the answers side by side. A separate **Testing
budget** section shows runs used and left (today and in total), the estimated cost, and the
history of test runs; the teacher can pick fewer runs or a cheaper model to save it, and ask for
more. Admins set each workspace's budget on `/admin` (P.6). Test runs never use the chat's
message limits.

### What is recorded for research (Sam: yes, record plugin use)

- Making: `plugin_publish` with the full snapshot and version; skill, tool and test edits as their
  own events (`skill_*`, `plugin_tool_*`, `skill_test_*`), with the text before and after.
- Using: `chat_prompt.plugins` gains each plugin's version; each tool call (in the gateway trace)
  names the plugin and version; `plugin_trust_set`, `plugin_request` and `plugin_grant` as now.
- Testing: every run, its checks, the judge's verdicts and the teacher's blind picks.
- The bundle gets `plugins.jsonl` (every version), `plugin_tests.jsonl` and `plugin_test_runs.jsonl`.

### Order (points)

| Step | What | Points |
| --- | --- | --- |
| T.1 | Teacher skills in a project (P.3) | 5 |
| T.2 | Tools tab: lookup table and checklist, with settings; library and picture search as choices | 8 |
| T.3 | Tests tab: examples, checks, with and without, verdict, answers side by side (P.4 core) | 12 |
| T.4 | Testing budget: the teacher's section, and budgets on `/admin` (part of P.6) | 6 |
| T.5 | Publish as plugin: versioned snapshot, shown on the Plugins screen, logged | 8 |
| T.6 | Template and questions-first tools; blind comparison in tests | 8 |
| T.7 | Sharing beyond one workspace | Needs teacher accounts (D.4) |

### Open questions for Sam

1. In the pilot, who sees a published plugin: only its maker, or every workspace once an admin
   approves it on `/admin`? (Sharing between teachers properly needs accounts, D.4.)
2. Is the testing budget counted in runs or in pounds?
3. Pupil-specific content: plugins hold general guidance only, and the template is where a teacher
   adds a pupil's details in their own doc. Is a warning at publish time enough?
