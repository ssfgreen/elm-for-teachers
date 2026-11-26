/**
 * The layout check: a doc's blocks laid out as the Word download sets them (A4, the doc's font),
 * paginated, and checked for writing lines, table columns, spacing and page ends. The report is
 * text for the model, which cannot see the page: it names blocks by number and id, as
 * read_document does, and says what would fix each problem where that is clear.
 */
import type { DocFont } from "../enums.js";
import { layBlocks, type LayoutBlock } from "./blocks.js";
import { pct, type LayoutArea, type LayoutFinding } from "./findings.js";
import { faceFor } from "./fonts.js";
import { lineFindings } from "./lineChecks.js";
import { pageFindings } from "./pageChecks.js";
import { paginate } from "./pages.js";
import { spacingFindings } from "./spacingChecks.js";
import { tableFindings } from "./tableChecks.js";
import { PAGE } from "./word.js";

export interface LayoutCheck {
  pages: number;
  findings: LayoutFinding[];
  /** The report for the model. */
  text: string;
}

const AREAS: Array<[LayoutArea, string]> = [
  ["lines", "Writing lines and blanks"],
  ["tables", "Tables"],
  ["spacing", "Spacing"],
  ["pages", "Pages"],
];

/** Checks one doc's blocks, in order (as read_document numbers them). */
export function checkLayout(blocks: readonly LayoutBlock[], font?: DocFont | null): LayoutCheck {
  const f = faceFor(font);
  const laid = layBlocks(blocks, f);
  const { pages, places } = paginate(laid);
  const findings = [...lineFindings(laid, f), ...tableFindings(laid), ...spacingFindings(laid), ...pageFindings(laid, pages, places)];

  const ref = (i: number) => `${i + 1} [id=${blocks[i]!.id}]`;
  const where = (is: readonly number[]) => (is.length === 0 ? "" : is.length === 1 ? `Block ${ref(is[0]!)}: ` : `Blocks ${is.map(ref).join(", ")}: `);
  const out: string[] = [
    `As printed or opened in Word: A4, 2.54 cm margins, ${f.name} 12 pt.${f.estimated ? ` ${f.name}'s letter widths are estimated from a similar font, so a line can end a word or so away from Word's.` : ""} Page ends can be a line or two off.`,
    `Pages: ${pages.length}. ${pages
      .map((p) => {
        const from = p.blocks[0];
        const to = p.blocks[p.blocks.length - 1];
        const span = from === undefined ? "nothing" : from === to ? `block ${from + 1}` : `blocks ${from + 1} to ${to! + 1}`;
        return `Page ${p.number}: ${span}, ${p.used >= PAGE.height * 0.97 ? "full" : `${pct(Math.min(1, p.used / PAGE.height))} full`}.`;
      })
      .join(" ")}`,
  ];
  if (findings.length === 0) out.push("No problems found with writing lines, tables, spacing or page ends.");
  for (const [area, title] of AREAS) {
    const fs = findings.filter((x) => x.area === area);
    if (fs.length) out.push(`${title}:\n${fs.map((x) => `- ${where(x.blocks)}${x.text}`).join("\n")}`);
  }
  return { pages: pages.length, findings, text: out.join("\n\n") };
}
