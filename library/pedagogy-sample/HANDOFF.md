# Handoff: Scottish Pedagogy Library (sample v0.1)

This document travels with `pedagogy_library_sample.zip`. The zip holds the data, schema and scripts. This file holds the purpose, design decisions, rules and open questions that are not in the data itself.

Status: **draft sample**. Nothing in the library has been reviewed by an educator yet.

---

## 1. Purpose

Scottish teachers use a language model to create or adapt classroom artefacts:

- slide decks
- worksheets
- forms (quizzes, exit tickets, surveys)
- lesson plans
- in-class interactions (talk routines, questioning, group structures)

Every pedagogical choice the model makes must be grounded in, and cite, a curated library of verified sources. Citations appear in the interface as an "i" marker the teacher can hover over or tap (similar to NotebookLM). The hover shows the claim, the supporting passage, the source and its verification status.

**Example request the system must handle:** "Differentiate this P5 history worksheet for a pupil with dyslexia." The system should identify the stage and subject, load that pupil's profile, retrieve the relevant library entries, produce the adapted worksheet and cite why each change was made.

**Scope:** Scotland (Curriculum for Excellence) first. England, Wales, Northern Ireland and the US come later as a translation layer, not a rebuild.

---

## 2. What is in the zip

| Path | What it is |
|---|---|
| `library/pedagogy_library_sample.yaml` | Merged library: 115 sources, 377 passages, 116 entries, 437 claims |
| `library/parts/*.yaml` | The five research agents' outputs (CUR, EVD, LIT, HIS, ACC) |
| `library/pedagogy_library_schema.yaml` | Schema with example records and the retrieval flow |
| `library/BRIEF.md` | The research brief given to agents; reuse it as the template for new curriculum cells |
| `library/validate.py` | Merges parts and checks integrity (ids, references, quote limits) |
| `library/build_page.py` | Builds a self-contained HTML browser of the library with "i" citations |
| `library/HANDOFF.md` | This file |

Run:

```
python3 validate.py parts pedagogy_library_sample.yaml
python3 build_page.py pedagogy_library_sample.yaml library.html
```

### Sample coverage

- **P7 Literacy and English** (CfE Second Level)
- **S1 history** (Social Studies, People, past events and societies, CfE Third Level)
- Cross-cutting principles, adaptations and format rules that apply to both

| Entry type | Count |
|---|---|
| curriculum_ref | 30 |
| adaptation | 23 |
| principle | 15 |
| activity_type | 13 |
| caution | 12 |
| format_rule | 10 |
| signature_pedagogy | 10 |
| exemplar | 3 |

---

## 3. The conceptual framework

The library implements five layers. Keep them separate in the data model and in the generation pipeline.

### Layer 1: The pedagogy matrix

Three core axes, plus filters and a jurisdiction lens.

- **Axis A, learner stage:** early years; lower primary; upper primary; transition (P7 to S1); lower secondary; exam years; post-16. Each band is tagged with local year names (for Scotland: P1 to P7, S1 to S6, and CfE levels Early, First, Second, Third, Fourth, Senior Phase).
- **Axis B, subject:** each subject has its own pedagogical content knowledge.
- **Axis C, lesson purpose:** introduce; guided practice; independent and spaced practice; apply and transfer; assess and feedback.
- **Filters:** knowledge type (declarative, procedural, conceptual, disciplinary, metacognitive); expertise in this topic (novice to expert); learner needs; context (class size, composite classes, devices).
- **Jurisdiction lens:** swaps vocabulary, curriculum codes, assessment endpoints and inspection language. It is a translation layer, not a main axis, because the best-evidenced learning mechanisms apply across systems.

**The most important single variable is prior knowledge (novice to expert) in the topic.** It decides whether explicit instruction and worked examples come first, or whether more open inquiry is appropriate (expertise reversal effect).

### Layer 2: Activity library

Reusable "moves" teachers make, for example object exploration, a letter to a historical figure, a card sort or a mystery task. Each activity is tagged with the **underlying principle** it relies on. That tag tells the system when the activity works. The test for any activity is: what will pupils have to think hard about?

### Layer 3: Signature pedagogies

Subject-specific mechanisms, for example:

- PRIMM (Predict, Run, Investigate, Modify, Make) and Parsons problems in computing
- source analysis and enquiry questions in history
- reciprocal reading in English

### Layer 4: Student needs profile

- Describe needs as **barriers** (decoding, working memory, processing speed, figurative language, sensory load, anxiety, predictability and so on), not as diagnoses.
- Diagnostic labels (dyslexia, autism, ADHD, EAL) are **hints** for where to look, never filters. Two pupils with the same diagnosis can need different adaptations.
- Each pupil's profile is a short list of adaptations chosen from the library, ideally with the pupil and family, plus individual overrides (for example "cream background, 14pt").
- Each selected adaptation has a status: confirmed, trialling or stopped. An adaptation stays only while there is evidence it helps that pupil.
- An adaptation with weak general evidence (for example coloured overlays) may still be recorded if it demonstrably helps an individual. Flag it as individual.

### Layer 5: Format and access profile

How the artefact looks and is accessed, separate from what pupils do. Two levels:

1. **Baseline format rules** for every artefact (bold not italics, left aligned, readable sans serif font, white space, one task per block, plain language).
2. **Individual overrides** from the pupil profile.

Access dimensions: representation, language, layout, structure, instructions, response mode, interaction, sensory, time.

Every adaptation is tagged:

- **`changes_goal: false`**: removes a barrier while keeping the learning goal (access).
- **`changes_goal: true`**: changes the learning goal (modification). **Only a teacher may choose a modification.** The system must never apply one silently.

---

## 4. Non-negotiable rules

### Citations

- The model cites **claim IDs**, never whole documents, e.g. `[[clm-ACC-...]]`.
- After generation, **reject any output that cites an ID not in the retrieved set.** This is the main defence against invented citations.
- Distinguish `support_type: inference_by_curator` from sourced claims in the interface.
- Show verification status in the hover: fetched and located; fetched, locator to confirm; not fetched.

### Copyright and licensing

- Verbatim quotes in passages: **15 words or fewer, and at most one per source.** Everything else is paraphrase with a precise locator.
- Respect each source's `reuse_rule` (`full_text_ok`, `short_quote_only`, `locator_only`).
- Do not ingest full copyrighted texts into the shipped library. Link to them.
- Education Scotland and Scottish Government material is generally under the Open Government Licence v3. Confirm per document. Most other licences are unconfirmed.

### Privacy and data protection

- Student profiles are personal data, often **special category (health) data under UK GDPR**.
- Store profiles under the school's or local authority's control, pseudonymised, **separately from the library**.
- Profiles reference library entry IDs only. **Profile data must never be written back into the library** or used to train or tune shared components.
- Schools will need a data protection impact assessment (DPIA). The choice of model provider and data residency matters.
- Never put pupil identifiers in prompts beyond what the task needs.

### Content cautions

- Caution entries must be retrieved and applied at generation time. Example: `cau-HIS-holocaust-no-simulation` (no simulations or role play identifying with victims or perpetrators, from IHRA and USHMM guidance).
- Not-recommended entries (learning styles, specialist dyslexia fonts as a general fix) should be used to steer away from those practices.

### House style

- British English.
- CfE terminology (levels, Experiences and Outcomes, Benchmarks, BGE, Senior Phase, ASN, GIRFEC).

---

## 5. Architecture decisions already made

- **Curation:** YAML files in git. Changes arrive as pull requests. `validate.py` runs as a CI check.
- **Build:** a build step loads Postgres with pgvector (one database for facet filtering, full-text search and vectors). Embeddings are computed at build time on claims and passages.
- **Retrieval flow:**
  1. Parse the request: stage, subject, artefact type, purpose.
  2. Load the pupil profile (adaptation IDs and overrides).
  3. Filter by facets (jurisdiction, CfE level, curriculum area, artefact type, status = published).
  4. Hybrid search (BM25 plus vectors) over claims and passages within the filtered set.
  5. Expand along relations (`uses_principle`, `caution_from`, `demonstrated_by`, `aligns_to`).
  6. Generate with inline claim citations.
  7. Render "i" hovers: claim, then passage, then source link.
  8. Validate citations against the retrieved set.
- **Rendering order:** apply baseline format rules by default, then the pupil's adaptations and overrides.
- **Chunking:** one claim is one retrievable and citable unit.

---

## 6. Current status and known gaps

- All entries are `status: draft`.
- **26 passage locators are unconfirmed**, mostly EEF Toolkit pages that would not fetch directly.
- **S1 social studies benchmark mapping is inferred.** The Third Level benchmark bullets are not labelled with codes; the agent matched them to SOC 3-01a to 3-06a by order and content. A specialist must check.
- Some literacy benchmark bullets are shared across codes (LIT 2-01a, 2-10a, 2-11a, 2-13a).
- **Most licences are unconfirmed.**
- **ASL Code of Practice:** cited from the 2017 third edition. A 2026 edition is listed by the Scottish Government but could not be read. Check before publishing.
- Several sources were fetched from copies hosted on other sites (recorded in `fetched_url` and `version`). Prefer the canonical URL when confirmed.
- Some areas rest on weaker evidence (mystery tasks not included; "because, but, so" rests on one Research School post; developmental language disorder and EAL entries rest on practitioner sources). These are graded as such.
- **Schema drift to reconcile:** agents added a `notes` field on sources and extra barrier values (`vocabulary`, `written_expression`, `visual_access`, `visual_tracking`, `visual_crowding`, `social_interaction`, `organisation`, `expressive_language`). Move barriers and other enums into a controlled vocabulary file.
- `curated_by`, `reviewed_by` and `last_reviewed` are placeholders.
- **Curriculum is in flux.** The Curriculum Improvement Cycle is reviewing the frameworks, and the current technical framework is due to be phased out from August 2028. Curriculum entries must be versioned and re-checked each term.

---

## 7. Governance

- Workflow: `draft` → `reviewed` → `published` → `retired`.
- Each entry needs sign-off from a **practising teacher** and a **subject or inclusion specialist**. Record names and dates in `reviewed_by` and `last_reviewed`.
- Every claim must have at least one passage; every passage must have a fetched source.
- Use `superseded_by` on sources when a new edition appears, and re-validate dependent claims.
- Suggested next step: a review spreadsheet listing every claim with its source, locator and a "verified" column, for a small group of Scottish teachers.

---

## 8. Evaluation

Build a test set of realistic teacher requests before scaling. Examples:

- "Differentiate this P5 history worksheet for a dyslexic pupil."
- "Make a P7 reciprocal reading lesson plan for a group including an autistic pupil who finds figurative language hard."
- "Create S1 slides introducing the Declaration of Arbroath for novices."
- "Write an S1 activity on the Holocaust." (must retrieve and apply the caution)

Measure:

- **Retrieval:** were the expected entries retrieved?
- **Citation precision:** does each cited claim actually support the change made?
- **Faithfulness:** no claims beyond the sources.
- **Goal integrity:** no silent modifications.
- **Teacher usefulness:** rated by practising teachers.

---

## 9. Expansion plan

- Use `BRIEF.md` as the template. One research agent per area (curriculum, evidence, subject pedagogy per subject, access) per new cell.
- Suggested next cells: P5 to P7 history and maths; S1 to S2 maths and science; computing (PRIMM, Parsons problems, unplugged).
- Each new batch goes through `validate.py`, then human review, before publishing.

---

## 10. Decisions still open (for the project owner)

- Model provider and data residency.
- Hosting and authentication. Glow (Scotland's national schools platform) is a natural fit.
- Who the reviewers are and how they are recognised.
- Whether to seek reuse permission from the EEF, BDA and others for longer excerpts.
- How teachers rate generated lessons, and how ratings feed back into the library.

---

## Appendix A: Evidence summary for core models (design rationale)

Condensed from the research report produced in the planning conversation. Use as orientation; the library's own claims are the citable source.

| Model | Evidence | Best suited | Caution |
|---|---|---|---|
| Explicit instruction (Rosenshine) | Strong | Novices, introducing new material | Experts (expertise reversal) |
| Retrieval practice | Strong (Adesope et al. 2017) | All subjects from about age 7 | Keep low stakes |
| Spaced practice | Strong (Latimier et al. 2021); WWC moderate | Curriculum design, exam years, languages | Needs planning at unit level |
| Interleaving | Moderate, material-dependent | Maths problem types, visual categories | First teaching; vocabulary lists |
| Worked examples and fading | Strong for novices | Maths, science, computing, writing structure | Experts |
| Dual coding | Moderate (WWC) | Timelines, diagrams | Decorative images |
| Metacognition | EEF +8 months, high security | Upper primary onwards | Generic "learning to learn" |
| Feedback | EEF +6 months | All phases | Praise or grades alone |
| Reading comprehension strategies | EEF +7 months | Upper primary, lower secondary | Strategy drills without rich texts |
| Oral language, dialogic teaching | EEF +6 months | All phases | Talk without curricular purpose |
| Collaborative learning | EEF +5 months, limited evidence | Structured tasks with interdependence | Unstructured group work |
| Guided inquiry | Contested; positive when scaffolded | After a knowledge base exists | Minimal guidance with novices |
| Project-based learning | Weak in UK trials (EEF REAL Projects) | Enrichment, older pupils | Replacing taught time |
| Universal Design for Learning | Moderate but thin | Inclusive planning | Label without practices |
| Learning styles | Not recommended | None | Avoid |

## Appendix B: Year equivalence

| Age at start of year | Scotland | England | US |
|---|---|---|---|
| 9 to 10 | P6 (Second Level) | Year 5 | Grade 4 |
| 10 to 11 | P7 (Second Level) | Year 6 | Grade 5 |
| 11 to 12 | S1 (Third Level) | Year 7 | Grade 6 |
| 12 to 13 | S2 (Third/Fourth Level) | Year 8 | Grade 7 |

Scottish pupils are on average about half a year older than pupils in the same-numbered English year. Compare by age and prior knowledge, not year number.
