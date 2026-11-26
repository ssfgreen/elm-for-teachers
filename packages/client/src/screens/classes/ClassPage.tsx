/**
 * A class's page: its name across the top, then its lists (chats, pupils) in the main column and a
 * sidebar on the right with its details, the box that starts a chat for it, its curriculum and
 * what is kept (option B, docs/classes.md). When the page is narrower than 62rem the sidebar goes under the lists.
 */
import { useState, type ReactNode } from 'react';
import {
  CLASS_NAME_MAX,
  nextSchoolYear,
  type ClassSummary,
  type Thread,
  type YearGroup,
} from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { EditableTitle } from '../../components/EditableTitle';
import { Button } from '../../components/ui/button';
import { ClassLists } from './ClassLists';
import { StarButton } from './ClassesTable';
import { ClassSidebar } from './ClassSidebar';
import { CopyToNextYear } from './CopyToNextYear';
import { ViewAsPupilButton } from './view-as-pupil/ViewAsPupilButton';
import { cn } from '../../lib/utils';
import { screenClass } from './styles';
import type { Classes } from './useClasses';

export interface ClassPageProps {
  cls: ClassSummary;
  yearGroups: YearGroup[];
  otherClasses: ClassSummary[];
  classes: Classes;
  chats: Thread[];
  api: SessionApi;
  getEnvelope: () => Envelope;
  onOpenChat: (threadId: string) => void;
  composer: ReactNode;
  /** Ideas on a curriculum item: the pedagogy that aligns to it. */
  onIdeas?: (code: string) => void;
}

export function ClassPage({
  cls,
  yearGroups,
  otherClasses,
  classes,
  chats,
  api,
  getEnvelope,
  onOpenChat,
  composer,
  onIdeas,
}: ClassPageProps) {
  const update = (fields: Parameters<Classes['updateClass']>[1]) =>
    classes.updateClass(cls.id, fields);
  const yearGroup = yearGroups.find((y) => y.id === cls.year_group_id);
  return (
    // A container, so the sidebar stacks by the page's own width, not the window's: the page
    // sits beside the workspace's sidebar (docs/STYLING.md).
    <div className={cn(screenClass, '@container')}>
      <div className="mx-auto flex max-w-320 flex-col gap-6 px-6 py-10">
        <nav aria-label="Breadcrumbs" className="flex gap-1 text-sm text-muted-foreground">
          <button
            type="button"
            className="border-0 bg-transparent p-0 hover:text-foreground"
            onClick={() => classes.showClasses()}
          >
            Classes
          </button>
          <span aria-hidden="true">/</span>
          <span>{cls.school_year}</span>
          <span aria-hidden="true">/</span>
          {yearGroup && (
            <button
              type="button"
              className="border-0 bg-transparent p-0 hover:text-foreground"
              onClick={() => classes.showClasses({ yearGroupId: yearGroup.id })}
            >
              {yearGroup.name}
            </button>
          )}
        </nav>
        {/* The copy form, when open, takes a row of its own under the name. */}
        <header className="flex flex-wrap items-start gap-x-2 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <StarButton
              name={cls.name}
              starred={!!cls.starred_at}
              size={20}
              onToggle={() => void update({ starred: !cls.starred_at })}
            />
            <EditableTitle
              itemKey={cls.id}
              value={cls.name}
              onRename={(name) => void update({ name })}
              as="h1"
              className="m-0 text-3xl leading-tight font-semibold"
              inputClassName="w-full rounded-sm border border-border-strong px-1.25 py-0.5 text-3xl font-semibold"
              inputLabel="Class name"
              maxLength={CLASS_NAME_MAX}
            />
          </div>
          <CopyToNextYear
            cls={cls}
            yearGroupName={yearGroup?.name ?? ''}
            toYear={nextSchoolYear(cls.school_year)}
            onCopy={(fields) => classes.copyClass(cls.id, fields)}
          />
          <ViewAsPupilButton classId={cls.id} archived={!!cls.archived_at} api={api} getEnvelope={getEnvelope} />
          <ArchiveButton what="class" onArchive={() => classes.archiveClass(cls.id)} />
        </header>
        <div className="flex items-start gap-8 @max-[62rem]:flex-col @max-[62rem]:items-stretch">
          <ClassLists
            cls={cls}
            otherClasses={otherClasses}
            classes={classes}
            chats={chats}
            api={api}
            getEnvelope={getEnvelope}
            onOpenChat={onOpenChat}
          />
          <ClassSidebar
            cls={cls}
            yearGroups={yearGroups}
            update={update}
            classes={classes}
            api={api}
            getEnvelope={getEnvelope}
            onIdeas={onIdeas}
            composer={composer}
          />
        </div>
      </div>
    </div>
  );
}

/** Archive, after a second click to confirm (its chats are kept). */
export function ArchiveButton({
  what,
  onArchive,
}: {
  what: string;
  onArchive: () => Promise<void>;
}) {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'failed'>('idle');
  if (state === 'idle') {
    return (
      <Button variant="ghost" size="sm" onClick={() => setState('confirm')}>
        Archive
      </Button>
    );
  }
  return (
    <div
      className="flex flex-none items-center gap-2 text-sm"
      role="group"
      aria-label={`Archive ${what}`}
    >
      <span>
        {state === 'failed'
          ? 'It could not be archived.'
          : `Archive this ${what}? Its chats are kept.`}
      </span>
      <Button
        size="sm"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          onArchive().catch(() => setState('failed'));
        }}
      >
        Archive
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setState('idle')}>
        Cancel
      </Button>
    </div>
  );
}
