# #112: route helpers out of route modules, and the budget and gateway cycle broken (structural)

No behaviour change. A teacher notices nothing.

## What was built, and where

- `packages/server/src/http/request.ts`: `parseOr400` (from `sessions/routes.ts`) and `Envelope`
  (from `blocks/routes.ts`).
- `packages/server/src/http/views.ts`: `PublicBlock`, `publicBlock`, `publicChanges` (from
  `blocks/routes.ts`), `interactionsActive` (from `sessions/interactions.ts`, which re-exports it)
  and `sessionView`, the `{ ...session, interactions_active }` shape that `sessions/routes.ts` and
  `features/routes.ts` both built by hand.
- Every route module (and `gateway/commit.ts`, `gateway/agent-turn.ts`, `gateway/turn-types.ts`,
  `gateway/scrub-routes.ts`) imports these from `http/` now. No module imports `blocks/routes.ts`
  or `sessions/routes.ts` except `app.ts`, which registers them. `features/routes.ts` imports
  neither `sessions/routes.ts` nor `sessions/interactions.ts`.
- The cycle: `budget/store.ts` imported `spendGbp`, `run` and `Executor` from
  `gateway/history.ts`, and `gateway/limits.ts` imported `budgetGbp` from `budget/store.ts`. Now
  `spendGbp` lives in `budget/store.ts`, and `run` in `db/run.ts`, with its type renamed from `Executor` to `DbOrTx` (review round 1: `db/types.ts` already has a different `Executor`).
  `gateway/history.ts` re-exports both; `gateway/index.ts` and `gateway/scrub-routes.ts` use the new name. `budget/` imports
  nothing from `gateway/`; `gateway/limits.ts` reads both sums from `budget/store.ts`.

## Decisions

- **The cycle is broken by moving `spendGbp`, not by interfaces in `deps.ts`.** The brief said
  interfaces wired in `deps.ts`. That needs the reader passed in, and the tests call
  `checkCallBudget(db, limits, ...)` and `addTopUp(db, events, ...)` directly; adding a parameter
  would change those tests, which the item forbids. `spendGbp` sums `gateway_calls.cost_gbp`,
  which `allBudgets` in the same file already sums, so it sits with the other budget sums.
- **`http/` imports no other module folder** (only `deps.ts`, `http-error.ts` and
  `@edw/shared`), like the top-level `http-error.ts`. That is why `interactionsActive` moved into
  it rather than `http/views.ts` importing `sessions/`.
- `db/run.ts` is a new file in `db/`, which the brief did not list: `run` is a database helper,
  and leaving it in `gateway/` would have kept `budget/` importing `gateway/`.

## Counts

Imports past `deps.ts`, counted as in `docs/architecture-health.md` (21 Nov): relative imports,
`import` or `export ... from`, from a non-test server module into another module's folder;
top-level files such as `deps.ts` and `http-error.ts` are not a folder, and `db/` is left out.

- Before (development at `7a8f8ea`): 113 (84 not type-only), the same as the 21 Nov pass.
- After, counting `http/` as a module: 108 (79 not type-only).
- After, leaving `http/` out like `db/` (shared plumbing that imports no module): 79 (51 not type-only).

Cycle check: `grep -rn "from '../gateway/" packages/server/src/budget/` finds nothing;
`gateway/limits.ts` is the only non-test file in `gateway/` that imports `budget/`.

## What is left

- Hiding `Db.client` (the comment on #112) is its own item: it changes behaviour.
- `gateway/service.ts` building its own stores, and the `as CanvasServiceImpl` casts (audit
  section 3), are untouched.
- `requestOrigin` still lives in `sessions/routes.ts`; only that file uses it.
