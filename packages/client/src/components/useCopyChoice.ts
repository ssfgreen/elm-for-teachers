/**
 * The copy choice (docs/spyglass.md, Part 1): the assistant was asked to copy a doc with
 * suggestions waiting, so it made no copy, and the teacher chooses what the copy is built from.
 * Offered under the latest reply only; a choice logs `copy_choice` and sends a message for the
 * teacher with the choice in the chat body (`copy_choice`), as Allow does for a plugin
 * (usePluginRequests.ts). The choice is the teacher's: the model cannot make it.
 */
import { useCallback, useState } from 'react';
import type { CopyChoice, CopyRequest } from '@edw/shared';
import type { EventLogger } from '../events/logger';

/** What the chat needs to know of a message to find the open requests. */
interface MessageLike {
  role: 'teacher' | 'assistant' | 'error';
  turnId?: string;
  copyRequests?: CopyRequest[];
}

const key = (turnId: string, docId: string) => `${turnId}:${docId}`;

/** The latest reply's copy requests the teacher has not answered here, or null. */
export function openCopyRequests(
  messages: readonly MessageLike[],
  chosen: ReadonlySet<string>,
): { turnId: string; requests: CopyRequest[] } | null {
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!last?.turnId || !last.copyRequests?.length) return null;
  const requests = last.copyRequests.filter((r) => !chosen.has(key(last.turnId!, r.doc_id)));
  return requests.length ? { turnId: last.turnId, requests } : null;
}

/** The message sent for the teacher with each choice. */
export function choiceMessage(choice: CopyChoice, name: string): string {
  switch (choice) {
    case 'approve_all':
      return `I've approved all the suggestions in “${name}”. Make the copy from it as it is now.`;
    case 'approved_only':
      return `Make the copy from “${name}” using only what I've approved, without the waiting suggestions.`;
    case 'all_and_leave':
      return `Make the copy from “${name}” with all its suggestions in, and leave them waiting in “${name}”.`;
  }
}

export interface CopyChoiceDeps {
  logger: Pick<EventLogger, 'log'>;
  /** The doc's name as the teacher sees it. */
  docName: (docId: string) => string | undefined;
  /** Accept every suggestion in a doc (the existing Accept all). */
  acceptAll: (docId: string) => void;
  /** Send a message for the teacher, with the choice in its body. */
  send: (text: string, copyChoice: { doc_id: string; choice: CopyChoice }) => void;
}

export function useCopyChoice({ logger, docName, acceptAll, send }: CopyChoiceDeps) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const choose = useCallback(
    (turnId: string, request: CopyRequest, choice: CopyChoice) => {
      // Accept all travels as a logged event; the send flushes the log first, so the server has it.
      if (choice === 'approve_all') acceptAll(request.doc_id);
      logger.log('copy_choice', {
        doc_id: request.doc_id,
        choice,
        waiting: request.waiting,
        turn_id: turnId,
      });
      setChosen((c) => new Set([...c, key(turnId, request.doc_id)]));
      send(choiceMessage(choice, docName(request.doc_id) ?? 'the document'), {
        doc_id: request.doc_id,
        choice,
      });
    },
    [acceptAll, docName, logger, send],
  );
  return { chosen, choose };
}
