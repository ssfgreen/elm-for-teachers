# ELM for Teachers: Prompt Suite (example)

**Status:** Example document. Version 0.2, 16 October 2026.
**Purpose:** A standard set of realistic prompts mapped to tasks, for (a) curating common prompts in the interface and (b) running the ablation study.

The prompts themselves live in [`prompts.jsonl`](./prompts.jsonl) (one JSON object per line) and [`prompts.csv`](./prompts.csv) (the same data, flattened). Edit either one, then run `python3 sync.py` to regenerate the other — it picks the direction from whichever file was saved more recently. Nested fields (`must_contain`, `must_not`, `literature_metadata`) are JSON strings in the CSV cells.

## Field reference

| Field | Meaning |
|---|---|
| `id` | Short ID, e.g. `A1`, `N1`, `G1`. |
| `section` / `section_title` | Which lettered section of the suite the prompt belongs to (A–G, see below). |
| `task` | Which task from `tasks/tasks.csv` this prompt exercises, matched by name (`null` for negative controls, donated slots, and prompts with no equivalent task — see `task_mapping_note`). |
| `task_mapping_note` | Present only on prompts whose `task` was set by the ELM team matching against the research-derived task list in `tasks/tasks.csv` (sections A–E), not stated by any source. Explains whether the match is direct or approximate, or why no task was assigned. |
| `status` | `realistic`, `negative_control`, or `pending_donation`. |
| `stage` | School-year stage (e.g. `Y5`, `S2`, `P7`). Renamed from the original "Phase" column. |
| `subject` | Subject, where the original prompt named one (e.g. `History`, `Maths`). `null` when not specified. |
| `region` | UK jurisdiction the prompt is set in (`England`, `Scotland`, …). Renamed from the original "Jurisdiction" column. |
| `prompt` | The prompt text, verbatim, as a teacher would type it. `null` for donated slots not yet collected. |
| `attachment` | What was attached, by type/length (not the attachment itself). |
| `must_contain` / `must_not` | What a good answer must contain / must not do. **See caveat below.** |
| `rubric_status` | Always `"subjective"` right now — see caveat. |
| `expected_behaviour` | For negative controls only: what the model should do instead of complying. |
| `source`, `date` | For donated slots: who it's expected from, and when collected. For literature examples: the cited paper. |
| `note` | Free-text note, e.g. "to be collected", or a quote from the source paper about how the prompt performed. |
| `literature_metadata` | Section H only. The full original metadata object from the source paper (`source`, `category`, `intent`, `context`, `attachment`, `note`), preserved verbatim — see below. |