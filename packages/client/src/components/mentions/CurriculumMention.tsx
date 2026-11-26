/**
 * A curriculum code named in a reply (LIT 2-13a): hover for the outcome from the app's own
 * curriculum, and whether the class is working on it; a click opens it in the Curriculum screen,
 * as the sidebar's Curriculum does. The reply never sends the teacher to a PDF elsewhere for it.
 */
import { useEffect, useState } from 'react';
import type { CurriculumOption } from '@edw/shared';
import { STATUS_LABELS } from '../../screens/classes/curriculumView';
import { HoverCard } from './HoverCard';
import { useMentions, type Mentions } from './context';

function OutcomeCard({ code, m }: { code: string; m: Mentions }) {
  const [outcome, setOutcome] = useState<CurriculumOption | null | undefined>(m.outcome ? undefined : null);
  useEffect(() => {
    if (!m.outcome) return;
    let cancelled = false;
    void m.outcome(code).then((o) => !cancelled && setOutcome(o));
    return () => {
      cancelled = true;
    };
  }, [m, code]);
  const item = m.curriculum.find((i) => i.code.split('/').some((c) => c.trim() === code));
  const text = outcome?.text ?? item?.text;
  return (
    <span className="flex flex-col gap-1.5">
      <span className="font-semibold text-foreground">
        {code}
        {outcome?.area && <span className="font-normal text-muted-foreground"> · {outcome.area}</span>}
      </span>
      {outcome === undefined && <span className="text-muted-foreground">Loading…</span>}
      {text && <span className="text-foreground">{text}</span>}
      {outcome === null && !text && m.outcome && <span className="text-muted-foreground">Not in the app’s curriculum yet.</span>}
      {item && m.className && (
        <span className="text-xs text-muted-foreground">
          {STATUS_LABELS[item.status]} for {m.className}
        </span>
      )}
      {m.openCurriculum && (
        <button type="button" className="self-start border-0 bg-transparent p-0 text-xs text-primary underline" onClick={() => m.openCurriculum?.(code)}>
          Open in the curriculum
        </button>
      )}
    </span>
  );
}

export function CurriculumMention({ code, text }: { code: string; text?: string }) {
  const m = useMentions();
  if (!m) return <>{text ?? code}</>;
  return <HoverCard kind="curriculum" label={text ?? code} ariaLabel={`${code} in the curriculum`} onActivate={m.openCurriculum ? () => m.openCurriculum?.(code) : undefined} card={() => <OutcomeCard code={code} m={m} />} />;
}
