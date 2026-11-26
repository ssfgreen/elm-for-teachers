# Elm for Teachers

A research-instrumented AI worksheet and lesson-material assistant for consenting teachers, part of the three-system ELM architecture (University of Edinburgh).

**Zero pupil personal data:** Elm for Teachers holds no pupil names, pupil accounts, or pupil transcripts. Teachers work with generic or class-assigned **Needs Groups**, pre-save PII moderation guards free-text notes and group descriptions, and classroom materials flow strictly **one way** to Elm for Students as frozen **Content Pack (v1)** bundles.

## Architecture & specifications

- [ARCHITECTURE.md](ARCHITECTURE.md) — system map, packages, server modules, and rules.
- [docs/specs/](docs/specs/) — target specifications for the three-system split (`01-three-system-split.md`, `02-elm-for-teachers-spec.md`, `03-elm-for-students-spec.md`, `04-education-plugin-studio-spec.md`).
- [docs/planning/](docs/planning/) — earlier Elm for Teachers planning notes and worked examples preserved from the repository root.
- [docs/routes.md](docs/routes.md) — every HTTP route and its guard (verified in CI by `packages/server/src/routes.test.ts`).
- `config/` — `app.config.json` (provider, history, thresholds) and `system_prompt.md`, hashed into every research bundle.

## Running locally

Requirements: Node 20+, pnpm 9, Python 3.12 (analysis only).

```bash
pnpm install
cp .env.example .env                 # set DATABASE_URL, PROVIDER, ELM_PROXY_*, ADMIN_PASSWORD
pnpm build                           # builds shared, server, and the client bundle
node packages/server/dist/index.js   # serves the API and client on PORT (3000)
```

For development with hot reload, run `pnpm dev:server` and `pnpm dev:client` in two terminals and open `http://localhost:5173`.

Key environment variables:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | `file:./data/edw.db` for local SQLite, or a Turso `libsql://...` URL |
| `DATABASE_AUTH_TOKEN` | Turso auth token (remote databases only) |
| `PROVIDER` | `elm` for the ELM proxy, `mock` for an offline deterministic assistant |
| `ELM_PROXY_BASE_URL`, `ELM_PROXY_API_KEY`, `ELM_PROXY_CHAT_PATH` | ELM proxy settings |
| `ADMIN_PASSWORD` | Password for `/admin` outside production; production requires an admin account |
| `PUBLIC_BASE_URL` | Optional origin for workspace links and Content Pack download URLs |
| `STUDENTS_URL` | Optional origin of Elm for Students, used to build Content Pack import links |

## Checks

```bash
pnpm check                # typecheck, lint (--max-warnings 0), unit tests, file sizes
pnpm build && pnpm e2e    # Playwright e2e suite (requires Chromium)
bash scripts/ci.sh        # full CI script locally
```

`CLAUDE.md` (also `AGENTS.md`) holds the rules for coding agents working in this repository.
