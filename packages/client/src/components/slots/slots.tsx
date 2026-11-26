/**
 * Extension points in the real editor: places where another screen (today only the make kit) can
 * draw into the editor. Each component that has a place renders `<MakeSlot zone="…" />` there;
 * with no provider it renders nothing, so the editor teachers use is unchanged. Production code
 * imports these, never `make/` itself; the kit provides the contexts.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { MakeZone } from '@edw/shared';
import { cn } from '../../lib/utils';

export type Zone = MakeZone;

export const MakeSlotContext = createContext<((zone: Zone) => ReactNode) | null>(null);

/** What the editor needs to know about a place: how many cards are in it, and whether it should be shown open now (a card being placed, or one in it highlighted). */
export interface ZoneState {
  count: number;
  wanted: boolean;
}
export const MakeZoneContext = createContext<((zone: Zone) => ZoneState) | null>(null);

/** True on the make kit's board. */
export const useInMakeKit = () => useContext(MakeSlotContext) !== null;
/** A place's state on the board; nothing outside it. */
export function useMakeZone(zone: Zone): ZoneState | null {
  return useContext(MakeZoneContext)?.(zone) ?? null;
}

const SLOT_CLASS: Partial<Record<Zone, string>> = {
  chat: 'block list-none',
  composer: 'block basis-full',
  bottom: 'block border-t border-border empty:hidden',
  docs: 'block',
  docitem: 'block',
  classes: 'block',
  personalise: 'block',
  skills: 'block',
  prompts: 'block',
  banner: 'block flex-none',
  doctabs: 'block flex-none',
  inline: 'block',
  docfooter: 'block flex-none',
  export: 'block',
};

/** `as="li"` inside a list (the chat's messages), so the markup stays valid. */
export function MakeSlot({ zone, as: Tag = 'div' }: { zone: Zone; as?: 'div' | 'li' }) {
  const render = useContext(MakeSlotContext);
  if (!render) return null;
  return (
    <Tag className={cn('contents', SLOT_CLASS[zone])} data-make-slot={zone}>
      {render(zone)}
    </Tag>
  );
}
