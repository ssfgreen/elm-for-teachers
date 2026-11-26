import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '../api/types';
import { testBlock, testDoc, testThread } from '../test-utils';
import { chatText, workspaceZip } from './workspaceZip';

const turn = (over: Partial<ChatTurn>): ChatTurn => ({ turn_id: 't', doc_id: 'd', prompt: 'Hi', anchor: null, response_text: 'Hello', at: '2026-10-29T11:08:00.000Z', ...over });

const bytes = (b: Blob) =>
  new Promise<ArrayBuffer>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.readAsArrayBuffer(b);
  });

describe('chatText', () => {
  it('writes the chat name, then each message under who sent it', () => {
    const text = chatText({ title: 'Similes P7' }, [
      turn({ prompt: 'Make a worksheet', response_text: 'Here it is.' }),
      turn({ prompt: 'Shorter', anchor: { block_id: 'b', from: 0, to: 4, quote: 'like' }, response_text: null }),
    ]);
    expect(text).toBe('Similes P7\n\nYou, 29 Oct 2026, 11:08:\nMake a worksheet\n\nAssistant:\nHere it is.\n\nYou, 29 Oct 2026, 11:08:\nAbout: “like”\nShorter\n');
  });
});

describe('workspaceZip', () => {
  it('holds documents/ and chats/ only, skipping empty ones and numbering repeated names', async () => {
    const a = testDoc({ id: '01JD0C0000000000000000000A', name: 'Similes', created_at: '2026-10-29T10:00:00.000Z' });
    const b = testDoc({ id: '01JD0C0000000000000000000B', name: 'Similes', created_at: '2026-10-29T11:00:00.000Z' });
    const empty = testDoc({ id: '01JD0C0000000000000000000C', name: 'Untitled', created_at: '2026-10-29T12:00:00.000Z' });
    const snap = {
      docs: [b, empty, a],
      blocks: [testBlock({ id: '01JB10CK00000000000000000A', doc_id: a.id, content: 'One' }), testBlock({ id: '01JB10CK00000000000000000B', doc_id: b.id, content: 'Two' })],
    };
    const talk = testThread({ id: '01JT00000000000000000000A1', title: 'Similes/P7' });
    const quiet = testThread({ id: '01JT00000000000000000000B1', title: 'Nothing yet' });
    const made: string[] = [];
    const blob = await workspaceZip({
      snap,
      threads: [talk, quiet],
      chats: new Map([[talk.id, [turn({})]]]),
      wordFor: async (d) => (made.push(d.id), new Blob([`word ${d.id}`])),
    });
    const zip = await JSZip.loadAsync(await bytes(blob));
    expect(Object.keys(zip.files).sort()).toEqual(['chats/', 'chats/Similes-P7.txt', 'documents/', 'documents/Similes (2).docx', 'documents/Similes.docx']);
    expect(await zip.file('documents/Similes.docx')!.async('string')).toBe(`word ${a.id}`);
    expect(made).toEqual([a.id, b.id]);
  });
});
