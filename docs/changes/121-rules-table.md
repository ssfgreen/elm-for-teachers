# 121: ARCHITECTURE.md in Current and Planned; the rules table one line per rule

Docs only. Sam's answer 14 (21 Nov): `ARCHITECTURE.md` keeps Current and Planned as its key
sections. Answers 15 and 16 were left to the orchestrator, whose defaults this follows.

## What was built

- `ARCHITECTURE.md`: the old sections sit under **Current** (one heading level down); **Planned**
  at the end has one line each, with a link, for the Kubernetes move (the note on the branch
  `migration_to_kubernetes`), the plugin milestones (#103) and the Plugin Studio (#125).
- Rule 1 keeps its first three sentences and links to the new `docs/rules.md`, which holds its
  dated exceptions (7, 12 and 13 Nov) word for word, one paragraph each.
- Rule 6 keeps "Migrations run ... confirm before anything destructive."; how they run (at start
  on Vercel, or a Kubernetes Job) moved word for word to `DEPLOY.md` section 1.
- The package rows lost their deployment detail (the Vercel functions and their limits, the
  `deploy/` contents); each now links to `DEPLOY.md`. The words moved to a "What runs where"
  table and two paragraphs at the end of `DEPLOY.md` section 1. No `DEPLOY.md` heading changed:
  "What runs where." is a bold line, not a heading.
- `CLAUDE.md`: one line, the rules table and `docs/rules.md` are both Sam's.
- `docs/workflow.md` step 8 (merge): a PR that builds something under Planned moves its line to
  Current.

## Decisions

- `docs/workflow.md` has no done-list as such; the line went under step 8, "Merge", the point at
  which work counts as done.
- No grep for deployment names was found on #12 or in the cuts of #121 and #113. The check used:
  `grep -nE 'api/index\.mjs|api/library\.mjs|vercel\.json|300 s|30 s limit|compose\.yaml|Dockerfile|Kustomize|Envoy' ARCHITECTURE.md`
  (nothing found). Words such as "Vercel" and "Kubernetes" still appear in the server module
  lines, the Checks section and Planned: the brief moved detail out of the package rows and rule
  6 only.
- `DEPLOY.md` section 1 still opens with "One Node.js process ... nothing else to run", which is
  true of a plain server but not of Vercel or Kubernetes; left as it is (add lines only).

## What is left

- The orchestrator adds `docs/rules.md` to `.claude/agents/pr-reviewer.md` on merge.
