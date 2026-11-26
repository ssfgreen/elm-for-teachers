import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setFetch } from '../api/http';
import { DOC_ID, THREAD_ID, installEditorPolyfills, installIntersectionObserver, makeSession, testDoc, testThread } from '../test-utils';
import { ParticipantApp } from './ParticipantApp';

beforeAll(() => {
  installIntersectionObserver();
  installEditorPolyfills();
});
afterEach(() => {
  cleanup();
  setFetch(null);
});

function renderWith(participant: (url: string) => Response | null, token = 'tok') {
  setFetch((async (url: RequestInfo | URL) => {
    const u = String(url);
    const special = participant(u);
    if (special) return special;
    const body =
      u === '/api/sessions/S1'
        ? makeSession()
        : u.endsWith('/canvas')
          ? { blocks: [], docs: [testDoc({ id: DOC_ID, name: 'Similes' })] }
          : u.endsWith('/threads')
            ? { threads: [testThread({ id: THREAD_ID })] }
            : u.endsWith('/chat')
              ? { turns: [] }
              : { accepted: 0, last_seq: 0 };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch);
  render(
    <MemoryRouter initialEntries={[`/s/${token}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/s/:token" element={<ParticipantApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ParticipantApp', () => {
  it('opens the workspace on the latest chat and its doc', async () => {
    renderWith((u) => (u === '/api/participant' ? new Response(JSON.stringify({ session_id: 'S1' })) : null));
    expect(await screen.findByRole('heading', { name: 'Similes' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Chats' })).toBeTruthy();
    expect(screen.queryByText(/Mark task complete/)).toBeNull();
  });

  it('says so when the link does not work', async () => {
    renderWith((u) => (u === '/api/participant' ? new Response('{"error":"invalid participant token"}', { status: 401 }) : null), 'bad-tok');
    expect(await screen.findByText(/could not be opened/)).toBeTruthy();
  });
});
