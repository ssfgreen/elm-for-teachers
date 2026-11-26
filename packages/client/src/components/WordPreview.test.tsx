import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WordPreview } from './WordPreview';

// docx-preview needs a real browser to lay out; here it draws one page holding the file's text.
vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(async (blob: Blob, into: HTMLElement) => {
    into.innerHTML = `<div class="docx-wrapper"><section class="docx"><article><p>${(blob as Blob & { label: string }).label}</p></article></section></div>`;
  }),
}));

afterEach(cleanup);

describe('WordPreview', () => {
  it('draws the Word file as pages, says how many, and downloads or closes', async () => {
    const onShown = vi.fn();
    const onDownload = vi.fn();
    const onClose = vi.fn();
    const load = vi.fn(async () => Object.assign(new Blob(['x']), { label: 'Question 1' }));
    render(<WordPreview name="Similes" load={load} onShown={onShown} onDownload={onDownload} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Similes' });
    expect(dialog.textContent).toContain('Laying out the pages');
    await waitFor(() => expect(onShown).toHaveBeenCalledWith(1));
    expect(load).toHaveBeenCalledTimes(1);
    expect(dialog.textContent).toContain('A4 · 1 page');
    expect(dialog.querySelector('section.docx')!.textContent).toBe('Question 1');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('hands its scrolling body to the scroll tracker while open, and stops it on close', async () => {
    const off = vi.fn();
    const trackScroll = vi.fn(() => off);
    const { unmount } = render(<WordPreview name="Similes" load={async () => Object.assign(new Blob(['x']), { label: 'Q' })} trackScroll={trackScroll} onDownload={() => undefined} onClose={() => undefined} />);
    await waitFor(() => expect(trackScroll).toHaveBeenCalledTimes(1));
    const body = (trackScroll.mock.calls[0] as unknown as [HTMLElement])[0];
    expect(body.classList.contains('word-preview')).toBe(true);
    expect(body.contains(screen.getByLabelText('Pages'))).toBe(true);
    expect(off).not.toHaveBeenCalled();
    unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('says so when the file cannot be drawn', async () => {
    render(<WordPreview name="Similes" load={() => Promise.reject(new Error('offline'))} onDownload={() => undefined} onClose={() => undefined} />);
    expect(await screen.findByText(/The preview did not work/)).toBeTruthy();
  });
});
