import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Highlight, PupilPrompt } from '@edw/shared';
import { setFetch } from '../api/http';
import { ReaderScreen } from './ReaderScreen';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const EXPLAIN: PupilPrompt = { id: 'p1', label: 'Explain', after_highlight: true, follow_up: false };
const MORE: PupilPrompt = { id: 'p2', label: "I don't understand", after_highlight: false, follow_up: true };
const HIDDEN: PupilPrompt = { id: 'p3', label: 'Only later', after_highlight: false, follow_up: false };

const READING = {
  id: 'r1',
  name: 'Rain',
  class_name: '8B',
  blocks: [
    { id: 'p', type: 'paragraph', content: 'Rain falls from clouds.' },
    { id: 'c', type: 'code_block', content: '```\nlet sky = grey;\n```' },
    { id: 'long', type: 'paragraph', content: `Long ${'word '.repeat(220)}end` },
  ],
  prompts: [EXPLAIN, MORE, HIDDEN],
  follow_ups_max: 1,
};

const REPLY = 'Rain is <b>water</b> from [clouds](https://example.com).\nWhat do you think?';

interface Opts {
  prompts?: PupilPrompt[];
  highlights?: Highlight[];
  /** Follow-ups left after each ask, in turn. */
  left?: number[];
  refuse?: string;
  hold?: boolean;
}

function server(opts: Opts = {}) {
  const calls: string[] = [];
  const waiting: (() => void)[] = [];
  let asks = 0;
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url === '/api/pupil/readings/r1') return json({ reading: { ...READING, prompts: opts.prompts ?? READING.prompts } });
    if (url === '/api/pupil/readings/r1/highlights') return json({ highlights: opts.highlights ?? [] });
    if (url === '/api/pupil/readings/r1/asks' && method === 'POST') {
      const i = ++asks;
      const answer = () => (opts.refuse ? json({ error: 'no', code: opts.refuse }, 429) : json({ ask: { id: `a${i}`, reply: i === 1 ? REPLY : `More help ${i}`, follow_ups_left: opts.left?.[i - 1] ?? 1 } }));
      if (!opts.hold) return answer();
      return new Promise<Response>((resolve) => waiting.push(() => resolve(answer())));
    }
    return json({ error: 'unexpected' }, 500);
  });
  setFetch(f as unknown as typeof fetch);
  return { calls, release: () => waiting.splice(0).forEach((w) => w()) };
}

let path = '';
function Where() {
  path = useLocation().pathname + useLocation().search + useLocation().hash;
  return null;
}

const show = async () => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/r/readings/r1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Where />
        <Routes>
          <Route path="/r/readings/:readingId" element={<ReaderScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  });
};

/** Selects `length` characters of the text node holding `text`, from `offset`, as the pupil would. */
async function select(text: string, offset: number, length: number) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node && !node.textContent?.includes(text)) node = walker.nextNode();
  const range = document.createRange();
  range.setStart(node!, offset);
  range.setEnd(node!, offset + length);
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

const askGroup = () => screen.getByRole('group', { name: 'Ask about this' });
const answer = () => screen.getByRole('region', { name: 'Answer' });
const click = (el: HTMLElement) =>
  act(async () => {
    fireEvent.click(el);
  });

afterEach(() => {
  cleanup();
  setFetch(null);
  localStorage.clear();
  sessionStorage.clear();
});

describe('asking about a passage', () => {
  it('offers the prompts ticked "after a highlight" beside the categories, on a selection', async () => {
    server();
    await show();
    await select('Rain ', 0, 4);
    const group = askGroup();
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Explain']);
    expect(screen.getByRole('button', { name: "Don't understand" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeTruthy();
  });

  it('offers them beside Remove on a picked highlight, and asks about its words', async () => {
    const { calls } = server({ highlights: [{ id: 'hl1', block_id: 'p', start: 5, end: 10, category: 'dont_understand', created_at: 'x' }] });
    await show();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: "Don't understand: falls" }), { key: 'Enter' });
    });
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    expect(calls).toContain('POST /api/pupil/readings/r1/asks');
    expect(within(answer()).getByText('falls')).toBeTruthy();
  });

  it('shows no group on a reading with no such prompt', async () => {
    server({ prompts: [MORE] });
    await show();
    await select('Rain ', 0, 4);
    expect(screen.queryByRole('group', { name: 'Ask about this' })).toBeNull();
  });

  it('says why where asks are not offered: on space alone, or over 1,000 characters; a code block is offered (#247)', async () => {
    server();
    await show();
    await select('let sky', 0, 3);
    expect(askGroup()).toBeTruthy();
    await select('let sky', 3, 1);
    expect(screen.queryByRole('group', { name: 'Ask about this' })).toBeNull();
    expect(screen.getByText('This part cannot be asked about.')).toBeTruthy();
    await select('Long word', 0, 1010);
    expect(screen.getByText('Select less to ask about it.')).toBeTruthy();
  });

  it('shows "Thinking…" with every ask button off while a request is out, then the passage and reply', async () => {
    const { release } = server({ hold: true });
    await show();
    await select('Rain ', 0, 4);
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    expect(screen.getByRole('status').textContent).toBe('Thinking…');
    expect((within(askGroup()).getByRole('button', { name: 'Explain' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release());
    expect(screen.queryByRole('status')).toBeNull();
    expect(within(answer()).getByText('Rain')).toBeTruthy();
  });

  it('draws the reply as plain text: no HTML, no markdown, no links, line breaks kept', async () => {
    server();
    await show();
    await select('Rain ', 0, 4);
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    const region = answer();
    expect(region.textContent).toContain('Rain is <b>water</b> from [clouds](https://example.com).');
    expect(region.querySelector('b, a, strong')).toBeNull();
    expect(within(region).getByText(/What do you think\?/).className).toContain('whitespace-pre-line');
  });

  it('offers follow-ups under the newest reply only, then says none are left', async () => {
    server({ left: [1, 0] });
    await show();
    await select('Rain ', 0, 4);
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    const follow = () => screen.queryByRole('group', { name: 'Follow up' });
    expect(within(follow()!).getAllByRole('button').map((b) => b.textContent)).toEqual(["I don't understand"]);
    await click(within(follow()!).getByRole('button', { name: "I don't understand" }));
    expect(within(answer()).getByText('More help 2')).toBeTruthy();
    expect(follow()).toBeNull();
    expect(within(answer()).getByText('No more follow-ups on this answer.')).toBeTruthy();
  });

  it('hides the answer with Close or Escape', async () => {
    server();
    await show();
    await select('Rain ', 0, 4);
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    await click(within(answer()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Answer' })).toBeNull();

    await select('Rain ', 0, 4);
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    await act(async () => {
      fireEvent.keyDown(answer(), { key: 'Escape' });
    });
    expect(screen.queryByRole('region', { name: 'Answer' })).toBeNull();
  });

  it('says why an ask was refused, in the words for its code', async () => {
    server({ refuse: 'pupil_budget_spent' });
    await show();
    await select('Rain ', 0, 4);
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    expect(screen.getByRole('alert').textContent).toBe('You have used all the help you can ask for in this class. Please ask your teacher.');
    expect(screen.queryByRole('region', { name: 'Answer' })).toBeNull();
  });
});

describe('research data guard', () => {
  it('an ask calls only the pupil asks route, keeps nothing in storage or the URL, and puts no words in attributes', async () => {
    const { calls } = server();
    await show();
    const before = calls.length;
    await select('Rain ', 0, 4);
    await click(within(askGroup()).getByRole('button', { name: 'Explain' }));
    expect(calls.slice(before)).toEqual(['POST /api/pupil/readings/r1/asks']);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(path).toBe('/r/readings/r1');

    const words = ['Rain', 'water', 'What do you think'];
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.attributes) {
        if (a.name === 'id' || a.name === 'title' || a.name === 'aria-label' || a.name.startsWith('data-')) {
          for (const w of words) expect(a.value, `${el.tagName} ${a.name}`).not.toContain(w);
        }
      }
    }
  });
});
