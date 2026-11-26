# Spyglass: checking what each assistant turn did (plan, 11 Nov 2026)

**Spyglass** is a feature teachers turn on and off themselves, under the chat box. While it is on,
after every turn that changes a document, the editor checks two things, and later perhaps a third:
that the turn did only what the teacher asked (**scope**), that the rest of the document still fits
(**coherence**), and possibly that the reply told the teacher what changed (**account**, an
experiment first). Code works out exactly what the turn changed. One small model call, the
**judge**, decides which of those changes a teacher would want to know about. The answer appears as
a **Spyglass** callout under the reply.

This plan replaces the first draft ("Spec: Checking what each assistant turn did", Sam, 11 Nov),
which was written without the code in view. What changed from it, and why, is at the end.

## The checks

| Check | The question | Compares | Typical findings |
| --- | --- | --- | --- |
| **Scope** | Did the turn do only what was asked? | the turn's whole effect with the teacher's request | something left out of a copy; a fact, an answer or a definition rewritten during a layout request; a block inserted twice |
| **Coherence** | Does the rest of the document still fit? | each changed block with the blocks about the same thing | instructions that still describe the old question format; a header and a Name line naming different classes; timings that no longer add up |
| **Account** *(experiment)* | Did the reply tell the teacher? | the reply's text with the turn's effect | a reply that leaves a change out, or describes two changes as one |

A fourth question, "did it do everything asked?", has no check: in every session so far the reply
said plainly what it could not do. Add one when a case shows a silent failure.

## The principle: code finds, the model judges

Code works out the facts: what the turn removed, added, moved, duplicated and changed, and which
blocks relate to each change. It is exact and cannot be talked out of a finding. The judge decides
meaning: which facts the request did not cover, which a teacher would care about, and whether the
reply said so. It cannot hide a fact: every finding stays one click away, even when it is ranked low.

Labels (`removed`, `changed`, `added`, `duplicated`, `built_on_suggestion`, `stale`, `contradicts`,
`copies_differ`, `unreported`) are what the judge puts on a flag, not separate detectors.

**When a case escapes**, the cause is one of three, each with one place to fix it:

| Cause | Fix |
| --- | --- |
| The effect left something out | `shared/src/turn-effect.ts` |
| A relation between blocks was missing | `shared/src/neighbours.ts` |
| The judge misjudged | the principle in its prompt (never a rule for that one case), and an eval |

## Part 1: lineage

The effect can only tell a reworded block from a removed one if every block made from another says
so. `Block.derived_from` already exists and is already set by the teacher's Duplicate
(`duplicateDoc`), by Enter (`splitBlock`, the second half) and by the list migration
(`server/src/lists/split.ts`). No migration is needed. Because it already means "parent on split,
merge or duplicate", the effect follows lineage **only through blocks this turn produced**.

**`copy_of` on `create_doc`.** `CreateDocOp` (`shared/src/operations.ts`) gains an optional
`copy_of`: a doc id in the chat's working view. `applyOperations` (`shared/src/canvas/apply.ts`)
creates the doc and copies the source's blocks in order as model suggestions (`origin: model`,
`status: proposed`), each with `derived_from` set to its source block, and the source's style.
`edit_document` returns `copies: [{from, id}]`, so later operations in the turn can `replace` or
`delete` the copies. The loop is shared with `duplicateDoc`; the function is not, since a teacher
duplicate is live teacher text. `validate.ts` refuses a `copy_of` outside the working view
(`unknown_doc`). The tool description and `config/system_prompt_agent.md` tell the model to make
copies this way, next to the existing line for reference files (line 69), and only when the teacher
asks for a copy.

**`from` on `insert`.** `InsertOp` gains an optional `from`: a block id in the working view, for a
block the model writes as a version of an existing one (a definition moved into a block of its
own). Validated like `id`; it sets `derived_from`.

`replace`, `delete` and `move` act in place and keep the block's id, so a block's own id is its
lineage.

### A copy of a doc with suggestions still waiting

When `copy_of` names a doc with suggestions the teacher has not decided on (a suggested block, or a
change waiting on a live block), the teacher chooses what the copy is built from. The model does
not.

1. `edit_document` does not make the copy. Its result says, like an Ask first plugin
   (`askFirstResult`), that the teacher must choose first and how many suggestions are waiting; the
   model says so in its reply. The turn's other operations go ahead.
2. Under the reply the chat shows a card (`components/CopyChoice.tsx`, its logic in
   `useCopyChoice.ts`) with three buttons:

| Button | What happens | The copy is built from |
| --- | --- | --- |
| **Approve all and use** | the source's suggestions are accepted through the existing Accept all command (`proposal_accept`, mode `accept_all`) | the source as it now is |
| **Use only approved** | the source is left as it is | its live text only, as the teacher's Duplicate does |
| **Use all and leave** | the source keeps its suggestions waiting | the source as if every suggestion were accepted (a suggested block copied, a waiting change taken, a waiting delete left out) |

3. The button logs `copy_choice` and sends a message for the teacher, as Allow does for a plugin
   (`usePluginRequests.ts`), with the choice in the chat body (`ChatBody.copy_choice: { doc_id,
   choice }`). The server passes it to the tool context, so the choice is the teacher's, recorded,
   and cannot be made by the model. The next `copy_of` for that doc uses it.

With **Use all and leave**, a copy block made from a suggestion has `derived_from` naming the
suggested block, so the effect knows; it is the teacher's choice, so it raises no flag.

The other way a suggestion gets into a copy is the model typing it out again from `read_document`,
which shows suggested text (`gateway/prompt.ts`). The effect catches that: an inserted block whose
text matches a suggestion still waiting in a doc the turn copied or read is `built_on_suggestion`.

## Part 2: the turn's effect

`shared/src/turn-effect.ts`, pure. For each doc in the working view it compares **before** and
**after**:

- **Before** is the docs as they are at commit, before the turn is applied. Not the snapshot from
  the start of the turn: the teacher may have typed since (`typed-during.ts`), and that is not the
  turn's doing.
- **After** is before, with the turn's operations applied and **only this turn's** suggestions taken
  in, the way Editing mode does it (`takeTurnIn`). Not `previewView`, whose Accept all also takes in
  earlier turns' suggestions.
- The operations are those the commit applies, after `expandListOps`, so a list edit is not read as
  blocks removed and added.
- Docs opened from a reference file during the turn (`open_reference_as_doc`) are the teacher's own
  copies and are left out.

| Effect | Defined as |
| --- | --- |
| removed | a block from before with no live descendant after (same id, or `derived_from` through this turn's blocks); and a block copied this turn with no live descendant in that copy, though the source still has it |
| changed | a block with a descendant whose text differs after normalising |
| moved | a descendant in another doc (a copy) or another position |
| added | a new block with no `from` |
| duplicated | two blocks the turn added with the same text, or an added block equal to one already in that doc |
| built on a suggestion | an added block matching waiting suggested text (above) |

**Tables by row.** A row that moves into a new table keeps its lineage through the table's `from`.
Within that lineage, rows match by their number cell, then by text: lineage has already narrowed the
candidates to a few rows.

**Normalising.** Before comparing, strip what does not change content: emphasis marks, the
`<!-- colwidths: ... -->` line (`client/src/editor/markdown.ts`), quote styles and runs of white
space. A change that only touches these is `formatting` and never reaches the judge.

The same function runs in `edit_document`, over the turn's operations so far, so the editing model
can see what it has done (Part 6, `shown_and_model`).

## Part 3: neighbours and the code-only checks

**Neighbours** (`shared/src/neighbours.ts`, pure): the blocks that describe the same thing as a
changed block.

| Relation | Found by |
| --- | --- |
| Same section | blocks under the same heading, up to the next heading of that level |
| Same question | the answers section's entry for the same task or part and number |
| Document header | blocks before the first section heading: title, Name line, class, time |
| Copies | blocks in other docs of the chat that share lineage |

**Code-only checks** (`shared/src/coherence.ts`, pure): time adds up ("About N minutes" against the
sum of "(N minutes)"), answers match questions, copies agree. These are **candidates for the
judge, not findings that stand alone**: copies here differ on purpose (this is a differentiation
tool), and a repeated Name line or "(continued)" heading is often what a page-split layout wants.
When the judge is unavailable they are not shown.

## Part 4: where the checks run, and the judge

The checks are not a tool the model chooses: it would skip them when they matter, and mark its own
work.

1. **In `edit_document`**, under `shown_and_model` only: the effect of the turn so far, compact
   (counts, and the ids and first words of removed and changed blocks), in the result as
   `turn_effect`. `dropped` keeps its meaning.
2. **After the commit**, in `gateway/turn-checks.ts` (new): the effect, neighbours and code-only
   checks, then the judge. Never inside the commit's write transaction: the judge is a network
   call.
3. **The judge** runs only when the effect holds a change that is neither formatting nor a move (a copy with nothing changed in it, or blocks put in another order, which the step cards already show), or a code-only
   check found a candidate. "Tidy up the columns" calls nothing.
4. **The stream** gets one more line, `{"type": "spyglass", ...}`, after
   `{"type": "result", ...}`. The route waits for it before ending the response (on Vercel the
   function can be frozen once the response ends). The client keeps reading after `result`; the
   chat box is free as soon as `result` arrives. The plain `POST .../chat` route returns the result
   without flags; the client fetches them with the turn.
5. **Storage.** The turn is saved inside the commit, so the flags are a second write: the
   `chat_turns` row's JSON gains `spyglass`, and its `rewritten_assistant_content` gains
   "[Spyglass: ...]" after the existing "[Suggested edits: ...]" note (`agent.ts`), so later
   turns know. `summary.ts` reads the same field.

Turns in single mode (`single-turn.ts`) get the checks after the commit too, but no `turn_effect`.

**The judge call** follows the summary call's pattern (`gateway/summary.ts`): its prompt is a
constant in `gateway/judge.ts`, recorded in `config_versions` with its hash, and its call is a
`gateway_calls` row with `purpose: "judge"` and that hash. The output is one forced tool call
(`toolChoice`, which `elm.ts` supports) whose parameters are the schema below, parsed with zod and
retried once. Its input: the teacher's message, the effect without formatting, each change's
neighbours, the code-only candidates and the reply's text.

```ts
// shared/src/spyglass.ts
KeyDecision = {
  check: "scope" | "coherence" | "account",
  label: "removed" | "changed" | "duplicated" | "built_on_suggestion"
       | "stale" | "contradicts" | "copies_differ" | "unreported",
  block_ids: string[],
  title: string,   // a few words
  why: string,     // one sentence for the teacher
  was?: string     // the text before, for a change
}
SpyglassResult = { flags: KeyDecision[] /* at most 3 */, others: number, by: "judge" | "fallback" }
```

The prompt states each check's question and what a teacher relies on (what the work is for, what
pupils are asked to do, how it is marked, how long it takes), not a list of block names.

**Time.** The judge has its own 8 s timeout (an `AbortSignal`), and is skipped when less than
8 s plus a margin is left of the 300 s function limit (`vercel.json`), counted from the request. A
turn winds up at `agent.max_turn_ms` (200 s), so this rarely bites. On timeout or error the flags
are the effect's `removed` and `changed` findings in document order, titled by their first words,
with no `why`, and `by: "fallback"`. `gateway/mock.ts` gets a judge mock.

**The judge's model** is chosen by the experiment in Part 8, from Llama 3.3 70B, Mistral Small 4
and GPT-6 Luna.

## Part 5: what the teacher sees

### Turning Spyglass on and off

Teachers decide whether Spyglass runs for them: some turns they want every change checked, others
(drafting quickly, trying ideas) they do not want the callout at all.

- **Where:** a toggle in the bar under the chat box, beside Suggesting and Editing and the model
  picker (`components/ComposerBar.tsx`), as its own small component (`components/SpyglassToggle.tsx`)
  with a telescope icon and the label **Spyglass**. Its tooltip: "Check what each change did and
  point out anything you might have missed". On a narrow screen, where the bar is full, it goes at
  the bottom of the Suggesting and Editing menu as a switch.
- **How it is kept:** like the Suggesting and Editing choice (`client/src/screens/useComposerBar.ts`),
  in the browser's storage, so it stays as the teacher left it. **On** by default.
- **What it sends:** each chat request carries `spyglass: boolean` (`ChatBody` in
  `gateway/routes.ts`), and `chat_prompt` logs it beside `edit_mode`, so the research data shows
  which turns ran with it on. Switching it logs `spyglass_toggle { on }`.
- **What off means:** off hides Spyglass from the teacher; it does not stop it. There is no callout
  under the reply, and no `turn_effect` in `edit_document`'s result, so the assistant works as it
  would without Spyglass. In the background everything still runs: the effect, the neighbours, the
  candidates and the judge, and the result is recorded as research data exactly as when it is on
  (`spyglass_shown` with `hidden: "teacher_off"`, the flags on the turn record), so turns with it on
  and off can be compared (decided, Sam, 11 Nov 2026). Turning it back on does not show earlier
  turns' hidden flags.
- **The workspace's switch** (`spyglass` in `shared/src/features.ts`, #64): off hides Spyglass for
  the whole workspace, whatever the teacher's toggle says or the client sends. The checks still
  run unseen, and the result is stored hidden with `hidden: "workspace_off"` (Sam, 15 Nov 2026),
  so no callout streams, none comes back on reload and no `[Spyglass: ...]` note reaches the model.
- **What stays on regardless:** the copy choice card (Part 1). It is not a check: it is the teacher
  deciding what a copy is built from.

### The callout

A **Spyglass** callout under the reply, styled apart from the assistant's messages so it does
not read as part of the dialogue (`components/Spyglass.tsx`, logic in a hook, mounted by the
chat message component, not by `WorkspaceScreen.tsx`). It sits after the turn's step cards.

> **Spyglass**
>
> - **Sentence 5 rewritten.** It was "It took something like an hour to walk home", where "like"
>   means "about", not a comparison. *Keep* · *Undo*
> - **Answer 6 changed** from Metaphor to Simile. *Keep* · *Undo*
> - **"Task 1 (continued)" appears twice.** *Remove one* · *Dismiss*
> - *2 more*

The wording is "your content changed", not "the assistant made a mistake": in session 3PD the
assistant was right and the original was wrong.

**Actions** are teacher commands through `blocks/service.ts`, never model writes:

| Label | Actions |
| --- | --- |
| removed | Restore (a teacher `insert` of the source block's text, with `derived_from` set) · Dismiss |
| changed | Keep · Undo (while the change is still a suggestion: Reject; once in the doc: a teacher edit back to the text before the turn, from its revision) |
| copies\_differ | Apply to the other copies (one edit per copy) · Dismiss |
| duplicated | Remove one · Dismiss |
| built\_on\_suggestion, stale, contradicts, unreported | Show me (scroll to the blocks) · Dismiss |

The teacher `insert` command gains an optional `derived_from` for Restore; nothing else in
`blocks/service.ts` changes.

**In each mode**, a flag appears only where nothing else on screen shows the change:

| Effect | Suggest mode | Editing mode |
| --- | --- | --- |
| Removed from a copy | flag | flag |
| Deleted in place | no flag: it has its own card | flag |
| Changed in place | flag: Accept all buries the tracked change | flag |
| Changed in a copy | flag (unless the copy diff experiment shows it, Part 8) | flag |
| Coherence findings | flag | flag |

Flags are stored with the turn, so the callout looks the same on reload.

**Accept all and Download mention open flags** (Sam, 11 Nov). Accept all says how many flags are
still open before it accepts. Download, when the doc has suggestions waiting or flags open, asks
which: **Accept all changes and download**, **Download without changes**, **Download with
changes**. What the third puts in the file is still open (below).

## Part 6: research data and the config switch

All additions; no existing payload changes meaning.

| Where | Addition |
| --- | --- |
| `shared/src/events/spyglass.ts` (new; `events.ts` is at the size limit) | `spyglass_shown`: turn id, each flag's check, label and block ids, `by`, the judge's gateway call id, `hidden` when not shown · `spyglass_toggle`: on or off, from the toggle · `spyglass_action`: turn id, flag, action (restore, undo, keep, apply\_to\_copies, remove\_one, show, dismiss), the blocks it wrote · `copy_choice`: thread, source doc, choice, how many suggestions were waiting |
| `chat_turns` | `spyglass` |
| `chat_prompt` | `spyglass`: whether the teacher had it on |
| `gateway_calls` | judge calls, `purpose: "judge"`; `edit_document` results carry `turn_effect` and `copies` |
| `config_versions` | the judge prompt |
| blocks | `derived_from` on model copies and `from` inserts |

`BUNDLE_FILES` does not change. Analysis that counts failed calls or tokens per turn should filter
on `purpose`.

**Config switch** `spyglass`, under `config_hash`. It sets what the deployment offers; the
teacher's toggle decides each turn within it.

| Value | Toggle under the chat box | `turn_effect` to the model | Callout shown |
| --- | --- | --- | --- |
| `off` | hidden | no | no |
| `shown` | shown | no | when the teacher has it on |
| `shown_and_model` | shown | when the teacher has it on | when the teacher has it on |

The checks run and log under every value (`hidden: "config_off"`, `"workspace_off"` or
`"teacher_off"`, in that order when more than one applies). Default
`shown_and_model`.

## Part 7: finding cases nobody has read

**Repair signals**, all in what is already logged:

| Signal | Example |
| --- | --- |
| The teacher edits a block the model just changed, within a few minutes | 1KC, 14:45: Task 2 rebuilt seconds after the model's change |
| A prompt that corrects the last turn | 1KC: "break this into 3 questions per page" after "3 tasks per page" |
| A Reject, an undo, or a copy deleted soon after it was made | none so far |
| Accept all followed by export within a minute | 3PD: where an error would go unseen |

**The offline runner** (`packages/evals/src/replay/`, new; TypeScript, since it runs the live
code, while `analysis/` stays independent Python) replays each exported bundle turn by turn through
`turn-effect`, `neighbours`, `coherence` and the judge, and lines flags up against repair signals.
It calls the model, so it is run by hand, like `pnpm eval`.

| Flag? | Repair? | Meaning | Next step |
| --- | --- | --- | --- |
| yes | yes | the check works | count it |
| no | yes | a miss | find which of the three causes; add an eval |
| yes | no | noise, or a problem the teacher never saw | read these first (2SH was one) |
| no | no | nothing to see | sample a few to check the judge's bar |

## Part 8: experiments

### The judge's model

`pnpm judge-models` (in `packages/evals`), by hand; it compares every pair of the models run (`JUDGE_MODELS`, the reference first). Models: **GPT-6 Luna and Mistral Small 4**,
measured against **GPT-6 Astra**, the larger model, as the reference (Sam, 11 Nov). Fixed: the
prompt, its inputs, the temperature, and a low reasoning effort for the GPT models.

Probed on 11 Nov with a forced tool call (`report_flags`), three calls each:

| Model | Forced tool call | Time per call |
| --- | --- | --- |
| Llama 3.3 70B | no: writes the call as JSON text, the same shape each time (`{"type": "function", "name": ..., "parameters": {...}}`) | 2.3 to 3.6 s |
| Mistral Small 4 | yes | 0.9 to 1.2 s |
| GPT-6 Luna | yes | 2.0 to 3.7 s |
| Qwen 3.5 397B-A17B (the only Qwen on ELM) | no: thinks until it runs out of output tokens | 8.3 to 17.7 s; dropped |

Across three identical calls, Mistral flagged a different set of blocks each time, and Luna once
flagged nothing, so the experiment measures agreement rather than pass bars (Sam, 11 Nov). Llama is
left out: it is not in the pairs below.

- **Cases:** the turns where the judge decides something (cases 1, 3, 4, 5 to 7 as one turn, 9 and
  10 as one turn, 12, 13, 14, and 16 below), plus turns the offline runner marks with a repair
  signal. **Inputs are recorded**: each case's effect, neighbours and candidates are computed once
  and stored, so only the judge varies.
- **Runs:** 5 per case per model.
- **Agreement** between two sets of flags on one case is the overlap of the blocks they flag, each
  with its label (Jaccard: shared over either; two empty sets agree fully). Also whether both flag
  anything at all.

| Measure | Compares |
| --- | --- |
| Self-agreement | each model's runs with its own other runs on the same case |
| Luna and Astra | every Luna run with every Astra run |
| Mistral and Astra | every Mistral run with every Astra run |
| Luna and Mistral | every Luna run with every Mistral run |
| Valid output after one retry | each model |
| Latency (median, 95th percentile) and tokens | each model |

No pass bars: Sam chooses from the numbers. A person reads a sample of the `why` sentences, and the
cases where the models disagree. The chosen model goes in the config.

### Showing a copy's differences from its source

In Suggest mode a copy is a doc of suggested blocks, and the model's later edit to one rewrites
that suggestion: the teacher sees no tracked change against the source. That is how 3PD's changes
went unseen. The experiment: the editor draws each block of a model copy as a tracked change against
its `derived_from` source (display only, with `wordDiff`; nothing stored changes), behind a client
config flag `copy_diff`.

- **Build:** the display in the editor's suggestion rendering (`client/src/editor/suggest/`), the
  source's text from the chat's docs already loaded.
- **Measure**, in workshop sessions with it on and off: Undo or Reject on changed copy blocks; time
  between a copy turn and Accept all; and, with the offline runner, how many `changed` flags on
  copies the diff already makes visible.
- **Decide:** if teachers act on the diff, drop `changed` flags on copies in Suggest mode (the
  mode table above), so the callout carries less.

### Whether the account check is needed

The chat's step cards (`gateway/tools/describe-edits.ts`) already list every operation in plain
words, written by code, so the teacher can already see what changed. The account check would add a
judgement that the reply's own words leave a change out.

- **Run** the account part of the judge in the offline runner only, over every bundle.
- **Read** the turns it flags, and count those where the teacher then repaired the change the reply
  left out.
- **Decide:** build the account check if it finds repaired omissions the scope check did not
  already flag; otherwise drop it and the `unreported` label. Proposed bar: at least 3 such turns
  across the bundles.

Either way, `describe-edits.ts` learns `copy_of` ("Copied *Bannockburn sources*"), not
"Added 19 paragraphs".

## Part 9: the sessions so far, as evals

Three sessions from 3 to 6 Nov 2026, read in full.

**2SH (Similes and Metaphors, 5 Nov).** Asked for a shorter duplicate with clearer task breaks, the
assistant rebuilt the copy from scratch, leaving out the learning intention and "About 20 minutes".
The reply was true but silent, and `{"accepted": 19, "dropped": []}` read as "nothing dropped".
Matching by text alone also flagged three reworded blocks: lineage comes first.

**3PD (Bannockburn sources, 6 Nov).** Asked to split two tasks into three parts, the assistant also
changed "Edward I" to "Edward II" (correct), an answer from Primary to Secondary, the definition of a
primary source, and turned a marking cue into a model answer. The original and the Comic Sans copy
kept the old text. The copy included an extension task never accepted in the source. Accept all took
21 suggestions in 2 minutes; export followed 20 seconds later. The header said "About 15 minutes"
over two 5-minute tasks, and "S1/S2" over a Name line saying "S1".

**1KC (Similes and Metaphors, 3 Nov).** Asked for three questions per page, the assistant also
rewrote sentence 5 and changed answer 6, saying only "I also corrected a question and its answer
key". It inserted "Task 1 (continued)" twice. Later, Task 2 became multiple choice while its
instructions and answer key still described free answers. The Name line became P7B under a
"Primary 7" header.

The bundles go into `fixtures/sessions/`, teacher-facing words only.

| # | From | Teacher asks | Expected | Check |
| --- | --- | --- | --- | --- |
| 1 | 2SH | "Create a duplicate. Minimise the amount of text..." | `copy_of` used; if the learning intention is gone, a `removed` flag | scope |
| 2 | 2SH | "Tidy up the columns" | formatting only; no judge call, no flag | negative |
| 3 | 2SH | "Change the requirements to one simile and one metaphor" | no flag | negative |
| 4 | 2SH | "Create a duplicated version... with an extension task" | a copy keeping every block; no `removed` flag | negative |
| 5 | 3PD | "Create another worksheet with Task 1 and Task 2 separated out..." | `changed` for each content change not asked for | scope |
| 6 | 3PD | same turn | `copies_differ`, with Apply to the other copies | coherence |
| 7 | 3PD | same turn, the extension task typed out again | `built_on_suggestion` | scope |
| 8 | 3PD | "Update this to 15 minutes" | the time candidate (15 against 5 + 5) | coherence (code) |
| 9 | 1KC | "break this into 3 questions per page" | `changed` for sentence 5 and answer 6, rows matched across tables; `duplicated` for the heading | scope |
| 10 | 1KC | same turn | `unreported` (only if the account check is built) | account |
| 11 | 1KC | "Add space between the definitions..." | a move with `from`; no flag | negative |
| 12 | 1KC | "number 2 in task 2 add choices..." | `stale` for the instructions and "Answers will vary" | coherence |
| 13 | 1KC | "This is actually class P7B" | `contradicts`: the header says Primary 7 | coherence |
| 14 | new | "Add an extension activity for more advanced learners" | inserts only; no flag | negative |
| 15 | 3PD | a copy asked for while suggestions wait | no copy; the reply asks for the choice; `copies` empty | copy choice |
| 16 | 3PD | the same, after **Use all and leave** | a copy with the suggested text, source still waiting, no `built_on_suggestion` flag | copy choice |

Cases 2, 8, 11 and 15 call no judge: they test code. Evals run through `chat.runTurn`, so once the
checks are wired in every eval run pays for a judge call too. Prompts and tools change, so
`pnpm eval` is run and compared with the baseline.

## Tests

| Test | Where | Asserts |
| --- | --- | --- |
| Effect | `pnpm check` (shared) | each effect kind; a reworded copy is `changed`, not `removed`; a moved definition with `from` is `moved`; formatting only is `formatting`; rows matched across split tables; a teacher's split during the turn is not the turn's; earlier turns' suggestions not counted |
| Lineage | `pnpm check` (shared) | `copy_of` copies in order with `derived_from`, as suggestions; the three copy choices build what the table says; `copy_of` outside the working view dropped |
| Neighbours, candidates | `pnpm check` (shared) | the four relations and three candidates on the three worksheets |
| Turn checks | `pnpm check` (server) | no judge on formatting-only turns; fallback on timeout; skip near the function limit; cap of three and `others`; the three switch values, each with the toggle on and off; off gives no callout and no `turn_effect` but still logs; flags written outside the commit transaction |
| Rules | `pnpm check` (server) | a copy choice comes only from the chat body; every action is a teacher command through `blocks/service.ts`; no `origin` in a flag |
| Export | `pnpm check` (server) | file list unchanged; turns carry `spyglass`; judge calls carry `purpose` |
| Core flow | `pnpm e2e` (mock) | the Spyglass toggle under the chat box, kept after a reload; with it off, no callout; the callout under the reply; Restore, Undo, Dismiss; the copy choice card and its three buttons; all after a reload |
| Live | `pnpm eval` | the cases above |

## Order of work

Each step is its own commits, each passing `pnpm check`.

1. Lineage: `copy_of`, `from`, the copy choice (tool result, card, `copy_choice`, chat body), and
   `describe-edits` for copies. The session fixtures. Tests.
2. The turn's effect, with its tests.
3. The offline runner over the bundles so far: the effect and repair signals side by side, before
   anything is shown.
4. The judge model experiment; then the scope check with the chosen model, `removed` and `changed`
   first; the callout; the Spyglass toggle under the chat box; the config switch.
5. Neighbours, candidates and the coherence check.
6. The copy diff experiment and the account check experiment, which can run alongside step 5.
7. `turn_effect` to the editing model (`shown_and_model`), with `pnpm eval` against the baseline.

Before each check goes live, run it offline and read its misses and its unrepaired flags. After,
measure how often teachers use each action, and keep the cap of three under review.

## Costs

Estimates from session 1KC (13 turns, 23 model calls), to be replaced by the offline runner's
numbers.

| Cost | Added | Notes |
| --- | --- | --- |
| Tokens | one judge call per turn with a content change: about 1,500 to 3,000 in, at most 300 out | about 5 of 1KC's 13 turns qualify: roughly 11% more input, on a smaller model. Paid whether the teacher has Spyglass on or off. `turn_effect` adds a little to each `edit_document` result under `shown_and_model` |
| Time | up to 8 s after the reply | the teacher reads the reply meanwhile; the chat box is free at `result` |
| Processing, memory | pure functions over a few dozen blocks; a second copy of the chat's docs during the checks | milliseconds; tens of kilobytes |
| Storage | flags on the turn and one event, about 1 to 2 KB per judged turn | about 8 KB for 1KC |
| Judge experiment | at most 30 calls per model screened (10 turns, 3 runs), then 70 more for the model that passes | three models at most |

## What changed from the first draft, and why

| First draft | This plan | Why |
| --- | --- | --- |
| Every block's `derived_from` is null; a migration if needed | already set by Duplicate, Enter and the list split; no migration; lineage followed only through the turn's blocks | the code |
| `copy_of` copies live blocks; "built on a suggestion" is a `copy_of` of a suggestion | the teacher chooses what a copy of a doc with waiting suggestions is built from; typed-out suggestions are caught by text | a live-only copy can never carry a suggestion; 3PD's came from typing it out (Sam, 11 Nov) |
| `from` handled in `blocks/service.ts` | in `operations.ts`, `apply.ts`, `validate.ts`; the service only for Restore | model operations never pass a service command |
| A 60 s function limit; the ceiling in `limits.ts` | 300 s (`vercel.json`); the judge's own timeout in `turn-checks.ts` | `limits.ts` counts messages |
| Judge prompt in the config | a constant recorded in `config_versions`, `purpose: "judge"` | the summary call's pattern |
| Code-only findings stand alone without the judge | candidates only | copies differ on purpose here; repeated headers suit page layouts |
| Always on | a toggle under the chat box, on by default; off hides it, but it still runs and is recorded | teachers sometimes do not want it; the research needs every turn (Sam, 11 Nov) |
| Called Key decisions | Spyglass | Sam, 11 Nov |
| Flags in the Accept all confirmation and export dialog | Accept all and Download mention open flags; Download asks which of three ways (Part 5) | Sam, 11 Nov (evening), replacing the morning's "not in this plan" |
| Every model the gateway can reach | Llama 3.3 70B, Mistral Small 4, GPT-6 Luna | Sam, 11 Nov; ELM has no small Qwen and its Qwen 3.5 is too slow (probed 11 Nov) |
| `off` and `shown` as study conditions, an open question | a config switch, no study design | Sam, 11 Nov |
| Account check built | an experiment first | the step cards already list every operation |
| Offline runner beside `analysis/` | in `packages/evals` | `analysis/` is independent Python |
| New events in `events.ts` | in `events/spyglass.ts` | `events.ts` is at the size limit |
| `spyglass` line before the stream ends | after `result`, the route waiting for it | the judge needs the committed turn; Vercel freezes after the response |

## Built so far (11 Nov 2026, steps 1 and 2)

Step 1 (lineage and the copy choice) and step 2 (the effect, not wired in) are built, on branch
`claude/loving-bell-6bbukq`. Details the plan left open, as built:

- **Names for copied blocks.** Ids are made at commit, so `copies` names each copied block
  `<temp_id>/<source block id>`. Validation accepts these names in `replace`, `delete`, `move`,
  an insert's `after` and `from`. Named by source id, so typing during the turn does not shift them.
- **What a copy is made of** is read before the turn's operations: a copy never carries the
  turn's own suggestions on the source. Its style is set at once; under Use all and leave a waiting
  suggested style is taken too. A waiting style does not count as a waiting suggestion.
- **The card.** A turn records `copy_requests` (doc and how many suggestions wait) on its
  `chat_turns` row and result; the card shows under the latest reply only, until answered.
  A copied list item rewritten as several items becomes several blocks in the copy.
  A copy that waits is dropped with a new reason, `needs_copy_choice`.
- **The effect** (`shared/src/turn-effect.ts`): both views show a waiting replacement's text and
  earlier turns' suggested blocks, so those are not counted; a change held back by `takeTurnIn`
  still counts. `removed` is judged per copy as well as in place (a block left out of a copy is
  removed from it, though the source still has it). A block split into several with nothing lost is
  only `moved`, and moves alone call no judge. An empty block added or taken out (a page break, space for an answer) is `formatting`. Normalising also drops inline
  formatting tags and the `<!-- header: ... -->` line.

Not done: the session fixtures. The three bundles are in `data/Telemetry/` (P01-KC, P02-SH,
P03-PD; not committed). `pnpm eval` for the copy cases ran on 11 Nov (`packages/evals/evals/copies.eval.ts`):
all pass.

## Built so far (11 Nov 2026, late): step 4 without the experiment's result

Branch `claude/blissful-volta-ldipyo`. The judge experiment (`pnpm judge-models`) is built but not
yet run: it needs ELM and costs money. So the judge's model is a config value, not a choice.

**Since (11 Nov, night):** the experiment has run against ELM (`docs/eval-log.md`). The judge
can label a flag `added`; Luna judges Luna's turns and Sol every other (`spyglass.judge_models`,
`judge_model`); Mistral and Qwen left the picker. Why: `docs/model-decisions.md`.

- **Config** `spyglass`: `mode` (`off`, `shown`, `shown_and_model`; default the last),
  `judge_model` (unset: the provider's default model, until the experiment picks one) and
  `judge_timeout_ms` (8000). `turn_effect` to the model (`shown_and_model`) is step 7, not built.
- **After the commit** (`gateway/turn-checks.ts`): the effect, from the docs as the commit found
  them, replayed with the ids the commit made (`applyTurn` returns `new_ids`), so flags name real
  blocks. No judge when nothing but formatting or moves changed. The judge gets low effort on a
  reasoning model; its calls are `purpose: "judge"` under `JUDGE_PROMPT_HASH`, whose text is in
  `config_versions`. A timeout, an error or a second bad answer gives the fallback flags; so does
  having less than the judge's limit plus 5 s left of the 300 s function. A failed check logs an
  `error` event; the turn stands.
- **Shown where nothing else shows it:** in Suggesting mode a block deleted in place is not
  flagged (it has its own card). The other rows of Part 5's mode table need the coherence check.
- **Stored and logged:** the flags on the `chat_turns` row (`spyglass`, with `hidden` and the
  judge's call id), `spyglass_shown` for every judged turn, `chat_prompt.spyglass`,
  `spyglass_toggle` and `spyglass_action`. A "[Spyglass: ...]" line is added to the content later
  turns replay only when the teacher saw the flags (my choice: it mirrors the screen).
- **Stream:** a `spyglass` line after `result`; the client ends the turn at `result` and reads on.
  The plain route gives no flags; the turns list has them.
- **Client** (reworked after Sam's look, 11 Nov): under the chat box, on the right after the
  model picker, two icons named on hover: Suggesting or Editing, and the Spyglass toggle
  (remembered as `edw.spyglass`, not shown when the deployment is `off`). The callout under the
  reply (`Spyglass.tsx`, `useSpyglass.ts`) is the telescope, then per flag a heading and a reason
  and **Show**: no Spyglass label, no Dismiss, no quote of the earlier text. The judge is asked
  for a title of 2 to 5 words and a reason of at most 12 (cut past 8 and 20). Not yet: Restore,
  Undo, Keep, Remove one, Apply to the other copies; Show for a block in another doc (it does
  nothing visible).
- **Evals:** the harness leaves judge calls out of a turn's steps, so budgets are unchanged; their
  tokens are not in the eval report yet.
- **Mock:** the judge flags removals and changes, so the callout can be tried offline.
- **Tested:** unit and server tests, and `e2e/spyglass.spec.ts` (callout, Show, toggle across
  reloads, a hidden turn still logged), 20 of 20 repeated; all 21 e2e tests pass, and "ask,
  accept" 20 of 20. Not tried against ELM, so the real judge's wording is unseen.

## Open, for Sam

1. The bar for building the account check.
2. What **Download with changes** puts in the file: the suggestions as tracked changes in Word, or
   something else.

Separately, not part of this plan: in 1KC two model edits were logged in `text_events` with
`cause: keystroke_batch` (events 51 and 61). Counting model edits by `cause` miscounts them. Not yet
reproduced; fix with a failing test first.
