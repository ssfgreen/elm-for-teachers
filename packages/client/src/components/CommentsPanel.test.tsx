import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@edw/shared';
import { CommentsPanel, mentionAt, threadsOf, type CommentsPanelProps } from './CommentsPanel';

afterEach(cleanup);

const comment = (over: Partial<Comment>): Comment => ({
  id: '01JC0MMENT0000000000000001',
  session_id: 'S1',
  doc_id: '01JD0C00000000000000000001',
  block_id: '01JB10CK000000000000000001',
  root_id: null,
  author: 'teacher',
  body: 'Too hard?',
  quote: 'silver coin',
  turn_id: null,
  created_at: '2026-10-30T10:00:00.000Z',
  edited_at: null,
  resolved_at: null,
  deleted_at: null,
  ...over,
});

function setup(over: Partial<CommentsPanelProps> = {}) {
  const props: CommentsPanelProps = {
    threads: [],
    draft: null,
    active: null,
    working: {},
    onSelect: vi.fn(),
    onCreate: vi.fn(async () => undefined),
    onCancelDraft: vi.fn(),
    onReply: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onEdit: vi.fn(async () => undefined),
    onResolve: vi.fn(async () => undefined),
    onClose: vi.fn(),
    ...over,
  };
  render(<CommentsPanel {...props} />);
  return props;
}

describe('threadsOf', () => {
  it('groups replies under their thread and orders threads by where their block is', () => {
    const a = comment({ id: '01JC0MMENT000000000000000A', block_id: 'B2' });
    const b = comment({ id: '01JC0MMENT000000000000000B', block_id: 'B1', created_at: '2026-10-30T11:00:00.000Z' });
    const reply = comment({ id: '01JC0MMENT000000000000000C', root_id: a.id, block_id: 'B2', quote: null });
    const threads = threadsOf([a, b, reply], new Map([['B1', 0], ['B2', 1]]));
    expect(threads.map((t) => [t.root.id, t.replies.map((r) => r.id)])).toEqual([
      [b.id, []],
      [a.id, [reply.id]],
    ]);
  });
});

describe('CommentsPanel', () => {
  it('puts suggestion cards among the threads by where their block is, and a card selects and decides its suggestion', () => {
    const order = new Map([['B1', 0], ['B2', 1], ['B3', 2]]);
    const sg = (block_id: string, title: string) => ({ block_id, part: null, kind: 'insert' as const, title, changes: [], text: `${title} text`, order: order.get(block_id)! });
    const onSelect = vi.fn();
    const onDecide = vi.fn();
    setup({
      threads: threadsOf([comment({ id: '01JC0MMENT000000000000000A', block_id: 'B2', body: 'On B2' })], order),
      suggestions: { items: [sg('B1', 'Add heading'), sg('B2', 'Add paragraph'), sg('B3', 'Add list')], active: null, positionOf: (id) => order.get(id) ?? Infinity, onSelect, onDecide },
    });
    const cards = [...document.querySelectorAll('.comments-panel [role="group"]')].map((g) => g.getAttribute('aria-label'));
    expect(cards).toEqual(['Suggestion: add heading', 'Suggestion: add paragraph', 'Comment thread on “silver coin”', 'Suggestion: add list']);
    const card = screen.getByRole('group', { name: 'Suggestion: add list' });
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith('B3', null);
    fireEvent.click(within(card).getByRole('button', { name: 'Reject: add list' }));
    expect(onDecide).toHaveBeenCalledWith('B3', false, null);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('tints the block a card is about while its Accept is hovered', () => {
    setup({ suggestions: { items: [{ block_id: 'B1', part: null, kind: 'insert', title: 'Add heading', changes: [], text: 'x', order: 0 }], active: null, positionOf: () => 0, onSelect: vi.fn(), onDecide: vi.fn() } });
    const accept = screen.getByRole('button', { name: 'Accept: add heading' });
    fireEvent.mouseEnter(accept);
    expect(document.querySelector('style')?.textContent).toContain('[data-block-id="B1"] { background: var(--success-soft); }');
    fireEvent.mouseLeave(accept);
    expect(document.querySelector('style')).toBeNull();
  });

  it('starts a thread from the draft with Enter, or cancels it', async () => {
    const props = setup({ draft: { block_id: 'B1', from: 0, to: 4, quote: 'silver coin' } });
    expect(screen.getByText('“silver coin”')).toBeTruthy();
    const box = screen.getByLabelText('New comment');
    fireEvent.change(box, { target: { value: 'Is this too hard? @model' } });
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' });
    });
    expect(props.onCreate).toHaveBeenCalledWith({ block_id: 'B1', from: 0, to: 4, quote: 'silver coin' }, 'Is this too hard? @model', true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancelDraft).toHaveBeenCalled();
  });

  it('shows a thread with who wrote what, takes a reply on the selected thread, and says what the assistant is doing', async () => {
    const root = comment({});
    const answer = comment({ id: '01JC0MMENT0000000000000002', root_id: root.id, author: 'model', body: 'Try **pound coin**.', quote: null });
    const props = setup({ threads: [{ root, replies: [answer] }], active: root.id });
    const card = screen.getByRole('group', { name: 'Comment thread on “silver coin”' });
    expect(within(card).getAllByText(/^(You|Assistant)$/).map((e) => e.textContent)).toEqual(['You', 'Assistant']);
    expect(within(card).getByText('pound coin').tagName).toBe('STRONG');
    fireEvent.change(within(card).getByLabelText('Reply'), { target: { value: 'Thanks' } });
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Reply' }));
    });
    expect(props.onReply).toHaveBeenCalledWith(root.id, 'Thanks', true);
    cleanup();
    setup({ threads: [{ root, replies: [] }], active: root.id, working: { [root.id]: 'Thinking' } });
    expect(screen.getByRole('status').textContent).toBe('Thinking…');
    expect(screen.queryByLabelText('Reply')).toBeNull();
  });

  it('deletes a comment only after asking, and a thread’s first comment asks about the thread', async () => {
    const root = comment({});
    const reply = comment({ id: '01JC0MMENT0000000000000002', root_id: root.id, body: 'More', quote: null });
    const props = setup({ threads: [{ root, replies: [reply] }], active: root.id });
    fireEvent.click(screen.getByRole('button', { name: 'More actions for this comment' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete this comment?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for this thread' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete this thread?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(props.onDelete).toHaveBeenCalledWith(root);
  });

  it("offers Edit, Resolve and Delete on the teacher's thread, nothing on the assistant's reply, and only Resolve on its thread", () => {
    const root = comment({});
    const answer = comment({ id: '01JC0MMENT0000000000000002', root_id: root.id, author: 'model', body: 'Try a pound coin.', quote: null });
    const note = comment({ id: '01JC0MMENT0000000000000003', author: 'model', body: 'Add an example.', block_id: 'B2' });
    setup({ threads: [{ root, replies: [answer] }, { root: note, replies: [] }] });
    const [mine, theirs] = screen.getAllByRole('group', { name: /Comment thread/ });
    expect(within(mine!).getAllByRole('button', { name: /More actions/ })).toHaveLength(1);
    fireEvent.click(within(mine!).getByRole('button', { name: 'More actions for this thread' }));
    expect(within(mine!).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Edit', 'Resolve', 'Delete']);
    const other = within(theirs!).getByRole('button', { name: 'More actions for this thread' });
    fireEvent.pointerDown(other);
    fireEvent.click(other);
    expect(within(theirs!).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Resolve']);
    // Opening one menu closes the other.
    expect(within(mine!).queryByRole('menu')).toBeNull();
  });

  it('edits a comment in place with Enter, and marks it edited', async () => {
    const root = comment({});
    const props = setup({ threads: [{ root, replies: [] }] });
    fireEvent.click(screen.getByRole('button', { name: 'More actions for this thread' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const box = screen.getByLabelText('Edit comment');
    expect((box as HTMLTextAreaElement).value).toBe('Too hard?');
    fireEvent.change(box, { target: { value: 'Too hard for P4?' } });
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' });
    });
    expect(props.onEdit).toHaveBeenCalledWith(root, 'Too hard for P4?');
    expect(screen.queryByLabelText('Edit comment')).toBeNull();
    cleanup();
    setup({ threads: [{ root: { ...root, edited_at: '2026-10-30T10:05:00.000Z' }, replies: [] }] });
    expect(screen.getByText('(edited)')).toBeTruthy();
  });

  it('resolves a thread with the tick beside the "…", without opening the menu', async () => {
    const root = comment({});
    const reply = comment({ id: '01JC0MMENT0000000000000002', root_id: root.id, body: 'More', quote: null });
    const props = setup({ threads: [{ root, replies: [reply] }] });
    // Only the thread's first comment has it.
    expect(screen.getAllByRole('button', { name: 'Resolve' })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    });
    expect(props.onResolve).toHaveBeenCalledWith(root, true);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('folds resolved threads under "Resolved", with no reply box, and reopens them', async () => {
    const open = comment({});
    const done = comment({ id: '01JC0MMENT0000000000000005', body: 'Fixed now', resolved_at: '2026-10-30T11:00:00.000Z' });
    const props = setup({ threads: [{ root: open, replies: [] }, { root: done, replies: [] }], active: done.id });
    expect(screen.queryByText('Fixed now')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resolved (1)' }));
    const card = screen.getByRole('group', { name: /^Resolved comment thread/ });
    expect(within(card).queryByLabelText('Reply')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'More actions for this thread' }));
    expect(within(card).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Reopen', 'Delete']);
    await act(async () => {
      fireEvent.click(within(card).getByRole('menuitem', { name: 'Reopen' }));
    });
    expect(props.onResolve).toHaveBeenCalledWith(done, false);
  });

  it('sends to the model unless "Send to model" is unticked, and ticks it again for the next comment', async () => {
    const root = comment({});
    const props = setup({ threads: [{ root, replies: [] }], active: root.id });
    const card = screen.getByRole('group', { name: /Comment thread/ });
    const send = within(card).getByRole('checkbox', { name: 'Send to model' }) as HTMLInputElement;
    expect(send.checked).toBe(true);
    fireEvent.click(send);
    fireEvent.change(within(card).getByLabelText('Reply'), { target: { value: 'Note to self' } });
    await act(async () => {
      fireEvent.keyDown(within(card).getByLabelText('Reply'), { key: 'Enter' });
    });
    expect(props.onReply).toHaveBeenCalledWith(root.id, 'Note to self', false);
    expect(send.checked).toBe(true);
  });

  it('offers @model after "@" and fills it in with Enter, ticking "Send to model"', async () => {
    const props = setup({ draft: { block_id: 'B1', from: 0, to: 4, quote: null } });
    const box = screen.getByLabelText('New comment') as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send to model' }));
    fireEvent.change(box, { target: { value: 'Simpler please @mo', selectionStart: 18 } });
    expect(screen.getByRole('option', { name: /@model/ })).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box.value).toBe('Simpler please @model ');
    expect((screen.getByRole('checkbox', { name: 'Send to model' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('option')).toBeNull();
    expect(props.onCreate).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' });
    });
    expect(props.onCreate).toHaveBeenCalledWith({ block_id: 'B1', from: 0, to: 4, quote: null }, 'Simpler please @model', true);
  });

  it('does not offer @model inside a word or once it is typed, and Escape closes the offer', () => {
    expect(mentionAt('mail me@mo', 10)).toBeNull();
    expect(mentionAt('ask @model', 10)).toBeNull();
    expect(mentionAt('ask @x', 6)).toBeNull();
    expect(mentionAt('@', 1)).toEqual({ from: 0, query: '' });
    setup({ draft: { block_id: 'B1', from: 0, to: 4, quote: null } });
    const box = screen.getByLabelText('New comment');
    fireEvent.change(box, { target: { value: 'hi @', selectionStart: 4 } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('selects a thread when its card is clicked', () => {
    const root = comment({});
    const props = setup({ threads: [{ root, replies: [] }] });
    fireEvent.click(screen.getByRole('group', { name: /Comment thread/ }));
    expect(props.onSelect).toHaveBeenCalledWith(root.id);
  });
});

describe('the suggested style card', () => {
  it('shows what the assistant would change, and the tick and cross decide it', async () => {
    const onStyleDecision = vi.fn(async () => undefined);
    setup({ styleSuggestion: { background: 'green', font: 'comic_sans' }, onStyleDecision });
    const card = screen.getByRole('region', { name: 'Suggested style' });
    expect(card.textContent).toContain('Page colour: Pale green');
    expect(card.textContent).toContain('Font: Comic Sans');
    // No "select text" hint while there is something to decide.
    expect(screen.queryByText(/Select text in the document/)).toBeNull();
    await act(async () => fireEvent.click(within(card).getByRole('button', { name: 'Accept the suggested style' })));
    expect(onStyleDecision).toHaveBeenCalledWith(true);
    await act(async () => fireEvent.click(within(card).getByRole('button', { name: 'Reject the suggested style' })));
    expect(onStyleDecision).toHaveBeenLastCalledWith(false);
  });

  it('is not there without a suggestion', () => {
    setup();
    expect(screen.queryByRole('region', { name: 'Suggested style' })).toBeNull();
  });
});
