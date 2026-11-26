/**
 * Pictures the assistant chose from ARASAAC (tools/search-pictures.ts). It writes an image block's
 * content as `![what it shows](arasaac:<id>)`. Before the turn is applied, each picture is fetched
 * (`fetchPictures`, outside the write transaction) and then saved as a PNG asset like a teacher's
 * upload, and the content becomes the usual `![alt](asset:<id>)` (`storePictures`). Only pictures a
 * search this turn found are taken; any other, or one that cannot be fetched, is dropped as
 * `invalid_image`. Each picture used carries the rest of its search, which the teacher is offered.
 */
import type { DroppedOp, Operation, PictureOffer } from '@edw/shared';
import type { PictureLibrary } from '../pictures/arasaac.js';
import type { PictureSearch } from './tools/types.js';

const PICTURE = /^\s*!\[([^\]\n]*)\]\(arasaac:(\d{1,9})\)\s*$/;

/** The ARASAAC picture an image block's content names, if it names one. */
export function arasaacPicture(content: string): { id: number; alt: string } | null {
  const m = PICTURE.exec(content);
  return m ? { id: Number(m[2]), alt: m[1]!.trim() } : null;
}

/** An op that puts a picture into an image block (an insert of one, or a replace on one). */
function pictureOf(op: Operation, imageBlockIds: ReadonlySet<string>) {
  const onImage = (op.op === 'insert' && op.type === 'image') || (op.op === 'replace' && imageBlockIds.has(op.id));
  return onImage && (op.op === 'insert' || op.op === 'replace') ? arasaacPicture(op.content) : null;
}

/** The search that found a picture (the first, when several did). */
const searchFor = (id: number, searches: readonly PictureSearch[]) => searches.find((s) => s.options.some((o) => o.id === id));

/** Fetches the pictures the operations use that this turn's searches found; those it could not fetch are missing. */
export async function fetchPictures(
  operations: readonly unknown[],
  imageBlockIds: ReadonlySet<string>,
  searches: readonly PictureSearch[],
  library: PictureLibrary | null | undefined,
): Promise<Map<number, Buffer>> {
  const ids = new Set<number>();
  for (const op of operations as Operation[]) {
    const pic = op && typeof op === 'object' && 'op' in op && typeof (op as { content?: unknown }).content === 'string' ? pictureOf(op, imageBlockIds) : null;
    if (pic && searchFor(pic.id, searches)) ids.add(pic.id);
  }
  const fetched = new Map<number, Buffer>();
  if (!library) return fetched;
  await Promise.all(
    [...ids].map(async (id) => {
      const data = await library.image(id);
      if (data) fetched.set(id, data);
    }),
  );
  return fetched;
}

/** Saves a picture and returns its asset id. */
export type SavePicture = (data: Buffer, alt: string) => Promise<string>;

/** A picture put in, by its new asset id, with the choices to offer for it (filled in with the block id once applied). */
export type PendingOffer = Omit<PictureOffer, 'block_id'> & { asset_id: string };

export async function storePictures(
  operations: Operation[],
  imageBlockIds: ReadonlySet<string>,
  searches: readonly PictureSearch[],
  fetched: ReadonlyMap<number, Buffer>,
  save: SavePicture,
): Promise<{ operations: Operation[]; dropped: DroppedOp[]; offers: PendingOffer[] }> {
  const out: Operation[] = [];
  const dropped: DroppedOp[] = [];
  const offers: PendingOffer[] = [];
  for (const [index, op] of operations.entries()) {
    const pic = pictureOf(op, imageBlockIds);
    if (!pic || (op.op !== 'insert' && op.op !== 'replace')) {
      out.push(op);
      continue;
    }
    const search = searchFor(pic.id, searches);
    const data = search ? fetched.get(pic.id) : undefined;
    if (!search || !data) {
      dropped.push({ index, op, reason: 'invalid_image' });
      continue;
    }
    const alt = (pic.alt || search.options.find((o) => o.id === pic.id)!.label).replace(/[[\]\n]/g, '');
    const asset_id = await save(data, alt);
    out.push({ ...op, content: `![${alt}](asset:${asset_id})` });
    offers.push({ asset_id, alt, chosen: pic.id, options: search.options });
  }
  return { operations: out, dropped, offers };
}
