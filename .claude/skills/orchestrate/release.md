# Release: `development` to `main`

Sam merges and pushes `main`; a push deploys to Vercel and runs new migrations on live Turso. Your
job is to make that a safe, informed five minutes. When Sam asks, or when enough has merged to be
worth it, write Sam one note:

1. **What to try**, as a short list of things to click on the `development` preview, newest
   features first, each with what should happen.
2. **What will happen on deploy**: migrations that will run (from `git diff --name-only
   origin/main origin/development -- packages/server/src/db/migrations`), and whether each only
   adds tables or columns; environment variables that must be set on Vercel first; anything the
   deploy turns on for every teacher; and the list "on, waiting for review" from the decisions in
   `docs/workflow.md`.
3. **Research data**: new or changed events and bundle files since `main`, and whether Sam
   confirmed each (the issues say).
4. **Not checked**: evals not run since prompts, tools or models changed (name the cases and the
   rough cost); screens nobody tried in a browser; flaky tests.
5. **Open questions** still waiting on Sam that touch this release.

If prompts, tools or models changed since `main`, ask Sam for one eval run on `development` before
the release, rather than one per PR.

Do not merge or push `main` yourself, whatever the state.
