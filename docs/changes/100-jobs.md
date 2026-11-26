# 100: a jobs table, a worker and a cron route, not used yet (K5)

## What was built

- Migration `0039_jobs.sql`: the `jobs` table (id, kind, payload JSON as text, status, attempts,
  run_after, locked_until, last_error, created_at, finished_at) and an index on (status,
  run_after). Status is `queued`, `running`, `done` or `failed`. Plain SQL PostgreSQL also takes.
- `packages/server/src/jobs/`:
  - `store.ts`: `enqueue`, `claim`, `finish`, `fail`, `getJob`, `backoffMs`.
  - `kinds.ts`: the job kinds and their handlers (`noop` only, for tests), and each kind's
    attempt limit (5 unless the kind says).
  - `runner.ts`: `runOne` (claim and run one due job) and `runFor` (run due jobs within a time
    budget, for the cron).
  - `loop.ts`: `workLoop`, the worker's loop: run jobs back to back, wait 5 s when none is due,
    stop after the job in hand on abort. A database error is logged and waited out.
  - `routes.ts`: `GET /api/jobs/run`, for Vercel's cron. Refuses (401) without
    `Authorization: Bearer <CRON_SECRET>`, and always when `CRON_SECRET` is unset. Runs due jobs
    for up to 120 s and returns a tally (`done`, `retry`, `failed`, `lost`).
- `packages/server/src/worker.ts`, built as `dist/worker.js`: opens the database and runs
  `workLoop` until SIGTERM or SIGINT. Runs no migrations (the migrate Job does).
- `env.ts`: `CRON_SECRET`, optional, at least 16 characters.
- `vercel.json`: one cron entry, `/api/jobs/run` daily at 03:17 UTC.
- Docs: `docs/routes.md` (a `cron` Who and the row), `ARCHITECTURE.md` (`jobs/`), `DEPLOY.md`
  (section 6, "Jobs"), `.env.example`.

Nothing in the app enqueues a job.

## Decisions

- **A claim is a compare-and-set, not a lock or a transaction.** `claim` reads the oldest due
  job, then updates it only if its status and attempt count are still what it read. Every claim
  adds an attempt, so of two copies that read the same row only one update matches. Single
  statements only, so no `SELECT ... FOR UPDATE`, `BEGIN IMMEDIATE` or `RETURNING` is needed,
  and it works the same on libSQL and PostgreSQL. A lost race looks again (up to 20 lost races;
  a give-up does not count, so a run of given-up jobs at the front never ends a claim early).
- **The claim is named by (id, attempts).** `finish` and `fail` match on both, so a copy whose
  lock ran out (and whose job another copy has taken) gets `false` / `'lost'` and changes
  nothing. No extra `locked_by` column.
- **Due** means queued with `run_after` passed, or running with `locked_until` passed. A job
  whose lock ran out on its last allowed attempt is marked failed at the next claim rather than
  run again, with `last_error` saying so (and keeping the error before it).
- **A copy claims only the kinds it knows** (`kind IN (...)` from its `kinds.ts`). In a rolling
  update, an old worker leaves a new kind's jobs queued for a new one, rather than give them up.
- **The payload is parsed only after the claim.** A payload that is not JSON gives up that job
  alone; the claim goes on to the next.
- **Backoff**: 30 s after the first failure, doubling, at most an hour; no jitter (jobs are few).
- **Attempt limit per kind, in code** (`kinds.ts`), not a column: it is read when a job is
  claimed or fails.
- **Lock: 10 minutes.** A job must finish inside it, or another copy may start it again. Every
  handler must be safe to run twice.
- **Cron: once a day.** Vercel's Hobby plan runs a cron at most once a day, at some point in the
  hour given; Pro allows once a minute. (From Vercel's documentation as I know it; vercel.com
  was not reachable from the sandbox to recheck.) The plan Elm is on is not written down, and a
  schedule the plan does not allow fails the deployment, so daily is the safe choice while no job
  exists. When marking arrives on Vercel Pro, change it to `*/5 * * * *` or so. Crons run on
  production deployments only.
- **The route is a GET**, because that is what Vercel's cron sends.
- **`docs/routes.md` gains a `cron` Who**, and `routes.test.ts` gains its guard pattern and two
  refusals (no secret, a workspace token: both 401). Calling it `none` would have said anyone may
  call it.
- **Timestamps** are ISO strings, as in every other table; ISO strings in UTC compare correctly
  as text.

## Left

- A Kubernetes Deployment for the worker (`node dist/worker.js`, one or more replicas, the same
  Secret as the server, no Service). `deploy/` belongs to K3 (#114).
- Removing old `done` and `failed` rows. None exist yet.
- Any real job kind (marking), and the place in the app that enqueues it.
- A view of jobs in /admin, if wanted.
