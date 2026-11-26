# Fixtures

Test material shared by the TypeScript and Python packages: recorded model outputs (so tests never call the provider), the three reference sessions, and golden export bundles used for parity checks between the server export and the analysis package. Files here are versioned and should only change deliberately, with the change reviewed.

`sessions/`: the workshop sessions 1KC, 2SH and 3PD (3 to 6 Nov 2026) as Spyglass cases, written by
`pnpm sessions` in `packages/evals` from the exports in `data/Telemetry/` (not committed). Each case
is a teacher message, the reply, what the turn did and its effect: teacher-facing words only. A copy
made the old way is there twice, as recorded and as a `copy_of` copy.
