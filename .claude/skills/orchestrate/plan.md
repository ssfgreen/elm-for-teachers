# Plan a request

1. **Read enough to brief the panel**: `docs/workflow.md`, the request, the open board, and the
   relevant part of `docs/PLAN.md` or `docs/backlog.md` if the request is already there.

2. **Run the panel**, each agent given Sam's words and the open board (so they know what is
   running). The staff engineer always runs first, alone; the other two run only when its plan
   shows a real teacher-facing choice that the docs do not already settle. On 13 Nov they cost
   about 190k tokens and most of their points were already in the staff engineer's plan or the
   docs (Sam, 13 Nov 2026).
   - `staff-engineer`, always: the design, the work items with points, the files each owns and
     the files it only adds lines to, migrations, order and dependencies, splits needed first,
     risks.
   - `product-manager`, when that choice affects teachers or the study: who it is for, what the
     teacher should be able to do afterwards, effect on the research data, priority.
   - `designer`, when that choice is a screen or wording: screens, wording, states,
     accessibility, against `docs/STYLING.md`.
   A bug fix, a refactor or a server-only change needs the staff engineer alone.
   Do not hand them each other's views or your own guess at the answer.

3. **Merge into work items.** Where the panel disagrees, decide, and say why in one line. Each
   item has:
   - a title in the commit style (`area: what changes`);
   - the outcome for a teacher or researcher, in one or two sentences;
   - points (3 to 7 per dispatch; group small ones, split 8s, see `docs/workflow.md`);
   - **files it owns** (logic changes; no running item may own the same file) and **files it adds
     lines to** (the registry files in `docs/workflow.md`; shared freely);
   - a migration number, if it needs one: the next free number after `development` and every open
     item. You give the number; the worker never picks or changes it;
   - "depends on";
   - acceptance checks: tests to add, e2e if UI, eval cases by name only if prompts, tools or
     models change;
   - questions for Sam, if any, using the list in `docs/workflow.md`.
   Check owned files against running items: overlapping items wait or are re-cut.

4. **Show Sam** one message: numbered questions first, then the items as a short table (title,
   points, depends on), then the order you will run them in. Keep the panel's reasoning out unless
   Sam asks.

5. When Sam agrees (or answers and says go), create one issue per item with `status:planned`, then
   go to `dispatch.md`.

A request of 1 to 2 points with no question for Sam can skip the panel: say so, make the issue, and
dispatch it, grouped with other small items in the same area where there are any.
