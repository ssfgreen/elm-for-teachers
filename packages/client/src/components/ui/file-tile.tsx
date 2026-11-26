/**
 * File tiles, like Claude's: used by the chat box, sent messages and the New project form.
 */
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/** The row of file tiles: above the message box, above a sent message, in the New project form. */
export const fileTilesClass = 'm-0 flex list-none items-end gap-2 overflow-x-auto overscroll-x-contain';

/**
 * A file added with "+", as a tile like Claude's: a small card with the name and a type badge,
 * and a round cross at its corner on hover. `small` is the tile on a sent message.
 * `file-tile-name` and `file-tile-badge` are hooks for the tests.
 */
export function FileTile({
  name,
  badge,
  error,
  reading = false,
  small = false,
  title,
  onRemove,
  removeDisabled,
}: {
  name: string;
  badge?: string;
  error?: string;
  reading?: boolean;
  small?: boolean;
  title?: string;
  onRemove?: () => void;
  removeDisabled?: boolean;
}) {
  const failed = error !== undefined;
  return (
    <li
      className={cn(
        'group/tile relative flex size-30 flex-none flex-col justify-between gap-1.5 rounded-md bg-card p-2.75 text-xs leading-snug shadow-card inset-ring inset-ring-border-strong',
        small && 'size-26',
        failed && 'w-50 bg-destructive-soft shadow-none inset-ring-destructive-border',
      )}
      title={title}
    >
      <span className={cn('file-tile-name', 'line-clamp-4 wrap-anywhere text-foreground')}>{name}</span>
      {failed ? (
        <span className="line-clamp-4 text-2xs text-destructive" role="alert">
          {error}
        </span>
      ) : (
        <span
          className={cn(
            'file-tile-badge',
            'max-w-full self-start truncate rounded-full bg-hover px-1.5 py-px text-2xs font-medium text-foreground-2',
            reading && 'text-muted-foreground',
          )}
        >
          {badge}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className={cn(
            'absolute -top-2 -right-2 inline-grid size-5 cursor-pointer place-items-center rounded-full border-0 bg-card p-0 text-foreground-2 opacity-0 ring-1 ring-border-strong transition-opacity duration-100 ease-out group-hover/tile:opacity-100 hover:enabled:text-foreground focus-visible:opacity-100 disabled:hidden touch:opacity-100',
            failed && 'opacity-100',
          )}
          aria-label={`Remove ${name}`}
          disabled={removeDisabled}
          onClick={onRemove}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
