import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MadeLogin } from '../../../api/pupilLogins';
import { LoginSlips } from './LoginSlips';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.querySelectorAll('iframe').forEach((f) => f.remove());
});

const MADE: MadeLogin[] = [{ id: 'N1', username: 'brave-heron-71', password: 'apple-river-93' }];

/** Stubs the slips frame's print and focus before the panel's load listener calls them. */
function stubPrint() {
  const print = vi.fn();
  const make = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, o?: ElementCreationOptions) => {
    const el = make(tag, o);
    if (tag === 'iframe') {
      el.addEventListener(
        'load',
        () => {
          const win = (el as HTMLIFrameElement).contentWindow!;
          win.print = print;
          win.focus = vi.fn();
        },
        { capture: true },
      );
    }
    return el;
  });
  return print;
}

function renderPanel(over: Partial<Parameters<typeof LoginSlips>[0]> = {}) {
  const props = {
    classId: 'C1',
    made: MADE,
    confirming: false,
    slips: () => '<!doctype html><title>Login slips</title><p class="slip">brave-heron-71 apple-river-93</p>',
    onAskDone: vi.fn(),
    onCancelDone: vi.fn(),
    onConfirmDone: vi.fn(),
    ...over,
  };
  return { props, ...render(<LoginSlips {...props} />) };
}

const printSlips = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Print slips' }));
  });
  // jsdom loads srcdoc on a timer.
  await act(async () => new Promise((r) => setTimeout(r, 20)));
};

describe('LoginSlips', () => {
  it('prints the slips from a hidden iframe, which goes after printing', async () => {
    const print = stubPrint();
    renderPanel();
    await printSlips();
    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.srcdoc).toContain('apple-river-93');
    expect(print).toHaveBeenCalledTimes(1);
    act(() => void frame.contentWindow!.dispatchEvent(new Event('afterprint')));
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('a second Print slips replaces the frame rather than adding one', async () => {
    stubPrint();
    renderPanel();
    await printSlips();
    await printSlips();
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('the frame goes when the panel unmounts', async () => {
    stubPrint();
    const { unmount } = renderPanel();
    await printSlips();
    expect(document.querySelector('iframe')).not.toBeNull();
    unmount();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('the frame goes on Done’s second click', async () => {
    stubPrint();
    const { props, rerender } = renderPanel();
    await printSlips();
    rerender(<LoginSlips {...props} confirming />);
    const ask = screen.getByRole('group', { name: 'Hide the passwords' });
    expect(ask.textContent).toContain('They cannot be shown again.');
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Done' }));
    });
    expect(props.onConfirmDone).toHaveBeenCalledTimes(1);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('is headed "New logins", or the title it is given', () => {
    renderPanel();
    expect(screen.getByRole('group', { name: 'New logins' })).toBeTruthy();
    cleanup();
    renderPanel({ title: 'New password' });
    expect(screen.getByRole('group', { name: 'New password' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print slips' })).toBeTruthy();
  });

  it('each username and password is a read-only input named by its label', () => {
    renderPanel();
    const user = screen.getByRole('textbox', { name: 'Username' }) as HTMLInputElement;
    const pass = screen.getByRole('textbox', { name: 'Password' }) as HTMLInputElement;
    expect([user.value, pass.value, user.readOnly, pass.readOnly]).toEqual(['brave-heron-71', 'apple-river-93', true, true]);
  });
});
