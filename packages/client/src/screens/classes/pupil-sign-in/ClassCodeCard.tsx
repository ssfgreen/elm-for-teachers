/**
 * The "Class code" card on a class's page (#212): the code pupils join the class with at
 * <site>/r. No code: "Make a code". A code: the code, Copy, Renew and Close (Renew and Close ask
 * for a second click). Not drawn for an archived class, nor without class codes in the api (the
 * make kit, or `pupils` off).
 *
 * The code stays out of research data: it is only ever the value of a read-only input labelled
 * "Class code", never in a button, link or label, and the interaction log never reads a field's
 * value or a selection inside one.
 */
import { useState } from 'react';
import { hasClassCode, type ClassCodeApi } from '../../../api/classCode';
import type { SessionApi } from '../../../api/participant';
import type { Envelope } from '../../../api/types';
import { Button } from '../../../components/ui/button';
import { cardClass, cardTitleClass, hintClass } from '../styles';
import { CONFIRM, pupilAddress } from './classCode';
import { useClassCode } from './useClassCode';

export interface ClassCodeCardProps {
  classId: string;
  archived: boolean;
  api: SessionApi;
  getEnvelope: () => Envelope;
}

export function ClassCodeCard({ classId, archived, api, getEnvelope }: ClassCodeCardProps) {
  if (archived || !hasClassCode(api)) return null;
  return <CodeCard classId={classId} api={api} getEnvelope={getEnvelope} />;
}

function CodeCard({ classId, api, getEnvelope }: { classId: string; api: ClassCodeApi; getEnvelope: () => Envelope }) {
  const s = useClassCode(api, classId, getEnvelope);
  // Which code the last Copy was for, so a renewed code does not say "Copied".
  const [copied, setCopied] = useState<{ of: string; ok: boolean } | null>(null);
  const inputId = `cc-${classId}`;

  const copy = async () => {
    if (!s.code) return;
    try {
      await navigator.clipboard.writeText(s.code);
      setCopied({ of: s.code, ok: true });
    } catch {
      // No clipboard (an older browser, or permission refused): select it for Ctrl+C.
      const box = document.getElementById(inputId);
      if (box instanceof HTMLInputElement) box.select();
      setCopied({ of: s.code, ok: false });
    }
  };

  return (
    <section className={cardClass} aria-label="Class code">
      <h2 className={cardTitleClass}>Class code</h2>
      {s.status === 'loading' && <p className={hintClass}>Loading…</p>}
      {s.status === 'failed' && (
        <p className="error-text m-0 text-sm" role="alert">
          The code could not load. Reload the page to try again.
        </p>
      )}
      {s.status === 'ready' && !s.code && (
        <>
          <p className={hintClass}>Pupils join this class with a code. Make one when they are ready to sign in.</p>
          <Button className="w-fit" size="sm" disabled={s.busy} onClick={() => void s.make()}>
            Make a code
          </Button>
        </>
      )}
      {s.status === 'ready' && s.code && (
        <>
          <input
            id={inputId}
            aria-label="Class code"
            readOnly
            value={s.code}
            className="w-full rounded-sm border border-border-strong bg-card px-2.5 py-2 font-mono text-lg tracking-wider"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className={hintClass}>Pupils go to {pupilAddress(window.location.origin)} and enter this code.</p>
          {s.confirming ? (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={s.confirming === 'renew' ? 'Renew the code' : 'Close the code'}>
              <span>{CONFIRM[s.confirming]}</span>
              <Button size="sm" disabled={s.busy} onClick={() => void s.confirm()}>
                {s.confirming === 'renew' ? 'Renew' : 'Close'}
              </Button>
              <Button variant="ghost" size="sm" disabled={s.busy} onClick={s.cancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copy()}>
                Copy
              </Button>
              <Button variant="ghost" size="sm" disabled={s.busy} onClick={() => s.ask('renew')}>
                Renew
              </Button>
              <Button variant="ghost" size="sm" disabled={s.busy} onClick={() => s.ask('close')}>
                Close
              </Button>
            </div>
          )}
          {copied?.of === s.code && (
            <p className={hintClass} role="status">
              {copied.ok ? 'Copied.' : 'Select the code and copy it with Ctrl+C.'}
            </p>
          )}
        </>
      )}
      {s.problem && (
        <p className="error-text m-0 text-sm" role="alert">
          {s.problem}
        </p>
      )}
    </section>
  );
}
