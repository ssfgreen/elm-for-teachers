/** The `pupils` switch on the class page (#212): off hides the reader card, Readings and the class code. */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassReaderSettings, ClassSummary } from '@edw/shared';
import type { ClassDetail } from '../../../api/classes';
import type { SessionApi } from '../../../api/participant';
import type { Envelope } from '../../../api/types';
import { featureApi } from '../../../state/features';
import { ClassLists } from '../ClassLists';
import { ClassSidebar } from '../ClassSidebar';
import type { Classes } from '../useClasses';

afterEach(cleanup);

const C1 = '01JC1ASS0000000000000000L1';
const Y7 = '01JYEAR00000000000000000L1';
const cls = { id: C1, name: 'P7A', stage: 'Primary 7', subject: null, note: null, year_group_id: Y7, archived_at: null } as unknown as ClassSummary;
const classes = { refresh: vi.fn(async () => undefined) } as unknown as Classes;
const envelope = () => ({}) as Envelope;

function fullApi(): SessionApi {
  const detail = { class: cls, year_group: null, pupils: [], adaptations: [], curriculum: [] } as unknown as ClassDetail;
  const settings = {
    follow_ups_max: 3,
    pupil_budget_gbp: 0.5,
    safety_instruction: 'Be kind.',
    defaults: { follow_ups_max: 3, pupil_budget_gbp: 0.5, safety_instruction: 'Be kind.' },
    set: { follow_ups_max: false, pupil_budget_gbp: false, safety_instruction: false },
  } as unknown as ClassReaderSettings;
  return {
    sessionId: 's1',
    getClass: vi.fn(async () => detail),
    listReadings: vi.fn(async () => []),
    setReading: vi.fn(),
    updateReading: vi.fn(),
    removeReading: vi.fn(),
    listReadingSources: vi.fn(async () => []),
    listReaderPrompts: vi.fn(async () => []),
    getReaderSettings: vi.fn(async () => settings),
    setReaderSettings: vi.fn(),
    getClassCode: vi.fn(async () => null),
    setClassCode: vi.fn(),
  } as unknown as SessionApi;
}

async function renderPage(pupils: boolean) {
  const api = featureApi(fullApi(), { pupils });
  await act(async () => {
    render(
      <>
        <ClassLists cls={cls} otherClasses={[]} classes={classes} chats={[]} api={api} getEnvelope={envelope} onOpenChat={vi.fn()} />
        <ClassSidebar cls={cls} yearGroups={[]} update={vi.fn(async () => undefined)} classes={classes} api={api} getEnvelope={envelope} composer={null} />
      </>,
    );
  });
}

const shown = (name: string) => screen.queryByRole('region', { name }) !== null;

describe('the pupils switch on the class page', () => {
  it('off: no Pupil reader card, no Readings, no Class code', async () => {
    await renderPage(false);
    expect(shown('Class details')).toBe(true);
    expect(shown('Pupil reader')).toBe(false);
    expect(shown('Readings')).toBe(false);
    expect(shown('Class code')).toBe(false);
  });

  it('on: all three, the code card above the reader card', async () => {
    await renderPage(true);
    expect(shown('Pupil reader')).toBe(true);
    expect(shown('Readings')).toBe(true);
    expect(shown('Class code')).toBe(true);
    const code = screen.getByRole('region', { name: 'Class code' });
    const reader = screen.getByRole('region', { name: 'Pupil reader' });
    expect(code.compareDocumentPosition(reader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
