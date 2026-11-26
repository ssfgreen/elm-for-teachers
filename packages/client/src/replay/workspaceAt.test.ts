import { describe, expect, it } from 'vitest';
import type { Comment } from '@edw/shared';
import { namedClicks } from './useCalibration';
import { barAt, chatAt, commentsAt, momentsOf } from './workspaceAt';
import { bundle, ev, T0, turn } from './replayTestKit';

const comment = (id: string, root_id: string | null, at: number): Comment => ({
  id,
  session_id: '',
  doc_id: 'd1',
  block_id: 'b1',
  root_id,
  author: 'teacher',
  body: `Comment ${id}`,
  quote: null,
  turn_id: null,
  created_at: new Date(T0 + at).toISOString(),
  edited_at: null,
  resolved_at: null,
  deleted_at: null,
});

describe('commentsAt', () => {
  const events = [
    ev(1000, 'comment_create', { comment_id: 'c1', root_id: null }),
    ev(2000, 'comment_create', { comment_id: 'c2', root_id: 'c1' }),
    ev(3000, 'comment_resolve', { comment_id: 'c1', resolved: true }),
    ev(4000, 'comment_create', { comment_id: 'c3', root_id: null }),
    ev(5000, 'comment_delete', { comment_id: 'c3' }),
  ];
  const b = { ...bundle(events), comments: [comment('c1', null, 1000), comment('c2', 'c1', 2000), comment('c3', null, 4000)] };
  const m = momentsOf(b.events);

  it('shows each comment from when it was made, and its thread resolved from when it was', () => {
    expect(commentsAt(b, m, 'd1', T0 + 1500).map((c) => c.id)).toEqual(['c1']);
    expect(commentsAt(b, m, 'd1', T0 + 2500).every((c) => c.resolved_at === null)).toBe(true);
    expect(commentsAt(b, m, 'd1', T0 + 3500).every((c) => c.resolved_at !== null)).toBe(true);
  });

  it('drops a deleted comment', () => {
    expect(commentsAt(b, m, 'd1', T0 + 4500).map((c) => c.id)).toContain('c3');
    expect(commentsAt(b, m, 'd1', T0 + 5500).map((c) => c.id)).not.toContain('c3');
  });
});

describe('chatAt', () => {
  it('shows Spyglass’s flags on a reply only once they were shown', () => {
    const t1 = { ...turn('t1', 'Hi', 'Done'), spyglass: { flags: [], others: 0, by: 'judge' as const } };
    const events = [ev(1000, 'chat_prompt', { turn_id: 't1' }), ev(2000, 'chat_response', { turn_id: 't1' }), ev(3000, 'spyglass_shown', { turn_id: 't1' })];
    const b = bundle(events, [], [t1]);
    const m = momentsOf(b.events);
    expect(chatAt(b, m, 'th1', T0 + 2500).at(-1)?.spyglass).toBeUndefined();
    expect(chatAt(b, m, 'th1', T0 + 3500).at(-1)?.spyglass).toBeDefined();
  });
});

describe('barAt', () => {
  it('shows the settings of the last prompt sent, or before any, of the first', () => {
    const events = [
      ev(1000, 'chat_prompt', { model: 'm1', effort: 'low', edit_mode: 'suggest', spyglass: true }),
      ev(2000, 'chat_prompt', { model: 'm2', effort: 'high', edit_mode: 'edit', spyglass: false }),
    ];
    expect(barAt(events, T0)).toMatchObject({ model: 'm1', editMode: 'suggest' });
    expect(barAt(events, T0 + 2500)).toMatchObject({ model: 'm2', effort: 'high', editMode: 'edit', spyglass: false });
    expect(barAt(events, T0)?.models.map((x) => x.id)).toEqual(['m1', 'm2']);
    expect(barAt([], T0)).toBeNull();
  });
});

describe('namedClicks', () => {
  it('keeps clicks on a named control, without the keyboard shortcut', () => {
    const events = [ev(0, 'click', { x: 1, y: 2, control: { role: 'button', label: 'Bold (⌘B)' } }), ev(1, 'click', { x: 3, y: 4, control: null })];
    expect(namedClicks(events, 0, 1)).toEqual([{ t: T0, x: 1, y: 2, name: 'Bold', window: null }]);
  });

  it('names the window a click was made in, and moves it as drawn landscape when asked', () => {
    const tall = { width: 1484, height: 1642, regions: {} };
    const events = [ev(0, 'viewport', tall), ev(1, 'click', { x: 400, y: 1600, control: { role: 'button', label: 'Send' } })];
    expect(namedClicks(events, 0, 1)[0]).toMatchObject({ y: 1600, window: '1484x1642' });
    expect(namedClicks(events, 0, 1, true)[0]).toMatchObject({ y: 1600 - (1642 - 928), window: '1484x1642' });
  });
});
