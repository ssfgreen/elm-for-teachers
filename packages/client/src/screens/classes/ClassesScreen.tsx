/**
 * The Classes screen (docs/classes.md): the list of classes by school year (ClassesTable), and a
 * class's or a year group's page. A chat started from a page is for that class or year group, and the assistant is
 * told about it. The demo class is the study's fictional P7A, names left out.
 */
import type { Thread } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { ClassPage } from './ClassPage';
import { ClassesTable } from './ClassesTable';
import { PlaceComposer, type PlaceChat } from './PlaceComposer';
import { YearGroupPage } from './YearGroupPage';
import type { Classes } from './useClasses';

export interface ClassesScreenProps {
  classes: Classes;
  /** A class's page, a year group's, or (neither) the list. */
  classId?: string;
  yearGroupId?: string;
  threads: Thread[];
  api: SessionApi;
  getEnvelope: () => Envelope;
  onOpenChat: (threadId: string) => void;
  /** What the box that starts a chat for a class or year group needs. */
  chat: PlaceChat;
  /** Ideas on a curriculum item: the pedagogy that aligns to it. */
  onIdeas?: (code: string) => void;
}

export function ClassesScreen({ classes, classId, yearGroupId, threads, api, getEnvelope, onOpenChat, chat, onIdeas }: ClassesScreenProps) {
  const { list } = classes;
  const cls = classId ? list.classes.find((c) => c.id === classId) : undefined;
  if (cls) {
    return (
      <ClassPage
        key={cls.id}
        cls={cls}
        // A class moves only within its school and school year; so do its pupils.
        yearGroups={list.year_groups.filter((y) => !y.archived_at && y.school_id === cls.school_id && y.school_year === cls.school_year)}
        otherClasses={list.classes.filter((c) => c.id !== cls.id && !c.archived_at && c.school_year === cls.school_year)}
        classes={classes}
        chats={threads.filter((t) => t.class_id === cls.id)}
        api={api}
        getEnvelope={getEnvelope}
        onOpenChat={onOpenChat}
        composer={<PlaceComposer key={cls.id} chat={chat} place={{ class_id: cls.id }} name={cls.name} />}
        onIdeas={onIdeas}
      />
    );
  }
  const yg = yearGroupId ? list.year_groups.find((y) => y.id === yearGroupId) : undefined;
  if (yg) {
    return (
      <YearGroupPage
        key={yg.id}
        yearGroup={yg}
        classList={list.classes.filter((c) => c.year_group_id === yg.id && !c.archived_at)}
        classes={classes}
        chats={threads.filter((t) => t.year_group_id === yg.id)}
        onOpenChat={onOpenChat}
        composer={<PlaceComposer key={yg.id} chat={chat} place={{ year_group_id: yg.id }} name={yg.name} />}
      />
    );
  }
  return <ClassesTable classes={classes} />;
}
