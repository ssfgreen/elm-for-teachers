import { forwardRef } from 'react';
import { Input } from '../../components/ui/input';

/** A labelled field for an invite or access code: no autocomplete or spellcheck, capitals on phones. */
export const CodeField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** Tidies what was typed or pasted (codes.ts). */
    clean: (typed: string) => string;
    error?: string | null;
    errorId?: string;
    autoFocus?: boolean;
  }
>(function CodeField({ label, value, onChange, clean, error, errorId, autoFocus }, ref) {
  return (
    <label className="flex flex-col gap-1.25 text-left text-base text-foreground-2">
      <span>{label}</span>
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(clean(e.target.value))}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && errorId ? errorId : undefined}
      />
    </label>
  );
});
