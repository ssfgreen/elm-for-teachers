# The plugin platform: design spec (draft for Sam, 20 Nov 2026)

Name (Sam, 21 Nov): the platform is the **Education Plugin Studio** (the Plugin Studio for
short), in its own independent repo. In this document "the studio" means its editor, where
plugins are made.

Status: a draft to mark up. Nothing here is built yet. Plugin work waits until Elm for Schools
has moved to Kubernetes (`docs/architecture-target.md`), except R1, R2 and PP1 (the runner lane,
`library/` only), which Sam allowed to start on 21 Nov. The questions in section 13 are decided
by their suggested defaults (Sam, 21 Nov). Sections 1 to 8 are the product; 9 to 14 are the
engineering, checked against `development` at `8c48379`.

## 1. What this is

Today the curriculum and pedagogy libraries are part baked into Elm for Schools (this app). This
spec separates three things:

| Piece | What it is |
| --- | --- |
| **A plugin** | A folder of plain files, GitHub style: a manifest, data (Markdown, YAML), skills, tests, and the settings a teacher can turn. A version is a tagged snapshot. No server and no code. |
| **The plugin platform** | A separate product with three faces: a **studio** to make plugins, a **runner** that serves any plugin's tools over HTTP and MCP, and a **browser** to find and share them. |
| **A host** | Anything that uses a plugin: Elm for Schools, Claude, ChatGPT, Gemini, or a coding agent that reads the folder directly. |

Goal of the first version (Sam): a plugin studio and browser connected to Elm for Schools, with
the pedagogy library moved into this form.

## 2. Decisions already made (Sam, 20 Nov 2026)

- A plugin is a repo of files, not a server. The runner is generic.
- Publishing is **private**, **limited access** or **public**.
- Trying a draft and running its evals happen in the hosts (Elm for Schools, Claude, ChatGPT and
  so on), each from one button, so an author needs no API key in the studio (21 Nov). Bringing a
  key is optional and comes later.
- Plugin making is not recorded as research for now.
- Projects stay as they are. The studio does not replace "a project is the playground"
  (`docs/plugins.md`).
- Tools come from a fixed list with settings, never code (8 Nov 2026). Scripts are out of the
  first version.

## 3. Making a plugin in the studio

| Step | What the author does | Underneath |
| --- | --- | --- |
| 1. Start | Names the plugin, says what it is for and who publishes it | A new draft |
| 2. Add material | Drops in PDFs, Word files, slides and links | Each is converted once to Markdown (the library's ingest code) and shown beside the original to check and label |
| 3. Structure | Picks a shape for each collection: documents first; lookup table, checklist, template and entries with evidence later | A collection in the plugin |
| 4. Skills | Writes in plain words when an assistant should use the plugin, and how | A skill file |
| 5. Tools | Switches tools on from the fixed list, each with a few settings | The manifest |
| 6. Settings | Chooses which dials a teacher gets (hide entries, favour entries, a minimum rating, a subject or level) | The manifest |
| 7. Try | Presses **Test in Elm for Schools** (or Claude, or ChatGPT) and uses the draft there | Section 5 |
| 8. Test | Writes evals: realistic requests, each with what a good answer must do. Presses **Run in Elm for Schools**. | Section 7 |
| 9. Passport | Answers who stands behind it, where it was built to work, and what it must leave to a person | Section 8 |
| 10. Publish | Chooses a version number and who can see it | An unchangeable snapshot, a listing page and an address |

**Editing.** Skills and documents are edited in a visual editor that looks like the worksheet
editor in Elm for Schools but saves plain Markdown. No one types Markdown or JSON by hand.

**Starting points.** A blank plugin; files dropped in; a folder imported from a repo address; or,
from inside Elm for Schools, **Draft a plugin from my adaptations** (section 11).

**Not in the first version:** editing structured entries (the pedagogy entries, with "human
verified" and "finalised" and curators' tags). That was the request this spec grew from. It
becomes the studio's editor for collections of kind `pedagogy`, cut into items once the first
version works (section 12, milestone 10). Until then the pedagogy plugin is made from its files in
this repo and imported.

## 4. Publishing, access and copyright

| Level | Who can use it | Listed in the browser |
| --- | --- | --- |
| Private | The author only | No |
| Limited | People or hosts holding a key the author makes (and can cancel) in the studio | No |
| Public | Anyone | Yes |

New plugins start private.

Copyright works as it does on YouTube or Tes: the terms carry the licence, so there is no licence
per file.

1. **At sign-up:** terms with the author's promise (it is mine or I have permission) and a licence
   to the platform to store, convert and serve the material, including through other companies'
   assistants.
2. **At publish:** one tick, and one choice for the whole plugin of what others may do with it
   (default: use and adapt with credit).
3. **On every listing:** a report link, and quick removal.

**Submitting, without git.** Anthropic's plugin directory asks a developer for a GitHub repo, a
hand-edited `plugin.json`, a README, a licence file, a command-line check, and a form about data
handling. The studio keeps the same substance and drops the developer steps: Publish is a short
wizard.

| Step | What the author sees | Replaces |
| --- | --- | --- |
| 1. Check | Instant, automatic: the name is free and not a look-alike; the description says what it is for; the three passport sections are answered; nothing looks like pupil data; quotes are within the limit | The command-line check and the repo scan |
| 2. Listing | Filled in from what the author already wrote. Nothing is typed twice. | Editing `plugin.json` and a README |
| 3. Data questions | Does it hold personal data? Anything about a pupil who could be identified (must be no)? These answers become the passport's data statement. | The data handling form |
| 4. Promises | The tick, the reuse choice, a contact | The licence file and acknowledgements |
| 5. Who can see it | Private and limited go live at once. Public goes to a reviewer and comes back as **Passes**, **Held for a reviewer** or **Does not pass**, with the reason in plain words. | Review |

A new version is one button. The last published version stays live until the new one passes, and
hosts pinned to the old one see "update available". A developer can still work from a repo: import
by address, and export as a folder, including in the layout Claude's own plugins use.

The terms need writing or checking by the university's legal or copyright team. Review before a
public listing, if we do it, is for safety and quality and must not claim to clear copyright.

## 5. Trying a draft, with no keys

A draft is usable before it is published. The runner serves it at a private address, and the
studio has a button for each host. No model runs on the platform, so there is no key to paste.

| Button | What happens | Who pays for the model |
| --- | --- | --- |
| **Test in Elm for Schools** | Opens Elm with the draft added to the author's own workspace, marked Draft. A change in the studio shows up on the next message. | The author's Elm budget |
| **Run evals in Elm for Schools** | Elm runs the plugin's evals through its real assistant and sends the results back (section 7) | The author's Elm budget |
| **Test in Claude**, **Test in ChatGPT** | Copies the draft's address and opens that tool's connector settings, with the steps to paste it. One press where the tool offers an add link. | The author's own subscription |
| Export | Downloads the folder, for Pi or Claude Code | The author |

- A draft has no passport yet, so in Elm it is Ask first: the author allows it once in each chat.
- The link the button opens carries a short-lived code for that draft only: read the draft, and
  send eval results back. The two accounts are not linked.
- Gemini: a button only if its app accepts a connector by address. Check when it is built.
- Later, and optional: an author pastes a model key to run evals on several models from the studio.

T3 Code can use a person's Claude or ChatGPT subscription because it runs on their own machine. A
website cannot borrow those logins, which is why the testing goes to the hosts.

## 6. A teacher's controls

A plugin has two kinds of data: what the author published (the same for everyone) and each
teacher's own settings. Settings never go in the plugin.

- The plugin **declares** its settings in the manifest. They are data, not code.
- **In Elm for Schools** the Plugins screen draws them as a form, stores them per workspace and
  sends them with every call. The Pedagogy screen gains Hide and Favour on each entry.
- **In other hosts** the teacher sets them on the plugin's page on the platform, which gives them
  a personal address with their settings in it. That page is the plugin's own screen, and it works
  for any host.
- A plugin names a **viewer** for browsing (`documents`, `pedagogy`, `curriculum`). The platform
  and Elm for Schools each have these viewers built in. A plugin shipping its own screen (MCP
  Apps) is for later.

## 7. Evals: written in the studio, run in the hosts

- **Written** in a Tests tab in the studio, with no code: a realistic request, the setting (a
  class's stage and subject), and what a good answer must do: simple checks (mentions, cites a
  claim, stays under a length) and one or two criteria in plain words for a judge.
- **Kept with the plugin** as `tests/*.yaml`, so any host that can run evals can run them.
- **Run in Elm for Schools** from one button. Elm runs each eval several times through its real
  assistant, with and without the plugin, on a made-up class and never a real one. It shows the
  likely cost first. The result says whether the plugin was used at all, then quality, time and
  cost. This is better evidence than a run in the studio would be: it is the real host, with its
  real prompts and tools.
- **Results go back** to the studio, are saved with the plugin, and fill the passport's Evaluation
  section: what was tested, in which host, on which model, when, and by whom. An author's own
  runs are labelled as such, since the paper's point is that independence matters.
- **In Claude or ChatGPT** nothing can drive the chat for us, so evals cannot run by themselves
  there. Later, a guided check: the studio shows each request to paste, the runner notes whether
  the plugin was called, and the author marks the answer against the criteria.
- **Later:** a teacher who did not write the plugin runs their own evals, recorded as independent.
  Teachers testing their own skills inside a project in Elm for Schools stays as planned in
  `docs/plugins.md`.

## 8. A minimal passport

From Sam's draft paper "Passports for Plugins". A passport says who stands behind a plugin and
what it is for. It has two layers: prose for the teacher (`PASSPORT.md`), and `passport.json`,
which a host can check. The studio asks the questions as a form and writes both from the same
answers, so the two can never disagree.

**Version 1 (Sam, 21 Nov 2026).** In Sam's words: "for now it should have author(s), description
of contents, expected use, tested use, risks." There is no territory for now: much pedagogy is
generic and works anywhere. The paper's Figure 2 fields (`component`, `identity`, `territory`,
`role_statement`, `integrity`) are not used yet.

| Field | What it holds |
| --- | --- |
| `schema` | `passport/1` |
| `plugin` | `{id, version}`, as in `plugin.json` |
| `covers` | The versions it speaks for, each `{version, content_hash}`. The hash is the plugin's content hash (section 9) over every file except `passport.json` and `PASSPORT.md`, since a passport cannot hold a hash of itself (`coveredHash`, `library/src/plugin/passport-files.ts`). A changed plugin is not covered until its passport adds an entry. |
| `authors` | Every named author, `{id, name}`: the studio author id from their sign-in, never an email |
| `issuer` | Always `null` for now. Later, a stamp of verification from an organisation account (such as the University of Edinburgh). |
| `sections` | `contents`, `expected_use`, `tested_use` and `risks`. Each is `null` (not answered: shown as "not answered", never hidden) or `{text, written_by, approved_by, drafted_by_assistant}`. |

**Several named authors.** A plugin will often have several authors, and who did what is
recorded: one person writes a section, another approves it. Everyone who writes or approves is a
named author. An author may draft a section with their own assistant; it is marked
`drafted_by_assistant`, and still needs an author's approval.

**What publishing needs** (`publishCheck(passport, level)`):

| Level | The passport |
| --- | --- |
| Private | Optional. Nothing is checked. |
| Limited (named people) | A lighter one is suggested. Gaps (no passport, no authors, no covered version, a section not answered or not approved) are shown as suggestions, and the author may go ahead. |
| Public | Required. At least one covered version, and every section answered and approved by a named author, or the publish is blocked. |

At limited and public, a section that names a writer or approver who is not among the authors
blocks: that is a wrong claim, not a gap.

**What the host checks.** Elm for Schools shows the passport. A plugin with no passport, or a
version the passport does not cover (`covers(passport, version, hash)` is false), is treated as
Ask first at least. The host computes the covered hash from the plugin's files; it does not compare
the plugin hash in a runner answer, which includes the two passport files. A teacher can always be stricter (Off, Ask first), never looser.

**Territory, later.** When a passport gains a territory (country, stage, subject), checks against
a class are suggestions, not hard rules: a note or Ask first, never a refusal. They matter when a
plugin is written for one subject or one country.

- **Other hosts** (Claude, ChatGPT, Gemini) can show the passport but will not enforce it. That
  is a limit of the first version, and a finding for the paper.
- A passport is a self-report (the paper's section 9.1): the listing says so until an issuer can
  stamp it.

**The code** is `library/src/passport/` (`render.ts` writes `PASSPORT.md`). It imports only `zod` and `node:crypto`, so the studio copies the folder,
and `passport.cases.json` is the shared check that both copies agree.

**Pedagogy's passport** is the worked example (PP1b). Its sections are drafted by an assistant
from the manifest and the data and are not approved, and its authors are "not answered" until Sam
names them.

## 9. The plugin format, version 1

```
plugin.json                the manifest
PASSPORT.md, passport.json the passport: prose, and the zone a host checks
README.md                  shown in the browser
collections/<id>/          as library/collections today:
  collection.json          id, kind (documents | pedagogy | curriculum), name, licence
  docs/**/*.md | pedagogy.yaml | curriculum.json
skills/<name>/SKILL.md
tests/<name>.yaml          prompt, context, checks, criteria
```

A version is `v<semver>`, equal to `version` in the manifest (no `+build` part); the runner also
records a hash of the whole tree, `sha256:<64 hex>` over every file but dot-files, read as text. Each collection keeps its own version, computed over its own folder as now, so
moving `pedagogy-scotland` into a plugin changes no recorded `source_version`.

| Manifest field | What |
| --- | --- |
| `format`, `id` (`owner/name`), `version` | Identity |
| `name`, `description`, `tags`, `publisher` | For the browser and the Plugins screen |
| `reuse`, `reuse_note` | What others may do: `use_only`, `adapt_with_credit` (the default) or `adapt_freely` |
| `collections` | `[{ id, kind, path }]`; a path is relative, inside the plugin, and not inside another collection's folder |
| `skills` | Paths to skill folders |
| `tools` | `[{ tool, collection?, use_when?, settings? }]`, from the fixed set below; `settings` names setting keys |
| `settings` | `{ key: { type, label, default, options?, effect, collection? } }`; `options` is `[{ value, label }]` |
| `browse` | `{ view, collection }` |
| `use_in` | A hint such as `["class", "year_group"]`; the host decides |
| `tests` | A glob |

Setting types: `boolean`, `choice`, `choices`, `number`, `entries`. Effects, built into the
runner: `hide_ids`, `favour_ids` (type `entries`), `min_rating` (`choice`), `facet` (`choice` or
`choices`). `choice` and `choices` need `options`, and a default must be one of them. The built
reader is `library/src/plugin/manifest.ts`; its cases are `manifest.cases.json` beside it, and
pedagogy's manifest is `library/plugins/pedagogy/plugin.json`. For example:

```json
"settings": {
  "min_rating": {
    "type": "choice",
    "label": "Suggest only entries rated at least",
    "default": "any",
    "options": [{ "value": "any", "label": "Any rating" }, { "value": "strong", "label": "Strong" }],
    "effect": "min_rating",
    "collection": "pedagogy-scotland"
  }
}
```

The pedagogy plugin's settings, fitted to the real data (116 entries: strong 13, moderate 28,
emerging 4, practitioner wisdom 35, contested 1, not recommended 3, unrated 32):

| Setting | Effect |
| --- | --- |
| Entries I hide | Never suggested. A pupil's chosen adaptation is fetched by id and is not removed. |
| Entries I favour | Come first, marked as the teacher's preference |
| Suggest only entries rated at least... | Filters by evidence rating. Unrated entries stay (they include all 30 curriculum references), and so do contested and not recommended ones, since the assistant is told to steer away from them. |

**The fixed tool set**

| Tools | Collection kind | State |
| --- | --- | --- |
| `search`, `grep`, `list`, `read` | documents | In `library/` now |
| `entries`, `entry`, `claims`, `facets` | pedagogy | In `library/` now |
| `structure`, `outcomes`, `benchmarks` | curriculum | In `library/` now |
| `look_up`, `checklist`, `template` | table, checklist, template | Later |

The runner never writes.

## 10. The runner, the studio and the browser

**Runner.** `library/` gains `src/plugin/` (manifest, loader, settings, store). The old routes stay
until the app has moved.

- **Storage:** publishing writes one unchangeable archive per version to Cloudflare R2; the runner
  loads it on first use. No redeploy per publish, no GitHub rate limits or tokens, no tags that can
  be moved. First-party plugins stay bundled until the platform serves them.
- **Addresses:** `GET /p/<owner>/<name>` (manifest, versions),
  `POST /p/<owner>/<name>@<ver>/api/collections/<c>/<tool>` (JSON), and
  `/p/<owner>/<name>@<ver>/mcp` (MCP, that plugin's tools only). Without `@ver` it means the
  latest. A host that logs research always pins a version.
- **Access:** keys are random, stored hashed, and can be cancelled. Elm for Schools holds one host
  key, which replaces `LIBRARY_TOKEN`.
- **Elm for Schools keeps its own copy** (decided 21 Nov, `docs/architecture-target.md` section 4):
  it fetches a version's files once, checks them against the pinned hash, and answers from its own
  runner inside Elm's own deployment (as its own pod reachable only inside the cluster: the
  design, K3), so no search words leave Elm. Commercial tools
  use the hosted runner.
- **Drafts:** served at a private address with a code for that draft. Not pinned: it is always the
  latest saved draft, and each answer carries its content hash.
- **Answers and forgets:** the runner keeps no search text. Search words are the only class-related
  text that reaches it. For a draft it counts calls, so a check can tell whether the plugin was used.
- **Settings on each call:** a `Plugin-Settings` header on the JSON API, `?settings=` in a
  teacher's MCP address. The runner checks them against the manifest and keeps no state. Each
  answer carries the version, the content hash and a hash of the settings.

**Shared code is copied, and the contract is tested.** The two repos import nothing from each
other, as the app and `library/` already do not.

| Copied into the platform, then free to diverge | Kept in step by shared test files, never by a shared import |
| --- | --- |
| The editor's Markdown mapping, toolbar, slash menu and styles (not the worksheet's sync, suggestions or page styling, which a Markdown editor does not need) | The plugin format: the manifest and collection shapes |
| Sign-in | The passport zone and the territory check |
| Styling tokens and common components | The runner's addresses and answers |

The shared test files are real plugins (pedagogy first): each side must read them and agree.

**Studio and browser.**

| Question | Choice | Why |
| --- | --- | --- |
| Where | Its own repo (Sam creates it), with its own Vercel project, domain, database and secrets. It starts with a copy of `library/` as the runner. Milestones 1 and 2 are built here first, since `library/` is here. | A separate product with separate data and its own history |
| Drafts | Rows in the platform's database; publishing takes the snapshot. Export as a zip or push to a GitHub repo the author links; import from a repo address and tag. | Teachers need no GitHub account, and the repo form is kept |
| Sign-in | Google or Microsoft, with the app's sign-in code copied across | Copying keeps the two products free to change apart |
| Trying and evals | No model runs on the platform in the first version. Drafts are served at a private address, and the hosts do the trying and run the evals (sections 5 and 7). | No keys to handle, and the evidence comes from the real host |

## 11. Elm for Schools, and moving pedagogy

- **Adding a plugin:** the Plugins screen gets **Add** (an address, and a key if it is limited) and
  **Find** (the platform's public list). The app refuses kinds of collection it has no tools for.
- **The built-in set stays in config**, so study workspaces stay reproducible. Each entry gets a
  pinned address. Changing it changes `config_hash`, as any config change does.
- **The assistant's tools stay as reviewed code in the app**, chosen by the kinds of collection a
  plugin declares, so what the tools do stays covered by evals.
- **A plugin's skills join the assistant's skills.** Elm already loads skills the Agent Skills way
  (`config/skills`): only names and descriptions are in the prompt, and the assistant reads one
  when a request fits. A plugin's skills use the same route, under the plugin's trust level, and
  below Elm's own rules. Without this a teacher's plugin, which is mostly skills, would do
  nothing when tested in Elm. It changes what reaches the model (decision 3).
- **Updates.** A plugin changes by its author publishing a new version; a version, once published,
  is fixed, so a turn's record always says exactly what the assistant read.
  - Elm asks the Plugin Studio for newer versions daily and when the Plugins screen opens. The request
    names plugins only.
  - **An ordinary update is taken automatically**, and the Plugins screen says what changed.
  - **An update that changes the passport's identity, territory or role statement waits for the
    teacher**, who sees the difference first. A silent change of that kind is the failure the
    paper names.
  - **A withdrawn version** (an error, or a copyright report upheld) stops being used at the next
    check, and Elm deletes its copy.
  - **Study workspaces** stay on the versions the config names, and change only when Sam changes
    the config.
- **Draft a plugin from my adaptations.** A button in Elm for Schools. Elm's assistant reads the
  teacher's own history (the adaptations chosen for pupils, and the changes the teacher keeps
  asking for and accepting) and drafts a skill and the start of a passport, in class-level terms
  with no pupil named. The teacher reads and edits the draft inside Elm. Only on **Send to the
  studio** does it leave, as a private draft. The passport records that an assistant drafted it,
  from one teacher's practice, and at which stages and subjects: the paper's provenance section.
- **Settings** are stored per workspace and logged (section 13, decision 2).

| Stage | What changes | What the assistant gets |
| --- | --- | --- |
| 1 | Pedagogy is wrapped as a plugin (still bundled) and the app reads it at its address | Exactly the same, proved by tests on the grounding message and tool outputs |
| 2 | Teachers' settings | The same until a teacher sets one |
| 3 | Pedagogy is published on the platform; config points there | The same |
| 4 | Curriculum follows as a second plugin of kind `curriculum` | The same |

Unchanged throughout: pupils' adaptations and their entry ids, pedagogy in class and year group
chats only (the host's rule), citations, and the `pedagogy` feature switch.

Found on the way: none of the 8 pedagogy eval cases is in `packages/evals/baseline.json`, so there
is nothing to compare a run against yet.

## 12. Work items (116 points, not yet on the board)

Order (Sam, 21 Nov): plugin work waits until Elm for Schools has moved to Kubernetes
(`docs/architecture-target.md` section 8). The exception is R1, R2 and PP1, in the runner lane:
they touch `library/` alone, and Sam allowed them to start now.

| # | Item | Points | After |
| --- | --- | --- | --- |
| R1 | library: plugin manifest v1, loader, pedagogy as a plugin | 5 | |
| R2 | library: per-plugin JSON API and MCP addresses | 3 | R1 |
| A1 | plugins: reach pedagogy at its plugin address | 3 | R2 |
| PP1 | passport: zone v0.1 schema and territory check, in a self-contained folder `library/src/passport/` that the app and the platform copy and keep in step by a shared cases file (not a package both import); pedagogy's passport | 3 | R1 |
| R3 | library: apply teacher settings | 3 | R2 |
| A2 | plugins: teacher settings stored, logged, sent (migration 0037) | 5 | A1, R3 |
| A3 | pedagogy: hide and favour; settings form on Plugins | 5 | A2 |
| PP2 | plugins: show a plugin's passport; check its territory when added and in each chat | 5 | PP1, A1 |
| P0 | platform repo: skeleton, checks, and a copy of the runner from `library/` | 3 | R3, PP1 |
| P1 | platform: package, database, sign-in, terms | 5 | P0 |
| P2 | platform: drafts, file conversion, manifest form | 7 | P1 |
| P9 | platform: the Markdown editor for skills and documents, from a copy of the app's | 5 | P2 |
| P3 | platform: draft addresses and the Test in buttons | 3 | P2, R2 |
| P4 | platform: publish, access keys, runner loads from R2 | 5 | P2, R2 |
| PP3 | platform: the passport form, needed to publish beyond private | 5 | P2, PP1 |
| P5 | platform: browser, public list, report link | 3 | P4 |
| P7 | platform: export as a repo, import from an address | 3 | P4 |
| A4 | plugins: add by address, or by a link from the studio (migration 0038) | 5 | A3 |
| E1 | plugins: a draft added from the studio, marked Draft | 3 | A4, P3 |
| A6 | plugins: a plugin's skills join the assistant's skills, under its trust level | 5 | A4 |
| A5 | plugins: Find, from the platform's public list | 2 | A4, P5 |
| S3 | pedagogy: serve from the platform | 3 | A5, P7 |
| P6 | platform: Tests tab to write evals; take results from hosts; show them and fill the passport | 5 | P3, PP3 |
| E2 | plugins: run a plugin's evals in Elm for Schools, with and without it, on a made-up class | 5 | E1, P6 |
| E3 | plugins: judged criteria, the cost shown first, results sent back to the studio | 3 | E2 |
| P8 | platform: guided checks in Claude and ChatGPT | 3 | P6 |
| E4 | plugins: draft a plugin from my adaptations, reviewed in Elm | 5 | A6 |
| E5 | plugins: send that draft to the studio | 3 | E4, P3 |
| P10 | platform: the reviewer's queue for public listings | 3 | P5 |

Migrations 0035 and 0036 stay reserved for #80 and #84. The platform numbers its own.

| Milestone | Items | Points | What Sam can try |
| --- | --- | --- | --- |
| 1 | R1, R2, A1, PP1 | 14 | Nothing looks different: pedagogy now arrives as a plugin, with a passport on file |
| 2 | R3, A2, A3, PP2 | 18 | Hide and favour entries; set a minimum rating; read pedagogy's passport, and see it ask first in a class outside its territory |
| 3 | P0, P1, P2, P9 | 20 | In the studio: sign in, drop files in, write a skill in the visual editor |
| 4 | P3, A4, E1, A6 | 16 | Press Test in Elm for Schools and use the draft, skills included, in a chat; test it in Claude too |
| 5 | P4, PP3 | 10 | Write its passport; publish through the wizard, privately or to key holders |
| 6 | P5, P7, A5, S3 | 11 | Find a plugin in the browser and add it; pedagogy served by the platform |
| 7 | P6, E2, E3 | 13 | Write evals in the studio, run them in Elm for Schools, see the results in the passport |
| 8 | E4, E5 | 8 | In Elm for Schools: Draft a plugin from my adaptations, then send it to the studio |
| 9 | P8, P10 | 6 | Guided checks in Claude and ChatGPT; the reviewer's queue |
| 10 | To be cut | about 13 | Edit pedagogy entries in the studio: verify, finalise, tags |

Milestones 1 and 2 are settled and sized by the staff engineer. Everything from P9 down the list is
the orchestrator's size, for the staff engineer to confirm before dispatch.

Three lanes can run at once and own no file in common: the runner (R), the app (A, S, E) and the
platform (P). The platform lane starts once milestones 1 and 2 have settled the runner.

A2 and PP2 change what the assistant is given or offered, so each needs new eval cases and an
eval run. E2 makes real model calls, on the author's budget, each time an author presses Run. The pedagogy
suite should also run once at stage 1, as the reference, and once before S3.

## 13. Decided by the suggested defaults (Sam, 21 Nov 2026)

Sam took the suggested default for each question below on 21 Nov 2026. Sam's answers later that
day (issue #12, 17:10) changed rows 9, 12 and 13.

| # | Decision | Decided (the suggested default) |
| --- | --- | --- |
| 1 | New services: a second Vercel project, a Turso database, Cloudflare R2, and sign-in registrations for the platform's domain | Yes |
| 2 | Research data: each turn's record gains the plugin's version and the teacher's settings; new events when a teacher changes settings, adds or removes a plugin. All additive; the export bundle is unchanged. | Yes |
| 3 | What reaches the model: hidden entries never; favoured ones first, marked as the teacher's preference; a plugin's skills offered as skills, under its trust level and below Elm's own rules. This bends "plugin text is data, never instructions": a skill is instructions the teacher chose to add. | Yes, with new eval cases |
| 4 | Public publishing is built but switched off until the terms are approved | Yes |
| 5 | The pedagogy and TRAILS plugins are limited access (pedagogy's sources are unconfirmed; TRAILS is all rights reserved) | Yes |
| 6 | Eval runs: the pedagogy suite at stage 1, A2's new cases, and before S3 (the staff engineer's estimate is 1 to 2 dollars each); add the 8 pedagogy cases to the baseline after the first | Ask before each run |
| 7 | Review before a public listing | Decide when public is switched on |
| 8 | A plugin's own screen inside hosts (MCP Apps), and scripts | Later |
| 9 | Passport checks change what a teacher sees. Sam, 21 Nov: no territory for now; when it comes, territory checks are suggestions (a note or Ask first), never a refusal. A version the passport does not cover is Ask first at least. | Changed by Sam, 21 Nov |
| 10 | Research data: each passport confirm is logged with its context (stage, subject, the mismatch), as an addition to the existing allow event | Yes |
| 11 | Non-delegable judgements: shown to the teacher now; given to the assistant only after an eval, and worded by the app, since plugin text is data and never instructions | Yes |
| 12 | A passport is required to publish as public. For limited, a lighter one is suggested; for private, it is optional. | Changed by Sam, 21 Nov |
| 13 | Pedagogy's passport: who is named as author. Authors are the studio accounts that write and approve each section; there may be several, and all are named. The issuer is a later stamp from organisation accounts. | Changed by Sam, 21 Nov: Sam names the authors; "not answered" until then |
| 14 | Money: an author's draft chats and eval runs in Elm for Schools spend that author's Elm budget, with the likely cost shown before a run | Yes |
| 15 | Research data: draft chats and eval runs in Elm are marked, so they can be left out of analysis; evals use a made-up class | Yes |
| 16 | The platform is its own repo, created by Sam and added to the orchestrator's access, from milestone 3 | Yes |
| 17 | Draft a plugin from my adaptations: the teacher's history goes to Elm's model as it does in any chat; the draft is class-level, names no pupil, and leaves Elm only when the teacher sends it | Yes |
| 18 | Who reviews a public submission | Sam's team, in a simple queue, once public is switched on |
| 19 | Elm for Schools answers plugin questions from its own copy of each version, not by asking the Plugin Studio each time | Yes |
| 20 | Updates: ordinary ones are taken automatically; ones that change the passport's identity, territory or role statement wait for the teacher; study workspaces stay pinned by config | Yes. Territory is not in `passport/1`; which v1 changes wait for the teacher is open for Sam (question 30). |

## 14. Risks

- A manifest placed inside a collection's hashed folder would change its version. R1's test pins it.
- A runner in another Vercel project adds a network hop to each grounding call, but only for
  drafts and commercial hosts, since Elm keeps its own copy of published versions: same region,
  cached keys, versions held in memory.
- Test in Claude or ChatGPT depends on how each tool lets a connector be added, which changes often:
  check when each button is built, and fall back to copying the address with the steps.
- The platform could grow into a second app: keep the studio to the fixed lists of tools and settings.
- A class's stage and subject are free text, so territory checks can misfire: match stage by school
  year, and let a subject mismatch only warn in the first version.
- A passport is a self-report (the paper's section 9.1): the listing says so, and stamps are marked
  asserted until they can be given by the person stamping.
- Draft material with unconfirmed licences could be made public by mistake: new plugins start private.
