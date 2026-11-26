/**
 * A sidebar section's heading, which is a button (teachers expect to click "Classes" to get to
 * their classes). It either opens a page (`onOpen`) or, for a section with no page of its own,
 * folds and unfolds the list under it (`folded` and `onToggle`). An action, such as New chat,
 * can sit at the end of the row.
 */
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { headingButtonClass, sectionClass } from './styles';

type Behaviour =
  | { onOpen: () => void; current?: boolean; folded?: never; onToggle?: never }
  | { onToggle: () => void; folded: boolean; onOpen?: never; current?: never };

export type SectionHeadingProps = Behaviour & {
  children: ReactNode;
  /** Shown on hover. */
  title?: string;
  action?: ReactNode;
};

export function SectionHeading({ children, title, action, ...b }: SectionHeadingProps) {
  const folds = b.onToggle !== undefined;
  return (
    <div className={sectionClass}>
      <h3 className="m-0 flex min-w-0 flex-1 text-base font-medium">
        <button
          type="button"
          className={cn(headingButtonClass, b.current && 'bg-pressed text-foreground')}
          title={title}
          aria-current={b.current ? 'page' : undefined}
          aria-expanded={folds ? !b.folded : undefined}
          onClick={folds ? b.onToggle : b.onOpen}
        >
          <span className="min-w-0 truncate">{children}</span>
          {folds && (
            <ChevronRight
              size={13}
              aria-hidden="true"
              className={cn(
                'flex-none text-muted-foreground transition-transform motion-reduce:transition-none',
                !b.folded && 'rotate-90',
              )}
            />
          )}
        </button>
      </h3>
      {action}
    </div>
  );
}
