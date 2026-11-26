# 128: reviewer follow-ups from #112 and #120, and the questions-doc rule

No teacher-visible change.

## What was built

1. Structural (no behaviour change). `db/run.ts` holds the one `DbOrTx` and `run` in the server.
   `comments/store.ts` and `config-versions.ts` dropped their own `Executor` type and private
   `run`, and so did `classes/adaptations.ts` (review round 1: its callers pass only a `Db` or a
   transaction, sent the same way by both versions); their calls now pass `{ sql, args }`. Importers take
   `DbOrTx` from `db/run.ts` (`gateway/scrub-routes.ts`) and `interactionsActive` from
   `http/views.ts` (`events/routes.ts`, `sessions/routes.ts`, `sessions/interactions.test.ts`).
   `gateway/history.ts` no longer re-exports `run`/`DbOrTx`, `sessions/interactions.ts` no longer
   re-exports `interactionsActive`, and `gateway/index.ts` dropped `type DbOrTx` from its list
   (nothing imported it from there).
2. `loadEnv()` returns `VERCEL_ENV: v.VERCEL_ENV`, so the key is in `Env` (as `undefined`) when
   the variable is unset, as before #120. Test: `env/settings.test.ts`, "keeps VERCEL_ENV as a
   key when it is not set". It deletes the variable rather than emptying it: zod keeps a key that
   is in `process.env` even when empty, so an empty one would not catch the bug.
3. Docs: `HANDOVER.md` line 720 (`spendGbp` is in `budget/store.ts`);
   `architecture-audit-2026-11.md` section 3, route helpers marked done (#112); section 2 gains an
   `env.ts` row marked done (#120); `architecture-target.md` section 8, the line on `env.ts`
   being shared by K1, K6 and A1; `ARCHITECTURE.md` library row points at `env/library.ts`.
4. `.claude/skills/orchestrate/SKILL.md`: Sam's rule on the "Questions for Sam" doc under
   "Talking to Sam" (format and check-in reading), and in "Handing over" (step 2 checks the doc
   matches #12; step 4's successor prompt reads both). One shorter sentence in
   `docs/workflow.md`, "Decisions (Sam, 13 Nov 2026)", next to the line on the issue.

## Decisions

- Section 2 of the audit had no `env.ts` text to change, so a "Done (#120)" row was added in the
  same style as the `events.ts` row.
- `architecture-target.md`: kept "one at a time, never together" for K1, K6 and A1, since all
  three still touch `env.ts` where the groups are joined.

## Left

`classes/curriculum.ts:39` still picks between the two `execute` forms inline (one call, not a
private `run`); it could use `db/run.ts` in a later tidy.
