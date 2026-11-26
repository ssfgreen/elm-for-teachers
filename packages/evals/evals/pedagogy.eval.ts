/**
 * The pedagogy library in a class chat (library/pedagogy-sample/HANDOFF.md section 8), on the
 * demo P7A and an S1 history class. They need a library server: run
 * `pnpm --filter @edw/library serve` and set LIBRARY_URL (e.g. http://localhost:8787); without
 * it they are skipped. Written on 12 Nov 2026 and not yet run: Sam to say when (they cost money).
 */
import { describe } from 'vitest';
import { h, ol, p } from '../src/harness.js';
import { citesClaim, createdDoc, docKeeps, messageDoesNotMatch, messageMatches, noChangedDocMatches, someDocStyled } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const SPACING = { entry_id: 'adp-ACC-individual-spacing-background', title: 'Individual letter spacing, font size and background preferences' };
const TTS = { entry_id: 'adp-ACC-text-to-speech', title: 'Text-to-speech and read aloud' };
const REPEAT = { entry_id: 'adp-ACC-repeat-and-check-instructions', title: 'Repeat, check back and leave instructions visible' };

/** P7A with tidy-puffin, steady-crayon and mellow-thimble's adaptations chosen as their rows describe. */
const P7A = {
  demo: true,
  adaptations: [
    { pupil: 'tidy-puffin', ...SPACING, overrides: 'amber overlay for printed text; Comic Sans 14pt on handouts' },
    { pupil: 'steady-crayon', ...TTS },
    { pupil: 'mellow-thimble', ...REPEAT },
  ],
  curriculum: [{ code: 'LIT 2-16a', text: 'To show my understanding across different areas of learning, I can identify and consider the purpose and main ideas of a text and use supporting detail.' }],
};

const READING = {
  name: 'Volcanoes reading task',
  blocks: [
    h('# Volcanoes'),
    p('A volcano is an opening in the Earth’s crust. When pressure builds up underground, molten rock called magma rises to the surface. Once it reaches the surface it is called lava.', 'text'),
    h('## Questions'),
    ol(['What is a volcano?', 'What is the difference between magma and lava?', 'Why do you think people live near volcanoes? Use the text to explain.'], 'qs'),
  ],
};

const HISTORY_S1 = { name: 'S1 History', stage: 'S1, Third level', subject: 'History', pupils: [{ label: 'quiet-comet' }, { label: 'brave-kettle', needs: ['Dyslexia'] }] };

describe.skipIf(!process.env.LIBRARY_URL)('Pedagogy library in a class chat', () => {
  evalCase(
    "makes tidy-puffin's version with their own settings, says what can't go on the page, and cites why",
    { docs: [READING], class: P7A, prompt: "Make a version of this reading task for tidy-puffin." },
    [createdDoc(), someDocStyled({ font: 'comic_sans' }), messageMatches(/overlay/i), citesClaim(), docKeeps('Volcanoes reading task', 'What is a volcano?')],
    { budget: { steps: 5, output: 5000 } },
  );

  evalCase(
    'treats three pupils with dyslexia differently, each from their own row',
    { docs: [READING], class: P7A, prompt: 'Make versions of this reading task for my three pupils with dyslexia.' },
    [messageMatches(/tidy-puffin/), messageMatches(/steady-crayon/), messageMatches(/mellow-thimble/), messageMatches(/text[- ]to[- ]speech|read (it )?aloud|listen/i), someDocStyled({ font: 'comic_sans' }), citesClaim()],
    { budget: { steps: 7, output: 9000, latencyMs: 90_000 } },
  );

  evalCase(
    'applies the Holocaust caution: no simulation or role play as a victim or perpetrator',
    { docs: [{ name: 'Holocaust lesson', blocks: [h('# The Holocaust')] }], class: HISTORY_S1, prompt: 'Write an S1 activity on the Holocaust for my class.' },
    [citesClaim(/^clm-HIS-hol-/), noChangedDocMatches(/imagine (that )?you are (a |an )?(jew|jewish|prisoner|victim|nazi|guard|soldier|perpetrator)|role[- ]?play (as|being)/i), noChangedDocMatches(/word ?search|crossword/i)],
    { budget: { steps: 5, output: 5000 } },
  );

  evalCase(
    'does not lower the goal silently: a simpler text for steady-crayon is offered, not done',
    { docs: [READING], class: P7A, prompt: 'Simplify this reading task for steady-crayon.' },
    [messageMatches(/learning goal|modif|same (questions|thinking|goal)|keep the (questions|goal)|lower/i), docKeeps('Volcanoes reading task', 'Use the text to explain.')],
    { budget: { steps: 5, output: 5000 } },
  );

  evalCase(
    'steers away from a dyslexia font as a general fix, and keeps the pupil’s own choice',
    { docs: [READING], class: P7A, prompt: "Put tidy-puffin's version in OpenDyslexic, that's the dyslexia font, right?" },
    [citesClaim(/^clm-ACC-font-/), messageMatches(/no (reading )?(benefit|gain)|not (help|shown)|spacing/i)],
    { budget: { steps: 5, output: 5000 } },
  );

  evalCase(
    'plans reciprocal reading for a group with an autistic pupil who finds figurative language hard',
    {
      docs: [{ name: 'Reading lesson', blocks: [h('# Reading lesson')] }],
      class: { ...P7A, adaptations: [...P7A.adaptations, { pupil: 'calm-lantern', entry_id: 'adp-ACC-literal-language', title: 'Literal language and explaining figurative language' }] },
      prompt: 'Make a reciprocal reading lesson plan for a group including calm-lantern, who finds figurative language hard.',
    },
    [citesClaim(/^clm-LIT-rr-/), noChangedDocMatches(/\[\[clm-/), messageMatches(/calm-lantern/)],
    { budget: { steps: 6, output: 6000 } },
  );

  evalCase(
    'reads the principle behind a lesson move from the library, and cites it',
    { docs: [READING], class: P7A, prompt: 'Add a short retrieval starter to the top of this task. What does the evidence say about why?' },
    [citesClaim(/^clm-EVD-/)],
    { budget: { steps: 5 } },
  );

  evalCase(
    'cites the library it used for a whole-class exercise, and names the curriculum code without a link',
    { docs: [{ name: 'Exercise', blocks: [h('# Exercise')] }], class: { ...P7A, curriculum: [{ code: 'LIT 2-13a', text: 'I can select and use a range of strategies and resources before I read, and as I read, to make meaning clear and give reasons for my selection.' }] }, prompt: 'Create a fun exercise for my students, universal design for all, for the current curriculum.' },
    [citesClaim(), messageMatches(/LIT 2-13a/), messageDoesNotMatch(/\]\(https?:\/\/[^)]*education\.gov\.scot/)],
    { budget: { steps: 6, output: 7000 } },
  );
});
