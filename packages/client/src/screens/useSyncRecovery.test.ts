import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasSnapshot } from '../editor/types';
import { mockLogger } from '../test-utils';
import { useSyncRecovery } from './useSyncRecovery';

const snap: CanvasSnapshot = { blocks: [], docs: [] };

function setup(getCanvas: () => Promise<CanvasSnapshot>) {
  const deps = { api: { getCanvas: vi.fn(getCanvas) }, logger: mockLogger(), forgetTyping: vi.fn(), setSnap: vi.fn(), setEpoch: vi.fn(), setLoadError: vi.fn() };
  const { result } = renderHook(() => useSyncRecovery(deps));
  return { deps, recover: (err: unknown) => result.current(err) };
}

describe('useSyncRecovery', () => {
  it('reloads once for refusals that come together, logging each', async () => {
    let answer!: (s: CanvasSnapshot) => void;
    const { deps, recover } = setup(() => new Promise((r) => (answer = r)));
    act(() => {
      recover(new Error('one'));
      recover(new Error('two'));
    });
    expect(deps.api.getCanvas).toHaveBeenCalledTimes(1);
    expect(deps.logger.log).toHaveBeenCalledTimes(2);
    await act(async () => answer(snap));
    expect(deps.setEpoch).toHaveBeenCalledTimes(1);
    // Once that reload is done, a new refusal reloads again.
    act(() => recover(new Error('three')));
    expect(deps.api.getCanvas).toHaveBeenCalledTimes(2);
  });

  it('says the doc could not be loaded only until a reload works', async () => {
    const answers = [Promise.reject(new Error('offline')), Promise.resolve(snap)];
    const { deps, recover } = setup(() => answers.shift()!);
    await act(async () => recover(new Error('one')));
    expect(deps.setLoadError).toHaveBeenLastCalledWith(true);
    await act(async () => recover(new Error('two')));
    expect(deps.setLoadError).toHaveBeenLastCalledWith(false);
  });
});
