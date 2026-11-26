---
name: differentiate-for-dyslexia
description: Adapt a reading text, worksheet or set of instructions so that a pupil with dyslexia or literacy difficulties can access the same content as the rest of the class. Use when a teacher asks for a "dyslexia friendly", "dyslexia-friendly", "accessible" or "easier to read" version of a resource, or mentions dyslexia, reading difficulties or text-to-speech. Do not use to simplify or reduce the content itself; that is a content decision for the teacher.
version: 0.1
jurisdictions: England, Scotland, Wales, Northern Ireland
phase: primary, secondary
evidence_strength: formatting rules are professional consensus (BDA, Dyslexia Scotland); underlying approach (same content, access adaptation) follows EEF SEND guidance and the ITT Core Content Framework
data_context: context/summaries/accessibility_formatting_standards.md, context/summaries/negative_evidence_register.md
---

# Differentiate for dyslexia

## What this skill does

Takes a resource the teacher has already chosen and produces a version that is easier to decode and navigate, while keeping every concept, key term and question. It changes the **route**, not the **destination**.

## Invariants (never break these)

1. The learning objective and success criteria are unchanged. State them at the top of the output.
2. Every subject-specific term in the source appears in the adapted version. If you cannot keep a term, stop and ask the teacher.
3. No identifiable pupil data. Work from "a pupil with dyslexia, Year 5", not names.
4. Output a change log listing each change, why it was made and the source of the rule.
5. Do not offer a "dyslexia font" as a fix. There is no consistent reading advantage for specialised fonts (Dyslexia Scotland). Offer it only as a preference option.

## Inputs

- The source resource (text, worksheet, instructions).
- The learning objective (ask if absent).
- Year group or stage.
- Optional: the pupil's known preferences (background colour, font size, text-to-speech use). Ask the teacher; do not infer from a diagnosis.

## Steps

1. **Read the whole source.** Extract: the objective, the key terms (Tier 2 and Tier 3), the questions or tasks, and any diagrams.
2. **Apply the format rules** (British Dyslexia Association Style Guide 2023):
   - Sans-serif font: Arial, Verdana, Calibri or similar. 12 to 14 point minimum; larger for younger pupils.
   - Line spacing 1.5. Paragraph spacing larger than line spacing.
   - Inter-word spacing at least 3.5 times the inter-letter spacing.
   - Left-aligned, ragged right. No justified text. No columns.
   - Headings at least 20% larger than body text, bold, not underlined.
   - No italics, no all-capitals, no underlining for emphasis. Use bold.
   - Cream or soft pastel background, dark text. Avoid pure white on black and pure black on white.
   - Matt paper or non-glossy export where printing is likely.
3. **Restructure for navigation without changing content:**
   - Break long paragraphs into short ones with a sub-heading each.
   - One instruction or question per line, numbered.
   - Put the key terms in a box at the top with a short, pupil-friendly definition. Keep the terms themselves exactly as in the source.
   - Keep sentence length reasonable by splitting compound sentences only where meaning is preserved.
4. **Add access supports, not content supports:**
   - A text-to-speech-ready version: plain headings, no text in images, alt text for diagrams.
   - A glossary (the same key-term box) placed where the pupil can see it while working.
   - Optional reading ruler or line-by-line layout for younger pupils.
5. **Run the checks** below.
6. **Write the change log** and a two-line note for the teacher on what to review.

## Checks

- [ ] Objective and success criteria stated and unchanged.
- [ ] Every key term from the source is present (list them; the checker diffs them).
- [ ] Every question or task from the source is present and asks the same thing.
- [ ] No italics, all-caps, underlining or justified text in the output.
- [ ] Reading level: the vocabulary has not been lowered; only structure and layout changed.
- [ ] No pupil names, dates of birth or diagnosis statements in the output.
- [ ] Change log complete with sources.

## Output

1. Adapted resource (document or formatted text).
2. Key-term box or glossary.
3. Text-to-speech-ready plain version.
4. Change log.
5. Teacher review note: what was changed structurally; anything the teacher should check for meaning; a reminder that pupils' colour and size preferences vary.

## When to refuse or redirect

- The teacher asks to "make the content easier" or remove topics: ask for the objective and offer `scaffolded-task-versions` instead.
- The teacher provides a pupil's name and diagnosis: ask them to describe the barrier without identifying the pupil.
- The teacher asks for a visual or auditory learning-style version: explain, with the Pashler et al. (2008) reference, that learning-styles matching lacks evidence, and offer dual coding for the whole class.

## Sources

- British Dyslexia Association, Dyslexia Style Guide (2023).
- Dyslexia Scotland, Formats guidance (2025) on fonts and backgrounds.
- EEF, Special Educational Needs in Mainstream Schools (2020, updated 2025): high-quality teaching for all; scaffolding; technology.
- DfE, ITT Core Content Framework and Early Career Framework: adaptive teaching should not set lower expectations for particular pupils.
- EEF, Improving Literacy in Key Stage 2 and Improving Literacy in Secondary Schools: explicit vocabulary teaching.

## Worked example (abbreviated)

Teacher prompt: "Can you make this reading comprehension dyslexia friendly? It's about the water cycle. Same questions please."

Agent response structure:
- Objective: pupils can describe the stages of the water cycle using the terms evaporation, condensation, precipitation and collection.
- Adapted text: four short sections with headings ("Evaporation", "Condensation", "Precipitation", "Collection"), Arial 14pt, 1.5 spacing, cream background, key-term box at the top.
- Questions: all six retained, one per line, numbered.
- Change log: "Split one 400-word block into four sections with headings (BDA). Replaced italics on key terms with bold (BDA). Added key-term box; definitions are mine, terms are from the source. No vocabulary changed."
- Review note: "Please check the four definitions in the key-term box match how you teach them."
