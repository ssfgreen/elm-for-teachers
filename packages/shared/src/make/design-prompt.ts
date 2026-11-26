/** The design step's request, result and prompt: the model designs a feature a teacher describes. */
import { z } from "zod";
import { MAKE_PARTS_MAX, MAKE_ZONE_IDS, MakePart, MakeZone, type MakeFit } from "./schema.js";
import { designPartList } from "./design-parts.js";

const Text = (n: number) => z.string().max(n);

/** What the model is told each place is for. */
export const ZONE_JOBS = `- docs: a Docs section in the sidebar, beside the documents listed under their chats. Folders and documents, such as a shared library.
- docitem: under the open document, which the sidebar lists under its chat. Notes about that document, such as how it went.
- classes: the sidebar's section for each class (here P7). The class's profile, notes and what is kept about it.
- personalise: the sidebar's section for the teacher's own preferences, such as their style.
- skills: the sidebar's section of saved know-how the assistant uses, such as how to adapt for dyslexia.
- prompts: the sidebar's section of saved prompts and templates.
- sidebar: anywhere else in the left sidebar, below the chats. Navigation and saved things only, never actions on the current document.
- banner: a notice across the top of the chat. Warnings and reminders before or while you write.
- chat: the conversation with the assistant. Questions, replies and choices the assistant offers.
- composer: the chat footer, the small bar under the message box beside the model picker. Controls for the next message or the assistant itself.
- header: the document's header, beside its name. Buttons for the whole document, such as share or earlier versions.
- export: the Download menu. Ways to take the document away.
- doctabs: tabs across the top of the document, one per version of it.
- toolbar: the document formatting toolbar. Actions that change the document, such as undo, compare or formatting.
- doc: the top of the worksheet itself. Only notices about the content of this worksheet. Anything here risks ending up in what pupils see.
- inline: inside the worksheet, between its parts, at the place a change is about.
- docfooter: a bar along the bottom of the document, like footnotes.
- margin: the comments column beside the worksheet. Comments and notes tied to parts of the worksheet.
- bottom: the footer, a thin bar along the bottom of the screen. Quiet, always-visible status and workspace-wide shortcuts.`;

export const DesignRequest = z.object({
  text: z.string().trim().min(1).max(2000),
  /** What to change about the design shown last, with that design. The kit no longer sends these (5 Nov). */
  feedback: z.string().trim().max(2000).optional(),
  previous: z.array(z.object({ title: Text(80), zone: MakeZone, parts: z.array(MakePart).max(MAKE_PARTS_MAX) })).max(2).optional(),
});
export type DesignRequest = z.infer<typeof DesignRequest>;

export interface DesignOption {
  title: string;
  /** What it is for, in one sentence. */
  goal: string;
  zone: MakeZone;
  pill: string;
  parts: MakePart[];
  fit: MakeFit;
}
export interface DesignResult {
  understood: string;
  question: string | null;
  /** The design: one since 5 Nov, still a list so the logged results keep their shape. */
  options: DesignOption[];
}

export const DESIGN_INSTRUCTIONS = `You design interface components for a teacher-facing AI document editor. Teachers use it to adapt classroom resources (worksheets, homework) for their pupils. Reply with JSON only.`;

export function designPrompt(req: DesignRequest): string {
  const again = req.feedback && req.previous?.length ? `\nYou already proposed:\n${JSON.stringify(req.previous)}\nThe teacher wants this changed:\n"""${req.feedback}"""\n` : "";
  const fitShape = MAKE_ZONE_IDS.map((z, i) => (i ? `"${z}":{...}` : `"${z}":{"ok":true|false|null,"why":"under 8 words"}`)).join(",");
  return `The current worksheet is a P7 similes and metaphors homework. The screen has ${MAKE_ZONE_IDS.length} places, each with a clear job:
${ZONE_JOBS}

A teacher described this feature:
"""${req.text}"""
${again}
Design ONE clear version of it. It must look like a real piece of interface, built from these parts, in order:
${designPartList()}
Use 2 to ${MAKE_PARTS_MAX} parts at the top level; keep cards small, as the places are narrow. Pick the part that fits what the teacher described, such as a slider for "how much", a table for rows of information, radio for one choice of a few. If something they describe cannot be shown with these parts, use one {"type":"missing","text":"..."} part that says in a few words what it would be, rather than a poor match.
If the feature makes something pupils use (an activity, a quiz, a game), show both sides: the teacher's control, then a box titled "What pupils see" built from the activity parts (question, blanks, match, order, written), and where useful how it is shared and marked (share, score, bars).
Fill parts with realistic example content for a P7 teacher, such as real-looking saved prompt names, not placeholders.
If the teacher names a place (for example "in the sidebar"), use that place.

Reply with only JSON, no other text:
{"understood":"one sentence saying what you think the teacher wants, in plain words",
 "question":"one short question if something important is unclear, otherwise null",
 "options":[{"title":"at most 5 words","goal":"one sentence: what this lets the teacher do, and why it matters to them","zone":"best place","pill":"under 4 words, how it looks as a small button or label in a bar, may start with one symbol",
   "parts":[...],
   "fit":{${fitShape}}}]}
Mark at least two places ok true, and make "zone" one of them. Use British English and plain words a primary teacher would use. Do not use dashes. Stay faithful to what the teacher asked for; do not add features they did not describe.`;
}
