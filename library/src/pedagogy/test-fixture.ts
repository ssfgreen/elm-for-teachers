/** A tiny pedagogy library for tests, in the shape of pedagogy.yaml. */
export const PEDAGOGY_YAML = `
sources:
- id: src-a
  title: Style guide
  publisher: A charity
  authors: [A charity]
  year: 2023
  url: https://example.org/a
  source_type: guidance
  jurisdiction: [international]
  evidence_weight: practitioner_wisdom
  licence: TODO_check
  reuse_rule: short_quote_only
  retrieved_at: 2026-11-12
- id: src-b
  title: A trial
  publisher: A journal
  authors: [Someone]
  year: 2012
  url: https://example.org/b
  source_type: trial
  jurisdiction: [international]
  evidence_weight: moderate
  licence: TODO_check
  reuse_rule: locator_only
  retrieved_at: 2026-11-12
passages:
- id: psg-a
  source_id: src-a
  locator: p.3
  text: Use bold for emphasis, never italics.
  excerpt_type: quote
  fetched_url: https://example.org/a
  verified_by_fetch: true
- id: psg-b
  source_id: src-b
  locator: 'UNCONFIRMED: abstract'
  text: Wider letter spacing helped children read faster.
  excerpt_type: paraphrase
  fetched_url: https://example.org/b
  verified_by_fetch: true
- id: psg-c
  source_id: src-b
  locator: section 2
  text: Teach history through testimony.
  excerpt_type: paraphrase
  fetched_url: null
  verified_by_fetch: false
entries:
- id: fmt-bold
  type: format_rule
  title: Bold, not italics
  summary: Baseline rule.
  body: Emphasise with bold.
  status: draft
  facets: {jurisdiction: [scotland], cfe_level: [second, third], curriculum_area: [all], artefact_type: [worksheet]}
  evidence: {rating: practitioner_wisdom, rationale: guide, citations: [{kind: practitioner_example, text: A P7 class read bold more easily.}]}
  claims: [clm-bold]
- id: adp-spacing
  type: adaptation
  title: Wider spacing
  summary: Widen letter spacing for a pupil.
  body: Trial it with the pupil.
  status: draft
  facets: {jurisdiction: [scotland], stage: [p7, s1], curriculum_area: [all], barrier: [decoding], changes_goal: false, often_relevant_to: [dyslexia]}
  evidence: {rating: moderate, rationale: trial, citations: [{kind: doi, doi: 10.1073/pnas.1205566109, citation: 'Zorzi et al. (2012), PNAS 109(28)'}]}
  claims: [clm-spacing]
- id: cur-his
  type: curriculum_ref
  title: 'SOC 3-01a: Evidence'
  summary: Third level history.
  body: Interpret evidence.
  status: draft
  facets: {jurisdiction: [scotland], stage: [s1], curriculum_area: [social_studies], subject: [history]}
  evidence: {rating: null, rationale: null}
  claims: [clm-his]
- id: cau-hol
  type: caution
  title: No simulation
  summary: No role play of victims.
  body: Use testimony.
  status: draft
  facets: {jurisdiction: [scotland], stage: [s1], curriculum_area: [social_studies], subject: [history]}
  evidence: {rating: not_recommended, rationale: guidance, citations: [{kind: url, url: 'https://example.org/guidance', description: Guidance on teaching the Holocaust}]}
  relations: {aligns_to: [cur-his, cur-missing]}
  claims: [clm-his-testimony]
claims:
- {id: clm-bold, entry_id: fmt-bold, text: Use bold for emphasis., supported_by: [psg-a], support_type: direct_quote}
- {id: clm-spacing, entry_id: adp-spacing, text: Wider spacing helps some readers., supported_by: [psg-b], support_type: paraphrase}
- {id: clm-his, entry_id: cur-his, text: SOC 3-01a is about evidence., supported_by: [psg-c], support_type: inference_by_curator}
- {id: clm-his-testimony, entry_id: cau-hol, text: Teach with testimony., supported_by: [psg-c], support_type: paraphrase}
`;
