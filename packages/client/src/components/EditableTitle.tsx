import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cn } from '../lib/utils';

export interface EditableTitleProps {
  /** Changes when a different item is shown, so an edit in progress is dropped. */
  itemKey: string;
  value: string;
  onRename: (value: string) => void;
  /** Heading level and class of the title as shown. */
  as: 'h1' | 'h2' | 'span';
  className: string;
  inputClassName: string;
  /** Accessible name of the text box. */
  inputLabel: string;
  maxLength: number;
}

/**
 * A title renamed in place: double-click it (or focus it and press Enter or F2) to edit;
 * Enter saves, Escape cancels. No pencil: it drew the eye on every title.
 */
export function EditableTitle({ itemKey, value, onRename, as: Tag, className, inputClassName, inputLabel, maxLength }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(value);
  }, [itemKey, value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onRename(next);
    else setDraft(value);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={inputClassName}
        aria-label={inputLabel}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
      />
    );
  }
  return (
    <Tag
      // Focusable, so it can be renamed from the keyboard: a ring shows where focus is.
      className={cn('outline-none focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring', className)}
      title={`${value} (double-click to rename)`}
      tabIndex={0}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value}
    </Tag>
  );
}
