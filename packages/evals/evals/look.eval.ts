/**
 * The look of a document and its layout. A teacher asked for a "light green" background and was
 * told it could not be done, though Pale green is on the toolbar; another asked for a
 * self-assessment grid and got table rows written into a list, shown as text with bars.
 */
import { describe } from 'vitest';
import { h, ol, p, ul } from '../src/harness.js';
import { docHasTable, docKeeps, docTableShaped, docStyled, messageDoesNotMatch, messageMatches, noEdits, noRejectedEdits, noStyleSuggested, noTableAsText, onlyOps } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const LETTER = {
  name: 'Persuasive letter',
  blocks: [
    h('# Persuasive writing: should school uniform be scrapped?'),
    h('## Task 1'),
    p('Read the article and underline three facts and three opinions.'),
    h('## Task 2'),
    ol(['What is the writer’s main argument?', 'Find one rhetorical question.', 'Which argument do you find most convincing, and why?']),
    h('## Task 3 (extension)'),
    p('Write a letter to the head teacher arguing for or against school uniform. Your letter should:'),
    ul(['open with a clear statement of your view', 'give at least three reasons, each in its own paragraph', 'use a rhetorical question', 'answer one argument from the other side', 'end with a call to action'], 'criteria'),
  ],
};

/** "Can't", "unable", "not able": the refusal the teacher was given. */
const REFUSAL = /\b(?:can(?:no|['’])t|unable|not able|isn['’]t possible)\b/i;

describe('The look of a document', () => {
  // Near-miss names: the closest colour on the list, suggested at once and named in the reply.
  for (const [asked, style, label] of [
    ['Update the background to light green', 'green', /pale green/i],
    ['Can you make the page a mint colour?', 'green', /pale green/i],
    ['Make the background pastel blue please', 'blue', /pale blue/i],
    ['Change the page to a cream colour', 'cream', /cream/i],
  ] as const) {
    evalCase(
      `“${asked}”: suggests ${style} and says so`,
      { docs: [LETTER], prompt: asked },
      [docStyled('Persuasive letter', { background: style }), onlyOps('set_style'), messageMatches(label), messageDoesNotMatch(REFUSAL), noRejectedEdits],
      { budget: { steps: 2 } },
    );
  }

  // Not on the list: no change, and the reply says which colours there are.
  for (const asked of ['Make the background dark red', 'Change the page colour to neon orange']) {
    evalCase(
      `“${asked}”: no change, and the reply names the page colours there are`,
      { docs: [LETTER], prompt: asked },
      [noEdits, noStyleSuggested, messageMatches(/pale|cream|lilac/i)],
      { budget: { steps: 1 } },
    );
  }
});

describe('Layout as a table', () => {
  evalCase(
    'a self-assessment grid is a table block, not table rows in a list (the workshop case)',
    {
      docs: [LETTER],
      prompt:
        'hey are going to write the extension in their jotters. Change the layout for task 3 so that it is a grid for self assessment with the requirements listed one by one. Include punctuation and spelling at the bottom of the grid.',
    },
    [
      docHasTable('Persuasive letter', /rhetorical question/i, /call to action/i, /punctuation/i, /spelling/i),
      docTableShaped('Persuasive letter', 2, /call to action/i),
      noTableAsText('Persuasive letter'),
      docKeeps('Persuasive letter', '## Task 1', '## Task 2'),
      noRejectedEdits,
    ],
    // Edit, check the layout, fix what it finds and answer: set before check_layout was offered.
    { budget: { steps: 5 } },
  );

  evalCase(
    'asked to turn a list into a table, it keeps the content and makes a table block',
    { docs: [LETTER], prompt: 'Keep the content as is, but change the task 3 list to a table format.' },
    [docHasTable('Persuasive letter', /three reasons/i, /call to action/i), docTableShaped('Persuasive letter', 2, /call to action/i), noTableAsText('Persuasive letter'), noRejectedEdits],
    { budget: { steps: 3 } },
  );
});
