/**
 * Claims for the "i" markers, loaded once each and shared by every marker on the screen. A
 * screen without a provider (the make kit, most tests) shows markers that name the claim only.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ClaimDetail, PedagogyApi } from '../../api/pedagogy';

export type ClaimLoader = (id: string) => Promise<ClaimDetail | null>;

const ClaimsContext = createContext<ClaimLoader | null>(null);

/** Asks for the claims wanted in the same tick together; remembers each answer (and a failure, as null, until the page reloads). */
export function claimLoader(fetchClaims: PedagogyApi['pedagogyClaims']): ClaimLoader {
  const cache = new Map<string, Promise<ClaimDetail | null>>();
  let waiting: { id: string; resolve: (c: ClaimDetail | null) => void }[] = [];
  const flush = () => {
    const batch = waiting;
    waiting = [];
    fetchClaims(batch.map((w) => w.id))
      .then((r) => batch.forEach((w) => w.resolve(r.claims.find((c) => c.id === w.id) ?? null)))
      .catch(() => batch.forEach((w) => w.resolve(null)));
  };
  return (id) => {
    let p = cache.get(id);
    if (!p) {
      p = new Promise((resolve) => {
        if (waiting.length === 0) queueMicrotask(flush);
        waiting.push({ id, resolve });
      });
      cache.set(id, p);
    }
    return p;
  };
}

export function ClaimsProvider({ fetchClaims, children }: { fetchClaims?: PedagogyApi['pedagogyClaims']; children: ReactNode }) {
  const loader = useMemo(() => (fetchClaims ? claimLoader(fetchClaims) : null), [fetchClaims]);
  return <ClaimsContext.Provider value={loader}>{children}</ClaimsContext.Provider>;
}

export const useClaimLoader = () => useContext(ClaimsContext);
