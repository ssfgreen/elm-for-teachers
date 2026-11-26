/**
 * The demo chat a study workspace starts with (docs/classes.md, "Study workspaces"): three turns
 * written in advance for the demo class P7A, showing what the assistant can do with a class. It
 * plans from the class's curriculum and its benchmarks, grounded in the pedagogy library with
 * citations; writes a reading task; then makes tidy-puffin's version from their own row, and
 * Spyglass flags a change the teacher did not ask for. Fixed text, so every workspace starts the
 * same; the claim ids are real ones in the pedagogy library, so the "i" works.
 */
import type { AdaptationPick, CurriculumPick, CurriculumStatus, TurnStep } from '@edw/shared';

export const DEMO_CHAT_TITLE = 'Demo: a reading task for P7A';

/** Library adaptations chosen for the demo pupils, as their rows describe them. */
export const DEMO_ADAPTATIONS: (AdaptationPick & { pupil: string })[] = [
  { pupil: 'tidy-puffin', entry_id: 'adp-ACC-individual-spacing-background', title: 'Individual letter spacing, font size and background preferences', changes_goal: false, status: 'confirmed', overrides: 'amber overlay for printed text; Comic Sans 14pt on handouts' },
  { pupil: 'steady-crayon', entry_id: 'adp-ACC-text-to-speech', title: 'Text-to-speech and read aloud', changes_goal: false, status: 'confirmed', overrides: 'typing instead of handwriting for extended writing' },
  { pupil: 'mellow-thimble', entry_id: 'adp-ACC-repeat-and-check-instructions', title: 'Repeat, check back and leave instructions visible', changes_goal: false, status: 'confirmed', overrides: 'instructions read aloud 1:1 before independent tasks; no overlay' },
  { pupil: 'calm-lantern', entry_id: 'adp-ACC-visual-schedule', title: 'Visual schedule and visible lesson structure', changes_goal: false, status: 'confirmed', overrides: null },
  { pupil: 'bouncy-compass', entry_id: 'adp-ACC-numbered-steps-with-model', title: 'Step-numbered instructions with a finished example', changes_goal: false, status: 'trialling', overrides: 'written tasks in 3 steps at most' },
];

export const DEMO_CURRICULUM: (CurriculumPick & { status: CurriculumStatus })[] = [
  { code: 'LIT 2-16a', text: 'To show my understanding across different areas of learning, I can identify and consider the purpose and main ideas of a text and use supporting detail.', framework: 'cfe-eo', kind: 'eo', status: 'now' },
  { code: 'ENG 2-19a', text: 'I can: • discuss structure, characterisation and/or setting • recognise the relevance of the writer’s theme and how this relates to my own and others’ experiences • discuss the writer’s style and other features appropriate to genre.', framework: 'cfe-eo', kind: 'eo', status: 'planned' },
  { code: 'LIT 2-14a', text: 'Using what I know about the features of different types of texts, I can find, select and sort information from a variety of sources and use this for different purposes.', framework: 'cfe-eo', kind: 'eo', status: 'done' },
];

const tool = (title: string, request: unknown, summary: string[]): TurnStep => ({ kind: 'tool', title, request: JSON.stringify(request, null, 2), summary });
const thinking = (title: string, detail: string): TurnStep => ({ kind: 'thinking', title, detail });

export const TURN_PLAN = {
  prompt: 'What should P7A be working on in reading this term, and how should I teach it?',
  reply: [
    'P7A is working on **LIT 2-16a** now: identifying the purpose and main ideas of a text, with supporting detail. Its benchmarks ask pupils to identify the main ideas of a text with appropriate detail, and to make notes in their own words.',
    '',
    'For teaching it, I would use **reciprocal reading**: pupils predict, question, clarify and summarise a short text in turn, which builds comprehension and lets you hear their thinking [[clm-LIT-rr-four-strategies]]. A targeted small-group version helped upper primary pupils in an EEF trial [[clm-LIT-rr-eef-trial]], so it suits a guided group with you.',
    '',
    'For this class in particular:',
    '- Put the four roles on a visible card with one numbered step each, so calm-lantern and bouncy-compass can see what comes next [[clm-ACC-repeat-visible]].',
    '- Read the text aloud to mellow-thimble first, and offer steady-crayon text-to-speech.',
    '- Give quiet-comet, clever-walrus and perky-rocket a second text to compare main ideas across.',
    '',
    'Shall I write a short reading task on a topic you are teaching? The library entries behind this are drafts that no educator has reviewed yet.',
  ].join('\n'),
  steps: [
    thinking('Reading the class', "P7A, Second level. The class's curriculum now is LIT 2-16a; six pupils have support needs."),
    tool('Looked in the pedagogy library for “reciprocal”', { types: ['signature_pedagogy'], text: 'reciprocal' }, ['Found Reciprocal reading (predict, question, clarify, summarise)']),
  ],
};

/** The worksheet the second turn writes into the chat's first doc. */
export const WORKSHEET = {
  name: 'Volcanoes: main ideas',
  blocks: [
    { type: 'heading' as const, content: '# Volcanoes: finding the main ideas' },
    { type: 'paragraph' as const, content: '**Learning intention:** I can identify the main ideas of a text and use supporting detail. (LIT 2-16a)' },
    { type: 'paragraph' as const, content: 'A volcano is an opening in the Earth’s crust. Deep underground, rock melts into **magma**. When pressure builds up, magma rises to the surface, where it is called **lava**. Some volcanoes erupt often; others sleep for hundreds of years. People live near volcanoes because the soil is rich for farming and the heat can make electricity.' },
    { type: 'heading' as const, content: '## Questions' },
    { type: 'numbered_item' as const, content: 'What is the main idea of the text? Write it in one sentence.' },
    { type: 'numbered_item' as const, content: 'What is the difference between magma and lava?' },
    { type: 'numbered_item' as const, content: 'Why do people live near volcanoes? Use the text to explain.' },
  ],
};

export const TURN_WORKSHEET = {
  prompt: 'Make a short reading task on volcanoes for LIT 2-16a.',
  reply: [
    'I have written a short reading task on volcanoes: a learning intention for LIT 2-16a, a short text and three questions that move from the main idea to supporting detail.',
    '',
    'It follows the library’s baseline format rules: **bold** for key words rather than italics [[clm-ACC-emph-bold]], and one task per line. Shall I make versions for particular pupils?',
  ].join('\n'),
  steps: [tool('Edited the document (7 changes)', { operations: '7 inserts' }, ['Added a heading, a learning intention, a text and three questions'])],
};

export const TURN_VERSION = {
  prompt: 'Make a version for tidy-puffin.',
  copyName: 'Volcanoes: main ideas (tidy-puffin)',
  /** The changes to the copy, by the index of the worksheet block they change. */
  changes: [
    { index: 2, content: 'A volcano is an opening in the Earth’s crust.\n\nDeep underground, rock melts into **magma**. When pressure builds up, magma rises to the surface, where it is called **lava**.\n\nSome volcanoes erupt often; others sleep for hundreds of years.\n\nPeople live near volcanoes because the soil is rich for farming and the heat can make electricity.' },
    // The question reworded: what Spyglass flags, as the request was about layout, not questions.
    { index: 6, content: 'Why do people live near volcanoes? Find two reasons in the text.' },
  ],
  reply: [
    "I have made **tidy-puffin's version** as a copy, from their row: in Comic Sans, their own choice for handouts, with the text in short paragraphs and space between [[clm-ACC-spacing-preference]].",
    '',
    'Things it cannot do on the page: print it at **14pt**, as their row asks; tidy-puffin uses an **amber overlay** for printed text, so print on white paper and have the overlay ready; and they need extra time only in assessments, not for this task.',
    '',
    'Comic Sans is kept because it is their own choice, not because it is a dyslexia font: specialist fonts showed no reading gains in trials [[clm-ACC-font-opendyslexic]], but a pupil may use a font they find comfortable [[clm-ACC-font-preference-ok]].',
  ].join('\n'),
  steps: [
    thinking('Reading tidy-puffin’s row', 'Dyslexia. Chosen adaptation: individual spacing, font size and background (confirmed). Own settings: amber overlay for printed text; Comic Sans 14pt on handouts.'),
    tool('Edited the document (4 changes)', { operations: 'copy, font, 2 replaces' }, ['Copied the worksheet for tidy-puffin', 'Set the font to Comic Sans', 'Split the text into short paragraphs', 'Changed question 3']),
  ],
  spyglass: {
    title: 'Question 3 reworded',
    why: 'You asked for tidy-puffin’s layout and font, but the copy also changes question 3, so it no longer asks them to explain using the text.',
  },
};
