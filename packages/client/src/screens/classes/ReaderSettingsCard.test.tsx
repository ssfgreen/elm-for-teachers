import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassReaderSettings, ClassReaderSettingsPatch, ClassSummary, YearGroup } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { ClassSidebar } from './ClassSidebar';
import { ReaderSettingsCard } from './ReaderSettingsCard';
import { takeField } from './useReaderSettings';
import type { Classes } from './useClasses';

afterEach(cleanup);

const C1 = '01JC1ASS0000000000000000L1';
const envelope = (): Envelope => ({ client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null });
const defaults = { follow_ups_max: 3, pupil_budget_gbp: 0.5, safety_instruction: 'Be kind.' };
const unset: ClassReaderSettings = { ...defaults, defaults, set: { follow_ups_max: false, pupil_budget_gbp: false, safety_instruction: false } };

/** A server that keeps the values, or refuses every save. */
function fakeApi(refuse = false) {
  let stored: { follow_ups_max: number | null; pupil_budget_gbp: number | null } = { follow_ups_max: null, pupil_budget_gbp: null };
  const view = (): ClassReaderSettings => ({
    follow_ups_max: stored.follow_ups_max ?? defaults.follow_ups_max,
    pupil_budget_gbp: stored.pupil_budget_gbp ?? defaults.pupil_budget_gbp,
    safety_instruction: defaults.safety_instruction,
    defaults,
    set: { follow_ups_max: stored.follow_ups_max !== null, pupil_budget_gbp: stored.pupil_budget_gbp !== null, safety_instruction: false },
  });
  const setReaderSettings = vi.fn(async (_id: string, patch: ClassReaderSettingsPatch) => {
    if (refuse) throw new Error('400');
    stored = { ...stored, ...patch };
    return view();
  });
  return { api: { getReaderSettings: vi.fn(async () => view()), setReaderSettings } as unknown as SessionApi, setReaderSettings };
}

async function renderCard(api: SessionApi) {
  await act(async () => {
    render(<ReaderSettingsCard classId={C1} api={api} getEnvelope={envelope} />);
  });
  const card = screen.getByRole('region', { name: 'Pupil reader' });
  return { card, follow: within(card).getByLabelText('Follow-ups') as HTMLInputElement, budget: within(card).getByLabelText('Pupil budget') as HTMLInputElement };
}

async function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    fireEvent.blur(input);
  });
}

describe('ReaderSettingsCard', () => {
  it("shows config's values marked (default) for a class that has not set them", async () => {
    const { card, follow, budget } = await renderCard(fakeApi().api);
    expect(follow.value).toBe('3');
    expect(budget.value).toBe('£0.50');
    expect(within(card).getAllByText('(default)')).toHaveLength(3); // the two numbers and the safety instruction
  });

  it('saves a value as it changes, and an empty box goes back to the default', async () => {
    const { api, setReaderSettings } = fakeApi();
    const { card, follow, budget } = await renderCard(api);
    await type(budget, '75p');
    expect(setReaderSettings).toHaveBeenLastCalledWith(C1, { pupil_budget_gbp: 0.75 }, envelope());
    expect(budget.value).toBe('£0.75');
    expect(within(card).getAllByText('(default)')).toHaveLength(2);

    await type(follow, '0');
    expect(setReaderSettings).toHaveBeenLastCalledWith(C1, { follow_ups_max: 0 }, envelope());
    expect(within(card).getAllByText('(default)')).toHaveLength(1); // the safety instruction's

    await type(budget, '');
    expect(setReaderSettings).toHaveBeenLastCalledWith(C1, { pupil_budget_gbp: null }, envelope());
    expect(budget.value).toBe('£0.50');
    expect(within(card).getAllByText('(default)')).toHaveLength(2);
  });

  it('does not save when nothing changed', async () => {
    const { api, setReaderSettings } = fakeApi();
    const { follow, budget } = await renderCard(api);
    await type(follow, ' 3 ');
    await type(budget, '');
    expect(setReaderSettings).not.toHaveBeenCalled();
  });

  it('puts back the last good value for a value out of limits, without asking the server', async () => {
    const { api, setReaderSettings } = fakeApi();
    const { card, budget } = await renderCard(api);
    await type(budget, '£9');
    expect(setReaderSettings).not.toHaveBeenCalled();
    expect(budget.value).toBe('£0.50');
    expect(within(card).getByRole('alert').textContent).toMatch(/£0 to £5/);
  });

  it('puts back the last good value when the server refuses', async () => {
    const { api, setReaderSettings } = fakeApi(true);
    const { card, follow } = await renderCard(api);
    await type(follow, '5');
    expect(setReaderSettings).toHaveBeenCalledOnce();
    expect(follow.value).toBe('3');
    expect(within(card).getAllByText('(default)')).toHaveLength(3);
    expect(within(card).getByRole('alert').textContent).toMatch(/Not saved/);
  });

  it('ends with the server holding what the box shows, whatever order the server handles saves in', async () => {
    // The server writes when it handles a request, not when the request is sent.
    let stored = 3;
    const unhandled: (() => void)[] = [];
    const view = (): ClassReaderSettings => ({ ...unset, follow_ups_max: stored, set: { ...unset.set, follow_ups_max: true } });
    const setReaderSettings = vi.fn(
      (_id: string, patch: ClassReaderSettingsPatch) =>
        new Promise<ClassReaderSettings>((resolve) =>
          unhandled.push(() => {
            stored = patch.follow_ups_max!;
            resolve(view());
          }),
        ),
    );
    const api = { getReaderSettings: vi.fn(async () => unset), setReaderSettings } as unknown as SessionApi;
    const { follow } = await renderCard(api);
    await type(follow, '5');
    await type(follow, '6');
    await type(follow, '7');
    // Newest request first, until none is left.
    while (unhandled.length) await act(async () => unhandled.pop()!());
    expect(String(stored)).toBe(follow.value);
    expect(follow.value).toBe('7');
    // One at a time: 5, then only the newest of the values waiting behind it.
    expect(setReaderSettings.mock.calls.map((c) => c[1])).toEqual([{ follow_ups_max: 5 }, { follow_ups_max: 7 }]);
  });

  it("shows the server's value when the latest save is refused after an earlier one landed", async () => {
    let stored: number | null = null;
    const pending: (() => void)[] = [];
    const view = (): ClassReaderSettings => ({ ...unset, follow_ups_max: stored ?? 3, set: { ...unset.set, follow_ups_max: stored !== null } });
    const api = {
      getReaderSettings: vi.fn(async () => view()),
      setReaderSettings: vi.fn((_id: string, patch: ClassReaderSettingsPatch) => {
        const first = pending.length === 0;
        return new Promise<ClassReaderSettings>((resolve, reject) =>
          pending.push(() => {
            if (!first) return reject(new Error('400'));
            stored = patch.follow_ups_max!;
            resolve(view());
          }),
        );
      }),
    } as unknown as SessionApi;
    const { card, follow } = await renderCard(api);
    await type(follow, '5');
    await type(follow, '6');
    await act(async () => pending[0]!());
    await act(async () => pending[1]!());
    expect(follow.value).toBe('5');
    expect(within(card).getAllByText('(default)')).toHaveLength(2);
    expect(within(card).getByRole('alert').textContent).toMatch(/Not saved/);
  });

  it('draws nothing for an api without the settings', async () => {
    await act(async () => {
      render(<ReaderSettingsCard classId={C1} api={{} as SessionApi} getEnvelope={envelope} />);
    });
    expect(screen.queryByRole('region', { name: 'Pupil reader' })).toBeNull();
  });
});

describe('takeField', () => {
  it("takes only the saved field from a reply, so an older reply cannot undo another field's save", () => {
    const now: ClassReaderSettings = { ...unset, follow_ups_max: 5, set: { ...unset.set, follow_ups_max: true } };
    const reply: ClassReaderSettings = { ...unset, pupil_budget_gbp: 1, set: { ...unset.set, pupil_budget_gbp: true } };
    expect(takeField(now, reply, 'pupil_budget_gbp')).toEqual({ ...unset, follow_ups_max: 5, pupil_budget_gbp: 1, set: { ...unset.set, follow_ups_max: true, pupil_budget_gbp: true } });
  });
});

describe('ClassSidebar', () => {
  it('has the Pupil reader card after Curriculum and before What is kept', async () => {
    const cls = { id: C1, name: 'P7A', stage: null, subject: null, note: null, year_group_id: 'y' } as ClassSummary;
    const api = { ...fakeApi().api, getClass: vi.fn(async () => ({ class: cls, year_group: null, pupils: [], adaptations: [], curriculum: [] })) } as unknown as SessionApi;
    await act(async () => {
      render(<ClassSidebar cls={cls} yearGroups={[{ id: 'y', name: 'P7' } as YearGroup]} update={vi.fn()} classes={{ refresh: vi.fn() } as unknown as Classes} api={api} getEnvelope={envelope} composer={null} />);
    });
    const names = within(screen.getByRole('complementary', { name: 'About the class' }))
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(names.slice(-3)).toEqual(['Curriculum', 'Pupil reader', 'What is kept']);
  });
});
