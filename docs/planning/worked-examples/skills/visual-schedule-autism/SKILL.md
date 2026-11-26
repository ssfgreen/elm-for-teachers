---
name: visual-schedule-autism
description: Produce a visual schedule, now/next board or task checklist for a lesson or day, for autistic pupils and others who benefit from predictability (ADHD, learning difficulties, anxiety). Use when a teacher asks for a visual timetable, visual schedule, now and next board, first/then board, task strip or step-by-step checklist. The pupil's symbol set comes from the school; this skill never invents one.
version: 0.1
jurisdictions: England, Scotland, Wales, Northern Ireland
phase: primary, secondary
evidence_strength: visual supports and task analysis are evidence-based practices for autism (NCAEP 2020, visual supports backed by 65 studies, mainly single-case design); transfer to other groups is professional consensus
data_context: context/summaries/need_group_profile_autism.md, context/summaries/negative_evidence_register.md
---

# Visual schedule (autism and predictability needs)

## What this skill does

Converts a lesson sequence or day plan into a visual schedule using the school's symbol set, with transitions, change warnings and a "finished" mechanism. Produces a printable and a digital version.

## Invariants

1. Symbol set is a parameter supplied by the teacher (Widgit, PCS/Boardmaker, photos, school's own). If none is given, output text labels with symbol placeholders and ask.
2. The schedule reflects the real plan; do not invent activities.
3. No identifiable pupil data on the schedule beyond what the school normally prints (a first name is a school decision; default to none).
4. The schedule supports a trusted adult; it is not a replacement for one. Say so in the teacher note.
5. Do not frame the pupil's needs in deficit terms ("lacks flexibility"). Describe the support ("benefits from knowing what comes next").

## Inputs

- Lesson or day sequence with timings.
- Symbol set name or image files.
- Format: strip, grid, now/next, first/then.
- Level: single symbol per activity, or step-by-step within an activity (task analysis).
- Optional: known change points (assembly, cover teacher, trip).

## Steps

1. **Segment the plan** into activities. For a task checklist, break the activity into observable steps (task analysis): short verbs, one action per step, in the order a pupil would do them.
2. **Pair each step** with the symbol name from the chosen set and a short label (two or three words). Keep labels consistent with those the school already uses.
3. **Add transitions:** a transition symbol between activities; a "change" symbol at known change points with a one-line explanation.
4. **Add the finished mechanism:** tick box, flip card, or "finished" pocket, matching what the pupil already uses.
5. **Add a first/then or now/next view** for pupils who need a two-item horizon.
6. **Produce outputs:** printable (A4, landscape strip or portrait grid, high contrast, symbols at least 3 cm), and a digital version suitable for a tablet.
7. **Write the teacher note:** check symbol familiarity with the pupil; introduce the schedule before the first use; use it consistently; review with the pupil, not for the pupil.
8. **Run the checks.**

## Checks

- [ ] Every activity in the plan appears, in order, with timing where the plan has it.
- [ ] Symbol names come from the specified set; placeholders are clearly marked.
- [ ] Transition and change symbols present.
- [ ] Finished mechanism present.
- [ ] Deficit language absent.
- [ ] No pupil data beyond school default.

## Output

1. Visual schedule (print and digital).
2. First/then or now/next cards.
3. Optional task checklist with self-monitoring ticks.
4. Teacher note.
5. Change log and sources.

## When to refuse or redirect

- Request to build a behaviour-management or compliance plan around the schedule (reward and sanction systems): refer to the school's behaviour and SEND leads; note that some autistic advocates and clinicians dispute compliance-focused approaches; the schedule itself is a predictability support.
- Request to write a profile of the pupil: decline; offer the barrier-led need-group profile instead.

## Sources

- Steinbrenner et al. (2020), National Clearinghouse on Autism Evidence and Practice: evidence-based practices for autistic children and young people, including visual supports and task analysis.
- EEF, Special Educational Needs in Mainstream Schools: positive and predictable environment; explicit routines.
- Leaf et al. (2021) and neurodiversity-affirming critiques: contested ground on compliance-oriented goals; cited so the agent presents choices rather than prescriptions.
