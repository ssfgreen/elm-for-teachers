import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/http';
import type { SessionApi } from '../../../api/participant';
import type { Envelope } from '../../../api/types';
import { featureApi } from '../../../state/features';
import type { TabOpener, TestPupilTab } from './openTestPupilTab';
import { ViewAsPupilButton } from './ViewAsPupilButton';

afterEach(cleanup);

const C1 = '01JC1ASS0000000000000000L1';
const envelope = () => ({ client_ts: 't', focus_pane: 'none', doc_id: null, thread_id: null }) as Envelope;

function world(answer: () => Promise<void> = async () => {}) {
  const viewAsPupil = vi.fn(answer);
  const api = { getClassCode: vi.fn(), setClassCode: vi.fn(), viewAsPupil } as unknown as SessionApi;
  const tab: TestPupilTab = { opener: 'teacher page', location: { href: 'about:blank' }, close: vi.fn() };
  const open = vi.fn(() => tab);
  return { api, viewAsPupil, tab, open, win: { open } as TabOpener };
}

const button = () => screen.queryByRole('button', { name: 'View as pupil' });

describe('ViewAsPupilButton', () => {
  it('shows for an open class with pupils on; not when archived, pupils off, or the make kit’s api', () => {
    const w = world();
    const { rerender } = render(<ViewAsPupilButton classId={C1} archived={false} api={w.api} getEnvelope={envelope} />);
    expect(button()).not.toBeNull();
    rerender(<ViewAsPupilButton classId={C1} archived api={w.api} getEnvelope={envelope} />);
    expect(button()).toBeNull();
    rerender(<ViewAsPupilButton classId={C1} archived={false} api={featureApi(w.api, { pupils: false })} getEnvelope={envelope} />);
    expect(button()).toBeNull();
    const makeKit = { getClassCode: vi.fn(), setClassCode: vi.fn() } as unknown as SessionApi;
    rerender(<ViewAsPupilButton classId={C1} archived={false} api={makeKit} getEnvelope={envelope} />);
    expect(button()).toBeNull();
  });

  it('opens the tab in the click, then sends it to /r with opener cleared', async () => {
    let release!: () => void;
    const w = world(() => new Promise<void>((r) => (release = r)));
    render(<ViewAsPupilButton classId={C1} archived={false} api={w.api} getEnvelope={envelope} win={w.win} />);
    act(() => {
      fireEvent.click(button()!);
    });
    // Opened synchronously, before the server answers.
    expect(w.open).toHaveBeenCalledTimes(1);
    expect(w.viewAsPupil).toHaveBeenCalledWith(C1, expect.objectContaining({ client_ts: 't' }));
    expect(w.tab.location.href).toBe('about:blank');
    await act(async () => release());
    expect(w.tab.opener).toBeNull();
    expect(w.tab.location.href).toBe('/r');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a refusal closes the tab and shows the message', async () => {
    const w = world(async () => {
      throw new ApiError(403, JSON.stringify({ code: 'feature_off' }));
    });
    render(<ViewAsPupilButton classId={C1} archived={false} api={w.api} getEnvelope={envelope} win={w.win} />);
    await act(async () => {
      fireEvent.click(button()!);
    });
    expect(w.tab.close).toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/switched off for this workspace/);
  });

  it('a second click while one is under way does nothing; it works again after', async () => {
    let release!: () => void;
    const w = world(() => new Promise<void>((r) => (release = r)));
    render(<ViewAsPupilButton classId={C1} archived={false} api={w.api} getEnvelope={envelope} win={w.win} />);
    act(() => {
      fireEvent.click(button()!);
      fireEvent.click(button()!);
    });
    expect(w.open).toHaveBeenCalledTimes(1);
    expect(w.viewAsPupil).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await act(async () => {
      fireEvent.click(button()!);
    });
    expect(w.viewAsPupil).toHaveBeenCalledTimes(2);
  });
});
