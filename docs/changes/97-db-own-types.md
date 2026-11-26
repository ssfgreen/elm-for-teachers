# 97: db owns the database types (K4)

## What was built

- `packages/server/src/db/types.ts`: our own `Value`, `InValue`, `InArgs`, `InStatement`, `Row`,
  `ResultSet`, `Executor` and `Transaction`. They match libSQL's shapes, cut down to the parts the
  server uses (no `executeMultiple`, `closed`, `columnTypes`, `lastInsertRowid`, `toJSON`), so a
  libSQL transaction or result is still assignable to them with no cast.
- `packages/server/src/db/client.ts` is now the only file that imports `@libsql/client`. `Db` is
  typed with our types.
- The 24 other files that imported types from `@libsql/client` import the same names from
  `db/types.ts`. Import lines only.
- `eslint.config.js`: `@libsql/*` is refused in `packages/{server,shared,evals}`, except in
  `packages/server/src/db/client.ts`.
- Reads that take any `execute(stmt)` now say `Executor` (from `db/types.ts`) rather than
  `Pick<Transaction, 'execute'>`. The other local `Executor` types (`Db | Transaction`, in
  `gateway/history.ts`, `config-versions.ts`, `comments/store.ts`) mean something else and are
  left as they are.

## Decisions

- Same type names as libSQL (`Transaction`, `Row`, `InStatement`, `InValue`), so the change in each
  module is the import path alone.
- `Db.client` stays, typed as `Executor` (one `execute(stmt)`), not libSQL's `Client`. It is used
  for two reads outside the transaction queue and the lock retry (`sessions/service.ts`,
  `accounts/store.ts`), passed through by `serial-db.ts`, and by one test (`app.test.ts`). Routing
  those through `Db.execute` would add the retry and the first-use pragmas to them: a small
  behaviour change, so left for later.
- `Transaction` keeps `commit` and `rollback`: `gateway/history.ts` and `config-versions.ts` tell a
  transaction from a `Db` by `'commit' in x`.
- The lint rule matches `@libsql/*`, so `@libsql/client/web` and `@libsql/core` are caught too.

## What is left

- Hiding `Db.client` altogether (see above), if a second driver ever comes.
- A PostgreSQL driver would also need its own placeholders (`?` against `$1`) and SQL dialect: the
  types do not cover that.
