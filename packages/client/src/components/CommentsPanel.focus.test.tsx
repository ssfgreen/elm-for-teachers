/** A selected thread or suggestion stands out: the other cards in the column fade back until hovered. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@edw/shared';
import type { Suggestion } from '../editor/suggest/suggestions.js';
import type { SuggestionPick } from './comments/SuggestionCard';
import { CommentsPanel, threadsOf, type CommentsPanelProps } from './CommentsPanel';

afterEach(cleanup);

const comment = (id: string, block_id: string): Comment => ({
  id,
  session_id: 'S1',
  doc_id: 'D1',
  block_id,
  root_id: null,
  author: 'teacher',
  body: `Note ${id}`,
  quote: `quote ${id}`,
  turn_id: null,
  created_at: '2026-10-30T10:00:00.000Z',
  edited_at: null,
  resolved_at: null,
  deleted_at: null,
});
const suggestion: Suggestion = { block_id: 'B2', part: null, kind: 'insert', title: 'Add paragraph', changes: [], text: 'New text', order: 1 };
const order = new Map([['B1', 0], ['B2', 1], ['B3', 2]]);
const threads = threadsOf([comment('A', 'B1'), comment('C', 'B3')], order);

function setup(active: string | null, picked: SuggestionPick = null) {
  const props: CommentsPanelProps = {
    threads,
    draft: null,
    active,
    working: {},
    onSelect: vi.fn(),
    onCreate: vi.fn(async () => undefined),
    onCancelDraft: vi.fn(),
    onReply: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onEdit: vi.fn(async () => undefined),
    onResolve: vi.fn(async () => undefined),
    onClose: vi.fn(),
    suggestions: { items: [suggestion], active: picked, positionOf: (b) => order.get(b) ?? Infinity, onSelect: vi.fn(), onDecide: vi.fn() },
  };
  render(<CommentsPanel {...props} />);
}

const faded = (name: RegExp) => screen.getByRole('group', { name }).className.includes('opacity-50');

describe('CommentsPanel: the selected thread stands out', () => {
  it('fades the other threads and the suggestion cards while a thread is selected', () => {
    setup('A');
    expect(faded(/quote A/)).toBe(false);
    expect(faded(/quote C/)).toBe(true);
    expect(faded(/^Suggestion/)).toBe(true);
    expect(screen.getByRole('group', { name: /quote C/ }).className).toContain('hover:opacity-100');
  });

  it('fades nothing while no thread is selected', () => {
    setup(null);
    expect([faded(/quote A/), faded(/quote C/), faded(/^Suggestion/)]).toEqual([false, false, false]);
  });

  it('fades nothing for a selected thread that is not shown', () => {
    setup('GONE');
    expect([faded(/quote A/), faded(/quote C/), faded(/^Suggestion/)]).toEqual([false, false, false]);
  });

  it('fades the threads while a suggestion is picked (a change clicked in the document, or its card)', () => {
    setup(null, { block_id: 'B2', part: null });
    expect([faded(/quote A/), faded(/quote C/), faded(/^Suggestion/)]).toEqual([true, true, false]);
  });
});
