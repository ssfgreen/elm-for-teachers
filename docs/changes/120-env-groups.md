# 120: env.ts one file per settings group under env/ (structural)

## What was built

`packages/server/src/env.ts` went from 249 to 74 lines. Each settings group moved into its own
file under `packages/server/src/env/`, with its zod variables, its part of `Env` (doc comments
moved with the fields), its checks and what it works out:

- `parse.ts`: `emptyToUndefined`, `optional`, `list`, the `Vars<shape>` type and `omit`.
- `repo-root.ts`: `findRepoRoot`.
- `database.ts`: `DATABASE_*`, `MIGRATE_ON_START`, `resolveDatabaseUrl`.
- `model.ts`: `PROVIDER`, `ELM_PROXY_*`, the elm check.
- `admin.ts`: `ADMIN_PASSWORD`, `CONSOLE_PASSWORD`, `DEPLOY_ENV`, `DeployEnv`, the password fallback.
- `site.ts`: `PORT`, `HOST`, `CONFIG_DIR`, `TOOL_VERSION`, `PUBLIC_BASE_URL`, `TRUST_PROXY`,
  `FUNCTION_LIMIT_MS`, `NODE_ENV`.
- `bucket.ts`: `S3_*` and the all-or-none check.
- `library.ts`: `LIBRARY_*` and the bypass secret.
- `jobs.ts`: `CRON_SECRET`.
- `vercel.ts`: gained the `VERCEL_*` variables and the `VERCEL_ENV`/`ON_VERCEL` part of `Env`.
- `sign-in.ts`: `AUTH_*`, `GOOGLE_*`, `MICROSOFT_*`, `microsoftClient`, `checkAuth`, `AUTH_BASE_URL`.

`env.ts` keeps the same exports (`loadEnv`, `ENV_KEYS`, `Env`, `DeployEnv`, `findRepoRoot`), holds
dotenv, the merged schema, `interface Env extends` the groups, and `loadEnv`, which runs the checks
in the same order as before: zod, sign-in, admin password, bucket, model. Only it reads
`process.env`; the group files take the parsed values.

Tests: `env/pinned.test.ts` (committed first, against the old code) pins the sorted `ENV_KEYS`,
the sorted keys and values of `loadEnv()` with every variable set, the own-library case and the
order of five bad variables in one message. The old `env.test.ts` cases moved, unchanged, into
`env/<group>.test.ts` (the two `/api/auth/providers` cases into `sign-in.providers.test.ts`), with
one shared helper, `env/test-helpers.ts` (`emptyEveryKey`).

## Decisions

- The group files export plain zod shapes (`databaseVars`, ...), and `env.ts` spreads them into
  one `z.object`, in the order database, model, admin, site, bucket, library, jobs, vercel,
  sign-in. That changes the order of lines in the "Invalid environment" message in one case
  only: a bad `TRUST_PROXY` or `FUNCTION_LIMIT_MS` is now listed before a bad `S3_ENDPOINT` or
  `LIBRARY_URL` (it was after). `MIGRATE_ON_START` and `NODE_ENV` also moved earlier, but neither
  can fail. Which variables are named, and the messages, are unchanged.
- The dropped raw variables (old password name, Vercel's own, the deprecated Microsoft pair) are
  removed with `omit` rather than an unused destructure, which lint refuses.
- `env/pinned.test.ts` is 157 lines, over the 120 the brief set for `env/` files: it is the
  pinning test, which had to pass unchanged after the split, so it was not trimmed afterwards.
- Comment lines naming `env.ts` now name the group file (`auth.ts`, `accounts/fake-issuer.ts`,
  `plugins/library-client.ts` and its test's comment). Test titles were left alone.

## Left

Nothing for this item. `ARCHITECTURE.md` line 53 still says the library is worked out in
`server/src/env.ts`; it is now `env/library.ts`, called from there. Not changed (only one line may
be added to that file in this item).
