# Evals

Behavioural and cost evals for the assistant, modelled on Pi's `packages/evals`. They run
teacher messages through the app's own chat service against the real model (ELM), grade what
happened with deterministic checks, and report cost. They are run by hand, never in CI: every
run costs model calls.

```bash
pnpm eval                                   # every case once, on ELM (.env supplies the key)
pnpm eval -t "read_document"                # cases whose name matches
EVAL_RUNS=5 pnpm eval                       # repetitions, to see how stable a case is
EVAL_MODE=single pnpm eval                  # the one-call mode, for comparison
EVAL_CONFIG_DIR=path/to/config pnpm eval    # another config or system prompt (a variant)
EVAL_MODEL=gpt-6-luna pnpm eval             # another of the picker's models, as a teacher would pick it
EVAL_UPDATE_BASELINE=1 pnpm eval            # make this run the new baseline
EVAL_STRICT=1 pnpm eval                     # fail on a failed check or a regression
EVAL_PROVIDER=mock pnpm eval                # the offline mock: checks the harness, not the model
```

`pnpm test` runs only the harness's own tests (`test/`, with the mock).

The Spyglass judge (`docs/spyglass.md`, Part 8):

```bash
pnpm sessions                               # data/Telemetry's sessions as cases in fixtures/sessions/ (no model calls)
pnpm judge-models                           # the judge experiment: Astra, Luna and Mistral, 5 runs a case
EVAL_PROVIDER=mock JUDGE_RUNS=2 pnpm judge-models   # the same offline
```

Each run writes `.eval/judge-<time>/`: `records.jsonl`, `report.txt` (usable answers, time,
tokens, agreement of each model with itself and between the pairs), and `flags.md`, every flag
with its `why`, for reading.

## Layout

- `evals/*.eval.ts`: the cases. A case is a fixture (documents, earlier chat, the teacher's
  message, an optional comment anchor) and its checks, nothing else.
  - `tools.eval.ts`: each tool and operation (read, insert, replace via a comment, delete,
    move, a new document, table widths).
  - `behaviour.eval.ts`: when to edit and when to answer or ask, following the chat so far,
    long documents, British English, Gaelic text.
  - `adversarial.eval.ts`: instructions hidden in documents, invented ids, bait for long
    loops and huge output, unsuitable requests.
  - `comments.eval.ts`: reviewing with margin comments, answering an @model comment in its
    thread (a question, and a change), replying to the teacher's threads, an instruction hidden
    in a comment.
  - `look.eval.ts`: a doc's page colour asked for in other words (the closest one on the
    list, named in the reply) or not on the list at all (no change, the options named), and a
    grid asked for as a table block rather than table rows written into a list.
  - `layout.eval.ts`: the workshop teachers' layout prompts (table spacing, writing lines,
    gaps, page ends) on worksheets rebuilt from their telemetry (`src/layout-fixtures.ts`),
    judged with the layout check the model has as `check_layout` (`src/layout-judges.ts`);
    plus a small edit that should not set off a check. `pnpm eval -t "Layout"`.
  - `pedagogy.eval.ts`: a class chat grounded in the pedagogy library (HANDOFF.md section 8):
    tidy-puffin's version, three pupils with dyslexia treated differently, the Holocaust
    caution, no silent modification, steering away from a dyslexia font, reciprocal reading,
    and citing a principle. They need a library server (`pnpm --filter @edw/library serve`,
    then `LIBRARY_URL=http://localhost:8787`) and are skipped without one. Only class cases get
    libraries, so the others run as their baseline did.
  - `reader.eval.ts`: a pupil's ask in the reader (#214), built by the server's own `askRequest`
    and sent by `callReader` on config `reader.model` under config's safety instruction
    (`src/reader-case.ts`): a plain ask gets a short reply, an instruction hidden in the article
    is not followed, a pupil's personal detail in the article is not repeated. `pnpm eval -t reader`.
  - `workshop.eval.ts`: every message of a real exported workshop, from exactly where the
    original model started (`EVAL_EXPORT`, or the export in `data/`; skipped without one).
- `src/harness.ts`: a fresh workspace per run, one turn, and what happened (calls, tools,
  tokens, time, each document before and after with its suggestions accepted).
- `src/judges.ts`: the checks. `behaviour` checks say whether it did the right thing;
  `budget` checks whether it stayed within cost (model calls, uncached input tokens, output
  tokens, time; defaults in `DEFAULT_BUDGET`, overridable per case).
- `src/report.ts`, `src/run.ts`: the report and the run directory.
- `src/sessions/`: a workshop export as Spyglass cases (`bundle.ts`), from the docs each turn's
  first model call saw (`canvas.ts`), with old copies also written as `copy_of` (`as-copy.ts`).
- `src/judge/`: the judge experiment (`experiment.ts`), agreement (`agreement.ts`) and its report.

## Results

Each run writes `.eval/<timestamp>_<id>/` (not committed):

- `protocol.json`: model, mode, tools, config and prompt hashes, runs per case, git commit.
- `observations.jsonl`: one line per case run: checks, calls, tools, tokens, time.
- `runs/*.json`: each run in full (fixture, reply, operations, documents before and after),
  for reading what it actually wrote.
- `report.txt` and `report.json`: pass rates, budgets, failed checks, mean cost, and what got
  worse than `baseline.json` (pass rates, or calls and tokens more than 25% up).

A failed check is data for the report, not a crashed run, unless `EVAL_STRICT=1`. One run per
case shows what happened once, not how stable it is.

## Adding a case

```ts
evalCase(
  'what it should do, in a sentence',
  { docs: [{ name: 'Similes', blocks: [h('# Similes'), ol(['As brave as a lion.'])] }], prompt: 'Add two more.' },
  [edited, docMatches('Similes', /^3\. /m), noRejectedEdits],
  { budget: { steps: 2 } },
);
```

A new tool gets cases here in the same change: what it is for, an edge case, and an
adversarial one.
