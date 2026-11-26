/** One call to a library collection for a route: its refusals as the same HTTP errors, a failure to reach it as 502. */
import { HttpError } from '../http-error.js';
import { LibraryError, type LibraryOp } from '../plugins/library-client.js';
import type { CollectionSource } from './source.js';

export async function callLibrary(source: CollectionSource, op: LibraryOp, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await source.client.call(source.collection, op, body);
  } catch (err) {
    if (err instanceof LibraryError && (err.status === 400 || err.status === 404)) throw new HttpError(err.status, err.message, 'library_refused');
    throw new HttpError(502, `${source.name} could not be reached just now`, 'library_unreachable');
  }
}
