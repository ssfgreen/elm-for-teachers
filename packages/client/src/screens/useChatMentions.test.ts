import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SchoolClass } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import { useChatMentions } from './useChatMentions';

const api = {} as SessionApi;

describe('useChatMentions', () => {
  it("opens a code in the Curriculum screen in a class's chat", () => {
    const setView = vi.fn();
    const { result } = renderHook(() => useChatMentions(api, { id: 'c1', name: 'P7A' } as SchoolClass, setView));
    result.current.openCurriculum?.('LIT 2-13a');
    expect(setView).toHaveBeenCalledWith({ kind: 'curriculum', classId: 'c1', code: 'LIT 2-13a' });
  });

  it('opens the ideas aligned to a code in a chat with no class', () => {
    const setView = vi.fn();
    const { result } = renderHook(() => useChatMentions(api, undefined, setView));
    result.current.openCurriculum?.('LIT 2-13a');
    expect(setView).toHaveBeenCalledWith({ kind: 'pedagogy', alignsTo: ['cur-CUR-lit-2-13a'], code: 'LIT 2-13a' });
  });
});
