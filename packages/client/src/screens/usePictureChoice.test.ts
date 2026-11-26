import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TurnPictureOffer } from '../components/PictureChoices';
import { DOC_ID, testBlock } from '../test-utils';
import { usePictureChoice } from './usePictureChoice';

const offer: TurnPictureOffer = {
  turn_id: 't1',
  block_id: 'IMG',
  alt: 'an apple',
  chosen: 2462,
  options: [
    { id: 2462, label: 'apple' },
    { id: 3203, label: 'apple tree' },
  ],
};
const snap = { docs: [], blocks: [testBlock({ id: 'IMG', type: 'image', status: 'proposed', doc_id: DOC_ID })] };

function setup() {
  const api = { choosePicture: vi.fn(() => Promise.resolve({ changes: { blocks: [], docs: [] }, asset_id: 'a' })) };
  const onDecision = vi.fn();
  const { result } = renderHook(() =>
    usePictureChoice({ api, getEnvelope: () => ({ client_ts: 'now', focus_pane: 'chat' }) as never, snap, setSnap: vi.fn(), keepNewerTyping: (c) => c, onDecision }),
  );
  return { api, onDecision, choose: result.current!.choose };
}

describe('usePictureChoice', () => {
  it('accepts the suggested block as it is when the picture already in it is chosen, without fetching it again', async () => {
    const { api, onDecision, choose } = setup();
    await choose(offer, 2462);
    expect(api.choosePicture).not.toHaveBeenCalled();
    expect(onDecision).toHaveBeenCalledWith({ decision: 'accept', block_id: 'IMG', doc_id: DOC_ID, mode: 'click' });
  });

  it('swaps in another picture through the server', async () => {
    const { api, onDecision, choose } = setup();
    await choose(offer, 3203);
    expect(api.choosePicture).toHaveBeenCalledWith('t1', 'IMG', 3203, expect.anything());
    expect(onDecision).not.toHaveBeenCalled();
  });
});
