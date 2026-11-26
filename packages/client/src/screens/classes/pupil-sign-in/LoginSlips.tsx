/**
 * The once-only panel of the "Pupil logins" card (#232): the logins just made, or the one just given
 * a new password (#246, `title` "New password"), each username and password the value of a
 * read-only input, Print slips and Done (which asks for a second click).
 *
 * The slips print from a document of their own in a hidden iframe (`slips.ts`), so the workspace
 * needs no print styles and the interaction log, which watches this page only, never sees them.
 * The iframe goes after printing, on Done and when the panel unmounts, so no password is left in
 * the page.
 */
import { useEffect, useRef } from 'react';
import type { MadeLogin } from '../../../api/pupilLogins';
import { Button } from '../../../components/ui/button';
import { CONFIRM_DONE, NEW_LOGINS_TITLE, SHOWN_ONCE } from './pupilLogins';

export interface LoginSlipsProps {
  /** Ties each input's id to the class; the ids hold no username. */
  classId: string;
  made: MadeLogin[];
  /** The heading: "New logins" unless given. */
  title?: string;
  confirming: boolean;
  /** The print document for these logins (`slipsHtml`), asked for only when Print slips is clicked. */
  slips: () => Promise<string> | string;
  onAskDone(): void;
  onCancelDone(): void;
  onConfirmDone(): void;
}

/** A username or password: only ever the value of a read-only input, named by its label. */
function Field({ id, label, value }: { id: string; label: 'Username' | 'Password'; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-18 flex-none text-sm text-foreground-2">
        {label}
      </label>
      <input
        id={id}
        readOnly
        value={value}
        className="min-w-0 flex-1 rounded-sm border border-border-strong bg-card px-2 py-1 font-mono text-md"
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}

/** Writes the slips into a hidden iframe and prints it from there. Returns the iframe, to remove. */
export function printInFrame(html: string, doc: Document = document): HTMLIFrameElement {
  const frame = doc.createElement('iframe');
  frame.title = 'Login slips';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.addEventListener('load', () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.addEventListener('afterprint', () => frame.remove());
    win.focus();
    win.print();
  });
  frame.srcdoc = html;
  doc.body.appendChild(frame);
  return frame;
}

export function LoginSlips({ classId, made, title = NEW_LOGINS_TITLE, confirming, slips, onAskDone, onCancelDone, onConfirmDone }: LoginSlipsProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const drop = () => {
    frame.current?.remove();
    frame.current = null;
  };
  useEffect(() => drop, []);

  const print = async () => {
    const html = await slips();
    drop();
    frame.current = printInFrame(html);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning-border bg-warning-soft p-3" role="group" aria-labelledby={`pl-new-${classId}`}>
      <h3 id={`pl-new-${classId}`} className="m-0 text-md font-semibold">
        {title}
      </h3>
      <p className="m-0 text-sm">{SHOWN_ONCE}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {made.map((l, i) => (
          <li key={l.id} className="flex flex-col gap-1 border-t border-warning-border pt-2 first:border-t-0 first:pt-0">
            <Field id={`pl-nu-${classId}-${i}`} label="Username" value={l.username} />
            <Field id={`pl-np-${classId}-${i}`} label="Password" value={l.password} />
          </li>
        ))}
      </ul>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Hide the passwords">
          <span>{CONFIRM_DONE}</span>
          <Button
            size="sm"
            onClick={() => {
              drop();
              onConfirmDone();
            }}
          >
            Done
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancelDone}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void print()}>
            Print slips
          </Button>
          <Button variant="ghost" size="sm" onClick={onAskDone}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
