/**
 * "Preview in Word": the doc's Word download, drawn as pages, so the teacher can see where the
 * pages fall before printing or sharing. It is the same file Download makes (A4, Word's margins
 * and fonts, accepted text only), drawn by docx-preview and laid out into pages by
 * ../export/paginate.ts. Line endings can differ slightly from Word's; the note says so.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Download, X } from 'lucide-react';
import { Button } from './ui/button';

export interface WordPreviewProps {
  /** The doc's name, for the title. */
  name: string;
  /** Makes the Word file (the same one Download saves). */
  load: () => Promise<Blob>;
  onDownload: () => void;
  onClose: () => void;
  /** Called once the pages are laid out, with how many there are. */
  onShown?: (pages: number) => void;
  /** Starts logging the scrolling body's scrolls; returns the stop. */
  trackScroll?: (body: HTMLElement) => () => void;
}

/** Room either side of the pages, in pixels, before they are shrunk to fit. */
const GUTTER = 32;

/** Shrinks the pages to the window when it is narrower than a page. */
function fitPages(into: HTMLElement | null, body: HTMLElement | null) {
  const wrapper = into?.querySelector<HTMLElement>('.docx-wrapper');
  const page = wrapper?.querySelector<HTMLElement>('section.docx');
  if (!wrapper || !page || !body) return;
  const scale = Math.min(1, (body.clientWidth - GUTTER) / page.offsetWidth);
  wrapper.style.zoom = scale < 1 ? String(scale) : '';
}

export function WordPreview({ name, load, onDownload, onClose, onShown, trackScroll }: WordPreviewProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Also a state, like `into`, so the scroll tracker starts once the body has mounted.
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const bodyMounted = useCallback((el: HTMLDivElement | null) => {
    bodyRef.current = el;
    setBody(el);
  }, []);
  // A state, not a ref: the dialog's content mounts a render after it opens, and the drawing waits for it.
  const [into, setInto] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; pages: number } | { status: 'failed' }>({ status: 'loading' });
  // Only the first load counts: React may run the effect twice in development.
  const shownRef = useRef(onShown);
  shownRef.current = onShown;

  useEffect(() => {
    let live = true;
    if (!into) return;
    (async () => {
      const [{ renderAsync }, { paginate }, blob] = await Promise.all([import('docx-preview'), import('../export/paginate'), load()]);
      if (!live) return;
      into.replaceChildren();
      await renderAsync(blob, into, into, {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        // Only breaks the teacher put in; the rest are worked out here.
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
        experimental: false,
      });
      // Measure with the fonts in place, or the lines wrap differently from what is shown.
      await document.fonts?.ready;
      if (!live) return;
      const wrapper = into.querySelector<HTMLElement>('.docx-wrapper');
      if (!wrapper) throw new Error('nothing drawn');
      const pages = paginate(wrapper);
      fitPages(into, bodyRef.current);
      setState({ status: 'ready', pages });
      shownRef.current?.(pages);
    })().catch(() => live && setState({ status: 'failed' }));
    return () => {
      live = false;
    };
  }, [into, load]);

  const trackRef = useRef(trackScroll);
  trackRef.current = trackScroll;
  useEffect(() => (body && trackRef.current ? trackRef.current(body) : undefined), [body]);

  useEffect(() => {
    const onResize = () => fitPages(into, bodyRef.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [into]);

  const pages = state.status === 'ready' ? state.pages : null;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-overlay" />
        <Dialog.Content
          className="fixed inset-4 z-100 mx-auto flex max-w-240 flex-col overflow-hidden rounded-lg bg-card shadow-float outline-none max-md:inset-0 max-md:rounded-none"
          aria-describedby={undefined}
        >
          <header className="flex flex-none items-center gap-3 border-b border-border py-2.5 pr-3 pl-5">
            <div className="flex min-w-0 flex-1 flex-col">
              <Dialog.Title className="m-0 truncate text-lg font-semibold">{name}</Dialog.Title>
              <span className="truncate text-sm text-muted-foreground">
                As a Word file{pages !== null ? ` · A4 · ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''} · Suggestions you have not accepted are left out
              </span>
            </div>
            <Button className="flex-none px-3 py-1.5 text-md" onClick={onDownload}>
              <Download size={14} aria-hidden="true" /> Download
            </Button>
            <Dialog.Close asChild>
              <Button variant="toolbar" size="icon" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </header>
          <div ref={bodyMounted} className="word-preview min-h-0 flex-1 overflow-auto bg-panel" aria-busy={state.status === 'loading'}>
            {state.status === 'loading' && <p className="m-0 p-6 text-center text-md text-muted-foreground">Laying out the pages…</p>}
            {state.status === 'failed' && <p className="error-text m-0 p-6 text-center">The preview did not work. You can still download the file.</p>}
            <div ref={setInto} aria-label="Pages" />
          </div>
          {state.status === 'ready' && (
            <p className="m-0 flex-none border-t border-border px-5 py-2 text-xs text-muted-foreground">
              Close to Word, but a line or two can fall differently, as Word wraps text in its own way. To start a new page yourself, add a page break (Ctrl+Enter, or ⌘+Enter on a Mac).
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
