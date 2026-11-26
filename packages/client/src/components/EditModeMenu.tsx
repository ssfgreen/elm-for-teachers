/**
 * How the assistant's changes reach the doc, chosen under the chat box as in Google Docs' mode
 * menu (state/assistantMode.ts): Editing (changes go straight in), Suggesting (the default: each
 * change waits for the teacher, with only the new words showing, in green, and what goes on its
 * card) or Track changes (the same, drawn as tracked changes in red). Teachers' own typing is
 * never a suggestion. Closed, it is the mode's icon only, named on hover; the menu has the names.
 */
import { useCallback, useRef, useState } from 'react';
import { Check, FileDiff, MessageSquareDiff, PencilLine } from 'lucide-react';
import type { AssistantMode } from '../state/assistantMode';
import { useDismiss } from './useDismiss';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { menuItemClass, menuNameClass } from './ExportMenu';

export const EDIT_MODES: { id: AssistantMode; label: string; hint: string; icon: typeof PencilLine }[] = [
  { id: 'edit', label: 'Editing', hint: 'Changes go straight into the document', icon: PencilLine },
  { id: 'suggest', label: 'Suggesting', hint: 'You accept or reject each change; new words show in green', icon: MessageSquareDiff },
  { id: 'track', label: 'Track changes', hint: 'As Suggesting, with the words taken out struck through', icon: FileDiff },
];

export function EditModeMenu({ mode, onChange, disabled }: { mode: AssistantMode; onChange: (mode: AssistantMode) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const current = EDIT_MODES.find((m) => m.id === mode) ?? EDIT_MODES[1]!;
  return (
    <div className="relative flex min-w-0 items-center" ref={ref}>
      <Button
        variant="bar"
        size="icon"
        aria-label={`Assistant: ${current.label}`}
        tip={`${current.label}: ${current.hint.toLowerCase()}`}
        tipAlign="end"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className={cn('edit-mode', mode === 'edit' && 'text-foreground')}
        onClick={() => setOpen((o) => !o)}
      >
        <current.icon size={15} aria-hidden="true" />
      </Button>
      {open && (
        <div className="absolute right-0 bottom-full z-40 mb-1 w-70 rounded-md border border-border bg-card p-1 shadow-float" role="menu" aria-label="Assistant's changes">
          {EDIT_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={m.id === mode}
              className={cn(menuItemClass, 'justify-start gap-2 text-md')}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <m.icon size={15} aria-hidden="true" className="flex-none" />
              <span className="flex min-w-0 flex-1 flex-col items-start">
                <span className={menuNameClass}>{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.hint}</span>
              </span>
              {m.id === mode && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
