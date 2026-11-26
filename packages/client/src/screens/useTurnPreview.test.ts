import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { THREAD_ID, testBlock, testDoc } from '../test-utils';
import { useTurnPreview } from './useTurnPreview';

const D1 = '01JD0C00000000000000000001';
const D2 = '01JD0C00000000000000000002';
const A = '01ARZ3NDEKTSV4RRFFQ69G5FA1';
const snap = { blocks: [testBlock({ id: A, doc_id: D1, content: 'Intro' })], docs: [testDoc({ id: D1 }), testDoc({ id: D2 })] };
const raw = 'Draft.\n\n```json\n[{"op":"insert","after":"' + A + '","type":"paragraph","content":"New line"}]\n```';

describe('useTurnPreview', () => {
  it("previews a turn's edits in the doc it was sent from", () => {
    const { result } = renderHook(() => useTurnPreview(snap, { threadId: THREAD_ID, docId: D1 }));
    act(() => result.current.setDraft({ raw, threadId: THREAD_ID, docId: D1 }));
    expect(result.current.preview!.blocks.map((b) => b.content)).toContain('New line');
  });

  it('shows no preview, and so does not lock, another doc the teacher opened meanwhile', () => {
    const { result } = renderHook(() => useTurnPreview(snap, { threadId: THREAD_ID, docId: D2 }));
    act(() => result.current.setDraft({ raw, threadId: THREAD_ID, docId: D1 }));
    expect(result.current.preview).toBeNull();
  });
});
