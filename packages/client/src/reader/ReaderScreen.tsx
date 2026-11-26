/**
 * `/r/readings/:readingId`: one reading for a signed-in pupil (#213), read-only. Selecting text
 * offers the highlight categories at the foot of the page; a highlight is picked by a click or
 * Enter and can be removed. Either can be asked about with the reading's prompts (#236): the
 * answer and its follow-ups show above the bar (`useAsk`, `AnswerPanel`). The page talks only to
 * /api/pupil/: no event logger or interaction tracker runs here, and nothing is sent to a workspace.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Highlight, HighlightCategory } from '@edw/shared';
import { ThemeSwitch } from '../components/ui/theme-switch';
import { linkClass } from '../screens/landing/styles';
import { AnswerPanel } from './AnswerPanel';
import { AskButtons } from './AskButtons';
import { askable, passageOf, promptsFor } from './asks';
import { HighlightBar } from './HighlightBar';
import { REFUSED } from './messages';
import { ReadingBlocks } from './ReadingBlocks';
import { useAsk } from './useAsk';
import { useReading } from './useReading';
import { useSelection } from './useSelection';

const FAILED: Record<string, string> = {
  highlights_full: 'You have made as many highlights as you can on this reading. Remove one to add another.',
};

export function ReaderScreen() {
  const { readingId = '' } = useParams();
  const { load, highlights, failed, add, remove } = useReading(readingId);
  const article = useRef<HTMLElement>(null);
  const [picked, setPicked] = useState<Highlight | null>(null);
  const unpick = useCallback(() => setPicked(null), []);
  const [selected, setSelected] = useSelection(article, unpick);
  const asks = useAsk(readingId);

  // The passage asks would be about: the picked highlight's, else the selection's.
  const reading = load.status === 'ready' ? load.reading : null;
  const range = picked ?? selected;
  const block = range && reading?.blocks.find((b) => b.id === range.block_id);
  const passage = block ? passageOf(block, range.start, range.end) : '';
  const prompts = useMemo(() => ({ ask: promptsFor(reading?.prompts ?? [], 'after_highlight'), follow: promptsFor(reading?.prompts ?? [], 'follow_up') }), [reading]);

  // One save or removal at a time: a second click before the server answers does nothing.
  const busy = useRef(false);
  const highlight = useCallback(
    async (category: HighlightCategory | null) => {
      if (!selected || busy.current) return;
      busy.current = true;
      try {
        if (await add({ ...selected, category })) {
          document.getSelection()?.removeAllRanges();
          setSelected(null);
        }
      } finally {
        busy.current = false;
      }
    },
    [add, selected, setSelected],
  );

  const unhighlight = useCallback(
    async (h: Highlight) => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (await remove(h.id)) setPicked(null);
      } finally {
        busy.current = false;
      }
    },
    [remove],
  );

  return (
    <>
      <ThemeSwitch className="fixed top-4 right-4" />
      <main className={`mx-auto max-w-2xl px-4 pt-10 text-foreground-2 ${asks.chain || asks.asking ? 'pb-120' : 'pb-40'}`}>
        <Link className={linkClass} to="/r">
          Your readings
        </Link>
        {load.status === 'loading' && <p className="mt-6">Loading…</p>}
        {load.status === 'refused' && (
          <p role="alert" className="mt-6">
            {load.code ? (REFUSED[load.code] ?? 'This reading could not be opened.') : 'Please sign in again to read this.'}
          </p>
        )}
        {load.status === 'ready' && (
          <>
            <p className="mt-6 text-sm">{load.reading.class_name}</p>
            <h1 className="mb-4 text-3xl font-semibold text-foreground">{load.reading.name}</h1>
            <p className="mb-6 text-sm">Select some text to highlight it. Select a highlight to remove it.</p>
            <article ref={article} data-reading className="text-lg leading-relaxed">
              <ReadingBlocks readingId={readingId} blocks={load.reading.blocks} highlights={highlights} onPick={setPicked} />
            </article>
          </>
        )}
        {failed && (
          <p role="alert" className="mt-4 text-destructive">
            {FAILED[failed] ?? 'That did not save. Please try again.'}
          </p>
        )}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="px-4">
          <AnswerPanel chain={asks.chain} asking={asks.asking} refused={asks.refused} followUps={prompts.follow} onFollowUp={asks.followUp} onClose={asks.close} />
        </div>
        <HighlightBar
          selecting={selected !== null}
          picked={picked}
          onHighlight={(c) => void highlight(c)}
          onRemove={(h) => void unhighlight(h)}
          onCancel={() => setPicked(null)}
          asks={block && <AskButtons prompts={prompts.ask} askable={askable(block, passage)} asking={asks.asking} onAsk={(p) => asks.ask(p, passage)} />}
        />
      </div>
    </>
  );
}
