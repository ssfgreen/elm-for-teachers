/** The Plugins screen's search: which plugins match the words typed and the kind picked. */
import type { PluginInfo, PluginKind } from '@edw/shared';

export type KindFilter = 'all' | PluginKind;

/** Every word typed must appear in the name, publisher, description or tags (any case). A pedagogy library is a library here. */
export function filterPlugins(plugins: readonly PluginInfo[], query: string, kind: KindFilter): PluginInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return plugins.filter((p) => {
    if (kind !== 'all' && p.kind !== kind && !(kind === 'library' && p.kind === 'pedagogy')) return false;
    const text = [p.name, p.publisher, p.description, ...p.tags].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

export const TRUST_LABELS = { use: 'Use freely', ask: 'Ask first', off: 'Off' } as const;

/** What each trust level means, under the choice. */
export const TRUST_HINTS = {
  use: 'The assistant uses it whenever it helps.',
  ask: 'The assistant asks in the chat first; you allow it one chat at a time.',
  off: 'The assistant never uses it.',
} as const;
