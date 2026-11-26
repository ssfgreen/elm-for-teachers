# Backlog (11 Nov 2026, evening)

One table to choose the next work from. Gathered from `docs/HANDOVER.md` sections 4a to 6, the
backlog in `docs/PLAN.md` section 3, the T steps in `docs/plugins.md` and the Spyglass plan
(`docs/spyglass.md`). Points are from those documents; the Spyglass points are an estimate.

## Done since the morning

- **Spyglass steps 1 and 2** (lineage, the copy choice card, the turn's effect), on `development`.
  The copy evals (`packages/evals/evals/copies.eval.ts`) pass against ELM: `copy_of` used for every
  copy asked for and never otherwise, no copy written out again from its text, no copied block
  named wrongly.
- **Interaction logging** (`claude/busy-newton-3ohipw`) merged into `development`.
- Branches tidied: only `main` and `development` are left.

## Next (Sam, 11 Nov)

| Work | Points | Notes |
| --- | --- | --- |
| **Spyglass, steps 4 to 7:** the judge model experiment (Llama 3.3 70B, Mistral Small 4, GPT-6 Luna), the scope and coherence checks, the callout and the toggle, open flags in Accept all and Download (three ways to download), the copy diff and account check experiments | about 22 (estimate), plus the Download dialog | Needs first: the three sessions as fixtures (bundles now in `data/Telemetry/`), and Sam's answers to the two questions at the end of `docs/spyglass.md` (what the experiment measures; what "Download with changes" puts in the file). |
| **T.1** Teacher skills in a project (the old P.3) | 5 | Start of the plugins plan. T.2 to T.6 follow (below). |
| **Replace within a block:** an exact phrase, which must match once, or an error to the model | not sized | Backlog #1 since 30 Oct. Today `replace` sends a block's whole new text, so the model types out text it was not asked to change, and can change it (1KC's sentence 5). Would make Spyglass's effect simpler too. |

**Spyglass step 3** (the offline runner over exported sessions, about 5): proposed to fold into
step 4 rather than build first. Step 4's experiment needs the session fixtures and each case's
effect stored, not the runner. The runner's own job, setting flags against repair signals, needs a
judge to run, and the plan already runs it before each check goes live. Sam to decide.

## Later in the plugins plan

| Work | Points | Notes |
| --- | --- | --- |
| **T.2** Tools tab: lookup table and checklist | 8 | After T.1. |
| **T.3** Tests tab: teachers test their skills (P.4 core) | 12 | After T.1. Examples with pupils' work wait for P.5. |
| **T.4** Testing budget, and budgets on `/admin` (part of P.6) | 6 | After T.3. |
| **T.5** Publish as plugin | 8 | After T.3. |
| **T.6** Template tools; blind comparison in tests | 8 | Later. |

## Loose ends

| Loose end | Size | Why it matters |
| --- | --- | --- |
| Push the last commit on `development` (`06d318f`, the copy eval fixture fix) | tiny | Sam's machine; the sandbox cannot push. |
| Merge `development` into `main`, after `pnpm build && pnpm e2e` on a machine with a browser | small | Nobody has tried the copy choice card or interaction logging's admin column in a browser since the merge. A push to `main` deploys. |
| Deploy the library server, set `LIBRARY_URL` on Vercel | small | Without it the Education Scotland and TRAILS libraries do not work in production. |
| Library: the weekly refresh job and the curation frontend | not sized | Not built. Qualifications Scotland waits on talking to them. |
| Evals for the library tools | small | Costs money. |
| Cost rises in the 11 Nov full eval: uncached input up on 11 cases (references, behaviour, skills), each with no cache on its first call | small | One run after a prompt change. Run `EVAL_RUNS=5 pnpm eval` before deciding anything, and before any baseline update. Costs money. |
| "Asked to make one edit call per item": 9 calls against a budget of 6 (cap 12) | tiny | The model did as asked this time. Watch it in the next runs. |
| Model edits logged in `text_events` with `cause: keystroke_batch` (1KC, events 51 and 61) | small | Miscounts model edits in the research data. Not reproduced. Failing test first. |
| `core.spec.ts` "page colour" fails on `main`; "ask, accept" fails now and then | small | Known since 8 Nov, not caused by later work. |
| Browser tests for Stop and queued messages | small | Tried by hand on 9 Nov only. |
| Interaction logging: watch the event volume in the first sessions | tiny | Pointer is about 1.5 kB per 2 s of movement. |
| Not tried on a real phone or iOS Safari | small | |
| Make kit: real dragging with a mouse, and the design step against ELM | small | Only tried in headless Chrome (3 Nov). |
| The Docker sandbox: allow `api.arasaac.org` | tiny | Blocked, so the pictures eval fails there every time. |
| `docs/HANDOVER.md` behind | tiny | Missing the 11 Nov work: text sizes, step summaries, the copy evals (Spyglass now has 4a7). |

## Longer term

| Work | Points | State | Notes |
| --- | --- | --- | --- |
| P.5 Pupil work: permission, nothing kept | 8 | Backlog | Needs the ethics and data-protection check first. |
| Images in references, `view_reference_page` | 5 | Backlog (P.2 step 4) | Needs a probe of ELM taking images in tool output. |
| Web search tool | not sized | Backlog #3 | Output cut at `max_read_chars`. |
| More skills, written by Sam | not sized | Backlog #4 | The format is ready. |
| Autonomy as a study variable (suggest only, or suggest and comment) | not sized | Backlog #5 | Needs tool hooks or a tool and prompt set per condition. |
| Reply inside `edit_document` to save a model call | not sized | Backlog #6 | Cost. |
| A document version on each proposal, clearing large tool results once used, a `kind` on comments | small each | Backlog #7 | |
| L.6 Select and drag several blocks | not sized | Not started | |
| A full DOM recording (rrweb) on top of interaction logging | not sized | Discussed 10 Nov | |
| **Automarked forms:** a new kind of document for subjects like maths, where pupils' answers are marked automatically | not sized | Sam, 11 Nov | A new artefact type beside the worksheet. |
| **Presentations:** a PowerPoint-like editor for slides | not sized | Sam, 11 Nov | A new artefact type; PowerPoint files are read as text today (P.2). |
| **Reading helper ideas from teachers:** teacher-set highlighter categories, a summary area, a glossary across texts, fact-checking prompts | not sized | Sam, 23 Nov | `docs/research/reading-helper-feedback-2026-11.md`; R1 keeps categories as data so the first is small. |
| D.4 Teacher accounts, then T.7 sharing beyond a workspace | large | Later | |
| D.6 Study layer back | large | If the study needs it | |
