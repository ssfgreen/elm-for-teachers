import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAFETY_INSTRUCTION_MAX, type ClassReaderSettings, type ClassReaderSettingsPatch } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { decideSafetyCommit } from './readerSettings';
import { ReaderSettingsCard } from './ReaderSettingsCard';

afterEach(cleanup);

const C1 = '01JC1ASS0000000000000000L1';
const DEFAULT = 'Be kind, and ask nothing personal.';
const envelope = (): Envelope => ({ client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null });

/** A server that keeps the class's own text (null: the default), or refuses every save. */
function fakeApi(refuse = false) {
  let own: string | null = null;
  const defaults = { follow_ups_max: 3, pupil_budget_gbp: 0.5, safety_instruction: DEFAULT };
  const view = (): ClassReaderSettings => ({ ...defaults, safety_instruction: own ?? DEFAULT, defaults, set: { follow_ups_max: false, pupil_budget_gbp: false, safety_instruction: own !== null } });
  const setReaderSettings = vi.fn(async (_id: string, patch: ClassReaderSettingsPatch) => {
    if (refuse) throw new Error('400');
    if (patch.safety_instruction !== undefined) own = patch.safety_instruction;
    return view();
  });
  return { api: { getReaderSettings: vi.fn(async () => view()), setReaderSettings } as unknown as SessionApi, setReaderSettings };
}

async function renderBox(api: SessionApi) {
  await act(async () => {
    render(<ReaderSettingsCard classId={C1} api={api} getEnvelope={envelope} />);
  });
  const card = screen.getByRole('region', { name: 'Pupil reader' });
  return { card, box: within(card).getByLabelText('Safety instruction') as HTMLTextAreaElement, reset: within(card).getByRole('button', { name: 'Back to the default' }) as HTMLButtonElement };
}

async function type(box: HTMLTextAreaElement, value: string) {
  fireEvent.change(box, { target: { value } });
  await act(async () => {
    fireEvent.blur(box);
  });
}

describe('the safety instruction box', () => {
  it('shows the default, saves the class\'s own on blur, and goes back to the default', async () => {
    const { api, setReaderSettings } = fakeApi();
    const { card, box, reset } = await renderBox(api);
    expect(box.value).toBe(DEFAULT);
    expect(reset.disabled).toBe(true);

    await type(box, '  Only talk about the reading.  ');
    expect(setReaderSettings).toHaveBeenLastCalledWith(C1, { safety_instruction: 'Only talk about the reading.' }, envelope());
    expect(box.value).toBe('Only talk about the reading.');
    expect(within(card).getByText('(this class)')).toBeTruthy();
    expect(reset.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(reset);
    });
    expect(setReaderSettings).toHaveBeenLastCalledWith(C1, { safety_instruction: null }, envelope());
    expect(box.value).toBe(DEFAULT);
    expect(reset.disabled).toBe(true);
  });

  it('refuses an empty box with a message, without asking the server', async () => {
    const { api, setReaderSettings } = fakeApi();
    const { card, box } = await renderBox(api);
    await type(box, '   ');
    expect(setReaderSettings).not.toHaveBeenCalled();
    expect(box.value).toBe(DEFAULT);
    expect(within(card).getByRole('alert').textContent).toMatch(/cannot be empty/);
  });

  it('puts back the last good text when the server refuses', async () => {
    const { api } = fakeApi(true);
    const { card, box } = await renderBox(api);
    await type(box, 'Something new.');
    expect(box.value).toBe(DEFAULT);
    expect(within(card).getByRole('alert').textContent).toMatch(/Not saved/);
  });

  it('caps the box at the limit', async () => {
    const { box } = await renderBox(fakeApi().api);
    expect(box.maxLength).toBe(SAFETY_INSTRUCTION_MAX);
  });
});

describe('decideSafetyCommit', () => {
  it('does nothing for the same text, refuses empty and over-long, and treats the default text as the default', () => {
    expect(decideSafetyCommit(' a ', 'a', false, DEFAULT)).toEqual({ kind: 'none' });
    expect(decideSafetyCommit(' \n', 'a', false, DEFAULT)).toEqual({ kind: 'empty' });
    expect(decideSafetyCommit('x'.repeat(SAFETY_INSTRUCTION_MAX + 1), 'a', false, DEFAULT)).toEqual({ kind: 'long' });
    expect(decideSafetyCommit(` ${DEFAULT}`, 'a', false, DEFAULT)).toEqual({ kind: 'save', value: null });
    expect(decideSafetyCommit(' b ', 'a', true, DEFAULT)).toEqual({ kind: 'save', value: 'b' });
  });
});
