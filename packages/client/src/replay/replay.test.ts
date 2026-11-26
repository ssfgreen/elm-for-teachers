import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { BundleError, parseBundle, readBundleZip } from './bundle';
import { advance, nextBack, nextForward, type Bounds } from './clock';
import { buildDocHistory, docAt } from './docHistory';
import { moments } from './feed';
import { busiestSitting, splitSittings } from './sittings';
import { snapshotAt } from './snapshot';
import { buildTimeline, pointerAt } from './timeline';
import { bundle, ev, T0, text, turn } from './replayTestKit';

const MIN = 60_000;

describe('splitSittings', () => {
  it('starts a new sitting after more than ten minutes without an event', () => {
    const events = [ev(0, 'click'), ev(9 * MIN, 'click'), ev(19 * MIN + 1, 'click'), ev(20 * MIN, 'scroll')];
    const s = splitSittings(events);
    expect(s.map((x) => [x.first, x.last])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(s[1]!.start).toBe(T0 + 19 * MIN + 1);
  });

  it('opens on the sitting where the teacher did most, not where the screen was merely watched', () => {
    const events = [ev(0, 'block_visible'), ev(1, 'block_visible'), ev(2, 'block_visible'), ev(30 * MIN, 'click')];
    expect(busiestSitting(splitSittings(events))?.index).toBe(1);
  });

  it("does not count an admin's exports as the teacher's actions", () => {
    const events = [ev(0, 'click'), ev(30 * MIN, 'workspace_export'), ev(31 * MIN, 'workspace_export')];
    const s = splitSittings(events);
    expect(s.map((x) => x.actions)).toEqual([1, 0]);
    expect(busiestSitting(s)?.index).toBe(0);
  });

  it("does not count an admin's feature switches or budget top-ups as the teacher's actions", () => {
    const events = [ev(0, 'click'), ev(30 * MIN, 'workspace_features_set'), ev(31 * MIN, 'budget_update')];
    expect(splitSittings(events).map((x) => x.actions)).toEqual([1, 0]);
  });
});

describe('doc history', () => {
  const te = [
    text(1, 0, 'b1', [{ insert: 'Hello' }]),
    text(2, 1000, 'b1', [{ retain: 5 }, { insert: ' world' }]),
    text(3, 1500, 'b2', [{ insert: 'Second' }]),
    { ...text(4, 3000, 'b2', []), eventName: 'block-delete' },
  ];
  const h = buildDocHistory(te, bundle([]).blocks);

  it('shows each block as it was at the time, in order', () => {
    expect(docAt(h, 'd1', T0 + 500)).toEqual([{ id: 'b1', content: 'Hello' }]);
    expect(docAt(h, 'd1', T0 + 2000)).toEqual([
      { id: 'b1', content: 'Hello world' },
      { id: 'b2', content: 'Second' },
    ]);
  });

  it('drops a block once it is deleted', () => {
    expect(docAt(h, 'd1', T0 + 3000).map((b) => b.id)).toEqual(['b1']);
  });
});

describe('snapshotAt', () => {
  const events = [
    ev(0, 'viewport', { width: 1000, height: 600, regions: { canvas: { left: 0, top: 0, width: 1000, height: 600 } } }),
    ev(0, 'doc_create', { doc_id: 'd1', thread_id: 'th1', name: 'Untitled' }),
    ev(0, 'thread_create', { thread_id: 'th1' }),
    ev(100, 'block_visible', { block_id: 'b1', visible: true }),
    ev(1000, 'keystroke_batch', { target: { kind: 'chat' }, steps: [{ from: 0, to: 0, text: 'H' }, { from: 1, to: 1, text: 'i' }], batch_start_ts: new Date(T0 + 500).toISOString(), batch_end_ts: new Date(T0 + 1000).toISOString() }),
    ev(2000, 'chat_prompt', { turn_id: 't1', text: 'Hi' }),
    ev(3000, 'chat_response', { turn_id: 't1', text: 'Done', operations: [{ op: 'replace', id: 'b1', content: 'Hello there' }] }),
    ev(3000, 'proposal_shown', { turn_id: 't1', block_ids: ['b1'] }),
    ev(4000, 'click', { x: 10, y: 20, control: { role: 'button', label: 'Accept' } }),
    ev(4000, 'proposal_accept', { block_id: 'b1', doc_id: 'd1', mode: 'click' }),
    ev(5000, 'doc_rename', { doc_id: 'd1', name: 'Poems' }),
    ev(6000, 'page_state', { visible: false, focused: false }),
    ev(7000, 'ui_state', { role: 'dialog', label: 'Preview', open: true }),
    ev(8000, 'ui_state', { role: 'dialog', label: 'Preview', open: false }),
  ];
  const tl = buildTimeline(bundle(events, [text(1, 0, 'b1', [{ insert: 'Hello' }])], [turn('t1', 'Hi', 'Done')]));

  it('types the chat draft out across its batch, then clears it when sent', () => {
    expect(snapshotAt(tl, T0 + 400).draft).toBe('');
    expect(snapshotAt(tl, T0 + 750).draft).toBe('H');
    expect(snapshotAt(tl, T0 + 1500).draft).toBe('Hi');
    const sent = snapshotAt(tl, T0 + 2500);
    expect(sent.draft).toBe('');
    expect(sent.chat).toMatchObject([{ key: 't1-p', role: 'teacher', text: 'Hi' }]);
    expect(snapshotAt(tl, T0 + 3000).chat).toMatchObject([{ role: 'teacher' }, { key: 't1-r', role: 'assistant', text: 'Done' }]);
  });

  it('calls a new chat Untitled until it is named, whatever its final name', () => {
    const named = buildTimeline(bundle([...events, ev(9000, 'thread_rename', { thread_id: 'th1', title: 'Poems chat' })]));
    expect(snapshotAt(named, T0 + 8500).threads).toMatchObject([{ id: 'th1', title: 'Untitled' }]);
    expect(snapshotAt(named, T0 + 9000).threads).toMatchObject([{ id: 'th1', title: 'Poems chat' }]);
  });

  it('keeps the focus where a focus event put it, whatever the envelope of a later event says', () => {
    const focused = buildTimeline(
      bundle([...events, ev(8100, 'focus', { pane: 'canvas', block_id: 'b1' }), ev(8200, 'selection', { block_id: 'b1', from: 0, to: 3 }), ev(8300, 'block_visible', { block_id: 'b1', visible: true }, { focus_pane: 'none' })]),
    );
    const s = snapshotAt(focused, T0 + 8400);
    expect(s.focusPane).toBe('canvas');
    expect(s.selection).toEqual({ block_id: 'b1', from: 0, to: 3 });
  });

  it('takes the teacher as back on the page once they click or type, whatever page_state last said', () => {
    const back = buildTimeline(bundle([...events, ev(6500, 'click', { x: 1, y: 1, control: null })]));
    expect(snapshotAt(back, T0 + 6200).away).toBe('hidden');
    expect(snapshotAt(back, T0 + 6600).away).toBeNull();
  });

  it('takes the teacher as on the page while they scroll the Word preview, and leaves the document where it was', () => {
    const back = buildTimeline(bundle([...events, ev(6500, 'preview_scroll', { doc_id: 'd1', position: 300, max: 1200 })]));
    expect(snapshotAt(back, T0 + 6200).away).toBe('hidden');
    expect(snapshotAt(back, T0 + 6600).away).toBeNull();
    expect(snapshotAt(back, T0 + 6600).canvasScroll).toBeNull();
  });

  it('gives the editor the block with its suggestion waiting, until it is decided', () => {
    expect(snapshotAt(tl, T0 + 3500).blocks[0]).toMatchObject({ id: 'b1', type: 'paragraph', status: 'live', pending: { op: 'replace', turn_id: 't1', content: 'Hello there' } });
    expect(snapshotAt(tl, T0 + 4000).blocks[0]?.pending).toBeNull();
  });

  it('follows the logged scroll of the document', () => {
    const scrolled = buildTimeline(bundle([...events, ev(8500, 'scroll', { pane: 'canvas', position: 240 }), ev(8600, 'scroll', { pane: 'chat', position: 9 })]));
    expect(snapshotAt(scrolled, T0 + 8000).canvasScroll).toBeNull();
    expect(snapshotAt(scrolled, T0 + 8700).canvasScroll).toBe(240);
  });

  it('keeps a click on screen briefly, with what was clicked', () => {
    expect(snapshotAt(tl, T0 + 4200).clicks).toEqual([{ t: T0 + 4000, x: 10, y: 20, ageMs: 200, label: 'Accept', block_id: null, item: null }]);
    expect(snapshotAt(tl, T0 + 3800).upcoming).toMatchObject([{ t: T0 + 4000, ageMs: -200, label: 'Accept' }]);
    expect(snapshotAt(tl, T0 + 3600).upcoming).toEqual([]);
    expect(snapshotAt(tl, T0 + 5000).clicks).toEqual([]);
  });

  it('follows the doc name, what is on screen, the tab and dialogs', () => {
    const s = snapshotAt(tl, T0 + 7500);
    expect(s.docs).toMatchObject([{ id: 'd1', name: 'Poems', thread_id: 'th1' }]);
    expect(s.blocks).toMatchObject([{ id: 'b1', content: 'Hello' }]);
    expect(s.visible.has('b1')).toBe(true);
    expect(s.away).toBe('hidden');
    expect(s.dialog).toBe('Preview');
    expect(snapshotAt(tl, T0 + 8000).dialog).toBeNull();
    expect(s.viewport?.width).toBe(1000);
  });
});

describe('pointerAt', () => {
  const pts = [
    { t: 0, x: 0, y: 0, pane: 'canvas', block_id: null, item: null },
    { t: 100, x: 100, y: 50, pane: 'canvas', block_id: null, item: null },
    { t: 5000, x: 300, y: 300, pane: 'chat', block_id: null, item: null },
  ];
  it('moves in a straight line between close samples and rests between far ones', () => {
    expect(pointerAt(pts, 50)).toMatchObject({ x: 50, y: 25 });
    expect(pointerAt(pts, 2000)).toMatchObject({ x: 100, y: 50, idleMs: 1900 });
    expect(pointerAt(pts, -1)).toBeNull();
  });
});

describe('clock', () => {
  const b: Bounds = { start: 0, end: 100_000, times: [0, 1000, 2000, 60_000], skipIdle: false };

  it('steps through the rates as the buttons are pressed', () => {
    expect([nextForward(1), nextForward(2), nextForward(5), nextForward(-5)]).toEqual([2, 5, 2, 2]);
    expect([nextBack(1), nextBack(-2), nextBack(-5)]).toEqual([-2, -5, -2]);
  });

  it('moves at the rate, backwards too, and stops at the ends', () => {
    expect(advance({ t: 1000, rate: 5, playing: true }, 100, b).t).toBe(1500);
    expect(advance({ t: 1000, rate: -2, playing: true }, 100, b).t).toBe(800);
    expect(advance({ t: 100, rate: -5, playing: true }, 100, b)).toEqual({ t: 0, rate: 1, playing: false });
    expect(advance({ t: 1000, rate: 1, playing: false }, 100, b).t).toBe(1000);
  });

  // The first frame after a button is pressed can be stamped a little before the press.
  it('keeps playing through a step of no time or less, at either end', () => {
    const atStart = { t: 0, rate: 2, playing: true } as const;
    expect(advance(atStart, -3, b)).toEqual(atStart);
    expect(advance(atStart, 0, b)).toEqual(atStart);
    const atEnd = { t: 100_000, rate: -2, playing: true } as const;
    expect(advance(atEnd, -3, b)).toEqual(atEnd);
  });

  it('jumps a quiet stretch to just before the next event, either way', () => {
    const skip = { ...b, skipIdle: true };
    expect(advance({ t: 2000, rate: 1, playing: true }, 16, skip).t).toBe(59_200);
    expect(advance({ t: 59_000, rate: -2, playing: true }, 16, skip).t).toBe(2800);
    expect(advance({ t: 1000, rate: 1, playing: true }, 16, skip).t).toBe(1016);
  });
});

describe('moments', () => {
  it('names prompts, decisions and leaving the tab, and skips unlabelled clicks', () => {
    const events = [
      ev(0, 'chat_prompt', { text: 'Make it shorter' }),
      ev(1, 'click', { control: null }),
      ev(2, 'proposal_accept', { block_id: null, doc_id: 'd1' }),
      ev(3, 'page_state', { visible: false }),
    ];
    expect(moments(events, 0, 3).map((m) => [m.tone, m.label])).toEqual([
      ['chat', 'Asked: “Make it shorter”'],
      ['accept', 'Accepted all suggestions'],
      ['away', 'Left the tab'],
    ]);
  });
});

describe('reading a bundle', () => {
  const line = (o: object) => JSON.stringify(o);
  const files = {
    'events.jsonl': [line({ seq: 2, kind: 'click', client_ts: '2026-11-12T12:00:02Z', payload: {} }), line({ seq: 1, kind: 'scroll', client_ts: '2026-11-12T12:00:01Z', payload: {} })].join('\n'),
    'session.json': line({ label: 'P04' }),
  };

  it('puts events in time order with epoch times', () => {
    const b = parseBundle(files);
    expect(b.label).toBe('P04');
    expect(b.events.map((e) => e.kind)).toEqual(['scroll', 'click']);
    expect(b.events[0]!.t).toBe(Date.parse('2026-11-12T12:00:01Z'));
  });

  it('times what the server writes at the end of a turn by when it happened, not by the prompt', () => {
    const b = parseBundle({
      'events.jsonl': [
        line({ seq: 1, kind: 'chat_prompt', client_ts: '2026-11-12T12:00:00Z', server_ts: '2026-11-12T12:00:00.2Z', payload: {} }),
        line({ seq: 2, kind: 'chat_response', client_ts: '2026-11-12T12:00:00Z', server_ts: '2026-11-12T12:00:09Z', payload: {} }),
        line({ seq: 3, kind: 'click', client_ts: '2026-11-12T12:00:05Z', server_ts: '2026-11-12T12:00:05.2Z', payload: {} }),
      ].join('\n'),
    });
    expect(b.events.map((e) => [e.kind, new Date(e.t).toISOString()])).toEqual([
      ['chat_prompt', '2026-11-12T12:00:00.000Z'],
      ['click', '2026-11-12T12:00:05.000Z'],
      ['chat_response', '2026-11-12T12:00:09.000Z'],
    ]);
  });

  it('reads a zip, with or without a folder around it, and refuses one with no events', async () => {
    const zip = new JSZip();
    for (const [k, v] of Object.entries(files)) zip.file(`P04/${k}`, v);
    const b = await readBundleZip(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(b.events).toHaveLength(2);
    const empty = await new JSZip().generateAsync({ type: 'arraybuffer' });
    await expect(readBundleZip(empty)).rejects.toBeInstanceOf(BundleError);
  });
});
