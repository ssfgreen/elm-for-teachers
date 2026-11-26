# Model decisions

Which models the editor offers and uses, and why: one entry per decision, with the evidence and
what would make us look again. The runs behind each are in `docs/eval-log.md`, their files in
`docs/eval-results/`. A one-line row for each is in `docs/PLAN.md` section 1.

---

## Mistral Small 4 is not offered (11 Nov 2026, Sam)

**Decision.** Removed from the model picker (`config/app.config.json`, `provider.models`).

**Why.** It breaks the core of the editor, and in ways a teacher would not notice:

- It says it has edited when it has not: asked to draft a worksheet, "I've created a short
  worksheet on metaphors for P6", with no edit made (2 of 2 runs).
- It edits the wrong thing and says it edited the right one: asked to remove the moon question,
  it deleted another and replied "I've removed the sentence starter about the moon" (1 of 2).
- It cannot do common jobs: no table from a list (0 of 2), no `copy_of` copy (0 of 2), five
  operations for a one-fix request.
- 17 of 26 core runs passed, against Sol's 26 of 26.
- As the Spyglass judge, it flagged something on 90% of turns, usually the change the teacher
  asked for, and agreed with Sol 0.18. Teachers would learn to ignore Spyglass.

It is fast (3.3 s median turn), but speed does not make up for false claims about the document.

**Evidence.** Eval log, 11 Nov: "the open models on the core of the editor" and "the Spyglass
judge with Sol, Luna and Mistral".

**Look again if** ELM serves a newer Mistral, or a larger one. Rerun the core command in the
eval log with `EVAL_MODEL` set to it; it should pass about as often as Sol and make no false
claims (read the replies of the failed runs, not just the pass rate).

---

## Qwen 3.5 is not offered (11 Nov 2026, Sam)

**Decision.** Removed from the model picker.

**Why.** As ELM serves it, Qwen thinks on every call, hidden, although ELM refuses it a reasoning
effort and the app sends none. That makes it too slow: a 10.7 s median turn and up to 40 s for a
short worksheet, against Sol's 6 s and 10 s. Turning the thinking off
(`chat_template_kwargs: {enable_thinking: false}`) makes it faster (5.2 s median, though one turn
still took 33 s) but worse: 21 of 26, and asked in a comment to change a sentence, it added one
after it instead (2 of 2). It is not dangerous as Mistral is, but in neither form does it earn a
place in the study.

**Evidence.** Eval log, 11 Nov: "the open models on the core of the editor" and "Qwen's hidden
thinking".

**Look again if** ELM serves a smaller or faster Qwen, or one that keeps its quality with
thinking off. The thinking switch would need a small change in `gateway/elm.ts` (the probe in
the eval log shows the field).

---

## Luna stays (11 Nov 2026, Sam)

**Decision.** Luna stays in the picker.

**Why.** 23 of 26 core runs, at 7.2 s median, and its failures were mild: a copy written out by
hand rather than with `copy_of` (right for the teacher, but Spyglass cannot see it as a copy), a
suggestion left waiting, an edit refused and then corrected. It is about a twentieth of Sol's
price.

**Evidence.** Eval log, 11 Nov: "the open models on the core of the editor".

---

## Who judges a turn for Spyglass (11 Nov 2026, Sam)

**Decision.** A turn on Luna is judged by Luna; every other turn, Astra included, by Sol.
Config: `spyglass.judge_model: "gpt-6-sol"`, `spyglass.judge_models: ["gpt-6-sol", "gpt-6-luna"]`
(a model in `judge_models` judges its own turns). Code: `judgeModelFor` in `gateway/judge.ts`.

**Why.** Sol judged best: 100% usable answers, the most consistent with itself (0.83), quiet when
the turn did only what was asked (flags on 40% of turns), 1.3 s median, about 0.3p a turn. Luna
was close to Sol (0.53) and is a twentieth of the price, so a teacher who picks the cheaper model
gets the cheaper check. Astra is not a judge: it costs about five times Sol for no measured gain.
Mistral and Qwen are not offered.

**Trade-off, for the analysis.** Because the judge follows the picker for Luna, flags on Luna
turns come from a different judge. Each judge call records its model in `gateway_calls`, so
analysis can separate them.

**Evidence.** Eval log, 11 Nov: "the Spyglass judge with Sol, Luna and Mistral".

**Look again if** Astra is measured as a judge, or the prompt changes: rerun `pnpm judge-models`
with `JUDGE_MODELS` and compare.

---

## The judge can label a flag `added` (11 Nov 2026)

**Decision.** `added` joins the judge's labels (`removed`, `changed`, `duplicated`,
`built_on_suggestion`).

**Why.** The findings list additions and the prompt asks for unrequested content to be flagged,
but the tool offered no label for it. On the first run against ELM, six answers were refused
for using `added` and three turns fell back to the code's flags; others filed additions under
the wrong label. With it, usable answers rose from 95% to 98 to 100%.

**Evidence.** Eval log, 11 Nov: "the judge's first run on ELM".
