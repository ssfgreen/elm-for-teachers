/**
 * Light, Dark or System, as a small three-way switch. In a menu each choice is a menu radio
 * item; elsewhere the row is a radio group. Arrow keys move within the row.
 */
import type { KeyboardEvent } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { THEME_CHOICES, useThemeChoice, type ThemeChoice } from '../../theme';
import { cn } from '../../lib/utils';

const LABELS: Record<ThemeChoice, { label: string; icon: typeof Sun }> = {
  system: { label: 'System', icon: Monitor },
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
};

export function ThemeSwitch({
  inMenu = false,
  className,
}: {
  inMenu?: boolean;
  className?: string;
}) {
  const [choice, setChoice] = useThemeChoice();
  const itemRole = inMenu ? 'menuitemradio' : 'radio';
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(`[role="${itemRole}"]`)];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    items[(at + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]?.focus();
  };
  return (
    <div
      role={inMenu ? 'group' : 'radiogroup'}
      aria-label="Appearance"
      className={cn('grid grid-cols-3 gap-0.5 rounded-sm bg-panel p-0.5', className)}
      onKeyDown={onKeyDown}
    >
      {THEME_CHOICES.map((c) => {
        const { label, icon: Icon } = LABELS[c];
        const on = c === choice;
        return (
          <button
            key={c}
            type="button"
            role={itemRole}
            aria-checked={on}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1 rounded-sm border-0 bg-transparent px-1.5 py-1 text-sm text-foreground-2 hover:text-foreground',
              on && 'bg-card text-foreground shadow-card hover:bg-card',
            )}
            onClick={() => setChoice(c)}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
