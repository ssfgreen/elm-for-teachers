/**
 * The printable login slips (#232): a document of its own, written into a hidden iframe and
 * printed from there, so the workspace needs no print styles and the interaction log never sees
 * a slip. Pure: the card writes what this returns.
 */
import type { MadeLogin } from '../../../api/pupilLogins';
import { LOG_IN, SIGN_UP, WHO_PUPIL } from '../../landing/content';

/** Question 118's default: no class code on the slip. Set true to print the code under the address. */
export const CODE_ON_SLIPS = false;

export interface SlipsInput {
  className: string;
  /** The site's address without `https://` (`siteAddress`). */
  address: string;
  logins: MadeLogin[];
  /** The class code, printed only when `CODE_ON_SLIPS` is on. */
  code?: string | null;
}

/** How a pupil gets in, in the front page's own words. */
export const SLIP_STEPS = `First time: ${SIGN_UP}, then ${WHO_PUPIL}, then the class code from your teacher. After that: ${LOG_IN}.`;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

const STYLE = `
  @page { margin: 12mm; }
  body { margin: 0; font-family: system-ui, sans-serif; color: black; background: white; }
  .slips { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .slip { border: 1px dashed currentColor; padding: 4mm 5mm; break-inside: avoid; font-size: 11pt; line-height: 1.4; }
  .slip h2 { margin: 0 0 2mm; font-size: 13pt; }
  .slip dl { display: grid; grid-template-columns: auto 1fr; gap: 1mm 4mm; margin: 2mm 0; }
  .slip dt { font-weight: 600; }
  .slip dd { margin: 0; font-family: ui-monospace, monospace; font-size: 13pt; }
  .slip p { margin: 0; font-size: 10pt; }
`;

/** The whole print document: one slip per login, several to a page. */
export function slipsHtml({ className, address, logins, code }: SlipsInput): string {
  const showCode = CODE_ON_SLIPS && code ? `<dt>Class code</dt><dd>${escapeHtml(code)}</dd>` : '';
  const slips = logins
    .map(
      (l) => `<section class="slip">
  <h2>${escapeHtml(className)}</h2>
  <dl><dt>Go to</dt><dd>${escapeHtml(address)}</dd>${showCode}<dt>Username</dt><dd>${escapeHtml(l.username)}</dd><dt>Password</dt><dd>${escapeHtml(l.password)}</dd></dl>
  <p>${escapeHtml(SLIP_STEPS)}</p>
</section>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Login slips</title><style>${STYLE}</style></head><body><main class="slips">
${slips}
</main></body></html>`;
}
