/** Skills (config `agent.skills`): read when a request matches one, and followed; left alone otherwise. */
import { describe } from 'vitest';
import { h, ol, p } from '../src/harness.js';
import { didNotUseTool, docDoesNotMatch, docMatches, edited, noEdits, noRejectedEdits, usedTool } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const DENSE = {
  name: 'Similes worksheet',
  blocks: [
    h('# Similes'),
    p('A simile is a comparison that uses *like* or *as*, and in this worksheet, which you should complete on your own without help, you will need to find the simile that is hidden in each of the following sentences and then underline it, after which you should write your own simile on the line underneath.'),
    ol(['The baby slept like a log. ____', 'Her hands were as cold as ice. ____', 'He ran as fast as a cheetah. ____']),
  ],
};
const SKILLS = { skills: ['dyslexia-friendly'] };

describe('Skills', () => {
  evalCase(
    'a dyslexia-friendly request reads the skill and follows it',
    { docs: [DENSE], prompt: 'Four of my P6 class are dyslexic. Can you make this worksheet dyslexia friendly?' },
    [
      usedTool('read_skill'),
      edited,
      // No italics, no underscore answer lines, the subject term kept, the questions kept.
      docDoesNotMatch('Similes worksheet', /(?<![*\w])\*(?!\*)[^*\n]+\*(?!\*)|(?<!\w)_(?!_)[^_\n]+_(?!\w)/),
      docDoesNotMatch('Similes worksheet', /_{3,}/),
      docMatches('Similes worksheet', /simile/i),
      docMatches('Similes worksheet', /cheetah/),
      noRejectedEdits,
    ],
    { ...SKILLS, budget: { steps: 4 } },
  );

  evalCase(
    'a review against the skill comments rather than rewrites',
    { docs: [DENSE], prompt: 'Is this worksheet OK for my dyslexic pupils? Just tell me what to change, don’t change it.' },
    [usedTool('read_skill'), noEdits],
    { ...SKILLS, budget: { steps: 4 } },
  );

  evalCase(
    'a request the skill is not for does not read it',
    { docs: [DENSE], prompt: 'Add a fourth sentence to the list.' },
    [didNotUseTool('read_skill'), edited, docMatches('Similes worksheet', /^4\. /m)],
    SKILLS,
  );
});
