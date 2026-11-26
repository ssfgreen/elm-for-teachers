# Working in this repo

A worksheet editor for teachers with an AI assistant, instrumented for research, plus a make kit
where teachers propose features. Read `ARCHITECTURE.md` for the map and `docs/HANDOVER.md` for the
latest state. Before touching the workspace screen, the editor's sync, the chat or the preview,
read `docs/client-state.md`: who owns each piece of client state, and the rules between them. `docs/PLAN.md` changes as teachers give feedback; when it and the code disagree, ask.
Work is planned and sent to worker sessions by an orchestrator: `docs/workflow.md`. A worker
follows its brief and opens a PR into `development`; it does not ask Sam directly. Asked for
something by Sam with neither a brief nor `/orchestrate`: work the same way (your own branch, a PR
into `development`), and say the orchestrator session is the place for it.

## Rules

- Decide details from the specs and report what you chose. Ask about anything in the "rules that
  hold it together" table in `ARCHITECTURE.md`: those are Sam's decisions.
  That means the rules table and `docs/rules.md` (its dated exceptions).
- Never print `.env` or API keys. Never send the user's email anywhere. Confirm before anything
  destructive against Turso. Add migrations; never edit an existing one.
- Plain, short British English in code comments, commit messages and docs. Sam reads the final
  summary, not the tool output.

## Checks

- `pnpm check` (typecheck, lint with no warnings, unit tests, size report) passes before every
  commit. While working, the fast loop is `cd packages/<p> && npx vitest run <file>` and
  `npx tsc --noEmit -p packages/<p>`.
- Behaviour changes come with tests. Fix a bug by writing a failing test first.
- UI changes: `pnpm build && pnpm e2e` where a browser is available (in the cloud sandbox set
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`). Sam's Docker sandbox
  has no browser: say the UI was not tried, rather than claim it works. Timing between the chat,
  the screen and the editor fails only some of the time and never in jsdom: after touching it,
  repeat a test (`pnpm e2e e2e/core.spec.ts -g "ask, accept" --repeat-each 20 --trace off`) and
  compare with `main`.
- `pnpm eval` calls the real model and costs money: run it only when asked, or when prompts, tools
  or models changed, and say so.
- Never weaken, skip or delete a test, eval judge or `packages/evals/baseline.json` entry to get
  green. If one is wrong, say why and ask.

## File size

Big files are where agents lose track and features collide. `pnpm sizes` lists files over 400 lines.

- Before adding to a file over 400 lines, first move the part you are about to touch into its own
  module, in a separate structural commit with no behaviour change. Plans for the current large files
  are in `docs/architecture-audit-2026-11.md` section 2.
- Aim for new files under 300 lines with one job each. Take logic out of React components into
  hooks, and into pure functions that can be tested without React or a database.
- Production code never imports from `make/`; the kit draws into the editor through
  `components/slots/` (lint enforces it). New research logging goes
  through the logger or the `EventStore`, never raw SQL on `events`.

## Git

- Commit as you go: small commits, each passing `pnpm check`, message in the style of
  `git log --oneline` (`area: what changed`, then why). Never mix a refactor and a behaviour change
  in one commit.
- Stage explicit paths, never `git add -A`. No `--no-verify`, no force push, no `reset --hard`.
- A push to `main` deploys to Vercel: Sam pushes `main`. In a cloud session, work on your own
  branch and push it. Work reaches `development` by pull request; only the orchestrator session
  merges into `development`, once CI and the review are clean. Nobody else pushes to it.

## Gotchas

- Server and evals import `packages/shared/dist`: rebuild shared after changing it (`pnpm check`
  does).
- In a sandbox, `pnpm install` can stop at a "reinstall?" prompt: use `CI=true pnpm install`.
- Vercel functions stop at 300 s (`maxDuration`); a turn winds up after `agent.max_turn_ms` (200 s), but one very slow model call can still run over.
