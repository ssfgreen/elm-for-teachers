# ELM for Teachers: Context (data curation)

**Status:** Example documents for the planning document, meant to be argued with and replaced, not adopted as they stand.

This folder is the project's "DATA CURATION" research output: the reference material skills load at runtime, plus the map of which skill loads what.

## `summaries/`

Six reference documents, written for agents (not teachers) to read, each an aggregation synthesised from multiple primary sources rather than a single document: an evidence summary, a negative-evidence register, jurisdiction terminology across the four UK nations, accessibility formatting standards, and two need-group profiles (DLD/EAL, autism). Each skill's `data_context` frontmatter field (in `skills/*/SKILL.md`) names which of these it loads.

## `raw/`

Currently empty. Intended to hold the downloaded primary-source documents the summaries in `summaries/` are built from (e.g. the SEND Code of Practice, EEF guidance PDFs, BDA/UKAAF standards, statutory texts cited in `jurisdiction_terminology.md`), so that each summary's claims can be traced back to and re-verified against the actual source text rather than the project team's paraphrase of it. Nothing has been downloaded into it yet — see "What is still missing" below.

## `data_curation_map.xlsx`

Excel map with three sheets: **Documents** (29 rows: task, document, usage, reference, strength, jurisdiction, licence, review date), **Task-Doc Map** (which documents each task loads, in what order) and a formula-driven **Coverage** sheet.