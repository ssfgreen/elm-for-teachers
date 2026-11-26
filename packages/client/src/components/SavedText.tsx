/** A text box saved when it loses focus, as on a project's page and a class's. Moved from ProjectScreens.tsx. */
import { useEffect, useRef, useState } from 'react';
import { autoGrow } from './autoGrow';
import { cn } from '../lib/utils';

/** Text saved when the box loses focus (if it changed); says if the save failed. */
export function SavedText({ label, className, placeholder, value, maxLength, onSave, boxed }: { label: string; className: string; placeholder: string; value: string | null; maxLength: number; onSave: (v: string | null) => Promise<void>; boxed?: boolean }) {
  const [text, setText] = useState(value ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const saved = useRef(value ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => autoGrow(ref.current, boxed ? 360 : 240), [text, boxed]);
  const save = async () => {
    const next = text.trim();
    if (next === saved.current.trim()) return;
    setState('saving');
    try {
      await onSave(next || null);
      saved.current = next;
      setState('saved');
    } catch {
      setState('failed');
    }
  };
  return (
    <div className="relative flex flex-col gap-1">
      <textarea ref={ref} aria-label={label} className={className} rows={boxed ? 5 : 1} placeholder={placeholder} value={text} maxLength={maxLength} onChange={(e) => setText(e.target.value)} onBlur={() => void save()} />
      {state === 'saving' && <span className={noteClass}>Saving…</span>}
      {state === 'saved' && <span className={noteClass}>Saved</span>}
      {state === 'failed' && (
        <span className={cn(noteClass, 'error-text')} role="alert">
          Not saved. Click in and out again to retry.
        </span>
      )}
    </div>
  );
}

const noteClass = 'self-end text-xs text-muted-foreground';
