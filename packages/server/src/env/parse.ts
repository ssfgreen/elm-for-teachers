/** How the settings groups read a variable: an empty one counts as unset. */
import { z } from 'zod';

export const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
export const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess(emptyToUndefined, s.optional());

/** A comma-separated list, trimmed and lower-cased, with empty entries dropped. */
export const list = (v: string | undefined): string[] => (v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

/** The parsed values of one group's variables. */
export type Vars<S extends z.ZodRawShape> = z.infer<z.ZodObject<S>>;

/** A copy of `o` without `keys`. */
export function omit<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Omit<T, K> {
  const out = { ...o };
  for (const k of keys) delete out[k];
  return out;
}
