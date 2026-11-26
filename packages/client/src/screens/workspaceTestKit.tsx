/**
 * The workspace screen's test setup, shared by its test files: a mock API, a snapshot of three
 * docs in two chats, and the screen rendered on them.
 */
import { act, render, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type { Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { CanvasSnapshot, StructuralCommand } from '../editor/types.js';
import type { EventContext } from '../events/logger';
import { createFocusPaneState } from '../events/trackers';
import { DOC_ID, THREAD_ID, makeSession, mockLogger, testBlock, testDoc, testThread } from '../test-utils';
import { WorkspaceScreen } from './WorkspaceScreen';

export const OLD_THREAD = '01JTHREAD0000000000000000A';
export const OLD_DOC = '01JD0C0000000000000000000A';
export const SECOND_DOC = '01JD0C0000000000000000000B';
export const NEW_ID = '01JNEW00000000000000000000';

export function mockApi(snap: CanvasSnapshot, threads: Thread[]) {
  return {
    sessionId: 'S1',
    getCanvas: vi.fn(() => Promise.resolve(snap)),
    structural: vi.fn(async (cmd: StructuralCommand) => {
      if (cmd.command === 'doc_create') {
        const doc = testDoc({ id: cmd.id!, thread_id: cmd.thread_id, name: cmd.name, created_at: '2026-10-29T13:00:00.000Z' });
        return { changes: { blocks: [], docs: [doc] }, block: null, doc };
      }
      if (cmd.command === 'doc_import') {
        const doc = testDoc({ id: cmd.id!, thread_id: cmd.thread_id, name: cmd.name, created_at: '2026-10-29T13:40:00.000Z' });
        const blocks = cmd.blocks.map((b, i) => testBlock({ id: `01JIMP0RT${String(i).padStart(17, '0')}`, doc_id: doc.id, type: b.type, content: b.content, order: i }));
        return { changes: { blocks, docs: [doc] }, block: null, doc };
      }
      if (cmd.command === 'doc_duplicate') {
        const source = snap.docs.find((d) => d.id === cmd.doc_id)!;
        const doc = testDoc({ id: cmd.id!, thread_id: source.thread_id, name: cmd.name, created_at: '2026-10-29T13:30:00.000Z' });
        const blocks = snap.blocks.filter((b) => b.doc_id === source.id).map((b, i) => testBlock({ ...b, id: `01JC0PY00000000000000000${i}`.padEnd(26, '0'), doc_id: doc.id }));
        return { changes: { blocks, docs: [doc] }, block: null, doc };
      }
      if (cmd.command === 'doc_delete') {
        const doc = { ...snap.docs.find((d) => d.id === cmd.doc_id)!, deleted_at: '2026-10-29T14:00:00.000Z' };
        return { changes: { blocks: [], docs: [] }, block: null, doc };
      }
      if (cmd.command === 'doc_rename') {
        const doc = { ...snap.docs.find((d) => d.id === cmd.doc_id)!, name: cmd.name };
        return { changes: { blocks: [], docs: [doc] }, block: null, doc };
      }
      return { changes: { blocks: [], docs: [] }, block: null, doc: null };
    }),
    listThreads: vi.fn(() => Promise.resolve(threads)),
    renameThread: vi.fn(async (threadId: string, title: string) => ({ ...threads.find((t) => t.id === threadId)!, title })),
    nameThread: vi.fn(async (threadId: string) => ({ ...threads.find((t) => t.id === threadId)!, title: 'Similes homework (P7)' })),
    createThread: vi.fn(async () => ({
      thread: testThread({ id: NEW_ID, created_at: '2026-10-29T14:00:00.000Z' }),
      doc: testDoc({ id: '01JNEWD0C00000000000000000', thread_id: NEW_ID }),
    })),
    getChat: vi.fn<SessionApi['getChat']>(() => Promise.resolve([])),
    sendChat: vi.fn<SessionApi['sendChat']>(),
    uploadAsset: vi.fn(() => Promise.resolve({ asset_id: 'ast_1' })),
    listComments: vi.fn<SessionApi['listComments']>(() => Promise.resolve([])),
    createComment: vi.fn<SessionApi['createComment']>(),
    deleteComment: vi.fn<SessionApi['deleteComment']>(() => Promise.resolve()),
    editComment: vi.fn<SessionApi['editComment']>((id, body) => Promise.resolve({ id, body } as never)),
    resolveComment: vi.fn<SessionApi['resolveComment']>((id) => Promise.resolve({ id } as never)),
    answerComment: vi.fn<SessionApi['answerComment']>(),
    assetUrl: (src: string) => src,
  } satisfies SessionApi;
}

export const baseSnap = (): CanvasSnapshot => ({
  blocks: [
    testBlock({ id: '01JB10CK000000000000000001', content: 'Similes compare using like or as.' }),
    testBlock({ id: '01JB10CK000000000000000002', content: 'Second doc text', doc_id: SECOND_DOC }),
    testBlock({ id: '01JB10CK000000000000000003', content: 'Old chat doc text', doc_id: OLD_DOC }),
  ],
  docs: [
    testDoc({ id: DOC_ID, name: 'Similes', created_at: '2026-10-29T12:00:00.000Z' }),
    testDoc({ id: SECOND_DOC, name: 'Short version', created_by: 'model', created_at: '2026-10-29T12:30:00.000Z' }),
    testDoc({ id: OLD_DOC, thread_id: OLD_THREAD, name: 'Metaphors', created_at: '2026-10-28T09:00:00.000Z' }),
  ],
});
export const baseThreads = (): Thread[] => [
  testThread({ id: OLD_THREAD, title: 'Metaphors for P6', created_at: '2026-10-28T09:00:00.000Z' }),
  testThread({ id: THREAD_ID, title: 'Similes for P7', created_at: '2026-10-29T12:00:00.000Z' }),
];

export async function renderScreen(snap = baseSnap(), threads = baseThreads()) {
  const logger = mockLogger();
  const api = mockApi(snap, threads);
  const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
  render(<WorkspaceScreen session={makeSession()} api={api} logger={logger} focusState={createFocusPaneState()} context={context} />);
  await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
  await act(async () => undefined);
  return { logger, api, context };
}

/** The open doc's name and the open chat's title (documents and replies have headings of their own). */
/** jsdom's Blob has no text(). */
export const readBlob = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
export const readBytes = (b: Blob) =>
  new Promise<ArrayBuffer>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.readAsArrayBuffer(b);
  });
export const docTitle = () => document.querySelector('.doc-title')?.textContent ?? null;
export const chatTitle = () => document.querySelector('.chat-title')?.textContent ?? null;
export const logged = (logger: ReturnType<typeof mockLogger>, kind: string) => logger.log.mock.calls.filter((c) => c[0] === kind).map((c) => c[1]);
