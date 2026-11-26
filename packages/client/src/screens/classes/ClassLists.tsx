/**
 * The main column of a class's page: its lists: the chats (short, so first), the readings and
 * the pupils. Progress is to join them here, as a section of its own.
 */
import type { ClassSummary, Thread } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import { hasReadings } from '../../api/readings';
import type { Envelope } from '../../api/types';
import { ChatList } from './ChatList';
import { PupilTable } from './PupilTable';
import { ReadingsSection } from './readings/ReadingsSection';
import type { Classes } from './useClasses';

export interface ClassListsProps {
  cls: ClassSummary;
  otherClasses: ClassSummary[];
  classes: Classes;
  chats: Thread[];
  api: SessionApi;
  getEnvelope: () => Envelope;
  onOpenChat: (threadId: string) => void;
}

export function ClassLists({
  cls,
  otherClasses,
  classes,
  chats,
  api,
  getEnvelope,
  onOpenChat,
}: ClassListsProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <ChatList
        chats={chats}
        onOpenChat={onOpenChat}
        empty={`No chats yet. Start one with the chat box: the assistant will know it is for ${cls.name}.`}
      />
      {hasReadings(api) && <ReadingsSection classId={cls.id} api={api} getEnvelope={getEnvelope} />}
      <PupilTable
        classId={cls.id}
        otherClasses={otherClasses}
        api={api}
        getEnvelope={getEnvelope}
        onChanged={() => void classes.refresh()}
      />
    </div>
  );
}
