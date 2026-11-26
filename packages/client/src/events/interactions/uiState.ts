/**
 * `ui_state`: a dialog, menu or list of options opening or closing. They render in portals
 * outside the workspace, so the whole page is watched. A scan runs at once on the first change,
 * then at most every `waitMs`, so a menu opened and closed quickly is still seen.
 */
import type { PayloadOfKind } from '@edw/shared';
import type { EventLogger } from '../logger';
import { createThrottle } from '../trackers';

type Role = PayloadOfKind<'ui_state'>['role'];
const ROLES: Role[] = ['dialog', 'alertdialog', 'menu', 'listbox'];
const SELECTOR = ROLES.map((r) => `[role="${r}"]`).join(', ');

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim().slice(0, 120) || null;

function labelOf(el: Element): string | null {
  const by = el.getAttribute('aria-labelledby');
  return (
    clean(el.getAttribute('aria-label')) ??
    clean(by ? by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ') : null) ??
    clean(el.querySelector('h1, h2, h3')?.textContent)
  );
}

export function attachUiStateTracking(logger: Pick<EventLogger, 'log'>, doc: Document, waitMs = 100): () => void {
  const open = new Map<Element, { role: Role; label: string | null }>();
  const scan = () => {
    const now = new Set(doc.querySelectorAll(SELECTOR));
    for (const [el, info] of open) {
      if (now.has(el) && el.isConnected) continue;
      open.delete(el);
      logger.log('ui_state', { ...info, open: false });
    }
    for (const el of now) {
      if (open.has(el)) continue;
      const info = { role: el.getAttribute('role') as Role, label: labelOf(el) };
      open.set(el, info);
      logger.log('ui_state', { ...info, open: true });
    }
  };
  const throttled = createThrottle<null>(waitMs, scan);
  const observer = new MutationObserver(() => throttled(null));
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role'] });
  scan();
  return () => {
    observer.disconnect();
    throttled.cancel();
  };
}
