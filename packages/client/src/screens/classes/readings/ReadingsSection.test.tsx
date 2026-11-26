import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReaderPrompt, Reading, ReadingFields, ReadingPatch } from '@edw/shared';
import { ApiError } from '../../../api/http';
import type { ReadingsApi } from '../../../api/readings';
import { ReadingsSection } from './ReadingsSection';

const envelope = { client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const T = '2026-11-23T09:00:00.000Z';
const prompt = (id: string, label: string): ReaderPrompt => ({ id, label, instruction: 'x', after_highlight: true, follow_up: false });
const library = [prompt('p1', 'Explain'), prompt('p2', 'Simpler')];
const rain: Reading = { id: 'r1', class_id: 'C', doc_id: 'd1', name: 'Rain', prompt_ids: ['p1', 'p2'], follow_ups_max: null, created_at: T, updated_at: T };
const sources = [
  { doc_id: 'd2', name: 'Volcanoes', thread_title: 'Science', created_at: T },
  { doc_id: 'd1', name: 'Rain', thread_title: 'Weather', created_at: T },
];
const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'x', code }));

function setup(over: Partial<ReadingsApi> = {}) {
  const api: ReadingsApi = {
    listReadings: vi.fn(async () => [rain]),
    setReading: vi.fn(async (_c: string, f: ReadingFields) => ({ ...rain, id: 'r2', doc_id: f.doc_id, name: 'Volcanoes', prompt_ids: f.prompt_ids, follow_ups_max: f.follow_ups_max })),
    updateReading: vi.fn(async (_c: string, _id: string, p: ReadingPatch) => ({ ...rain, ...p })),
    removeReading: vi.fn(async () => undefined),
    listReadingSources: vi.fn(async () => sources),
    listReaderPrompts: vi.fn(async () => library),
    ...over,
  };
  render(<ReadingsSection classId="C" api={api} getEnvelope={() => envelope} />);
  return api;
}
const items = async () => within(await screen.findByRole('list', { name: 'Readings set' }));

afterEach(cleanup);

describe('Readings on a class page', () => {
  it('lists the readings with their prompts and follow-ups', async () => {
    setup();
    const item = within((await items()).getByRole('listitem', { name: 'Rain' }));
    expect(item.getByText('Prompts: Explain, Simpler')).toBeTruthy();
    expect(item.getByText('Follow-ups: Same as the class')).toBeTruthy();
  });

  it('sets a reading from a doc with every prompt ticked to start, and an override', async () => {
    const api = setup();
    await items();
    fireEvent.click(screen.getByRole('button', { name: 'Set a reading' }));
    const set = screen.getByRole('button', { name: 'Set reading' });
    expect((set as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: /Doc/ }), { target: { value: 'd2' } });
    expect(screen.getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Simpler' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Follow-ups/ }), { target: { value: '11' } });
    expect((set as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: /Follow-ups/ }), { target: { value: '2' } });
    fireEvent.click(set);
    await waitFor(() => expect(api.setReading).toHaveBeenCalledWith('C', { doc_id: 'd2', prompt_ids: ['p1'], follow_ups_max: 2 }, envelope));
    const item = within((await items()).getByRole('listitem', { name: 'Volcanoes' }));
    expect(item.getByText('Follow-ups: 2 follow-ups')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set reading' })).toBeNull();
  });

  it('will not set a reading with no prompt ticked', async () => {
    setup();
    await items();
    fireEvent.click(screen.getByRole('button', { name: 'Set a reading' }));
    fireEvent.change(screen.getByRole('combobox', { name: /Doc/ }), { target: { value: 'd2' } });
    for (const name of ['Explain', 'Simpler']) fireEvent.click(screen.getByRole('checkbox', { name }));
    expect(screen.getByText('Tick at least one prompt.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Set reading' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("edits a reading's ticks and override", async () => {
    const api = setup();
    fireEvent.click((await items()).getByRole('button', { name: 'Edit Rain' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Explain' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Follow-ups/ }), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateReading).toHaveBeenCalledWith('C', 'r1', { prompt_ids: ['p2'], follow_ups_max: 0 }, envelope));
    expect(await screen.findByText('Prompts: Simpler')).toBeTruthy();
    expect(screen.getByText('Follow-ups: 0 follow-ups')).toBeTruthy();
  });

  it('removes a reading only after a confirm', async () => {
    const api = setup();
    fireEvent.click((await items()).getByRole('button', { name: 'Remove Rain' }));
    expect(api.removeReading).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Rain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.removeReading).toHaveBeenCalledWith('C', 'r1', envelope));
    expect(await screen.findByText(/No readings yet/)).toBeTruthy();
  });

  it('shows why a reading was refused and keeps the form open', async () => {
    setup({ setReading: vi.fn(async () => Promise.reject(refused(409, 'class_archived'))) });
    await items();
    fireEvent.click(screen.getByRole('button', { name: 'Set a reading' }));
    fireEvent.change(screen.getByRole('combobox', { name: /Doc/ }), { target: { value: 'd2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set reading' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This class is archived, so it cannot have new readings.');
    expect(screen.getByRole('button', { name: 'Set reading' })).toBeTruthy();
  });

  it('reloads the prompts when one ticked has left the library', async () => {
    const listReaderPrompts = vi.fn(async () => library);
    setup({ listReaderPrompts, updateReading: vi.fn(async () => Promise.reject(refused(409, 'prompt_unavailable'))) });
    fireEvent.click((await items()).getByRole('button', { name: 'Edit Rain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/removed from the library/);
    await waitFor(() => expect(listReaderPrompts).toHaveBeenCalledTimes(2));
  });
  it('sends only the ticks still in the library after it reloads, and will not save with none left', async () => {
    const listReaderPrompts = vi.fn().mockResolvedValueOnce(library).mockResolvedValue([library[1]!]);
    const updateReading = vi.fn().mockRejectedValueOnce(refused(409, 'prompt_unavailable')).mockImplementation(async (_c: string, _id: string, p: ReadingPatch) => ({ ...rain, ...p }));
    setup({ listReaderPrompts, updateReading });
    fireEvent.click((await items()).getByRole('button', { name: 'Edit Rain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Explain' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateReading).toHaveBeenLastCalledWith('C', 'r1', { prompt_ids: ['p2'], follow_ups_max: null }, envelope));
  });

  it('will not save with every ticked prompt gone from the library', async () => {
    const listReaderPrompts = vi.fn().mockResolvedValueOnce(library).mockResolvedValue([prompt('p3', 'Other')]);
    const listReadings = vi.fn(async () => [{ ...rain, prompt_ids: ['p1'] }]);
    setup({ listReaderPrompts, listReadings, updateReading: vi.fn(async () => Promise.reject(refused(409, 'prompt_unavailable'))) });
    fireEvent.click((await items()).getByRole('button', { name: 'Edit Rain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Explain' })).toBeNull());
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('drops a chosen doc that has gone when the docs reload', async () => {
    const listReadingSources = vi.fn().mockResolvedValueOnce(sources).mockResolvedValueOnce(sources).mockResolvedValue([sources[1]!]);
    setup({ listReadingSources, setReading: vi.fn(async () => Promise.reject(refused(404, 'not_found'))) });
    await items();
    fireEvent.click(screen.getByRole('button', { name: 'Set a reading' }));
    await waitFor(() => expect(listReadingSources).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('combobox', { name: /Doc/ }), { target: { value: 'd2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set reading' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.queryByRole('option', { name: /Volcanoes/ })).toBeNull());
    expect((screen.getByRole('button', { name: 'Set reading' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
