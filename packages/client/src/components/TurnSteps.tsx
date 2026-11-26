/**
 * What the assistant thought and did on the way to a reply, as a card of steps: each piece of
 * its thinking (titled by the bold first line of its reasoning summary) and each tool it used
 * (titled by the tool's label). Every step opens to show the thinking, or what the tool did:
 * its plain-words summary when it has one, with the raw request and response folded under
 * "Technical details" (kept for anyone checking how the assistant got there). While the reply is being written the card is open; once it is done it folds
 * into one line ("Worked for 12 s · 3 steps") that opens it again.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible } from 'radix-ui';
import type { TurnStep } from '@edw/shared';
import { cn } from '../lib/utils';

export function TurnSteps({ steps, running = false, workedMs }: { steps: TurnStep[]; running?: boolean; workedMs?: number }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const card = (
    <ol className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-md p-0 shadow-card ring-1 ring-border">
      {steps.map((s, i) => (
        <Step key={i} step={s} />
      ))}
    </ol>
  );
  if (running) return <div className="mb-2.5">{card}</div>;
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="mb-2">
      <Collapsible.Trigger className="group flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-sm text-muted-foreground hover:text-foreground">
        {summaryOf(steps, workedMs)}
        <ChevronRight aria-hidden="true" className="size-3.5 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
      </Collapsible.Trigger>
      <Collapsible.Content className="mt-1.5">{card}</Collapsible.Content>
    </Collapsible.Root>
  );
}

function Step({ step }: { step: TurnStep }) {
  const hasMore = !!(step.detail || step.request || step.response || step.summary?.length);
  const title = (
    <span className={cn('min-w-0 flex-1 truncate', step.error ? 'text-destructive' : 'text-foreground-2', step.running && 'animate-pulse motion-reduce:animate-none')}>
      {step.title}
    </span>
  );
  if (!hasMore) return <li className="flex items-center gap-1.5 px-3 py-2 text-sm">{title}</li>;
  return (
    <Collapsible.Root asChild>
      <li className="px-3 py-2 text-sm">
        <Collapsible.Trigger className="group flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-xs border-0 bg-transparent p-0 text-left hover:text-foreground" title={step.title}>
          {title}
          <ChevronRight aria-hidden="true" className="size-3.5 flex-none text-muted-foreground transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
        </Collapsible.Trigger>
        <Collapsible.Content className="pt-2">
          {step.detail && <p className="whitespace-pre-wrap text-foreground-2">{step.detail}</p>}
          {step.summary?.length ? (
            <>
              <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-foreground-2">
                {step.summary.map((line, i) => (
                  <li key={i} className={cn(line.startsWith('Not made:') && 'text-destructive')}>
                    {line}
                  </li>
                ))}
              </ul>
              {(step.request || step.response) && <Raw request={step.request} response={step.response} />}
            </>
          ) : (
            <>
              {step.request && <Block label="Request" text={step.request} />}
              {step.response && <Block label="Response" text={step.response} />}
            </>
          )}
        </Collapsible.Content>
      </li>
    </Collapsible.Root>
  );
}

/** The raw request and response, folded away behind a quiet link. */
function Raw({ request, response }: { request?: string; response?: string }) {
  return (
    <Collapsible.Root className="mt-2">
      <Collapsible.Trigger className="group flex cursor-pointer items-center gap-1 rounded-xs border-0 bg-transparent p-0 text-xs text-muted-foreground hover:text-foreground">
        Technical details
        <ChevronRight aria-hidden="true" className="size-3 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        {request && <Block label="Request" text={request} />}
        {response && <Block label="Response" text={response} />}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1 rounded-sm bg-hover px-2.5 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <pre className="m-0 max-h-60 overflow-auto font-mono text-xs whitespace-pre-wrap wrap-anywhere text-foreground">{text}</pre>
    </div>
  );
}

/** "Worked for 12 s · 3 steps", or just the steps when the time is not known. */
export function summaryOf(steps: TurnStep[], ms?: number): string {
  const n = `${steps.length} step${steps.length === 1 ? '' : 's'}`;
  if (ms === undefined) return n;
  const s = Math.max(1, Math.round(ms / 1000));
  const time = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
  return `Worked for ${time} · ${n}`;
}
