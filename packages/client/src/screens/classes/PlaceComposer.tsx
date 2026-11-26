/** The box on a class's or year group's page that starts a chat for it (as on a project's page). */
import { useState } from 'react';
import type { ThreadPlace } from '../../api/classes';
import { ChatComposer, type AttachedFile, type ChatComposerProps } from '../../components/ChatComposer';

export interface PlaceChat {
  logger: ChatComposerProps['logger'];
  batchMs?: number;
  getClipboard?: ChatComposerProps['getClipboard'];
  bar?: ChatComposerProps['bar'];
  addFile?: (place: ThreadPlace, file: File) => Promise<AttachedFile>;
  removeFile?: (id: string) => void;
  /** Makes the chat, opens it and sends the first message. */
  start: (place: ThreadPlace, text: string, attached: AttachedFile[]) => Promise<void>;
}

export function PlaceComposer({ chat, place, name }: { chat: PlaceChat; place: ThreadPlace; name: string }) {
  const [failed, setFailed] = useState(false);
  const { addFile } = chat;
  return (
    <div className="flex flex-col gap-1">
      {failed && (
        <p className="error-text" role="alert">
          The chat could not be started. Please try again.
        </p>
      )}
      <ChatComposer
        logger={chat.logger}
        batchMs={chat.batchMs}
        getClipboard={chat.getClipboard}
        addFile={addFile ? (file) => addFile(place, file) : undefined}
        removeFile={chat.removeFile}
        onSend={(text, attached, restore) => {
          setFailed(false);
          chat.start(place, text, attached).catch((err: unknown) => {
            restore();
            setFailed(true);
            chat.logger.log('error', { source: 'client', message: `start class chat failed: ${err instanceof Error ? err.message : String(err)}` });
          });
        }}
        bar={chat.bar}
        docked={false}
        placeholder={`Start a chat for ${name}…`}
        label={`Start a chat for ${name}`}
      />
    </div>
  );
}
