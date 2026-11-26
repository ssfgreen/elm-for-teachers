/** Shared looks and wording for the class screens. */
import { cn } from '../../lib/utils';

/** The scrolling pane each screen fills (as a project's page). */
export const screenClass = 'min-w-0 flex-1 overflow-y-auto bg-background';
export const cardClass = 'flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4 shadow-card';
export const cardTitleClass = 'm-0 text-base font-semibold';
export const hintClass = 'm-0 text-sm text-foreground-2';
export const fieldClass = (wide = false) => cn('w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-md hover:border-border focus:border-border-strong focus:bg-card', wide && 'min-w-40');

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
