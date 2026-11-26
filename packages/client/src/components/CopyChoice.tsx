/** Under the reply: a copy the assistant could not make until the teacher chooses what it is built from (useCopyChoice.ts). */
import { Copy } from 'lucide-react';
import type { CopyChoice as Choice, CopyRequest } from '@edw/shared';
import { Button } from './ui/button';

const CHOICES: { choice: Choice; label: string; hint: string }[] = [
  {
    choice: 'approve_all',
    label: 'Approve all and use',
    hint: 'Accept the suggestions, then copy',
  },
  { choice: 'approved_only', label: 'Use only approved', hint: 'Copy without the suggestions' },
  {
    choice: 'all_and_leave',
    label: 'Use all and leave',
    hint: 'Copy with the suggestions in, and leave them waiting in the original',
  },
];

export function CopyChoice({
  requests,
  docName,
  disabled,
  onChoose,
}: {
  requests: CopyRequest[];
  docName: (id: string) => string | undefined;
  disabled: boolean;
  onChoose: (request: CopyRequest, choice: Choice) => void;
}) {
  return (
    <ul
      className="m-0 mb-3 flex list-none flex-col gap-1.5 p-0"
      aria-label="Choose what the copy is made from"
    >
      {requests.map((r) => (
        <li
          key={r.doc_id}
          className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <span className="flex items-start gap-2">
            <Copy size={15} aria-hidden="true" className="mt-0.5 flex-none text-foreground-2" />
            <span>
              <strong>{docName(r.doc_id) ?? 'This document'}</strong> has {r.waiting} suggestion
              {r.waiting === 1 ? '' : 's'} waiting. What should the copy be made from?
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            {CHOICES.map((c, i) => (
              <Button
                key={c.choice}
                size="sm"
                variant={i === 0 ? 'primary' : undefined}
                title={c.hint}
                disabled={disabled}
                onClick={() => onChoose(r, c.choice)}
              >
                {c.label}
              </Button>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
