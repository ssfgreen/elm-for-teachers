import { describe, expect, it } from 'vitest';
import { DOC_ID, THREAD_ID, testBlock, testDoc } from '../test-utils';
import { isPreviewId, previewReply } from './preview';

const A = '01ARZ3NDEKTSV4RRFFQ69G5FA1';
const snap = () => ({ blocks: [testBlock({ id: A, content: 'Intro' })], docs: [testDoc({ id: DOC_ID })] });
const visible = (s: ReturnType<typeof snap>) =>
  s.blocks.filter((b) => b.doc_id === DOC_ID && b.status !== 'rejected' && b.status !== 'deleted').sort((a, b) => a.order - b.order);

describe('previewReply', () => {
  it('shows nothing until the operations start', () => {
    expect(previewReply(snap(), 'Here is a draft', THREAD_ID, DOC_ID)).toBeNull();
    expect(previewReply(snap(), 'Here is a draft.\n\n```json\n[', THREAD_ID, DOC_ID)).toBeNull();
  });

  it('applies finished operations and the one being written, with its content so far', () => {
    const raw =
      'Draft.\n\n```json\n[{"op":"insert","after":"' + A + '","type":"heading","content":"## Part 1"},{"op":"insert","after":"' + A + '","type":"paragraph","content":"Read each sent';
    const p = previewReply(snap(), raw, THREAD_ID, DOC_ID)!;
    const v = visible(p);
    expect(v.map((b) => [b.content, b.status])).toEqual([
      ['Intro', 'live'],
      ['## Part 1', 'proposed'],
      ['Read each sent', 'proposed'],
    ]);
    expect(isPreviewId(v[1]!.id)).toBe(true);
    // Ids are stable as more text arrives, so the editor keeps its nodes.
    const more = previewReply(snap(), raw + 'ence', THREAD_ID, DOC_ID)!;
    expect(visible(more).map((b) => b.id)).toEqual(v.map((b) => b.id));
  });

  it('shows a replace as a pending change, and leaves out operations that would not apply', () => {
    const raw = '```json\n[{"op":"delete","id":"01ARZ3NDEKTSV4RRFFQ69G5ZZZ"},{"op":"replace","id":"' + A + '","content":"Better intro"}]\n```';
    const p = previewReply(snap(), raw, THREAD_ID, DOC_ID)!;
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0]!.pending).toMatchObject({ op: 'replace', content: 'Better intro' });
  });

  it('never changes the snapshot it is given', () => {
    const s = snap();
    const before = JSON.stringify(s);
    previewReply(s, '```json\n[{"op":"replace","id":"' + A + '","content":"x"}]', THREAD_ID, DOC_ID);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('never changes the snapshot\'s docs either: a suggested style is not on the doc until the server has it', () => {
    const s = snap();
    const before = JSON.stringify(s);
    previewReply(s, '```json\n[{"op":"set_style","background":"green"}]', THREAD_ID, DOC_ID);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.docs[0]!.proposed_style).toBeUndefined();
  });
});
