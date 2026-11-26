/** What the main area shows: the chat and its doc, the New project form, a project's page, Preferences, Plugins, Classes (a class's or year group's page), Pedagogy, or the Curriculum for a class. */
export type MainView =
  | { kind: 'editor' }
  | { kind: 'new-project' }
  | { kind: 'project'; id: string }
  | { kind: 'plugins' }
  | { kind: 'preferences' }
  | { kind: 'classes'; classId?: string; yearGroupId?: string }
  | { kind: 'needs-groups' }
  | { kind: 'pedagogy'; alignsTo?: string[]; code?: string }
  | { kind: 'curriculum'; classId: string; code?: string };
