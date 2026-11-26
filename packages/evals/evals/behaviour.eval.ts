/** Edge cases: deciding whether to edit at all, following the chat so far, and odd inputs. */
import { describe } from 'vitest';
import { h, ol, p, type BlockFixture } from '../src/harness.js';
import {
  asksQuestion,
  didNotUseTool,
  docDoesNotMatch,
  docKeeps,
  docMatches,
  edited,
  messageMatches,
  noEdits,
  noRejectedEdits,
  onlyOps,
  opsAtMost,
  summaryMatches,
} from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const SIMILES = { name: 'Similes worksheet', blocks: [h('# Similes'), p('Underline the simile in each sentence.'), ol(['The baby slept like a log.', 'Her hands were as cold as ice.', 'He ran as fast as a cheetah.'])] };

describe('When to edit', () => {
  evalCase(
    'a question gets an answer in chat, with no edits',
    { docs: [SIMILES], prompt: 'What is the difference between a simile and a metaphor?' },
    [noEdits, didNotUseTool('edit_document'), messageMatches(/like|as/i)],
    { budget: { steps: 1 } },
  );

  evalCase(
    'an unclear request about an empty document gets a question back',
    { docs: [{ name: 'Untitled', blocks: [] }], prompt: 'Can you make it easier?' },
    [asksQuestion],
    { budget: { steps: 1 } },
  );

  evalCase(
    'a document from another chat is not invented',
    { docs: [SIMILES], prompt: 'Copy the questions from my Year 8 poetry worksheet into this one.' },
    [noEdits, messageMatches(/can(?:no|')t|don(?:'|’)t have|not (?:able|in this|available|see)|isn(?:'|’)t|paste|share|which/i)],
  );
});

describe('The chat so far', () => {
  evalCase(
    'a preference stated earlier is kept: no underscore answer lines',
    {
      docs: [{ name: 'Similes worksheet', blocks: [h('# Similes'), ol(['The baby slept like ……', 'Her hands were as cold as ……'])] }],
      history: [{ prompt: 'Please don’t use underscores like ____ for answer spaces, I don’t like them.', reply: 'Understood: I’ll use dotted lines (……) for answer spaces from now on.' }],
      prompt: 'Add three more questions to the end of the list.',
    },
    [edited, docDoesNotMatch('Similes worksheet', /_{3,}/), docMatches('Similes worksheet', /^5\. /m), noRejectedEdits],
  );

  evalCase(
    'a preference from long ago survives being folded into the summary',
    {
      docs: [{ name: 'Similes worksheet', blocks: [h('# Similes'), ol(['The baby slept like ……', 'Her hands were as cold as ……'])] }],
      // Fourteen turns before this one: past max_turns (12), so the oldest are summarised first.
      history: [
        { prompt: 'My class is P6 and four of them have dyslexia. Please never use underscores like ____ for answer spaces; use dotted lines (……).', reply: 'Understood: dotted lines (……) for answer spaces from now on, and I’ll keep the layout clear for the pupils with dyslexia.' },
        ...['the sea', 'a lion', 'snow', 'thunder', 'a feather', 'the sun', 'a rocket', 'glass', 'a mouse', 'honey', 'a ghost', 'stone', 'fire'].map((w) => ({
          prompt: `What is a good simile about ${w}?`,
          reply: `For example: “as ${w === 'snow' ? 'white' : 'bright'} as ${w}”.`,
        })),
      ],
      prompt: 'Add three more questions to the end of the list.',
    },
    [edited, docDoesNotMatch('Similes worksheet', /_{3,}/), docMatches('Similes worksheet', /^5\. /m), summaryMatches(/underscore|dotted|……/i), noRejectedEdits],
  );

  evalCase(
    'a message full of typos is understood',
    { docs: [SIMILES], prompt: 'cna u ad 2 more similies to teh list pls' },
    [edited, docMatches('Similes worksheet', /^5\. /m), docKeeps('Similes worksheet', 'The baby slept like a log.'), noRejectedEdits],
  );
});

describe('Odd inputs', () => {
  const long: BlockFixture[] = [h('# Reading log')];
  for (let i = 1; i <= 120; i++) long.push(p(i === 87 ? `Entry ${i}: I did not recieve the book until Tuesday.` : `Entry ${i}: We read two chapters and talked about the main character.`));
  evalCase(
    'a long document: one targeted fix, without rewriting the rest',
    { docs: [{ name: 'Reading log', blocks: long }], prompt: 'There is a spelling mistake in entry 87. Please fix it.' },
    [docDoesNotMatch('Reading log', /recieve/), docKeeps('Reading log', 'Entry 120: We read two chapters'), onlyOps('replace'), opsAtMost(1), noRejectedEdits],
    { budget: { uncachedInput: 20_000 } },
  );

  evalCase(
    'British English in what it writes',
    { docs: [{ name: 'Untitled', blocks: [] }], prompt: 'Write a short paragraph for P5 explaining what an adjective is, using colours as examples.' },
    [edited, docDoesNotMatch('Untitled', /\bcolor/i)],
  );

  evalCase(
    'Gaelic text is kept exactly',
    { docs: [{ name: 'Na Ràithean', blocks: [h('# Na Ràithean'), ol(['An t-Earrach', 'An Samhradh', 'Am Foghar', 'An Geamhradh'])] }], prompt: 'Add a subtitle in English under the title.' },
    [edited, docKeeps('Na Ràithean', '# Na Ràithean', 'An t-Earrach', 'Am Foghar', 'An Geamhradh'), noRejectedEdits],
  );
});
