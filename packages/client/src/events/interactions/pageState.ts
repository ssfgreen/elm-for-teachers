/** `page_state`: whether the tab is showing and the window has focus, on start and on each change. */
import type { EventLogger } from '../logger';

export function attachPageState(logger: Pick<EventLogger, 'log'>, win: Window): () => void {
  const doc = win.document;
  let last = '';
  const log = () => {
    const state = { visible: doc.visibilityState !== 'hidden', focused: doc.hasFocus() };
    const key = `${state.visible}${state.focused}`;
    if (key === last) return;
    last = key;
    logger.log('page_state', state);
  };
  // On blur, focus has not settled yet (it may be moving into an iframe of the page): look after it has.
  const soon = () => setTimeout(log, 0);
  log();
  doc.addEventListener('visibilitychange', log);
  win.addEventListener('focus', soon);
  win.addEventListener('blur', soon);
  return () => {
    doc.removeEventListener('visibilitychange', log);
    win.removeEventListener('focus', soon);
    win.removeEventListener('blur', soon);
  };
}
