/**
 * Before a Word download: the doc uses a font Word lacks (OpenDyslexic), so whoever opens the
 * file needs it installed; without it Word shows the text in another font. The teacher can
 * download anyway, cancel, or tick to not be told again in this browser.
 */
import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { DOC_FONT_LABELS } from '../editor/docStyle';
import { FONT_SOURCES } from '../export/fontNotice';
import type { FontQuestion } from '../screens/useFontNotice';
import { Button } from './ui/button';

const list = (names: string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export function FontNotice({ question }: { question: FontQuestion }) {
  const [hide, setHide] = useState(false);
  const names = list(question.fonts.map((f) => DOC_FONT_LABELS[f]));
  const one = question.fonts.length === 1;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && question.answer(false, false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-110 bg-overlay" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-110 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-5 shadow-float outline-none">
          <Dialog.Title className="m-0 text-lg font-semibold">This document uses {names}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 text-md text-foreground-2">
              <p className="m-0">
                {one ? 'It is' : 'They are'} not one of Word&apos;s own fonts. Anyone who opens the file needs {one ? 'it' : 'them'} installed on their
                computer. If they don&apos;t have {one ? 'it' : 'them'}, Word shows the text in one of its standard fonts instead, so lines and pages may
                break differently from what you see here.
              </p>
              {question.fonts.map((f) =>
                FONT_SOURCES[f] ? (
                  <p key={f} className="mt-2 mb-0">
                    {DOC_FONT_LABELS[f]} is free from{' '}
                    <a href={FONT_SOURCES[f]} target="_blank" rel="noreferrer">
                      {FONT_SOURCES[f]!.replace(/^https:\/\//, '')}
                    </a>
                    .
                  </p>
                ) : null,
              )}
            </div>
          </Dialog.Description>
          <label className="mt-4 flex items-center gap-2 text-md">
            <input className="m-0" type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
            Don&apos;t show this again
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button className="px-3 py-1.5 text-md" onClick={() => question.answer(false, false)}>
              Cancel
            </Button>
            <Button variant="primary" className="px-3 py-1.5 text-md" autoFocus onClick={() => question.answer(true, hide)}>
              Download
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
