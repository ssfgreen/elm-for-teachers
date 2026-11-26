/**
 * Regression on real use: every teacher message of an exported workshop, from exactly where the
 * original model started. The checks are general (it worked, nothing was rejected, within budget);
 * read the saved runs to compare what it wrote with the original. Skipped without an export.
 */
import { describe } from 'vitest';
import { REPO_ROOT } from '../src/context.js';
import { casesFromExport, exportDir } from '../src/fixtures.js';
import { noRejectedEdits } from '../src/judges.js';
import { evalCase } from '../src/suite.js';

const dir = exportDir(REPO_ROOT);

describe.skipIf(!dir)('Workshop replay', () => {
  for (const c of dir ? casesFromExport(dir) : []) evalCase(c.name, c.fixture, [noRejectedEdits]);
});
