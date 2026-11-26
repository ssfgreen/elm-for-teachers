/**
 * What a point on the screen is over, for the interaction events (shared/src/events/interactions.ts):
 * the pane, the block, the closest marked item (`data-track`) and the control, if any.
 */
import type { FocusPane, PointTarget } from '@edw/shared';
import { closestBlockId } from '../trackers';

const PANES: ReadonlySet<string> = new Set(['canvas', 'chat', 'threads']);

const elementOf = (target: EventTarget | Node | null): Element | null =>
  target instanceof Element ? target : target instanceof Node ? target.parentElement : null;

export function pointTarget(target: EventTarget | Node | null): PointTarget {
  const el = elementOf(target);
  const pane = el?.closest('[data-pane]')?.getAttribute('data-pane') ?? 'none';
  return {
    pane: (PANES.has(pane) ? pane : 'none') as FocusPane,
    block_id: closestBlockId(el),
    item: el?.closest('[data-track]')?.getAttribute('data-track')?.slice(0, 200) ?? null,
  };
}

const CONTROL = [
  'button', 'a[href]', 'input', 'select', 'textarea', 'summary', 'label',
  ...['button', 'link', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab', 'option', 'checkbox', 'radio', 'switch', 'combobox', 'slider'].map((r) => `[role="${r}"]`),
].join(', ');

const IMPLICIT: Record<string, string> = { BUTTON: 'button', A: 'link', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button', LABEL: 'label' };

function roleOf(c: Element): string {
  const role = c.getAttribute('role');
  if (role) return role;
  if (c instanceof HTMLInputElement) return ['checkbox', 'radio', 'range', 'file'].includes(c.type) ? c.type : c.type === 'button' || c.type === 'submit' ? 'button' : 'textbox';
  return IMPLICIT[c.tagName] ?? c.tagName.toLowerCase();
}

const clean = (s: string | null | undefined, max = 120): string | null => {
  const one = s?.replace(/\s+/g, ' ').trim();
  return one ? one.slice(0, max) : null;
};

/** The control's accessible name. A field's typed value is never read, only its label or placeholder. */
function labelOf(c: Element, role: string): string | null {
  const labelledBy = c.getAttribute('aria-labelledby');
  const byId = labelledBy ? labelledBy.split(/\s+/).map((id) => c.ownerDocument.getElementById(id)?.textContent ?? '').join(' ') : null;
  const named = clean(c.getAttribute('aria-label')) ?? clean(byId) ?? clean(c.getAttribute('title'));
  if (named) return named;
  if (role === 'textbox' || role === 'combobox') return clean(c.getAttribute('placeholder')) ?? clean((c as HTMLInputElement).labels?.[0]?.textContent);
  return clean(c.textContent);
}

/** The button, link, menu item or field at the target, or null (the document's own text is not one). */
export function controlAt(target: EventTarget | Node | null): { role: string; label: string | null } | null {
  const c = elementOf(target)?.closest(CONTROL);
  if (!c) return null;
  const role = roleOf(c).slice(0, 40);
  return { role, label: labelOf(c, role) };
}
