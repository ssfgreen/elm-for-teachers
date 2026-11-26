import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPupilPage, TestPupilBanner } from './TestPupilBanner';

const api = vi.hoisted(() => ({ currentPupil: vi.fn(), signOutPupil: vi.fn() }));
vi.mock('./pupilApi', () => api);

const testPupil = { provider: 'teacher_test', test: true, classes: [{ class_id: 'C1', class_name: '8B', label: 'Test pupil' }] };

beforeEach(() => {
  api.currentPupil.mockResolvedValue(testPupil);
  api.signOutPupil.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderAt = async (path: string, closeTab = vi.fn()) => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <TestPupilBanner closeTab={closeTab} />
      </MemoryRouter>,
    );
  });
  return closeTab;
};
const banner = () => screen.queryByRole('region', { name: 'Test pupil' });

describe('TestPupilBanner', () => {
  it('shows for a test pupil on /r and /r/readings/x', async () => {
    await renderAt('/r');
    expect(banner()?.textContent).toContain('Test pupil (you)');
    cleanup();
    await renderAt('/r/readings/x');
    expect(banner()).not.toBeNull();
  });

  it('not for a real pupil, nobody signed in, or off the pupil pages', async () => {
    api.currentPupil.mockResolvedValue({ ...testPupil, provider: 'google', test: false });
    await renderAt('/r');
    expect(banner()).toBeNull();
    cleanup();
    api.currentPupil.mockResolvedValue(null);
    await renderAt('/r');
    expect(banner()).toBeNull();
    cleanup();
    api.currentPupil.mockResolvedValue(testPupil);
    await renderAt('/s/token');
    expect(banner()).toBeNull();
    expect(api.currentPupil).toHaveBeenCalledTimes(2);
    expect([isPupilPage('/r'), isPupilPage('/r/readings/1'), isPupilPage('/rx'), isPupilPage('/')]).toEqual([true, true, false, false]);
  });

  it('Back signs out, then closes the tab; if the tab stays, says it can be closed', async () => {
    const closeTab = await renderAt('/r');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back to teacher' }));
    });
    expect(api.signOutPupil).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(api.signOutPupil.mock.invocationCallOrder[0]!).toBeLessThan(closeTab.mock.invocationCallOrder[0]!);
    expect(screen.getByRole('status').textContent).toBe('Signed out. You can close this tab.');
  });

  it('a failed sign-out keeps the tab open and says so', async () => {
    api.signOutPupil.mockRejectedValue(new Error('offline'));
    const closeTab = await renderAt('/r');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back to teacher' }));
    });
    expect(closeTab).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/did not work/);
  });
});
