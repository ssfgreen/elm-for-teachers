# Target architecture: two deployments, and pupils (draft for Sam, 21 Nov 2026)

Status: a draft to mark up, with Sam's decisions of 21 Nov in section 9. Nothing here is built
yet; the first work items are on the board (section 8). Checked against the code at
`7b63894` by the staff engineer, and against the guide of 17 Nov ("How the worksheet assistant
handles data"). The plugin side is in `docs/plugin-platform.md`.

## 1. The shape

| Deployment | Holds | Runs on |
| --- | --- | --- |
| **Elm for Schools** | Everything about teachers, classes and children | Vercel and Turso now. It moves to Kubernetes before more is built (Sam, 21 Nov): first Oracle Cloud's free tier (London), then University of Edinburgh infrastructure. The same code runs on both. |
| **Education Plugin Studio** (Plugin Studio for short) | Published knowledge, its authors and drafts. Nothing about a child. | Vercel, a SQLite-style cloud database (Turso) and Cloudflare. It stays there. |

Outside both: ELM (the model gateway, EDINA), sign-in and rosters (Google, Microsoft, Glow),
ARASAAC (picture search), the file bucket (Google Cloud or R2), and commercial tools (Claude,
ChatGPT, Gemini), which talk only to the Plugin Studio.

**Two repos.**

| Repo | Holds | Deploys to |
| --- | --- | --- |
| Elm for Schools (this one) | The app, the client, the worker, Kubernetes settings | Vercel now; our own Kubernetes, first on Oracle Cloud's free tier (London), then at Edinburgh |
| Education Plugin Studio (new, independent) | The editor, the runner, the marketplace, the plugin format and passport checks; copies of Elm's editor and sign-in code | Vercel, Turso, Cloudflare |

Neither imports the other. They agree through the plugin format, the runner's answers and a set
of shared test plugins. The Plugin Studio publishes the runner as a container image, which Elm
runs inside its own deployment (Sam, 21 Nov); as its own pod reachable only inside the cluster
(the design, K3). Until the new repo exists, the runner is `library/` here (plugin milestones 1 and 2).

## 2. Elm for Schools today

| Part | What it is | Where |
| --- | --- | --- |
| Server | One Fastify app as one Vercel function (300 s limit, Dublin) | Vercel |
| Library | `library/` with its collections bundled in, a second function at `/library` | Vercel |
| Client | The built React app | Vercel CDN |
| Database | Turso (libSQL), `aws-eu-west-1` | Turso |
| Files | Images and original reference files in an S3-style bucket (R2, EU) | Cloudflare |
| Model | ELM at `elm.edina.ac.uk`; picture search at ARASAAC | EDINA |
| Sign-in | OpenID Connect with Google and Microsoft | Google, Microsoft |

Tables now:

| Purpose | Tables | Personal data |
| --- | --- | --- |
| Workspaces | `sessions`, `config_versions`, `schema_migrations` | A label can name a teacher |
| Accounts | `accounts`, `sign_ins`, `account_invites` | Teacher: provider subject, email, name |
| Work | `threads`, `docs`, `blocks`, `block_revisions`, `block_splits`, `comments`, `projects`, `preferences`, `assets`, `reference_files`, `reference_pages` | The teacher's content; can hold pupil details the teacher typed |
| Assistant | `chat_turns`, `gateway_calls` | Teacher. Pupil rows are kept in full in the call log (`pupil_rows_in_gateway_log` is `"full"`). |
| Research | `events` | Teacher behaviour. The pupil table appears only as its shape and a hash. |
| Classes | `schools`, `year_groups`, `classes`, `class_pupils`, `class_curriculum`, `pupil_adaptations` | Pupils: made-up labels, with needs (health data) |
| Other | `plugin_settings`, `plugin_grants`, `budget_topups`, `make_boards` | No |

Pupils today are made-up labels only; the key to real pupils stays with the teacher. In a class
chat every pupil row goes to the model, only when the provider is marked zero retention.

## 3. Making Elm portable

What ties the code to Vercel and Turso is small. The app already runs as a plain Node server, and
a `Dockerfile` already builds one image.

| Need | Now | On Kubernetes (Oracle's free tier first, then Edinburgh) |
| --- | --- | --- |
| Server | One function | The same image, 2 copies, serving the client too |
| Plugin runner | The `/library` function | Its own pod from the runner's image, reachable only inside the cluster |
| Database | Turso | **libSQL (the SQLite server), run by us in our own Kubernetes** (Sam, 21 Nov: we make our own provisions). One pod with its own disk, the same client and SQL as now. Its changes are copied continuously to storage inside the University, never the file bucket, so a restore loses seconds at most. |
| Files | R2 | An S3-style bucket outside the University: Google Cloud Storage, or R2 as now (Sam, 21 Nov). The code already speaks S3, so either is a setting. |
| Slow work (marking) | None | **A `jobs` table** in the same database, run by a worker. No new service to run or to put in a DPIA. |
| Migrations | Run at start | A Kubernetes Job before each rollout (K2) |
| Secrets | Vercel settings | Kubernetes Secrets, same names |
| Ingress | Vercel | Buffering off (the chat streams), a 300 s timeout, outbound only to ELM, sign-in, ARASAAC and the Plugin Studio |

While Elm runs on Oracle, the live data stays on Vercel and Turso until Sam says it may move.
K2 changes the wording of the
`ARCHITECTURE.md` rule that migrations run against live Turso on deploy, since they become their
own command.

**Why SQLite, not PostgreSQL (21 Nov).** PostgreSQL earns its keep under heavy write contention;
this workload has little. Writes are small (an edit to a block, an event, a turn) and each
assistant turn waits seconds on the model. At the scale in view (a few dozen teachers, and later a
few classes of pupils at once, say 300 people) that is at most around a hundred small writes a
second at a peak, well within one SQLite writer on a local disk, which manages thousands. Today's
slowness on writes is the round trip to Turso, which a database in the same cluster removes.
Staying saves about 30 points and leaves the order of the research event log untouched. What
PostgreSQL would add is a standby copy and automatic failover: for a pilot, a restore in minutes
from a continuous copy is enough. K4 keeps PostgreSQL possible if Elm ever runs for many schools.

Two things to fix on the way: the admin password is refused only on Vercel production, so it
would work in production on Kubernetes; and the client's address is trusted only when a Vercel
variable is set (K6).

## 4. Plugins: Elm keeps its own copy

A plugin is updated by publishing a new version (2.0 after 1.0). Each version, once published,
is fixed, which is what lets Elm keep a copy: it fetches a version's files once, checks them
against that version's hash, and answers the assistant's questions from its own copy. Elm asks
the Plugin Studio for newer versions daily and when the Plugins screen opens, and fetches them
(`docs/plugin-platform.md` section 11, Updates).

Decided (Sam, 21 Nov) by the suggested defaults in `docs/plugin-platform.md` section 13: Elm
answers from its own copy, and the runner runs inside Elm's own deployment (Sam, 21 Nov); as its
own pod reachable only inside the cluster (the design, K3).

| | Ask the hosted runner each time | Fetch once, answer inside Elm (decided) |
| --- | --- | --- |
| DPIA | The Plugin Studio handles search words, which can carry a class's needs | Nothing about a class leaves Elm. The only request out names a plugin version. |
| Network | A hop on every lookup | Local |
| The Plugin Studio down | Class chats lose their plugins | Cached versions keep working |
| Drafts under test | Served at their address | Fetched before each message, answered locally |

Commercial tools still use the hosted runner in the Plugin Studio. The platform publishes the runner
as a container image; the two repos still share no imports. This changes
`docs/plugin-platform.md` section 10, and does not affect its milestones 1 and 2.

## 5. Pupils signing in

A pupil cannot be a workspace, so pupils get their own tables.

| | (a) Ids only (recommended) | (b) Names stored |
| --- | --- | --- |
| Asked of Google or Microsoft | That this is the same person as last time. No name, no email. | Name and email too |
| Stored | `pupil_identities`: provider, tenant, an opaque id | The same, plus name and email |
| Linked to a pupil row | `pupil_links`: by the teacher, by a one-use join code, or by a roster | Same |
| What the teacher sees | The made-up label, with the real name beside it fetched live from the school's roster with the teacher's own sign-in, never stored | Names read from our database |
| Data protection | Pseudonymous ids beside needs | Names beside health data: identifiable special category data |

Rosters (`roster_links`, `roster_members`): Google Classroom needs a sensitive permission that
Google reviews; Microsoft needs consent from the school's administrator; Glow is one national
Microsoft tenant, so its consent decides. **One-use join codes need none of these**, and are the
fallback from day one.

## 6. Pupil-facing work

| Table | What it holds | A child's data | Kept |
| --- | --- | --- | --- |
| `activities` | A piece of work a teacher sets: close reading, or a worksheet as homework; who releases marks; the budget | No | With the workspace |
| `activity_versions` | The frozen content: the passage, the teacher's questions, the preset follow-on options and marking criteria; or a worksheet's blocks as they were | No | While assigned |
| `assignments` | A version set for a class, with open, due and close dates | No | With the workspace |
| `attempts` | One pupil's work on one assignment: answers, status | Yes | Until a teacher deletes it. Nothing is removed automatically, and a pupil cannot delete. |
| `attempt_turns` | Each highlight, chosen question, chosen follow-on and reply | Yes | As attempts |
| `feedback` | Marks and comments: drafted by the model, edited and released by the teacher | Yes | As attempts |
| `pupil_calls` | The cost of each model call. No text. | No, once the attempt is deleted | Kept |

The pupil's assistant is not the teacher's:

| | Teacher's assistant | Pupil's assistant |
| --- | --- | --- |
| Input | Open chat | Choices only: a teacher's question, a preset follow-on, a highlight. The server writes the message. |
| Tools | Edits to documents, plugins | None: one model call per choice |
| Prompt | The agent prompt | Its own pupil prompt and marking prompt |
| Limits | The workspace budget | A budget per pupil, set by the teacher and drawn from the workspace budget, with a cap per assignment |
| Models | The picker | Zero retention only |

Pupil tables never reach `events`, the call log or the research export, and a test will pin that.
Pupils have not consented to the study.

## 7. Where each kind of data lives

| Data | Store | Deployment | A child's personal data? |
| --- | --- | --- | --- |
| Teacher accounts | libSQL | Elm | No |
| Pupil identities, links, rosters | libSQL | Elm | Yes |
| Classes, pupil rows, adaptations | libSQL | Elm | Yes |
| Worksheets, chats, model calls | libSQL | Elm | Can be |
| Pupil attempts, marking | libSQL | Elm | Yes |
| Research events | libSQL | Elm | No (shape only) |
| Uploaded files, images | S3-style bucket outside the University (Google Cloud or R2), UK or EU region | Elm's bucket | Can be: listed as a processor in the DPIA |
| Database backups | University storage | Elm | Yes |
| Plugin content | Archives in Cloudflare R2, with a checked copy inside Elm | The Plugin Studio | No |
| Plugin authors, drafts, keys, listings | Turso | The Plugin Studio | Must not be (checked on save) |
| Eval results | Turso | The Plugin Studio, sent from Elm | No (made-up class) |

## 8. First work items (on the board, 21 Nov: K1 #95, K2 #96, K3 #99, K4 #97, K5 #100, K6 #98)

| # | Item | Points | After |
| --- | --- | --- | --- |
| K1 | server: deployment settings in one place, not read from `VERCEL_*` (structural) | 3 | |
| K2 | server: migrations as their own command, and a readiness check | 3 | |
| K3 | deploy: Kubernetes base with libSQL and its continuous backup, the bucket settings and the runner as its own pod reachable only inside the cluster, plus a compose file the browser tests run against | 5 | K1, K2 |
| K4 | db: own the database types, so no module imports the libSQL client (structural) | 3 | K1, K2 |
| K5 | jobs: a jobs table, a worker and a cron route, not used yet | 5 | K2 |
| K6 | auth: refuse the admin password in production wherever it runs, not only on Vercel | 2 | K1 |

K1, K6 and the plugin item A1 all change settings: since #120 each group is its own file under
`server/src/env/`, joined in `env.ts`, which all three touch, so still one at a time, never
together. K4 touches import lines across the server: between milestones. None needs an eval run. The pupil features are
not cut into items yet. Plugin work waits until the move is done, except R1, R2 and PP1 (the
runner lane, `library/` only), which Sam allowed to start now (`docs/plugin-platform.md`
section 12).

## 9. Decisions

**Decided (Sam, 21 Nov 2026)**

- **Where Elm runs:** it moves to Kubernetes before more is built. The first target is Oracle
  Cloud's free tier (London), the second University of Edinburgh infrastructure.
- **Pupil identity:** ids only. Real names are joined in live, for the signed-in teacher only,
  and never stored. One-use join codes are the fallback.
- **Where real pupils first use Elm:** only on Edinburgh infrastructure, after its DPIA. For
  real pupils the pupil switch stays off everywhere else: Vercel, Oracle and local. Local
  development and e2e runs with made-up pupils are fine.
- **Marks and feedback:** the teacher releases them.
- **Deleting pupil work:** only teachers can delete it. Nothing is removed automatically. At the
  end of a class's school year the teacher is asked to keep or delete, and deleting a workspace
  deletes its pupils' work.
- **The database:** we run it ourselves in our own Kubernetes. The engine is an engineering
  choice (Sam, 21 Nov): SQLite, as libSQL (section 3).
- **Files:** an S3-style bucket outside the University (Google Cloud or R2), listed as a processor
  in the DPIA. Database backups stay inside the University.
- **The Education Plugin Studio** becomes its own independent repo.
- **Pupil model calls:** paid from the teacher's workspace budget; the teacher assigns a budget
  to each pupil.
- **The plugin runner for Elm:** the questions in `docs/plugin-platform.md` section 13 take their
  suggested defaults, so the runner runs inside Elm's own deployment (section 4).

**Open**

| # | Decision | If Sam does not mind |
| --- | --- | --- |
| 5 | Is pupil activity research data? Sam: to be decided. | Built as not recorded until decided |
| 9 | What reaches the model from a pupil | The passage, the chosen question and option, the highlight, answers for marking. Never a name. Zero retention only. |
| 10 | The admin password in production on Kubernetes | Refused, as on Vercel production |
| 11 | The pupil rows kept in the model call log (the scrub was switched off on 13 Nov) | Left as it is (full) until Sam says |
| 13 | The Oracle account | Sam creates it in the London region and upgrades it to pay as you go, so its free machines are not reclaimed. Until then K3 is built and tested locally only. |
| 14 | Moving the live data to Oracle (is Oracle a data processor?) | Waits for Sam |
| 15 | Where database backups go while Elm runs on Oracle (no live data there until Sam says) | University storage, as decided; until a University bucket exists, K3 is tested locally with a stand-in |

Still open from the guide of 17 Nov: ELM to confirm in writing the provider, region and zero
retention per model; the data controller and lawful basis; the safeguarding route.

## 10. Risks

- Consent from Glow and councils, and Google's review, could take months: join codes need neither.
- Pupil text could leak into the research record through code shared with teachers: a separate
  store for pupil calls, and a test on the export.
- Model replies to children, and a passage that carries hidden instructions: safety evals, checks
  on the output, teacher release by default.
- Moving the live study data from Turso to our own libSQL, once Sam says it may move: a dump and
  load of the same engine, proved by comparing every workspace's export before and after, and
  practised on a copy first.
- One database machine, no standby: if it fails, Elm is down until a restore. A restore practised
  before any real pupil data, and on a schedule after.
- The runner image and Elm's tools could drift: pin the image, and keep the shared test plugins.
