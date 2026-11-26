/**
 * The "i" after a sentence the assistant grounded in the pedagogy library (HANDOFF.md): hover,
 * focus or tap it for the claim, the passage behind it and its source, how far it was checked,
 * and that the library is a draft no educator has reviewed. A claim that is the curator's own
 * inference says so, and its marker is drawn differently.
 */
import { useEffect, useRef, useState } from 'react';
import type { ClaimDetail, Verification } from '../../api/pedagogy';
import { cn } from '../../lib/utils';
import { useClaimLoader } from './claims';
import { licenceLabel } from './licence';

export const VERIFICATION_LABELS: Record<Verification, string> = {
  located: 'Source fetched and passage located',
  locator_to_confirm: 'Source fetched; where in it still to confirm',
  not_fetched: 'Source not fetched',
};

/** A source url safe to link: http: or https: only. The library is ours, but a `javascript:` url must never reach `href`. */
export function webUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** The claim's support in a few lines: what the hover shows, and the Pedagogy screen too. */
export function ClaimCard({ claim }: { claim: ClaimDetail }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-normal">
      <p className="m-0 font-medium text-foreground">{claim.text}</p>
      {claim.support_type === 'inference_by_curator' && <p className="m-0 text-xs text-warning">The curator’s inference: the source does not say this outright.</p>}
      {claim.passages.map((p) => (
        <div key={p.id} className="border-l-2 border-border-strong pl-2">
          <p className="m-0 text-foreground-2">{p.excerpt_type === 'quote' ? `“${p.text}”` : p.text}</p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {webUrl(p.source.url) ? (
              <a href={p.source.url} target="_blank" rel="noopener noreferrer" className="underline">
                {p.source.title}
              </a>
            ) : (
              <span>{p.source.title}</span>
            )}
            {` (${p.source.publisher}${p.source.year ? `, ${p.source.year}` : ''}), ${p.locator}. ${licenceLabel(p.source.licence)}`}
          </p>
        </div>
      ))}
      <p className="m-0 text-xs text-muted-foreground">
        {VERIFICATION_LABELS[claim.verification]}. From “{claim.entry.title}”, a draft: not yet reviewed by educators.
      </p>
    </div>
  );
}

export function ClaimInfo({ id }: { id: string }) {
  const load = useClaimLoader();
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState<ClaimDetail | null | undefined>(undefined);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !load || claim !== undefined) return;
    let cancelled = false;
    void load(id).then((c) => !cancelled && setClaim(c));
    return () => {
      cancelled = true;
    };
  }, [open, load, id, claim]);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ left: Math.max(8, Math.min(r.left - 140, window.innerWidth - 336)), top: r.bottom + 6 });
    setOpen(true);
  };
  const inference = claim?.support_type === 'inference_by_curator';

  return (
    <span className="relative inline-block align-super" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        ref={ref}
        type="button"
        data-claim={id}
        aria-label={`Source for this: ${id}`}
        aria-expanded={open}
        className={cn(
          'mx-0.5 inline-flex size-3.5 items-center justify-center rounded-full border p-0 text-2xs leading-none font-semibold italic',
          inference ? 'border-dashed border-warning text-warning' : 'border-primary bg-primary-soft text-primary',
        )}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={() => (open ? setOpen(false) : show())}
      >
        i
      </button>
      {open && at && (
        <span role="tooltip" className="fixed z-50 block w-80 rounded-md border border-border bg-card p-3 text-left not-italic shadow-card" style={{ left: at.left, top: at.top }}>
          {!load ? (
            <span className="text-sm text-muted-foreground">Claim {id} from the pedagogy library.</span>
          ) : claim === undefined ? (
            <span className="text-sm text-muted-foreground">Loading…</span>
          ) : claim === null ? (
            <span className="text-sm text-muted-foreground">This claim could not be loaded.</span>
          ) : (
            <ClaimCard claim={claim} />
          )}
        </span>
      )}
    </span>
  );
}
