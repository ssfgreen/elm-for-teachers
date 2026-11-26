/** What the model designs, checked and cleaned, and a sketch card when no model answers. */
import { MAKE_PARTS_MAX, MAKE_ZONE_IDS, MakeZone, type MakeFit, type MakeIdea, type MakePart } from "./schema.js";
import { cleanPart, cleanText } from "./design-parts.js";
import type { DesignOption, DesignResult } from "./design-prompt.js";

const ZONE_WHY: Record<MakeZone, string> = {
  docs: "with your documents",
  docitem: "with this document in the sidebar",
  classes: "with the class it is about",
  personalise: "one of your own settings",
  skills: "know-how the assistant reuses",
  prompts: "with your saved prompts",
  sidebar: "with your saved things",
  banner: "seen before you send",
  chat: "part of the conversation",
  composer: "beside the assistant",
  header: "for the whole document",
  export: "with download",
  doctabs: "one tab per version",
  toolbar: "with the editing tools",
  doc: "right where the content is",
  inline: "at the part it is about",
  docfooter: "under the worksheet, like footnotes",
  margin: "beside the worksheet",
  bottom: "always visible, out of the way",
};
const KEYWORD_ZONES: Array<[RegExp, MakeZone]> = [
  [/undo|redo|format|highlight|track|font|edit|print/i, "toolbar"],
  [/export|download/i, "export"],
  [/share|colleague|history|earlier/i, "header"],
  [/version|level|tab/i, "doctabs"],
  [/compare|side by side|inline/i, "inline"],
  [/source|footnote|reference/i, "docfooter"],
  [/ask|question|suggest|choose|option|idea|chat|reply|talk/i, "chat"],
  [/warn|alert|careful|privacy|personal|sensitive/i, "banner"],
  [/class|pupil profile|group/i, "classes"],
  [/my style|preference|personal|tone/i, "personalise"],
  [/skill|know-how|how to/i, "skills"],
  [/prompt|template|reuse|save/i, "prompts"],
  [/file|folder|library|document list/i, "docs"],
  [/project/i, "sidebar"],
  [/cost|token|status|progress|count|time/i, "bottom"],
  [/flag|notice|lower|learning intention|change/i, "doc"],
  [/comment|reason|note|why|guidance|assumption|check|differentiat/i, "margin"],
  [/read aloud|voice|send|model|setting/i, "composer"],
];

/** Every idea gets at least two good places: the model's view first, then simple keyword rules. */
export function ensureFit(fit: MakeFit, text: string): MakeFit {
  const out: MakeFit = { ...fit };
  const good = () => MAKE_ZONE_IDS.filter((z) => out[z]?.ok).length;
  const tryAdd = (z: MakeZone) => {
    if (good() >= 2 || out[z]?.ok === false) return;
    out[z] = { ok: true, why: out[z]?.why ?? ZONE_WHY[z] };
  };
  for (const [re, z] of KEYWORD_ZONES) if (re.test(text)) tryAdd(z);
  for (const z of ["margin", "toolbar", "chat", "doc", "composer", "bottom", "sidebar"] as const satisfies readonly MakeZone[]) tryAdd(z);
  return out;
}

/** A card for a request when the model is not available: the teacher's words, placed by keyword. */
export function sketchIdea(id: string, text: string): MakeIdea {
  const fit = ensureFit({}, text);
  const zone = MAKE_ZONE_IDS.find((z) => fit[z]?.ok) ?? "margin";
  const title = cleanText(text.split(/\s+/).slice(0, 5).join(" "), 80) || "New feature";
  return { id, title, prompt: text.slice(0, 2000), parts: [{ type: "heading", text: title }, { type: "text", text: cleanText(text, 240) }], pill: `✦ ${title}`.slice(0, 60), fit, zone, sketch: true };
}

function cleanOption(o: Record<string, unknown>, text: string): DesignOption | null {
  const parts: MakePart[] = [];
  for (const raw of Array.isArray(o.parts) ? o.parts : []) {
    const part = cleanPart(raw);
    if (part) parts.push(part);
    if (parts.length === MAKE_PARTS_MAX) break;
  }
  if (!parts.length) return null;
  const fit: MakeFit = {};
  const rawFit = o.fit && typeof o.fit === "object" ? (o.fit as Record<string, { ok?: unknown; why?: unknown }>) : {};
  for (const z of MAKE_ZONE_IDS) {
    const v = rawFit[z];
    if (v && typeof v.ok === "boolean") fit[z] = { ok: v.ok, why: cleanText(v.why, 60) || (v.ok ? "good fit" : "poor fit") };
  }
  const title = cleanText(o.title, 50) || "New feature";
  const fitted = ensureFit(fit, `${text} ${title}`);
  const asked = MakeZone.safeParse(o.zone);
  const zone = asked.success && fitted[asked.data]?.ok ? asked.data : (MAKE_ZONE_IDS.find((z) => fitted[z]?.ok) ?? "margin");
  return { title, goal: cleanText(o.goal, 200), zone, pill: cleanText(o.pill, 40) || `✦ ${title}`, parts, fit: fitted };
}

/** The model's reply as one option (the first, if it sent more); null when it holds no usable JSON. */
export function parseDesign(reply: string, text: string): DesignResult | null {
  const m = /\{[\s\S]*\}/.exec(reply);
  if (!m) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const options = (Array.isArray(j.options) ? (j.options as Record<string, unknown>[]) : [])
    .slice(0, 1)
    .map((o) => (o && typeof o === "object" ? cleanOption(o, text) : null))
    .filter((o): o is DesignOption => o !== null);
  if (!options.length) return null;
  return { understood: cleanText(j.understood, 220), question: j.question ? cleanText(j.question, 200) || null : null, options };
}
