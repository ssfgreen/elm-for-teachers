import { buildCollection } from './collection.js';

/** A tiny collection for tests: two documents in the shape the ingest writes. */
export const FIXTURE_FILES = new Map<string, string>([
  [
    'collection.json',
    JSON.stringify({
      id: 'test',
      name: 'Test',
      publisher: 'Nobody',
      description: 'A test collection',
      licence: 'OGL-UK-3.0',
      licence_url: 'https://example.org/ogl',
      homepage: 'https://example.org',
      sources: [],
    }),
  ],
  [
    'docs/numeracy.md',
    `---
title: "Numeracy and mathematics: experiences and outcomes"
source_url: https://example.org/numeracy.pdf
licence: OGL-UK-3.0
fetched_at: 2026-11-08
type: experiences-and-outcomes
subject: [Numeracy and mathematics]
level: [Early, First, Second]
codes: [MNU 0-01a, MNU 1-03a, MNU 2-03a, MNU 2-03b]
---

# Numeracy and mathematics: experiences and outcomes

## Number, money and measure

### Estimation and rounding

MNU 0-01a: I am developing a sense of size and amount by observing.

### Number and number processes

MNU 1-03a: I can use addition, subtraction, multiplication and division when solving problems.
MNU 2-03a: Having determined which calculations are needed, I can solve problems involving whole numbers.
MNU 2-03b: I have explored the contexts in which problems involving decimal fractions occur.
Fractions appear again in MNU 2-03a, in passing.
`,
  ],
  [
    'docs/literacy.md',
    `---
title: "Literacy and English: experiences and outcomes"
source_url: https://example.org/literacy.pdf
licence: OGL-UK-3.0
fetched_at: 2026-11-01
type: experiences-and-outcomes
subject: Literacy and English
level: [Early, First]
codes: [LIT 0-01a, LIT 1-01a]
---

# Literacy and English: experiences and outcomes

LIT 0-01a / LIT 1-01a: I enjoy exploring and playing with the patterns and sounds of language.
LIT 1-02a: When I engage with others, I know when to listen and when to talk, and how to solve problems.
`,
  ],
]);

export const fixture = () => buildCollection(FIXTURE_FILES);
