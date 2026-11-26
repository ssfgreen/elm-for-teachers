/**
 * What the main area shows instead of the chat and its doc: Plugins, Preferences, Pedagogy, the
 * Curriculum, Classes, the New project form or a project's page. Moved out of WorkspaceScreen as
 * it was (no change in behaviour).
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Project, Thread } from '@edw/shared';
import type { ThreadPlace } from '../api/classes';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import type { AttachedFile, ChatComposerProps } from '../components/ChatComposer';
import type { EventLogger } from '../events/logger';
import type { ClipboardMarker } from '../events/trackers';
import { ClassesScreen } from './classes/ClassesScreen';
import type { Classes } from './classes/useClasses';
import { CurriculumScreen } from './curriculum/CurriculumScreen';
import { classForCurriculum } from './curriculum/groupOutcomes';
import type { MainView } from './mainView';
import { NeedsGroupsScreen } from './needs-groups/NeedsGroupsScreen';
import { PedagogyScreen } from './pedagogy/PedagogyScreen';
import { PluginsScreen } from './plugins/PluginsScreen';
import { PreferencesScreen } from './preferences/PreferencesScreen';
import { NewProjectForm } from './ProjectScreens';
import { ProjectView } from './ProjectView';
import type { useProjects } from './useProjects';

export interface MainViewsProps {
  view: MainView;
  setView: Dispatch<SetStateAction<MainView>>;
  /** The project whose page is showing, when the view is a project's and it still exists. */
  pageProject: Project | undefined;
  api: SessionApi;
  getEnvelope: () => Envelope;
  logger: EventLogger;
  batchMs: number;
  clipboard: { current: ClipboardMarker | null };
  bar: ChatComposerProps['bar'];
  classes: Classes;
  projects: ReturnType<typeof useProjects>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  openRef: MutableRefObject<{ threadId: string; docId: string } | null>;
  newThread: (place?: ThreadPlace) => Promise<unknown>;
  selectThread: (threadId: string) => void;
  startProjectChat: (place: string | ThreadPlace, text: string, attached: AttachedFile[]) => Promise<void>;
  addProjectChatFile: (place: string | ThreadPlace, file: File) => Promise<AttachedFile>;
  showIdeas: (code: string) => void;
}

export function MainViews({ view, setView, pageProject, api, getEnvelope, logger, batchMs, clipboard, bar, classes, projects, threads, setThreads, openRef, newThread, selectThread, startProjectChat, addProjectChatFile, showIdeas }: MainViewsProps) {
  // A deleted project's chats leave the list; if one was open, a new chat takes its place.
  const dropChats = useCallback(
    (ids: string[]) => {
      setThreads((ts) => ts.filter((t) => !ids.includes(t.id)));
      if (openRef.current && ids.includes(openRef.current.threadId)) void newThread();
    },
    [setThreads, openRef, newThread],
  );
  const classView = view.kind === 'classes' ? view : null;
  return (
    <>
      {view.kind === 'plugins' && <PluginsScreen api={api} getEnvelope={getEnvelope} />}
      {view.kind === 'preferences' && <PreferencesScreen api={api} getEnvelope={getEnvelope} />}
      {view.kind === 'needs-groups' && (
        <NeedsGroupsScreen api={api} getEnvelope={getEnvelope} classes={classes.list.classes} onStartChat={(place) => void newThread(place)} />
      )}
      {view.kind === 'pedagogy' && <PedagogyScreen api={api} logger={logger} alignsTo={view.alignsTo} alignsLabel={view.code} />}
      {view.kind === 'curriculum' && <CurriculumScreen api={api} cls={classForCurriculum(classes.list, view.classId)} code={view.code} onIdeas={showIdeas} />}
      {classView && (
        <ClassesScreen
          classes={classes} classId={classView.classId} yearGroupId={classView.yearGroupId} threads={threads} api={api} getEnvelope={getEnvelope} onOpenChat={selectThread} onIdeas={api.pedagogyInfo ? showIdeas : undefined}
          chat={{ logger, batchMs, getClipboard: () => clipboard.current, bar, addFile: api.addChatFile ? addProjectChatFile : undefined, removeFile: (id) => void api.deleteReference?.(id, getEnvelope()).catch(() => undefined), start: startProjectChat }}
        />
      )}
      {view.kind === 'new-project' && <NewProjectForm onCreate={projects.createProject} onCancel={() => setView({ kind: 'editor' })} />}
      {pageProject && (
        <ProjectView
          project={pageProject} threads={threads} api={api} getEnvelope={getEnvelope} logger={logger} batchMs={batchMs}
          getClipboard={() => clipboard.current} bar={bar} projects={projects} onChatsGone={dropChats} onOpenChat={selectThread} startProjectChat={startProjectChat} addProjectChatFile={addProjectChatFile}
        />
      )}
    </>
  );
}
