/** Shared looks for the sidebar's lists and menus. */
import { cn } from '../../lib/utils';

export const sectionClass = 'mt-2 flex items-center gap-1 px-2';
/** A section's heading (SectionHeading): the same size as the rows, so it reads as something to click. */
export const headingButtonClass =
  'flex w-full min-w-0 items-center gap-1.5 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-base font-medium text-foreground-2 hover:bg-hover hover:text-foreground';
export const listClass = 'm-0 list-none px-2 py-1';
export const itemClass = (active: boolean) =>
  cn(
    'block w-full truncate rounded-sm border-0 bg-transparent px-2.5 py-1.75 text-left text-base text-foreground',
    active ? 'bg-pressed font-medium' : 'hover:bg-hover',
  );
export const scrollClass = 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4';
export const menuItem =
  'flex w-full items-center gap-2 rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-base text-foreground hover:bg-hover';
export const docPopClass = 'absolute top-full right-1 z-40 mt-0.5 w-56 rounded-md border border-border bg-card p-1 shadow-float';
