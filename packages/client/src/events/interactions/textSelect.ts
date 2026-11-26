/**
 * `text_select`: text selected outside the editor (a chat reply, a comment, a reference
 * preview), throttled; the editor logs its own `selection`. Empty selections are not logged,
 * nor the same text twice in a row.
 */
import type { EventLogger } from '../logger';
import { createThrottle } from '../trackers';
import { pointTarget } from './target';

export const TEXT_MAX = 500;

export function attachTextSelect(logger: Pick<EventLogger, 'log'>, doc: Document, throttleMs = 250): () => void {
  let last = '';
  const read = () => {
    const sel = doc.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString() : '';
    if (!text.trim()) {
      last = '';
      return;
    }
    const anchor = sel?.anchorNode ?? null;
    const el = anchor instanceof Element ? anchor : anchor?.parentElement;
    if (el?.closest('[contenteditable="true"], textarea, input')) return;
    if (text === last) return;
    last = text;
    logger.log('text_select', { ...pointTarget(anchor), length: text.length, text: text.slice(0, TEXT_MAX) });
  };
  const t = createThrottle<null>(throttleMs, read);
  const onChange = () => t(null);
  doc.addEventListener('selectionchange', onChange);
  return () => {
    doc.removeEventListener('selectionchange', onChange);
    t.cancel();
  };
}
