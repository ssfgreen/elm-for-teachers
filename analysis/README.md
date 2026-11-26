# edw_analysis

Python analysis package for the epistemic differentiation workshop. It will load exported session bundles, recompute the derived measures independently of the TypeScript implementation, and assert parity with the values the server exported. Run tests with `uv run --extra dev pytest` from this directory.

So far it reads `session.json` (`edw_analysis.bundle.load_session`, from the zip or an unpacked folder). `access` says how the workspace was reached: `"link"` (its participant link) or `"account"` (a signed-in teacher). Bundles from before 13 Nov 2026 have no `access` and read as `"link"`.
