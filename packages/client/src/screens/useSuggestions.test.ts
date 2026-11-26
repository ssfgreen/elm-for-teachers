/** One card selected at a time: picking a suggestion lets go of the selected thread, and the reverse. */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSuggestions } from './useSuggestions';
import { SUGGESTION_SELECT } from '../editor/extensions/trackChanges.js';
import { testBlock } from '../test-utils';

describe('useSuggestions', () => {
  it('tells the screen when a suggestion is picked from its card or its text, and clear lets it go', () => {
    const pane = document.createElement('div');
    const onPick = vi.fn();
    const block = testBlock({ id: 'B1', status: 'proposed' });
    const { result } = renderHook(() => useSuggestions({ blocks: [block], docId: block.doc_id, onDecision: vi.fn(), reveal: vi.fn(), paneRef: { current: pane }, onPick }));
    expect(result.current.items).toHaveLength(1);

    act(() => result.current.select('B1'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(result.current.active).toEqual({ block_id: 'B1', part: null });

    act(() => result.current.clear());
    expect(result.current.active).toBeNull();

    act(() => void pane.dispatchEvent(new CustomEvent(SUGGESTION_SELECT, { detail: { block_id: 'B1', part: null } })));
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(result.current.active).toEqual({ block_id: 'B1', part: null });
  });

  it('brings a picked card’s change to the middle of the document, or its block', () => {
    document.body.innerHTML = '<section class="doc-panel"><div data-block-id="B1"><span data-suggest-part="0">new</span></div></section>';
    const scroll = vi.fn();
    for (const el of document.querySelectorAll('[data-block-id], [data-suggest-part]')) (el as HTMLElement).scrollIntoView = scroll;
    const block = testBlock({ id: 'B1', status: 'proposed' });
    const { result } = renderHook(() => useSuggestions({ blocks: [block], docId: block.doc_id, onDecision: vi.fn(), reveal: vi.fn(), paneRef: { current: null } }));
    act(() => result.current.select('B1', 0));
    expect(scroll.mock.contexts[0]).toBe(document.querySelector('[data-suggest-part="0"]'));
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    act(() => result.current.select('B1'));
    expect(scroll.mock.contexts[1]).toBe(document.querySelector('[data-block-id="B1"]'));
    document.body.innerHTML = '';
  });
});
