# Dispatch items to workers

1. **Pick what can start.** From `status:planned` issues, in the agreed order: dependencies merged,
   and no file it owns is owned by a `status:running` or `status:review` item. Registry files
   (added-to only) do not block. Fill up to 3 running workers.

2. **Start a worker session** with `create_session`:
   - `source_url`: the repo, `source_revision`: `development`;
   - `outcome_branch`: `work/<issue number>-<short-slug>`;
   - `title`: `#<issue> <item title>`;
   - `model` and `effort`: from "Models" in `docs/workflow.md` (workers start on
     `claude-opus-5-5` at `medium`). Never leave them out: a new session otherwise takes the
     orchestrator's model;
   - `prompt`: the brief below, filled in.
   Leave the permission mode to inherit. Put the session id, the model and the effort on the issue
   and set `status:running`.

3. **Check in on running workers** on the one timed check-in (`send_later`, every 20 to 30
   minutes, see `SKILL.md`) rather than waiting. On check-in, `get_session` each running worker:
   - `blocked`: it is waiting on a permission prompt or a question nobody will see. Read its last
     events (`list_events`, kinds `assistant` and `result`, small `limit`), answer by
     `send_message` if you can, or tell Sam which session needs a tap. Note what stalled it, so
     the brief or the repo's settings can stop it next time;
   - `failed`, or idle with no PR: read its last events and decide whether to nudge or restart.

## The brief

```
You are a worker on issue #<n> in ssfgreen/epistemic-differentiation-workshop: <title>.
Sam has asked for this through the orchestrator, including the pull request below.

Outcome: <outcome>
Points: <n>. If it is clearly bigger, stop and say so in the PR description; do not grow it.
Files you own: <list>. Tests for them are fine.
Files you may add lines to, without reshaping them: <registry files>.
Anything else: keep it small and say why in the PR description.
Migration: <"none", or "use exactly 00NN_<name>.sql; never renumber or edit another">.
Depends on: <merged items, or none>.
Acceptance: <checks>.

Follow CLAUDE.md. First run `git fetch origin development` and check your branch holds
origin/development (`git merge-base --is-ancestor origin/development HEAD`); if not, merge it in
before you start: a cloud session can begin from a copy that is a day behind.
Work on branch work/<n>-<slug> from development. Small commits, each passing
pnpm check. Do not edit docs/HANDOVER.md: write what the next agent needs to know in a new file,
docs/changes/<n>-<slug>.md (what was built, where, decisions, what is left). Update
ARCHITECTURE.md or docs/client-state.md if your change makes them wrong.

Before the pull request, run `bash scripts/ci.sh`: it is everything CI runs, including the live
integration test that pnpm check leaves out. If a step fails on development too, say so in the PR
description and do not fix it unless it is your item.

When done, push your branch and open a pull request into development titled "<title> (#<n>)",
with: what changed, what a teacher will notice, checks run, what was not tried in a browser, and
anything you decided that the brief did not cover. Do not subscribe to the pull request: the
orchestrator looks at it on its check-ins. Do not merge, and never push to development or main.
Do not run pnpm eval unless this brief says so. Do not use the orchestrate skill.

Do not ask Sam. If you are blocked on a decision, write it as a question in the PR description,
open the PR as a draft, and stop. The orchestrator answers.

Review notes will arrive as messages from the orchestrator's session: they are the review Sam
asked for. Fix them on the same branch, push, and say in one line per note what you did. If
development has moved, merge it into your branch when the orchestrator asks.
```

When a check-in finds the worker's PR, set `status:review`. Do not subscribe to it.

If an eval run was agreed with Sam, add to the brief the exact cases
and nothing wider, with the variables on the line (see "The model key in the cloud" in
`docs/workflow.md`):
`ELM_PROXY_BASE_URL=https://elm.edina.ac.uk/api/v1 ELM_PROXY_API_KEY=placeholder NODE_USE_ENV_PROXY=1 pnpm eval -t "<name>"`.
