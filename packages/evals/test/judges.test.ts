import { describe, expect, it } from 'vitest';
import type { EvalRun } from '../src/harness.js';
import { docTableShaped } from '../src/judges.js';

const withTable = (content: string) => ({ afterBlocks: { Doc: [{ type: 'table', content }] } }) as unknown as EvalRun;

describe('docTableShaped', () => {
  it('passes a table with a header row and enough columns, colwidths line and all', () => {
    const grid = 'Criteria | Yes | Not yet\n| --- | --- | --- |\nA call to action | ☐ | ☐\n<!-- colwidths: 0 85 85 -->';
    expect(docTableShaped('Doc', 2, /call to action/)(withTable(grid)).pass).toBe(true);
  });

  it('counts columns as the editor does: rows with an empty last cell are as wide as the widest', () => {
    const ticks = 'Your letter should | Tick\n--- | ---\nopen with a clear view | \nend with a call to action | ';
    expect(docTableShaped('Doc', 2, /call to action/)(withTable(ticks)).pass).toBe(true);
  });

  it('fails list lines put into a table block as they were: one column, no header', () => {
    expect(docTableShaped('Doc', 2, /call to action/)(withTable('give three reasons\nend with a call to action')).pass).toBe(false);
  });

  it('fails a table with a header but too few columns, and a doc with no matching table', () => {
    expect(docTableShaped('Doc', 2, /call/)(withTable('Criteria\n| --- |\ncall to action')).pass).toBe(false);
    expect(docTableShaped('Doc', 2, /missing/)(withTable('A | B\n| --- | --- |\nx | y')).pass).toBe(false);
  });
});
