/**
 * A year group's page: its note, its classes with their number of pupils, and the box that
 * starts a chat for the whole year group. Such a chat sees each class's note and pupil count, never
 * pupils (Sam, 12 Nov 2026).
 */
import type { ReactNode } from 'react';
import { CLASS_NAME_MAX, CLASS_NOTE_MAX, type ClassSummary, type Thread, type YearGroup } from '@edw/shared';
import { EditableTitle } from '../../components/EditableTitle';
import { SavedText } from '../../components/SavedText';
import { ArchiveButton } from './ClassPage';
import { ChatList } from './ChatList';
import { cardClass, cardTitleClass, hintClass, screenClass } from './styles';
import type { Classes } from './useClasses';

export interface YearGroupPageProps {
  yearGroup: YearGroup;
  classList: ClassSummary[];
  classes: Classes;
  chats: Thread[];
  onOpenChat: (threadId: string) => void;
  composer: ReactNode;
}

export function YearGroupPage({ yearGroup, classList, classes, chats, onOpenChat, composer }: YearGroupPageProps) {
  return (
    <div className={screenClass}>
      <div className="mx-auto flex max-w-270 flex-col gap-6 px-6 py-10">
        <nav aria-label="Breadcrumbs" className="flex gap-1 text-sm text-muted-foreground">
          <button type="button" className="border-0 bg-transparent p-0 hover:text-foreground" onClick={() => classes.showClasses()}>
            Classes
          </button>
          <span aria-hidden="true">/</span>
          <span>{yearGroup.school_year}</span>
        </nav>
        <div className="flex items-start gap-8 max-lg:flex-col max-lg:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <header className="flex items-start justify-between gap-4">
              <EditableTitle
                itemKey={yearGroup.id}
                value={yearGroup.name}
                onRename={(name) => void classes.updateYearGroup(yearGroup.id, { name })}
                as="h1"
                className="m-0 text-3xl leading-tight font-semibold"
                inputClassName="w-full rounded-sm border border-border-strong px-1.25 py-0.5 text-3xl font-semibold"
                inputLabel="Year group name"
                maxLength={CLASS_NAME_MAX}
              />
              <ArchiveButton what="year group" onArchive={() => classes.archiveYearGroup(yearGroup.id)} />
            </header>
            {composer}
            <ChatList chats={chats} onOpenChat={onOpenChat} empty={`No chats yet. A chat here is for all of ${yearGroup.name}; for one class, start it from the class.`} />
          </div>
          <aside className="flex w-80 flex-none flex-col gap-4 max-lg:w-full" aria-label="About the year group">
            <section className={cardClass} aria-label="About this year group">
              <h2 className={cardTitleClass}>About this year group</h2>
              <p className={hintClass}>Shared by its classes’ chats too.</p>
              <SavedText
                key={`n-${yearGroup.id}`}
                label="About this year group"
                className="w-full resize-none rounded-md border border-border-strong bg-card px-2.5 py-2.25 text-md"
                placeholder="For example: transition to S1 in June; topic this term is the Vikings."
                value={yearGroup.note}
                maxLength={CLASS_NOTE_MAX}
                onSave={(note) => classes.updateYearGroup(yearGroup.id, { note })}
                boxed
              />
            </section>
            <section className={cardClass} aria-label="Its classes">
              <h2 className={cardTitleClass}>Its classes</h2>
              {classList.length === 0 && <p className={hintClass}>None yet. Add one on the Classes page, in {yearGroup.school_year}.</p>}
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {classList.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="w-full rounded-sm border-0 bg-transparent px-1 py-1 text-left hover:bg-hover" onClick={() => classes.showClasses({ classId: c.id })}>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-sm text-muted-foreground">{c.pupil_count ? `${c.pupil_count} pupils` : 'No pupils yet'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
