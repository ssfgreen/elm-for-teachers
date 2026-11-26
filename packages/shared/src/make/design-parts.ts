/** The parts the model may design with: an example for the prompt, and how to clean what it sends. */
import { MakeLeafPart, MakeTone, type MakePart } from "./schema.js";

/** No dashes (the kit's house style), trimmed and cut to `n`. */
export function cleanText(s: unknown, n: number): string {
  return String(s ?? "").replace(/[–—]|--/g, ",").slice(0, n).trim();
}

/* The parts the model may use: an example for the prompt, and how to clean what it sends. */
type Raw = Record<string, unknown>;
const str = (v: unknown, n = 90) => cleanText(v, n);
const list = (v: unknown, max: number, n = 40) => (Array.isArray(v) ? v.slice(0, max).map((x) => cleanText(x, n)).filter(Boolean) : []);
const pick = (v: unknown, len: number) => (Number.isInteger(v) ? Math.max(0, Math.min(Number(v), Math.max(0, len - 1))) : 0);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const tone = (v: unknown) => MakeTone.safeParse(v).data;
const withItems = <T extends MakeLeafPart>(part: T & { items: string[] }) => (part.items.length ? part : null);

type DesignLeaf = Exclude<MakeLeafPart["type"], "timer">;
export const DESIGN_PARTS: Record<DesignLeaf, { example: string; use: string; clean: (r: Raw) => MakeLeafPart | null }> = {
  heading: { example: '{"type":"heading","text":"..."}', use: "a short label", clean: (r) => ({ type: "heading", text: str(r.text, 60) }) },
  text: { example: '{"type":"text","text":"..."}', use: "a line or two of on-screen copy", clean: (r) => ({ type: "text", text: str(r.text, 160) }) },
  note: { example: '{"type":"note","text":"...","tone":"info|success|warning|danger"}', use: "a highlighted notice or warning", clean: (r) => ({ type: "note", text: str(r.text, 160), tone: tone(r.tone) }) },
  input: { example: '{"type":"input","text":"placeholder"}', use: "a one-line text box", clean: (r) => ({ type: "input", text: str(r.text, 80), value: str(r.value, 120) || undefined }) },
  textarea: { example: '{"type":"textarea","text":"placeholder"}', use: "a larger text box", clean: (r) => ({ type: "textarea", text: str(r.text, 80), value: str(r.value, 240) || undefined }) },
  toggle: { example: '{"type":"toggle","text":"..."}', use: "an on or off switch", clean: (r) => ({ type: "toggle", text: str(r.text, 80) }) },
  list: { example: '{"type":"list","items":["..."]}', use: "up to 6 rows, such as saved items", clean: (r) => withItems({ type: "list", items: list(r.items, 6, 60) }) },
  buttons: { example: '{"type":"buttons","items":["..."]}', use: "up to 3 buttons, the first is the main one", clean: (r) => withItems({ type: "buttons", items: list(r.items, 3, 30) }) },
  chips: { example: '{"type":"chips","items":["..."]}', use: "up to 5 quick choices, the first is selected", clean: (r) => withItems({ type: "chips", items: list(r.items, 5, 30) }) },
  tabs: {
    example: '{"type":"tabs","items":["...","..."],"active":0}',
    use: "tabs, with the index of the selected one",
    clean: (r) => {
      const items = list(r.items, 5, 24);
      return items.length ? { type: "tabs", items, active: pick(r.active, items.length) } : null;
    },
  },
  select: { example: '{"type":"select","text":"label","value":"chosen option"}', use: "a dropdown", clean: (r) => ({ type: "select", text: str(r.text, 60), value: str(r.value, 60) }) },
  radio: {
    example: '{"type":"radio","items":["...","..."],"active":0}',
    use: "pick one of up to 5, shown as a list",
    clean: (r) => {
      const items = list(r.items, 5);
      return items.length ? { type: "radio", items, active: pick(r.active, items.length) } : null;
    },
  },
  checks: {
    example: '{"type":"checks","items":["..."],"on":[0]}',
    use: "up to 6 checkboxes, with the indexes of the ticked ones",
    clean: (r) => {
      const items = list(r.items, 6, 60);
      const on = Array.isArray(r.on) ? r.on.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < items.length).slice(0, 6) : [];
      return items.length ? { type: "checks", items, on } : null;
    },
  },
  slider: {
    example: '{"type":"slider","text":"label","low":"Less","high":"More","value":50}',
    use: "how much of something, from low to high (value 0 to 100)",
    clean: (r) => ({ type: "slider", text: str(r.text, 60), low: str(r.low, 24), high: str(r.high, 24), value: num(r.value, 0, 100, 50) }),
  },
  rating: { example: '{"type":"rating","text":"label","value":4}', use: "stars out of 5", clean: (r) => ({ type: "rating", text: str(r.text, 60), value: Math.round(num(r.value, 0, 5, 4)) }) },
  meter: { example: '{"type":"meter","text":"label","value":60}', use: "a progress bar (value 0 to 100)", clean: (r) => ({ type: "meter", text: str(r.text, 60) || undefined, value: num(r.value, 0, 100, 50) }) },
  stat: { example: '{"type":"stat","value":"12","text":"what it counts"}', use: "one big number with what it counts", clean: (r) => ({ type: "stat", value: str(r.value, 12), text: str(r.text, 60) }) },
  badges: {
    example: '{"type":"badges","items":["..."],"tone":"info|success|warning|danger"}',
    use: "up to 4 small labels, such as a status",
    clean: (r) => withItems({ type: "badges", items: list(r.items, 4, 24), tone: tone(r.tone) }),
  },
  fields: {
    example: '{"type":"fields","rows":[["label","value"]]}',
    use: "up to 6 label and value rows, like settings",
    clean: (r) => {
      const rows = (Array.isArray(r.rows) ? r.rows : [])
        .filter((x): x is unknown[] => Array.isArray(x))
        .slice(0, 6)
        .map((x) => [str(x[0], 40), str(x[1], 80)] as [string, string])
        .filter(([k]) => k);
      return rows.length ? { type: "fields", rows } : null;
    },
  },
  table: {
    example: '{"type":"table","columns":["...","..."],"rows":[["...","..."]]}',
    use: "a small table, up to 4 columns and 5 rows",
    clean: (r) => {
      const columns = list(r.columns, 4, 24);
      const rows = (Array.isArray(r.rows) ? r.rows : []).filter(Array.isArray).slice(0, 5).map((x) => list(x, columns.length || 4, 40));
      return columns.length && rows.length ? { type: "table", columns, rows } : null;
    },
  },
  accordion: {
    example: '{"type":"accordion","sections":[["title","body"]],"open":0}',
    use: "up to 4 sections that open and close, with the open one",
    clean: (r) => {
      const sections = (Array.isArray(r.sections) ? r.sections : [])
        .filter((x): x is unknown[] => Array.isArray(x))
        .slice(0, 4)
        .map((x) => [str(x[0], 50), str(x[1], 160)] as [string, string])
        .filter(([t]) => t);
      return sections.length ? { type: "accordion", sections, open: pick(r.open, sections.length) } : null;
    },
  },
  steps: {
    example: '{"type":"steps","items":["...","..."],"active":1}',
    use: "up to 5 stages in order, with the current one",
    clean: (r) => {
      const items = list(r.items, 5, 24);
      return items.length ? { type: "steps", items, active: pick(r.active, items.length) } : null;
    },
  },
  person: { example: '{"type":"person","name":"...","text":"..."}', use: "a colleague or pupil, with a line about them", clean: (r) => ({ type: "person", name: str(r.name, 40), text: str(r.text, 80) }) },
  message: {
    example: '{"type":"message","from":"teacher|assistant","text":"..."}',
    use: "a chat bubble",
    clean: (r) => ({ type: "message", from: r.from === "teacher" ? "teacher" : "assistant", text: str(r.text, 160) }),
  },
  quote: { example: '{"type":"quote","text":"...","source":"..."}', use: "a quoted passage and where it comes from", clean: (r) => ({ type: "quote", text: str(r.text, 160), source: str(r.source, 60) }) },
  marked: { example: '{"type":"marked","text":"... [-removed-] [+added+] ..."}', use: "text with changes marked", clean: (r) => ({ type: "marked", text: str(r.text, 240) }) },
  compare: { example: '{"type":"compare","before":"...","after":"..."}', use: "before and after side by side", clean: (r) => ({ type: "compare", before: str(r.before, 160), after: str(r.after, 160) }) },
  image: { example: '{"type":"image","text":"caption"}', use: "a picture, such as a diagram or photo", clean: (r) => ({ type: "image", text: str(r.text, 80) }) },
  links: { example: '{"type":"links","items":["..."]}', use: "up to 4 links", clean: (r) => withItems({ type: "links", items: list(r.items, 4, 40) }) },
  divider: { example: '{"type":"divider"}', use: "a line between sections", clean: () => ({ type: "divider" }) },
  question: {
    example: '{"type":"question","text":"...","items":["...","..."],"answer":0}',
    use: "a multiple-choice question for pupils, with the right answer",
    clean: (r) => {
      const items = list(r.items, 5, 60);
      return items.length >= 2 ? { type: "question", text: str(r.text, 160), items, answer: pick(r.answer, items.length) } : null;
    },
  },
  blanks: {
    example: '{"type":"blanks","text":"Her smile was as bright [[as]] the sun.","items":["as","like"]}',
    use: "fill in the blanks for pupils; answers in [[double brackets]], optional word bank",
    clean: (r) => {
      const text = str(r.text, 240);
      if (!/\[\[[^\]]+\]\]/.test(text)) return null;
      const items = list(r.items, 6, 24);
      return { type: "blanks", text, items: items.length ? items : undefined };
    },
  },
  match: {
    example: '{"type":"match","pairs":[["...","..."]]}',
    use: "match up to 5 pairs, given in matching order",
    clean: (r) => {
      const pairs = (Array.isArray(r.pairs) ? r.pairs : [])
        .filter((x): x is unknown[] => Array.isArray(x))
        .slice(0, 5)
        .map((x) => [str(x[0], 40), str(x[1], 40)] as [string, string])
        .filter(([a, b]) => a && b);
      return pairs.length >= 2 ? { type: "match", pairs } : null;
    },
  },
  order: { example: '{"type":"order","items":["first","second","third"]}', use: "put up to 5 items in order, given in the right order", clean: (r) => withItems({ type: "order", items: list(r.items, 5, 60) }) },
  written: {
    example: '{"type":"written","text":"question","marks":"what earns the marks"}',
    use: "a written answer for pupils, with what earns the marks so it can be marked automatically",
    clean: (r) => ({ type: "written", text: str(r.text, 160), marks: str(r.marks, 160) }),
  },
  score: {
    example: '{"type":"score","value":7,"total":10,"text":"..."}',
    use: "a pupil's mark, out of a total, with a line of feedback",
    clean: (r) => {
      const total = Math.round(num(r.total, 1, 100, 10));
      return { type: "score", value: Math.round(num(r.value, 0, total, Math.round(total * 0.7))), total, text: str(r.text, 100) };
    },
  },
  share: {
    example: '{"type":"share","text":"what pupils open","code":"P7-4821"}',
    use: "a link and join code (with a QR code) to share with pupils",
    clean: (r) => ({ type: "share", text: str(r.text, 60), code: str(r.code, 10).replace(/\s+/g, "") || "P7-4821" }),
  },
  bars: {
    example: '{"type":"bars","rows":[["Q1",80],["Q2",45]]}',
    use: "a small bar chart, such as class results per question (values 0 to 100)",
    clean: (r) => {
      const rows = (Array.isArray(r.rows) ? r.rows : [])
        .filter((x): x is unknown[] => Array.isArray(x))
        .slice(0, 6)
        .map((x) => [str(x[0], 24), num(x[1], 0, 100, 0)] as [string, number])
        .filter(([k]) => k);
      return rows.length ? { type: "bars", rows } : null;
    },
  },
  missing: { example: '{"type":"missing","text":"..."}', use: "something none of these parts can show, in words", clean: (r) => ({ type: "missing", text: str(r.text, 160) }) },
};
export const DESIGN_PART_TYPES = Object.keys(DESIGN_PARTS) as DesignLeaf[];

export function designPartList(): string {
  const leaves = DESIGN_PART_TYPES.map((t) => `- ${DESIGN_PARTS[t].example}  ${DESIGN_PARTS[t].use}`);
  return [
    ...leaves,
    '- {"type":"row","parts":[...]}  up to 4 small parts side by side, such as a select and a button',
    '- {"type":"box","title":"...","parts":[...]}  a framed group of up to 6 parts',
    "Rows and boxes hold the parts above, not other rows or boxes.",
  ].join("\n");
}

function cleanLeaf(raw: unknown): MakeLeafPart | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const spec = DESIGN_PARTS[String(r.type) as DesignLeaf];
  if (!spec || !Object.hasOwn(DESIGN_PARTS, String(r.type))) return null;
  const part = spec.clean(r);
  return part && MakeLeafPart.safeParse(part).success ? part : null;
}

/** One part from the model, cleaned; rows and boxes keep the parts inside that are usable. */
export function cleanPart(raw: unknown): MakePart | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (r.type === "row" || r.type === "box") {
    const inner = (Array.isArray(r.parts) ? r.parts : []).map(cleanLeaf).filter((p): p is MakeLeafPart => p !== null).slice(0, r.type === "row" ? 4 : 6);
    if (!inner.length) return null;
    return r.type === "row" ? { type: "row", parts: inner } : { type: "box", title: str(r.title, 60) || undefined, parts: inner };
  }
  return cleanLeaf(r);
}
