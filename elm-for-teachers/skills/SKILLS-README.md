# ELM for Teachers: Skills

**Status:** Example documents for the planning document.

Five skill files, one per file in `skills/<name>/SKILL.md`, sharing a common schema so that a harness can load any of them the same way.

## Common schema

Every `SKILL.md` has:

- **Frontmatter:** `name`, `description` (including when to trigger the skill and when not to), `version`, `jurisdictions`, `phase`, `evidence_strength`, `data_context` (which files under `context/summaries/` the skill should load).
- **What this skill does:** one short paragraph.
- **Invariants:** rules the skill must never break.
- **Inputs:** what the skill needs from the teacher, and what it should ask for rather than infer.
- **Steps, checks, output, refusals, sources:** (further sections...)