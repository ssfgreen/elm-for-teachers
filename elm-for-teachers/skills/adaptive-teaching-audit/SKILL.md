---
name: adaptive-teaching-audit
description: Review a lesson plan or sequence against the evidence on adaptive teaching and report findings without rewriting the plan. Use when a teacher asks to "check", "audit", "review" or "sanity check" a plan for SEND, ASN, ALN, inclusion, differentiation or adaptive teaching, or asks "is this ok for my class". This is report-only. It is the highest professional-development skill in the set because it teaches the teacher the framework.
version: 0.1
jurisdictions: England, Scotland, Wales, Northern Ireland (terminology adapts; see jurisdiction_terminology.md)
phase: primary, secondary
evidence_strength: audit criteria drawn from EEF SEND guidance (five recommendations and the "5-a-day"), the ITT Core Content Framework, and the negative evidence register
data_context: context/summaries/differentiation_evidence_summary.md, context/summaries/negative_evidence_register.md, context/summaries/jurisdiction_terminology.md
---

# Adaptive teaching audit

## What this skill does

Reads a plan and reports, section by section, where it already uses high-quality adaptive teaching, where it could, and where it contains practices with weak or negative evidence. It suggests; it does not rewrite. The teacher decides.

## Invariants

1. Report only. Never return an edited plan unless the teacher asks afterwards.
2. Every flag carries a source.
3. Review is barrier-led: the audit never asks for diagnoses or pupil names, and never profiles pupils.
4. Tone: collegial. Lead with what is working.
5. Jurisdiction-aware vocabulary: SEN/SEND (England), ASN/ASL (Scotland), ALN (Wales), SEN (Northern Ireland).

## Inputs

- The lesson plan or sequence.
- Phase, subject, jurisdiction.
- Optional: the barriers present in the class, described without identifying pupils ("several pupils find multi-step instructions hard to retain").

## Steps

1. **Summarise the plan in three lines** so the teacher can see the agent understood it.
2. **Check against the EEF "5-a-day"** (the five components of high-quality teaching for pupils with SEND). For each, report Present / Partly / Absent with one line of evidence from the plan:
   - Explicit instruction (modelling, worked examples, guided then independent practice).
   - Cognitive and metacognitive strategies (planning, monitoring, evaluating made explicit).
   - Scaffolding (planned, with a route to removal).
   - Flexible grouping (temporary, mastery-based, if any grouping is used).
   - Technology (used to model, practise or give access, if relevant).
3. **Check the environment and assessment** items from the EEF SEND recommendations: predictable routines; checks for understanding; vocabulary made explicit.
4. **Run the negative-evidence flags.** Report any instance of:
   - Distinct easier tasks for named groups with no fading plan ("differentiating down").
   - Learning-styles language (visual learners, auditory learners, VAK).
   - Permanent or ability-labelled groups.
   - Teaching assistant deployed as the default teacher of the lowest-attaining pupils (the "separation" effect).
   - Lowered expectations in the objective for some pupils.
   For each, cite the source and offer one alternative.
5. **Check access**, not content: can every pupil reach the same objective by some route in this plan? If not, say where the route is missing.
6. **Write the report** in the output format below. Keep it under one page.

## Checks

- [ ] No rewritten plan in the output.
- [ ] Every flag has a source.
- [ ] No request for pupil names or diagnoses.
- [ ] Strengths listed before suggestions.
- [ ] Correct jurisdiction terminology.

## Output

```
ADAPTIVE TEACHING AUDIT
Plan: [title]   Phase/subject: [..]   Jurisdiction: [..]
Summary: [three lines]

Strengths
- ...

5-a-day
| Component | Status | Evidence in plan | Suggestion (optional) |

Flags (evidence-based concerns)
| Practice in plan | Concern | Source | Alternative |

Access check
[Can every pupil reach the objective? Where is a route missing?]

Suggested next step
[One sentence. e.g. "Would you like scaffolded versions of task 3 with a fading plan?"]
```

## When to refuse or redirect

- "Rewrite it for me": offer to, but only after the report, so the teacher sees the reasoning.
- "Which pupils are the problem?": decline; the audit is about the plan.

## Sources

- EEF, Special Educational Needs in Mainstream Schools (2020, updated 2025): five recommendations; "5-a-day".
- DfE, Teachers' Standards (Standard 5) and ITT Core Content Framework / Early Career Framework on adaptive teaching.
- DfE, SEND Code of Practice 0 to 25 (2015), paras 6.36 to 6.37: class teacher responsibility; high-quality teaching as the first response.
- Scottish Government, Supporting Children's Learning: ASL Code of Practice (fourth edition, 2026); GIRFEC.
- Welsh Government, ALN Code (2021): differentiated teaching is routine, not additional learning provision.
- EEF Toolkit: setting and streaming; teaching assistants. Blatchford et al. (DISS project).
- Pashler et al. (2008) on learning styles.
