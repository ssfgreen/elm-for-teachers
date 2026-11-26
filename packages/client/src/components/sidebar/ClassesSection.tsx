/**
 * The sidebar's Classes section (docs/classes.md): the teacher's starred classes this school year,
 * so a primary teacher's one class is a click away. The heading "Classes" opens the full list (a secondary
 * teacher's many classes, sortable there). A class or year group whose page is open, or whose
 * chat is, shows here too while it is, with its chats under it as an open project's are.
 */
import { GraduationCap, Users } from 'lucide-react';
import { schoolYearOf, type ClassesList, type Thread } from '@edw/shared';
import { cn } from '../../lib/utils';
import { starredClasses } from '../../state/classList';
import { ChatItem, type ChatDocs } from './ChatItem';
import { SectionHeading } from './SectionHeading';
import { itemClass, listClass } from './styles';

export interface ClassesSectionProps {
  list: ClassesList;
  threads: Thread[];
  /** The open chat. */
  activeId: string | null;
  /** The page open (a class's or a year group's), or the class or year group of the open chat. */
  activeClassId: string | null;
  activeYearGroupId: string | null;
  /** The Classes list itself is open. */
  screenOpen: boolean;
  onOpen: (to: { classId?: string; yearGroupId?: string }) => void;
  onSelectChat: (threadId: string) => void;
  docsOf: (threadId: string) => ChatDocs | undefined;
  folded: ReadonlySet<string>;
  onToggleFold: (id: string) => void;
  /** Today, for the current school year (tests pass their own). */
  now?: Date;
}

/** Chats for a class or year group not archived: listed under it, not under Chats. */
export function classChatIds(list: ClassesList, threads: Thread[]): Set<string> {
  const classes = new Set(list.classes.filter((c) => !c.archived_at).map((c) => c.id));
  const years = new Set(list.year_groups.filter((y) => !y.archived_at).map((y) => y.id));
  return new Set(threads.filter((t) => (t.class_id && classes.has(t.class_id)) || (t.year_group_id && years.has(t.year_group_id))).map((t) => t.id));
}

export function ClassesSection({ list, threads, activeId, activeClassId, activeYearGroupId, screenOpen, onOpen, onSelectChat, docsOf, folded, onToggleFold, now = new Date() }: ClassesSectionProps) {
  const starred = starredClasses(list, schoolYearOf(now));
  const extraClass = activeClassId && !starred.some((c) => c.id === activeClassId) ? list.classes.find((c) => c.id === activeClassId && !c.archived_at) : undefined;
  const items = [...starred, ...(extraClass ? [extraClass] : [])].map((c) => ({ kind: 'class' as const, id: c.id, name: c.name, title: `${c.name}, ${c.school_year}` }));
  const year = activeYearGroupId ? list.year_groups.find((y) => y.id === activeYearGroupId && !y.archived_at) : undefined;
  if (year) items.push({ kind: 'class' as const, id: year.id, name: year.name, title: `${year.name} (the whole year group), ${year.school_year}` });
  const inChat = threads.some((t) => t.id === activeId && (t.class_id || t.year_group_id));
  const anyClasses = list.classes.some((c) => !c.archived_at);
  const chatsOf = (id: string) =>
    threads.filter((t) => t.class_id === id || t.year_group_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

  return (
    <section aria-label="Classes">
      <SectionHeading title="All your classes" current={screenOpen} onOpen={() => onOpen({})}>
        Classes
      </SectionHeading>
      <ul className={listClass}>
        {items.length === 0 && (
          <li>
            <button type="button" className={cn(itemClass(false), 'text-md text-muted-foreground')} onClick={() => onOpen({})}>
              {anyClasses ? 'Star a class to keep it here' : 'Set up your classes'}
            </button>
          </li>
        )}
        {items.map((item) => {
          const isYear = item.id === year?.id;
          const open = isYear || item.id === activeClassId;
          const here = open && !inChat;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={cn(itemClass(here), 'flex items-center gap-2')}
                aria-current={here ? 'true' : undefined}
                title={item.title}
                onClick={() => (here ? onToggleFold(item.id) : onOpen(isYear ? { yearGroupId: item.id } : { classId: item.id }))}
              >
                {isYear ? <GraduationCap size={15} aria-hidden="true" className="flex-none text-foreground-2" /> : <Users size={15} aria-hidden="true" className="flex-none text-foreground-2" />}
                <span className="min-w-0 overflow-hidden text-ellipsis">{item.name}</span>
              </button>
              {open && !folded.has(item.id) && (
                <ul className="m-0 list-none p-0" aria-label={`Chats for ${item.name}`}>
                  {chatsOf(item.id).map((t) => (
                    <ChatItem key={t.id} thread={t} active={t.id === activeId} expanded={!folded.has(t.id)} onToggle={() => onToggleFold(t.id)} depth={1} docs={docsOf(t.id)} onSelect={onSelectChat} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
