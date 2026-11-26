import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setFetch } from '../api/http';
import { DOC_ID, THREAD_ID, TEST_THRESHOLDS, installEditorPolyfills, installIntersectionObserver, makeSession, testDoc, testThread } from '../test-utils';
import { ParticipantApp } from './ParticipantApp';

beforeAll(() => {
  installIntersectionObserver();
  installEditorPolyfills();
});
afterEach(() => {
  cleanup();
  setFetch(null);
});

/** Opens the workspace; `on` is the session's setting, `ack` what the server answers each batch. Returns the event kinds sent. */
function open(on: boolean, ack: () => boolean) {
  const sent: string[] = [];
  setFetch((async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    let body: unknown;
    if (u === '/api/participant') body = { session_id: 'S1' };
    else if (u === '/api/sessions/S1') body = makeSession({ config: { thresholds: TEST_THRESHOLDS, interactions: on } });
    else if (u.endsWith('/canvas')) body = { blocks: [], docs: [testDoc({ id: DOC_ID, name: 'Similes' })] };
    else if (u.endsWith('/threads')) body = { threads: [testThread({ id: THREAD_ID })] };
    else if (u.endsWith('/chat')) body = { turns: [] };
    else if (u.endsWith('/events')) {
      const events = (JSON.parse(String(init?.body)) as { events: { kind: string }[] }).events;
      sent.push(...events.map((e) => e.kind));
      body = { accepted: events.length, last_seq: sent.length, interactions: ack() };
    } else body = { accepted: 0, last_seq: 0 };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch);
  render(
    <MemoryRouter initialEntries={['/s/tok']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/s/:token" element={<ParticipantApp />} />
      </Routes>
    </MemoryRouter>,
  );
  return sent;
}

/** A real click: the press moves focus (an ordinary event, logged either way), then the click. */
const clickHeading = async () => {
  const h = await screen.findByRole('heading', { name: 'Similes' });
  fireEvent.pointerDown(h);
  fireEvent.click(h);
};

describe('interaction logging in the workspace', () => {
  it('logs clicks while the workspace has it on, and stops when the server says it is off', async () => {
    let serverOn = true;
    const sent = open(true, () => serverOn);
    await clickHeading();
    await waitFor(() => expect(sent).toContain('click'), { timeout: 3000 });
    serverOn = false;
    fireEvent.click(screen.getByRole('heading', { name: 'Similes' }));
    // The batch carrying that click is answered "off": later clicks are not logged.
    await waitFor(() => expect(sent.filter((k) => k === 'click')).toHaveLength(2), { timeout: 3000 });
    await clickHeading();
    await new Promise((r) => setTimeout(r, 1200));
    expect(sent.filter((k) => k === 'click')).toHaveLength(2);
  });

  it('logs nothing while it is off, and starts once the server says it is on', async () => {
    const sent = open(false, () => true);
    await clickHeading();
    await waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(sent).not.toContain('click');
    expect(sent).not.toContain('viewport');
    await waitFor(() => expect(sent).toContain('viewport'), { timeout: 3000 });
    fireEvent.click(screen.getByRole('heading', { name: 'Similes' }));
    await waitFor(() => expect(sent).toContain('click'), { timeout: 3000 });
  });
});
