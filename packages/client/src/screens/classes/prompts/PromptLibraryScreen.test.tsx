import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReaderPrompt, ReaderPromptFields, ReaderPromptPatch } from '@edw/shared';
import { ApiError } from '../../../api/http';
import type { PromptLibraryApi } from './api';
import { PromptLibraryScreen } from './PromptLibraryScreen';

const envelope = { client_ts: '2026-11-23T09:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };
const explain: ReaderPrompt = { id: 'p1', label: 'Explain', instruction: 'Explain this to a student aged 9.', after_highlight: true, follow_up: false };
const lost: ReaderPrompt = { id: 'p2', label: "I don't understand", instruction: 'Add more detail with an example.', after_highlight: false, follow_up: true };
const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'x', code }));

function setup(over: Partial<PromptLibraryApi> = {}) {
  const api: PromptLibraryApi = {
    list: vi.fn(async () => [explain, lost]),
    add: vi.fn(async (f: ReaderPromptFields) => ({ id: 'p3', ...f })),
    edit: vi.fn(async (id: string, patch: ReaderPromptPatch) => ({ ...[explain, lost].find((p) => p.id === id)!, ...patch })),
    remove: vi.fn(async () => undefined),
    reorder: vi.fn(async (ids: string[]) => ids.map((id) => [explain, lost].find((p) => p.id === id)!)),
    ...over,
  };
  render(<PromptLibraryScreen api={api} getEnvelope={() => envelope} />);
  return api;
}
const list = async () => within(await screen.findByRole('list', { name: 'Prompts' }));
const labels = async () => (await list()).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));

afterEach(cleanup);

describe('Prompt library', () => {
  it('lists the prompts in order with their instructions and ticks', async () => {
    setup();
    expect(await labels()).toEqual(['Explain', "I don't understand"]);
    const card = within((await list()).getByRole('listitem', { name: 'Explain' }));
    expect(card.getByText('Explain this to a student aged 9.')).toBeTruthy();
    expect((card.getByRole('checkbox', { name: 'After a highlight' }) as HTMLInputElement).checked).toBe(true);
    expect((card.getByRole('checkbox', { name: 'As a follow-up' }) as HTMLInputElement).checked).toBe(false);
  });

  it('adds a prompt with its ticks, and empties the form', async () => {
    const api = setup();
    await list();
    const form = within(screen.getByRole('region', { name: 'Add a prompt' }));
    fireEvent.change(form.getByRole('textbox', { name: 'Button pupils see' }), { target: { value: ' Picture it ' } });
    fireEvent.change(form.getByRole('textbox', { name: /Instruction to the assistant/ }), { target: { value: 'Describe a picture.' } });
    fireEvent.click(form.getByRole('checkbox', { name: 'As a follow-up' }));
    fireEvent.click(form.getByRole('button', { name: 'Add prompt' }));
    await waitFor(() => expect(api.add).toHaveBeenCalledWith({ label: 'Picture it', instruction: 'Describe a picture.', after_highlight: true, follow_up: true }, envelope));
    await waitFor(async () => expect(await labels()).toEqual(['Explain', "I don't understand", 'Picture it']));
    expect((form.getByRole('textbox', { name: 'Button pupils see' }) as HTMLInputElement).value).toBe('');
  });

  it('saves a tick as soon as it changes, and edits the wording', async () => {
    const api = setup();
    const card = within((await list()).getByRole('listitem', { name: 'Explain' }));
    fireEvent.click(card.getByRole('checkbox', { name: 'As a follow-up' }));
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('p1', { follow_up: true }, envelope));
    fireEvent.click(card.getByRole('button', { name: 'Edit' }));
    fireEvent.change(card.getByRole('textbox', { name: 'Button pupils see' }), { target: { value: 'Tell me more' } });
    fireEvent.click(card.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.edit).toHaveBeenLastCalledWith('p1', { label: 'Tell me more', instruction: explain.instruction }, envelope));
    await waitFor(async () => expect(await labels()).toEqual(['Tell me more', "I don't understand"]));
  });

  it('shows a tick at once while it saves, and takes it back when the server refuses', async () => {
    let fail: (e: Error) => void = () => undefined;
    setup({ edit: vi.fn(() => new Promise<ReaderPrompt>((_, reject) => (fail = reject))) });
    const box = within((await list()).getByRole('listitem', { name: 'Explain' })).getByRole('checkbox', { name: 'As a follow-up' }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fail(new Error('offline'));
    await waitFor(() => expect(box.checked).toBe(false));
    expect((await screen.findByRole('alert')).textContent).toBe('That change could not be saved. Please try again.');
  });

  it('takes back only the refused tick, keeping a later one the server saved', async () => {
    let failFirst: (e: Error) => void = () => undefined;
    const edit = vi.fn((id: string, patch: ReaderPromptPatch) =>
      patch.follow_up !== undefined ? new Promise<ReaderPrompt>((_, reject) => (failFirst = reject)) : Promise.resolve({ ...explain, ...patch, follow_up: false }),
    );
    setup({ edit });
    const card = within((await list()).getByRole('listitem', { name: 'Explain' }));
    const follow = card.getByRole('checkbox', { name: 'As a follow-up' }) as HTMLInputElement;
    const highlight = card.getByRole('checkbox', { name: 'After a highlight' }) as HTMLInputElement;
    fireEvent.click(follow);
    fireEvent.click(highlight);
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(highlight.checked).toBe(false));
    failFirst(new Error('offline'));
    await waitFor(() => expect(follow.checked).toBe(false));
    expect(highlight.checked).toBe(false);
  });

  it('tick then untick, both refused: the box ends as the server has it', async () => {
    const refusals: ((e: Error) => void)[] = [];
    const edit = vi.fn(() => new Promise<ReaderPrompt>((_, reject) => refusals.push(reject)));
    setup({ edit });
    const box = within((await list()).getByRole('listitem', { name: 'Explain' })).getByRole('checkbox', { name: 'As a follow-up' }) as HTMLInputElement;
    fireEvent.click(box);
    fireEvent.click(box);
    await waitFor(() => expect(refusals.length).toBeGreaterThan(0));
    for (const fail of refusals.splice(0)) fail(new Error('offline'));
    await waitFor(() => expect(box.disabled).toBe(false));
    for (const fail of refusals.splice(0)) fail(new Error('offline'));
    await waitFor(() => expect(box.checked).toBe(false));
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('moves a prompt down, and puts it back when the server refuses', async () => {
    const api = setup();
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Move Explain down' }));
    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith(['p2', 'p1'], envelope));
    await waitFor(async () => expect(await labels()).toEqual(["I don't understand", 'Explain']));
    expect((screen.getByRole('button', { name: "Move I don't understand up" }) as HTMLButtonElement).disabled).toBe(true);

    vi.mocked(api.reorder).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Move Explain up' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'That change could not be saved. Please try again.');
    expect(await labels()).toEqual(["I don't understand", 'Explain']);
  });

  it('a refused move keeps a tick saved meanwhile', async () => {
    let refuse: (e: Error) => void = () => undefined;
    const api = setup({ reorder: vi.fn(() => new Promise<ReaderPrompt[]>((_, reject) => (refuse = reject))) });
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Move Explain down' }));
    const box = () => within(screen.getByRole('listitem', { name: 'Explain' })).getByRole('checkbox', { name: 'As a follow-up' }) as HTMLInputElement;
    fireEvent.click(box());
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('p1', { follow_up: true }, envelope));
    await waitFor(() => expect(box().disabled).toBe(false));
    refuse(new Error('offline'));
    await waitFor(async () => expect(await labels()).toEqual(['Explain', "I don't understand"]));
    expect(box().checked).toBe(true);
  });

  it("a move's reply keeps a tick saved meanwhile, and a prompt added meanwhile", async () => {
    let answer: (p: ReaderPrompt[]) => void = () => undefined;
    // The server's reply to the move was made before the tick and the new prompt reached it.
    setup({ reorder: vi.fn(() => new Promise<ReaderPrompt[]>((resolve) => (answer = resolve))) });
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Move Explain down' }));
    const box = () => within(screen.getByRole('listitem', { name: 'Explain' })).getByRole('checkbox', { name: 'As a follow-up' }) as HTMLInputElement;
    fireEvent.click(box());
    await waitFor(() => expect(box().disabled).toBe(false));
    const form = within(screen.getByRole('region', { name: 'Add a prompt' }));
    fireEvent.change(form.getByRole('textbox', { name: 'Button pupils see' }), { target: { value: 'New' } });
    fireEvent.change(form.getByRole('textbox', { name: /Instruction to the assistant/ }), { target: { value: 'New.' } });
    fireEvent.click(form.getByRole('button', { name: 'Add prompt' }));
    await waitFor(async () => expect(await labels()).toEqual(["I don't understand", 'Explain', 'New']));
    answer([lost, explain]);
    await waitFor(() => expect(box().checked).toBe(true));
    expect(await labels()).toEqual(["I don't understand", 'Explain', 'New']);
  });

  it('asks before removing a prompt', async () => {
    const api = setup();
    await list();
    fireEvent.click(screen.getByRole('button', { name: "Remove I don't understand" }));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('p2', envelope));
    await waitFor(async () => expect(await labels()).toEqual(['Explain']));
  });

  it('says when the library is full', async () => {
    setup({ add: vi.fn(async () => Promise.reject(refused(409, 'too_many_prompts'))) });
    await list();
    const form = within(screen.getByRole('region', { name: 'Add a prompt' }));
    fireEvent.change(form.getByRole('textbox', { name: 'Button pupils see' }), { target: { value: 'More' } });
    fireEvent.change(form.getByRole('textbox', { name: /Instruction to the assistant/ }), { target: { value: 'More.' } });
    fireEvent.click(form.getByRole('button', { name: 'Add prompt' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/30 prompts at most/);
  });
});
