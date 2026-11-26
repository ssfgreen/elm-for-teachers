import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Suggestion } from '../../editor/suggest/suggestions.js';
import { SuggestionCard, SuggestionTint, type SuggestionHover, type SuggestionPick } from './SuggestionCard';

afterEach(cleanup);

const sg = (part: number | null): Suggestion => ({
  block_id: 'b1',
  part,
  kind: 'replace',
  title: 'Edit paragraph',
  changes: part === null ? [] : [{ ins: 'new', del: 'old' }],
  text: 'the new word',
  order: 0,
});

const tint = (hover: SuggestionHover, active: SuggestionPick = null) => render(<SuggestionTint hover={hover} active={active} />).container.textContent ?? '';

describe('SuggestionCard', () => {
  it('says which change Accept is hovered on', () => {
    const onHover = vi.fn();
    const r = render(<SuggestionCard suggestion={sg(1)} active={false} onSelect={vi.fn()} onDecide={vi.fn()} onHover={onHover} />);
    fireEvent.mouseEnter(r.getByRole('button', { name: /^Accept/ }));
    expect(onHover).toHaveBeenLastCalledWith({ block_id: 'b1', part: 1, intent: 'accept' });
  });
});

describe('SuggestionTint', () => {
  it('tints only the hovered change, not its whole block', () => {
    const css = tint({ block_id: 'b1', part: 1, intent: 'reject' });
    expect(css).toContain('[data-block-id="b1"] [data-suggest-part="1"]');
    expect(css).not.toMatch(/\[data-block-id="b1"\] \{/);
  });

  it('tints only the selected change, or the whole block when the block is selected', () => {
    expect(tint(null, { block_id: 'b1', part: 0 })).toContain('[data-block-id="b1"] [data-suggest-part="0"] { background: var(--suggest-soft)');
    expect(tint(null, { block_id: 'b1', part: null })).toMatch(/\[data-block-id="b1"\] \{ background: var\(--suggest-soft\)/);
  });

  it('tints the whole block for a suggestion about the whole block', () => {
    expect(tint({ block_id: 'b1', part: null, intent: 'accept' })).toMatch(/\[data-block-id="b1"\] \{ background: var\(--success-soft\)/);
  });
});
