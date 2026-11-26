import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Highlight } from '@edw/shared';
import { setFetch } from '../api/http';
import { ReaderScreen } from './ReaderScreen';

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const READING = {
  id: 'r1',
  name: 'Rain',
  class_name: '8B',
  blocks: [
    { id: 'h', type: 'heading', content: '# The water cycle' },
    { id: 'p', type: 'paragraph', content: 'Rain **falls** from clouds.' },
    { id: 'i', type: 'image', content: '![Clouds](asset:ast_1)' },
  ],
  prompts: [{ id: 'p1', label: 'Explain', after_highlight: true, follow_up: false }],
  follow_ups_max: 3,
};

function server(opts: { refuse?: string } = {}) {
  const calls: string[] = [];
  const saved: Highlight[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (opts.refuse) return json({ error: 'no', code: opts.refuse }, 403);
    if (url === '/api/pupil/readings/r1') return json({ reading: READING });
    if (url === '/api/pupil/readings/r1/highlights' && method === 'GET') return json({ highlights: saved });
    if (url === '/api/pupil/readings/r1/highlights' && method === 'POST') {
      const h = { id: `hl${saved.length + 1}`, created_at: '2026-11-23T09:00:00.000Z', ...(JSON.parse(String(init?.body)) as object) } as Highlight;
      saved.push(h);
      return json({ highlight: h }, 201);
    }
    if (url.startsWith('/api/pupil/readings/r1/highlights/') && method === 'DELETE') return json(null, 204);
    return json({ error: 'unexpected' }, 500);
  });
  setFetch(f as unknown as typeof fetch);
  return calls;
}

const show = async () => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/r/readings/r1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

afterEach(() => {
  cleanup();
  setFetch(null);
});

describe('ReaderScreen', () => {
  it('draws the reading without the editor: heading, marks and the picture through the pupil route', async () => {
    server();
    await show();
    expect(screen.getByRole('heading', { level: 1, name: 'Rain' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'The water cycle' })).toBeTruthy();
    expect(screen.getByText('falls').closest('strong')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Clouds' }).getAttribute('src')).toBe('/api/pupil/readings/r1/assets/ast_1');
    expect(document.querySelector('[contenteditable]')).toBeNull();
  });

  it('saves a selection as a highlight in its category’s colour, and removes it', async () => {
    const calls = server();
    await show();
    await select('Rain ', 0, 4);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Don't understand" }));
    });
    expect(calls).toContain('POST /api/pupil/readings/r1/highlights');
    const mark = screen.getByRole('button', { name: "Don't understand: Rain" });
    expect(mark.getAttribute('data-category')).toBe('dont_understand');
    expect(mark.className).toContain('bg-[#bae6fd]');

    await act(async () => {
      fireEvent.keyDown(mark, { key: 'Enter' });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });
    expect(calls).toContain('DELETE /api/pupil/readings/r1/highlights/hl1');
    expect(screen.queryByRole('button', { name: "Don't understand: Rain" })).toBeNull();
  });

  it('saves once when a category is clicked twice before the server answers', async () => {
    const calls = server();
    await show();
    await select('Rain ', 0, 4);
    await act(async () => {
      const button = screen.getByRole('button', { name: 'Possibly biased' });
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(calls.filter((c) => c === 'POST /api/pupil/readings/r1/highlights')).toHaveLength(1);
  });

  it('talks to the pupil routes only: no event logger, no workspace', async () => {
    const calls = server();
    await show();
    await select('Rain ', 0, 4);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    });
    expect(calls.length).toBeGreaterThan(2);
    for (const c of calls) expect(c).toMatch(/^(GET|POST|DELETE) \/api\/pupil\//);
  });

  it('says why a reading is not open', async () => {
    server({ refuse: 'not_member' });
    await show();
    expect(screen.getByRole('alert').textContent).toMatch(/not open to you/);
  });
});
