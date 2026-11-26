/**
 * The make kit (/make/:token): teachers design the editor by placing feature cards on it,
 * giving feedback (like, don't like, comment) on its parts, and describing features of their
 * own, which the model designs. Shared so the client and server agree on the board's shape
 * and the server can build the design prompt and check what the model returns.
 */
import { z } from "zod";

/**
 * The places on the editor a card can go, in screen order: the sidebar's sections, the chat,
 * the document's header and body, the comments and the footer. A board saved before a place
 * was added stays valid.
 */
export const MAKE_ZONES = {
  docs: "Docs",
  docitem: "On a document",
  classes: "Classes",
  personalise: "Personalise",
  skills: "Skills",
  prompts: "Prompts",
  sidebar: "Sidebar",
  banner: "Above the chat",
  chat: "Chat",
  composer: "Chat footer",
  header: "Document header",
  export: "Export menu",
  doctabs: "Document tabs",
  toolbar: "Document toolbar",
  doc: "Top of document",
  inline: "In the document",
  docfooter: "Document footer",
  margin: "Comments",
  bottom: "Footer",
} as const;
export const MakeZone = z.enum(["docs", "docitem", "classes", "personalise", "skills", "prompts", "sidebar", "banner", "chat", "composer", "header", "export", "doctabs", "toolbar", "doc", "inline", "docfooter", "margin", "bottom"]);
export type MakeZone = z.infer<typeof MakeZone>;
export const MAKE_ZONE_IDS = MakeZone.options;

const Text = (n: number) => z.string().max(n);
const Items = z.array(Text(80)).max(8);

const Tone = z.enum(["info", "success", "warning", "danger"]);
export const MakeTone = Tone;
export type MakeTone = z.infer<typeof Tone>;
const Index = z.number().int().min(0);

/** The pieces a card is built from. Each kind is drawn in the app's own style by the client. */
const LEAF_PARTS = [
  z.object({ type: z.literal("heading"), text: Text(120) }),
  z.object({ type: z.literal("text"), text: Text(240) }),
  /** A highlighted notice; `tone` colours it (info when unset). */
  z.object({ type: z.literal("note"), text: Text(240), tone: Tone.optional() }),
  /** A text box: `text` is the placeholder; `value`, if set, is what is typed in it. */
  z.object({ type: z.literal("input"), text: Text(120), value: Text(400).optional() }),
  z.object({ type: z.literal("textarea"), text: Text(120), value: Text(400).optional() }),
  z.object({ type: z.literal("toggle"), text: Text(120) }),
  z.object({ type: z.literal("list"), items: Items }),
  z.object({ type: z.literal("buttons"), items: Items }),
  z.object({ type: z.literal("chips"), items: Items }),
  z.object({ type: z.literal("tabs"), items: Items, active: Index }),
  /** A dropdown showing its chosen value. */
  z.object({ type: z.literal("select"), text: Text(80), value: Text(80) }),
  /** Pick one of a few, as round buttons. */
  z.object({ type: z.literal("radio"), items: Items, active: Index }),
  /** Checkboxes; `on` lists the ticked ones by index. */
  z.object({ type: z.literal("checks"), items: Items, on: z.array(Index).max(8) }),
  /** A slider from `low` to `high`, set at `value` (0 to 100). */
  z.object({ type: z.literal("slider"), text: Text(80), low: Text(40), high: Text(40), value: z.number().min(0).max(100) }),
  /** Stars, `value` out of 5. */
  z.object({ type: z.literal("rating"), text: Text(80), value: z.number().int().min(0).max(5) }),
  /** A bar filled to `value` percent, with an optional label. */
  z.object({ type: z.literal("meter"), value: z.number().min(0).max(100), text: Text(80).optional() }),
  /** One big number or word with what it counts. */
  z.object({ type: z.literal("stat"), value: Text(20), text: Text(80) }),
  /** Small labels, such as a status or tags. */
  z.object({ type: z.literal("badges"), items: Items, tone: Tone.optional() }),
  /** Label and value rows, like a settings panel. */
  z.object({ type: z.literal("fields"), rows: z.array(z.tuple([Text(60), Text(160)])).max(8) }),
  z.object({ type: z.literal("table"), columns: z.array(Text(40)).max(4), rows: z.array(z.array(Text(60)).max(4)).max(6) }),
  /** Sections that open and close; the one at `open` shows its body. */
  z.object({ type: z.literal("accordion"), sections: z.array(z.tuple([Text(60), Text(240)])).max(5), open: Index }),
  /** Numbered stages, up to `active` done. */
  z.object({ type: z.literal("steps"), items: Items, active: Index }),
  /** A person's name and a line about them, with a round initial. */
  z.object({ type: z.literal("person"), name: Text(60), text: Text(120) }),
  /** A chat bubble from the teacher or the assistant. */
  z.object({ type: z.literal("message"), from: z.enum(["teacher", "assistant"]), text: Text(240) }),
  /** A quoted passage, with where it comes from. */
  z.object({ type: z.literal("quote"), text: Text(240), source: Text(80) }),
  /** Text with changes marked: [-removed-] and [+added+]. */
  z.object({ type: z.literal("marked"), text: Text(400) }),
  z.object({ type: z.literal("compare"), before: Text(400), after: Text(400) }),
  /** A picture, drawn as a placeholder with its caption. */
  z.object({ type: z.literal("image"), text: Text(120) }),
  z.object({ type: z.literal("links"), items: Items }),
  z.object({ type: z.literal("divider") }),
  /* Activities for pupils: what a pupil sees and does, drawn with the correct answers marked. */
  /** A multiple-choice question; `answer` is the index of the right option. */
  z.object({ type: z.literal("question"), text: Text(200), items: Items, answer: Index }),
  /** Fill in the blanks: `text` with each answer in [[double brackets]]; `items` an optional word bank. */
  z.object({ type: z.literal("blanks"), text: Text(300), items: Items.optional() }),
  /** Match each left item to its right item; the pairs are given in matching order. */
  z.object({ type: z.literal("match"), pairs: z.array(z.tuple([Text(60), Text(60)])).max(6) }),
  /** Put in order; `items` are in the right order. */
  z.object({ type: z.literal("order"), items: Items }),
  /** A written answer, with what earns the marks (used to mark it automatically). */
  z.object({ type: z.literal("written"), text: Text(200), marks: Text(240) }),
  /** A pupil's result. */
  z.object({ type: z.literal("score"), value: z.number().int().min(0).max(100), total: z.number().int().min(1).max(100), text: Text(120) }),
  /** A link and join code for pupils, with a QR code. */
  z.object({ type: z.literal("share"), text: Text(80), code: Text(12) }),
  /** A small bar chart, such as class results per question; values 0 to 100. */
  z.object({ type: z.literal("bars"), rows: z.array(z.tuple([Text(40), z.number().min(0).max(100)])).max(6) }),
  /** A clock counting active time: built-in cards only. */
  z.object({ type: z.literal("timer") }),
  /** Something the kit cannot draw yet, described in words. Shown as a dashed box. */
  z.object({ type: z.literal("missing"), text: Text(240) }),
] as const;
export const MakeLeafPart = z.discriminatedUnion("type", [...LEAF_PARTS]);
export type MakeLeafPart = z.infer<typeof MakeLeafPart>;

/** A card's parts: the pieces above, and one level of grouping, a row or a framed box. */
export const MakePart = z.discriminatedUnion("type", [
  ...LEAF_PARTS,
  z.object({ type: z.literal("row"), parts: z.array(MakeLeafPart).max(4) }),
  z.object({ type: z.literal("box"), title: Text(80).optional(), parts: z.array(MakeLeafPart).max(6) }),
]);
export type MakePart = z.infer<typeof MakePart>;
export type MakePartType = MakePart["type"];

/** How many parts a card may have at its top level. */
export const MAKE_PARTS_MAX = 8;

export const MakeFit = z.record(MakeZone, z.object({ ok: z.boolean(), why: Text(120) }));
export type MakeFit = Partial<Record<MakeZone, { ok: boolean; why: string }>>;

/** A teacher's own feature, as the model designed it (or a sketch when no model was available). */
export const MakeIdea = z.object({
  id: z.string().min(1).max(40),
  title: Text(80),
  /** What the feature is for, in one sentence: kept as metadata, not shown on the card. */
  goal: Text(240).optional(),
  /** What the teacher asked for. */
  prompt: Text(2000),
  parts: z.array(MakePart).max(MAKE_PARTS_MAX),
  pill: Text(60),
  fit: MakeFit,
  zone: MakeZone,
  /** True when it was added without the model (a sketch of the request). */
  sketch: z.boolean().optional(),
});
export type MakeIdea = z.infer<typeof MakeIdea>;

export const MakePlacement = z.object({ uid: z.string().min(1).max(40), id: z.string().min(1).max(40), zone: MakeZone });
export type MakePlacement = z.infer<typeof MakePlacement>;

export const MakeFeedback = z.object({
  verdict: z.enum(["like", "dislike"]).nullable(),
  comment: Text(2000),
  at: z.string().max(40),
});
export type MakeFeedback = z.infer<typeof MakeFeedback>;

/** Everything on one teacher's board. Feedback is keyed by the part's name ("Chat › Send"). */
export const MakeBoard = z.object({
  placed: z.array(MakePlacement).max(200),
  ideas: z.array(MakeIdea).max(50),
  feedback: z.record(z.string().max(200), MakeFeedback).refine((f) => Object.keys(f).length <= 500, "too many feedback entries"),
  /** Anything else the teacher wants to say about the editor. */
  notes: Text(4000).optional(),
});
export type MakeBoard = z.infer<typeof MakeBoard>;
export const EMPTY_BOARD: MakeBoard = { placed: [], ideas: [], feedback: {} };

/* ------------------------------------------------------------- logged actions */

/** What the teacher did on the board, logged as a `make_action` event with each save. */
export const MakeAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("place"), card: z.string().max(40), zone: MakeZone }),
  z.object({ action: z.literal("move"), card: z.string().max(40), zone: MakeZone, from: MakeZone }),
  z.object({ action: z.literal("remove"), card: z.string().max(40), zone: MakeZone }),
  z.object({ action: z.literal("feedback"), target: z.string().max(200), verdict: z.enum(["like", "dislike"]).nullable(), comment: Text(2000) }),
  z.object({ action: z.literal("idea"), card: z.string().max(40), prompt: Text(2000), sketch: z.boolean() }),
]);
export type MakeAction = z.infer<typeof MakeAction>;
export const MAKE_ACTIONS_MAX = 100;
/** Design calls a workspace may make in an hour. */
export const MAKE_DESIGNS_PER_HOUR = 40;
