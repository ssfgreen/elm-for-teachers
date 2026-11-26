import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolYearOf, type ClassesList, type ClassSummary, type Pupil, type PupilFields, type School, type Thread, type YearGroup } from '@edw/shared';
import type { ThreadPlace } from '../../api/classes';
import type { SessionApi } from '../../api/participant';
import type { CanvasSnapshot } from '../../editor/types.js';
import type { EventContext } from '../../events/logger';
import { createFocusPaneState } from '../../events/trackers';
import { DOC_ID, THREAD_ID, installEditorPolyfills, installIntersectionObserver, makeSession, mockLogger, testDoc, testThread } from '../../test-utils';
import { WorkspaceScreen } from '../WorkspaceScreen';

beforeAll(() => {
  installIntersectionObserver();
  installEditorPolyfills();
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const T = '2026-11-12T09:00:00.000Z';
const Y7 = '01JYEAR00000000000000000P7';
const C7A = '01JC1ASS0000000000000000P7';
const CLASS_CHAT = '01JTHREAD000000000000C1ASS';
const CLASS_DOC = '01JD0C00000000000000C1ASS0';
const NEW_CHAT = '01JNEWCHAT0000000000000000';
const NEW_DOC = '01JNEWD0C00000000000000000';
const C7B = '01JC1ASS0000000000000000P8';

const SCHOOL = '01JSCH00000000000000000001';
const YEAR = schoolYearOf(new Date());
const school: School = { id: SCHOOL, session_id: 'S1', name: 'Braeside Primary School (demo)', demo: true, created_at: T, archived_at: null };
const yearGroup: YearGroup = { id: Y7, session_id: 'S1', school_id: SCHOOL, school_year: YEAR, name: 'P7', note: null, created_at: T, archived_at: null };
const p7a: ClassSummary = { id: C7A, session_id: 'S1', school_id: SCHOOL, school_year: YEAR, starred_at: null, copied_from: null, year_group_id: Y7, name: 'P7A', stage: 'Primary 7, Second level', subject: null, note: null, created_at: T, archived_at: null, pupil_count: 2, needs_counts: { Dyslexia: 1 } };
const starred = (c: ClassSummary): ClassSummary => ({ ...c, starred_at: T });
const s2: ClassSummary = { ...p7a, id: '01JC1ASS00000000000000000S', name: 'S2 Maths', subject: 'Maths', pupil_count: 30, needs_counts: {} };
const pupil = (id: string, label: string, needs: string[], number = 1): Pupil => ({ id, class_id: C7A, number, label, needs, helps: null, working_at: null, note: null, position: 0, created_at: T, archived_at: null });
const pupils = [pupil('01JPUP1L000000000000000001', 'tidy-puffin', ['Dyslexia']), pupil('01JPUP1L000000000000000002', 'jolly-teapot', [], 2)];

function mockApi(list: ClassesList) {
  const snap: CanvasSnapshot = { blocks: [], docs: [testDoc({ id: DOC_ID, name: 'Similes' }), testDoc({ id: CLASS_DOC, thread_id: CLASS_CHAT, name: 'Spelling list' })] };
  const threads: Thread[] = [testThread({ id: THREAD_ID, title: 'Similes', created_at: '2026-11-10T09:00:00.000Z' }), testThread({ id: CLASS_CHAT, title: 'Spelling for P7A', class_id: C7A, created_at: '2026-11-09T09:00:00.000Z' })];
  return {
    sessionId: 'S1',
    getCanvas: vi.fn(() => Promise.resolve(snap)),
    structural: vi.fn(async () => ({ changes: { blocks: [], docs: [] }, block: null, doc: null })),
    listThreads: vi.fn(() => Promise.resolve(threads)),
    renameThread: vi.fn(async (threadId: string, title: string) => ({ ...threads.find((t) => t.id === threadId)!, title })),
    createThread: vi.fn(async (_env: unknown, place?: string | ThreadPlace | null) => ({
      thread: testThread({ id: NEW_CHAT, ...(typeof place === 'object' && place ? place : {}), created_at: '2026-11-12T10:00:00.000Z' }),
      doc: testDoc({ id: NEW_DOC, thread_id: NEW_CHAT }),
    })),
    listClasses: vi.fn(async () => list),
    getClass: vi.fn(async () => ({ class: p7a, year_group: yearGroup, pupils })),
    addDemoClass: vi.fn(async () => p7a),
    createYearGroup: vi.fn(async (fields: { name: string }) => ({ ...yearGroup, name: fields.name })),
    copyClass: vi.fn(async (_id: string, fields: { name?: string }) => ({ ...p7a, id: C7B, name: fields.name ?? 'S1A' })),
    updateClass: vi.fn(async (id: string, fields: { starred?: boolean }) => {
      const { starred: star, ...rest } = fields;
      const c = list.classes.find((x) => x.id === id)!;
      return { ...c, ...rest, ...(star === undefined ? {} : { starred_at: star ? T : null }) };
    }),
    addPupils: vi.fn(async (_c: string, rows: PupilFields[]) => rows.map((_, i) => pupil(`01JPUP1L00000000000000000${i + 3}`, 'brave-kettle', []))),
    updatePupil: vi.fn(async (_c: string, id: string, fields: PupilFields) => ({ ...pupils.find((p) => p.id === id)!, ...fields })),
    archivePupil: vi.fn(async (_c: string, id: string) => ({ ...pupils.find((p) => p.id === id)!, archived_at: T })),
    getChat: vi.fn<SessionApi['getChat']>(() => Promise.resolve([])),
    sendChat: vi.fn<SessionApi['sendChat']>(() => Promise.resolve({ ok: true, turn_id: 't1', message: 'Done.', changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [] })),
    uploadAsset: vi.fn(() => Promise.resolve({ asset_id: 'ast_1' })),
    listComments: vi.fn<SessionApi['listComments']>(() => Promise.resolve([])),
    createComment: vi.fn<SessionApi['createComment']>(),
    deleteComment: vi.fn<SessionApi['deleteComment']>(() => Promise.resolve()),
    editComment: vi.fn<SessionApi['editComment']>(),
    resolveComment: vi.fn<SessionApi['resolveComment']>(),
    answerComment: vi.fn<SessionApi['answerComment']>(),
    assetUrl: (src: string) => src,
  } satisfies SessionApi;
}

async function renderScreen(list: ClassesList = { schools: [school], year_groups: [yearGroup], classes: [p7a] }) {
  const logger = mockLogger();
  const api = mockApi(list);
  const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
  render(<WorkspaceScreen session={makeSession()} api={api} logger={logger} focusState={createFocusPaneState()} context={context} />);
  await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
  await act(async () => undefined);
  return { logger, api };
}

const classesNav = () => within(screen.getByRole('region', { name: 'Classes' }));
const logged = (logger: ReturnType<typeof mockLogger>, kind: string) => logger.log.mock.calls.filter((c) => c[0] === kind).map((c) => c[1]);

describe('classes', () => {
  it('keeps starred classes in the sidebar, with their chats under them, not under Chats', async () => {
    await renderScreen({ schools: [school], year_groups: [yearGroup], classes: [starred(p7a), s2] });
    expect(classesNav().getByRole('button', { name: 'P7A' })).toBeTruthy();
    expect(classesNav().queryByRole('button', { name: 'S2 Maths' })).toBeNull();
    const chats = within(screen.getByRole('region', { name: 'Chats list' }));
    expect(chats.queryByRole('button', { name: 'Spelling for P7A' })).toBeNull();
    expect(chats.getAllByRole('button', { name: 'Similes' }).length).toBeGreaterThan(0);
    fireEvent.click(classesNav().getByRole('button', { name: 'P7A' }));
    expect(within(classesNav().getByRole('list', { name: 'Chats for P7A' })).getByRole('button', { name: 'Spelling for P7A' })).toBeTruthy();
  });

  it('asks for a star when there are classes but none starred', async () => {
    await renderScreen();
    expect(classesNav().getByRole('button', { name: 'Star a class to keep it here' })).toBeTruthy();
  });

  it('offers the demo class when there are none, and opens it once added', async () => {
    const { api, logger } = await renderScreen({ schools: [], year_groups: [], classes: [] });
    fireEvent.click(classesNav().getByRole('button', { name: 'Set up your classes' }));
    expect(screen.getByRole('heading', { level: 1, name: /Classes/ })).toBeTruthy();
    api.listClasses.mockResolvedValue({ schools: [school], year_groups: [yearGroup], classes: [starred(p7a)] });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add the demo class (P7A)' }));
    });
    expect(api.addDemoClass).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { level: 1, name: 'P7A' })).toBeTruthy();
    expect(logged(logger, 'class_open')).toEqual([
      { class_id: null, year_group_id: null },
      { class_id: C7A, year_group_id: null },
    ]);
  });

  it('lists the classes as a table to sort, and stars one from it', async () => {
    const { api } = await renderScreen({ schools: [school], year_groups: [yearGroup], classes: [p7a, s2] });
    fireEvent.click(classesNav().getByRole('button', { name: 'Classes' }));
    const table = within(screen.getByRole('table'));
    const names = () => table.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('button')[1]!.textContent);
    expect(names()).toEqual(['P7A', 'S2 Maths']);
    fireEvent.click(table.getByRole('button', { name: 'Pupils' }));
    expect(names()).toEqual(['S2 Maths', 'P7A']);
    expect(screen.getByText('School:')).toBeTruthy();
    await act(async () => {
      fireEvent.click(table.getByRole('button', { name: 'Star S2 Maths (keep it in the sidebar)' }));
    });
    expect(api.updateClass).toHaveBeenCalledWith(s2.id, { starred: true }, expect.anything());
    expect(classesNav().getByRole('button', { name: 'S2 Maths' })).toBeTruthy();
  });

  it('searches every column from one box at the top, and adds a class from there', async () => {
    await renderScreen({ schools: [school], year_groups: [yearGroup], classes: [p7a, s2] });
    fireEvent.click(classesNav().getByRole('button', { name: 'Classes' }));
    const search = screen.getByRole('searchbox', { name: 'Search classes' });
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => r.textContent);
    fireEvent.change(search, { target: { value: 'maths' } });
    expect(rows()).toEqual([expect.stringContaining('S2 Maths')]);
    // Needs are not shown or searched (#243), even from a server that still counts them.
    fireEvent.change(search, { target: { value: 'dyslexia' } });
    expect(rows()).toEqual([expect.stringContaining('No classes match “dyslexia”')]);
    fireEvent.change(search, { target: { value: '' } });
    expect(rows().join(' ')).not.toContain('Dyslexia');
    // The year group's page gives each class's number of pupils, no counts of needs.
    fireEvent.click(within(screen.getByRole('table')).getAllByRole('button', { name: 'P7' })[0]!);
    const its = await screen.findByRole('region', { name: 'Its classes' });
    expect(its.textContent).toContain('P7A2 pupils');
    expect(its.textContent).not.toContain('Dyslexia');
    fireEvent.click(classesNav().getByRole('button', { name: 'Classes' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search classes' }), { target: { value: 'chemistry' } });
    expect(rows()).toEqual([expect.stringContaining('No classes match “chemistry”')]);

    expect(screen.queryByRole('form', { name: 'New class' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add a class' }));
    expect(screen.getByRole('form', { name: 'New class' })).toBeTruthy();
  });

  it('copies a class to next year: P7 moves up to S1, with its pupils', async () => {
    const { api } = await renderScreen({ schools: [school], year_groups: [yearGroup], classes: [starred(p7a)] });
    fireEvent.click(classesNav().getByRole('button', { name: 'P7A' }));
    fireEvent.click(await screen.findByRole('button', { name: /Copy to \d{4}-\d{2}/ }));
    const form = within(screen.getByRole('form', { name: /Copy P7A to/ }));
    expect((form.getByRole('textbox', { name: /Year group in/ }) as HTMLInputElement).value).toBe('S1');
    expect((form.getByRole('textbox', { name: 'Class name' }) as HTMLInputElement).value).toBe('S1A');
    await act(async () => {
      fireEvent.click(form.getByRole('button', { name: 'Copy with its pupils' }));
    });
    expect(api.copyClass).toHaveBeenCalledWith(C7A, { year_group_name: 'S1', name: 'S1A' }, expect.anything());
  });

  it('shows a class’s pupils by number and label, saves an edited cell, and warns about a label that looks like a name', async () => {
    const { api } = await renderScreen({ schools: [school], year_groups: [yearGroup], classes: [starred(p7a)] });
    fireEvent.click(classesNav().getByRole('button', { name: 'P7A' }));
    const table = within(await screen.findByRole('region', { name: 'Pupils' }));
    expect(await table.findByDisplayValue('tidy-puffin')).toBeTruthy();
    expect(table.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['No.', 'Pupil', 'What helps', 'Note', 'Actions']);
    expect(table.getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['1', '2']);
    // No Needs or Working at, though tidy-puffin has a need stored (#243).
    expect(table.queryByLabelText(/^Needs for/)).toBeNull();
    expect(table.queryByLabelText(/^Working at for/)).toBeNull();
    expect(table.queryByDisplayValue('Dyslexia')).toBeNull();

    const note = table.getByRole('textbox', { name: 'Note for jolly-teapot' });
    fireEvent.change(note, { target: { value: 'Grade F in the latest assessment.' } });
    await act(async () => {
      fireEvent.blur(note);
    });
    expect(api.updatePupil).toHaveBeenCalledWith(C7A, '01JPUP1L000000000000000002', { note: 'Grade F in the latest assessment.' }, expect.anything());

    const label = table.getByRole('textbox', { name: 'Label for tidy-puffin' });
    fireEvent.change(label, { target: { value: 'Callum Reid' } });
    await act(async () => {
      fireEvent.blur(label);
    });
    expect(await table.findByText('This looks like a name. Use a made-up label.')).toBeTruthy();
  });

  it('starts a chat for the class, and the chat links back to it', async () => {
    const { api } = await renderScreen({ schools: [school], year_groups: [yearGroup], classes: [starred(p7a)] });
    fireEvent.click(classesNav().getByRole('button', { name: 'P7A' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Start a chat for P7A' }), { target: { value: 'A spelling list for tidy-puffin' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(api.createThread).toHaveBeenCalledWith(expect.anything(), { class_id: C7A });
    await waitFor(() => expect(api.sendChat).toHaveBeenCalled());
    fireEvent.click(screen.getByTitle('Open the class P7A'));
    expect(screen.getByRole('heading', { level: 1, name: 'P7A' })).toBeTruthy();
  });
});
