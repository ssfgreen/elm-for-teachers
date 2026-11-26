import { describe, expect, it } from 'vitest';
import type { Pupil } from '@edw/shared';
import { cellChange, cellText, looksLikeName } from './pupilFields';

const p: Pupil = {
  id: '01JC0000000000000000000003',
  class_id: '01JC0000000000000000000002',
  number: 1,
  label: 'tidy-puffin',
  needs: ['Dyslexia', 'Working memory'],
  helps: 'Amber overlay',
  working_at: 'Grade C',
  note: null,
  position: 0,
  created_at: '2026-11-12T09:00:00.000Z',
  archived_at: null,
};

describe('pupil cells', () => {
  it('reads each cell as text', () => {
    expect(cellText(p, 'helps')).toBe('Amber overlay');
    expect(cellText(p, 'note')).toBe('');
  });

  it('changes only what was edited, clears an emptied cell and never the label', () => {
    expect(cellChange(p, 'helps', '  ')).toEqual({ helps: null });
    expect(cellChange(p, 'helps', 'Amber overlay ')).toBeNull();
    // A note is sent alone: never the hidden needs or working_at (#243).
    expect(cellChange(p, 'note', 'Dyslexic. Reads slowly.')).toEqual({ note: 'Dyslexic. Reads slowly.' });
    expect(cellChange(p, 'label', ' ')).toBeNull();
    expect(cellChange(p, 'label', 'my-code-4')).toEqual({ label: 'my-code-4' });
  });

  it('flags a label that looks like a name', () => {
    expect(looksLikeName('Callum Reid')).toBe(true);
    expect(looksLikeName('Isla')).toBe(true);
    expect(looksLikeName('tidy-puffin')).toBe(false);
    expect(looksLikeName('P7-04')).toBe(false);
    expect(looksLikeName('CR')).toBe(false);
  });
});
