import { z } from "zod";

/**
 * Block types supported by the editor. `bullet_list`, `numbered_list` and `checklist` hold a whole
 * list; they are no longer written but are still read (older docs and exports).
 */
export const BlockType = z.enum([
  "heading",
  "paragraph",
  "bullet_list",
  "numbered_list",
  "checklist",
  /** One list item each (PLAN.md section 6); a run of them is drawn as one list. See lists.ts. */
  "bullet_item",
  "numbered_item",
  "checklist_item",
  "quote",
  "code_block",
  "divider",
  /** Starts a new page when printed or opened in Word. Has no content. */
  "page_break",
  "image",
  "table",
]);
export type BlockType = z.infer<typeof BlockType>;

/** Who first created a block. Never changes once set. */
export const Origin = z.enum(["teacher", "model"]);
export type Origin = z.infer<typeof Origin>;

/** Who wrote a given revision of a block. */
export const Actor = z.enum(["teacher", "model"]);
export type Actor = z.infer<typeof Actor>;

export const BlockStatus = z.enum(["proposed", "live", "rejected", "deleted"]);
export type BlockStatus = z.infer<typeof BlockStatus>;

/** Where the teacher's attention is: the document, the chat, or the thread list. */
export const FocusPane = z.enum(["canvas", "chat", "threads", "none"]);
export type FocusPane = z.infer<typeof FocusPane>;

export const ProposalMode = z.enum(["click", "accept_all", "reject_all", "edit_then_accept"]);
export type ProposalMode = z.infer<typeof ProposalMode>;

/**
 * A document's look, set for the whole document: its font and the page's background colour.
 * Tinted pages and plainer fonts are the usual adjustments for pupils with visual stress or
 * dyslexia. Unset means the default (DEFAULT_DOC_FONT, a white page).
 */
/**
 * The fonts a doc (or a run of text) can be set in. Century Gothic, Verdana and Comic Sans (a past
 * study condition) are no longer offered but still read, for docs set in them before.
 */
export const DocFont = z.enum(["lexend", "calibri", "arial", "georgia", "cambria", "times_new_roman", "century_gothic", "comic_sans", "verdana", "open_dyslexic"]);
export type DocFont = z.infer<typeof DocFont>;
/**
 * A doc with no font is set in this, on screen, in Word and in the layout check. Calibri, not
 * Word's Aptos: the app bundles Carlito, with Calibri's letter widths, so all three agree.
 */
export const DEFAULT_DOC_FONT: DocFont = "calibri";
export const DocBackground = z.enum(["cream", "yellow", "blue", "green", "pink", "lilac"]);
export type DocBackground = z.infer<typeof DocBackground>;
export const DocStyle = z.object({ font: DocFont.optional(), background: DocBackground.optional() });
export type DocStyle = z.infer<typeof DocStyle>;
