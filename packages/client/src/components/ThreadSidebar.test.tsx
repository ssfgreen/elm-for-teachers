import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Thread } from '@edw/shared';
import { ThreadSidebar } from './ThreadSidebar';
import { AccountContext, type AccountContextValue } from './sidebar/accountContext';

const thread: Thread = { id: '01JTHREAD00000000000000000', session_id: 'S1', title: 'Similes for P7', project_id: null, created_at: '2026-10-29T12:00:00.000Z' };

function renderSidebar() {
  render(
    <ThreadSidebar
      threads={[thread]}
      activeId={thread.id}
      open
      onToggle={vi.fn()}
      onSelect={vi.fn()}
      onNew={vi.fn()}
      account={{ name: 'Guest' }}
      onDownloadData={vi.fn(async () => {})}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Account: Guest' }));
  return within(screen.getByRole('group', { name: 'Appearance' }));
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(cleanup);

describe('ThreadSidebar appearance choice', () => {
  it('offers System, Light and Dark in the account menu, with System chosen at first', () => {
    const group = renderSidebar();
    const items = group.getAllByRole('menuitemradio');
    expect(items.map((b) => b.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(items.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  });

  it('switches to dark and back to light, remembering the choice, and keeps the menu open', () => {
    const group = renderSidebar();
    fireEvent.click(group.getByRole('menuitemradio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('edw-theme')).toBe('dark');
    expect(group.getByRole('menuitemradio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menu', { name: 'Account' })).toBeTruthy();

    fireEvent.click(group.getByRole('menuitemradio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('edw-theme')).toBe('light');

    fireEvent.click(group.getByRole('menuitemradio', { name: 'System' }));
    expect(localStorage.getItem('edw-theme')).toBeNull();
  });

  it('moves between the choices with the arrow keys', () => {
    const group = renderSidebar();
    const [system, light, dark] = group.getAllByRole('menuitemradio');
    system!.focus();
    fireEvent.keyDown(system!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(light);
    fireEvent.keyDown(light!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(dark);
    fireEvent.keyDown(dark!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(system);
    fireEvent.keyDown(system!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(dark);
  });
});

describe('ThreadSidebar screens', () => {
  it('lists Preferences then Plugins at the top, marks the open one, and opens each', () => {
    const onPreferences = vi.fn();
    const onPlugins = vi.fn();
    render(
      <ThreadSidebar threads={[thread]} activeId={null} open onToggle={vi.fn()} onSelect={vi.fn()} onNew={vi.fn()} account={{ name: 'Guest' }} onDownloadData={vi.fn(async () => {})} onPreferences={onPreferences} preferencesOpen onPlugins={onPlugins} />,
    );
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('Preferences')).toBeLessThan(buttons.indexOf('Plugins'));
    expect(screen.getByRole('button', { name: 'Preferences' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Plugins' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    expect(onPreferences).toHaveBeenCalledTimes(1);
    expect(onPlugins).toHaveBeenCalledTimes(1);
  });
});

describe('ThreadSidebar headings', () => {
  const project = { id: '01JPROJECT0000000000000000', session_id: 'S1', name: 'P7 Literacy', instructions: null, description: null, created_at: '2026-10-29T12:00:00.000Z', archived_at: null, deleted_at: null } satisfies Project;

  it('folds and unfolds Projects and Chats from their headings, which are buttons', () => {
    render(
      <ThreadSidebar
        threads={[thread]}
        activeId={thread.id}
        open
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        account={{ name: 'Guest' }}
        onDownloadData={vi.fn(async () => {})}
        projects={[project]}
        onNewProject={vi.fn()}
      />,
    );
    const heading = (name: string) => screen.getByRole('button', { name });
    expect(heading('Projects').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'P7 Literacy' })).toBeTruthy();
    fireEvent.click(heading('Projects'));
    expect(heading('Projects').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'P7 Literacy' })).toBeNull();
    // The New project button stays beside the heading.
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy();

    expect(screen.getByText('Similes for P7')).toBeTruthy();
    fireEvent.click(heading('Chats'));
    expect(screen.queryByText('Similes for P7')).toBeNull();
    fireEvent.click(heading('Chats'));
    expect(screen.getByText('Similes for P7')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeTruthy();
  });
});

describe('ThreadSidebar Dashboard link (#79)', () => {
  const signedIn = (isAdmin: boolean): AccountContextValue => ({
    email: 'a@example.org',
    displayName: null,
    isAdmin,
    signOut: vi.fn(async () => {}),
    openDashboard: vi.fn(async () => {}),
    registerSave: () => () => undefined,
  });
  const sidebar = (account: AccountContextValue | null) => {
    const bar = (
      <ThreadSidebar threads={[thread]} activeId={null} open onToggle={vi.fn()} onSelect={vi.fn()} onNew={vi.fn()} account={{ name: 'Guest' }} onDownloadData={vi.fn(async () => {})} />
    );
    render(account ? <AccountContext.Provider value={account}>{bar}</AccountContext.Provider> : bar);
  };

  it('for an admin: "Dashboard" is the last row, just above the account chip, and opens the dashboard', () => {
    const account = signedIn(true);
    sidebar(account);
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link.getAttribute('href')).toBe('/admin');
    const chip = screen.getByRole('button', { name: 'Account: Guest' });
    // Next in the page after the link is the chip: nothing sits between them.
    const focusable = [...document.querySelectorAll('a[href], button')];
    expect(focusable[focusable.indexOf(link) + 1]).toBe(chip);
    fireEvent.click(link);
    expect(account.openDashboard).toHaveBeenCalledTimes(1);
  });

  it('none for a teacher, or in a workspace opened by link', () => {
    sidebar(signedIn(false));
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    cleanup();
    sidebar(null);
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });
});
