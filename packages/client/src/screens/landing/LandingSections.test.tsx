import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../../api/http';
import { FEATURES, FOR_SCHOOLS, HERO_FACTS, QUESTIONS, STEPS } from './content';
import { LandingScreen } from './LandingScreen';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let account: { is_admin: boolean } | null;

beforeEach(() => {
  account = null;
  setFetch(
    vi.fn(async (url: string) => {
      if (url === '/api/account/workspace') return account ? json({ session_id: 'S1', token: 't', account }) : json({ error: 'sign in' }, 401);
      return json({ error: 'unexpected' }, 500);
    }) as unknown as typeof fetch,
  );
});

afterEach(() => {
  cleanup();
  setFetch(null);
});

const renderLanding = async () => {
  await act(async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LandingScreen />
      </MemoryRouter>,
    );
  });
};

describe('the front page sections', () => {
  it('has one h1, then a titled section for each part, in order', async () => {
    await renderLanding();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const titles = ['A worksheet editor with an assistant beside it', 'A turn, from request to decision', "Pupils' data and the research study", 'Questions teachers ask', 'Start with the code from the research team'];
    const sections = titles.map((t) => screen.getByRole('region', { name: t }));
    sections.slice(1).forEach((section, i) => {
      expect(sections[i]!.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('lists every feature, step and school point as a titled item', async () => {
    await renderLanding();
    const what = screen.getByRole('region', { name: 'A worksheet editor with an assistant beside it' });
    expect(within(what).getAllByRole('listitem')).toHaveLength(FEATURES.length);
    for (const f of FEATURES) expect(within(what).getByRole('heading', { level: 3, name: f.title })).toBeTruthy();
    const how = screen.getByRole('region', { name: 'A turn, from request to decision' });
    expect(within(how).getAllByRole('listitem')).toHaveLength(STEPS.length);
    const schools = screen.getByRole('region', { name: "Pupils' data and the research study" });
    for (const f of FOR_SCHOOLS) expect(within(schools).getByRole('heading', { level: 3, name: f.title })).toBeTruthy();
    expect(within(schools).getByText(/goes through ELM, the University of Edinburgh's AI platform/)).toBeTruthy();
  });

  it('header links go to the sections on the page', async () => {
    await renderLanding();
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    const targets = within(nav)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(targets).toEqual(['#what', '#schools', '#questions']);
    for (const t of targets) expect(document.querySelector(t!)).toBeTruthy();
  });

  it('opens a question to show its answer', async () => {
    await renderLanding();
    const first = QUESTIONS[0]!;
    const summary = screen.getByText(first.q, { selector: 'summary' });
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getByText(first.a)).toBeTruthy();
    expect(document.querySelectorAll('details')).toHaveLength(QUESTIONS.length);
  });

  it('shows the editor as one labelled picture, with no caption under it', async () => {
    await renderLanding();
    const editor = screen.getByRole('img', { name: /^The editor: a teacher asks for clearer wording/ });
    expect(editor.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('puts the facts on the first screen: ELM, suggestions, Word', async () => {
    await renderLanding();
    for (const fact of HERO_FACTS) expect(screen.getByText(fact)).toBeTruthy();
  });
});

describe('the steps and the footer (#75, Sam)', () => {
  it('shows each step with its number', async () => {
    await renderLanding();
    const how = screen.getByRole('region', { name: 'A turn, from request to decision' });
    const items = within(how).getAllByRole('listitem');
    items.forEach((item, i) => expect(within(item).getByText(String(i + 1))).toBeTruthy());
  });

  it('has a plain footer: the name and year, no large name and no tagline', async () => {
    await renderLanding();
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toBe(`ELM for teachers, ${new Date().getFullYear()}`);
    expect(footer.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe('the closing call', () => {
  it('sends a visitor on to Sign up (#224)', async () => {
    await renderLanding();
    const closing = screen.getByRole('region', { name: 'Start with the code from the research team' });
    expect(within(closing).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Sign up', '/signup']]);
  });

  it('shows nothing while the account loads, so it does not flip from Sign up', async () => {
    setFetch(vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch);
    await renderLanding();
    expect(screen.queryByRole('heading', { level: 2, name: /Start with the code|Your workspace is where/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull();
  });

  it('sends a signed-in teacher to the workspace', async () => {
    account = { is_admin: false };
    await renderLanding();
    const closing = screen.getByRole('region', { name: 'Your workspace is where you left it' });
    expect(within(closing).getByRole('link', { name: 'Go to your workspace' }).getAttribute('href')).toBe('/w');
    expect(within(closing).queryByRole('link', { name: 'Sign up' })).toBeNull();
  });
});
