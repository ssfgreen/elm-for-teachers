#!/usr/bin/env bash
# The same steps as .github/workflows/ci.yml, run locally.
set -euo pipefail
cd "$(dirname "$0")/.."
CI=true pnpm install --frozen-lockfile   # CI=true: never stop at pnpm's "reinstall?" prompt
pnpm check
pnpm build

# Live client against the built server (needs the build above).
EDW_INTEGRATION=1 pnpm --filter @edw/client exec vitest run src/integration

# Browser check. Skipped where Playwright has no browser (Sam's Docker sandbox): SKIP_E2E=1.
if [ "${SKIP_E2E:-0}" != "1" ]; then pnpm e2e; fi
