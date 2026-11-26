# Health pass

Every 10 merges into `development`, or weekly, whichever comes first.

1. Ask the `staff-engineer` agent, in health mode, to measure on `development`:
   - `pnpm sizes`: source files over 400 lines, and the five largest;
   - the files touched by the most merged branches since the last pass
     (`git log --merges` against `development`, second parent against merge base);
   - unit test count per package (from `pnpm test` output), and e2e count;
   - modules importing past `deps.ts`, and anything production importing `make/`;
   - docs behind the code (`ARCHITECTURE.md`, `docs/client-state.md`);
   - commits on `development` that did not arrive through a merged PR
     (`git log --first-parent --no-merges` since the last pass): each one skipped review.
2. **Sizes and models.** From the `record:` comments on issues closed since the last pass: points
   planned against commits, lines, review rounds and cost, by model and effort. Apply the rules
   under "Models" in `docs/workflow.md` (when to raise workers' effort; when the reviewer
   comparison ends). If 5-point items keep needing three rounds, or 2-point items sail through, move
   the dispatch size in `docs/workflow.md` and say so to Sam.
3. One small worker item, as a PR into `development`:
   - add one dated row to the table in `docs/architecture-health.md`;
   - fold the notes in `docs/changes/` into `docs/HANDOVER.md` (shortened), and delete the folded
     files.
4. Compare with the last rows. Anything getting worse twice in a row becomes a structural item on
   the board (usually a split of a hot file, or a registry file broken into one file per feature;
   plans in `docs/architecture-audit-2026-11.md`).
5. Tell Sam only the trend, in two or three lines, unless something needs Sam.
