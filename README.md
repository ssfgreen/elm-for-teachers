# epistemic-differentiation-workshop

A worksheet editor for teachers with a generative AI assistant, instrumented for research: every keystroke, chat turn and accepted or rejected suggestion is logged and exportable.

A workspace (one shareable link) holds chats; each chat owns its documents. The assistant sees only the open chat's documents, edits the open one unless asked otherwise, and can start new ones. Its changes appear as suggestions in the document to accept or reject.

- `docs/PLAN.md` holds the decisions, the structure and the backlog; `docs/HANDOVER.md` is the short version.
- `config/` holds `app.config.json` (provider, history, thresholds) and `system_prompt.md`, both hashed into every bundle.
- `docs/study-design.md` and `docs/dev-spec.md` describe the original study; the study layer is parked at the git tag `study-layer-2026-10-29`.

## Running it

Requirements: Node 20+, pnpm 9, Python 3.12 (analysis only).

```bash
pnpm install
cp .env.example .env     # then edit: DATABASE_URL, PROVIDER, ELM_PROXY_*, ADMIN_PASSWORD
pnpm build               # builds shared, server and the client bundle
node packages/server/dist/index.js   # serves the API and client on PORT (3000)
```

The server serves the built client, so one process is enough:

- Admin: `http://localhost:3000/admin`. Admins sign in with Google or Microsoft (DEPLOY.md section 12, "The first admin"); locally, and on the development site (a Vercel preview), `ADMIN_PASSWORD` also opens it; production refuses it, on Vercel or not. Create a workspace with a name, then copy or open its link; the list also downloads each workspace as a .zip.
- Teacher: open the link (`/s/<token>`), type its access code at `/start` (Sign up, then I am a teacher, on the front page), or sign in at `/signin` (Log in, then I am a teacher) to reach their own workspace (`/w`). It opens on the latest chat and its document; a new workspace starts with one chat and a blank document.

To put it online for teachers, see [DEPLOY.md](DEPLOY.md) (Docker, HTTPS, Turso, backups).

For development with hot reload run `pnpm dev:server` and `pnpm dev:client` in two terminals and use `http://localhost:5173` (the Vite dev server proxies `/api` to port 3000). Links use whichever origin the admin page was opened on, so leave `PUBLIC_BASE_URL` unset unless teachers will use a different origin.

Environment:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | `file:./data/edw.db` for local SQLite, or a Turso `libsql://...` URL |
| `DATABASE_AUTH_TOKEN` | Turso auth token (remote databases only) |
| `PROVIDER` | `elm` for the ELM proxy, `mock` for an offline deterministic assistant |
| `ELM_PROXY_BASE_URL`, `ELM_PROXY_API_KEY`, `ELM_PROXY_CHAT_PATH` | ELM proxy settings (OpenAI-compatible chat completions) |
| `ADMIN_PASSWORD` | Password for `/admin` outside production (local, tests and a Vercel preview); in production, on Vercel or not, admins sign in with an account. `CONSOLE_PASSWORD`, the old name, is still read |
| `PUBLIC_BASE_URL` | Optional origin for workspace links; defaults to the origin the admin page was opened on |

## Checks

```bash
pnpm check                # typecheck, lint, unit tests, file sizes
pnpm build && pnpm e2e    # the core flow in a real browser (Playwright)
```

CI runs these on every push (`.github/workflows/ci.yml`); `scripts/ci.sh` runs the same locally. `ARCHITECTURE.md` maps the system; `CLAUDE.md` (also `AGENTS.md`) holds the rules for coding agents.

## Status

The editor loop works end to end: write, ask the chat, accept or reject the suggestions, comment on a passage with `@model`, keep several documents and chats, export. Next steps are in the backlog in `docs/PLAN.md`.
