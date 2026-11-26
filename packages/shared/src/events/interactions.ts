/**
 * Interaction events (10 Nov 2026): where the pointer is, what is clicked, what is selected
 * outside the editor, what is on screen and whether the page is in front. They let a session
 * be played back without a screen recording, to study checking behaviour.
 *
 * They are logged only while interaction logging is on for the workspace (set in /admin,
 * logged as `interaction_logging_set`); the server drops them otherwise. Positions are CSS
 * pixels from the top left of the browser window; `viewport` gives the window's size and
 * where each region of the screen is, so a position can be placed on the layout.
 */
import { z } from "zod";
import { FocusPane } from "../enums.js";
import { Timestamp } from "../blocks.js";

const Px = z.number().int();
const Short = (n: number) => z.string().max(n);

/**
 * What a position is over. `item` is the closest marked element: `suggestion:<block_id>:<part|all>`
 * (a suggestion card), `comment:<root comment id>` (a comment thread), `message:<key>` (a chat
 * message; `<turn_id>-p` the prompt, `<turn_id>-r` the reply).
 */
export const PointTarget = z.object({
  pane: FocusPane,
  block_id: z.string().nullable(),
  item: Short(200).nullable(),
});
export type PointTarget = z.infer<typeof PointTarget>;

/** Pointer positions, sampled at most every `interval_ms` while it moves, sent a few seconds at a time. */
export const PointerSample = PointTarget.extend({
  /** Epoch milliseconds. */
  t: z.number().int().nonnegative(),
  x: Px,
  y: Px,
});
export const PointerPayload = z.object({
  interval_ms: z.number().int().positive(),
  samples: z.array(PointerSample).min(1).max(200),
});

/** A click (any button). `control` is the button, link, menu item or field clicked, if any, with its accessible name. */
export const ClickPayload = PointTarget.extend({
  x: Px,
  y: Px,
  button: z.number().int().min(0).max(5),
  /** 1 for a single click, 2 for a double click. */
  count: z.number().int().nonnegative(),
  control: z
    .object({
      role: Short(40),
      label: Short(120).nullable(),
    })
    .nullable(),
});

/** A screen region: `left`, `top`, `width`, `height` in CSS pixels. */
export const Rect = z.object({ left: Px, top: Px, width: Px, height: Px });

/**
 * The window and the layout: on start, on resize and when a region changes size (a pane
 * dragged, the comments column opened). `regions` maps a region's name (threads, canvas,
 * chat, comments) to where it is; a hidden region is left out.
 */
export const ViewportPayload = z.object({
  width: Px,
  height: Px,
  device_pixel_ratio: z.number().positive(),
  regions: z.record(z.string(), Rect),
});

/** A dialog, menu or list of options opened or closed. `label` is its accessible name, or null. */
export const UiStatePayload = z.object({
  role: z.enum(["dialog", "alertdialog", "menu", "listbox"]),
  label: Short(120).nullable(),
  open: z.boolean(),
});

/** Whether the tab is showing (`visible`) and whether the window has focus (`focused`): false while the teacher looks elsewhere. */
export const PageStatePayload = z.object({
  visible: z.boolean(),
  focused: z.boolean(),
});

/**
 * Text selected outside the editor (a chat reply, a comment, a reference preview); the
 * editor logs its own `selection`. `text` is cut at 500 characters; `length` is the full length.
 */
export const TextSelectPayload = PointTarget.extend({
  length: z.number().int().nonnegative(),
  text: Short(500),
});

/** Logged by the server when interaction logging is turned on or off for the workspace. `until` is when it stops by itself (null: until turned off). */
export const InteractionLoggingSetPayload = z.object({
  on: z.boolean(),
  until: Timestamp.nullable(),
});

/** The event kinds that are logged only while interaction logging is on. */
export const INTERACTION_KINDS = ["pointer", "click", "viewport", "ui_state", "page_state", "text_select"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
