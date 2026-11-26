import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionRow } from '../api/types';
import { InteractionsSwitch, interactionsStatus } from './InteractionsSwitch';

afterEach(cleanup);

const row = (p: Partial<AdminSessionRow> = {}): AdminSessionRow => ({
  session_id: 'S1', label: 'Year 7', participant_token: 't', participant_url: 'u', access: 'link',
  access_code: null, first_opened_at: null, last_opened_at: null,
  created_at: '2026-11-10T09:00:00.000Z', updated_at: '2026-11-10T09:00:00.000Z',
  interactions_on: false, interactions_until: null, interactions_active: false, ...p,
});

describe('InteractionsSwitch', () => {
  it('says whether logging is on, until when, or that it ended', () => {
    expect(interactionsStatus(row())).toBe('Off');
    expect(interactionsStatus(row({ interactions_on: true, interactions_active: true }))).toBe('On');
    expect(interactionsStatus(row({ interactions_on: true, interactions_active: true, interactions_until: '2026-11-10T15:00:00.000Z' }))).toMatch(/^On until /);
    expect(interactionsStatus(row({ interactions_on: true, interactions_active: false, interactions_until: '2026-11-10T15:00:00.000Z' }))).toMatch(/^Off \(ended /);
  });

  it('turns it on for some hours, and off', async () => {
    const on = row({ interactions_on: true, interactions_active: true });
    const setInteractions = vi.fn().mockResolvedValueOnce(on).mockResolvedValueOnce(row());
    const onChanged = vi.fn();
    const { rerender } = render(<InteractionsSwitch api={{ setInteractions }} session={row()} onChanged={onChanged} />);
    const select = screen.getByLabelText('Interaction logging for Year 7');
    expect(screen.queryByRole('option', { name: 'Turn off' })).toBeNull();
    fireEvent.change(select, { target: { value: '8' } });
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(on));
    expect(setInteractions).toHaveBeenCalledWith('S1', true, 8);
    rerender(<InteractionsSwitch api={{ setInteractions }} session={on} onChanged={onChanged} />);
    fireEvent.change(select, { target: { value: 'off' } });
    await waitFor(() => expect(setInteractions).toHaveBeenLastCalledWith('S1', false, null));
  });

  it('turns it on until turned off, and says when the change failed', async () => {
    const setInteractions = vi.fn().mockRejectedValueOnce(new Error('network down'));
    render(<InteractionsSwitch api={{ setInteractions }} session={row()} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Interaction logging for Year 7'), { target: { value: 'forever' } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Not changed: network down');
    expect(setInteractions).toHaveBeenCalledWith('S1', true, null);
  });
});
