/** Shared classes for the admin screen's cards and table. */
export const cardClass = 'mb-4 rounded-lg border border-border bg-card px-5 py-4.5 shadow-card';
export const thClass =
  'border-b border-border px-2.5 py-1.75 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase';
/** The card around the workspace table: on a narrow screen the table scrolls sideways inside it, not the page. */
export const tableCardClass = `${cardClass} overflow-x-auto`;
export const tdClass = 'border-b border-border px-2.5 py-1.75 text-left group-last/row:border-b-0';
export const linkClass = 'text-primary hover:text-primary-hover';
