/** The comment box under a thread or a new comment, with its @model suggestion. */
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { slashDescClass, slashItemClass, slashMenuClass, slashTitleClass } from '../../editor/SlashMenu.js';
import { autoGrow } from '../autoGrow';
import { Button } from '../ui/button';
import { fieldClass } from '../ui/input';
import { cn } from '../../lib/utils';

/** The send button under a comment box. */
export const sendClass = 'px-3.25 py-1.25 text-md disabled:opacity-100';

/** "@" then the start of "model", just before the caret: the @model suggestion is offered. */
export function mentionAt(text: string, caret: number): { from: number; query: string } | null {
  const m = /(^|\s)@(\w*)$/.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[2] ?? '';
  if (query.toLowerCase() === 'model' || !'model'.startsWith(query.toLowerCase())) return null;
  return { from: caret - query.length - 1, query };
}

/**
 * A comment box: Enter sends, Shift+Enter is a new line, Escape cancels. Typing "@" offers
 * @model (Enter, Tab or a click takes it). "Send to model" starts ticked.
 */
export function Composer({ placeholder, label, submitLabel, autoFocus, onSubmit, onCancel }: { placeholder: string; label: string; submitLabel: string; autoFocus?: boolean; onSubmit: (body: string, send: boolean) => Promise<void>; onCancel?: () => void }) {
  const [text, setText] = useState('');
  const [send, setSend] = useState(true);
  const [caret, setCaret] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const mention = busy || menuClosed ? null : mentionAt(text, caret);
  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body, send);
      setText('');
      setSend(true);
    } catch {
      setError('The comment could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const takeMention = () => {
    if (!mention) return;
    const after = text.slice(caret);
    const spaced = after.startsWith(' ');
    const next = text.slice(0, mention.from) + (spaced ? '@model' : '@model ') + after;
    const at = mention.from + '@model '.length;
    setText(next);
    setCaret(at);
    setSend(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
    });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && (e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      takeMention();
      return;
    }
    if (mention && e.key === 'Escape') {
      e.preventDefault();
      setMenuClosed(true);
      return;
    }
    if (e.key === 'Escape' && onCancel) onCancel();
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void submit();
  };
  return (
    <div className="mt-2.25">
      <div className="relative">
        <textarea
          className={cn(fieldClass, 'block w-full resize-none text-md')}
          ref={ref}
          rows={1}
          aria-label={label}
          placeholder={placeholder}
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setMenuClosed(false);
            autoGrow(e.target, 160);
          }}
          // Not onSelect: React fires it on keydown with the caret from before the key.
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => {
            if (/^(Arrow|Home|End)/.test(e.key)) setCaret(e.currentTarget.selectionStart ?? 0);
          }}
          onBlur={() => setMenuClosed(true)}
          onFocus={() => setMenuClosed(false)}
          onKeyDown={onKeyDown}
        />
        {mention && (
          <div className={cn(slashMenuClass, 'top-full left-0 mt-1 min-w-48')} role="listbox" aria-label="Mention" onMouseDown={(e) => e.preventDefault()}>
            <button type="button" role="option" aria-selected="true" className={cn(slashItemClass, 'w-full border-0 text-left')} onClick={takeMention}>
              <span className={slashTitleClass}>@model</span>
              <span className={slashDescClass}>Ask the assistant</span>
            </button>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-end gap-3">
        <label className="mr-auto inline-flex cursor-pointer items-center gap-1.25 text-sm text-muted-foreground select-none" onClick={(e) => e.stopPropagation()}>
          <input className="m-0" type="checkbox" checked={send} disabled={busy} onChange={(e) => setSend(e.target.checked)} />
          Send to model
        </label>
        {onCancel && (
          <Button variant="link" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        {(text.trim() || onCancel) && (
          <Button variant="primary" size="sm" className={sendClass} onClick={() => void submit()} disabled={busy || !text.trim()}>
            {submitLabel}
          </Button>
        )}
      </div>
      {error && (
        <p className="error-text my-3.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
