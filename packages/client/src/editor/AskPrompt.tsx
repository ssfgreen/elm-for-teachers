/**
 * The inline @model prompt at the cursor: starts one line high and grows as the teacher
 * types. Enter sends, Shift+Enter is a new line, Escape cancels; either way the editor
 * gets the focus back. Typing is logged as chat keystrokes, the same as the chat composer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { autoGrow } from "../components/autoGrow";
import { createChatBatcher } from "../components/chatBatch";
import type { EventLogger } from "../events/logger.js";

export interface AskPromptProps {
  /** Position inside the canvas frame. */
  top: number;
  left: number;
  logger: Pick<EventLogger, "log">;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function AskPrompt({ top, left, logger, onSubmit, onCancel }: AskPromptProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const batcher = useMemo(() => createChatBatcher(logger), [logger]);
  useEffect(() => {
    inputRef.current?.focus();
    return () => batcher.flush();
  }, [batcher]);
  useEffect(() => autoGrow(inputRef.current, 160), [text]);

  return (
    <div
      className="ask-prompt absolute z-20 flex w-110 max-w-full items-start gap-2 rounded-md border border-primary bg-card py-1.5 pr-2 pl-2.5 shadow-float"
      style={{ top, left }} role="dialog" aria-label="Ask the assistant">
      <span className="pt-0.75 font-mono text-xs font-semibold text-primary" aria-hidden="true">
        @model
      </span>
      <textarea
        ref={inputRef}
        rows={1}
        className="min-w-0 flex-1 resize-none overflow-y-hidden border-0 bg-transparent px-0 py-0.5 text-md focus-visible:shadow-none"
        aria-label="What should the assistant change here?"
        placeholder="What should change here? Enter to send, Esc to cancel"
        value={text}
        onChange={(e) => {
          batcher.change(text, e.target.value);
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            const prompt = text.trim();
            if (!prompt) return;
            batcher.flush();
            onSubmit(prompt);
          }
        }}
        onBlur={() => {
          if (!text.trim()) onCancel();
        }}
      />
    </div>
  );
}
