# Eval log

A dated record of eval runs that a decision rests on: what was asked, what ran, what came out
and where the files are. Newest first. The decisions themselves, and why, are in
`docs/model-decisions.md`.

Ordinary eval runs write to `packages/evals/.eval/`, which is not committed. A run that a
decision rests on is copied to `docs/eval-results/<date>-<name>/` (protocol, report and one line
per run; not the full per-run dumps) and gets an entry here.

How to add an entry: the question, the command and commit, the cases and runs, a results table,
what went wrong in the failures (read the runs, not just the pass rate), the cost, and the folder.

---

## 15 Nov 2026: before the release of `development` to `main` (#85)

**Question.** Since `main`, both system prompts, `check_layout`, `pedagogy_find`,
`pedagogy_read`, the wording of `edit_document`, the class, pedagogy and About you messages and
F3's gateway (the assistant hears only about features that are on) have changed. Do the core
jobs, layout and pedagogy still pass on the current model (GPT-6 Sol, the default)?

**Commit.** 7738239 (`development`). One run per case. All commands had
`ELM_PROXY_BASE_URL=https://elm.edina.ac.uk/api/v1 ELM_PROXY_API_KEY=placeholder NODE_USE_ENV_PROXY=1`
on the line.

```bash
pnpm eval -t "a question gets an answer in chat"     # first, to see the key works
pnpm eval -t "<the 13 core names, as in the 11 Nov entry>"
pnpm eval evals/layout.eval.ts
pnpm --filter @edw/library serve &                    # the pedagogy cases need a library server
LIBRARY_URL=http://localhost:8787 pnpm eval evals/pedagogy.eval.ts
pnpm eval -t "space the instructions"                 # one re-run of the layout failure
```

All 13 core names still matched a case. The pedagogy cases are skipped without `LIBRARY_URL`
(the first try ran none), so they ran against the library served locally from `library/`. This
was their first run.

| Part | Passed every behaviour check | Within every budget | Model calls | Median turn |
| --- | --- | --- | --- | --- |
| Core (13 cases) | 13/13 | 13/13 | 29 | 5.9 s |
| Layout (14 cases) | 13/14 (14/14 on one re-run of the failure) | 14/14 | 49 | 8.2 s |
| Pedagogy (8 cases, first run) | 4/8 | 4/8 | 34 | 23.4 s |

**What went wrong**, from the runs:

- **Layout, "space the instructions": flaky.** Given only those three words, it asked "Do you
  mean add space between each task's instructions and the questions below them?" and changed
  nothing. Re-run once: it spaced the doc and passed every check. A fair reading of a vague
  prompt, not a fault.
- **Pedagogy, tidy-puffin's version, and three pupils with dyslexia: the case is out of date.**
  Both want a doc in Comic Sans (tidy-puffin's chosen font). `edit_document` has not offered
  Comic Sans since eb61397 (12 Nov, "a past study condition"), and these cases were written
  after it. The model made the copy and told the teacher, correctly: "I couldn't set Comic Sans
  or an exact 14 pt size in the document editor, so I haven't substituted a different font",
  and named the amber overlay. Everything else in both cases passed. Sam to say whether Comic
  Sans comes back for a pupil's own choice or the cases change.
- **Pedagogy, "does not lower the goal silently": the model.** Asked to simplify for
  steady-crayon, it made a simpler copy (shorter sentences, the answer to the "why live near
  volcanoes" question put into the passage) and said nothing about the learning goal or that
  it had changed the task. The case wants it to say so (or offer first). The original was kept.
  The pedagogy message's guidance on not lowering the goal silently did not take hold.
- **Pedagogy, whole-class exercise: the prompt.** It cited the library and named LIT 2-13a, but
  wrote the code next to a link to the Education Scotland PDF, which the pedagogy message
  forbids ("never as a link"). `library_read`'s own description says "Cite the source when you
  use it" and returns a source link, so the two instructions pull against each other.
- **Budget: uncached input over 6,000 tokens** in four pedagogy cases (15.9k, 19.1k, 21.6k and
  17.7k): library and pedagogy reads are long, and the cases keep the default input budget. Not
  a fault in the turn; the budget was set before the cases had ever run.

Core was no worse than the 11 Nov Sol run (26/26 then, 13/13 now). Only regressions against
`baseline.json`: drafting into an empty doc took 3 model calls rather than 2 (it ran
`check_layout`) with more input and output, and a few hundred more uncached input tokens on
two small cases (the longer prompts).

**Cost.** Not shown in dollars. About 1.06M input tokens (about 124k uncached) and 22k output
over 123 model calls, all on Sol: roughly 4 times the 11 Nov two-run Sol core run, so about $1
to $2.

**Files.** `docs/eval-results/2026-11-15-release/{smoke,core,layout,layout-rerun,pedagogy}/`.

---

## 11 Nov 2026: the open models on the core of the editor

**Question.** Do Luna, Mistral Small 4 and Qwen 3.5 do the editor's core jobs as Sol does, and
fast enough? Sol is known to work; these had never been run through the evals.

**Cases (13, "core").** The ones the whole app rests on: each tool (read another doc, draft into
an empty doc, replace from a comment, delete, a new doc), an answer in chat with no edits, one
fix in a long doc, one list item, a copy with an extension task (`copy_of`), a suggested change
put straight in (Editing mode), a request in an @model comment, an invented block id, a list
turned into a table. Two runs each.

```bash
EVAL_RUNS=2 EVAL_MODEL=<model id> pnpm eval -t "read_document: fills an answer key|insert: drafts a worksheet|replace: a comment on one sentence|delete: removes the question|create_doc: makes an answer sheet|a question gets an answer in chat|a long document: one targeted fix|a request about one item changes that item only|a duplicated version with an extension task keeps every block|a direct request to make the suggested change|a request in a comment changes the commented block|an invented block id changes nothing|asked to turn a list into a table"
```

Branch `spyglass-added-label`, commit 9c353cc with the `EVAL_MODEL` switch (committed next as
13b2aad); Sol on 13b2aad. Qwen without thinking used a temporary switch, not committed, that sent
`chat_template_kwargs: {enable_thinking: false}` (see the probe below).

| Model | Passed every check | Median turn | Slowest turn | Thinking tokens |
| --- | --- | --- | --- | --- |
| GPT-6 Sol | 26/26 | 6.0 s | 10 s | 1,402 |
| GPT-6 Luna | 23/26 | 7.2 s | 11 s | 2,766 |
| Mistral Small 4 | 17/26 | 3.3 s | 7 s | 0 |
| Qwen 3.5, thinking (as the app sends it) | 23/26 | 10.7 s | 40 s | 6,711 |
| Qwen 3.5, thinking off | 21/26 | 5.2 s | 33 s | 0 |

**What went wrong**, from the runs:

- **Mistral.** Asked to draft a worksheet into an empty doc, it replied "I've created a short
  worksheet on metaphors for P6" and called no tool, both runs. Asked to remove the moon
  question, once it deleted "The classroom was a zoo." and replied "I've removed the sentence
  starter about the moon." It never made a table from a list (both runs), never used `copy_of`
  (both runs, and left blocks out of the copy), made 5 operations for a one-fix request, and
  left a suggestion waiting that it was asked to put in.
- **Qwen, thinking.** Too slow: drafting a short worksheet took 33 s and 40 s. One run drafted
  into a new doc instead of the empty one; one added a sentence after the commented one rather
  than rewriting it; a copy had an edit refused before it corrected it.
- **Qwen, thinking off.** Both runs added a sentence after the commented one rather than
  rewriting it; once it left a suggestion waiting; a copy had an edit refused before it
  corrected it. One turn still took 33 s.
- **Luna.** Once wrote a copy out by hand rather than with `copy_of` (the copy was right, but
  Spyglass cannot see it as a copy); once left a suggestion waiting; once had an edit refused
  before it corrected it.

**Cost.** Under $0.50 for all five runners (Sol most of it; ELM's open models are not priced).

**Files.** `docs/eval-results/2026-11-11-core-{sol,luna,mistral,qwen-thinking,qwen-no-thinking}/`.

---

## 11 Nov 2026: Qwen's hidden thinking (probe)

**Question.** Why was Qwen slow as a judge, and does it think during editing too?

Two calls per variant against ELM, one real judge case (3PD #3) and one small edit through an
`edit_document`-shaped tool. Script: `docs/eval-results/2026-11-11-qwen-thinking-probe.script.ts.txt`
(it read the key from `.env`).

| Variant | Thinking tokens | Time |
| --- | --- | --- |
| Judge, as the app sends it | 256 to 940 | 6 to 32 s |
| Judge, `/no_think` in the prompt | 150 to 490 | 11 to 14 s |
| Judge, `chat_template_kwargs: {enable_thinking: false}` (works on `/responses` too) | 0 | 0.7 to 3.3 s |
| Small edit, as the app sends it | about 115 | 2.8 to 4.8 s |
| Small edit, thinking off | 0 | 1.0 to 2.2 s |

**Finding.** Qwen thinks on every call although ELM refuses it a reasoning effort and the app
sends none. Its forced tool call works when given room; the earlier "no" in `docs/spyglass.md`
Part 8 was its thinking running out of output tokens.

---

## 11 Nov 2026: the Spyglass judge with Sol, Luna and Mistral

**Question.** Which model should judge? How often does each agree with itself and with Sol?

`JUDGE_RUNS=5 JUDGE_MODELS=gpt-6-sol,gpt-6-luna,mistralai/Mistral-Small-4-119B-2603 pnpm judge-models`
(commit 9c353cc, with the `added` label). 21 judged turns from sessions 1KC, 2SH and 3PD, 5 runs
per model. Agreement is the overlap of flagged blocks with their labels (Jaccard).

| Model | Usable answers | Median / 95th percentile | Turns flagged | Agrees with itself | Agrees with Sol |
| --- | --- | --- | --- | --- | --- |
| GPT-6 Sol | 100% | 1.3 s / 4.0 s | 40% | 0.83 | |
| GPT-6 Luna | 100% | 1.9 s / 6.9 s | 60% | 0.74 | 0.53 |
| Mistral Small 4 | 98% | 1.0 s / 1.6 s | 90% | 0.61 | 0.18 |

**Where they disagree.** Mistral alone flags the change the teacher asked for, run after run:
"This is actually class P7B" (4/5), "this is Primary 7a" (5/5), "Change the requirements to one
simile and one metaphor" (5/5), "list the choices vertically" (5/5); and calls a definition
moved into its own block "removed" (5/5). Luna flags more than Sol: sometimes useful (a number
column added during "Improve the spacing of the table", 5/5) and sometimes noise (the choices
asked for in 1KC #11, 2/5). On old copies written without `copy_of`, Luna and Mistral flag the
content of a duplicate the teacher asked for; Sol does not. Sol alone named a factual error a
pupil would learn ("Wrong king at Bannockburn", 3PD #2).

**Cost.** About $0.30. **Files.** `docs/eval-results/2026-11-11-judge-sol-luna-mistral/`
(`flags.md` has every flag).

---

## 11 Nov 2026: the judge's first run on ELM (before the `added` label)

**Question.** Does the judge work against ELM at all? It had only run on the mock.

`JUDGE_RUNS=1 JUDGE_MODELS=gpt-6-luna,mistralai/Mistral-Small-4-119B-2603 pnpm judge-models`
(commit fa10f10). 21 turns, one run each.

**Finding.** It works: 95% usable answers each, Luna 2.1 s and Mistral 0.9 s median. Six answers
were refused because the models used the label `added`, which the tool did not offer, though
the findings list additions and the prompt asks for unrequested content to be flagged; three
turns fell back to the code's flags. Others squeezed additions into `changed` or
`built_on_suggestion`. Fixed in 649aa8b (the `added` label).

**Cost.** About 1p. **Files.** `docs/eval-results/2026-11-11-judge-before-added-label/`.
