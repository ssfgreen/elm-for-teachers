/**
 * SVG pictures: drawings the assistant writes as an image block's content, and .svg files a
 * teacher uploads. Both are kept as image assets and shown with <img>, where an SVG cannot run
 * script. Cleaning is a second guard, for a file opened on its own: it keeps the first <svg>
 * element and takes out scripts, embedded HTML, event handlers, external references and
 * entity declarations. It also gives the drawing a size, from its viewBox, so it can be drawn
 * into a canvas for the Word file.
 */

export const SVG_MIME = "image/svg+xml";
/** The largest drawing kept, in characters. */
export const SVG_MAX = 200_000;

/** True when a block's content is a drawing rather than a stored picture. */
export const isSvgContent = (content: string): boolean => /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(content);

/** Elements taken out with what is inside them, with or without a namespace prefix (`svg:script`). Animation goes too, as it can change a link. */
const DROPPED = "script|foreignObject|iframe|embed|object|audio|video|canvas|handler|listener|set|animate|animateMotion|animateTransform|animateColor";
const DROP_ELEMENTS = new RegExp(`<((?:[\\w-]+:)?(?:${DROPPED}))\\b[\\s\\S]*?(?:<\\/\\1\\s*>|\\/>)`, "gi");
const DROP_OPENINGS = new RegExp(`<\\/?(?:[\\w-]+:)?(?:${DROPPED})\\b[^>]*>`, "gi");
const EVENT_ATTRS = /\s(?:on[a-z]+|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
/** href and xlink:href, kept only for references inside the drawing and embedded raster images. */
const HREF_ATTRS = /\s((?:xlink:)?href)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const SAFE_HREF = /^(?:#[\w.:-]*|data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+)$/i;

const num = (s: string | undefined): number | null => {
  const v = s ? Number.parseFloat(s) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** A drawing safe to keep, with its alt text (its <title>), or null when there is no <svg> in it. */
export function cleanSvg(raw: string): { svg: string; alt: string } | null {
  if (raw.length > SVG_MAX) return null;
  const m = /<svg\b[\s\S]*<\/svg\s*>/i.exec(raw);
  if (!m) return null;
  let svg = m[0]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!(?:DOCTYPE|ENTITY)[\s\S]*?>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(DROP_ELEMENTS, "")
    // An opening tag left without its end (a cut drawing) goes too.
    .replace(DROP_OPENINGS, "")
    .replace(EVENT_ATTRS, "")
    .replace(HREF_ATTRS, (all, _name: string, _q: string, dq: string | undefined, sq: string | undefined) => (SAFE_HREF.test((dq ?? sq ?? "").trim()) ? all : ""))
    // No fetching from elsewhere in styles.
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "");

  const open = /^<svg\b[^>]*>/i.exec(svg)![0];
  let tag = open;
  if (!/\sxmlns\s*=/.test(tag)) tag = tag.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
  const box = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const boxW = box && box.length === 4 && box[2]! > 0 ? box[2]! : null;
  const boxH = box && box.length === 4 && box[3]! > 0 ? box[3]! : null;
  const w = num(attr("width")?.replace(/px$/, ""));
  const h = num(attr("height")?.replace(/px$/, ""));
  if (!w || !h) {
    // Width and height from the viewBox (or each other), so it has a size of its own; 400 by 300 failing both.
    const width = w ?? (h && boxW && boxH ? (h * boxW) / boxH : (boxW ?? 400));
    const height = h ?? (boxW && boxH ? (width * boxH) / boxW : 300);
    tag = tag.replace(/\s(width|height)\s*=\s*(["'])[^"']*\2/gi, "").replace(/^<svg/i, `<svg width="${Math.round(width)}" height="${Math.round(height)}"`);
  }
  svg = tag + svg.slice(open.length);

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(svg)?.[1] ?? "";
  const alt = title
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return { svg, alt };
}
