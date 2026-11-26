/**
 * Slash menu: typing "/" opens a list of block types at the cursor (Notion-style,
 * modelled on steven-tey/novel's slash command, Apache-2.0, without its jotai,
 * cmdk and tippy layers). The extension only drives @tiptap/suggestion; the menu
 * itself is a React component the Canvas renders from the state pushed through
 * `bridge`.
 */
import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";

export interface SlashItem {
  title: string;
  description: string;
  keywords?: string[];
  command: (p: { editor: Editor; range: Range }) => void;
}

export interface SlashMenuState {
  items: SlashItem[];
  query: string;
  rect: DOMRect | null;
  command: (item: SlashItem) => void;
}

/** What the Canvas supplies so the menu can be rendered and driven from the keyboard. */
export interface SlashMenuBridge {
  open(s: SlashMenuState): void;
  update(s: SlashMenuState): void;
  close(): void;
  keyDown(e: KeyboardEvent): boolean;
}

export interface SlashCommandOptions {
  bridge: () => SlashMenuBridge | null;
  canUpload: () => boolean;
  pickImage: () => void;
}

export function slashItems(o: { canUpload: boolean; pickImage: () => void }): SlashItem[] {
  const items: SlashItem[] = [
    { title: "Text", description: "Plain paragraph", keywords: ["p", "paragraph", "plain"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).clearNodes().run() },
    { title: "Heading 1", description: "Large section heading", keywords: ["h1", "title"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 1 }).run() },
    { title: "Heading 2", description: "Section heading", keywords: ["h2"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 2 }).run() },
    { title: "Heading 3", description: "Small heading", keywords: ["h3"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 3 }).run() },
    { title: "Bulleted list", description: "A simple list", keywords: ["ul", "bullets", "unordered"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleListItems("bullet_item").run() },
    { title: "Numbered list", description: "A list with numbers", keywords: ["ol", "numbers", "ordered"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleListItems("numbered_item").run() },
    { title: "Checklist", description: "Tick boxes for pupils", keywords: ["todo", "task", "tick", "checkbox"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleListItems("checklist_item").run() },
    { title: "Quote", description: "A quotation or example sentence set apart", keywords: ["blockquote", "example"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).clearNodes().toggleBlockquote().run() },
    { title: "Code", description: "Monospaced block", keywords: ["codeblock", "mono"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).clearNodes().toggleCodeBlock().run() },
    { title: "Divider", description: "A horizontal rule", keywords: ["hr", "rule", "line", "separator"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
    { title: "Writing line", description: "A line for pupils to write on, to the edge of the page", keywords: ["line", "answer", "write", "blank", "underline"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertWritingLine().run() },
    { title: "Page break", description: "Start a new page in Word and when printed", keywords: ["page", "break", "new page", "pagebreak"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setPageBreak().run() },
    { title: "Table", description: "Two columns to start", keywords: ["grid", "columns", "rows"], command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run() },
  ];
  if (o.canUpload) {
    items.push({
      title: "Image",
      description: "Upload a picture (PNG, JPEG, GIF, WebP or SVG, up to 5 MB)",
      keywords: ["picture", "photo", "upload"],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        o.pickImage();
      },
    });
  }
  return items;
}

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.title.toLowerCase().includes(q) || i.keywords?.some((k) => k.includes(q)));
}

export const slashKey = new PluginKey("edw-slash");

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "edwSlashCommand",

  addOptions() {
    return { bridge: () => null, canUpload: () => false, pickImage: () => undefined };
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
        pluginKey: slashKey,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        allow: ({ state }) => state.selection.$from.parent.type.name !== "codeBlock",
        items: ({ query }) => filterSlashItems(slashItems({ canUpload: o.canUpload(), pickImage: o.pickImage }), query),
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
