/**
 * The chat column's head: the chat's name (with its project and the naming wand), and under it
 * the chat's tokens and cost so far (UsageMeter) and what the workspace has left of its budget
 * ("£47 left", whole pounds rounded down). Display only; ChatColumn and the session replay
 * (replay/) draw it.
 */
import type { ReactNode } from 'react';
import type { ChatUsage, Thread } from '@edw/shared';
import { WandSparkles } from 'lucide-react';
import { IconButton } from '../editor/Toolbar.js';
import { EditableTitle } from '../components/EditableTitle';
import { UsageMeter } from '../components/UsageMeter';
import { cn } from '../lib/utils';

export interface ChatHeadProps {
  /** Before the name: the sidebar's opener, when the sidebar is closed. */
  lead: ReactNode;
  /** Before the name: where the chat belongs (its project, class or year group), as a link. */
  crumb?: { name: string; title: string; onOpen: () => void };
  thread: Thread | undefined;
  onRename: (title: string) => void;
  naming: boolean;
  /** The naming wand; without it there is none. */
  onName?: () => void;
  usage: ChatUsage | null;
  /** Whole pounds the workspace has left of its budget (config plus top-ups); without it, none shows. */
  budgetLeft?: number | null;
}

export function ChatHead({ lead, crumb, thread, onRename, naming, onName, usage, budgetLeft = null }: ChatHeadProps) {
  return (
    <header className={cn('chat-head', 'mx-auto flex w-full max-w-184 flex-none items-start gap-1 bg-background px-4', lead && 'pl-2')}>
      {lead && <div className="flex h-12 flex-none items-center">{lead}</div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 min-w-0 items-center gap-1">
          {crumb && (
            <>
              <button
                type="button"
                className="max-w-2/5 min-w-0 flex-initial truncate rounded-none border-0 bg-transparent p-0 text-md text-muted-foreground hover:enabled:text-foreground"
                title={crumb.title}
                onClick={crumb.onOpen}
              >
                {crumb.name}
              </button>
              <span className="flex-none text-muted-foreground" aria-hidden="true">
                /
              </span>
            </>
          )}
          {thread && (
            <EditableTitle
              itemKey={thread.id}
              value={thread.title}
              onRename={onRename}
              as="h2"
              className={cn('chat-title', 'm-0 min-w-0 truncate text-base font-semibold')}
              inputClassName="min-w-0 flex-1 rounded-sm border border-primary px-1.5 py-0.75 text-base font-semibold outline-2 outline-ring"
              inputLabel="Chat name"
              maxLength={120}
            />
          )}
          {thread && onName && (
            <IconButton icon={WandSparkles} label={naming ? 'Naming the chat…' : 'Name this chat'} className={cn('flex-none', naming && 'motion-safe:*:animate-pulse')} disabled={naming} onClick={onName} />
          )}
        </div>
        {(usage || budgetLeft !== null) && (
          <div className="-mt-2 flex items-center gap-3 pb-1">
            {usage && <UsageMeter usage={usage} />}
            {budgetLeft !== null && (
              <span className="budget-left text-xs text-muted-foreground tabular-nums" title="What this workspace has left to spend on the assistant">
                £{budgetLeft} left
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
