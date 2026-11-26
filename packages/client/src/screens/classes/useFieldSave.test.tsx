import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassReaderSettings, ClassReaderSettingsPatch } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { ReaderSettingsCard } from './ReaderSettingsCard';

// Saves while one is still with the server (review of #199): typing is never lost, and the
// server ends with the last value the teacher gave.

afterEach(cleanup);

const C1 = '01JC1ASS0000000000000000L1';
const DEFAULT = 'Be kind.';
const envelope = (): Envelope => ({ client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null });
const defaults = { follow_ups_max: 3, pupil_budget_gbp: 0.5, safety_instruction: DEFAULT };

/** A server whose replies are sent by hand, in order; it keeps each patch when it replies. */
function manualApi() {
  const stored: { follow_ups_max: number | null; safety_instruction: string | null } = { follow_ups_max: null, safety_instruction: null };
  const waiting: ((ok: boolean) => void)[] = [];
  const view = (): ClassReaderSettings => ({
    ...defaults,
    follow_ups_max: stored.follow_ups_max ?? 3,
    safety_instruction: stored.safety_instruction ?? DEFAULT,
    defaults,
    set: { follow_ups_max: stored.follow_ups_max !== null, pupil_budget_gbp: false, safety_instruction: stored.safety_instruction !== null },
  });
  const setReaderSettings = vi.fn(
    (_id: string, patch: ClassReaderSettingsPatch) =>
      new Promise<ClassReaderSettings>((resolve, reject) =>
        waiting.push((ok) => {
          if (!ok) return reject(new Error('400'));
          Object.assign(stored, patch);
          resolve(view());
        }),
      ),
  );
  const api = { getReaderSettings: vi.fn(async () => view()), setReaderSettings } as unknown as SessionApi;
  const reply = (ok = true) => act(async () => waiting.shift()!(ok));
  return { api, setReaderSettings, reply, stored, waiting };
}

async function renderCard(api: SessionApi) {
  await act(async () => {
    render(<ReaderSettingsCard classId={C1} api={api} getEnvelope={envelope} />);
  });
  const card = screen.getByRole('region', { name: 'Pupil reader' });
  return { follow: within(card).getByLabelText('Follow-ups') as HTMLInputElement, box: within(card).getByLabelText('Safety instruction') as HTMLTextAreaElement };
}

const typeIn = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value } });
};
const leave = (el: HTMLElement) => act(async () => void fireEvent.blur(el));

describe('a box with a save in flight', () => {
  it('keeps what the teacher is typing when the earlier reply lands (safety instruction)', async () => {
    const { api, reply } = manualApi();
    const { box } = await renderCard(api);
    typeIn(box, 'A');
    await leave(box);
    typeIn(box, 'A and more');
    await reply();
    expect(box.value).toBe('A and more');
  });

  it('keeps what the teacher is typing when the earlier reply lands (follow-ups)', async () => {
    const { api, reply } = manualApi();
    const { follow } = await renderCard(api);
    typeIn(follow, '5');
    await leave(follow);
    typeIn(follow, '6');
    await reply();
    expect(follow.value).toBe('6');
  });

  it('sends the default back when the teacher puts it back before the reply (safety instruction)', async () => {
    const { api, setReaderSettings, reply, stored, waiting } = manualApi();
    const { box } = await renderCard(api);
    typeIn(box, 'A');
    await leave(box);
    typeIn(box, DEFAULT);
    await leave(box);
    while (waiting.length) await reply();
    expect(setReaderSettings.mock.calls.map((c) => c[1])).toEqual([{ safety_instruction: 'A' }, { safety_instruction: null }]);
    expect(stored.safety_instruction).toBeNull();
    expect(box.value).toBe(DEFAULT);
  });

  it('sends the default back when the teacher empties the box before the reply (follow-ups)', async () => {
    const { api, setReaderSettings, reply, stored, waiting } = manualApi();
    const { follow } = await renderCard(api);
    typeIn(follow, '5');
    await leave(follow);
    typeIn(follow, '');
    await leave(follow);
    while (waiting.length) await reply();
    expect(setReaderSettings.mock.calls.map((c) => c[1])).toEqual([{ follow_ups_max: 5 }, { follow_ups_max: null }]);
    expect(stored.follow_ups_max).toBeNull();
    expect(follow.value).toBe('3');
  });

  it('puts the server\'s value in once the teacher has left the box', async () => {
    const { api, reply } = manualApi();
    const { box } = await renderCard(api);
    typeIn(box, '  A  ');
    await leave(box);
    await reply();
    expect(box.value).toBe('A');
  });

  it('puts the last good value back when a refusal lands while the box only has focus, and sends nothing on blur', async () => {
    const { api, setReaderSettings, reply } = manualApi();
    const { follow } = await renderCard(api);
    typeIn(follow, '5');
    await leave(follow);
    fireEvent.focus(follow);
    await reply(false);
    expect(follow.value).toBe('3');
    expect(screen.getByRole('alert').textContent).toMatch(/last value is back/);
    await leave(follow);
    expect(setReaderSettings).toHaveBeenCalledOnce();
  });

  it('keeps the teacher\'s edits when a refusal lands, and says so', async () => {
    const { api, setReaderSettings, reply } = manualApi();
    const { box } = await renderCard(api);
    typeIn(box, 'A');
    await leave(box);
    typeIn(box, 'A and more');
    await reply(false);
    expect(box.value).toBe('A and more');
    expect(screen.getByRole('alert').textContent).toMatch(/your change is still in the box/);
    await leave(box);
    expect(setReaderSettings).toHaveBeenLastCalledWith(C1, { safety_instruction: 'A and more' }, envelope());
  });

  it('puts the saved (trimmed) text in when the reply lands while the box only has focus', async () => {
    const { api, reply } = manualApi();
    const { box } = await renderCard(api);
    typeIn(box, '  A  ');
    await leave(box);
    fireEvent.focus(box);
    await reply();
    expect(box.value).toBe('A');
  });
});
