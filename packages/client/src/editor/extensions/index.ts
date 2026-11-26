/**
 * The canvas's Tiptap extension set. Built-in nodes map one to one onto server
 * block types (see ../blockTypes.ts); strike is off because block content is a
 * markdown run with bold, italic, underline, code, text colour, highlight and links
 * only; paragraphs may also hold line breaks (see ../inline.ts).
 */
import { Extension, getSchema, type Extensions } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import type { Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { BlockAttrs } from "./blockAttrs.js";
import { BlockChrome } from "./blockChrome.js";
import { TrackChanges } from "./trackChanges.js";
import { EdwPlaceholder } from "./placeholder.js";
import { EdwImage, UploadPlaceholderPlugin } from "./image.js";
import { Shortcuts } from "./shortcuts.js";
import { MentionCommand } from "./mentionCommand.js";
import { SlashCommand, type SlashMenuBridge } from "./slashCommand.js";
import { CommentMarks } from "./commentMarks.js";
import { PageBreak } from "./pageBreak.js";
import { WritingLine } from "./writingLine.js";
import { HighlightMark, TextColorMark, TextFontMark, TextSizeMark } from "./textStyle.js";
import { ListItems } from "./listItems.js";
import { TableHeaderColor } from "./tableHeaderColor.js";

export interface CanvasExtensionOptions {
  readOnly: () => boolean;
  resolveAssetUrl: (src: string) => string;
  slashBridge: () => SlashMenuBridge | null;
  canUpload: () => boolean;
  pickImage: () => void;
  /** Whether typing "@" offers @model. */
  canAsk: () => boolean;
  openAskPrompt: () => void;
  /** A comment highlight was clicked: select its thread. */
  onCommentSelect: (id: string) => void;
}

const DEFAULTS: CanvasExtensionOptions = {
  readOnly: () => false,
  resolveAssetUrl: (s) => s,
  slashBridge: () => null,
  canUpload: () => false,
  pickImage: () => undefined,
  canAsk: () => false,
  openAskPrompt: () => undefined,
  onCommentSelect: () => undefined,
};

const Uploads = Extension.create({
  name: "edwUploads",
  addProseMirrorPlugins() {
    return [UploadPlaceholderPlugin()];
  },
});

export function buildExtensions(partial: Partial<CanvasExtensionOptions> = {}): Extensions {
  const o = { ...DEFAULTS, ...partial };
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      strike: false,
      // Links open from the bubble's Open button, not on click, so they can be edited like text.
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", protocols: ["mailto"], HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      hardBreak: { keepMarks: true },
      trailingNode: false,
      dropcursor: { width: 2, class: "drop-cursor" },
    }),
    TaskList,
    TaskItem.configure({ nested: false }),
    ListItems,
    // Columns resize by dragging their right edge; widths are saved with the table (markdown.ts).
    TableKit.configure({ table: { resizable: true, cellMinWidth: 60, lastColumnResizable: false } }),
    TableHeaderColor,
    PageBreak,
    WritingLine,
    TextColorMark,
    TextFontMark,
    TextSizeMark,
    HighlightMark,
    EdwImage.configure({ inline: false, allowBase64: false, resolveAssetUrl: o.resolveAssetUrl }),
    EdwPlaceholder.configure({ readOnly: o.readOnly }),
    BlockAttrs,
    BlockChrome,
    TrackChanges,
    Shortcuts,
    SlashCommand.configure({ bridge: o.slashBridge, canUpload: o.canUpload, pickImage: o.pickImage }),
    MentionCommand.configure({ bridge: o.slashBridge, enabled: o.canAsk, openPrompt: o.openAskPrompt }),
    Uploads,
    CommentMarks.configure({ onSelect: o.onCommentSelect }),
  ];
}

let cached: Schema | null = null;
/** The canvas schema on its own, for conversions and tests that need no editor. */
export function canvasSchema(): Schema {
  if (!cached) cached = getSchema(buildExtensions());
  return cached;
}
