import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import { PreferencesScreen } from './PreferencesScreen';

const envelope = { client_ts: '2026-11-12T09:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };

function setup(start: Preferences = { teacher_note: null, default_font: null }, setPreferences?: SessionApi['setPreferences']) {
  let saved = start;
  const api = {
    getPreferences: vi.fn(async () => saved),
    setPreferences: setPreferences ?? vi.fn(async (update: Partial<Preferences>) => (saved = { ...saved, ...update, ...(update.teacher_note !== undefined ? { teacher_note: update.teacher_note?.trim() || null } : {}) })),
  } as unknown as SessionApi;
  render(<PreferencesScreen api={api} getEnvelope={() => envelope} />);
  return api;
}

afterEach(cleanup);

describe('Preferences', () => {
  it('shows the note and the default font as saved', async () => {
    setup({ teacher_note: 'I teach P5.', default_font: 'lexend' });
    expect(await screen.findByRole('textbox', { name: 'About you' })).toHaveProperty('value', 'I teach P5.');
    expect(screen.getByRole('radio', { name: 'Lexend' })).toHaveProperty('checked', true);
  });

  it('with no default font set, Calibri (what a doc with no font is in) is chosen', async () => {
    setup();
    expect(await screen.findByRole('radio', { name: 'Calibri' })).toHaveProperty('checked', true);
  });

  it('saves the note when the box is left, and says so', async () => {
    const api = setup();
    const box = await screen.findByRole('textbox', { name: 'About you' });
    fireEvent.change(box, { target: { value: 'I teach P5 in Glasgow.' } });
    fireEvent.blur(box);
    await waitFor(() => expect(api.setPreferences).toHaveBeenCalledWith({ teacher_note: 'I teach P5 in Glasgow.' }, envelope));
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('saves a font at once; Calibri clears it', async () => {
    const api = setup({ teacher_note: null, default_font: 'lexend' });
    fireEvent.click(await screen.findByRole('radio', { name: 'Georgia' }));
    await waitFor(() => expect(api.setPreferences).toHaveBeenCalledWith({ default_font: 'georgia' }, envelope));
    fireEvent.click(screen.getByRole('radio', { name: 'Calibri' }));
    await waitFor(() => expect(api.setPreferences).toHaveBeenCalledWith({ default_font: null }, envelope));
    expect(screen.getByRole('radio', { name: 'Calibri' })).toHaveProperty('checked', true);
  });

  it('puts the font back and says so when it cannot be saved', async () => {
    setup({ teacher_note: null, default_font: 'lexend' }, vi.fn(async () => {
      throw new Error('offline');
    }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Arial' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be saved/);
    expect(screen.getByRole('radio', { name: 'Lexend' })).toHaveProperty('checked', true);
  });
});
