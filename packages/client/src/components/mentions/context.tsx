/**
 * What the chat's mentions draw on: the class the chat is for (its pupils, their adaptations and
 * its curriculum), a way to look up an outcome in the app's curriculum, and where a code leads.
 * Without a provider (the make kit, replay, most tests) replies render as they always did.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CurriculumItem, CurriculumOption, Pupil, PupilAdaptation } from '@edw/shared';

export interface MentionSource {
  /** The class the chat is for, if any. */
  className: string | null;
  pupils: readonly Pupil[];
  adaptations: readonly PupilAdaptation[];
  curriculum: readonly CurriculumItem[];
  /** The outcome for a code from the app's own curriculum; null when it has none. */
  outcome?: (code: string) => Promise<CurriculumOption | null>;
  /** Opens the app's curriculum on a code: the pedagogy aligned to it. */
  openCurriculum?: (code: string) => void;
}

export interface Mentions extends MentionSource {
  labels: string[];
  pupilOf: (label: string) => Pupil | undefined;
}

const MentionsContext = createContext<Mentions | null>(null);

export function MentionsProvider({ source, children }: { source: MentionSource; children: ReactNode }) {
  const value = useMemo<Mentions>(() => {
    const byLower = new Map(source.pupils.map((p) => [p.label.toLowerCase(), p]));
    return { ...source, labels: source.pupils.map((p) => p.label), pupilOf: (l) => byLower.get(l.toLowerCase()) };
  }, [source]);
  return <MentionsContext.Provider value={value}>{children}</MentionsContext.Provider>;
}

export const useMentions = () => useContext(MentionsContext);

/** Each outcome looked up once per page; a failure is remembered as none. Shared by every code on the screen. */
export function outcomeLoader(search: (q: { query: string }) => Promise<{ options: CurriculumOption[] }>): (code: string) => Promise<CurriculumOption | null> {
  const cache = new Map<string, Promise<CurriculumOption | null>>();
  return (code) => {
    let p = cache.get(code);
    if (!p) {
      p = search({ query: code })
        .then((r) => r.options.find((o) => o.code.split('/').some((c) => c.trim() === code)) ?? null)
        .catch(() => null);
      cache.set(code, p);
    }
    return p;
  };
}
