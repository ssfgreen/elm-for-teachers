import { useEffect, useState, type Ref } from 'react';
import { BookOpen, Folder, FolderPlus, PanelLeftClose, Puzzle, SlidersHorizontal, SquarePen, type LucideIcon } from 'lucide-react';
import type { Project, Thread } from '@edw/shared';
import { IconButton } from '../editor/Toolbar.js';
import { MakeSlot } from './slots/slots';
import { cn } from '../lib/utils';
import type { DocTree } from './DocsTree';
import { AccountMenu } from './sidebar/AccountMenu';
import { DashboardLink } from './sidebar/DashboardLink';
import { ChatItem, type ChatDocs } from './sidebar/ChatItem';
import { classChatIds, ClassesSection, type ClassesSectionProps } from './sidebar/ClassesSection';
import { CurriculumSection, type CurriculumSectionProps } from './sidebar/CurriculumSection';
import { SectionHeading } from './sidebar/SectionHeading';
import { itemClass, listClass, scrollClass } from './sidebar/styles';

export interface ThreadSidebarProps {
  threads: Thread[];
  activeId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  /** Disables "New chat" while one is being created. */
  busy?: boolean;
  /** Who is using the workspace, shown at the bottom (a link holder is a guest until accounts exist). */
  account: { name: string };
  /** Download everything in the workspace as a zip. */
  onDownloadData: () => Promise<void>;
  panelRef?: Ref<HTMLElement>;
  /**
   * Each chat's documents: the open chat lists them under it, the others show a doc icon
   * that names them on hover. With none given, neither shows.
   */
  docs?: {
    tree: DocTree;
    activeDocId: string | null;
    onOpen: (threadId: string, docId: string) => void;
    /** "…" → Delete, after a Yes. */
    onDelete?: (threadId: string, docId: string) => Promise<void>;
  };
  /** Its width in px while open, when the workspace lets it be resized (a splitter follows it). */
  width?: number;
  /** The projects (archived ones are left out here); with none given, the section is not shown. */
  projects?: Project[];
  /** The project whose page is open, or whose chat is. */
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onNewProject?: () => void;
  /** The New project form is open. */
  newProjectOpen?: boolean;
  /** Opens the Preferences screen; with none given, the entry is not shown. */
  onPreferences?: () => void;
  preferencesOpen?: boolean;
  /** Opens the Plugins screen; with none given, the entry is not shown. */
  onPlugins?: () => void;
  pluginsOpen?: boolean;
  /** Year groups and classes, with their chats under the open one; with none given, the section is not shown. */
  classes?: Pick<ClassesSectionProps, 'list' | 'activeClassId' | 'activeYearGroupId' | 'screenOpen' | 'onOpen'>;
  /** Opens the Pedagogy screen; with none given, the entry is not shown. */
  onPedagogy?: () => void;
  pedagogyOpen?: boolean;
  /** The class in view's curriculum now (under Classes); with none given, not shown. */
  curriculum?: CurriculumSectionProps;
}

/**
 * The chats listed under "Chats": those in no project. A chat in a project is listed on the
 * project's page, unless that project is archived (then it comes back here, so it isn't lost).
 */
export function looseChats(threads: Thread[], projects: Project[]): Thread[] {
  const live = new Set(projects.filter((p) => !p.archived_at).map((p) => p.id));
  return threads.filter((t) => !t.project_id || !live.has(t.project_id));
}

/**
 * Projects (the open one with its chats under it), then the chats in no project, newest first,
 * and the account at the bottom; the open chat has its documents under it.
 */
export function ThreadSidebar({
  threads,
  activeId,
  open,
  onToggle,
  onSelect,
  onNew,
  busy,
  account,
  onDownloadData,
  panelRef,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  newProjectOpen,
  onPreferences,
  preferencesOpen,
  onPlugins,
  pluginsOpen,
  classes,
  onPedagogy,
  pedagogyOpen,
  curriculum,
  width,
  docs,
}: ThreadSidebarProps) {
  // Chats for a class or year group are listed under it, not under Chats.
  const forClasses = classes ? classChatIds(classes.list, threads) : new Set<string>();
  const newest = byNewest(projects ? looseChats(threads, projects) : threads).filter((t) => !forClasses.has(t.id));
  // The open chat or project folded by a click on it; opening another unfolds everything again.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => setFolded(new Set()), [activeId, activeProjectId, classes?.activeClassId, classes?.activeYearGroupId]);
  const toggleFold = (id: string) => setFolded((f) => toggled(f, id));
  // Sections folded by a click on their heading (Projects, Chats); these stay as they are.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSection = (name: string) => setClosed((c) => toggled(c, name));
  // A project is highlighted while its page is open; in one of its chats only the chat is.
  const pageOpen = (projectId: string) =>
    projectId === activeProjectId && !threads.some((t) => t.id === activeId && t.project_id === projectId);
  const docMap = new Map((docs?.tree ?? []).map((g) => [g.thread.id, g.docs]));
  const docsOf = (threadId: string): ChatDocs | undefined =>
    docs
      ? { list: docMap.get(threadId) ?? [], activeDocId: docs.activeDocId, onOpen: docs.onOpen, onDelete: docs.onDelete }
      : undefined;
  const liveProjects = (projects ?? [])
    .filter((p) => !p.archived_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  // Closed, nothing shows: the button to open it is in the header beside it.
  if (!open) return null;
  return (
    <nav
      className={cn(
        'flex h-full w-65 min-w-0 flex-none flex-col border-r border-border bg-panel',
        // With a splitter after it, the splitter is the line between them.
        width !== undefined && 'dock:border-r-0',
      )}
      ref={panelRef}
      style={width !== undefined ? { width } : undefined}
      data-pane="threads"
      aria-label="Chats"
    >
      <div className="flex h-12 flex-none items-center justify-between px-2">
        <IconButton icon={PanelLeftClose} label="Close sidebar" tipAlign="start" onClick={onToggle} />
      </div>
      <div className={scrollClass}>
        {(onPreferences || onPlugins || onPedagogy) && (
          <ul className={listClass}>
            {onPreferences && <ScreenEntry icon={SlidersHorizontal} label="Preferences" open={!!preferencesOpen} onClick={onPreferences} />}
            {onPlugins && <ScreenEntry icon={Puzzle} label="Plugins" open={!!pluginsOpen} onClick={onPlugins} />}
            {onPedagogy && <ScreenEntry icon={BookOpen} label="Pedagogy" open={!!pedagogyOpen} onClick={onPedagogy} />}
          </ul>
        )}
        {classes && (
          <ClassesSection {...classes} threads={threads} activeId={activeId} onSelectChat={onSelect} docsOf={docsOf} folded={folded} onToggleFold={toggleFold} />
        )}
        {curriculum && <CurriculumSection {...curriculum} />}
        {projects && onNewProject && (
          <section aria-label="Projects">
            <SectionHeading
              folded={closed.has('projects')}
              onToggle={() => toggleSection('projects')}
              action={<IconButton icon={FolderPlus} label="New project" active={!!newProjectOpen} onClick={onNewProject} />}
            >
              Projects
            </SectionHeading>
            {!closed.has('projects') && (
            <ul className={listClass}>
              {liveProjects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn(itemClass(pageOpen(p.id)), 'flex items-center gap-2')}
                    aria-current={pageOpen(p.id) ? 'true' : undefined}
                    aria-expanded={p.id === activeProjectId ? !folded.has(p.id) : undefined}
                    title={p.name}
                    // A click on the open project's page folds or unfolds its chats.
                    onClick={() => (pageOpen(p.id) ? toggleFold(p.id) : onSelectProject?.(p.id))}
                  >
                    <Folder
                      size={15}
                      aria-hidden="true"
                      className="flex-none text-foreground-2"
                    />
                    <span className="min-w-0 overflow-hidden text-ellipsis">{p.name}</span>
                  </button>
                  {p.id === activeProjectId && !folded.has(p.id) && (
                    <ul className="m-0 list-none p-0" aria-label={`Chats in ${p.name}`}>
                      {byNewest(threads.filter((t) => t.project_id === p.id)).map((t) => (
                        <ChatItem key={t.id} thread={t} active={t.id === activeId} expanded={!folded.has(t.id)} onToggle={() => toggleFold(t.id)} depth={1} docs={docsOf(t.id)} onSelect={onSelect} />
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            )}
          </section>
        )}
        {/* The make kit's own sections: documents, classes, personalising, skills and prompts. */}
        <MakeSlot zone="docs" />
        <MakeSlot zone="classes" />
        <MakeSlot zone="personalise" />
        <MakeSlot zone="skills" />
        <MakeSlot zone="prompts" />
        <section aria-label="Chats list">
          <SectionHeading
            folded={closed.has('chats')}
            onToggle={() => toggleSection('chats')}
            action={<IconButton icon={SquarePen} label="New chat" disabled={busy} onClick={onNew} />}
          >
            Chats
          </SectionHeading>
          {!closed.has('chats') && (
            <ul className={listClass}>
              {newest.map((t) => (
                <ChatItem key={t.id} thread={t} active={t.id === activeId} expanded={!folded.has(t.id)} onToggle={() => toggleFold(t.id)} docs={docsOf(t.id)} onSelect={onSelect} />
              ))}
            </ul>
          )}
        </section>
        <MakeSlot zone="sidebar" />
      </div>
      <DashboardLink />
      <AccountMenu name={account.name} onDownloadData={onDownloadData} />
    </nav>
  );
}

/** A screen of its own at the top of the sidebar (Preferences, Plugins). */
function ScreenEntry({ icon: Icon, label, open, onClick }: { icon: LucideIcon; label: string; open: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={cn(itemClass(open), 'flex items-center gap-2')} aria-current={open ? 'page' : undefined} onClick={onClick}>
        <Icon size={15} aria-hidden="true" className="flex-none text-foreground-2" />
        {label}
      </button>
    </li>
  );
}

const byNewest = (ts: Thread[]) =>
  [...ts].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

/** The set with `id` taken out if it was in, else put in. */
function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}
