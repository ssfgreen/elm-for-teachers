/**
 * `click`: every click and right click, with what it landed on. Listened for in the capture
 * phase, so a component that stops the click still has it logged. A click from the keyboard
 * (Enter or Space on a button) has `count` 0.
 */
import type { EventLogger } from '../logger';
import { controlAt, pointTarget } from './target';

export function attachClickTracking(logger: Pick<EventLogger, 'log'>, doc: Document): () => void {
  const onClick = (e: MouseEvent) =>
    logger.log('click', {
      ...pointTarget(e.target),
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      button: Math.min(Math.max(e.button, 0), 5),
      count: e.type === 'contextmenu' ? 1 : e.detail,
      control: controlAt(e.target),
    });
  doc.addEventListener('click', onClick, { capture: true });
  doc.addEventListener('contextmenu', onClick, { capture: true });
  return () => {
    doc.removeEventListener('click', onClick, { capture: true });
    doc.removeEventListener('contextmenu', onClick, { capture: true });
  };
}
