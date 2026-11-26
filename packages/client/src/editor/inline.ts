/**
 * Inline markdown for block content: `**bold**`, `*italic*`, `<u>underline</u>`,
 * `` `code` ``, text colour `<span data-color="red">…</span>` (one of TEXT_COLORS), a font
 * `<span data-font="georgia">…</span>` (one of DocFont), a size `<span data-size="large">…</span>`
 * (one of TEXT_SIZES),
 * highlight `<mark>…</mark>`, links `[text](https://…)` and a writing line to the right margin,
 * `<line/>` (extensions/writingLine.ts). Underscores are left alone on purpose: worksheets use
 * runs of underscores as short blanks. A link needs an
 * http(s) or mailto address, so "[2 marks]" stays text. Mark names are Tiptap's.
 *
 * Paragraphs may hold line breaks (Shift+Enter): a `\n` in the content is a hardBreak
 * node. Elsewhere (headings, list items, table cells) a line ends the item, so a break
 * there is read and written as a space.
 */
import { Fragment, type Mark, type Node, type Schema } from "@tiptap/pm/model";
import { DocFont } from "@edw/shared";
import { TEXT_COLORS, type TextColor } from "./textColors.js";
import { isTextSize, type TextSize } from "./textSizes.js";

type Simple = "bold" | "italic" | "underline" | "code" | "highlight";
/** A mark as written: its name and, for a colour or a link, its value. */
type Written = { name: Simple } | { name: "textColor"; color: TextColor } | { name: "textFont"; font: DocFont } | { name: "textSize"; size: TextSize } | { name: "link"; href: string };

const SIMPLE_OPEN: Record<Simple, string> = { bold: "**", italic: "*", underline: "<u>", code: "`", highlight: "<mark>" };
const SIMPLE_CLOSE: Record<Simple, string> = { bold: "**", italic: "*", underline: "</u>", code: "`", highlight: "</mark>" };
/** Serialisation nesting order, outermost first. */
const ORDER: Written["name"][] = ["link", "textFont", "textSize", "textColor", "highlight", "bold", "italic", "underline", "code"];

/** The marks written as a `<span data-…>`, closed by any `</span>`. */
const SPANS: ReadonlyArray<Written["name"]> = ["textColor", "textFont", "textSize"];
const keyOf = (m: Written) =>
  m.name === "textColor" ? `color:${m.color}` : m.name === "textFont" ? `font:${m.font}` : m.name === "textSize" ? `size:${m.size}` : m.name === "link" ? `link:${m.href}` : m.name;
const openOf = (m: Written) =>
  m.name === "textColor"
    ? `<span data-color="${m.color}">`
    : m.name === "textFont"
      ? `<span data-font="${m.font}">`
      : m.name === "textSize"
        ? `<span data-size="${m.size}">`
        : m.name === "link"
          ? "["
          : SIMPLE_OPEN[m.name];
const closeOf = (m: Written) =>
  m.name === "textColor" || m.name === "textFont" || m.name === "textSize" ? "</span>" : m.name === "link" ? `](${m.href})` : SIMPLE_CLOSE[m.name];

/** A writing line to the right margin. */
export const LINE_TAG = "<line/>";
const COLOR_OPEN_RE = /^<span data-color="([a-z]+)">/;
const FONT_OPEN_RE = /^<span data-font="([a-z_]+)">/;
const SIZE_OPEN_RE = /^<span data-size="([a-z_]+)">/;
/** The address of a link: http(s) or mailto, no spaces or closing brackets. */
const URL_RE = /^(?:https?:\/\/|mailto:)[^\s)]+/;
const isColor = (c: string): c is TextColor => (TEXT_COLORS as readonly string[]).includes(c);
const isFont = (f: string): f is DocFont => (DocFont.options as readonly string[]).includes(f);

/**
 * Where a link starting with `[` at `i` ends: the index of its `]`, its address and the index
 * after its `)`. Null when it is not a link (brackets in ordinary text).
 */
function linkAt(md: string, i: number): { close: number; href: string; end: number } | null {
  for (let j = i + 1; j < md.length; j++) {
    const ch = md[j]!;
    if (ch === "\n") return null;
    if (ch === "\\") {
      j += 1;
      continue;
    }
    if (ch === "]") {
      if (md[j + 1] !== "(") return null;
      const url = URL_RE.exec(md.slice(j + 2));
      if (!url || md[j + 2 + url[0].length] !== ")") return null;
      return { close: j, href: url[0], end: j + 3 + url[0].length };
    }
  }
  return null;
}

export function parseInline(schema: Schema, md: string, breaks = false): Node[] {
  const out: Node[] = [];
  let buf = "";
  let active: Written[] = [];
  /** The open link's `]` and the index just after its `)`. */
  let link: { close: number; end: number } | null = null;
  const toMark = (m: Written): Mark | null => {
    const type = schema.marks[m.name];
    if (!type) return null;
    if (m.name === "textColor") return type.create({ color: m.color });
    if (m.name === "textFont") return type.create({ font: m.font });
    if (m.name === "textSize") return type.create({ size: m.size });
    return m.name === "link" ? type.create({ href: m.href }) : type.create();
  };
  const flush = () => {
    if (!buf) return;
    out.push(schema.text(buf, active.map(toMark).filter((m): m is Mark => m !== null)));
    buf = "";
  };
  const has = (name: Written["name"]) => active.some((m) => m.name === name);
  const open = (m: Written) => {
    flush();
    active = [...active.filter((x) => x.name !== m.name), m];
  };
  const close = (name: Written["name"]) => {
    flush();
    active = active.filter((x) => x.name !== name);
  };
  let i = 0;
  while (i < md.length) {
    if (link && i === link.close) {
      close("link");
      i = link.end;
      link = null;
      continue;
    }
    const ch = md[i]!;
    const inCode = has("code");
    if (ch === "\\" && i + 1 < md.length && !inCode) {
      buf += md[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      if (inCode) close("code");
      else open({ name: "code" });
      i += 1;
      continue;
    }
    if (ch === "\n" || (ch === "\r" && md[i + 1] === "\n")) {
      i += ch === "\r" ? 2 : 1;
      if (breaks) {
        flush();
        out.push(schema.nodes.hardBreak!.create());
      } else buf += " ";
      continue;
    }
    if (inCode) {
      buf += ch;
      i += 1;
      continue;
    }
    if (md.startsWith("**", i)) {
      if (has("bold")) close("bold");
      else open({ name: "bold" });
      i += 2;
      continue;
    }
    if (ch === "*") {
      if (has("italic")) close("italic");
      else open({ name: "italic" });
      i += 1;
      continue;
    }
    if (ch === "<") {
      if (md.startsWith(LINE_TAG, i) && schema.nodes.writingLine) {
        flush();
        out.push(schema.nodes.writingLine.create());
        i += LINE_TAG.length;
        continue;
      }
      const tag = /^<(\/?)(u|mark)>/.exec(md.slice(i, i + 7));
      if (tag) {
        const name = tag[2] === "u" ? "underline" : "highlight";
        if (tag[1]) close(name);
        else open({ name });
        i += tag[0].length;
        continue;
      }
      const color = COLOR_OPEN_RE.exec(md.slice(i, i + 40));
      if (color && isColor(color[1]!)) {
        open({ name: "textColor", color: color[1] });
        i += color[0].length;
        continue;
      }
      const font = FONT_OPEN_RE.exec(md.slice(i, i + 40));
      if (font && isFont(font[1]!)) {
        open({ name: "textFont", font: font[1] });
        i += font[0].length;
        continue;
      }
      const size = SIZE_OPEN_RE.exec(md.slice(i, i + 40));
      if (size && isTextSize(size[1])) {
        open({ name: "textSize", size: size[1] });
        i += size[0].length;
        continue;
      }
      // A </span> closes the innermost of the open colour, font and size.
      const span = [...active].reverse().find((m) => SPANS.includes(m.name));
      if (md.startsWith("</span>", i) && span) {
        close(span.name);
        i += 7;
        continue;
      }
    }
    if (ch === "[" && !link) {
      const l = linkAt(md, i);
      if (l) {
        open({ name: "link", href: l.href });
        link = { close: l.close, end: l.end };
        i += 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

/** `breaks`: keep line breaks (paragraphs only). */
export function inlineFragment(schema: Schema, md: string, breaks = false): Fragment {
  return Fragment.from(parseInline(schema, md, breaks));
}

function escapePlain(text: string): string {
  return (
    text
      .replace(/([\\*`])/g, "\\$1")
      .replace(/<(\/?(?:u|mark)>|span data-(?:color|font|size)=|\/span>|line\/>)/g, "\\<$1")
      // Text that would read back as a link: its "]" is escaped.
      .replace(/\](?=\((?:https?:\/\/|mailto:))/g, "\\]")
  );
}

function writtenOf(marks: readonly Mark[]): Written[] {
  const out: Written[] = [];
  for (const name of ORDER) {
    const m = marks.find((k) => k.type.name === name);
    if (!m) continue;
    if (name === "textColor") {
      const c = String(m.attrs.color ?? "");
      if (isColor(c)) out.push({ name, color: c });
    } else if (name === "textFont") {
      const f = String(m.attrs.font ?? "");
      if (isFont(f)) out.push({ name, font: f });
    } else if (name === "textSize") {
      const z = String(m.attrs.size ?? "");
      if (isTextSize(z)) out.push({ name, size: z });
    } else if (name === "link") {
      const href = String(m.attrs.href ?? "");
      if (URL_RE.test(href) && URL_RE.exec(href)![0] === href) out.push({ name, href });
    } else out.push({ name });
  }
  return out;
}

/** Markdown for one run of inline content (a textblock's children); a line break is `\n`, or a space when `breaks` is false. */
export function serializeInline(content: Fragment | Node, breaks = false): string {
  const frag = content instanceof Fragment ? content : content.content;
  let out = "";
  let open: Written[] = [];
  const closeDownTo = (keep: string[]) => {
    // Close from the innermost out, down to the first mark that is not wanted any more.
    const first = open.findIndex((m) => !keep.includes(keyOf(m)));
    if (first < 0) return;
    for (let k = open.length - 1; k >= first; k--) out += closeOf(open[k]!);
    open = open.slice(0, first);
  };
  frag.forEach((node) => {
    if (node.type.name === "hardBreak") {
      // A link cannot run over a line break: close it (and what is inside it), and reopen after.
      if (open.some((m) => m.name === "link")) closeDownTo(open.filter((m) => m.name !== "link").map(keyOf));
      out += breaks ? "\n" : " ";
      return;
    }
    if (node.type.name === "writingLine") {
      closeDownTo([]);
      out += LINE_TAG;
      return;
    }
    if (!node.isText) return;
    const want = writtenOf(node.marks);
    closeDownTo(want.map(keyOf));
    for (const m of want) {
      if (!open.some((o) => keyOf(o) === keyOf(m))) {
        out += openOf(m);
        open.push(m);
      }
    }
    const text = want.some((m) => m.name === "code") ? node.text! : escapePlain(node.text!);
    // Inside a link any "]" would end it.
    out += want.some((m) => m.name === "link") && !want.some((m) => m.name === "code") ? text.replace(/(?<!\\)\]/g, "\\]") : text;
  });
  closeDownTo([]);
  return out;
}

/**
 * Markdown for any node: a textblock's own inline run, or its block children
 * joined with spaces (a list item or table cell holding paragraphs).
 */
export function inlineText(node: Node): string {
  if (node.isTextblock) return serializeInline(node);
  const parts: string[] = [];
  node.forEach((child) => parts.push(inlineText(child)));
  return parts.filter((p) => p.length).join(" ");
}

/** Plain text of inline content, marks dropped. */
export function plainText(content: Fragment | Node): string {
  const frag = content instanceof Fragment ? content : content.content;
  let s = "";
  frag.forEach((n) => {
    if (n.isText) s += n.text;
    else if (n.type.name === "hardBreak") s += "\n";
    else if (n.type.name === "writingLine") s += "________";
  });
  return s;
}
