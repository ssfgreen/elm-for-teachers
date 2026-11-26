/**
 * Typing "@" opens the same kind of menu as "/", offering @model. Choosing it removes
 * the "@" text and opens an inline prompt at the cursor (AskPrompt); what the teacher
 * types there goes to the chat as a comment anchored to the current block. Only "@" at
 * the start of a line or after a space triggers, so email addresses do not.
 */
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import type { SlashItem, SlashMenuBridge, SlashMenuState } from "./slashCommand.js";

export interface MentionCommandOptions {
  bridge: () => SlashMenuBridge | null;
  /** Whether @model is available here (not in the read-only console mirror). */
  enabled: () => boolean;
  /** Open the inline prompt at the cursor. */
  openPrompt: () => void;
}

export function mentionItems(openPrompt: () => void): SlashItem[] {
  return [
    {
      title: "@model",
      description: "Ask the assistant to change this part of the worksheet",
      keywords: ["model", "assistant", "ai", "ask", "comment"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        openPrompt();
      },
    },
  ];
}

export function filterMentionItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.title.slice(1).startsWith(q) || i.keywords?.some((k) => k.startsWith(q)));
}

export const mentionKey = new PluginKey("edw-mention");

export const MentionCommand = Extension.create<MentionCommandOptions>({
  name: "edwMentionCommand",

  addOptions() {
    return { bridge: () => null, enabled: () => false, openPrompt: () => undefined };
  },

  addProseMirrorPlugins() {
    const o = this.options;
    const toState = (p: SuggestionProps<SlashItem, SlashItem>): SlashMenuState => ({
      items: p.items,
      query: p.query,
      rect: p.clientRect?.() ?? null,
      command: (item) => p.command(item),
    });
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: mentionKey,
        char: "@",
        allowSpaces: false,
        allow: ({ state }) => o.enabled() && state.selection.$from.parent.type.name !== "codeBlock",
        items: ({ query }) => filterMentionItems(mentionItems(o.openPrompt), query),
        command: ({ editor, range, props }) => props.command({ editor, range }),
        render: () => ({
          onStart: (p) => o.bridge()?.open(toState(p)),
          onUpdate: (p) => o.bridge()?.update(toState(p)),
          onKeyDown: (p: SuggestionKeyDownProps) => o.bridge()?.keyDown(p.event) ?? false,
          onExit: () => o.bridge()?.close(),
        }),
      }),
    ];
  },
});
