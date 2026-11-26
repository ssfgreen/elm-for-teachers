# Shared brief for all research agents

Goal: populate a sample of a citable pedagogy library for Scottish teachers, focused on two cells:
- P7 Scotland, Literacy and English (CfE Second Level), age ~11
- S1 Scotland, Social Studies: history ("People, past events and societies"), CfE Third Level, age ~12
Include generic entries (principles, adaptations) that apply to both.

Schema: read /home/claude/pedagogy_library_schema.yaml first and follow it. Record types: sources, passages, entries, claims.

## Hard rules
1. Only use sources you have actually opened with WebFetch (or a fetched PDF). Prefer authoritative sources an educator, policymaker or academic would accept: Education Scotland, Scottish Government, SQA/Qualifications Scotland, GTCS, EEF, What Works Clearinghouse, peer-reviewed papers, national subject associations (Historical Association, UKLA, NATE), BDA, Dyslexia Scotland, Scottish Autism, National Autistic Society, Autism Toolbox Scotland, CALL Scotland, IHRA/USHMM, etc. Avoid blogs and commercial sites unless nothing better exists, and mark them evidence_weight: low.
2. COPYRIGHT: passage.text may contain a verbatim quote of AT MOST 15 words, and AT MOST ONE verbatim quote per source. Every other passage must be a short paraphrase in your own words (excerpt_type: paraphrase) with a precise locator (page number, section heading, or paragraph). Never copy longer text.
3. Never invent page numbers, quotes, codes or statistics. If you could not confirm a locator, write locator: "UNCONFIRMED: <what you know>". Add to each passage: excerpt_type (quote|paraphrase), fetched_url, verified_by_fetch (true/false).
4. Every claim must have supported_by passages. Claims are written in the curator's own words, one statement each.
5. Use British English. No em dashes or en dashes anywhere; use commas, colons or parentheses.
6. IDs: use your assigned prefix tag in every id, e.g. src-<TAG>-..., psg-<TAG>-..., clm-<TAG>-..., and entries <type-prefix>-<TAG>-... (prn principle, act activity_type, sig signature_pedagogy, adp adaptation, fmt format_rule, exm exemplar, cur curriculum_ref, cau caution). You may reference ids from other agents only if listed in "Known shared ids" below.
7. Fill facets carefully (jurisdiction: [scotland]; cfe_level second for P7, third for S1; stage p7 / s1; curriculum_area languages or social_studies). Fill artefact_recipes (slides, worksheet, form, lesson_plan, interaction) for principles, activities and signature pedagogies, written concretely for P7 English or S1 history. Set status: draft.
8. Output: write ONE valid YAML file to /home/claude/library/parts/<TAG>.yaml with top-level keys: sources, passages, entries, claims. Validate it parses with python3 -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" <file>.
9. Your final message: a short summary (counts, notable gaps, anything you could not verify). Do not paste the YAML.

## Known shared ids (may be referenced in relations)
- Principles (owned by tag EVD): prn-EVD-explicit-instruction, prn-EVD-retrieval-practice, prn-EVD-spaced-practice, prn-EVD-worked-examples, prn-EVD-metacognition, prn-EVD-feedback, prn-EVD-formative-assessment, prn-EVD-reading-comprehension-strategies, prn-EVD-oral-language-dialogic, prn-EVD-collaborative-learning, prn-EVD-dual-coding, prn-EVD-scaffolding, prn-EVD-guided-inquiry
- Curriculum (owned by tag CUR): cur-CUR-<code> where code is the official E&O code lower-cased with spaces/hyphens as hyphens, e.g. cur-CUR-lit-2-16a, cur-CUR-soc-3-01a
