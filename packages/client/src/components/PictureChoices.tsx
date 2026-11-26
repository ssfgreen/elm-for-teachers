/**
 * The pictures the assistant found in ARASAAC for an image block it suggested, in a row of up to
 * four just above the message box: the one in the document is marked, and a click on another puts
 * that one in instead (which accepts the block). A click on the marked one accepts the block with it. Shown while the block is still a suggestion, and
 * only when there is a choice. `picture-choices` is a hook for the tests.
 */
import { useState } from 'react';
import type { PictureOffer } from '@edw/shared';
import { cn } from '../lib/utils';

/** An offer with the turn it came from (the server checks the picture against it). */
export type TurnPictureOffer = PictureOffer & { turn_id: string };

/** A picture as a small PNG, straight from ARASAAC (the page sends no referrer). */
export const arasaacThumbUrl = (id: number) => `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;

/** The offers to show: one per block, the latest, while its block is still a suggestion and there is something to pick. */
export function openOffers(offers: readonly TurnPictureOffer[], isOpen: (blockId: string) => boolean): TurnPictureOffer[] {
  const latest = new Map<string, TurnPictureOffer>();
  for (const o of offers) latest.set(o.block_id, o);
  return [...latest.values()].filter((o) => o.options.length > 1 && isOpen(o.block_id));
}

export function PictureChoices({ offers, onChoose }: { offers: readonly TurnPictureOffer[]; onChoose: (offer: TurnPictureOffer, picture: number) => Promise<void> }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (offers.length === 0) return null;

  async function choose(offer: TurnPictureOffer, picture: number) {
    setBusy(picture);
    setFailed(null);
    try {
      await onChoose(offer, picture);
    } catch {
      setFailed(offer.block_id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn('picture-choices', 'mb-2 flex flex-col gap-2 rounded-lg border border-border bg-panel px-3 py-2.5')}>
      {offers.map((offer) => (
        <section key={offer.block_id} aria-label={`Pictures for “${offer.alt}”`}>
          <p className="m-0 mb-1.5 text-sm text-foreground-2">
            Pictures for “{offer.alt}”: pick one to use it instead.
          </p>
          <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
            {offer.options.slice(0, 4).map((o) => {
              const current = o.id === offer.chosen;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex aspect-square w-full cursor-pointer items-center justify-center rounded-md border-0 bg-white p-1.5 shadow-card inset-ring inset-ring-border-strong hover:inset-ring-2 hover:inset-ring-primary disabled:cursor-default',
                      current && 'inset-ring-2 inset-ring-primary',
                      busy !== null && !current && busy !== o.id && 'opacity-60',
                    )}
                    aria-pressed={current}
                    aria-label={current ? `${o.label} (in the document)` : `Use ${o.label}`}
                    title={current ? `${o.label}: in the document; click to keep it` : o.label}
                    disabled={busy !== null}
                    onClick={() => void choose(offer, o.id)}
                  >
                    <img src={arasaacThumbUrl(o.id)} alt="" referrerPolicy="no-referrer" loading="lazy" className={cn('max-h-full max-w-full object-contain', busy === o.id && 'motion-safe:animate-pulse')} />
                  </button>
                </li>
              );
            })}
          </ul>
          {failed === offer.block_id && (
            <p className="m-0 mt-1.5 text-sm text-destructive" role="alert">
              That picture could not be fetched. Try again, or pick another.
            </p>
          )}
        </section>
      ))}
      <p className="m-0 text-2xs text-muted-foreground">
        Pictures by Sergio Palao, <a href="https://arasaac.org" target="_blank" rel="noreferrer noopener" className="text-inherit underline">ARASAAC</a>, CC BY-NC-SA
      </p>
    </div>
  );
}
