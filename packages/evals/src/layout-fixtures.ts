/**
 * Worksheets for the layout evals, rebuilt from the workshop telemetry (P01 to P04, Nov 2026),
 * each with the layout problem a teacher there asked about or fixed by hand. The fixture tests
 * (test/layout-fixtures.test.ts) check each one has its problem before the model sees it.
 */
import { h, ol, p, table, type BlockFixture, type DocFixture } from './harness.js';

const u = (n: number) => '_'.repeat(n);
const quote = (content: string, key?: string): BlockFixture => ({ type: 'quote', content, ...(key ? { key } : {}) });
const empty = (): BlockFixture => p('');

const SIMILE_ROWS = [
  ['', 'Sentence', 'Simile', 'Metaphor'],
  ['1', 'The classroom was a zoo after the bell rang.', '☐', '☐'],
  ['2', 'My brother runs like a cheetah.', '☐', '☐'],
  ['3', 'The snow was a white blanket over the hills.', '☐', '☐'],
  ['4', "Grandpa's hands were as rough as sandpaper.", '☐', '☐'],
  ['5', 'The walk home felt like a marathon.', '☐', '☐'],
  ['6', 'The wind howled like a hungry wolf.', '☐', '☐'],
  ['7', 'My bedroom is a pigsty.', '☐', '☐'],
];

const SIMILES_BLOCKS: BlockFixture[] = [
  h('# Similes and Metaphors'),
  p(`**Name:** ${u(30)} **Date:** ${u(16)} **Class:** P7`, 'name'),
  p('*Primary 7 English Homework | About 10 minutes*'),
  p('**Learning intention:** I am learning to recognise and use similes and metaphors to make my writing more interesting.'),
  quote('> **A simile** compares two things using the words **like** or **as**. *Example:* Her smile was as bright as the sun.', 'simile'),
  quote('> **A metaphor** says something **is** something else, without using like or as. *Example:* Her smile was the sun on a cloudy day.', 'metaphor'),
  h('## Task 1: Simile or metaphor? *(5 minutes)*'),
  p('Read each sentence. Tick the box to show whether it is a simile or a metaphor.'),
  table(SIMILE_ROWS, 'table'),
  h('## Task 2: Finish the sentences *(5 minutes)*'),
  p('Complete each sentence with your own idea. Try to be creative!'),
  ol([`The old door creaked like ${u(46)}`, `After football practice, I was as hungry as ${u(31)}`, `On Monday morning, my classroom is a ${u(31)}`, `The thunderstorm was an angry ${u(38)}`], 'task2'),
];

/** P01, P02, P04: the similes homework as the teachers started it, its table in equal columns. */
export const SIMILES: DocFixture = { name: 'Similes and Metaphors Homework', blocks: SIMILES_BLOCKS };

/** P03: the Bannockburn sources table, in equal columns. */
export const SOURCES: DocFixture = {
  name: 'S1 Bannockburn Sources Homework',
  blocks: [
    h('# S1 History: The Battle of Bannockburn'),
    h('## Part 1: Primary or secondary? *(5 minutes)*'),
    p('Read each description. Tick whether it is a primary or a secondary source.'),
    table([
      ['No.', 'Source', 'Primary', 'Secondary'],
      ['1', 'The Declaration of Arbroath, a letter to the Pope written by Scottish nobles in 1320', '☐', '☐'],
      ['2', 'A website article about Bannockburn written in 2019', '☐', '☐'],
      ['3', "A silver penny made during Robert the Bruce's reign", '☐', '☐'],
      ['4', 'A painting of the battle by a Victorian artist, painted in the 1880s', '☐', '☐'],
      ['5', 'A modern map showing where the two armies stood', '☐', '☐'],
      ['6', 'A chronicle written by an English monk a few years after the battle', '☐', '☐'],
    ], 'table'),
  ],
};

const TRENCH_QUESTIONS = [
  'What was it like in muddy or flooded trenches, and what could happen to soldiers’ feet?',
  'Why was poor hygiene a problem for soldiers?',
  'How did lice affect soldiers?',
  'What problems did rats cause in the trenches?',
  'What was the food like for soldiers on the front line?',
];

const TRENCH_TOP: BlockFixture[] = [
  h('# S1 History Homework: Life in the trenches'),
  h('## Task 1: Describe the conditions *(7 minutes)*'),
  p('Based on what you have read, answer the questions below in full sentences.'),
];

/** P04: one question with a short writing line, the rest with "…" where the answer goes. */
export const TRENCHES: DocFixture = {
  name: 'Life in the trenches',
  blocks: [...TRENCH_TOP, ol([`${TRENCH_QUESTIONS[0]}\n   ${u(46)}`, ...TRENCH_QUESTIONS.slice(1).map((q) => `${q} …`)], 'task1')],
};

/** P04 before "write on": questions with nowhere to write. */
export const TRENCHES_BARE: DocFixture = { name: 'Life in the trenches', blocks: [...TRENCH_TOP, ol(TRENCH_QUESTIONS, 'task1')] };

/** P01, P04: the similes sheet spaced out with empty paragraphs, unevenly. */
export const SIMILES_MESSY: DocFixture = {
  name: 'Similes and Metaphors Homework',
  blocks: [
    ...SIMILES_BLOCKS.slice(0, 4),
    empty(),
    empty(),
    empty(),
    ...SIMILES_BLOCKS.slice(4, 7),
    empty(),
    p(' '),
    ...SIMILES_BLOCKS.slice(7, 9),
    empty(),
    empty(),
    ...SIMILES_BLOCKS.slice(9),
    empty(),
    empty(),
  ],
};

const READING = [
  'The Great War lasted from 1914 to 1918. Many Scottish soldiers fought in trenches: long, narrow ditches dug into the ground. Life there was hard, even when soldiers were not fighting.',
  '**Mud and water:** Rain filled the trenches and turned the ground to deep mud. Soldiers’ feet could stay wet for days, which caused **trench foot**: sore, swollen feet that could become infected.',
  '**Keeping clean:** Soldiers could not wash. Germs caused **trench mouth**.',
  '**Lice and rats:** Lice lived in soldiers’ hair and clothes, including kilts. Their bites itched and could spread **trench fever**. Rats as big as cats stole food and spread disease.',
];

/** P04: the trenches sheet with its reading, a page and a couple of lines long. */
export const TRENCHES_LONG: DocFixture = {
  name: 'Life in the trenches',
  blocks: [
    h('# S1 History Homework: Life in the trenches'),
    p(`Name: ${u(30)}  Class: ${u(12)}  Date: ${u(12)}`),
    empty(),
    h('## Read: What was life like in the trenches? *(5 minutes)*'),
    ...READING.map((t) => p(t)),
    empty(),
    h('## Task 1: Describe the conditions *(7 minutes)*'),
    p('Based on what you have read, answer the questions below in full sentences.'),
    ol(TRENCH_QUESTIONS.map((q) => `${q}\n   ${u(64)}\n   ${u(64)}`), 'task1'),
    empty(),
    h('## Check for success'),
    { type: 'checklist', content: '- [ ] I can describe at least two conditions in the trenches.\n- [ ] I can explain how one of them made life difficult for soldiers.' },
  ],
};

const WORDS = ['torrential', 'gale', 'drizzle', 'thunderous', 'flash', 'downpour', 'gust', 'hail', 'sleet', 'squall', 'tempest', 'deluge', 'mist', 'fog', 'breeze', 'blizzard', 'monsoon', 'hurricane', 'cyclone', 'whirlwind', 'cloudburst', 'frost', 'haze', 'shower', 'storm', 'thaw', 'rainbow', 'dew', 'smog'];
const withWidths = (b: BlockFixture, widths: string): BlockFixture => ({ ...b, content: `${b.content}\n<!-- colwidths: ${widths} -->` });

/** A word bank whose last row goes over to the next page on its own. */
export const VOCABULARY: DocFixture = {
  name: 'Weather vocabulary',
  blocks: [
    h('# Weather writing: vocabulary'),
    p('Use these words in your description of a storm. Tick each one you use.'),
    ...READING.map((t) => p(t)),
    withWidths(table([['Word', 'Meaning', 'Used it?'], ...WORDS.map((w) => [w, `a kind of weather: ${w}`, '☐'])], 'table'), '110 0 90'),
  ],
};
