/**
 * The open chat's class and year group, and what the workspace shows from them: the crumb before
 * the chat's name, the chat's mentions, the sidebar's Classes and Curriculum sections, and Ideas
 * on a curriculum outcome. Moved out of WorkspaceScreen as it was (no change in behaviour).
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { curriculumEntryId, type Project, type Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { ThreadSidebarProps } from '../components/ThreadSidebar';
import type { Classes } from './classes/useClasses';
import type { MainView } from './mainView';
import { useChatMentions } from './useChatMentions';

export interface ClassContextArgs {
  api: SessionApi;
  classes: Classes;
  activeThread: Thread | undefined;
  /** The open chat's project: it comes before a class in the crumb. */
  activeProject: Project | undefined;
  showProject: (id: string) => void;
  view: MainView;
  setView: Dispatch<SetStateAction<MainView>>;
  /** The chat and its doc are showing. */
  inEditor: boolean;
  /** Wraps a sidebar pick, so the sidebar closes when it is a drawer. */
  fromSidebar: <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => void;
}

export function useClassContext({ api, classes, activeThread, activeProject, showProject, view, setView, inEditor, fromSidebar }: ClassContextArgs) {
  const { list, showClasses } = classes;
  const activeClass = activeThread?.class_id ? list.classes.find((c) => c.id === activeThread.class_id && !c.archived_at) : undefined;
  const activeYear = activeThread?.year_group_id ? list.year_groups.find((y) => y.id === activeThread.year_group_id && !y.archived_at) : undefined;
  // Before the chat's name: its project, class or year group.
  const crumb = activeProject
    ? { name: activeProject.name, title: `Open the project ${activeProject.name}`, onOpen: () => showProject(activeProject.id) }
    : activeClass
      ? { name: activeClass.name, title: `Open the class ${activeClass.name}`, onOpen: () => showClasses({ classId: activeClass.id }) }
      : activeYear
        ? { name: activeYear.name, title: `Open the year group ${activeYear.name}`, onOpen: () => showClasses({ yearGroupId: activeYear.id }) }
        : undefined;
  const classView = view.kind === 'classes' ? view : null;
  const mentions = useChatMentions(api, activeClass, setView);
  // Ideas on a curriculum outcome: the pedagogy that aligns to it.
  const showIdeas = useCallback((code: string) => setView({ kind: 'pedagogy', alignsTo: code.split('/').map(curriculumEntryId), code }), [setView]);

  const curriculum: ThreadSidebarProps['curriculum'] = classes.available
    ? {
        list,
        activeClassId: classView?.classId ?? (inEditor ? (activeClass?.id ?? null) : null),
        api,
        onOpenClass: fromSidebar((id: string) => showClasses({ classId: id })),
        onOpenCurriculum: fromSidebar((classId: string, code?: string) => setView({ kind: 'curriculum', classId, code })),
      }
    : undefined;
  const sidebarClasses: ThreadSidebarProps['classes'] = classes.available
    ? {
        list,
        activeClassId: classView ? (classView.classId ?? null) : inEditor ? (activeClass?.id ?? null) : null,
        activeYearGroupId: classView ? (classView.yearGroupId ?? null) : inEditor ? (activeYear?.id ?? null) : null,
        screenOpen: !!classView && !classView.classId && !classView.yearGroupId,
        onOpen: fromSidebar(showClasses),
      }
    : undefined;

  return { crumb, mentions, showIdeas, sidebar: { curriculum, classes: sidebarClasses } };
}
