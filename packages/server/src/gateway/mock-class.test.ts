import { describe, expect, it } from 'vitest';
import type { CurriculumItem, Pupil, SchoolClass } from '@edw/shared';
import { classMessage } from './class-message.js';
import { mockClassMentions } from './mock-class.js';

const pupil = (number: number, label: string, extra: Partial<Pupil> = {}): Pupil =>
  ({ id: `p${number}`, class_id: 'c1', number, label, needs: [], helps: null, working_at: null, note: null, ...extra, position: number, created_at: '2026-11-12T00:00:00.000Z', archived_at: null }) as Pupil;
const cls = { id: 'c1', name: 'P7A', stage: 'P7', subject: null, note: null } as unknown as SchoolClass;
const now = { id: 'i1', code: 'LIT 2-16a', text: 'To show my understanding…', status: 'now' } as CurriculumItem;

describe('the mock in a class chat', () => {
  it('names the first pupil with something noted and the code the class is on now, read from the real class message', () => {
    const { text } = classMessage(cls, null, [pupil(1, 'brave-kettle', { needs: ['Dyslexia'], working_at: 'Grade B' }), pupil(2, 'tidy-puffin', { note: 'Dyslexic.' })], true, { curriculum: [now] });
    expect(mockClassMentions([{ role: 'developer', content: text }])).toBe('\n\nFor tidy-puffin, it keeps to what the class is working on now, LIT 2-16a.');
  });
  it('says nothing outside a class chat, or with nothing to name', () => {
    expect(mockClassMentions([{ role: 'developer', content: '## Pedagogy library' }])).toBe('');
    const { text } = classMessage(cls, null, [pupil(1, 'tidy-puffin', { note: 'Dyslexic.' })], true);
    expect(mockClassMentions([{ role: 'developer', content: text }])).toBe('');
  });
});
