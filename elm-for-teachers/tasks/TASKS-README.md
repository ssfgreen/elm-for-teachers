# ELM for Teachers: Tasks and Goals

**Status:** Example document.

The data lives in [`tasks.csv`](./tasks.csv) and [`goals.csv`](./goals.csv); this file is the field reference.

## `tasks.csv` — 15 planning sub-tasks

| Field | Meaning |
|---|---|
| `task` | The sub-task, as positioned by participants. |
| `mine_alone` / `i_lead` / `it_leads` / `it_handles` / `depends` | Count of participants (of 10) who placed the task at that point on the delegation spectrum. |
| `reserved` | `mine_alone` + `i_lead`. Rows are ordered by this, most reserved first. |
| `modal_placement` | The most common placement(s); a tie lists both. |
| `current_use`, `time_saved`, `quality_uplift`, `pd_value`, `knowledge_improvable` | The [planning document](../../PLANNING-README.md)'s other high-value-task criteria. Not in the paper — blank until scored. |

No participant positioned "produce the lesson plan" itself. The closest item is reformatting an already-made plan into a document.

## `goals.csv` — 8 candidate system goals

| Field | Meaning |
|---|---|
| `goal` | The goal, as sorted by participants. |
| `want` / `indifferent` / `not_want` | Count of participants who sorted the goal each way. |
| `n` | Sample size (10). |
| `rank` | Mean rank among participants who wanted it. Read for its extremes only — participants ranked different-sized sets. |
| `provenance` | `seeded` (one of 4 researcher-written goals shown at the start) or `derived` (raised by participants, 5-8 of them). |