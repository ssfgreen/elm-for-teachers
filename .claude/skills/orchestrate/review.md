# Review a PR and merge it

On a check-in, for each open PR into `development` that is new or has new commits, once CI has
finished:

1. **CI red**: first find out whose failure it is. Look at the last CI run on `development`
   (`actions_list`, branch `development`).
   - `development` green, the PR red: send the failing job's summary to the worker
     (`send_message`) and wait. Do not review red code.
   - `development` red with the same failure: it is not the worker's. Say so once on the PR. Make
     "development passes its own CI" the next item to go out, ahead of everything else, and hold
     every merge except that fix until it is green. A review can still run meanwhile.
   Green has to mean something: on 12 Nov `development` had failed CI for two days and nobody was
   looking, because sessions ran `pnpm check` and the browser tests themselves but not CI's
   integration step.

2. **Run the reviewer**: an Agent call to `pr-reviewer` with the PR number, the issue number and
   the round number. It reads the brief from the issue; do not paste it. Give it the PR, not your
   opinion of it. Round 1 reads the whole PR. Rounds 2 and 3 get the earlier findings and look only
   at the commits since the last review (`git diff <last reviewed sha>..HEAD`), with the Agent
   call's effort set to medium: on 13 Nov each later round re-read the whole PR, about 90k tokens
   each (Sam, 13 Nov 2026). It returns findings marked `blocking` or `note`, and a list of
   anything that needs Sam.

   Read the notes even under a clean verdict: if one describes something that should be fixed
   before merging, treat it as blocking and tell the reviewer's instructions so (that is how the
   first three reviews went wrong).

   A PR over about 800 changed lines of production code gets one reviewer per area (server and
   shared; client), and a note on the issue that the item was cut too big.

3. **Act on it:**
   - Findings: post them as one PR review comment (with the reviewed head sha and the footer), and
     send the same list to the worker session with `send_message` (the worker is not subscribed
     to the PR). Blocking findings must be fixed; notes are the worker's call, with a one-line
     answer. Then look again at a later check-in, after the next push.
   - Needs Sam: set `status:blocked-sam` and add it to your next message to Sam. Do not merge.
   - Clean and green: go to step 4.

4. **Merge.** Another PR may have merged since CI ran:
   - if the branch is behind `development` only by merges that touch none of the same files
     (compare the PRs' changed file lists) and GitHub reports it mergeable without conflicts, merge
     without updating it and without a fresh CI round: on 13 Nov three PRs took three CI rounds in
     a row and about ten extra wake-ups (Sam, 13 Nov 2026). CI runs on `development` after each
     merge: look at the latest run at the next check-in (a run cancelled by a later merge is not
     green), and if it is red, fixing it comes before any other merge;
   - if files overlap, update the branch (`update_pull_request_branch`), wait for CI on the
     result, and merge only if it is still green. On a conflict, ask the worker to merge
     `development` into its branch;
   - merge with a merge commit, title `merge: <item title> (#<n>) into development`;
   - on the issue, add the record (one comment, this shape, so the health pass can read it):
     `record: model=<id> effort=<level> points=<n> commits=<n> prod_lines=<n> rounds=<n>
     blocking=<n> ci_failures=<n> cost_usd=<from get_session usage> minutes=<n>`.
     Close it with `status:done`;
   - go to `dispatch.md` for the freed slot. Leave the worker's
     session as it is, idle: archiving is for sessions Sam has finished with, and Sam says when.

5. **After three rounds** still blocking: stop the loop. Read the PR yourself, decide whether the
   finding or the brief was wrong, and either rewrite the brief for a fresh worker or ask Sam.

6. **Draft PR with a question**: answer it yourself if `docs/workflow.md` says it is not Sam's;
   otherwise ask Sam. Send the answer to the worker.

The reviewer is a second pair of eyes, not proof. It reads; it does not run the app. CI and the
browser tests are the check that things work, and Sam trying `development` is the check that it is
what was wanted.
