import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassSummary, Pupil, Thread, YearGroup } from '@edw/shared';
import type { ClassDetail } from '../../api/classes';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { testThread } from '../../test-utils';
import { ClassLists } from './ClassLists';
import { ClassSidebar } from './ClassSidebar';
import type { Classes } from './useClasses';

afterEach(cleanup);

const T = '2026-11-12T09:00:00.000Z';
const C1 = '01JC1ASS0000000000000000L1';
const Y7 = '01JYEAR00000000000000000L1';
const Y8 = '01JYEAR00000000000000000L2';
const yg = (id: string, name: string) => ({ id, name }) as YearGroup;
const cls = {
  id: C1,
  name: 'P7A',
  stage: 'Primary 7',
  subject: null,
  note: null,
  year_group_id: Y7,
} as ClassSummary;
const pupil = (id: string, label: string): Pupil => ({
  id,
  class_id: C1,
  number: 1,
  label,
  needs: [],
  helps: null,
  working_at: null,
  note: null,
  position: 0,
  created_at: T,
  archived_at: null,
});

function mockApi() {
  const detail: ClassDetail = {
    class: cls,
    year_group: null,
    pupils: [pupil('p1', 'tidy-puffin')],
    adaptations: [],
    curriculum: [],
  };
  return { getClass: vi.fn(async () => detail) } as unknown as SessionApi;
}

const classes = { refresh: vi.fn(async () => undefined) } as unknown as Classes;
const envelope = () => ({}) as Envelope;

/** True when `a` comes before `b` in the page. */
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('ClassLists', () => {
  const renderLists = async (chats: Thread[], onOpenChat = vi.fn()) => {
    await act(async () => {
      render(
        <ClassLists
          cls={cls}
          otherClasses={[]}
          classes={classes}
          chats={chats}
          api={mockApi()}
          getEnvelope={envelope}
          onOpenChat={onOpenChat}
        />,
      );
    });
  };

  it('shows the chats, newest first, then the pupils', async () => {
    const onOpenChat = vi.fn();
    await renderLists(
      [
        testThread({
          id: 'old',
          title: 'Older chat',
          class_id: C1,
          created_at: '2026-11-01T09:00:00.000Z',
        }),
        testThread({
          id: 'new',
          title: 'Newer chat',
          class_id: C1,
          created_at: '2026-11-10T09:00:00.000Z',
        }),
      ],
      onOpenChat,
    );
    const pupils = screen.getByRole('region', { name: 'Pupils' });
    const chats = screen.getByRole('region', { name: 'Chats' });
    expect(before(chats, pupils)).toBe(true);
    expect(await within(pupils).findByDisplayValue('tidy-puffin')).toBeTruthy();
    const items = within(chats).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Newer chat'),
      expect.stringContaining('Older chat'),
    ]);
    fireEvent.click(items[0]!);
    expect(onOpenChat).toHaveBeenCalledWith('new');
  });

  it('says where to start a chat when there are none, naming the class', async () => {
    await renderLists([]);
    expect(
      screen.getByText(
        'No chats yet. Start one with the chat box: the assistant will know it is for P7A.',
      ),
    ).toBeTruthy();
  });
});

describe('ClassSidebar', () => {
  const renderSidebar = async (update = vi.fn(async () => undefined)) => {
    await act(async () => {
      render(
        <ClassSidebar
          cls={cls}
          yearGroups={[yg(Y7, 'P7'), yg(Y8, 'P7/6')]}
          update={update}
          classes={classes}
          api={mockApi()}
          getEnvelope={envelope}
          composer={<textarea aria-label="Start a chat for P7A" />}
        />,
      );
    });
    return update;
  };

  it('holds the details, the chat box, the note, the curriculum and what is kept, in that order', async () => {
    await renderSidebar();
    const aside = screen.getByRole('complementary', { name: 'About the class' });
    const names = within(aside)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(names).toEqual([
      'Class details',
      'Ask or start a chat',
      'About this class',
      'Curriculum',
      'What is kept',
    ]);
    const chatBox = within(aside).getByRole('region', { name: 'Ask or start a chat' });
    expect(within(chatBox).getByLabelText('Start a chat for P7A')).toBeTruthy();
    expect(within(chatBox).getByText('The assistant will know the chat is for P7A.')).toBeTruthy();
  });

  it('saves the stage and the year group from the details', async () => {
    const update = await renderSidebar();
    const details = screen.getByRole('region', { name: 'Class details' });
    const stage = within(details).getByLabelText('Stage');
    fireEvent.change(stage, { target: { value: 'Primary 7, Second level' } });
    await act(async () => {
      fireEvent.blur(stage);
    });
    expect(update).toHaveBeenCalledWith({ stage: 'Primary 7, Second level' });
    fireEvent.change(within(details).getByLabelText('Year group'), { target: { value: Y8 } });
    expect(update).toHaveBeenCalledWith({ year_group_id: Y8 });
  });
});
