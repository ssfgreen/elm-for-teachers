# How work gets done (agents, 13 Nov 2026)

Sam talks to one agent, the **orchestrator**. It plans with a small panel, sends work to worker
sessions, has every pull request reviewed, and comes back to Sam only with what needs Sam. The
orchestrator's instructions are the `orchestrate` skill (`.claude/skills/orchestrate/`); the roles
are in `.claude/agents/`.

## Why

On 12 Nov, 110 commits landed from several branches at once. Between 21:37 and 21:59 there were
eight merges, most of them `development` merged back into a feature branch, and one branch took
`development` in four times. Branches ranged from 1 commit to 21 commits (four features in one).
Ten merged branches in two days touched `WorkspaceScreen.tsx` and `api/participant.ts`. The
collisions come from parallel work on the same files more than from size.

## The flow

1. **Sam asks** the orchestrator for something, in plain words.
2. **Plan.** Read-only agents look at it. The staff engineer always runs first, alone (design,
   files touched, risks, splits). The product manager (the teacher, the study, priority) and the
   designer (screens, wording, accessibility) run only when that plan shows a real teacher-facing
   choice the docs do not already settle. The orchestrator merges their views into **work items**.
3. **Sam agrees the plan.** One message: the items, their points, and only the questions that need
   Sam (below). Sam comments; the orchestrator revises; Sam says go.
4. **Board.** Each item becomes a GitHub issue (labels `points:N`, `status:...`). The board lives in
   GitHub, not in a file in the repo, so it never causes merge conflicts.
5. **Dispatch.** Up to **3 workers** at once, each a separate cloud session on its own branch from
   `development`, with a brief naming the files it owns. An item starts only when no running item
   owns the same file (see "Who may touch what").
6. **Pull request into `development`.** Each worker opens one. CI runs on it.
7. **Review.** The PR reviewer checks security, the rules that hold it together, and whether the
   architecture is getting worse. Its notes go back to the worker, which fixes and pushes; the
   reviewer looks again. Round 1 reads the whole PR; rounds 2 and 3 read only the commits since
   the last review, at medium effort. At most three rounds, then the orchestrator steps in.
8. **Merge into `development`.** When CI is green, the review is clean and nothing needs Sam, the
   orchestrator merges (Sam's standing permission; see "Decisions"). A branch behind only by
   merges touching other files, and reported mergeable by GitHub, is not brought up to date
   first; the next check-in looks at CI on `development`, and a red run is fixed before any other
   merge (`review.md` step 4).
   A PR that builds something listed under Planned in `ARCHITECTURE.md` moves its line to Current.
9. **Tell Sam.** A short note per merge: what teachers will notice, points, checks, and what was not
   tried in a browser.
10. **Release.** Before `development` goes to `main`, the orchestrator writes Sam one note: what to
    try, the migrations that will run, settings needed on Vercel, research data changes, and what
    was not checked. Sam merges and pushes `main`.

## Sizes

Story points on the scale in `docs/PLAN.md` section 4 (1, 2, 3, 5, 8, 13).

| Points | What happens |
| --- | --- |
| 1 or 2 | Grouped with other small items in the same area into one dispatch of 3 to 7 points. |
| 3 to 7 | One worker, one branch, one PR. The normal unit: a 3, a 5, or small items in one area adding up to no more than 7. |
| 8 | Split before dispatch. A structural split of a large file is often the first piece. |
| 13 | Not planned yet: the staff engineer breaks it down. |

Points measure size, not files. Two 2-point items on `WorkspaceScreen.tsx` still wait for each
other.

The 3 to 7 range is where we start (Sam, 13 Nov 2026), to be changed from evidence. The history shows how big branches were, not which sizes
went well. Each closed issue records points planned, commits, lines and review rounds, and the
health pass moves the range if the numbers say so.

## Models

| Role | Model | Effort | Why |
| --- | --- | --- | --- |
| Orchestrator | Opus 5.5 | high | A trial from 13 Nov (Sam: "have a go"). Its work is mostly reading the board and sending briefs, and Opus costs half as much per token. |
| Expert | Fable 5.2 | high | One thorny question at a time, asked by the orchestrator (below). |
| Staff engineer | Opus 5.5 | high | Cuts the work and gives out files. |
| PR reviewer | Opus 5.5 | high (rounds 2 and 3: medium) | The quality gate. Being compared with Fable (below). |
| Product manager, designer | Opus 5.5 | medium | Reading and summarising. |
| Workers | Opus 5.5 | medium | Most of the spend. Items are small, specified, tested and reviewed. |

The role agents carry their model and effort in `.claude/agents/*.md`; the orchestrator passes the
workers' to `create_session`. Fable costs twice what Opus does per token (3 Nov 2026 list prices).

Rules (Sam, 13 Nov 2026):

- **Workers start at medium.** If reviews keep finding problems (two of any five merged items need
  more than one round, or have a blocking finding a careful worker would have caught), raise
  workers to high and say so to Sam.
- **One item up to Fable** when it touches the parts where timing matters (the editor's sync, the
  chat, the assistant's write path), or when a PR is still blocked after three rounds.
- **The expert**: for a really thorny decision (a review still blocked after three rounds, a
  design choice in the editor's sync, the chat or the assistant's write path, a merge that went
  wrong), the orchestrator sends that one question, with only the context it needs, to a Fable
  agent (an Agent call with `model: fable`), instead of running on Fable itself.
- **Look again at the orchestrator's model** after a few days, from briefs that had to be
  rewritten and merges that had to be undone.
- Nothing above high without numbers that show it helps.

Two experiments:

1. **Reviewer, Opus against Fable: finished 13 Nov, the reviewer stays on Opus** (Sam). Four PRs
   were reviewed by both (#5, #8, #9, #10; the tables are on issues #2, #3, #4 and #6). On the
   first three, both found the problem that mattered; Opus filed it as a note under a clean
   verdict and Fable called it blocking. Fable found one docs error Opus missed, and cost 1.5 to
   3.5 times as much. The gap was in rating, not finding, so the reviewer's instructions were
   tightened (a reproduced bug is blocking; clean means mergeable unread). After that Opus and
   Fable agreed on #10, and Opus alone asked for two real changes on #11. If Opus reviews start
   passing things that later break, run a Fable review on the next few PRs again.
2. **Workers**, read from the `record:` comment on each closed issue. The first four items (#2, #3, #4, #6) ran on Fable 5.2 by accident of
   inheritance; from the fifth on, workers run on Opus 5.5 at medium. Compare review rounds,
   blocking findings, CI failures and cost for a finished item of the same points. It is not a
   fair test (the items differ and four is few): treat it as a first reading, and look again
   after ten Opus items.

Judge by the finished item, not the price per token: a cheaper worker that needs another review
round may cost more.

## Who may touch what

Exclusive ownership of every file would stop parallel work: nine of the branches merged on 11 and
12 Nov added a line or two to `shared/src/events.ts`. So a brief has two lists.

- **Files it owns**: where it changes logic. No two running items own the same file.
- **Files it adds lines to**: the registry files, where each feature adds an entry and leaves the
  rest alone: `shared/src/events.ts`, `shared/src/events.exports.test.ts`, `shared/src/index.ts`,
  `server/src/deps.ts`, `server/src/app.ts`, `client/src/api/endpoints.ts`,
  `client/src/api/participant.ts`, `ARCHITECTURE.md` (one line per server module, so a new module
  is a new line). A new event payload goes in its family file, `shared/src/events/<family>.ts`,
  with its `body(...)` line in `events.ts`; every item that adds a payload also adds one line to
  the inline snapshot in `events.exports.test.ts` (CI fails until it does). Several items may add
  to these at once; a clash is a two-line merge. A registry that keeps clashing gets split into
  one file per feature (as `events.ts` has been, into `shared/src/events/`).

Three shared things caused trouble on 12 Nov and now have one owner each:

- **Migration numbers.** The runner applies files in name order and remembers them by name, so a
  renumbered migration runs again on any database that had the old name. Three were renumbered in
  merges on 12 Nov. The orchestrator gives each item its number in the brief; nobody renumbers.
- **`docs/HANDOVER.md`.** 33 commits touched it in two days and agents kept renumbering each
  other's sections. Workers do not edit it. Each item writes `docs/changes/<issue>-<slug>.md`; the
  health pass folds those into the handover.
- **`development`.** Only the orchestrator merges into it. Workers push their own `work/` branch.

## What comes to Sam

Sam does not review code or architecture. The orchestrator asks Sam only about:

- anything that changes what a teacher sees or does in a way the plan did not already agree;
- the research data: event payloads, the export bundle, what is logged, hashes (rule "the research
  data format is stable");
- a migration that teachers' data passes through, or anything destructive against Turso;
- pupils' data, privacy and what goes to the model;
- the rules that hold it together (`ARCHITECTURE.md`), and `docs/PLAN.md` disagreeing with the code;
- money: running `pnpm eval`, a new paid service, a model change;
- a review that is still blocked after three rounds.

Everything else the orchestrator decides and reports.

## Keeping the architecture healthy

The reviewer blocks a PR that makes the codebase harder for the next agent: a file grown past 400
lines without a split first, logic added to a component that belongs in a hook or a pure function,
a module reaching past `deps.ts`, a second way to do something there is already one way to do,
behaviour without tests, a refactor mixed with a behaviour change.

Every 10 merges, or weekly, the orchestrator runs a **health pass** with the staff engineer: files
over 400 lines, the files most branches touched, test counts, and docs that have fallen behind. It
adds the result to `docs/architecture-health.md` (one dated row, so the trend shows) and puts
structural items on the board. Up to one structural item in every three dispatches is fine.

## The model key in the cloud

The ELM key is saved as a network secret on the cloud environment, not in the repo or in `.env`.
The proxy adds it to every request to the ELM host, so agents never see it. Evals work from a
cloud session (tried 13 Nov, 09:54 UTC: one case passed; the saved key took about half an hour to
take effect). The variables are not set on the environment, so give them on the line:

`ELM_PROXY_BASE_URL=https://elm.edina.ac.uk/api/v1 ELM_PROXY_API_KEY=placeholder NODE_USE_ENV_PROXY=1 pnpm eval -t "<case name>"`

The key is a placeholder the proxy replaces. Node's own `fetch` skips the proxy unless
`NODE_USE_ENV_PROXY=1` is set (Node 22.21 or later); without it an eval times out rather than
reaching ELM. `pnpm eval` still costs money: the orchestrator asks Sam before every run, and a
worker never runs it unless its brief says so.

## What the first day showed (12 and 13 Nov 2026)

Proven: worker sessions run unattended; review notes reach a worker by message and it acts on
them and replies; the orchestrator wakes on its own check-ins (it no longer subscribes to PR
events: they woke it for nothing); a new orchestrator
turn can rebuild from the board after a pause of nine hours. First full loop (brief, PR, review,
notes, fix, second review): about 25 minutes. First merge: PR #10.

Found on the way, and now in the rules: `development` had failed its own CI for two days (see
`review.md`, step 1); read-only agents changed the shared checkout (they now use their own
worktree); a new session inherits the orchestrator's model unless told.

Proven since: evals through the proxy (13 Nov). Not proven: branch protection on `development`.

Fallback if worker sessions ever stop working unattended: workers as agents inside the
orchestrator's own session, each in its own git worktree.

## Usage and the orchestrator's own cost

Everything runs on one account with a 5-hour and a 7-day usage limit. On 12 Nov, four workers,
two reviewers per PR and the orchestrator used the 5-hour allowance in about 100 minutes; work
stopped mid-task and nothing restarted until Sam wrote the next morning.

- If a session reports the usage limit, do not retry. Tell Sam, and say when it resets.
- The orchestrator is the dearest session: every wake-up re-reads its whole conversation. The
  first one reached 535k tokens and about 49 USD at list prices in one evening and morning, much
  of it waking for notices that needed nothing. In the second orchestrator session the
  orchestrator itself read about 17.5 million cached tokens over roughly 60 model calls, while all
  seven helper agents together used about 0.7 million: the wake-ups are the cost, not the panel or
  the reviewers. So: no PR subscriptions, one check-in every 20 to 30 minutes, few tool calls.
- **Hand over to a fresh orchestrator** when the session's cost passes about 8 USD, or
  `context_usage` has grown about 150k tokens past what it held after its start-up reading (a
  fresh one already holds about 150k), or a batch has merged and the board is quiet, whichever
  comes first. Never in the middle of a merge. The orchestrator starts its successor itself; how
  is in the skill. Sam can also type `/compact` in its session to shrink it.
- Answer a notice that needs nothing in one line, or not at all.

## Settings outside the repo (Sam)

- **Protect `development`** on GitHub (require a pull request and the CI check), so no session can
  push straight to it. The repo is private: on a free GitHub plan the rule can be written but is
  not enforced, and the process then rests on the briefs and on the health pass counting commits
  that skipped review.
- **CI ran twice** on a branch with an open PR. Done (13 Nov): the `push` trigger in
  `.github/workflows/ci.yml` now runs only on `main` and `development`.
- **Vercel pull request comments**: turned off (Sam, 13 Nov).
- **Vercel previews, not yet done**: Project Settings, Git, Ignored Build Step, behaviour
  "Custom", with this command, which skips the build (exit 0) on every branch except `main` and
  `development`: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ "$VERCEL_GIT_COMMIT_REF" != "development" ]`.
- **Starting an orchestrator**: each orchestrator starts its successor on the `development`
  branch (the default branch, `main`, lacks the skill until Sam merges `development` into it).
  Sam starts one by hand only the first time or after one was lost: a session on `development`,
  then `/orchestrate`.
- **A cloud session can start from a day-old copy** of the repo, from before the skill existed,
  so it must fetch first. If `/orchestrate` is not offered, say "run git pull", then type
  `/reload-skills`, then `/orchestrate`; or say "run git pull, then read
  `.claude/skills/orchestrate/SKILL.md` and act as the orchestrator".

## Decisions (Sam, 13 Nov 2026)

- Planning panel: product manager, staff engineer, designer. Reviewer on every PR, including
  security and architecture.
- Sam talks to one orchestrator session, started with `/orchestrate`; each orchestrator starts
  its own successor. Sam's questions are asked in chat; the "Questions for Sam" issue tracks them.
  `QUESTIONS.md` at the repo root is always up to
  date: each new question goes in it in the same turn it goes on #12, and answered ones move to
  its Answered table (Sam, 21 Nov 2026; the format is in the orchestrate skill, "Talking to Sam").
- Models and effort as in "Models"; workers on Opus 5.5 at medium, raised if reviews find
  problems. The orchestrator on Opus 5.5 at high as a trial, with a Fable expert for thorny
  questions.
- No PR subscriptions; one check-in every 20 to 30 minutes. A PR behind `development` only by
  merges on other files, and mergeable, is merged without a fresh CI round; a red `development`
  at the next check-in is fixed before any other merge (`review.md` step 4). Later review rounds
  read only the new commits. The product manager and designer run only on a teacher-facing
  choice.
- The new research events are confirmed for the study data: `curriculum_pick`,
  `curriculum_status`, `pedagogy_open`, adaptations in `pupils_change`, `curriculum` in
  `classes.json`, and `picture_choose` with the pictures stored on the turn.
- Three workers at once to start.
- Work reaches `development` by pull request; the orchestrator merges a clean PR into
  `development` without asking. Sam merges `main`.
- Board in GitHub issues.
- Dispatch size 3 to 7 points to start, adjusted from the record on closed issues.
- The pedagogy library stays on while the tool is in preview; the release note lists it under
  "on, waiting for review" each time until an educator has reviewed it and the licences are
  confirmed.
