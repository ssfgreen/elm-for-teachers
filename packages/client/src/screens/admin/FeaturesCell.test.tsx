import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FEATURES, FEATURE_NAMES } from '@edw/shared';
import type { AdminApi } from '../../api/admin';
import type { AdminSessionRow } from '../../api/types';
import type { CellContext } from './columns';
import { FeaturesCell, featuresSummary } from './FeaturesCell';
import { NewWorkspaceForm } from './NewWorkspaceForm';
import { useAdminSessions } from './useAdminSessions';

const row = (over: Partial<AdminSessionRow> = {}): AdminSessionRow => ({
  session_id: 'S1', label: 'Year 7', participant_token: 't', participant_url: 'http://site/s/t', access: 'link', access_code: 'ABCD-EFGH-JKMN', link_closed_at: null,
  first_opened_at: null, last_opened_at: null, interactions_on: false, interactions_until: null, interactions_active: false,
  features: { ...DEFAULT_FEATURES }, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
});

afterEach(cleanup);

/** The hook behind the real list, with the cell drawn from its first row. */
function listWith(setFeatures: AdminApi['setFeatures']) {
  const api = { listSessions: vi.fn(async () => [row()]), createSession: vi.fn(), renameSession: vi.fn(), setFeatures: vi.fn(setFeatures) };
  const hook = renderHook(() => useAdminSessions(api));
  const draw = () => {
    const ctx: CellContext = { api: {} as AdminApi, list: hook.result.current };
    return <FeaturesCell row={hook.result.current.sessions[0]!} ctx={ctx} />;
  };
  return { api, hook, draw };
}

describe('FeaturesCell', () => {
  it('has one tick per switch in the shared list, set as stored', () => {
    const ctx = { api: {} as AdminApi, list: { rename: vi.fn(), replace: vi.fn(), deleted: vi.fn(), setFeatures: vi.fn() } };
    render(<FeaturesCell row={row({ features: { ...DEFAULT_FEATURES, spyglass: false } })} ctx={ctx} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(FEATURE_NAMES.length);
    for (const name of FEATURE_NAMES) {
      expect((screen.getByRole('checkbox', { name: `${name} for Year 7` }) as HTMLInputElement).checked).toBe(name !== 'spyglass' && name !== 'pupils');
    }
    expect(screen.getByText("pupils: only matters when the site's PUPILS setting is on.")).toBeTruthy();
  });

  it('says in a few words which switches are off', () => {
    expect(featuresSummary(DEFAULT_FEATURES)).toBe('Off: pupils');
    expect(featuresSummary({ ...DEFAULT_FEATURES, pupils: true })).toBe('All on');
    expect(featuresSummary({ ...DEFAULT_FEATURES, classes: false })).toBe('Off: classes, pupils');
  });

  it('reads a row without switches as the defaults', () => {
    const ctx = { api: {} as AdminApi, list: { rename: vi.fn(), replace: vi.fn(), deleted: vi.fn(), setFeatures: vi.fn() } };
    const bare = row();
    delete bare.features;
    render(<FeaturesCell row={bare} ctx={ctx} />);
    expect((screen.getByRole('checkbox', { name: 'classes for Year 7' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'pupils for Year 7' }) as HTMLInputElement).checked).toBe(false);
  });

  it('saves a change through the hook and keeps what the server says', async () => {
    const { api, hook, draw } = listWith(async () => row({ features: { ...DEFAULT_FEATURES, pupils: true } }));
    await waitFor(() => expect(hook.result.current.sessions).toHaveLength(1));
    const view = render(draw());
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'pupils for Year 7' }));
    });
    expect(api.setFeatures).toHaveBeenCalledWith('S1', { pupils: true });
    view.rerender(draw());
    expect((screen.getByRole('checkbox', { name: 'pupils for Year 7' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('puts the tick back and says so when the save is refused', async () => {
    const { hook, draw } = listWith(async () => Promise.reject(new Error('boom')));
    await waitFor(() => expect(hook.result.current.sessions).toHaveLength(1));
    const view = render(draw());
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'classes for Year 7' }));
    });
    view.rerender(draw());
    expect((screen.getByRole('checkbox', { name: 'classes for Year 7' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Not saved: boom');
  });
});

describe('FeaturesCell: one save at a time', () => {
  it('holds the ticks while a save is answered, then lets them go', async () => {
    let answer: (r: string | null) => void = () => {};
    const setFeatures = vi.fn(() => new Promise<string | null>((r) => (answer = r)));
    const ctx = { api: {} as AdminApi, list: { rename: vi.fn(), replace: vi.fn(), deleted: vi.fn(), setFeatures } };
    render(<FeaturesCell row={row()} ctx={ctx} />);
    const classes = () => screen.getByRole('checkbox', { name: 'classes for Year 7' }) as HTMLInputElement;
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'spyglass for Year 7' }));
    });
    expect(classes().disabled).toBe(true);
    await act(async () => {
      answer(null);
    });
    expect(classes().disabled).toBe(false);
  });
});

describe('NewWorkspaceForm: feature ticks', () => {
  it('start at their defaults, pupils unticked, and go with the new workspace', async () => {
    const onCreate = vi.fn(async () => true);
    render(<NewWorkspaceForm onCreate={onCreate} created={null} />);
    for (const name of FEATURE_NAMES) expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(DEFAULT_FEATURES[name]);
    expect(screen.getByText(/only matters when the site's PUPILS setting is on/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Year 8' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'pupils' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'plugins' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    });
    expect(onCreate).toHaveBeenCalledWith('Year 8', true, { ...DEFAULT_FEATURES, pupils: true, plugins: false });
  });
});
