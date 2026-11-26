/** Pictures: looked for in ARASAAC first (search_pictures), drawn as an SVG only when nothing there fits. */
import { describe } from 'vitest';
import { h, p } from '../src/harness.js';
import { docMatches, edited, noLibraryPicture, noRejectedEdits, usedLibraryPicture, usedTool } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const FRUIT = { name: 'Healthy eating', blocks: [h('# Healthy eating'), p('Fruit is good for you. An apple a day keeps the doctor away.')] };
const WEATHER = { name: 'The water cycle', blocks: [h('# The water cycle'), p('Water goes round and round: it evaporates, condenses into clouds and falls as rain.')] };
const picture = /!\[[^\]]*\]\(asset:ast_\w+\)/;

describe('Pictures', () => {
  evalCase(
    'a picture of a thing ARASAAC has comes from ARASAAC',
    { docs: [FRUIT], prompt: 'Add a picture of an apple under the heading.' },
    [usedTool('search_pictures'), edited, usedLibraryPicture, docMatches('Healthy eating', picture), noRejectedEdits],
    { budget: { steps: 4 } },
  );

  evalCase(
    'a diagram ARASAAC has no picture of is drawn',
    { docs: [WEATHER], prompt: 'Add a simple diagram of the water cycle at the end.' },
    [usedTool('search_pictures'), edited, noLibraryPicture, docMatches('The water cycle', picture), noRejectedEdits],
    { budget: { steps: 4, output: 8000 } },
  );
});
