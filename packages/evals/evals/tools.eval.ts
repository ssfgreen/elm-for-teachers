/** Each tool and operation doing its job on a small, realistic worksheet. */
import { describe } from 'vitest';
import { h, ol, p, table } from '../src/harness.js';
import {
  createdDoc,
  createdNoDoc,
  docDoesNotMatch,
  docInOrder,
  docKeeps,
  docMatches,
  docStartsWith,
  docUnchanged,
  edited,
  noRejectedEdits,
  onlyOps,
  opsAtMost,
  usedTool,
  type Check,
} from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const SIMILES = { name: 'Similes worksheet', blocks: [h('# Similes'), p('Underline the simile in each sentence.'), ol(['The baby slept like a log.', 'Her hands were as cold as ice.', 'He ran as fast as a cheetah.'])] };

describe('Tools', () => {
  evalCase(
    'read_document: fills an answer key from the worksheet in another document',
    { docs: [SIMILES, { name: 'Answer key', open: true, blocks: [h('# Answer key')] }], prompt: 'Fill in the answer key for the similes worksheet.' },
    [usedTool('read_document'), docMatches('Answer key', /like a log/i), docMatches('Answer key', /as cold as ice/i), docMatches('Answer key', /cheetah/i), docUnchanged('Similes worksheet'), noRejectedEdits],
    { budget: { steps: 4 } },
  );

  evalCase(
    'insert: drafts a worksheet into an empty document, title first',
    { docs: [{ name: 'Untitled', blocks: [] }], prompt: 'Write a short worksheet on metaphors for P6: a title, one instruction and five sentences for pupils to complete.' },
    [edited, docStartsWith('Untitled', /^# /), docMatches('Untitled', /metaphor/i), docMatches('Untitled', /^5\. /m), createdNoDoc, noRejectedEdits],
  );

  evalCase(
    'replace: a comment on one sentence changes that sentence only',
    {
      docs: [{ name: 'Weather writing', blocks: [h('# Weather writing'), p('Write a simile about the weather.', 'task'), ol(['The rain was like ____.', 'The wind howled like ____.'])] }],
      prompt: 'Make this more specific for P4 pupils.',
      anchor: { key: 'task' },
    },
    [docChangedText('Weather writing', 'Write a simile about the weather.'), docKeeps('Weather writing', '# Weather writing', 'The rain was like ____.', 'The wind howled like ____.'), opsAtMost(2), noRejectedEdits],
  );

  evalCase(
    'delete: removes the question the teacher names, and only that',
    { docs: [{ name: 'Metaphors', blocks: [h('# Metaphors'), ol(['The classroom was a zoo.', 'The moon was a silver coin.', 'Time is a thief.'])] }], prompt: 'Remove the question about the moon.' },
    [docDoesNotMatch('Metaphors', /moon/i), docKeeps('Metaphors', 'The classroom was a zoo.', 'Time is a thief.'), opsAtMost(2), noRejectedEdits],
  );

  evalCase(
    'move: puts a document that is upside down back in reading order',
    {
      docs: [
        {
          name: 'Personification',
          blocks: [ol(['The wind whispered.', 'The sun smiled down.', 'The car coughed and spluttered.']), p('Read each sentence and underline the thing that acts like a person.'), h('## Questions'), h('# Personification')],
        },
      ],
      prompt: 'This document is upside down. Put it back in the right order.',
    },
    // Title first and the questions last; the instruction and the "Questions" heading may come in either order.
    [docStartsWith('Personification', /^# Personification/), docInOrder('Personification', [/^## Questions/, /^1\. /]), docInOrder('Personification', [/^Read each sentence/, /^1\. /]), docKeeps('Personification', 'The car coughed and spluttered.'), noRejectedEdits],
  );

  evalCase(
    'create_doc: makes an answer sheet as a separate document',
    { docs: [SIMILES], prompt: 'Make an answer sheet for this worksheet as a new document.' },
    [createdDoc(/answer/i), docUnchanged('Similes worksheet'), noRejectedEdits],
  );

  evalCase(
    'table: widens the sentence column and narrows the tick-box columns',
    {
      docs: [
        {
          name: 'Simile or metaphor',
          blocks: [
            h('# Simile or metaphor?'),
            table([
              ['Sentence', 'Simile', 'Metaphor'],
              ['The snow was a white blanket over the whole village.', '[ ]', '[ ]'],
              ['She was as busy as a bee all through the summer holidays.', '[ ]', '[ ]'],
            ]),
          ],
        },
      ],
      prompt: 'Can you make the columns a more sensible width? The sentences need more room.',
    },
    [firstColumnWidest('Simile or metaphor'), onlyOps('replace'), opsAtMost(1), noRejectedEdits],
  );
});

/** The block holding `text` was rewritten (the text is gone and the doc changed). */
function docChangedText(doc: string, text: string): Check {
  return (r) => ({ name: `rewrote “${text.slice(0, 40)}”`, kind: 'behaviour', pass: !(r.after[doc] ?? '').includes(text) && r.after[doc] !== r.before[doc] });
}

/** The table has a colwidths line whose first column is the widest (0, "the rest", counts as widest). */
function firstColumnWidest(doc: string): Check {
  return (r) => {
    const m = /<!--\s*colwidths:\s*([\d\s]+)-->/.exec(r.after[doc] ?? '');
    const w = m ? m[1]!.trim().split(/\s+/).map(Number) : [];
    const first = w[0] === 0 ? Infinity : (w[0] ?? -1);
    return { name: 'first column widest', kind: 'behaviour', pass: w.length === 3 && w.slice(1).every((x) => x !== 0 && x < first), detail: m ? m[0] : 'no colwidths line' };
  };
}
